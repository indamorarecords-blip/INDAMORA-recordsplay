import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, artistsTable, submissionsTable, worksTable } from "@workspace/db";
import {
  CreateArtistBody,
  CreateArtistResponse,
  GetArtistParams,
  GetArtistResponse,
  GetArtistsResponse,
  GetCatalogResponse,
  GetSubmissionsQueryParams,
  GetSubmissionsResponse,
  GetWorkParams,
  GetWorkResponse,
  CreateSubmissionBody,
  CreateSubmissionResponse,
  UpdateSubmissionStatusBody,
  UpdateSubmissionStatusParams,
  UpdateSubmissionStatusResponse,
} from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { isAdminUser, requireAdmin, requireAuth } from "../middlewares/auth";
import { ObjectPermission } from "../lib/objectAcl";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const objectStorage = new ObjectStorageService();
const allowedAudioTypes = new Set(["audio/mpeg", "audio/mp4", "audio/wav", "audio/ogg"]);
const allowedVideoTypes = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAudioBytes = 100 * 1024 * 1024;
const maxVideoBytes = 500 * 1024 * 1024;
const maxImageBytes = 10 * 1024 * 1024;

const worksForClient = (rows: typeof worksTable.$inferSelect[]) =>
  rows.map((work) => ({
    ...work,
    featured: work.featured === "true",
    access: work.access === "premium" ? ("premium" as const) : ("free" as const),
  }));

const submissionsForClient = (rows: typeof submissionsTable.$inferSelect[]) =>
  rows.map((submission) => ({
    id: submission.id,
    title: submission.title,
    artist: submission.artist,
    category: submission.category,
    status: submission.status,
    note: submission.note,
    mediaType: submission.mediaType,
    mediaObjectPath: submission.mediaObjectPath,
    coverObjectPath: submission.coverObjectPath,
    duration: submission.duration,
    submittedAt: submission.submittedAt.toISOString(),
  }));

const seedCatalog = async (): Promise<void> => {
  const [artistCount] = await db.select({ count: artistsTable.id }).from(artistsTable);
  if (artistCount?.count) return;

  const [firstArtist, secondArtist] = await db
    .insert(artistsTable)
    .values([
      {
        name: "Béatrice Londo",
        category: "Musique",
        bio: "Une voix solaire entre Bangui et la diaspora.",
        location: "Bangui, RCA",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80",
        worksCount: 3,
      },
      {
        name: "Mikaël Gbaï",
        category: "Humour",
        bio: "Des histoires du quotidien racontées avec tendresse.",
        location: "Paris, France",
        avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80",
        worksCount: 2,
      },
    ])
    .returning();

  await db.insert(worksTable).values([
    {
      title: "Bangui la belle",
      artist: firstArtist.name,
      category: "Musique",
      description: "Un voyage musical entre mémoire, douceur et énergie.",
      duration: "3:42",
      image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80",
      featured: "true",
      access: "free",
    },
    {
      title: "Rire en famille",
      artist: secondArtist.name,
      category: "Humour",
      description: "Le nouveau spectacle qui fait rire toute la communauté.",
      duration: "18:20",
      image: "https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=900&q=80",
      featured: "true",
      access: "premium",
    },
    {
      title: "Les voix du fleuve",
      artist: "Collectif Sangha",
      category: "Podcast",
      description: "Des conversations sincères sur la création centrafricaine.",
      duration: "32:08",
      image: "https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=900&q=80",
      featured: "false",
      access: "free",
    },
    {
      title: "Sur la route de Bangui",
      artist: "Joël Kossi",
      category: "Cinéma",
      description: "Un court métrage sensible, tourné entre ville et campagne.",
      duration: "14:12",
      image: "https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=900&q=80",
      featured: "false",
      access: "premium",
    },
  ]);

  await db.insert(submissionsTable).values([
    {
      title: "Nzelé",
      artist: firstArtist.name,
      category: "Musique",
      status: "pending",
      note: "Single afro-fusion à découvrir.",
    },
    {
      title: "Bangui stories",
      artist: "Aline Mboli",
      category: "Podcast",
      status: "pending",
      note: "Épisode pilote.",
    },
    {
      title: "Le quartier se réveille",
      artist: "Mikaël Gbaï",
      category: "Humour",
      status: "approved",
      note: "Prêt pour publication.",
    },
  ]);

  logger.info("Seeded initial INDAMORA PLAY catalog");
}

void seedCatalog().catch((error) => {
  logger.error({ error }, "Unable to seed INDAMORA PLAY catalog");
});

router.get("/catalog", async (_req, res): Promise<void> => {
  const works = await db.select().from(worksTable).orderBy(worksTable.createdAt);
  res.json(GetCatalogResponse.parse(worksForClient(works)));
});

router.get("/catalog/:id", async (req, res): Promise<void> => {
  const params = GetWorkParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [work] = await db.select().from(worksTable).where(eq(worksTable.id, params.data.id));
  if (!work) {
    res.status(404).json({ error: "Work not found" });
    return;
  }
  res.json(GetWorkResponse.parse(worksForClient([work])[0]));
});

router.get("/artists", async (_req, res): Promise<void> => {
  const artists = await db.select().from(artistsTable).orderBy(artistsTable.createdAt);
  res.json(GetArtistsResponse.parse(artists));
});

