import { Router } from 'express';
import { z } from 'zod';
import {
  prepareSubmissionUpload,
  verifySubmissionUpload,
} from '../lib/supabaseSubmissionStorage';

const router = Router();

const prepareSchema = z.object({
  name: z.string().min(1).max(180),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
  uploadKey: z.string().optional(),
});

const completeSchema = z.object({
  objectPath: z.string().min(1),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
});

/**
 * Récupère l'identifiant Clerk depuis la requête authentifiée.
 *
 * Cette fonction doit être adaptée au middleware Clerk réellement
 * utilisé par ton API si le nom de la propriété diffère.
 */
function getAuthenticatedUserId(req: any): string | null {
  return (
    req.auth?.userId ||
    req.user?.id ||
    req.auth?.user?.id ||
    null
  );
}

/**
 * POST /api/storage/uploads/request-url
 *
 * Prépare un téléversement sécurisé.
 */
router.post('/uploads/request-url', async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Vous devez être connecté pour envoyer un fichier.',
      });
    }

    const parsed = prepareSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Informations du fichier invalides.',
        details: parsed.error.flatten(),
      });
    }

    const result = await prepareSubmissionUpload({
      userId,
      fileName: parsed.data.name,
      size: parsed.data.size,
      contentType: parsed.data.contentType,
      uploadKey: parsed.data.uploadKey,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[INDAMORA UPLOAD PREPARE]', error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Impossible de préparer le téléversement.',
    });
  }
});

/**
 * POST /api/storage/uploads/complete
 *
 * Vérifie que Supabase a bien reçu le fichier.
 */
router.post('/uploads/complete', async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Vous devez être connecté.',
      });
    }

    const parsed = completeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Informations de confirmation invalides.',
        details: parsed.error.flatten(),
      });
    }

    const result = await verifySubmissionUpload({
      userId,
      objectPath: parsed.data.objectPath,
      expectedSize: parsed.data.size,
      expectedContentType: parsed.data.contentType,
    });

    return res.status(200).json({
      success: true,
      message: 'Téléversement vérifié avec succès.',
      file: result,
    });
  } catch (error) {
    console.error('[INDAMORA UPLOAD COMPLETE]', error);

    return res.status(500).json({
      error:
        error instanceof Error
          ? error.message
          : 'Impossible de vérifier le fichier.',
    });
  }
});

export default router;
