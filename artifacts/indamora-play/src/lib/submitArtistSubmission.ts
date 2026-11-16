export interface ArtistSubmissionInput {
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
  consentAccepted: boolean;
}

export interface ArtistSubmissionResponse {
  success: boolean;
  message: string;
  submission?: {
    id: number;
    status: string;
  };
  error?: string;
}

export async function submitArtistSubmission(
  input: ArtistSubmissionInput
): Promise<ArtistSubmissionResponse> {
  if (!input.consentAccepted) {
    throw new Error(
      'Vous devez accepter les conditions de soumission.'
    );
  }

  if (!input.objectPath) {
    throw new Error('Le fichier audio ou vidéo est manquant.');
  }

  const response = await fetch('/api/submissions/upload', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...input,
      consentAccepted: true,
    }),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.error || 'Impossible d’envoyer votre soumission.'
    );
  }

  return result as ArtistSubmissionResponse;
}
