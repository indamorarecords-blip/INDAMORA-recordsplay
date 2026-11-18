export interface AdminSubmission {
  id: number;
  title: string;
  artist: string;
  category: string;
  submitted_at: string;
  status: string;
  owner_id: string;
  media_type: string;
  media_object_path: string;
  cover_object_path: string | null;
  duration: string | null;
}

async function adminRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || !result?.success) {
    throw new Error(
      result?.error || 'Erreur de communication avec le serveur.'
    );
  }

  return result as T;
}

export async function getPendingSubmissions() {
  const result = await adminRequest<{
    submissions: AdminSubmission[];
  }>('/api/submissions/pending');

  return result.submissions;
}

export async function getSubmissionMediaUrl(
  objectPath: string
) {
  return adminRequest<{
    mediaUrl: string;
    expiresIn: number;
  }>('/api/submissions/media-url', {
    method: 'POST',
    body: JSON.stringify({ objectPath }),
  });
}

export async function moderateSubmission(
  submissionId: number,
  status: 'approved' | 'rejected'
) {
  return adminRequest('/api/submissions/moderate', {
    method: 'PATCH',
    body: JSON.stringify({
      submissionId,
      status,
    }),
  });
}
