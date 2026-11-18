export type ArtistUploadStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'verifying'
  | 'submitting'
  | 'success'
  | 'error';

export interface ArtistUploadState {
  status: ArtistUploadStatus;
  progress: number;
  message: string;
  submissionId?: number;
}

export const initialArtistUploadState: ArtistUploadState = {
  status: 'idle',
  progress: 0,
  message: '',
};

export function getArtistUploadMessage(
  status: ArtistUploadStatus,
  progress = 0
): string {
  switch (status) {
    case 'preparing':
      return 'Préparation de votre fichier...';

    case 'uploading':
      return `Téléversement en cours : ${progress}%`;

    case 'verifying':
      return 'Vérification du fichier...';

    case 'submitting':
      return 'Enregistrement de votre soumission...';

    case 'success':
      return 'Votre morceau a été envoyé pour modération.';

    case 'error':
      return 'Une erreur est survenue.';

    default:
      return '';
  }
}
