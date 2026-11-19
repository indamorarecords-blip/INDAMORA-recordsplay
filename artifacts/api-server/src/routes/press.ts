import { Router, type IRouter } from "express";
import { requireAdmin } from "../middlewares/auth";
import { pressPool } from "../lib/pressDatabase";
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
const allowedFields = [
  "title",
  "subtitle",
  "category",
  "cover_object_path",
  "content",
  "author",
  "artist_id",
  "is_featured",
  "status",
  "slug",
] as const;
function makeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
function validateArticle(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return "Données de l'article invalides.";
  }
  const data = body as ArticleInput;
  for (const field of [
    "title",
    "subtitle",
    "category",
    "cover_object_path",
    "content",
    "author",
    "slug",
  ] as const) {
    if (
      data[field] !== undefined &&
      data[field] !== null &&
      typeof data[field] !== "string"
    ) {
      return `Le champ ${field} doit être un texte.`;
    }
  }
  if (
    data.status !== undefined &&
    data.status !== "draft" &&
    data.status !== "published"
  ) {
    return "Statut invalide.";
  }
  if (
    data.artist_id !== undefined &&
    data.artist_id !== null &&
    (!Number.isSafeInteger(data.artist_id) || data.artist_id <= 0)
  ) {
    return "Identifiant artiste invalide.";
  }
  if (
    data.is_featured !== undefined &&
    typeof data.is_featured !== "boolean"
  ) {
    return "Valeur de mise en avant invalide.";
  }
  return null;
}
function getErrorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}
function handleDatabaseError(
  error: unknown,
  res: Parameters<Parameters<IRouter["get"]>[1]>[1],
  operation: string
): void {
  const code = getErrorCode(error);
  console.error(`Erreur Presse (${operation}) :`, {
    code,
    message: error instanceof Error ? error.message : "Erreur inconnue",
  });
  if (code === "23505") {
    res.status(409).json({
      error: "Un article utilise déjà ce slug.",
    });
    return;
  }
  if (code === "23503") {
    res.status(400).json({
      error: "L'artiste associé n'existe pas.",
    });
    return;
  }
  if (code === "42P01") {
    res.status(500).json({
      error: "La table des articles de presse est introuvable.",
    });
    return;
  }
  res.status(500).json({
    error: "Une erreur est survenue lors du traitement de l'article.",
  });
}
// PUBLIC : liste des articles publiés
router.get("/press/articles", async (_req, res) => {
  try {
    const result = await pressPool.query(
      `SELECT *
       FROM public.press_articles
       WHERE status = 'published'
       ORDER BY
         is_featured DESC,
         published_at DESC NULLS LAST,
         created_at DESC`
    );
    res.set("Cache-Control", "public, max-age=60");
    res.json({ articles: result.rows });
  } catch (error) {
    handleDatabaseError(error, res, "liste publique");
  }
});
// PUBLIC : lecture d'un article publié par son slug
router.get("/press/articles/:slug", async (req, res) => {
  try {
    const result = await pressPool.query(
      `SELECT *
       FROM public.press_articles
       WHERE slug = $1
         AND status = 'published'
       LIMIT 1`,
      [req.params.slug]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({ article: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res, "lecture publique");
  }
});
// ADMIN : liste des articles, brouillons compris
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
    handleDatabaseError(error, res, "liste administration");
  }
});
// ADMIN : création d'un article
router.post("/admin/press/articles", requireAdmin, async (req, res) => {
  const validationError = validateArticle(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const body = req.body as ArticleInput;
  try {
    const title = body.title?.trim() || null;
    const baseSlug = body.slug?.trim()
      ? makeSlug(body.slug)
      : title
        ? makeSlug(title)
        : null;
    const slug = baseSlug
      ? `${baseSlug}-${Date.now().toString(36)}`
      : null;
    const status = body.status ?? "draft";
    const result = await pressPool.query(
      `INSERT INTO public.press_articles (
        title,
        subtitle,
        category,
        cover_object_path,
        content,
        author,
        artist_id,
        is_featured,
        status,
        slug,
        published_at,
        created_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        CASE WHEN $9 = 'published' THEN NOW() ELSE NULL END,
        $11
      )
      RETURNING *`,
      [
        title,
        body.subtitle ?? null,
        body.category ?? null,
        body.cover_object_path ?? null,
        body.content ?? null,
        body.author?.trim() || "INDAMORA PLAY",
        body.artist_id ?? null,
        body.is_featured ?? false,
        status,
        slug,
        req.auth?.userId ?? null,
      ]
    );
    res.status(201).json({ article: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res, "création");
  }
});
// ADMIN : modification d'un article
router.patch("/admin/press/articles/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const validationError = validateArticle(req.body);
  if (!Number.isSafeInteger(id) || id <= 0) {
    res.status(400).json({ error: "Identifiant invalide." });
    return;
  }
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const body = req.body as ArticleInput;
  const entries = Object.entries(body).filter(([key]) =>
    (allowedFields as readonly string[]).includes(key)
  );
  if (entries.length === 0) {
    res.status(400).json({ error: "Aucune modification fournie." });
    return;
  }
  try {
    const values: unknown[] = [];
    const assignments: string[] = [];
    for (const [key, value] of entries) {
      values.push(value);
      assignments.push(`${key} = $${values.length}`);
    }
    if (body.title !== undefined && body.slug === undefined) {
      values.push(body.title ? makeSlug(body.title) : null);
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
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.json({ article: result.rows[0] });
  } catch (error) {
    handleDatabaseError(error, res, "modification");
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
      `DELETE FROM public.press_articles
       WHERE id = $1
       RETURNING id`,
      [id]
    );
    if (result.rows.length === 0) {
      res.status(404).json({ error: "Article introuvable." });
      return;
    }
    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    handleDatabaseError(error, res, "suppression");
  }
});
export default router;
