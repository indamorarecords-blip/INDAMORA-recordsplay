import { useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  getGetArtistQueryKey,
  getGetWorkQueryKey,
  useGetArtist,
  useGetWork,
} from '@workspace/api-client-react';
import type { Artist, Work } from '@workspace/api-client-react';

const siteUrl = 'https://indamoraplay.com';
const defaultImage = `${siteUrl}/assets/indamora-play-logo.png`;

type SeoMetadata = {
  title: string;
  description: string;
  canonicalPath: string;
  robots: string;
  image?: string;
};

const categoryLabels: Record<string, string> = {
  musique: 'Musique',
  humour: 'Humour',
  cinema: 'Cinéma et vidéos',
  podcasts: 'Podcasts',
  'autres-creations': 'Autres créations',
};

const publicRouteMetadata: Record<string, Omit<SeoMetadata, 'canonicalPath' | 'robots'>> = {
  '/': {
    title: 'INDAMORA PLAY — Musique centrafricaine, artistes et talents',
    description: 'INDAMORA PLAY, une plateforme de INDAMORA RECORDS pour découvrir les artistes, les œuvres et les talents de Centrafrique, de la diaspora et du monde entier.',
  },
  '/indamora-records': {
    title: 'INDAMORA RECORDS — Écosystème créatif et talents',
    description: 'INDAMORA RECORDS est l’écosystème parent d’INDAMORA PLAY, dédié à la création, la production, la promotion et au développement des talents.',
  },
  '/explorer': {
    title: 'Explorer — Musique, créations et talents | INDAMORA PLAY',
    description: 'Explorez les œuvres publiques validées par INDAMORA RECORDS : musique, humour, cinéma, podcasts et créations de Centrafrique et de la diaspora.',
  },
  '/repertoire': {
    title: 'Répertoire — Artistes et talents de Centrafrique | INDAMORA PLAY',
    description: 'Découvrez le RÉPERTOIRE public d’INDAMORA PLAY : artistes, créateurs, partenaires et médias de Bangui, de Centrafrique et de la diaspora.',
  },
  '/artists': {
    title: 'Répertoire — Artistes et talents de Centrafrique | INDAMORA PLAY',
    description: 'Découvrez les profils publics du RÉPERTOIRE INDAMORA PLAY et les talents de Centrafrique, de Bangui et de la diaspora.',
  },
  '/presse': {
    title: 'Presse et médias — INDAMORA PLAY',
    description: 'L’espace presse d’INDAMORA PLAY reçoit les demandes des journalistes, radios, télévisions et médias qui suivent les talents et créations d’Afrique centrale.',
  },
  '/pricing': {
    title: 'Premium — Soutenir INDAMORA PLAY',
    description: 'Découvrez les formules Premium d’INDAMORA PLAY et les moyens de contribuer au développement de la plateforme et à la promotion des artistes.',
  },
  '/soutenir': {
    title: 'Soutenir INDAMORA — Dons et projets culturels',
    description: 'Soutenez INDAMORA PLAY, les artistes indépendants et les projets culturels de l’écosystème INDAMORA par une contribution sécurisée.',
  },
};

function absoluteAssetUrl(path?: string | null) {
  if (!path) return defaultImage;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/objects/')) return `${siteUrl}/api/storage${path}`;
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.rel = 'canonical';
    document.head.appendChild(element);
  }
  element.href = href;
}

