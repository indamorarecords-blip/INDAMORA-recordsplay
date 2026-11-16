import { createHash, randomUUID } from 'node:crypto';

const BUCKET = process.env.SUPABASE_MEDIA_BUCKET || 'indamora-media';

const AUDIO_LIMIT = 100 * 1024 * 1024;
const VIDEO_LIMIT = 500 * 1024 * 1024;
const COVER_LIMIT = 10 * 1024 * 1024;

const MIME_TYPES: Record<string, { mime: string; category: 'audio' | 'video' | 'cover' }> = {
  mp3: { mime: 'audio/mpeg', category: 'audio' },
  wav: { mime: 'audio/wav', category: 'audio' },
  m4a: { mime: 'audio/mp4', category: 'audio' },
  flac: { mime: 'audio/flac', category: 'audio' },
  ogg: { mime: 'audio/ogg', category: 'audio' },

  mp4: { mime: 'video/mp4', category: 'video' },
  mov: { mime: 'video/quicktime', category: 'video' },
  webm: { mime: 'video/webm', category: 'video' },

  jpg: { mime: 'image/jpeg', category: 'cover' },
  jpeg: { mime: 'image/jpeg', category: 'cover' },
  png: { mime: 'image/png', category: 'cover' },
  webp: { mime: 'image/webp', category: 'cover' },
};

export interface PrepareUploadInput {
  userId: string;
  fileName: string;
  size: number;
  contentType: string;
  uploadKey?: string;
}

export interface PreparedUpload {
  uploadURL: string;
  uploadToken: string;
  bucketName: string;
  objectPath: string;
  alreadyUploaded: false;
}

export interface VerifyUploadInput {
  userId: string;
  objectPath: string;
  expectedSize: number;
  expectedContentType: string;
}

function getConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Configuration Supabase manquante : SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont nécessaires.'
    );
  }

  const parsedUrl = new URL(supabaseUrl);

  if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
    throw new Error('SUPABASE_URL doit utiliser HTTPS.');
  }

  const projectRef = parsedUrl.hostname.split('.')[0];

  const tusEndpoint =
    process.env.SUPABASE_STORAGE_TUS_ENDPOINT ||
    `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

  return {
    supabaseUrl,
    serviceKey,
    tusEndpoint,
  };
}

function ownerFolder(userId: string) {
  return createHash('sha256')
    .update(userId)
    .digest('hex')
    .slice(0, 32);
}

function safeExtension(fileName: string) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';

  if (!MIME_TYPES[extension]) {
    throw new Error('Format de fichier non accepté.');
  }

  return extension;
}

function validateFile(
  fileName: string,
  size: number,
  contentType: string
) {
  if (!fileName || fileName.length > 180) {
    throw new Error('Nom de fichier invalide.');
  }

  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Taille de fichier invalide.');
  }

  const extension = safeExtension(fileName);
  const definition = MIME_TYPES[extension];

  if (contentType !== definition.mime) {
    throw new Error(
      `Type de fichier incorrect. Le format .${extension} doit utiliser ${definition.mime}.`
    );
  }

  const limit =
    definition.category === 'audio'
      ? AUDIO_LIMIT
      : definition.category === 'video'
        ? VIDEO_LIMIT
        : COVER_LIMIT;

  if (size > limit) {
    throw new Error(
      `Fichier trop volumineux. La limite autorisée est de ${Math.round(limit / 1024 / 1024)} Mio.`
    );
  }

  return { extension, definition };
}

async function supabaseRequest(
  path: string,
  init: RequestInit = {}
) {
  const { supabaseUrl, serviceKey } = getConfig();

  const response = await fetch(`${supabaseUrl}/storage/v1${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init.headers || {}),
    },
  });

  const responseText = await response.text();

  let data: any = null;

  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    const message =
      data?.message ||
      data?.error ||
      data?.msg ||
      `Erreur Supabase Storage (${response.status}).`;

    throw new Error(message);
  }

  return data;
}

function encodeObjectPath(objectPath: string) {
  return objectPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

/**
 * Prépare un transfert TUS sécurisé.
 * Cette fonction doit être appelée uniquement depuis une route
 * serveur après authentification Clerk.
 */
export async function prepareSubmissionUpload(
  input: PrepareUploadInput
): Promise<PreparedUpload> {
  if (!input.userId) {
    throw new Error('Utilisateur non authentifié.');
  }

  const { extension } = validateFile(
    input.fileName,
    input.size,
    input.contentType
  );

  const uploadKey = input.uploadKey || randomUUID();

  if (
    uploadKey.length > 80 ||
    !/^[a-zA-Z0-9-]+$/.test(uploadKey)
  ) {
    throw new Error('Identifiant de téléversement invalide.');
  }

  const objectPath =
    `submissions/${ownerFolder(input.userId)}/` +
    `${uploadKey}.${extension}`;

  const encodedPath = encodeObjectPath(objectPath);

  const signed = await supabaseRequest(
    `/object/upload/sign/${encodeURIComponent(BUCKET)}/${encodedPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        upsert: false,
      }),
    }
  );

  if (!signed?.token) {
    throw new Error(
      'Supabase n’a pas fourni de jeton de téléversement.'
    );
  }

  const { tusEndpoint } = getConfig();

  return {
    uploadURL: tusEndpoint,
    uploadToken: signed.token,
    bucketName: BUCKET,
    objectPath,
    alreadyUploaded: false,
  };
}

/**
 * Vérifie que le fichier existe réellement dans le bucket privé,
 * qu'il appartient au propriétaire et que ses métadonnées
 * correspondent aux informations attendues.
 */
export async function verifySubmissionUpload(
  input: VerifyUploadInput
) {
  if (!input.userId) {
    throw new Error('Utilisateur non authentifié.');
  }

  if (!input.objectPath || input.objectPath.includes('..')) {
    throw new Error('Chemin de fichier invalide.');
  }

  const expectedPrefix =
    `submissions/${ownerFolder(input.userId)}/`;

  if (!input.objectPath.startsWith(expectedPrefix)) {
    throw new Error('Ce fichier ne vous appartient pas.');
  }

  const encodedPath = encodeObjectPath(input.objectPath);

  const info = await supabaseRequest(
    `/object/info/${encodeURIComponent(BUCKET)}/${encodedPath}`,
    {
      method: 'GET',
    }
  );

  if (!info) {
    throw new Error('Fichier introuvable dans Supabase Storage.');
  }

  const metadata = info.metadata || {};

  const actualSize = Number(
    metadata.size ?? info.size ?? 0
  );

  const actualContentType =
    metadata.mimetype ||
    metadata.contentType ||
    info.mimetype ||
    info.contentType;

  if (actualSize !== input.expectedSize) {
    throw new Error(
      'La taille du fichier reçu ne correspond pas au fichier envoyé.'
    );
  }

  if (actualContentType !== input.expectedContentType) {
    throw new Error(
      'Le type MIME du fichier reçu ne correspond pas au fichier envoyé.'
    );
  }

  return {
    bucketName: BUCKET,
    objectPath: input.objectPath,
    size: actualSize,
    contentType: actualContentType,
    verified: true,
  };
}
