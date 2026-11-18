import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';

import {
  prepareSubmissionUpload,
  verifySubmissionUpload,
  SubmissionUploadError,
} from '../lib/supabaseSubmissionStorage';

const router = Router();

const prepareSchema = z.object({
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive(),
  contentType: z.string().trim().min(1).max(150),
  uploadKey: z.string().uuid(),
});

const completeSchema = z.object({
  objectPath: z.string().trim().min(1).max(1000),
  size: z.number().int().positive(),
  contentType: z.string().trim().min(1).max(150),
});

function authenticatedUser(req: Request): string | null {
  const auth = getAuth(req);

  if (!auth.isAuthenticated || !auth.userId) {
    return null;
  }

  return auth.userId;
}

function sendError(res: Response, error: unknown) {
  console.error('[INDAMORA UPLOAD]', error);

  if (error instanceof SubmissionUploadError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    error: 'Une erreur est survenue pendant le téléversement.',
  });
}

/**
 * POST /api/storage/uploads/request-url
 */
router.post('/uploads/request-url', async (req, res) => {
  try {
    const userId = authenticatedUser(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
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
    return sendError(res, error);
  }
});

/**
 * POST /api/storage/uploads/complete
 */
router.post('/uploads/complete', async (req, res) => {
  try {
    const userId = authenticatedUser(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
      });
    }

    const parsed = completeSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Informations de vérification invalides.',
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
      message: 'Fichier reçu et vérifié.',
      file: result,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;
