import { useState } from "react";
import SongUploadV2 from "./SongUploadV2";

export default function SongSubmissionV2() {
  const [audioPath, setAudioPath] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [message, setMessage] = useState("");

  function handleUploadComplete(path: string) {
    setAudioPath(path);
    setMessage("Audio transféré. Complète les informations de ton titre.");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!audioPath) {
      setMessage("Envoie d'abord ton fichier audio.");
      return;
    }

    if (!title.trim() || !artist.trim()) {
      setMessage("Renseigne le titre et le nom de l'artiste.");
      return;
    }

    setMessage(
      "Audio transféré et informations saisies. L'enregistrement de la soumission reste à raccorder."
    );
  }

  return (
    <section className="mx-auto w-full max-w-xl space-y-6 rounded-xl p-6">
      <div>
        <h2 className="text-2xl font-bold">
          Soumettre un titre
        </h2>
        <p className="mt-2">
          Propose ton morceau à INDAMORA PLAY.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="song-title">Titre du morceau</label>
          <input
            id="song-title"
            className="w-full rounded-lg border p-3"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="song-artist">Nom de l'artiste</label>
          <input
            id="song-artist"
            className="w-full rounded-lg border p-3"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            required
          />
        </div>

        <div>
          <p className="mb-2 font-semibold">Fichier audio</p>
          <SongUploadV2 onUploadComplete={handleUploadComplete} />
        </div>

        {audioPath && (
          <p className="break-all text-sm">
            Fichier transféré : {audioPath}
          </p>
        )}

        <button
          type="submit"
          className="rounded-lg px-5 py-3 font-semibold"
        >
          Préparer ma soumission
        </button>

        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
