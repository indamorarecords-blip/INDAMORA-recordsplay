export type GiftcardApiError = Error & {
  status?: number;
  data?: unknown;
};

export async function giftcardFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }

    const error = new Error(
      typeof data === 'object' &&
        data !== null &&
        'error' in data &&
        typeof data.error === 'string'
        ? data.error
        : `Erreur API (${response.status})`,
    ) as GiftcardApiError;
    error.status = response.status;
    error.data = data;
    throw error;
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }
  if (contentType.startsWith('text/')) {
    return (await response.text()) as T;
  }
  return (await response.blob()) as T;
}
