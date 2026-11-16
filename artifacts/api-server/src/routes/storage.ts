import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import {
  prepareSubmissionUpload,
  verifySubmissionUpload,
} from '../lib/supabaseSubmissionStorage';

const router = Router();

/**
 * Validation de la demande de téléversement
 */
const prepareSchema = z.object({
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive(),
  contentType: z.string().trim().min(1).max(150),
  uploadKey: z.string().uuid().optional(),
});

/**
 * Validation de la confirmation du téléversement
 */
const completeSchema = z.object({
  objectPath: z.string().trim().min(1).max(1000),
  size: z.number().int().positive(),
  contentType: z.string().trim().min(1).max(150),
});

/**
 * Récupération de l'utilisateur connecté
 */
function getAuthenticatedUserId(req: Request): string | null {
  const request = req as any;

  return (
    request.auth?.userId ||
    request.user?.id ||
    request.auth?.user?.id ||
    null
  );
}

/**
 * Préparation du téléversement
 * POST /api/storage/uploads/request-url
 */
router.post(
  '/uploads/request-url',
  async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Vous devez être connecté pour envoyer un fichier.',
        });
      }

      const parsed = prepareSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
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

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      console.error(
        '[INDAMORA UPLOAD] Erreur de préparation :',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'Impossible de préparer le téléversement.',
      });
    }
  }
);

/**
 * Vérification du fichier téléversé
 * POST /api/storage/uploads/complete
 */
router.post(
  '/uploads/complete',
  async (req: Request, res: Response) => {
    try {
      const userId = getAuthenticatedUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Vous devez être connecté pour valider ce fichier.',
        });
      }

      const parsed = completeSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({
          success: false,
          error: 'Informations de vérification incomplètes.',
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
      console.error(
        '[INDAMORA UPLOAD] Erreur de vérification :',
        error
      );

      return res.status(500).json({
        success: false,
        error: 'Le fichier téléversé n’a pas pu être vérifié.',
      });
    }
  }
);

export default router;
