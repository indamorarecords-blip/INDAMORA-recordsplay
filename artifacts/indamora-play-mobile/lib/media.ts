const apiOrigin = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : '';

export function resolveMediaUrl(path?: string | null) {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/objects/')) return `${apiOrigin}/api/storage${path}`;
  return `${apiOrigin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    Music: 'Musique',
    Comedy: 'Humour',
    Cinema: 'Cinéma',
    Podcast: 'Podcasts',
    Podcasts: 'Podcasts',
    Musique: 'Musique',
    Humour: 'Humour',
  };
  return labels[value] ?? value;
}