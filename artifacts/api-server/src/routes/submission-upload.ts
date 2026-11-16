import { Router, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';
import { z } from 'zod';

import { prepareArtistSubmission } from '../lib/submissionManager';
import { SubmissionUploadError } from '../lib/supabaseSubmissionStorage';

const router = Router();

const submissionSchema = z.object({
  objectPath: z.string().min(1).max(1000),
  fileName: z.string().min(1).max(180),
  size: z.number().int().positive(),
  contentType: z.enum([
    'audio/mpeg',
    'audio/wav',
    'audio/mp4',
    'audio/flac',
    'audio/ogg',
    'audio/aac',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ]),
  title: z.string().trim().min(1).max(180),
  artistName: z.string().trim().min(1).max(180),
  genre: z.string().max(100).optional(),
  album: z.string().max(180).optional(),
  year: z.number().int().optional(),
  description: z.string().max(3000).optional(),
  consentAccepted: z.literal(true),
});

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Configuration Supabase manquante.');
  }

  return { url, key };
}

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

    const data = parsed.data;

    // Seuls les fichiers audio et vidéo sont acceptés.
    const mediaType = data.contentType.startsWith('video/')
      ? 'video'
      : 'audio';

    // Vérification du fichier et de son propriétaire.
    const verified = await prepareArtistSubmission({
      userId: auth.userId,
      objectPath: data.objectPath,
      fileName: data.fileName,
      size: data.size,
      contentType: data.contentType,
      title: data.title,
      artistName: data.artistName,
      genre: data.genre,
      album: data.album,
      year: data.year,
      description: data.description,
    });

    const { url, key } = getSupabaseConfig();

    // Conservation des informations complémentaires dans le champ note.
    const note = 'INDAMORA_SUBMISSION_V1:' +
      Buffer.from(
        JSON.stringify({
          version: 1,
          album: data.album || null,
          year: data.year || null,
          description: data.description || null,
          consentAcceptedAt: new Date().toISOString(),
        }),
        'utf8'
      ).toString('base64url');

    // Enregistrement dans la table existante.
    const response = await fetch(`${url}/rest/v1/submissions`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        title: verified.metadata.title,
        artist: verified.metadata.artistName,
        category: verified.metadata.genre || 'Non renseigné',
        submitted_at: new Date().toISOString(),
        status: 'pending',
        note,
        owner_id: auth.userId,
        media_type: mediaType,
        media_object_path: verified.file.objectPath,
        cover_object_path: null,
        duration: null,
        published_work_id: null,
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');

      console.error(
        '[INDAMORA SUBMISSION DATABASE]',
        response.status,
        details.slice(0, 1000)
      );

      return res.status(502).json({
        success: false,
        error: 'Le fichier est reçu, mais son enregistrement a échoué.',
      });
    }

    const rows = await response.json() as Array<{ id: number }>;

    if (!rows.length) {
      throw new Error('Supabase n’a retourné aucun enregistrement.');
    }

    return res.status(201).json({
      success: true,
      message: 'Votre soumission a été envoyée pour modération.',
      submission: {
        id: rows[0].id,
        status: 'pending',
      },
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
      error: 'Impossible d’enregistrer votre soumission.',
    });
  }
});

export default router;