function genericMetadata(pathname: string): SeoMetadata {
  const categoryMatch = pathname.match(/^\/categorie\/([^/]+)$/);
  if (categoryMatch) {
    const slug = decodeURIComponent(categoryMatch[1]);
    const label = categoryLabels[slug] ?? 'Créations';
    return {
      title: `${label} — Œuvres publiques | INDAMORA PLAY`,
      description: `Découvrez les œuvres publiques de la catégorie ${label} sur INDAMORA PLAY, la plateforme musicale de INDAMORA RECORDS.`,
      canonicalPath: `/categorie/${encodeURIComponent(slug)}`,
      robots: 'index,follow',
    };
  }

  if (pathname === '/recherche') {
    return {
      title: 'Recherche — Artistes et œuvres | INDAMORA PLAY',
      description: 'Recherchez un artiste, une œuvre ou une catégorie dans le catalogue public d’INDAMORA PLAY.',
      canonicalPath: pathname,
      robots: 'noindex,follow',
    };
  }

  if (pathname.startsWith('/profil') || pathname.startsWith('/espace-artiste') || pathname.startsWith('/submit') ||
      pathname.startsWith('/moderation') || pathname.startsWith('/administration') || pathname === '/admin' ||
      pathname.startsWith('/sign-in') || pathname.startsWith('/sign-up') || pathname === '/login' ||
      pathname === '/inscription') {
    return {
      title: 'Espace privé — INDAMORA PLAY',
      description: 'Espace privé INDAMORA PLAY réservé aux comptes authentifiés.',
      canonicalPath: pathname,
      robots: 'noindex,nofollow',
    };
  }

  return {
    title: 'Page introuvable — INDAMORA PLAY',
    description: 'Cette page n’existe pas dans INDAMORA PLAY.',
    canonicalPath: pathname,
    robots: 'noindex,follow',
  };
}

function artistMetadata(artist: Artist): SeoMetadata {
  const activity = artist.subcategory || artist.category;
  const location = [artist.location, artist.country].filter(Boolean).join(', ');
  const description = `${artist.name}, ${activity}${location ? ` à ${location}` : ''}. ${artist.bio}`.slice(0, 160);
  return {
    title: `${artist.name} — ${activity} | INDAMORA PLAY`,
    description,
    canonicalPath: `/artists/${artist.id}`,
    robots: 'index,follow',
    image: artist.avatar ?? undefined,
  };
}

function workMetadata(work: Work): SeoMetadata {
  return {
    title: `${work.title} — ${work.artist} | INDAMORA PLAY`,
    description: `${work.description} Découvrez cette œuvre publique de ${work.artist} sur INDAMORA PLAY.`.slice(0, 160),
    canonicalPath: `/oeuvres/${work.id}`,
    robots: 'index,follow',
    image: work.coverObjectPath || work.image,
  };
}

export function SeoHead() {
  const [location] = useLocation();
  const pathname = location.split('?')[0] || '/';
  const artistMatch = pathname.match(/^\/artists\/(\d+)$/);
  const workMatch = pathname.match(/^\/oeuvres\/(\d+)$/);
  const artistId = artistMatch ? Number(artistMatch[1]) : 0;
  const workId = workMatch ? Number(workMatch[1]) : 0;
  const artistQuery = useGetArtist(artistId, {
    query: {
      enabled: Boolean(artistId),
      queryKey: getGetArtistQueryKey(artistId),
    },
  });
  const workQuery = useGetWork(workId, {
    query: {
      enabled: Boolean(workId),
      queryKey: getGetWorkQueryKey(workId),
    },
  });

  useEffect(() => {
    let metadata = genericMetadata(pathname);
    if (pathname === '/artists') metadata = { ...genericMetadata('/repertoire'), canonicalPath: '/repertoire' };
    const artist = artistQuery.data;
    const work = workQuery.data;
    if (artist) metadata = artistMetadata(artist);
    if (work) metadata = workMetadata(work);

    const canonical = `${siteUrl}${metadata.canonicalPath === '/' ? '' : metadata.canonicalPath}`;
    const image = absoluteAssetUrl(metadata.image);
    document.title = metadata.title;
    upsertMeta('name', 'description', metadata.description);
    upsertMeta('name', 'robots', metadata.robots);
    upsertMeta('property', 'og:title', metadata.title);
    upsertMeta('property', 'og:description', metadata.description);
    upsertMeta('property', 'og:image', image);
    upsertMeta('property', 'og:url', canonical);
    upsertMeta('property', 'og:type', 'website');
    upsertMeta('property', 'og:site_name', 'INDAMORA PLAY');
    upsertMeta('property', 'og:locale', 'fr_FR');
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', metadata.title);
    upsertMeta('name', 'twitter:description', metadata.description);
    upsertMeta('name', 'twitter:image', image);
    upsertCanonical(canonical);
  }, [artistQuery.data, pathname, workQuery.data]);

  return null;
}