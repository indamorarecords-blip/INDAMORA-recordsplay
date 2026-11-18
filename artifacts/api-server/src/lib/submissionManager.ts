import {
  verifySubmissionUpload,
  SubmissionUploadError,
} from './supabaseSubmissionStorage';

export interface SubmissionInput {
  userId: string;
  objectPath: string;
  fileName: string;
  size: number;
  contentType: string;
  title: string;
  artistName: string;
  genre?: string;
  album?: string;
  year?: number;
  description?: string;
}

export interface SubmissionResult {
  status: 'pending';
  file: {
    objectPath: string;
    size: number;
    contentType: string;
    verified: boolean;
  };
  metadata: {
    title: string;
    artistName: string;
    genre: string | null;
    album: string | null;
    year: number | null;
    description: string | null;
  };
}

export async function prepareArtistSubmission(
  input: SubmissionInput
): Promise<SubmissionResult> {
  if (!input.userId) {
    throw new SubmissionUploadError(
      'Artiste non authentifié.',
      401
    );
  }

  if (!input.title.trim() || !input.artistName.trim()) {
    throw new SubmissionUploadError(
      'Le titre et le nom de l’artiste sont obligatoires.',
      400
    );
  }

  if (
    input.year !== undefined &&
    input.year !== null &&
    (!Number.isInteger(input.year) ||
      input.year < 1900 ||
      input.year > new Date().getFullYear() + 2)
  ) {
    throw new SubmissionUploadError(
      'Année de sortie invalide.',
      400
    );
  }

  const file = await verifySubmissionUpload({
    userId: input.userId,
    objectPath: input.objectPath,
    expectedSize: input.size,
    expectedContentType: input.contentType,
  });

  return {
    status: 'pending',
    file,
    metadata: {
      title: input.title.trim(),
      artistName: input.artistName.trim(),
      genre: input.genre?.trim() || null,
      album: input.album?.trim() || null,
      year: input.year ?? null,
      description: input.description?.trim() || null,
    },
  };
}
