import { useState } from "react";
import SongUpload from "../components/SongUpload";

export default function SubmitPage() {
  const [objectPath, setObjectPath] = useState("");

  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="text-3xl font-bold">
        Envoyer une chanson
      </h1>

      <p className="mt-3 text-muted-foreground">
        Sélectionnez votre fichier audio pour le transmettre à INDAMORA PLAY.
      </p>

      <div className="mt-8">
        <SongUpload onUploadComplete={setObjectPath} />
      </div>

      {objectPath && (
        <div className="mt-5 break-all rounded-lg border p-4">
          <p className="font-semibold">Fichier transféré avec succès.</p>
          <p className="mt-2 text-sm">{objectPath}</p>
        </div>
      )}
    </main>
  );
}
