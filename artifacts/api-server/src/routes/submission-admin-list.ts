import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';

const router = Router();

router.get('/pending', async (req: Request, res: Response) => {
  try {
    const auth = getAuth(req);

    if (!auth.isAuthenticated || !auth.userId) {
      return res.status(401).json({
        success: false,
        error: 'Connexion nécessaire.',
      });
    }

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

    const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('Configuration Supabase manquante.');
    }

    const response = await fetch(
      `${url}/rest/v1/submissions?status=eq.pending&select=id,title,artist,category,submitted_at,status,owner_id,media_type,media_object_path,cover_object_path,duration&order=submitted_at.desc`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Lecture des soumissions impossible.');
    }

    const submissions = await response.json();

    return res.status(200).json({
      success: true,
      submissions,
    });
  } catch (error) {
    console.error('[INDAMORA ADMIN LIST]', error);

    return res.status(500).json({
      success: false,
      error: 'Impossible de récupérer les soumissions.',
    });
  }
});

export default router;
