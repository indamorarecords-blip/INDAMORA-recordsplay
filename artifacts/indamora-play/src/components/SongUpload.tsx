import { useState } from “react”;
import { uploadFileToSupabase } from “../lib/uploadFile”;

type SongUploadProps = {
onUploadComplete: (objectPath: string) => void;
};

export default function SongUpload({ onUploadComplete }: SongUploadProps) {
const [file, setFile] = useState<File | null>(null);
const [loading, setLoading] = useState(false);
const [message, setMessage] = useState(””);

async function handleUpload() {
if (!file) {
setMessage(“Sélectionne d’abord un fichier audio.”);
return;
}

setLoading(true);
setMessage("");
try {
  const objectPath = await uploadFileToSupabase(file);
  onUploadComplete(objectPath);
  setMessage("Fichier envoyé avec succès.");
} catch (error) {
  console.error("Erreur d'envoi :", error);
  setMessage(
    error instanceof Error ? error.message : "Échec de l'envoi."
  );
} finally {
  setLoading(false);
}

}

return (
<input
type=“file”
accept=“audio/mpeg,audio/mp4,audio/wav,audio/ogg”
onChange={(event) => setFile(event.target.files?.[0] ?? null)}
disabled={loading}
/>

  <button
    type="button"
    onClick={handleUpload}
    disabled={!file || loading}
    className="rounded-lg px-5 py-3 font-semibold disabled:opacity-50"
  >
    {loading ? "Envoi en cours..." : "Envoyer le fichier audio"}
  </button>
  {message && <p role="status">{message}</p>}
</div>

);
}
