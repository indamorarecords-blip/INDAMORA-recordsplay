import {
  createHash,
} from 'node:crypto';

import {
  SubmissionUploadError,
} from './supabaseSubmissionStorage';

const BUCKET =
  process.env.SUPABASE_MEDIA_BUCKET || 'indamora-media';

function getConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new SubmissionUploadError(
      'Configuration Supabase manquante.',
      500
    );
  }

  return { url, key };
}

function ownerFolder(userId: string) {
  return createHash('sha256')
    .update(userId)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Vérifie qu'un chemin appartient à un dossier artiste.
 */
function validateObjectPath(objectPath: string) {
  if (
    !objectPath ||
    objectPath.includes('..') ||
    objectPath.startsWith('/')
  ) {
    throw new SubmissionUploadError(
      'Chemin de fichier invalide.',
      400
    );
  }

  if (!objectPath.startsWith('submissions/')) {
    throw new SubmissionUploadError(
      'Ce fichier ne fait pas partie des soumissions.',
      403
    );
  }
}

/**
 * Génère une URL temporaire pour écouter ou visionner
 * un fichier pendant la modération.
 */
export async function createAdminMediaUrl(
  objectPath: string,
  expiresIn = 300
) {
  validateObjectPath(objectPath);

  const config = getConfig();

  const safeExpiration = Math.min(
    Math.max(expiresIn, 60),
    900
  );

  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(BUCKET)}/${objectPath
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`,
    {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expiresIn: safeExpiration,
      }),
    }
  );

  if (!response.ok) {
    throw new SubmissionUploadError(
      'Impossible de générer le lien du média.',
      502
    );
  }

  const result = await response.json() as {
    signedURL?: string;
    signedUrl?: string;
  };

  const signedURL = result.signedURL || result.signedUrl;

  if (!signedURL) {
    throw new SubmissionUploadError(
      'Supabase n’a pas retourné de lien temporaire.',
      502
    );
  }

  return {
    url: signedURL.startsWith('http')
      ? signedURL
      : `${config.url}/storage/v1${signedURL}`,
    expiresIn: safeExpiration,
  };
}

/**
 * Vérifie qu'un artiste possède bien le fichier demandé.
 */
export function artistOwnsMedia(
  objectPath: string,
  userId: string
) {
  return objectPath.startsWith(
    `submissions/${ownerFolder(userId)}/`
  );
}
