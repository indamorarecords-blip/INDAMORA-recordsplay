import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { pressDb, pressPool } from "../lib/pressDatabase";
const router: IRouter = Router();
type ArticleInput = {
  title?: string | null;
  subtitle?: string | null;
  category?: string | null;
  cover_object_path?: string | null;
  content?: string | null;
  author?: string | null;
  artist_id?: number | null;
  is_featured?: boolean;
  status?: "draft" | "published";
  slug?: string | null;
};
function makeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function validateArticle(body: ArticleInput): string | null {
  if (body.title !== undefined && body.title !== null &&
      typeof body.title !== "string") {
    return "Titre invalide.";
  }
  if (body.status && !["draft", "published"].includes(body.status)) {
    return "Statut invalide.";
  }
  if (body.artist_id !== undefined && body.artist_id !== null &&
      (!Number.isInteger(body.artist_id) || body.artist_id <= 0)) {
    return "Identifiant artiste invalide.";
  }
  if (body.is_featured !== undefined &&
      typeof body.is_featured !== "boolean") {
    return "Valeur de mise en avant invalide.";
  }
  return null;
}
// PUBLIC : liste des articles publiés
router.get("/press/articles", async (_req, res) => {
  try {
    const result = await pressPool.query(
      `SELECT *
       FROM public.press_articles
       WHERE status = 'published'
       ORDER BY is_featured DESC, published_at DESC NULLS LAST, created_at DESC`
    );
    res.set("Cache-Control", "public, max-age=60");
    res.json({ articles: result.rows });
  } catch (error) {
    console.error("Erreur liste presse :", error);
    res.status(500).json({ error: "Impossible de charger les articles." });
  }
});
// PUBLIC : lecture d'un article par slug
router.get("/press/articles/:slug", async (req, res) => {
  try {
    const result = await pressPool.query(
      `SELECT *
       FROM public.press_articles
       WHERE slug = $1 AND status = 'published'
       LIMIT 1`,
      [req.params.slug]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({ article: result.rows[0] });
  } catch (error) {
    console.error("Erreur lecture article :", error);
    res.status(500).json({ error: "Impossible de charger cet article." });
  }
});
// ADMIN : liste de tous les articles, brouillons compris
router.get("/admin/press/articles", requireAdmin, async (_req, res) => {
  try {
    const result = await pressPool.query(
      `SELECT *
       FROM public.press_articles
       ORDER BY created_at DESC`
    );
    res.set("Cache-Control", "no-store");
    res.json({ articles: result.rows });
  } catch (error) {
    console.error("Erreur administration presse :", error);
    res.status(500).json({ error: "Impossible de charger les articles." });
  }
});
// ADMIN : création d'un article
router.post("/admin/press/articles", requireAdmin, async (req, res) => {
  const body = req.body as ArticleInput;
  const validationError = validateArticle(body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  try {
    const title = body.title?.trim() || null;
    const slug = body.slug?.trim() || (title ? makeSlug(title) : null);
    const status = body.status ?? "draft";
    const result = await pressPool.query(
      `INSERT INTO public.press_articles
       (title, subtitle, category, cover_object_path, content,
        author, artist_id, is_featured, status, slug,
        published_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               CASE WHEN $9 = 'published' THEN NOW() ELSE NULL END,
               $11)
       RETURNING *`,
      [
        title,
        body.subtitle ?? null,
        body.category ?? null,
        body.cover_object_path ?? null,
        body.content ?? null,
        body.author ?? "INDAMORA PLAY",
        body.artist_id ?? null,
        body.is_featured ?? false,
        status,
        slug,
        req.auth?.userId ?? null,
      ]
    );
    res.status(201).json({ article: result.rows[0] });
  } catch (error) {
    console.error("Erreur création article :", error);
    res.status(500).json({
      error: "Impossible de créer l'article. Vérifiez notamment que son slug est unique.",
    });
  }
});
// ADMIN : modification d'un article
router.patch("/admin/press/articles/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const body = req.body as ArticleInput;
  const validationError = validateArticle(body);
  if (!Number.isSafeInteger(id) || id <= 0 || validationError) {
    res.status(400).json({ error: validationError ?? "Identifiant invalide." });
    return;
  }
  const allowedFields: Record<string, keyof ArticleInput> = {
    title: "title",
    subtitle: "subtitle",
    category: "category",
    cover_object_path: "cover_object_path",
    content: "content",
    author: "author",
    artist_id: "artist_id",
    is_featured: "is_featured",
    status: "status",
    slug: "slug",
  };
  const entries = Object.entries(body).filter(([key]) => key in allowedFields);
  if (!entries.length) {
    res.status(400).json({ error: "Aucune modification fournie." });
    return;
  }
  try {
    const values: unknown[] = [];
    const assignments = entries.map(([key, value], index) => {
      values.push(value);
      return `${key} = $${index + 1}`;
    });
    if (body.title !== undefined && body.slug === undefined) {
      values.push(makeSlug(body.title ?? ""));
      assignments.push(`slug = $${values.length}`);
    }
    if (body.status === "published") {
      assignments.push("published_at = COALESCE(published_at, NOW())");
    }
    if (body.status === "draft") {
      assignments.push("published_at = NULL");
    }
    assignments.push("updated_at = NOW()");
    values.push(id);
    const result = await pressPool.query(
      `UPDATE public.press_articles
       SET ${assignments.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.json({ article: result.rows[0] });
  } catch (error) {
    console.error("Erreur modification article :", error);
    res.status(500).json({ error: "Impossible de modifier l'article." });
  }
});
// ADMIN : suppression d'un article
router.delete("/admin/press/articles/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Identifiant invalide." });
    return;
  }
  try {
    const result = await pressPool.query(
      `DELETE FROM public.press_articles WHERE id = $1 RETURNING id`,
      [id]
    );
    if (!result.rowCount) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression article :", error);
    res.status(500).json({ error: "Impossible de supprimer l'article." });
  }
});
export default router;
