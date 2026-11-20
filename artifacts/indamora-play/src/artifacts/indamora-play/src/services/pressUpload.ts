export interface PressCoverUploadResult {
  objectPath: string;
}

export async function uploadPressCover(
  file: File,
  getToken: () => Promise<string | null>
): Promise<PressCoverUploadResult> {
  const token = await getToken();

  if (!token) {
    throw new Error("Authentification requise.");
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // 1. Demander une URL d'upload signée
  const requestResponse = await fetch(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: file.name,
        size: file.size,
        contentType: file.type,
      }),
    }
  );

  if (!requestResponse.ok) {
    throw new Error("Impossible de préparer l'envoi de la couverture.");
  }

  const upload = await requestResponse.json();

  if (!upload.uploadURL || !upload.objectPath) {
    throw new Error("URL ou chemin de stockage manquant.");
  }

  // 2. Envoyer le fichier vers Supabase Storage
  const uploadResponse = await fetch(upload.uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!uploadResponse.ok) {
    throw new Error("Échec de l'envoi de la couverture.");
  }

  // 3. Confirmer et rendre la couverture publique
  const completeResponse = await fetch(
    "/api/storage/press-covers/complete",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        objectPath: upload.objectPath,
      }),
    }
  );

  if (!completeResponse.ok) {
    throw new Error("La confirmation de la couverture a échoué.");
  }

  const completed = await completeResponse.json();

  if (!completed.success || !completed.objectPath) {
    throw new Error("La couverture n'a pas été confirmée.");
  }

  return {
    objectPath: completed.objectPath,
  };
}
