import SongUpload from "../components/SongUpload";

export default function Submit() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-12">
      <h1 className="text-3xl font-bold">
        Soumettre une œuvre
      </h1>

      <p className="mt-3 text-muted-foreground">
        Envoyez votre fichier audio à INDAMORA PLAY.
      </p>

      <section className="mt-8 rounded-xl border p-6">
        <h2 className="mb-4 text-xl font-semibold">
          Fichier audio
        </h2>

        <SongUpload
          onUploadComplete={(objectPath) => {
            console.log("Fichier transféré :", objectPath);
          }}
        />
      </section>
    </main>
  );
}
