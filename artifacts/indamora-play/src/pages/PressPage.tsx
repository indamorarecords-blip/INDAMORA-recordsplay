import { useEffect, useState } from "react";
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
const categories = [
  "À la une",
  "Actualités",
  "Portraits",
  "Interviews",
  "Sorties musicales",
  "Culture & Patrimoine",
  "Événements",
];
export default function PressPage() {
  const [articles, setArticles] = useState<PressArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/press/articles")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Impossible de charger les articles.");
        }
        return response.json();
      })
      .then((data) => {
        if (active) {
          setArticles(data.articles ?? []);
        }
      })
      .catch(() => {
        if (active) {
          setError("La rubrique Presse est momentanément indisponible.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const featured = articles.find((article) => article.is_featured);
  const latest = articles.filter((article) => article.id !== featured?.id);
  return (
    <main className="min-h-screen bg-white text-neutral-900">
      <header className="border-b px-6 py-12">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em]">
            INDAMORA PLAY
          </p>
          <h1 className="mt-3 text-4xl font-bold md:text-6xl">
            PRESSE
          </h1>
          <p className="mt-4 max-w-2xl text-neutral-600">
            L’actualité musicale et culturelle centrafricaine.
          </p>
        </div>
      </header>
      <nav className="mx-auto flex max-w-6xl flex-wrap gap-3 px-6 py-6">
        {categories.map((category) => (
          <a
            key={category}
            href={`#${category}`}
            className="rounded-full border px-4 py-2 text-sm hover:bg-neutral-100"
          >
            {category}
          </a>
        ))}
      </nav>
      <section className="mx-auto max-w-6xl px-6 py-8">
        {loading && <p>Chargement des articles...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && articles.length === 0 && (
          <p className="py-12 text-neutral-500">
            Les premiers articles de notre rédaction arrivent bientôt.
          </p>
        )}
        {featured && (
          <article className="mb-12 overflow-hidden rounded-2xl border">
            {featured.cover_object_path && (
              <img
                src={featured.cover_object_path}
                alt={featured.title ?? "Article à la une"}
                className="h-72 w-full object-cover"
              />
            )}
            <div className="p-6">
              <span className="text-sm font-semibold uppercase">
                À LA UNE
              </span>
              <h2 className="mt-3 text-3xl font-bold">
                {featured.title}
              </h2>
              <p className="mt-3 text-neutral-600">
                {featured.subtitle}
              </p>
              {featured.slug && (
                <a
                  href={`/presse/${encodeURIComponent(featured.slug)}`}
                  className="mt-5 inline-block font-semibold underline"
                >
                  Lire l'article
                </a>
              )}
            </div>
          </article>
        )}
        {categories.slice(1).map((category) => {
          const categoryArticles = latest.filter(
            (article) => article.category === category
          );
          if (!categoryArticles.length) return null;
          return (
            <section
              key={category}
              id={category}
              className="mb-12"
            >
              <h2 className="mb-5 border-b pb-3 text-2xl font-bold">
                {category}
              </h2>
              <div className="grid gap-6 md:grid-cols-3">
                {categoryArticles.map((article) => (
                  <article
                    key={article.id}
                    className="overflow-hidden rounded-xl border"
                  >
                    {article.cover_object_path && (
                      <img
                        src={article.cover_object_path}
                        alt={article.title ?? ""}
                        className="h-48 w-full object-cover"
                      />
                    )}
                    <div className="p-5">
                      <p className="text-xs uppercase text-neutral-500">
                        {article.category}
                      </p>
                      <h3 className="mt-2 text-xl font-bold">
                        {article.title}
                      </h3>
                      <p className="mt-2 text-sm text-neutral-600">
                        {article.subtitle}
                      </p>
                      {article.slug && (
                        <a
                          href={`/presse/${encodeURIComponent(article.slug)}`}
                          className="mt-4 inline-block font-semibold underline"
                        >
                          Lire la suite
                        </a>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </section>
    </main>
  );
}
