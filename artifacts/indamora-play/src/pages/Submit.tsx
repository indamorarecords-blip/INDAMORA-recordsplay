import { useState } from "react";
import SongUpload from "../components/SongUpload";
import { createSongSubmission } from "../lib/createSongSubmission";

export default function Submit() {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [duration, setDuration] = useState<number | undefined>();
  const [message, setMessage] = useState("");

  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-3xl font-bold">
        Soumettre une œuvre
      </h1>

      <p className="mt-3 text-muted-foreground">
        Envoyez votre fichier audio à INDAMORA PLAY.
      </p>

      <section className="mt-8 rounded-xl border p-6 space-y-4">
        <input
          className="w-full rounded-lg border p-3"
          placeholder="Titre de la chanson"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <input
          className="w-full rounded-lg border p-3"
          placeholder="Nom de l'artiste"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />

        <input
          className="w-full rounded-lg border p-3"
          placeholder="Catégorie"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />

        <textarea
          className="w-full rounded-lg border p-3"
          placeholder="Description (facultatif)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <SongUpload
          onUploadComplete={async (objectPath) => {
            try {
              setMessage("Enregistrement de la chanson...");

              await createSongSubmission(
                {
                  title,
                  artist,
                  category,
                  note,
                  duration,
                },
                objectPath
              );

              setMessage("Chanson envoyée avec succès !");
            } catch (error) {
              console.error(error);
              setMessage(
                error instanceof Error
                  ? error.message
                  : "Erreur lors de l'enregistrement."
              );
            }
          }}
        />

        {message && <p>{message}</p>}
      </section>
    </main>
  );
}
