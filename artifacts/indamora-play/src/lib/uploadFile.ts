type UploadResponse = {
  uploadURL: string;
  objectPath: string;
};

type CompleteResponse = {
  objectPath: string;
};

export async function uploadFileToSupabase(
  file: File
): Promise<string> {
  const contentType = file.type || "audio/mpeg";

  // Étape 1 : demander une URL signée
  const request = await fetch(
    "/api/storage/uploads/request-url",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contentType,
        size: file.size,
      }),
    }
  );

  if (!request.ok) {
    throw new Error("Préparation de l'envoi impossible.");
  }

  const upload: UploadResponse = await request.json();

  // Étape 2 : transférer le fichier directement à Supabase
  const transfer = await fetch(upload.uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
    },
    body: file,
  });

  if (!transfer.ok) {
    throw new Error("Échec du transfert vers Supabase.");
  }

  // Étape 3 : finaliser l'enregistrement
  const complete = await fetch(
    "/api/storage/uploads/complete",
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        objectPath: upload.objectPath,
      }),
    }
  );

  if (!complete.ok) {
    throw new Error("Finalisation de l'envoi impossible.");
  }

  const result: CompleteResponse = await complete.json();

  return result.objectPath;
}
