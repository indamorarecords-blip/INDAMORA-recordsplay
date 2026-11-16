import { useEffect, useState } from 'react';

import {
  getPendingSubmissions,
  getSubmissionMediaUrl,
  moderateSubmission,
  type AdminSubmission,
} from '../lib/submissionAdminApi';

export default function AdminModeration() {
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playingId, setPlayingId] = useState<number | null>(null);
  const [mediaUrls, setMediaUrls] = useState<Record<number, string>>({});
  const [processingId, setProcessingId] = useState<number | null>(null);

  async function loadSubmissions() {
    try {
      setLoading(true);
      setError('');

      const result = await getPendingSubmissions();
      setSubmissions(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de charger les soumissions.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSubmissions();
  }, []);

  async function openMedia(submission: AdminSubmission) {
    try {
      setPlayingId(submission.id);

      let url = mediaUrls[submission.id];

      if (!url) {
        const result = await getSubmissionMediaUrl(
          submission.media_object_path
        );

        url = result.mediaUrl;

        setMediaUrls((previous) => ({
          ...previous,
          [submission.id]: url,
        }));
      }

      return url;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de lire ce fichier.'
      );

      return null;
    }
  }

  async function handleModeration(
    submissionId: number,
    status: 'approved' | 'rejected'
  ) {
    const confirmed = window.confirm(
      status === 'approved'
        ? 'Confirmer la validation de cette soumission ?'
        : 'Confirmer le refus de cette soumission ?'
    );

    if (!confirmed) return;

    try {
      setProcessingId(submissionId);
      setError('');

      await moderateSubmission(submissionId, status);

      setSubmissions((previous) =>
        previous.filter((item) => item.id !== submissionId)
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'La modération a échoué.'
      );
    } finally {
      setProcessingId(null);
    }
  }

  if (loading) {
    return <div className="p-8">Chargement des soumissions...</div>;
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-6xl mx-auto">

        <header className="flex flex-wrap justify-between items-center gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold">
              INDAMORA PLAY
            </h1>

            <p className="text-gray-400 mt-2">
              Modération des soumissions artistes
            </p>
          </div>

          <button
            onClick={() => void loadSubmissions()}
            className="rounded-lg bg-gray-800 px-5 py-3 hover:bg-gray-700"
          >
            Actualiser
          </button>
        </header>

        <section className="mb-8 rounded-xl bg-gray-900 p-6">
          <p className="text-gray-400">
            Soumissions en attente
          </p>

          <p className="text-4xl font-bold mt-2">
            {submissions.length}
          </p>
        </section>

        {error && (
          <div className="mb-6 rounded-lg border border-red-700 bg-red-950 p-4 text-red-200">
            {error}
          </div>
        )}

        {submissions.length === 0 ? (
          <div className="rounded-xl bg-gray-900 p-10 text-center text-gray-400">
            Aucune soumission en attente.
          </div>
        ) : (
          <div className="space-y-5">
            {submissions.map((submission) => (
              <article
                key={submission.id}
                className="rounded-xl border border-gray-800 bg-gray-900 p-6"
              >
                <div className="flex flex-wrap justify-between gap-4">

                  <div>
                    <h2 className="text-xl font-semibold">
                      {submission.title}
                    </h2>

                    <p className="text-gray-300 mt-1">
                      {submission.artist}
                    </p>

                    <p className="text-sm text-gray-500 mt-2">
                      {submission.category} · {submission.media_type}
                    </p>

                    <p className="text-xs text-gray-500 mt-2">
                      Reçu le{' '}
                      {new Date(
                        submission.submitted_at
                      ).toLocaleString('fr-FR')}
                    </p>
                  </div>

                  <span className="h-fit rounded-full bg-yellow-900 px-3 py-1 text-sm text-yellow-200">
                    En attente
                  </span>

                </div>

                <div className="mt-6 flex flex-wrap gap-3">

                  <button
                    onClick={async () => {
                      const url = await openMedia(submission);

                      if (url) {
                        window.open(
                          url,
                          '_blank',
                          'noopener,noreferrer'
                        );
                      }
                    }}
                    disabled={playingId === submission.id}
                    className="rounded-lg bg-blue-700 px-5 py-3 hover:bg-blue-600 disabled:opacity-50"
                  >
                    Écouter / Voir le média
                  </button>

                  <button
                    onClick={() =>
                      void handleModeration(
                        submission.id,
                        'approved'
                      )
                    }
                    disabled={processingId === submission.id}
                    className="rounded-lg bg-green-700 px-5 py-3 hover:bg-green-600 disabled:opacity-50"
                  >
                    Valider
                  </button>

                  <button
                    onClick={() =>
                      void handleModeration(
                        submission.id,
                        'rejected'
                      )
                    }
                    disabled={processingId === submission.id}
                    className="rounded-lg bg-red-700 px-5 py-3 hover:bg-red-600 disabled:opacity-50"
                  >
                    Refuser
                  </button>

                </div>
              </article>
            ))}
          </div>
        )}

      </div>
    </main>
  );
}
