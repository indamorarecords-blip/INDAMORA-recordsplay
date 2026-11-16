import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';

import { prepareArtistSubmission } from '../lib/submissionManager';
import { SubmissionUploadError } from '../lib/supabaseSubmissionStorage';

const router = Router();

const submissionSchema = z.object({
  objectPath: z.string().min(1),
  fileName: z.string().min(1).max(180),
  size: z.number().int().positive(),
  contentType: z.string().min(1),
  title: z.string().trim().min(1).max(180),
  artistName: z.string().trim().min(1).max(180),
  genre: z.string().max(100).optional(),
  album: z.string().max(180).optional(),
  year: z.number().int().optional(),
  description: z.string().max(3000).optional(),
});

router.post('/upload', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);

    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
      });
    }

    const parsed = submissionSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Informations de soumission invalides.',
        details: parsed.error.flatten(),
      });
    }

    const submission = await prepareArtistSubmission({
      ...parsed.data,
      userId: auth.userId,
    });

    return res.status(200).json({
      success: true,
      message: 'Fichier vérifié. Soumission prête à être enregistrée.',
      submission,
    });
  } catch (error) {
    console.error('[INDAMORA SUBMISSION UPLOAD]', error);

    if (error instanceof SubmissionUploadError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Impossible de traiter cette soumission.',
    });
  }
});

export default router;
