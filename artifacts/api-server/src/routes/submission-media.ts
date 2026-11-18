import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';

import { createAdminMediaUrl } from '../lib/submissionAdminStorage';

const router = Router();

const schema = z.object({
  objectPath: z.string().min(1).max(1000),
});

router.post('/media-url', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);

    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
      });
    }

    // IMPORTANT :
    // Le contrôle du rôle administrateur doit être effectué
    // côté serveur à partir des métadonnées Clerk fiables.
    const role = auth.sessionClaims?.metadata
      ? (auth.sessionClaims.metadata as any).role
      : undefined;

    if (role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Accès réservé aux administrateurs.',
      });
    }

    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: 'Chemin du média invalide.',
      });
    }

    const result = await createAdminMediaUrl(
      parsed.data.objectPath,
      300
    );

    return res.status(200).json({
      success: true,
      mediaUrl: result.url,
      expiresIn: result.expiresIn,
    });
  } catch (error) {
    console.error('[INDAMORA ADMIN MEDIA]', error);

    return res.status(500).json({
      success: false,
      error: 'Impossible de récupérer le média.',
    });
  }
});

export default router;
