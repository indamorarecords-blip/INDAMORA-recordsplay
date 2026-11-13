import { useState } from "react";
import SongUploadV2 from "./SongUploadV2";

export default function SongSubmissionV2() {
  const [audioPath, setAudioPath] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [category, setCategory] = useState("Musique");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioPath) {
      setMessage("Transfère d'abord ton fichier audio.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/submissions-v2", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          artist,
          category,
          mediaObjectPath: audioPath,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Impossible d'enregistrer la soumission."
        );
      }

      setMessage("Ta soumission a bien été enregistrée !");
      setTitle("");
      setArtist("");
      setAudioPath("");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Une erreur est survenue."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-6 rounded-xl p-6">
      <h2 className="text-2xl font-bold">Soumettre un titre</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="title">Titre du morceau</label>
          <input
            id="title"
            className="w-full rounded-lg border p-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="artist">Nom de l'artiste</label>
          <input
            id="artist"
            className="w-full rounded-lg border p-3"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="category">Catégorie</label>
          <select
            id="category"
            className="w-full rounded-lg border p-3"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="Musique">Musique</option>
            <option value="Clip vidéo">Clip vidéo</option>
            <option value="Autre">Autre</option>
          </select>
        </div>

        <div>
          <p className="mb-2 font-semibold">Fichier audio</p>
          <SongUploadV2
            onUploadComplete={(path) => setAudioPath(path)}
          />
        </div>

        {audioPath && (
          <p className="break-all text-sm">
            Audio transféré : {audioPath}
          </p>
        )}

        <button
          type="submit"
          disabled={loading || !audioPath}
          className="rounded-lg px-5 py-3 font-semibold disabled:opacity-50"
        >
          {loading ? "Enregistrement..." : "Envoyer ma soumission"}
        </button>

        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
