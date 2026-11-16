import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';

import {
  updateSubmissionModeration,
} from '../lib/submissionModeration';

import {
  SubmissionUploadError,
} from '../lib/supabaseSubmissionStorage';

const router = Router();

const moderationSchema = z.object({
  submissionId: z.number().int().positive(),
  status: z.enum(['approved', 'rejected']),
});

router.patch('/moderate', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);

    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
      });
    }

    // Vérification du rôle administrateur dans les claims Clerk.
    const claims = auth.sessionClaims as any;
    const role =
      claims?.metadata?.role ??
      claims?.publicMetadata?.role;

    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès réservé aux administrateurs.',
      });
    }

    const parsed = moderationSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Informations de modération invalides.',
      });
    }

    const result = await updateSubmissionModeration(
      parsed.data.submissionId,
      parsed.data.status,
      auth.userId
    );

    return res.status(200).json({
      success: true,
      message:
        parsed.data.status === 'approved'
          ? 'Soumission validée.'
          : 'Soumission refusée.',
      submission: result,
    });
  } catch (error) {
    console.error('[INDAMORA MODERATION ROUTE]', error);

    if (error instanceof SubmissionUploadError) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Erreur pendant la modération.',
    });
  }
});

export default router;
