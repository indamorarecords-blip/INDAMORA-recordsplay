import { useState } from "react";
import { uploadFileV2 } from "../lib/uploadFileV2";

type SongUploadV2Props = {
  onUploadComplete: (objectPath: string) => void;
};

export default function SongUploadV2({
  onUploadComplete,
}: SongUploadV2Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleUpload() {
    if (!file) {
      setMessage("Sélectionne un fichier audio.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const objectPath = await uploadFileV2(file);
      onUploadComplete(objectPath);
      setMessage("Fichier audio transféré avec succès.");
    } catch (error) {
      console.error("[SONG-UPLOAD-V2]", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "Le transfert audio a échoué."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg"
        onChange={(event) =>
          setFile(event.target.files?.[0] ?? null)
        }
        disabled={loading}
      />

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || loading}
        className="rounded-lg px-5 py-3 font-semibold disabled:opacity-50"
      >
        {loading ? "Envoi en cours..." : "Envoyer mon audio"}
      </button>

      {message && <p role="status">{message}</p>}
    </div>
  );
}
