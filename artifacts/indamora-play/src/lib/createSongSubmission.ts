export type SongSubmissionInput = {
  title: string;
  artist: string;
  category: string;
  note?: string;
  duration?: number;
  coverObjectPath?: string;
};

export async function createSongSubmission(
  input: SongSubmissionInput,
  mediaObjectPath: string
) {
  if (!mediaObjectPath) {
    throw new Error("Le fichier audio est manquant.");
  }

  const response = await fetch("/api/submissions", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: input.title,
      artist: input.artist,
      category: input.category,
      note: input.note ?? "",
      duration: input.duration ?? null,
      mediaType: "audio",
      mediaObjectPath,
      coverObjectPath: input.coverObjectPath ?? null,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.error || "Impossible d'enregistrer la soumission."
    );
  }

  return result;
}
