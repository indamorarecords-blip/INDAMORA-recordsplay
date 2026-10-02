import { Router, type IRouter } from "express";
import { db, artistsTable, worksTable, submissionsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import {
  GetAdminContentResponse,
  DeleteAdminProfileParams, DeleteAdminProfileBody,
  DeleteAdminWorkParams, DeleteAdminWorkBody,
  CleanupAdminDemosBody, CleanupAdminDemosResponse,
} from "@workspace/api-zod";
import { requireAdmin } from "../middlewares/auth";
import { confirmedDemoCleanupSql } from "../lib/demo-cleanup";

const router: IRouter = Router();
router.use("/admin/content", requireAdmin);
router.use("/admin/profiles", requireAdmin);
router.use("/admin/works", requireAdmin);
router.use("/admin/demo-cleanup", requireAdmin);

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function auditDeletion(tx: Transaction, actor: string, type: string, id: number, label: string) {
  await tx.execute(sql`
    INSERT INTO admin_audit_logs (administrator_id, action, entity_type, entity_id, target_label, result)
    VALUES (${actor}, 'delete', ${type}, ${String(id)}, ${label}, 'success')
  `);
}

router.get("/admin/content", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const [profiles, works] = await Promise.all([
    db.select().from(artistsTable).orderBy(artistsTable.id),
    db.select().from(worksTable).orderBy(worksTable.id),
  ]);
  res.json(GetAdminContentResponse.parse({
    profiles: profiles.map((profile) => ({
      ...profile, isPublished: profile.isPublished === "true", createdAt: profile.createdAt.toISOString(),
    })),
    works: works.map((work) => ({ ...work, featured: work.featured === "true" })),
  }));
});

router.delete("/admin/profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteAdminProfileParams.safeParse(req.params);
  const body = DeleteAdminProfileBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Identifiant valide et confirmation explicite requis." });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    const [profile] = await tx.delete(artistsTable).where(eq(artistsTable.id, params.data.id)).returning();
    if (!profile) return false;
    // Works use an artist display name, not a profile FK: never cascade by name.
    // Clerk accounts and avatars with unverified/shared ownership are untouched.
    await auditDeletion(tx, req.clerkUserId!, "profile", profile.id, profile.name);
    return true;
  });
  if (!deleted) { res.status(404).json({ error: "Profil introuvable." }); return; }
  res.sendStatus(204);
});

router.delete("/admin/works/:id", async (req, res): Promise<void> => {
  const params = DeleteAdminWorkParams.safeParse(req.params);
  const body = DeleteAdminWorkBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Identifiant valide et confirmation explicite requis." });
    return;
  }
  const deleted = await db.transaction(async (tx) => {
    // Same submission-first lock order as the existing publication transaction.
    await tx.select({ id: submissionsTable.id }).from(submissionsTable)
      .where(eq(submissionsTable.publishedWorkId, params.data.id)).for("update");
    const [work] = await tx.delete(worksTable).where(eq(worksTable.id, params.data.id)).returning();
    if (!work) return false;
    await tx.update(submissionsTable).set({ publishedWorkId: null, status: "rejected" })
      .where(eq(submissionsTable.publishedWorkId, work.id));
    // Linked submissions still own their original uploads. Without a verified owner
    // and exclusive references, other uploaded files must also be retained.
    await auditDeletion(tx, req.clerkUserId!, "work", work.id, work.title);
    return true;
  });
  if (!deleted) { res.status(404).json({ error: "Œuvre introuvable." }); return; }
  res.sendStatus(204);
});

router.post("/admin/demo-cleanup", async (req, res): Promise<void> => {
  const body = CleanupAdminDemosBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: "Confirmation explicite requise." }); return; }
  const result = await db.$client.query(confirmedDemoCleanupSql, [req.clerkUserId!]);
  res.json(CleanupAdminDemosResponse.parse(result.rows[0]));
});

export default router;