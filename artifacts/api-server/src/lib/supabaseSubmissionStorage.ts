import { createHash, randomUUID } from 'node:crypto';

const DEFAULT_BUCKET = 'indamora-media';

const MAX_AUDIO_SIZE = 100 * 1024 * 1024;
const MAX_VIDEO_SIZE = 500 * 1024 * 1024;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

const MIME_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
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
  alreadyUploaded: boolean;
}

export interface VerifyUploadInput {
  userId: string;
  objectPath: string;
  expectedSize: number;
  expectedContentType: string;
}

interface StorageConfig {
  supabaseUrl: string;
  storageUrl: string;
  serviceKey: string;
  bucket: string;
}

export class SubmissionUploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'SubmissionUploadError';
    this.statusCode = statusCode;
  }
}

function getConfig(): StorageConfig {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket =
  process.env.SUPABASE_STORAGE_BUCKET ||
  process.env.SUPABASE_MEDIA_BUCKET ||
  DEFAULT_BUCKET;

  if (!supabaseUrl || !serviceKey) {
    throw new SubmissionUploadError(
      'Configuration Supabase incomplète.',
      500
    );
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new SubmissionUploadError(
      'URL Supabase invalide.',
      500
    );
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new SubmissionUploadError(
      'Une connexion HTTPS est obligatoire.',
      500
    );
  }

  const hostname = parsedUrl.hostname;

  if (!hostname.endsWith('.supabase.co')) {
    throw new SubmissionUploadError(
      'Domaine Supabase non reconnu pour le transfert direct.',
      500
    );
  }

  const projectRef = hostname.replace('.supabase.co', '');

  return {
    supabaseUrl,
    storageUrl: `https://${projectRef}.storage.supabase.co`,
    serviceKey,
    bucket,
  };
}

function ownerFolder(userId: string): string {
  return createHash('sha256')
    .update(userId)
    .digest('hex')
    .slice(0, 32);
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function validateFile(
  fileName: string,
  size: number,
  contentType: string
): string {
  if (!fileName || fileName.length > 180) {
    throw new SubmissionUploadError(
      'Nom de fichier invalide.',
      400
    );
  }

  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new SubmissionUploadError(
      'Taille de fichier invalide.',
      400
    );
  }

  const extension =
    fileName.split('.').pop()?.toLowerCase() || '';

  const expectedMime = MIME_TYPES[extension];

  if (!expectedMime) {
    throw new SubmissionUploadError(
      'Format de fichier non autorisé.',
      400
    );
  }

  if (contentType !== expectedMime) {
    throw new SubmissionUploadError(
      'Le type du fichier ne correspond pas à son extension.',
      400
    );
  }

  if (expectedMime.startsWith('audio/') && size > MAX_AUDIO_SIZE) {
    throw new SubmissionUploadError(
      'Le fichier audio dépasse la limite de 100 Mo.',
      413
    );
  }

  if (expectedMime.startsWith('video/') && size > MAX_VIDEO_SIZE) {
    throw new SubmissionUploadError(
      'La vidéo dépasse la limite de 500 Mo.',
      413
    );
  }

  if (expectedMime.startsWith('image/') && size > MAX_IMAGE_SIZE) {
    throw new SubmissionUploadError(
      'L’image dépasse la limite de 10 Mo.',
      413
    );
  }

  return expectedMime;
}

async function supabaseRequest(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const config = getConfig();

  const response = await fetch(
    `${config.supabaseUrl}/storage/v1${path}`,
    {
      ...options,
      headers: {
        apikey: config.serviceKey,
        Authorization: `Bearer ${config.serviceKey}`,
        ...options.headers,
      },
    }
  );

  if (!response.ok) {
    const details = await response.text().catch(() => '');

    console.error(
      '[INDAMORA STORAGE] Supabase error:',
      response.status,
      details.slice(0, 1000)
    );

    throw new SubmissionUploadError(
      'Le service de stockage a refusé la demande.',
      response.status >= 400 && response.status < 500
        ? response.status
        : 502
    );
  }

  return response;
}

function buildObjectPath(
  userId: string,
  fileName: string,
  uploadKey?: string
): string {
  const extension =
    fileName.split('.').pop()?.toLowerCase() || '';

  const safeKey =
    uploadKey && /^[0-9a-f-]{36}$/i.test(uploadKey)
      ? uploadKey
      : randomUUID();

  return `submissions/${ownerFolder(userId)}/${safeKey}.${extension}`;
}

/**
 * Prépare un transfert TUS signé.
 */
export async function prepareSubmissionUpload(
  input: PrepareUploadInput
): Promise<PreparedUpload> {
  const config = getConfig();

  const contentType = validateFile(
    input.fileName,
    input.size,
    input.contentType
  );

  const objectPath = buildObjectPath(
    input.userId,
    input.fileName,
    input.uploadKey
  );

  const signedResponse = await supabaseRequest(
    `/object/upload/sign/${encodeURIComponent(config.bucket)}/${encodePath(objectPath)}`,
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

  const signed = await signedResponse.json() as {
    url?: string;
    signedURL?: string;
    token?: string;
  };

  const uploadToken = signed.token;

  if (!uploadToken) {
    throw new SubmissionUploadError(
      'Supabase n’a pas fourni de jeton de transfert.',
      502
    );
  }

  return {
    uploadURL: `${config.storageUrl}/storage/v1/upload/resumable`,
    uploadToken,
    bucketName: config.bucket,
    objectPath,
    alreadyUploaded: false,
  };
}

/**
 * Vérifie l'existence, le propriétaire et les caractéristiques du fichier.
 */
export async function verifySubmissionUpload(
  input: VerifyUploadInput
) {
  const config = getConfig();

  if (
    !input.objectPath.startsWith(
      `submissions/${ownerFolder(input.userId)}/`
    )
  ) {
    throw new SubmissionUploadError(
      'Accès interdit à ce fichier.',
      403
    );
  }

  const infoResponse = await supabaseRequest(
    `/object/info/${encodeURIComponent(config.bucket)}/${encodePath(input.objectPath)}`
  );

  const info = await infoResponse.json() as {
    name?: string;
    size?: number;
    content_type?: string;
    contentType?: string;
    metadata?: {
      size?: number;
      mimetype?: string;
      contentType?: string;
    };
  };

  const actualSize =
    Number(info.size ?? info.metadata?.size ?? 0);

  const actualContentType =
    info.content_type ??
    info.contentType ??
    info.metadata?.mimetype ??
    info.metadata?.contentType;

  if (actualSize !== input.expectedSize) {
    throw new SubmissionUploadError(
      'La taille du fichier reçu ne correspond pas.',
      422
    );
  }

  if (actualContentType !== input.expectedContentType) {
    throw new SubmissionUploadError(
      'Le format du fichier reçu ne correspond pas.',
      422
    );
  }

  return {
    objectPath: input.objectPath,
    bucket: config.bucket,
    size: actualSize,
    contentType: actualContentType,
    verified: true,
  };
}