router.post("/artists", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [artist] = await db
    .insert(artistsTable)
    .values({ ...parsed.data, ownerId: req.clerkUserId })
    .returning();
  res.status(201).json(CreateArtistResponse.parse(artist));
});

router.get("/artists/:id", async (req, res): Promise<void> => {
  const params = GetArtistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [artist] = await db.select().from(artistsTable).where(eq(artistsTable.id, params.data.id));
  if (!artist) {
    res.status(404).json({ error: "Artist not found" });
    return;
  }
  res.json(GetArtistResponse.parse(artist));
});

router.get("/submissions", requireAuth, async (req, res): Promise<void> => {
  const params = GetSubmissionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const admin = await isAdminUser(req.clerkUserId!);
  const submissions = await db
    .select()
    .from(submissionsTable)
    .where(
      params.data.status
        ? admin
          ? eq(submissionsTable.status, params.data.status)
          : and(
              eq(submissionsTable.status, params.data.status),
              eq(submissionsTable.ownerId, req.clerkUserId!),
            )
        : admin
          ? undefined
          : eq(submissionsTable.ownerId, req.clerkUserId!),
    )
    .orderBy(submissionsTable.submittedAt);
  res.json(GetSubmissionsResponse.parse(submissionsForClient(submissions)));
});

router.post("/submissions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const media = await objectStorage.getObjectEntityFile(parsed.data.mediaObjectPath);
    const [mediaMetadata] = await media.getMetadata();
    const mediaType = String(mediaMetadata.contentType ?? "");
    const mediaSize = Number(mediaMetadata.size ?? 0);
    const validMedia =
      parsed.data.mediaType === "video"
        ? allowedVideoTypes.has(mediaType) && mediaSize > 0 && mediaSize <= maxVideoBytes
        : allowedAudioTypes.has(mediaType) && mediaSize > 0 && mediaSize <= maxAudioBytes;
    if (!validMedia) {
      res.status(400).json({ error: "Le type du fichier ne correspond pas à l’œuvre." });
      return;
    }
    if (!(await objectStorage.canAccessObjectEntity({
      userId: req.clerkUserId,
      objectFile: media,
      requestedPermission: ObjectPermission.WRITE,
    }))) {
      res.status(403).json({ error: "Le média doit être téléversé par votre compte." });
      return;
    }
    if (parsed.data.coverObjectPath) {
      const cover = await objectStorage.getObjectEntityFile(parsed.data.coverObjectPath);
      const [coverMetadata] = await cover.getMetadata();
      const coverType = String(coverMetadata.contentType ?? "");
      const coverSize = Number(coverMetadata.size ?? 0);
      if (!allowedImageTypes.has(coverType) || coverSize <= 0 || coverSize > maxImageBytes) {
        res.status(400).json({ error: "La couverture doit être une image." });
        return;
      }
      if (!(await objectStorage.canAccessObjectEntity({ userId: req.clerkUserId, objectFile: cover, requestedPermission: ObjectPermission.WRITE }))) {
        res.status(403).json({ error: "La couverture doit être téléversée par votre compte." });
        return;
      }
    }
  } catch {
    res.status(400).json({ error: "Les fichiers téléversés sont introuvables." });
    return;
  }
  const [submission] = await db
    .insert(submissionsTable)
    .values({ ...parsed.data, ownerId: req.clerkUserId })
    .returning();
  res.status(201).json(CreateSubmissionResponse.parse(submissionsForClient([submission])[0]));
});

router.patch("/submissions/:id/status", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateSubmissionStatusParams.safeParse(req.params);
  const body = UpdateSubmissionStatusBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const submission = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(submissionsTable).where(eq(submissionsTable.id, params.data.id)).for("update");
    if (!existing) return null;
    if (existing.publishedWorkId && body.data.status === "rejected") {
      return { conflict: true as const };
    }
    if (body.data.status === "approved" && !existing.publishedWorkId) {
      const [work] = await tx.insert(worksTable).values({
        title: existing.title,
        artist: existing.artist,
        category: existing.category,
        description: existing.note || "Une nouvelle création validée par INDAMORA RECORDS.",
        duration: existing.duration,
        image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
        mediaType: existing.mediaType,
        mediaObjectPath: existing.mediaObjectPath,
        coverObjectPath: existing.coverObjectPath,
        featured: "false",
        access: "free",
      }).returning({ id: worksTable.id });
      if (existing.mediaObjectPath) await objectStorage.setAcl(existing.mediaObjectPath, { owner: existing.ownerId ?? req.clerkUserId!, visibility: "public" });
      if (existing.coverObjectPath) await objectStorage.setAcl(existing.coverObjectPath, { owner: existing.ownerId ?? req.clerkUserId!, visibility: "public" });
      const [updated] = await tx.update(submissionsTable).set({ status: "approved", publishedWorkId: work.id }).where(eq(submissionsTable.id, params.data.id)).returning();
      return { updated };
    }
    const [updated] = await tx.update(submissionsTable).set({ status: body.data.status }).where(eq(submissionsTable.id, params.data.id)).returning();
    return { updated };
  });
  if (!submission) { res.status(404).json({ error: "Submission not found" }); return; }
  if ("conflict" in submission) { res.status(409).json({ error: "Une œuvre publiée ne peut pas être refusée sans procédure de retrait." }); return; }
  res.json(UpdateSubmissionStatusResponse.parse(submissionsForClient([submission.updated])[0]));
});

export default router;