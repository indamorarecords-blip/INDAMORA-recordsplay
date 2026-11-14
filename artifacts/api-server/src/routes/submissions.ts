import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

import {
  ObjectPermission,
} from "../lib/objectAcl";
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

    // Vérifie que le fichier appartient bien à l'utilisateur connecté.
    const objectFile = await storage.getObjectEntityFile(mediaObjectPath);

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

    const { data, error } = await supabaseAdmin
      .from("submissions")
      .insert({
        title: title.trim(),
        artist: artist.trim(),
        category: category.trim(),
        note: typeof note === "string" ? note : null,
        owner_id: ownerId,
        media_type: "audio",
        media_object_path: mediaObjectPath,
        cover_object_path:
          typeof coverObjectPath === "string" ? coverObjectPath : null,
        duration:
          duration === null || duration === undefined
            ? null
            : String(duration),
        status: "pending",
      })
      .select("*")
      .single();

    if (error) {
      req.log.error({ error }, "Database submission insert failed");
      res.status(500).json({
        error: "Impossible d'enregistrer la chanson.",
      });
      return;
    }

    res.status(201).json({
      success: true,
      submission: data,
    });
  } catch (error) {
    req.log.error({ error }, "Submission creation failed");
    res.status(500).json({
      error: "Erreur lors de l'enregistrement de la soumission.",
    });
  }
});

export default router;
