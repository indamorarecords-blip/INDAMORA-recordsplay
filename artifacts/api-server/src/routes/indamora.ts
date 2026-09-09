import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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

const router: IRouter = Router();

const worksForClient = (rows: typeof worksTable.$inferSelect[]) =>
  rows.map((work) => ({
    ...work,
    featured: work.featured === "true",
    access: work.access === "premium" ? ("premium" as const) : ("free" as const),
  }));

const submissionsForClient = (rows: typeof submissionsTable.$inferSelect[]) =>
  rows.map((submission) => ({
    ...submission,
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

router.post("/artists", async (req, res): Promise<void> => {
  const parsed = CreateArtistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [artist] = await db.insert(artistsTable).values(parsed.data).returning();
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

router.get("/submissions", async (req, res): Promise<void> => {
  const params = GetSubmissionsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const submissions = await db
    .select()
    .from(submissionsTable)
    .where(params.data.status ? eq(submissionsTable.status, params.data.status) : undefined)
    .orderBy(submissionsTable.submittedAt);
  res.json(GetSubmissionsResponse.parse(submissionsForClient(submissions)));
});

router.post("/submissions", async (req, res): Promise<void> => {
  const parsed = CreateSubmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [submission] = await db.insert(submissionsTable).values(parsed.data).returning();
  res.status(201).json(CreateSubmissionResponse.parse(submissionsForClient([submission])[0]));
});

router.patch("/submissions/:id/status", async (req, res): Promise<void> => {
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
  const [submission] = await db
    .update(submissionsTable)
    .set({ status: body.data.status })
    .where(eq(submissionsTable.id, params.data.id))
    .returning();
  if (!submission) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }
  res.json(UpdateSubmissionStatusResponse.parse(submissionsForClient([submission])[0]));
});

export default router;