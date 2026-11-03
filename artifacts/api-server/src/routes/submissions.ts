import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/submissions", requireAuth, async (req, res) => {
  try {
    const {
      title,
      artist,
      category,
      note,
      mediaType,
      mediaObjectPath,
      coverObjectPath,
      duration,
    } = req.body;

    if (!title || !artist || !mediaObjectPath) {
      res.status(400).json({
        error: "Titre, artiste et fichier audio obligatoires.",
      });
      return;
    }

    if (mediaType !== "audio") {
      res.status(400).json({
        error: "Type de média non autorisé.",
      });
      return;
    }

    res.status(501).json({
      error: "Enregistrement en base à raccorder au schéma existant.",
    });
  } catch (error) {
    req.log.error({ error }, "Submission creation failed");
    res.status(500).json({
      error: "Impossible d'enregistrer la soumission.",
    });
  }
});

export default router;
