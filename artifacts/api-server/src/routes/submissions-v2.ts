import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { db, submissionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_MEDIA_BUCKET || "indamora-media";

router.post("/submissions-v2", requireAuth, async (req, res) => {
  try {
    const userId = req.clerkUserId;

    if (!userId) {
      res.status(401).json({ error: "Authentification requise." });
      return;
    }

    const { title, artist, category, mediaObjectPath } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof artist !== "string" ||
      !artist.trim() ||
      typeof mediaObjectPath !== "string"
    ) {
      res.status(400).json({ error: "Informations de soumission invalides." });
      return;
    }

    if (!mediaObjectPath.startsWith(`uploads/${userId}/`)) {
      res.status(403).json({ error: "Fichier audio non autorisé." });
      return;
    }

    if (!supabaseUrl || !supabaseKey) {
      res.status(500).json({ error: "Configuration Supabase manquante." });
      return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: audio, error: audioError } =
      await supabase.storage.from(bucket).download(mediaObjectPath);

    if (audioError || !audio) {
      res.status(400).json({ error: "Fichier audio introuvable." });
      return;
    }

    const [submission] = await db
      .insert(submissionsTable)
      .values({
        title: title.trim(),
        artist: artist.trim(),
        category:
          typeof category === "string" && category.trim()
            ? category.trim()
            : "Musique",
        status: "pending",
        ownerId: userId,
        mediaType: "audio",
        mediaObjectPath,
      })
      .returning();

    res.status(201).json({
      success: true,
      message: "Soumission enregistrée.",
      submission,
    });
  } catch (error) {
    req.log.error({ error }, "SUBMISSION V2 ERROR");
    res.status(500).json({
      error: "Impossible d'enregistrer la soumission.",
    });
  }
});

export default router;
