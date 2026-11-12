import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { ObjectPermission } from "../lib/objectAcl";
import { ObjectStorageService } from "../lib/objectStorage";
const router: IRouter = Router();
const storage = new ObjectStorageService();
router.post("/submissions", requireAuth, async (req, res) => {
  try {
    const ownerId = req.clerkUserId;
    if (!ownerId) {
      res.status(401).json({ error: "Authentification requise." });
      return;
    }
    const {
      title,
      artist,
      category,
      note,
      mediaType,
      mediaObjectPath,
      coverObjectPath,
      duration,
    } = req.body ?? {};
    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof artist !== "string" ||
      !artist.trim() ||
      typeof category !== "string" ||
      !category.trim() ||
      typeof mediaObjectPath !== "string"
    ) {
      res.status(400).json({
        error: "Titre, artiste, catégorie et fichier audio obligatoires.",
      });
      return;
    }
    if (mediaType !== "audio") {
      res.status(400).json({
        error: "Seuls les fichiers audio sont acceptés.",
      });
      return;
    }
    const objectFile =
      await storage.getObjectEntityFile(mediaObjectPath);
    const canWrite = await storage.canAccessObjectEntity({
      userId: ownerId,
      objectFile,
      requestedPermission: ObjectPermission.WRITE,
    });
    if (!canWrite) {
      res.status(403).json({
        error: "Vous ne pouvez pas soumettre ce fichier.",
      });
      return;
    }
    const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, "");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Configuration Supabase manquante.");
    }
    const response = await fetch(
      `${supabaseUrl}/rest/v1/submissions`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          title: title.trim(),
          artist: artist.trim(),
          category: category.trim(),
          note: typeof note === "string" ? note : null,
          owner_id: ownerId,
          media_type: "audio",
          media_object_path: mediaObjectPath,
          cover_object_path:
            typeof coverObjectPath === "string"
              ? coverObjectPath
              : null,
          duration:
            duration === null || duration === undefined
              ? null
              : String(duration),
          status: "pending",
        }),
      }
    );
    const result = await response.json();
    if (!response.ok) {
      req.log.error(
        { status: response.status, error: result },
        "Database submission insert failed"
      );
      res.status(500).json({
        error: "Impossible d'enregistrer la chanson.",
      });
      return;
    }
    res.status(201).json({
      success: true,
      submission: Array.isArray(result) ? result[0] : result,
    });
  } catch (error) {
    req.log.error({ error }, "Submission creation failed");
    res.status(500).json({
      error: "Erreur lors de l'enregistrement de la soumission.",
    });
  }
});
export default router;
