import { Upload } from 'tus-js-client';

import {
  submitArtistSubmission,
  type ArtistSubmissionInput,
} from './submitArtistSubmission';

export interface ArtistUploadOptions {
  file: File;
  userId: string;
  metadata: Omit<
    ArtistSubmissionInput,
    'objectPath' | 'fileName' | 'size' | 'contentType'
  >;
  onProgress?: (progress: number) => void;
}

export async function uploadAndSubmitArtistWork(
  options: ArtistUploadOptions
) {
  const { file, userId, metadata, onProgress } = options;

  if (!userId) {
    throw new Error('Vous devez être connecté.');
  }

  if (!metadata.consentAccepted) {
    throw new Error('Vous devez accepter les conditions.');
  }

  const contentType =
    file.type || 'application/octet-stream';

  const uploadKey = crypto.randomUUID();

  // Préparation du transfert
  const prepareResponse = await fetch(
    '/api/storage/uploads/request-url',
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType,
        uploadKey,
      }),
    }
  );

  const prepared = await prepareResponse.json();

  if (!prepareResponse.ok) {
    throw new Error(
      prepared.error || 'Préparation du transfert impossible.'
    );
  }

  const {
    uploadURL,
    uploadToken,
    bucketName,
    objectPath,
  } = prepared;

  if (!uploadURL || !uploadToken || !bucketName || !objectPath) {
    throw new Error('Informations de transfert incomplètes.');
  }

  // Transfert direct vers Supabase avec TUS
  const objectName = objectPath;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: uploadURL,
      headers: {
        'x-signature': uploadToken,
      },
      metadata: {
        bucketName,
        objectName,
        contentType,
        cacheControl: '3600',
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],

      onProgress(bytesSent, bytesTotal) {
        const progress = Math.round(
          (bytesSent / bytesTotal) * 100
        );

        onProgress?.(progress);
      },

      onError(error) {
        reject(error);
      },

      onSuccess() {
        resolve();
      },
    });

    upload.start();
  });

  // Enregistrement de la soumission
  return submitArtistSubmission({
    ...metadata,
    objectPath,
    fileName: file.name,
    size: file.size,
    contentType,
  });
}
