import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
type PressArticle = {
  id: number;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  cover_object_path: string | null;
  content: string | null;
  author: string | null;
  slug: string | null;
  published_at: string | null;
  is_featured: boolean;
};
export default function PressArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const [article, setArticle] = useState<PressArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/press/articles/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (response.status === 404) {
          throw new Error("Cet article n'existe pas ou n'est plus publié.");
        }
        if (!response.ok) {
          throw new Error("Impossible de charger cet article.");
        }
        return response.json();
      })
      .then((data) => {
        if (active) setArticle(data.article);
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : "Une erreur est survenue.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  const shareUrl =
    typeof window !== "undefined" ? window.location.href : "";
  const shareTitle = article?.title ?? "INDAMORA PLAY PRESSE";
  const shareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(
        `${shareTitle} ${shareUrl}`
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  };
  const shareFacebook = () => {
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
        shareUrl
      )}`,
      "_blank",
      "noopener,noreferrer"
    );
  };
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p>Chargement de l'article...</p>
      </main>
    );
  }
  if (error || !article) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-3xl font-bold">Article introuvable</h1>
        <p className="mt-4 text-neutral-600">
          {error || "Cet article n'est pas disponible."}
        </p>
        <Link
          href="/presse"
          className="mt-6 rounded-full bg-black px-6 py-3 text-white"
        >
          Retour à la presse
        </Link>
      </main>
    );
  }
  const formattedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <Link
            href="/presse"
            className="text-sm font-semibold text-neutral-600 hover:text-black"
          >
            ← Retour à INDAMORA PLAY PRESSE
          </Link>
          <p className="mt-8 text-sm font-semibold uppercase tracking-widest text-neutral-500">
            INDAMORA PLAY PRESSE
          </p>
          {article.category && (
            <p className="mt-5 text-sm font-semibold uppercase">
              {article.category}
            </p>
          )}
          <h1 className="mt-4 text-3xl font-bold leading-tight md:text-5xl">
            {article.title}
          </h1>
          {article.subtitle && (
            <p className="mt-5 text-xl text-neutral-600">
              {article.subtitle}
            </p>
          )}
          <div className="mt-6 flex flex-wrap gap-3 text-sm text-neutral-500">
            {article.author && <span>Par {article.author}</span>}
            {formattedDate && <span>• {formattedDate}</span>}
          </div>
        </div>
      </header>
      <article className="mx-auto max-w-4xl px-6 py-8">
        {article.cover_object_path && (
          <img
            src={article.cover_object_path}
            alt={article.title ?? "Couverture de l'article"}
            className="mb-10 max-h-[550px] w-full rounded-2xl object-cover"
          />
        )}
        <div className="whitespace-pre-wrap text-lg leading-8 text-neutral-800">
          {article.content}
        </div>
        <div className="mt-12 border-t pt-8">
          <h2 className="text-lg font-bold">
            Partager cet article
          </h2>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={shareWhatsApp}
              className="rounded-full bg-green-600 px-5 py-3 font-semibold text-white"
            >
              Partager sur WhatsApp
            </button>
            <button
              onClick={shareFacebook}
              className="rounded-full bg-blue-700 px-5 py-3 font-semibold text-white"
            >
              Partager sur Facebook
            </button>
            <button
              onClick={() => navigator.clipboard.writeText(shareUrl)}
              className="rounded-full border px-5 py-3 font-semibold"
            >
              Copier le lien
            </button>
          </div>
        </div>
        <div className="mt-12 border-t py-8">
          <Link
            href="/presse"
            className="font-semibold underline"
          >
            Découvrir les autres articles
          </Link>
        </div>
      </article>
    </main>
  );
}
