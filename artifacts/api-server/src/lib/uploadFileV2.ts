export type UploadV2Response = {
  success: boolean;
  objectPath: string;
  size: number;
  contentType: string;
};

export async function uploadFileV2(
  file: File
): Promise<string> {
  if (!file || file.size === 0) {
    throw new Error("Le fichier audio est vide.");
  }

  const contentType = file.type || "audio/mpeg";

  if (!contentType.startsWith("audio/")) {
    throw new Error("Le fichier doit être un fichier audio.");
  }

  const response = await fetch(
    "/api/storage/uploads-v2/send",
    {
      method: "PUT",
      credentials: "include",
      headers: {
        "Content-Type": contentType,
      },
      body: file,
    }
  );

  const result: {
  success?: boolean;
  objectPath?: string;
  error?: string;
} | null = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.error || "Le transfert audio a échoué."
    );
  }

  if (!result?.success || !result?.objectPath) {
    throw new Error("Réponse de transfert invalide.");
  }

  return result.objectPath;
}
