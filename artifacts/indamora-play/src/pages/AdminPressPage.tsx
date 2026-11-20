import { useAuth } from "@clerk/clerk-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ChangeEvent,
} from "react";
import { uploadPressCover } from "../services/pressUpload";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Save,
  X,
  LoaderCircle,
  Newspaper,
  ImagePlus,
  Star,
  RefreshCw,
} from "lucide-react";
type ArticleStatus = "draft" | "published";
type PressArticle = {
  id: number;
  title: string | null;
  subtitle: string | null;
  category: string | null;
  cover_object_path: string | null;
  content: string | null;
  author: string | null;
  artist_id: number | null;
  is_featured: boolean;
  status: ArticleStatus;
  slug: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};
type ArticleForm = {
  title: string;
  subtitle: string;
  category: string;
  cover_object_path: string;
  content: string;
  author: string;
  is_featured: boolean;
  status: ArticleStatus;
};
const EMPTY_FORM: ArticleForm = {
  title: "",
  subtitle: "",
  category: "Actualités",
  cover_object_path: "",
  content: "",
  author: "INDAMORA PLAY",
  is_featured: false,
  status: "draft",
};
const API_BASE = "/api";
export default function AdminPressPage() {
  const { getToken } = useAuth();
  const [articles, setArticles] = useState<PressArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingArticle, setEditingArticle] =
    useState<PressArticle | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | ArticleStatus>("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const authenticatedFetch = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken();
      if (!token) {
        throw new Error(
          "Session administrateur introuvable. Reconnectez-vous."
        );
      }
      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${token}`);
      if (
        options.body &&
        !(options.body instanceof FormData) &&
        !headers.has("Content-Type")
      ) {
        headers.set("Content-Type", "application/json");
      }
      const response = await fetch(`${API_BASE}${url}`, {
        ...options,
        headers,
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          data.error || `Erreur serveur (${response.status}).`
        );
      }
      return data;
    },
    [getToken]
  );
  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authenticatedFetch(
        "/admin/press/articles",
        { method: "GET" }
      );
      setArticles(
        Array.isArray(data.articles) ? data.articles : []
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les articles."
      );
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);
  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);
  function openNewArticle() {
    setEditingArticle(null);
    setForm({ ...EMPTY_FORM });
    setError("");
    setSuccess("");
    setShowForm(true);
  }
  function openEditArticle(article: PressArticle) {
    setEditingArticle(article);
    setForm({
      title: article.title ?? "",
      subtitle: article.subtitle ?? "",
      category: article.category ?? "Actualités",
      cover_object_path: article.cover_object_path ?? "",
      content: article.content ?? "",
      author: article.author ?? "INDAMORA PLAY",
      is_featured: article.is_featured ?? false,
      status: article.status,
    });
    setError("");
    setSuccess("");
    setShowForm(true);
  }
  function closeForm() {
    if (saving || uploadingCover) return;
    setShowForm(false);
    setEditingArticle(null);
    setForm({ ...EMPTY_FORM });
  }
  function updateField<K extends keyof ArticleForm>(
    field: K,
    value: ArticleForm[K]
  ) {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  }
  async function handleSubmit(
    event: FormEvent,
    requestedStatus?: ArticleStatus
  ) {
    event.preventDefault();
    if (uploadingCover) {
      setError("Attendez la fin de l'envoi de la couverture.");
      return;
    }
    if (!form.title.trim()) {
      setError("Le titre de l'article est obligatoire.");
      return;
    }
    if (!form.content.trim()) {
      setError("Le contenu de l'article est obligatoire.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    const status = requestedStatus ?? form.status;
    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      category: form.category.trim() || null,
      cover_object_path: form.cover_object_path.trim() || null,
      content: form.content.trim(),
      author: form.author.trim() || "INDAMORA PLAY",
      is_featured: form.is_featured,
      status,
    };
    try {
      if (editingArticle) {
        await authenticatedFetch(
          `/admin/press/articles/${editingArticle.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
        setSuccess(
          status === "published"
            ? "Article publié avec succès."
            : "Article modifié et enregistré."
        );
      } else {
        await authenticatedFetch("/admin/press/articles", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSuccess(
          status === "published"
            ? "Article créé et publié."
            : "Brouillon enregistré avec succès."
        );
      }
      setShowForm(false);
      setEditingArticle(null);
      setForm({ ...EMPTY_FORM });
      await loadArticles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible d'enregistrer l'article."
      );
    } finally {
      setSaving(false);
    }
  }
  async function changeStatus(
    article: PressArticle,
    status: ArticleStatus
  ) {
    const confirmation =
      status === "published"
        ? "Voulez-vous publier cet article ?"
        : "Voulez-vous dépublier cet article ?";
    if (!window.confirm(confirmation)) return;
    setError("");
    setSuccess("");
    try {
      await authenticatedFetch(
        `/admin/press/articles/${article.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );
      setSuccess(
        status === "published"
          ? "Article publié."
          : "Article dépublié et enregistré en brouillon."
      );
      await loadArticles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de modifier le statut."
      );
    }
  }
  async function deleteArticle(article: PressArticle) {
    const confirmation = window.confirm(
      `Supprimer définitivement l'article « ${article.title} » ?\n\nCette action est irréversible.`
    );
    if (!confirmation) return;
    setDeletingId(article.id);
    setError("");
    setSuccess("");
    try {
      await authenticatedFetch(
        `/admin/press/articles/${article.id}`,
        { method: "DELETE" }
      );
      setSuccess("Article supprimé.");
      await loadArticles();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de supprimer l'article."
      );
    } finally {
      setDeletingId(null);
    }
  }
  async function handleCoverSelection(
    event: ChangeEvent<HTMLInputElement>
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Format accepté : JPG, PNG ou WebP.");
      input.value = "";
      return;
    }
    if (file.size === 0 || file.size > 10 * 1024 * 1024) {
      setError("La couverture doit peser entre 1 octet et 10 Mo.");
      input.value = "";
      return;
    }
    setUploadingCover(true);
    setError("");
    setSuccess("");
    try {
      const result = await uploadPressCover(file, getToken);
      setForm((previous) => ({
        ...previous,
        cover_object_path: result.objectPath,
      }));
      setSuccess("Couverture envoyée et confirmée avec succès.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Erreur lors de l'envoi de la couverture."
      );
    } finally {
      setUploadingCover(false);
      input.value = "";
    }
  }
  const filteredArticles = articles.filter((article) => {
    const matchesSearch = [
      article.title,
      article.subtitle,
      article.category,
      article.author,
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesStatus =
      filter === "all" || article.status === filter;
    return matchesSearch && matchesStatus;
  });
  const publishedCount = articles.filter(
    (article) => article.status === "published"
  ).length;
  const draftCount = articles.filter(
    (article) => article.status === "draft"
  ).length;
  function formatDate(value: string | null) {
    if (!value) return "Non publié";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Date inconnue";
    }
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
  return (
    <main className="space-y-6">
      <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Newspaper size={25} />
            <span className="text-sm font-bold uppercase tracking-widest">
              INDAMORA PLAY
            </span>
          </div>
          <h1 className="text-3xl font-black tracking-tight">
            Gestion de la presse
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gérez vos actualités, articles et publications.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void loadArticles()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            <RefreshCw size={17} />
            Actualiser
          </button>
          <button
            type="button"
            onClick={openNewArticle}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus size={18} />
            Nouvel article
          </button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-3 font-bold underline"
          >
            Fermer
          </button>
        </div>
      )}
      {success && (
        <div
          role="status"
          className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800"
        >
          {success}
        </div>
      )}
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Total des articles
          </p>
          <p className="mt-2 text-3xl font-black">
            {articles.length}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Articles publiés
          </p>
          <p className="mt-2 text-3xl font-black text-green-600">
            {publishedCount}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Brouillons
          </p>
          <p className="mt-2 text-3xl font-black text-amber-600">
            {draftCount}
          </p>
        </div>
      </section>
      {showForm && (
        <section className="rounded-xl border bg-card p-5 shadow-sm md:p-8">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">
                {editingArticle
                  ? "Modifier l'article"
                  : "Créer un nouvel article"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Rédigez et gérez votre publication.
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              disabled={saving || uploadingCover}
              className="rounded-lg border p-2 hover:bg-muted"
              aria-label="Fermer le formulaire"
            >
              <X size={20} />
            </button>
          </div>
          <form
            id="press-article-form"
            onSubmit={(event) => handleSubmit(event)}
            className="space-y-5"
          >
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold">
                  Titre de l'article *
                </label>
                <input
                  required
                  value={form.title}
                  onChange={(event) =>
                    updateField("title", event.target.value)
                  }
                  placeholder="Ex. : Gelio TK dévoile son nouveau single"
                  className="w-full rounded-lg border bg-background px-4 py-3 outline-none focus:border-primary"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold">
                  Sous-titre
                </label>
                <input
                  value={form.subtitle}
                  onChange={(event) =>
                    updateField("subtitle", event.target.value)
                  }
                  placeholder="Une courte présentation de l'article"
                  className="w-full rounded-lg border bg-background px-4 py-3 outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Catégorie
                </label>
                <select
                  value={form.category}
                  onChange={(event) =>
                    updateField("category", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-4 py-3"
                >
                  <option value="Actualités">Actualités</option>
                  <option value="Musique">Musique</option>
                  <option value="Interviews">Interviews</option>
                  <option value="Portraits">Portraits</option>
                  <option value="Événements">Événements</option>
                  <option value="Culture">Culture</option>
                  <option value="Communiqués">Communiqués</option>
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold">
                  Auteur
                </label>
                <input
                  value={form.author}
                  onChange={(event) =>
                    updateField("author", event.target.value)
                  }
                  className="w-full rounded-lg border bg-background px-4 py-3"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold">
                  Couverture de l'article
                </label>
                <div className="rounded-lg border border-dashed p-5">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    {uploadingCover ? (
                      <LoaderCircle
                        size={30}
                        className="animate-spin text-primary"
                      />
                    ) : (
                      <ImagePlus size={30} className="text-primary" />
                    )}
                    <span className="font-semibold">
                      {uploadingCover
                        ? "Envoi de la couverture en cours..."
                        : "Sélectionner une image"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      JPG, PNG ou WebP — 10 Mo maximum
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleCoverSelection}
                      disabled={uploadingCover || saving}
                      className="hidden"
                    />
                  </label>
                  {form.cover_object_path && (
                    <p className="mt-3 break-all text-xs text-green-700">
                      Couverture enregistrée : {form.cover_object_path}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {uploadingCover
                      ? "Veuillez patienter pendant l'envoi."
                      : "La couverture sera envoyée vers Supabase Storage."}
                  </p>
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold">
                  Contenu de l'article *
                </label>
                <textarea
                  required
                  rows={14}
                  value={form.content}
                  onChange={(event) =>
                    updateField("content", event.target.value)
                  }
                  placeholder="Rédigez votre article ici..."
                  className="w-full resize-y rounded-lg border bg-background px-4 py-3 leading-7 outline-none focus:border-primary"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Vous pouvez rédiger votre texte avec des paragraphes.
                </p>
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4">
              <input
                type="checkbox"
                checked={form.is_featured}
                onChange={(event) =>
                  updateField("is_featured", event.target.checked)
                }
                className="h-4 w-4"
              />
              <span className="flex items-center gap-2 text-sm font-semibold">
                <Star size={17} />
                Mettre cet article en avant
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-3 border-t pt-5">
              <button
                type="button"
                onClick={closeForm}
                disabled={saving || uploadingCover}
                className="rounded-lg border px-5 py-3 text-sm font-semibold hover:bg-muted"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={saving || uploadingCover}
                onClick={() => {
                  const formElement = document.getElementById(
                    "press-article-form"
                  ) as HTMLFormElement | null;
                  if (formElement?.reportValidity()) {
                    void handleSubmit(
                      {
                        preventDefault: () => {},
                      } as FormEvent<HTMLFormElement>,
                      "draft"
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Save size={17} />
                )}
                Enregistrer en brouillon
              </button>
              <button
                type="button"
                disabled={saving || uploadingCover}
                onClick={() => {
                  const formElement = document.getElementById(
                    "press-article-form"
                  ) as HTMLFormElement | null;
                  if (formElement?.reportValidity()) {
                    void handleSubmit(
                      {
                        preventDefault: () => {},
                      } as FormEvent<HTMLFormElement>,
                      "published"
                    );
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <LoaderCircle size={17} className="animate-spin" />
                ) : (
                  <Eye size={17} />
                )}
                Publier
              </button>
            </div>
          </form>
        </section>
      )}
      <section className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher un article..."
            className="w-full rounded-lg border bg-card py-3 pl-10 pr-4"
          />
        </div>
        <select
          value={filter}
          onChange={(event) =>
            setFilter(event.target.value as typeof filter)
          }
          className="rounded-lg border bg-card px-4 py-3"
        >
          <option value="all">Tous les articles</option>
          <option value="published">Publiés</option>
          <option value="draft">Brouillons</option>
        </select>
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b p-5">
          <h2 className="font-bold">
            Articles ({filteredArticles.length})
          </h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-3 p-12 text-muted-foreground">
            <LoaderCircle className="animate-spin" size={22} />
            Chargement des articles...
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="p-12 text-center">
            <Newspaper
              size={42}
              className="mx-auto mb-4 text-muted-foreground"
            />
            <p className="font-semibold">
              Aucun article trouvé
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Créez votre premier article pour commencer.
            </p>
            <button
              type="button"
              onClick={openNewArticle}
              className="mt-5 rounded-lg bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
            >
              <Plus size={16} className="mr-2 inline" />
              Nouvel article
            </button>
          </div>
        ) : (
          <div className="divide-y">
            {filteredArticles.map((article) => (
              <article
                key={article.id}
                className="flex flex-col justify-between gap-4 p-5 md:flex-row md:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        article.status === "published"
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {article.status === "published"
                        ? "Publié"
                        : "Brouillon"}
                    </span>
                    {article.is_featured && (
                      <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
                        <Star size={12} />
                        À la une
                      </span>
                    )}
                    {article.category && (
                      <span className="rounded-full bg-muted px-3 py-1 text-xs">
                        {article.category}
                      </span>
                    )}
                  </div>
                  <h3 className="truncate text-lg font-bold">
                    {article.title || "Sans titre"}
                  </h3>
                  {article.subtitle && (
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {article.subtitle}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {article.author || "INDAMORA PLAY"}
                    {" · "}
                    {formatDate(
                      article.published_at || article.created_at
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditArticle(article)}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    <Edit size={16} />
                    Modifier
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void changeStatus(
                        article,
                        article.status === "published"
                          ? "draft"
                          : "published"
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    {article.status === "published" ? (
                      <>
                        <EyeOff size={16} />
                        Dépublier
                      </>
                    ) : (
                      <>
                        <Eye size={16} />
                        Publier
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteArticle(article)}
                    disabled={deletingId === article.id}
                    className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === article.id ? (
                      <LoaderCircle
                        size={16}
                        className="animate-spin"
                      />
                    ) : (
                      <Trash2 size={16} />
                    )}
                    Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
