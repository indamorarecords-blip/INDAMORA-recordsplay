import { SubmissionUploadError } from './supabaseSubmissionStorage';

const ALLOWED_STATUSES = ['approved', 'rejected'] as const;

export type ModerationStatus = typeof ALLOWED_STATUSES[number];

export async function updateSubmissionModeration(
  submissionId: number,
  status: ModerationStatus,
  adminId: string
) {
  if (!Number.isInteger(submissionId) || submissionId <= 0) {
    throw new SubmissionUploadError(
      'Identifiant de soumission invalide.',
      400
    );
  }

  if (!adminId) {
    throw new SubmissionUploadError(
      'Administrateur non authentifié.',
      401
    );
  }

  if (!ALLOWED_STATUSES.includes(status)) {
    throw new SubmissionUploadError(
      'Statut de modération invalide.',
      400
    );
  }

  const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new SubmissionUploadError(
      'Configuration Supabase manquante.',
      500
    );
  }

  const response = await fetch(
    `${url}/rest/v1/submissions?id=eq.${submissionId}&status=eq.pending`,
    {
      method: 'PATCH',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        status,
      }),
    }
  );

  if (!response.ok) {
    console.error(
      '[INDAMORA MODERATION]',
      response.status,
      await response.text().catch(() => '')
    );

    throw new SubmissionUploadError(
      'Impossible de mettre à jour la modération.',
      502
    );
  }

  const rows = await response.json() as Array<{ id: number }>;

  if (!rows.length) {
    throw new SubmissionUploadError(
      'Soumission introuvable ou déjà traitée.',
      404
    );
  }

  return {
    id: rows[0].id,
    status,
    moderatedBy: adminId,
  };
}
