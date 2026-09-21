import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { frFR } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import {
  ArrowRight, AudioLines, BarChart3, Check, ChevronLeft, CirclePlay, Crown, Disc3,
  FileMusic, Headphones, HeartHandshake, History, LayoutDashboard, LoaderCircle, LockKeyhole, Menu, Mic2,
  Pause, Play, Plus, Search, Send, ShieldCheck, Sparkles, Star, Ticket, UserRound,
  UsersRound, Video, X, Zap, Globe, Mail, Newspaper, Briefcase, ExternalLink, MapPin, Trash2, Radio, Palette, Award, Camera, Megaphone, HandHeart
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  getGetArtistQueryKey, getGetArtistsQueryKey, getGetCatalogQueryKey, getGetSubmissionsQueryKey,
  getGetMyArtistQueryKey, getGetWorkQueryKey, useCreateArtist, useCreateSubmission, useGetArtist, useGetArtists,
  useGetCatalog, useGetSubmissions, useGetWork, useUpdateSubmissionStatus, useCreatePressRequest,
  useDeleteSubmissionFiles, useGetMyArtist, useUpdateArtist
} from '@workspace/api-client-react';
import type { Artist, Submission, Work } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const ADMIN_EMAIL = 'indamorarecords@gmail.com';
const categories = ['Musique', 'Humour', 'Cinéma et vidéos', 'Podcasts', 'Autres créations'];
const creationActivities = [
  ['Artiste / chanteur', '🎤'],
  ['Gospel / chantre', '🙏'],
  ['Producteur', '🎚️'],
  ['DJ', '🎧'],
  ['Animateur', '🎙️'],
  ['Maître de cérémonie', '🎤'],
  ['Speaker', '🎙️'],
  ['Danseur / danseuse', '💃'],
  ['Cinéma / acteur / réalisateur', '🎬'],
  ['Vidéaste', '🎥'],
  ['Créateur de contenu', '📱'],
  ['Influenceur', '⭐'],
  ['Auteur / compositeur', '✍️'],
  ['Photographe', '📷'],
  ['Humoriste', '🎭'],
  ['Podcasteur', '🎙️'],
  ['Journaliste', '📰'],
  ['Radio', '📻'],
  ['Télévision', '📺'],
  ['Média en ligne', '🌐'],
  ['Association', '🤝'],
  ['Label', '🎵'],
  ['Organisateur', '🎤'],
  ['Événementiel', '🎪'],
  ['Partenaire culturel', '🌍'],
] as const;
const categoryIcons = { Musique: AudioLines, Humour: Sparkles, 'Cinéma et vidéos': Disc3, Podcasts: Mic2, 'Autres créations': Sparkles };
const categoryLabels: Record<string, string> = {
  Music: 'Musique',
  Comedy: 'Humour',
  Cinema: 'Cinéma et vidéos',
  Podcast: 'Podcasts',
  Podcasts: 'Podcasts',
  Musique: 'Musique',
  Humour: 'Humour',
  Cinéma: 'Cinéma et vidéos',
  'Other creations': 'Autres créations',
  'Autres créations': 'Autres créations',
};
const categoryLabel = (value: string) => categoryLabels[value] ?? value;
const categorySlug: Record<string, string> = {
  Musique: 'musique',
  Humour: 'humour',
  'Cinéma et vidéos': 'cinema',
  Podcasts: 'podcasts',
  'Autres créations': 'autres-creations',
};
const categoryFromSlug: Record<string, string> = Object.fromEntries(Object.entries(categorySlug).map(([label, slug]) => [slug, label]));
const isCategory = (value: string, selected: string) => categoryLabel(value) === categoryLabel(selected);

function profileGroupForActivities(activities: string[]): Artist['profileGroup'] {
  const text = activities.join(' ').toLowerCase();
  if (['journaliste', 'radio', 'télévision', 'média'].some((term) => text.includes(term))) return 'press';
  if (['association', 'label', 'organisateur', 'événementiel', 'partenaire culturel'].some((term) => text.includes(term))) return 'partners';
  if (['danseur', 'cinéma', 'acteur', 'réalisateur', 'vidéaste', 'humoriste', 'podcast', 'créateur de contenu', 'influenceur', 'photographe'].some((term) => text.includes(term))) return 'creations';
  return 'artists';
}

function professionalSpaceCopy(profile: Artist) {
  const text = profile.specialties.join(' ').toLowerCase();
  if (profile.profileGroup === 'press') {
    return {
      eyebrow: 'Espace professionnel / média',
      title: 'Mon espace professionnel / média',
      description: 'Gérez votre présentation professionnelle et votre visibilité dans le RÉPERTOIRE.',
    };
  }
  if (['vidéaste', 'créateur de contenu', 'photographe', 'cinéma'].some((term) => text.includes(term))) {
    return {
      eyebrow: 'Espace créateur / média',
      title: 'Mon espace créateur / média',
      description: 'Présentez vos contenus, suivez vos propositions et développez votre visibilité.',
    };
  }
  if (profile.profileGroup === 'creations') {
    return {
      eyebrow: 'Espace créateur',
      title: 'Mon espace créateur',
      description: 'Présentez votre parcours, vos créations et les propositions envoyées à INDAMORA RECORDS.',
    };
  }
  if (profile.profileGroup === 'partners') {
    return {
      eyebrow: 'Espace professionnel',
      title: 'Mon espace professionnel',
      description: 'Gérez votre présentation et votre présence professionnelle dans l’écosystème INDAMORA.',
    };
  }
  return {
    eyebrow: 'Espace artiste',
    title: 'Mon espace artiste',
    description: 'Envoyez vos œuvres à INDAMORA RECORDS et suivez chaque étape de leur examen.',
  };
}

function canSubmitWorks(profile?: Artist | null) {
  if (!profile?.specialties.length) return false;
  if (profile.profileGroup === 'artists' || profile.profileGroup === 'creations') return true;
  return profile.specialties.some((activity) =>
    ['producteur', 'danseur', 'créateur', 'vidéaste', 'humoriste', 'podcast'].some((term) =>
      activity.toLowerCase().includes(term),
    ),
  );
}

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
function isAdminEmail(email?: string | null) {
  return email?.toLowerCase() === ADMIN_EMAIL;
}
type ClerkUser = ReturnType<typeof useUser>['user'];
function isAdminUser(user: ClerkUser) {
  const emailVerified = user?.primaryEmailAddress?.verification?.status === 'verified';
  return Boolean(emailVerified && (isAdminEmail(user?.primaryEmailAddress?.emailAddress) || user?.publicMetadata?.role === 'admin'));
}
const storageUrl = (path?: string | null) => path ? `/api/storage${path}` : undefined;
type BillingStatus = {
  status: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    priceId: string | null;
  } | null;
};
type AdminOverview = {
  periodDays: number;
  visits: { count: number; uniqueVisitors: number; topPages: Array<{ path: string; visits: number }> };
  counts: {
    users: number | null;
    artists: number;
    publishedArtists: number;
    works: number;
    submissions: number;
    pendingSubmissions: number;
    pendingPressRequests: number;
    linkedBillingAccounts: number;
  };
  stripe: {
    connected: boolean;
    activeSubscriptions: number | null;
    canceledSubscriptions: number | null;
    donations: { count: number | null; totalEur: number | null };
  };
  activity: Array<{ type: string; label: string; createdAt: string }>;
  auditLog: Array<{
    id: number;
    administratorId: string;
    action: string;
    entityType: string;
    entityId: string | null;
    targetLabel: string | null;
    result: string;
    createdAt: string;
  }>;
};
async function billingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const body = await response.json().catch(() => null) as { error?: string } | T | null;
  if (!response.ok) throw new Error((body && typeof body === 'object' && 'error' in body ? body.error : undefined) ?? 'Opération de paiement impossible.');
  return body as T;
}
function checkoutStatusMessage() {
  const value = new URLSearchParams(window.location.search).get('checkout');
  return value === 'success' ? 'Votre paiement a été confirmé par Stripe. Le statut Premium sera actualisé après le retour du webhook.' : value === 'cancelled' ? 'Le paiement a été annulé. Aucun débit confirmé n’est affiché ici.' : null;
}
async function uploadAsset(file: File, onProgress: (value: number) => void) {
  const response = await fetch('/api/storage/uploads/request-url', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Upload impossible.');
  const { uploadURL, objectPath } = await response.json() as { uploadURL: string; objectPath: string };
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadURL);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('Le téléversement a échoué.'));
    xhr.onerror = () => reject(new Error('Le téléversement a échoué.'));
    xhr.send(file);
  });
  const completed = await fetch('/api/storage/uploads/complete', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectPath }),
  });
  if (!completed.ok) throw new Error('Le fichier téléversé n’a pas pu être finalisé.');
  return objectPath;
}
async function cleanupUploadedAssets(paths: string[]) {
  await Promise.allSettled([...new Set(paths)].map((path) => fetch(`/api/storage${path}`, {
    method: 'DELETE',
    credentials: 'include',
  })));
}
async function extractMediaDuration(file: File): Promise<string | undefined> {
  const objectUrl = URL.createObjectURL(file);
  const media = document.createElement(file.type.startsWith('video/') ? 'video' : 'audio');
  media.preload = 'metadata';
  return new Promise((resolve) => {
    const finish = (duration?: number) => {
      window.clearTimeout(timeout);
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(objectUrl);
      if (!duration || !Number.isFinite(duration) || duration <= 0) {
        resolve(undefined);
        return;
      }
      const seconds = Math.round(duration);
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remaining = seconds % 60;
      resolve(hours > 0
        ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
        : `${minutes}:${String(remaining).padStart(2, '0')}`);
    };
    const timeout = window.setTimeout(() => finish(), 10000);
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish();
    media.src = objectUrl;
  });
}
const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/assets/indamora-play-logo.png`,
  },
  variables: {
    colorPrimary: '#d9573f',
    colorForeground: '#29251f',
    colorMutedForeground: '#736d62',
    colorDanger: '#b53a32',
    colorBackground: '#fffaf0',
    colorInput: '#fffaf0',
    colorInputForeground: '#29251f',
    colorNeutral: '#d9cdbd',
    fontFamily: 'Manrope, sans-serif',
    borderRadius: '1rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffaf0] rounded-2xl w-[440px] max-w-full overflow-hidden',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#29251f]',
    headerSubtitle: 'text-[#736d62]',
    socialButtonsBlockButtonText: 'text-[#29251f]',
    formFieldLabel: 'text-[#29251f]',
    footerActionLink: 'text-[#d9573f]',
    footerActionText: 'text-[#736d62]',
    dividerText: 'text-[#736d62]',
    formFieldInput: 'bg-[#fffaf0] text-[#29251f] border-[#d9cdbd]',
    formButtonPrimary: 'bg-[#d9573f] text-white',
  },
};

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function Logo({ variant = 'compact', className = '' }: { variant?: 'compact' | 'full' | 'mark'; className?: string }) {
  if (variant === 'full') {
    return <img src={assetUrl('assets/indamora-play-logo.png')} alt="INDAMORA PLAY — Notre musique. Notre culture. Notre scène." className={cx('h-auto w-full mix-blend-multiply', className)} data-testid="img-official-logo" />;
  }
  if (variant === 'mark') {
    return <img src={assetUrl('assets/indamora-play-mark.png')} alt="" className={cx('h-10 w-12 object-contain mix-blend-multiply', className)} aria-hidden="true" data-testid="img-official-mark" />;
  }
  return <span className={cx('inline-flex items-center gap-2', className)} aria-label="INDAMORA PLAY">
    <img src={assetUrl('assets/indamora-play-mark.png')} alt="" className="h-9 w-10 object-contain mix-blend-multiply" aria-hidden="true" data-testid="img-official-mark" />
    <span className="display text-[1.35rem] font-bold tracking-tight">INDAMORA <span className="text-primary">PLAY</span></span>
  </span>;
}

function Avatar({ name, src, size = 'md' }: { name: string; src?: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const resolvedSrc = src?.startsWith('/objects/') ? storageUrl(src) : src;
  return resolvedSrc ? (
    <img src={resolvedSrc} alt={name} className={cx('rounded-full object-cover ring-2 ring-background', size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-24 w-24' : 'h-12 w-12')} data-testid={`img-avatar-${name}`} />
  ) : (
    <div className={cx('rounded-full bg-secondary text-primary-foreground flex items-center justify-center font-bold ring-2 ring-background', size === 'sm' ? 'h-9 w-9 text-xs' : size === 'lg' ? 'h-24 w-24 text-2xl' : 'h-12 w-12')} data-testid={`avatar-${name}`}>
      {initials}
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const isAdmin = isAdminUser(user);
  const myArtist = useGetMyArtist({ query: { enabled: Boolean(isSignedIn), queryKey: getGetMyArtistQueryKey() } });
  const professionalProfile = myArtist.data?.specialties.length ? myArtist.data : null;
  const canSubmit = canSubmitWorks(professionalProfile);
  const nav = [
    { href: '/', label: 'Accueil', icon: Sparkles },
    { href: '/explorer', label: 'Explorer', icon: CirclePlay },
    { href: '/repertoire', label: 'Répertoire', icon: UsersRound },
    { href: '/pricing', label: 'Premium', icon: Crown },
    { href: '/soutenir', label: 'Soutenir', icon: HeartHandshake },
    ...(isAdmin ? [{ href: '/administration', label: 'Administration', icon: LayoutDashboard }] : []),
  ];
  useEffect(() => {
    setMenuOpen(false);
  }, [location]);
  useEffect(() => {
    let sessionId = '';
    try {
      sessionId = window.localStorage.getItem('indamora-analytics-session') ?? '';
      if (!sessionId) {
        sessionId = window.crypto.randomUUID();
        window.localStorage.setItem('indamora-analytics-session', sessionId);
      }
    } catch {
      sessionId = window.crypto.randomUUID();
    }
    void fetch('/api/analytics/visit', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, path: location, referrer: document.referrer || undefined }),
    }).catch(() => undefined);
  }, [location]);
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="group flex items-center gap-3" data-testid="link-logo" aria-label="Retour à l’accueil">
            <Logo className="transition-transform group-hover:-translate-y-0.5" />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link href={href} key={href} data-testid={`link-nav-${label.toLowerCase()}`} className={cx('flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors hover:bg-muted', location === href ? 'bg-muted text-primary' : 'text-muted-foreground')}>
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2 sm:flex">
             {canSubmit && <Link href="/submit" className="rounded-full border border-border px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary" data-testid="link-submit-header">Partager votre œuvre</Link>}
             {isSignedIn && !professionalProfile && !myArtist.isLoading && <Link href="/profil" className="rounded-full border border-primary/40 px-4 py-2 text-sm font-bold text-primary hover:bg-primary/5" data-testid="link-create-space-header">Je crée mon espace</Link>}
             {isSignedIn ? <><Link href="/profil" className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-profile-header">{user?.firstName ?? 'Mon compte'}</Link><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground" data-testid="button-logout-header">Déconnexion</button></> : <><Link href="/sign-up" className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-register-header">Créer un compte</Link><Link href="/sign-in" className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg" data-testid="link-login-header">Se connecter</Link></>}
          </div>
          <button className="rounded-full p-2" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-open-menu" aria-label={menuOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'} aria-expanded={menuOpen}>
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-card px-5 py-4">
            <div className="grid gap-2">
              {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid={`link-mobile-${label.toLowerCase()}`}><Icon className="h-4 w-4 text-primary" />{label}</Link>)}
              {canSubmit && <Link href="/submit" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-submit"><Send className="h-4 w-4 text-primary" />Partager votre œuvre</Link>}
              {isSignedIn && !professionalProfile && !myArtist.isLoading && <Link href="/profil" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-create-space"><Sparkles className="h-4 w-4 text-primary" />Je crée mon espace</Link>}
               {isSignedIn ? <><Link href="/profil" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-profile"><UserRound className="h-4 w-4 text-primary" />Mon compte</Link><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold hover:bg-muted" data-testid="button-mobile-logout"><UserRound className="h-4 w-4 text-primary" />Déconnexion</button></> : <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-login"><UserRound className="h-4 w-4 text-primary" />Se connecter</Link>}
            </div>
          </div>
        )}
      </header>
      <main>{children}</main>
      <footer className="mt-24 border-t border-border bg-secondary px-5 py-10 text-secondary-foreground lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div><Link href="/" className="mb-3 block w-36 rounded-xl bg-white p-1" data-testid="link-footer-logo" aria-label="Retour à l’accueil"><Logo variant="full" /></Link><p className="max-w-xs text-sm leading-6 text-secondary-foreground/70">Le foyer chaleureux des sons, des histoires et des écrans d’Afrique centrale.</p></div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-secondary-foreground/80"><Link href="/indamora-records" data-testid="link-footer-records">INDAMORA RECORDS</Link><Link href="/explorer" data-testid="link-footer-explorer">Explorer</Link><Link href="/repertoire" data-testid="link-footer-repertoire">Répertoire</Link><Link href="/presse" data-testid="link-footer-presse">Presse</Link><Link href="/pricing" data-testid="link-footer-pricing">Premium</Link><Link href="/soutenir" data-testid="link-footer-support">Soutenir INDAMORA</Link><Link href="/profil" data-testid="link-footer-profile">Mon profil</Link>{professionalProfile && <Link href="/espace-artiste" data-testid="link-footer-artist-space">Espace professionnel</Link>}{isAdmin && <Link href="/administration" data-testid="link-footer-admin">Administration</Link>}{canSubmit && <Link href="/submit" data-testid="link-footer-submit">Proposer une œuvre</Link>}</div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-secondary-foreground/15 pt-4 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/50">Bangui · République centrafricaine · La diaspora</div>
      </footer>
       <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 px-2 pt-2 backdrop-blur-xl md:hidden">
         {[{ href: '/', label: 'Accueil', icon: Sparkles }, { href: '/explorer', label: 'Explorer', icon: CirclePlay }, { href: '/repertoire', label: 'Répertoire', icon: UsersRound }, ...(canSubmit ? [{ href: '/submit', label: 'Créer', icon: Plus }] : []), { href: '/profil', label: 'Profil', icon: UserRound }, ...(isAdmin ? [{ href: '/administration', label: 'Admin', icon: LayoutDashboard }] : [])].map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={cx('flex flex-col items-center gap-1 px-4 py-1 text-[10px] font-bold', location === href ? 'text-primary' : 'text-muted-foreground')} data-testid={`link-bottom-${label.toLowerCase()}`}><Icon className="h-5 w-5" />{label}</Link>)}
      </div>
    </div>
  );
}

function SectionHeading({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return <div className="mb-6 flex items-end justify-between gap-4"><div>{eyebrow && <div className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[.22em] text-primary">{eyebrow}</div>}<h2 className="display text-2xl font-bold tracking-tight md:text-3xl">{title}</h2></div>{action}</div>;
}

function LoadingCards({ count = 4 }: { count?: number }) {
  return <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{Array.from({ length: count }).map((_, i) => <div className="animate-pulse" key={i}><div className="skeleton aspect-[.9] rounded-2xl" /><div className="skeleton mt-3 h-4 w-3/4 rounded" /><div className="skeleton mt-2 h-3 w-1/2 rounded" /></div>)}</div>;
}

function QueryState({ error, onRetry, label = 'content' }: { error?: unknown; onRetry: () => void; label?: string }) {
  if (!error) return null;
  return <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-8 text-center"><p className="font-semibold">Ce contenu a pris un détour.</p><p className="mt-1 text-sm text-muted-foreground">Vérifiez votre connexion, puis réessayez.</p><button onClick={onRetry} className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground" data-testid={`button-retry-${label}`}>Réessayer</button></div>;
}

function WorkArtwork({ work, onOpen }: { work: Work; onOpen: (id: number) => void }) {
  const artwork = storageUrl(work.coverObjectPath) ?? work.image;
  return <button onClick={() => onOpen(work.id)} className="group block w-full text-left" data-testid={`card-work-${work.id}`}>
    <div className="relative aspect-[.9] overflow-hidden rounded-2xl bg-secondary shadow-[var(--shadow-card)]">
      {artwork ? <img src={artwork} alt={work.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center bg-primary/80 text-primary-foreground"><FileMusic className="h-10 w-10" /></div>}
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/75 via-transparent to-transparent opacity-80" />
      {work.access === 'premium' && <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-accent text-accent-foreground"><LockKeyhole className="h-3.5 w-3.5" /></span>}
      <span className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-background"><span>{categoryLabel(work.category)}</span><span>{work.duration}</span></span>
    </div>
    <div className="mt-3 flex items-start justify-between gap-2"><div><h3 className="font-bold leading-tight group-hover:text-primary">{work.title}</h3><p className="mt-1 text-xs text-muted-foreground">{work.artist}</p></div><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border text-primary opacity-0 transition-opacity group-hover:opacity-100"><Play className="ml-0.5 h-3 w-3 fill-current" /></span></div>
  </button>;
}

function WorkSheet({ id, onClose }: { id: number | null; onClose: () => void }) {
  const workQuery = useGetWork(id ?? 0, { query: { enabled: id !== null, queryKey: getGetWorkQueryKey(id ?? 0) } });
  if (id === null) return null;
  const work = workQuery.data;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-sm md:items-center md:p-6" onClick={onClose}>
    <div className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-[2rem] bg-card p-5 shadow-2xl md:rounded-[2rem] md:p-7" onClick={(event) => event.stopPropagation()}>
      <div className="mb-5 flex justify-end"><button onClick={onClose} className="rounded-full bg-muted p-2" data-testid="button-close-work" aria-label="Fermer la fiche"><X className="h-4 w-4" /></button></div>
      {workQuery.isLoading && <div className="space-y-4"><div className="skeleton aspect-video rounded-2xl" /><div className="skeleton h-7 w-2/3 rounded" /><div className="skeleton h-4 w-full rounded" /></div>}
      {workQuery.error && <QueryState error={workQuery.error} onRetry={() => void workQuery.refetch()} label="work" />}
      {work && <><div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary">{(storageUrl(work.coverObjectPath) ?? work.image) && <img src={storageUrl(work.coverObjectPath) ?? work.image} alt={work.title} className="h-full w-full object-cover" />}<div className="absolute inset-0 grid place-items-center bg-foreground/20"><Link href={`/oeuvres/${work.id}`} onClick={onClose} className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105" data-testid={`button-play-work-${work.id}`} aria-label="Lire l’œuvre"><Play className="ml-1 h-6 w-6 fill-current" /></Link></div></div><div className="mt-6 flex items-start justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{categoryLabel(work.category)} · {work.duration}</div><h2 className="display mt-2 text-3xl font-bold">{work.title}</h2><p className="mt-1 font-semibold text-muted-foreground">{work.artist}</p></div>{work.access === 'premium' && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">Premium</span>}</div><p className="mt-5 leading-7 text-muted-foreground">{work.description}</p><Link href={`/oeuvres/${work.id}`} onClick={onClose} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-bold text-primary-foreground transition-all hover:-translate-y-0.5" data-testid={`link-open-work-${work.id}`}><Headphones className="h-4 w-4" /> Ouvrir la fiche de l’œuvre</Link></>}
    </div>
  </div>;
}

function Home() {
  const { isSignedIn } = useUser();
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const artists = useGetArtists(undefined, { query: { queryKey: getGetArtistsQueryKey() } });
  const [category, setCategory] = useState('Toutes');
  const [selectedWork, setSelectedWork] = useState<number | null>(null);
   const works = useMemo(() => (catalog.data ?? []).filter((work) => category === 'Toutes' || isCategory(work.category, category)), [catalog.data, category]);
  const featured = (catalog.data ?? []).filter((work) => work.featured);
  return <div>
    <section className="relative overflow-hidden bg-secondary text-secondary-foreground">
      <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full border-[42px] border-accent/80 opacity-80 md:h-[34rem] md:w-[34rem]" />
      <div className="absolute bottom-[-5rem] left-[42%] h-40 w-40 rotate-12 border-[20px] border-primary/70 md:h-64 md:w-64" />
      <div className="relative mx-auto grid max-w-7xl items-end gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-24 lg:pt-24">
         <div className="animate-rise-in"><Link href="/" className="mb-6 block w-44 rounded-2xl bg-white p-2 shadow-xl" data-testid="link-hero-logo" aria-label="Retour à l’accueil"><Logo variant="full" /></Link><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-secondary-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.18em] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Depuis Bangui, avec émotion</div><h1 className="display max-w-3xl text-5xl font-bold leading-[.98] md:text-7xl">Écoutez les voix<br /><span className="text-accent">qui ont le goût du pays.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-secondary-foreground/75 md:text-lg">Musique, humour, cinéma et podcasts d’Afrique centrale — pour celles et ceux d’ici, et pour partout où nous emportons notre chez-nous.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#discover" className="flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-1" data-testid="link-start-discover">Commencer à découvrir <ArrowRight className="h-4 w-4" /></a><Link href={isSignedIn ? '/profil' : '/sign-up'} className="rounded-full border border-secondary-foreground/25 px-5 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent" data-testid="link-share-hero">Je crée</Link></div></div>
        <div className="relative hidden min-h-[20rem] lg:block"><div className="absolute left-8 top-2 h-64 w-64 rotate-[-8deg] overflow-hidden rounded-[2rem] border-8 border-background/10 bg-primary shadow-2xl animate-drift">{featured[0]?.image && <img src={featured[0].image} alt="" className="h-full w-full object-cover mix-blend-luminosity opacity-90" />}<div className="absolute inset-0 bg-primary/25" /></div><div className="absolute bottom-2 right-3 w-56 rotate-[7deg] rounded-2xl bg-accent p-5 text-accent-foreground shadow-2xl"><Star className="mb-8 h-6 w-6 fill-current" /><p className="display text-xl font-bold leading-tight">Votre prochain coup de cœur est déjà ici.</p><div className="mt-5 font-mono text-[9px] uppercase tracking-[.18em]">Sélection Indamora / 001</div></div></div>
      </div>
    </section>
    <section id="discover" className="mx-auto max-w-7xl px-5 py-14 lg:px-8 lg:py-20">
      <SectionHeading eyebrow="Les nouveautés d’ici" title="Trouvez votre prochaine écoute" action={<div className="hidden items-center gap-2 sm:flex"><span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Sélection pour vous</span><Zap className="h-4 w-4 text-accent" /></div>} />
       <div className="mb-8 flex gap-2 overflow-x-auto pb-1">{['Toutes', ...categories].map((item) => { const Icon = categoryIcons[item as keyof typeof categoryIcons]; return <button key={item} onClick={() => setCategory(item)} className={cx('flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors', category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary hover:text-primary')} data-testid={`button-filter-${item.toLowerCase()}`}>{Icon && <Icon className="h-4 w-4" />}{item}</button>; })}</div>
      {catalog.isLoading && <LoadingCards />}
      <QueryState error={catalog.error} onRetry={() => void catalog.refetch()} />
      {!catalog.isLoading && !catalog.error && works.length === 0 && <div className="rounded-2xl border border-dashed border-border px-5 py-14 text-center text-muted-foreground">Aucune œuvre dans cette catégorie pour le moment. Revenez bientôt.</div>}
      {works.length > 0 && <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={setSelectedWork} />)}</div>}
    </section>
    <section className="mx-auto max-w-7xl px-5 pb-14 lg:px-8"><div className="rounded-[2rem] bg-primary px-6 py-8 text-primary-foreground md:flex md:items-center md:justify-between md:px-10"><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/70">Une place à la table</div><h2 className="display mt-2 text-3xl font-bold">Une histoire à partager&nbsp;?</h2><p className="mt-2 max-w-md text-sm leading-6 text-primary-foreground/80">Faites découvrir votre son, votre écran ou votre regard à un public centrafricain grandissant.</p></div><Link href="/submit" className="mt-6 inline-flex items-center gap-2 rounded-full bg-background px-5 py-3 text-sm font-bold text-foreground md:mt-0" data-testid="link-submit-banner">Proposer une œuvre <ArrowRight className="h-4 w-4" /></Link></div></section>
    <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8"><SectionHeading eyebrow="Les personnes à suivre" title="Rencontrez les créateurs" action={<Link href="/repertoire" className="flex items-center gap-1 text-sm font-bold text-primary" data-testid="link-view-artists">Tout voir <ArrowRight className="h-4 w-4" /></Link>} />{artists.isLoading ? <LoadingCards count={4} /> : artists.error ? <QueryState error={artists.error} onRetry={() => void artists.refetch()} label="artists" /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(artists.data ?? []).slice(0, 4).map((artist) => <Link href={`/artists/${artist.id}`} key={artist.id} className="group rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-1 hover:border-primary" data-testid={`card-artist-${artist.id}`}><Avatar name={artist.name} src={artist.avatar ?? undefined} /><p className="mt-4 font-bold group-hover:text-primary">{artist.name}</p><p className="mt-1 text-xs text-muted-foreground">{categoryLabel(artist.category)} · {artist.location}</p></Link>)}</div>}</section>
    <WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} />
  </div>;
}

type DirectoryGroup = Artist['profileGroup'];

const directoryGroups: Array<{
  id: DirectoryGroup;
  label: string;
  description: string;
  icon: typeof Mic2;
  subcategories: string[];
}> = [
  { id: 'artists', label: 'Artistes', description: 'Chanteurs, Gospel, DJ, animateurs, MC et speakers', icon: Mic2, subcategories: ['Artiste / Chanteur', 'Gospel / Chantre', 'Serviteur de Dieu', 'DJ', 'Animateur', 'Maître de cérémonie', 'Speaker'] },
  { id: 'creations', label: 'Créations', description: 'Cinéma, vidéo, humour, podcasts et contenus', icon: Video, subcategories: ['Cinéma', 'Acteur', 'Réalisateur', 'Vidéaste', 'Humoriste', 'Podcast', 'Créateur de contenu', 'Influenceur', 'Créateur / Talent'] },
  { id: 'partners', label: 'Partenaires', description: 'Associations, labels, producteurs, radios et médias', icon: Briefcase, subcategories: ['Association', 'Label', 'Producteur', 'Organisateur', 'Radio', 'Média', 'Partenaire culturel'] },
  { id: 'press', label: 'Presse & Médias', description: 'Journalistes, radios, télévisions et médias en ligne', icon: Newspaper, subcategories: ['Journaliste', 'Radio', 'Télévision', 'Média en ligne'] },
];

function Directory({ defaultGroup = 'artists' }: { defaultGroup?: DirectoryGroup }) {
  const [group, setGroup] = useState<DirectoryGroup>(defaultGroup);
  const [subcategory, setSubcategory] = useState('');
  const [search, setSearch] = useState('');
  const queryParams = { group, ...(subcategory ? { subcategory } : {}) };
  const artists = useGetArtists(queryParams, { query: { queryKey: getGetArtistsQueryKey(queryParams) } });
  const activeGroup = directoryGroups.find((item) => item.id === group)!;

  const shown = useMemo(() => {
    return (artists.data ?? []).filter((artist) => {
      const text = `${artist.name} ${artist.category} ${artist.location} ${artist.country ?? ''} ${artist.subcategory ?? ''} ${artist.specialties.join(' ')}`.toLowerCase();
      return text.includes(search.toLowerCase());
    });
  }, [artists.data, search]);

  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="max-w-2xl animate-rise-in">
      <div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Le répertoire</div>
      <h1 className="display mt-3 text-5xl font-bold leading-none md:text-6xl">La communauté<br /><span className="text-primary">Indamora.</span></h1>
      <p className="mt-5 leading-7 text-muted-foreground">Découvrez les talents, créateurs, partenaires et médias qui façonnent la culture centrafricaine, de Bangui au reste du monde.</p>
    </div>

    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {directoryGroups.map(g => {
        const Icon = g.icon;
        const isActive = group === g.id;
        return <button key={g.id} onClick={() => { setGroup(g.id); setSubcategory(''); setSearch(''); }} className={cx('rounded-2xl border p-5 text-left transition-all hover:-translate-y-0.5', isActive ? 'border-primary bg-primary text-primary-foreground shadow-[var(--shadow-card)]' : 'border-border bg-card hover:border-primary')} data-testid={`button-filter-${g.id}`}>
          <Icon className={cx('h-5 w-5', isActive ? 'text-primary-foreground' : 'text-primary')} />
          <span className="mt-4 block font-bold">{g.label}</span>
          <span className={cx('mt-2 block text-xs leading-5', isActive ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{g.description}</span>
        </button>;
      })}
    </div>

    <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
      {['', ...activeGroup.subcategories].map((item) => <button key={item || 'all'} type="button" onClick={() => setSubcategory(item)} className={cx('shrink-0 rounded-full border px-4 py-2 text-sm font-bold', subcategory === item ? 'border-secondary bg-secondary text-secondary-foreground' : 'border-border bg-card hover:border-secondary')} data-testid={`button-subcategory-${item || 'all'}`}>{item || 'Tous'}</button>)}
    </div>

    <div className="mt-6 flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
      <Search className="h-5 w-5 text-muted-foreground" />
      <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom, un domaine..." className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-search-directory" />
    </div>

    <div className="mt-12">
      {artists.isLoading ? <LoadingCards count={6} /> : artists.error ? <QueryState error={artists.error} onRetry={() => void artists.refetch()} label="directory" /> : shown.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-16 text-center"><p className="font-bold">Aucun profil publié dans cette sélection.</p><p className="mt-2 text-sm text-muted-foreground">Les profils apparaîtront ici après leur validation par INDAMORA RECORDS.</p>{group === 'press' && <Link href="/presse" className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Contacter l’espace presse <ArrowRight className="h-4 w-4" /></Link>}</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((artist, index) => <Link href={`/artists/${artist.id}`} key={artist.id} className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-[var(--shadow-card)]" data-testid={`card-directory-artist-${artist.id}`}><Avatar name={artist.name} src={artist.avatar ?? undefined} size="lg" /><div className="min-w-0 flex-1"><div className="mb-2 font-mono text-[10px] text-primary">0{index + 1}</div><h2 className="truncate text-lg font-bold group-hover:text-primary">{artist.name}</h2><p className="mt-1 text-sm text-muted-foreground">{artist.subcategory || categoryLabel(artist.category)}</p><p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3 shrink-0" /> <span className="truncate">{artist.location}{artist.country ? `, ${artist.country}` : ''}</span></p></div><ChevronRightIcon /></Link>)}</div>}
    </div>
  </div>;
}

function ChevronRightIcon() { return <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />; }

function ArtistProfile() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const [selectedWork, setSelectedWork] = useState<number | null>(null);
  const artist = useGetArtist(id, { query: { enabled: Number.isFinite(id), queryKey: getGetArtistQueryKey(id) } });
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const works = (catalog.data ?? []).filter((work) => artist.data && work.artist === artist.data.name);
  if (artist.isLoading) return <div className="mx-auto max-w-7xl px-5 py-14 lg:px-8"><div className="skeleton h-64 rounded-[2rem]" /><div className="skeleton mt-6 h-8 w-1/3 rounded" /></div>;
  if (artist.error || !artist.data) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><QueryState error={artist.error ?? new Error('Artiste introuvable')} onRetry={() => void artist.refetch()} label="profil artiste" /></div>;
  const person = artist.data;
  return <div>
    <section className="bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-20">
        <Link href="/repertoire" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-secondary-foreground/70 hover:text-accent" data-testid="link-back-repertoire"><ChevronLeft className="h-4 w-4" /> Le répertoire</Link>
        <div className="flex flex-col items-start gap-7 sm:flex-row sm:items-end">
          <Avatar name={person.name} src={person.avatar ?? undefined} size="lg" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">{person.subcategory || categoryLabel(person.category)} · {person.location}</div>
            <h1 className="display mt-2 text-5xl font-bold md:text-7xl">{person.name}</h1>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
      <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="display text-3xl font-bold mb-4">À propos</h2>
          <p className="leading-8 text-muted-foreground whitespace-pre-wrap">{person.bio}</p>

          {person.specialties && person.specialties.length > 0 && (
            <div className="mt-10">
              <h3 className="font-bold mb-4">Spécialités</h3>
              <div className="flex flex-wrap gap-2">
                {person.specialties.map(s => <span key={s} className="rounded-full border border-border bg-muted/50 px-4 py-1.5 text-sm font-semibold text-muted-foreground">{s}</span>)}
              </div>
            </div>
          )}

          <div className="mt-16">
            <SectionHeading eyebrow={`${person.worksCount} œuvres sur Indamora`} title="Portfolio & Créations" />
            {catalog.isLoading ? <LoadingCards /> : catalog.error ? <QueryState error={catalog.error} onRetry={() => void catalog.refetch()} /> : works.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-16 text-center text-muted-foreground">Ses œuvres arrivent bientôt.</div> : <div className="grid grid-cols-2 gap-x-4 gap-y-8">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={setSelectedWork} />)}</div>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-bold mb-5 flex items-center gap-2"><UserRound className="h-4 w-4 text-primary" /> Informations</h3>
            <dl className="space-y-4 text-sm">
              {person.subcategory && <div><dt className="text-muted-foreground mb-1 font-medium">Domaine</dt><dd className="font-bold">{person.subcategory}</dd></div>}
              <div><dt className="text-muted-foreground mb-1 font-medium">Localisation</dt><dd className="font-bold flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> {person.location}{person.country ? `, ${person.country}` : ''}</dd></div>
              {person.website && <div><dt className="text-muted-foreground mb-1 font-medium">Site web</dt><dd className="font-bold"><a href={person.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors"><Globe className="h-4 w-4 text-primary" /> {person.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a></dd></div>}
              {person.professionalContact && <div><dt className="text-muted-foreground mb-1 font-medium">Contact professionnel</dt><dd className="font-bold"><a href={`mailto:${person.professionalContact}`} className="flex items-center gap-1.5 hover:text-primary transition-colors"><Mail className="h-4 w-4 text-primary" /> Envoyer un e-mail</a></dd></div>}
            </dl>

            {person.socialLinks && person.socialLinks.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-muted-foreground text-sm font-medium mb-3">Réseaux sociaux</p>
                <div className="flex flex-wrap gap-2">
                  {person.socialLinks.map((link, i) => (
                    <a key={i} href={link} target="_blank" rel="noreferrer" className="grid h-10 w-10 place-items-center rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-all hover:-translate-y-1"><ExternalLink className="h-4 w-4" /></a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
    <WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} />
  </div>;
}

function DemoPlayer({ work }: { work: Work }) {
  const isVideo = work.mediaType === 'video' || categoryLabel(work.category) === 'Cinéma et vidéos';
  const media = storageUrl(work.mediaObjectPath);
  const poster = storageUrl(work.coverObjectPath) ?? work.image;
  if (work.access === 'premium') return <div className="grid min-h-72 place-items-center rounded-[2rem] bg-secondary p-8 text-center text-secondary-foreground"><div><LockKeyhole className="mx-auto h-9 w-9 text-accent" /><p className="mt-4 font-bold">Lecture Premium bientôt disponible</p><p className="mt-2 max-w-sm text-sm text-secondary-foreground/70">Aucun paiement n’est demandé tant que l’accès Premium réel n’est pas configuré.</p></div></div>;
  if (!media) return <div className="overflow-hidden rounded-[2rem] bg-secondary p-8 text-secondary-foreground"><img src={poster} alt="" className="aspect-video w-full rounded-2xl object-cover opacity-70" /><p className="mt-5 text-center text-sm text-secondary-foreground/75">Ce catalogue historique ne contient pas encore de fichier média disponible.</p></div>;
  if (isVideo) return <div className="overflow-hidden rounded-[2rem] bg-secondary p-3 text-secondary-foreground shadow-xl"><video controls preload="metadata" poster={poster} className="aspect-video w-full rounded-2xl bg-black" src={media} data-testid={`video-player-${work.id}`} /></div>;
  return <div className="rounded-[2rem] bg-secondary p-7 text-secondary-foreground shadow-xl"><div className="mb-6 flex items-center gap-4"><img src={poster} alt="" className="h-24 w-24 rounded-2xl object-cover" /><div><p className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Audio original</p><p className="mt-2 font-bold">{work.title}</p></div></div><audio controls preload="metadata" className="w-full" src={media} data-testid={`audio-player-${work.id}`} /></div>;
}

function WorkPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const workQuery = useGetWork(id, { query: { enabled: Number.isFinite(id), queryKey: getGetWorkQueryKey(id) } });
  const artists = useGetArtists(undefined, { query: { queryKey: getGetArtistsQueryKey() } });
  if (workQuery.isLoading) return <div className="mx-auto max-w-6xl px-5 py-16 lg:px-8"><div className="skeleton aspect-video rounded-[2rem]" /><div className="skeleton mt-7 h-10 w-2/3 rounded" /></div>;
  if (workQuery.error || !workQuery.data) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><QueryState error={workQuery.error ?? new Error('Œuvre introuvable')} onRetry={() => void workQuery.refetch()} label="œuvre" /></div>;
  const work = workQuery.data;
  const artist = (artists.data ?? []).find((person) => person.name === work.artist);
  return <div className="mx-auto max-w-6xl px-5 py-10 lg:px-8 lg:py-16">
    <Link href="/explorer" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-back-explorer"><ChevronLeft className="h-4 w-4" /> Retour à Explorer</Link>
    <div className="mt-8 grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:items-start">
      <DemoPlayer work={work} />
      <div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{categoryLabel(work.category)} · {work.duration}</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-6xl">{work.title}</h1><p className="mt-4 font-semibold text-muted-foreground">{work.artist}</p><p className="mt-6 leading-7 text-muted-foreground">{work.description}</p>{work.access === 'premium' && <div className="mt-7 rounded-2xl border border-accent/60 bg-accent/15 p-4 text-sm"><strong>Œuvre Premium de démonstration.</strong><span className="mt-1 block text-muted-foreground">L’accès payant sera activé dans une prochaine étape. Cette V1 ne demande aucun paiement.</span></div>}{artist && <Link href={`/artists/${artist.id}`} className="mt-8 inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-work-artist">Voir la page de {artist.name} <ArrowRight className="h-4 w-4" /></Link>}</div>
    </div>
  </div>;
}

function Explorer() {
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const [category, setCategory] = useState('Toutes');
  const [selectedWork, setSelectedWork] = useState<number | null>(null);
  const works = useMemo(() => (catalog.data ?? []).filter((work) => category === 'Toutes' || isCategory(work.category, category)), [catalog.data, category]);
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Explorer le catalogue</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-6xl">Tout ce qui se crée<br /><span className="text-primary">ici et ailleurs.</span></h1><p className="mt-5 leading-7 text-muted-foreground">Parcourez les œuvres validées par INDAMORA RECORDS, de Bangui à la diaspora.</p></div>
    <Link href="/recherche" className="mt-8 flex max-w-xl items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-sm text-muted-foreground shadow-sm hover:border-primary" data-testid="link-explorer-search"><Search className="h-5 w-5 text-primary" /> Rechercher une œuvre, un artiste ou un univers <ArrowRight className="ml-auto h-4 w-4" /></Link>
    <div className="mt-10 flex gap-2 overflow-x-auto pb-2">{['Toutes', ...categories].map((item) => <button key={item} onClick={() => setCategory(item)} className={cx('shrink-0 rounded-full border px-4 py-2 text-sm font-bold', category === item ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary hover:text-primary')} data-testid={`button-explorer-${item.toLowerCase().replaceAll(' ', '-')}`}>{item}</button>)}</div>
    <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{categories.map((item) => <Link href={`/categorie/${categorySlug[item]}`} key={item} className="rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary" data-testid={`link-category-${categorySlug[item]}`}><div className="flex items-center justify-between gap-3"><span className="font-bold">{item}</span><ArrowRight className="h-4 w-4 text-primary" /></div><p className="mt-2 text-xs text-muted-foreground">Voir la sélection</p></Link>)}</div>
    <div className="mt-8">{catalog.isLoading ? <LoadingCards /> : catalog.error ? <QueryState error={catalog.error} onRetry={() => void catalog.refetch()} label="explorer" /> : works.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-20 text-center"><Sparkles className="mx-auto h-7 w-7 text-primary" /><h2 className="mt-4 font-bold">Cette sélection arrive bientôt.</h2><p className="mt-1 text-sm text-muted-foreground">Les prochaines créations seront ajoutées après leur validation.</p></div> : <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={setSelectedWork} />)}</div>}</div>
    <WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} />
  </div>;
}

function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const label = categoryFromSlug[slug ?? ''] ?? 'Autres créations';
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const [selectedWork, setSelectedWork] = useState<number | null>(null);
  const works = (catalog.data ?? []).filter((work) => isCategory(work.category, label));
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <Link href="/explorer" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-primary" data-testid="link-category-back"><ChevronLeft className="h-4 w-4" /> Retour à Explorer</Link>
    <div className="mt-10 max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Catégorie</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-7xl">{label}</h1><p className="mt-5 leading-7 text-muted-foreground">Une sélection de créations centrafricaines et de la diaspora, choisies avec attention par INDAMORA RECORDS.</p></div>
    <div className="mt-12">{catalog.isLoading ? <LoadingCards /> : catalog.error ? <QueryState error={catalog.error} onRetry={() => void catalog.refetch()} label="catégorie" /> : works.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-20 text-center"><Sparkles className="mx-auto h-7 w-7 text-primary" /><h2 className="mt-4 font-bold">Les premières œuvres arrivent bientôt.</h2><p className="mt-1 text-sm text-muted-foreground">Cette catégorie est prête à accueillir les prochaines créations validées.</p><Link href="/submit" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-category-submit">Proposer une œuvre</Link></div> : <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={setSelectedWork} />)}</div>}</div>
    <WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} />
  </div>;
}

function SearchPage() {
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const artists = useGetArtists(undefined, { query: { queryKey: getGetArtistsQueryKey() } });
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const works = (catalog.data ?? []).filter((work) => !term || `${work.title} ${work.artist} ${categoryLabel(work.category)} ${work.description}`.toLowerCase().includes(term));
  const people = (artists.data ?? []).filter((artist) => !term || `${artist.name} ${artist.category} ${artist.location} ${artist.bio}`.toLowerCase().includes(term));
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Recherche</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-6xl">Trouvez ce qui<br /><span className="text-primary">vous ressemble.</span></h1></div>
    <div className="mt-8 flex max-w-2xl items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 shadow-sm"><Search className="h-5 w-5 text-primary" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom, titre, catégorie ou lieu" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" data-testid="input-search" /></div>
     {!term ? <div className="mt-12 rounded-2xl bg-muted px-6 py-10 text-center"><Search className="mx-auto h-8 w-8 text-primary" /><h2 className="mt-4 font-bold">Commencez votre recherche</h2><p className="mt-1 text-sm text-muted-foreground">Essayez « Bangui », « musique » ou le nom d’un artiste.</p></div> : <div className="mt-12 grid gap-12 lg:grid-cols-[1fr_.7fr]"><section><SectionHeading eyebrow={`${works.length} résultat${works.length > 1 ? 's' : ''}`} title="Œuvres" />{works.length === 0 ? <p className="text-sm text-muted-foreground">Aucune œuvre ne correspond à cette recherche.</p> : <div className="grid grid-cols-2 gap-x-4 gap-y-8">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={(id) => navigate(`/oeuvres/${id}`)} />)}</div>}</section><section><SectionHeading eyebrow={`${people.length} résultat${people.length > 1 ? 's' : ''}`} title="Artistes" />{people.length === 0 ? <p className="text-sm text-muted-foreground">Aucun artiste ne correspond à cette recherche.</p> : <div className="space-y-3">{people.map((artist) => <Link href={`/artists/${artist.id}`} key={artist.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:border-primary" data-testid={`search-artist-${artist.id}`}><Avatar name={artist.name} src={artist.avatar ?? undefined} size="sm" /><div><p className="font-bold">{artist.name}</p><p className="text-xs text-muted-foreground">{categoryLabel(artist.category)} · {artist.location}</p></div><ArrowRight className="ml-auto h-4 w-4 text-muted-foreground" /></Link>)}</div>}</section></div>}
  </div>;
}

function Submit() {
  const { isSignedIn } = useUser();
  const myArtist = useGetMyArtist({ query: { enabled: Boolean(isSignedIn), queryKey: getGetMyArtistQueryKey() } });
  const createSubmission = useCreateSubmission();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ title: '', artist: '', category: 'Musique', note: '' });
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [done, setDone] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const professionalProfile = myArtist.data?.specialties.length ? myArtist.data : null;
  const canSubmit = canSubmitWorks(professionalProfile);
  const update = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!professionalProfile?.name) return;
    setForm((current) => current.artist ? current : { ...current, artist: professionalProfile.name });
  }, [professionalProfile?.name]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (form.title.trim().length < 2 || form.artist.trim().length < 2) { setError('Ajoutez un titre et un nom d’artiste pour que l’équipe retrouve votre œuvre.'); return; }
    if (!mediaFile) { setError('Ajoutez le fichier audio ou vidéo de votre œuvre.'); return; }
    const uploadedPaths: string[] = [];
    try {
      setUploading(true);
      const fileCount = 1 + (coverFile ? 1 : 0);
      let completedFiles = 0;
      const trackedUpload = async (file: File) => {
        const path = await uploadAsset(file, (value) => setUploadProgress(Math.round(((completedFiles + value / 100) / fileCount) * 100)));
        uploadedPaths.push(path);
        completedFiles += 1;
        return path;
      };
      const duration = await extractMediaDuration(mediaFile);
      const mediaObjectPath = await trackedUpload(mediaFile);
      const coverObjectPath = coverFile ? await trackedUpload(coverFile) : undefined;
      const created = await createSubmission.mutateAsync({ data: { title: form.title, artist: form.artist, category: form.category, note: form.note || undefined, mediaType: mediaFile.type.startsWith('video/') ? 'video' : 'audio', mediaObjectPath, coverObjectPath, duration } });
      setDone(created);
      void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() });
    } catch (submissionError) {
      await cleanupUploadedAssets(uploadedPaths);
      setError(submissionError instanceof Error ? submissionError.message : 'Votre proposition n’a pas pu être envoyée.');
    } finally {
      setUploading(false);
    }
  };
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (myArtist.isLoading) return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8"><div className="skeleton h-72 rounded-[2rem]" /></div>;
  if (myArtist.error) return <div className="mx-auto max-w-2xl px-5 py-20"><QueryState error={myArtist.error} onRetry={() => void myArtist.refetch()} label="profil de dépôt" /></div>;
  if (!professionalProfile) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-primary" /><h1 className="display mt-5 text-4xl font-bold">Profil professionnel requis</h1><p className="mt-3 text-muted-foreground">Créez votre profil INDAMORA et choisissez une ou deux activités avant de proposer une œuvre.</p><Link href="/profil" className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Créer mon espace professionnel</Link></div>;
  if (!canSubmit) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><LockKeyhole className="mx-auto h-10 w-10 text-primary" /><h1 className="display mt-5 text-4xl font-bold">Dépôt non disponible pour ces activités</h1><p className="mt-3 text-muted-foreground">Votre espace professionnel reste accessible, mais le dépôt d’œuvres est réservé aux activités de création compatibles.</p><Link href="/espace-artiste" className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Retour à mon espace</Link></div>;
  if (done) return <div className="mx-auto max-w-2xl px-5 py-20 text-center lg:py-28"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="h-9 w-9" /></div><div className="mt-8 font-mono text-[10px] uppercase tracking-[.2em] text-primary">Reçu par Indamora Records</div><h1 className="display mt-3 text-5xl font-bold">Votre œuvre est bien arrivée.</h1><p className="mx-auto mt-5 max-w-md leading-7 text-muted-foreground">Nous avons reçu <strong className="text-foreground">{done.title}</strong> dans notre espace d’écoute. Notre équipe va l’examiner avec attention et vous répondre.</p><Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-submission-home">Retour à la découverte <ArrowRight className="h-4 w-4" /></Link></div>;
  const pending = uploading || createSubmission.isPending;
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Indamora Records</div><h1 className="display mt-3 text-5xl font-bold leading-[.95] md:text-6xl">Mettez votre œuvre<br /><span className="text-primary">dans la lumière.</span></h1><p className="mt-6 max-w-sm leading-7 text-muted-foreground">Cette proposition sera rattachée à votre profil professionnel existant : <strong className="text-foreground">{professionalProfile.name}</strong>.</p><div className="mt-10 space-y-4 border-l-2 border-accent pl-5 text-sm font-semibold"><p>01 · Parlez-nous de votre création</p><p>02 · Notre équipe l’écoute avec attention</p><p>03 · Si elle trouve sa place, elle rencontre son public</p></div></div><form onSubmit={submit} className="rounded-[2rem] border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-9"><div className="mb-8 flex items-center justify-between"><div><h2 className="display text-2xl font-bold">Détails de l’œuvre</h2><p className="mt-1 text-sm text-muted-foreground">Les champs marqués d’un astérisque sont essentiels.</p></div><FileMusic className="h-7 w-7 text-primary" /></div><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Titre <input required value={form.title} onChange={(e) => update('title', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="Comment s’appelle-t-elle&nbsp;?" data-testid="input-submission-title" /></label><label className="grid gap-2 text-sm font-bold">Artiste ou collectif <input required value={form.artist} onChange={(e) => update('artist', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Votre nom public" data-testid="input-submission-artist" /></label><label className="grid gap-2 text-sm font-bold">Catégorie <select value={form.category} onChange={(e) => update('category', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="select-submission-category">{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></label><label className="grid gap-2 text-sm font-bold sm:col-span-2">Un mot pour l’équipe d’écoute <textarea value={form.note} onChange={(e) => update('note', e.target.value)} className="min-h-28 resize-y rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Dites-nous ce que cette œuvre représente pour vous…" data-testid="textarea-submission-note" /></label></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">Audio ou vidéo <input required type="file" accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,video/mp4,video/webm,video/quicktime" onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal" data-testid="input-submission-media" />{mediaFile && <span className="text-xs text-muted-foreground">{mediaFile.name}</span>}</label><label className="grid gap-2 text-sm font-bold">Couverture (optionnelle) <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal" data-testid="input-submission-cover" />{coverFile && <span className="text-xs text-muted-foreground">{coverFile.name}</span>}</label></div>{error && <p className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive" data-testid="status-submission-error">{error}</p>}<button disabled={pending} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-work">{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Envoi en cours… {uploadProgress > 0 && `${uploadProgress}%`}</> : <><Send className="h-4 w-4" /> Envoyer pour examen</>}</button></form></div></div>;
}

function SubmissionPreview({ submission }: { submission: Submission }) {
  const source = storageUrl(submission.mediaObjectPath);
  const cover = storageUrl(submission.coverObjectPath);
  if (!source && !cover) return null;
  return <div className="mt-4 flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-start">
    {cover && <img src={cover} alt={`Pochette de ${submission.title}`} className="aspect-square w-full max-w-40 rounded-xl object-cover" data-testid={`moderation-cover-${submission.id}`} />}
    {source && (submission.mediaType === 'video'
      ? <video controls preload="metadata" poster={cover} src={source} className="max-h-52 w-full max-w-md rounded-xl bg-black" data-testid={`moderation-video-${submission.id}`} />
      : <audio controls preload="metadata" src={source} className="w-full max-w-md" data-testid={`moderation-audio-${submission.id}`} />)}
  </div>;
}

function Moderation() {
  const { isSignedIn, user } = useUser();
  const isAdmin = isAdminUser(user);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const submissions = useGetSubmissions({ status: filter }, { query: { enabled: Boolean(isSignedIn && isAdmin), queryKey: getGetSubmissionsQueryKey({ status: filter }) } });
  const updateStatus = useUpdateSubmissionStatus();
  const deleteFiles = useDeleteSubmissionFiles();
  const review = (submission: Submission, status: 'approved' | 'rejected') => updateStatus.mutate({ id: submission.id, data: { status } }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey({ status: filter }) }); void queryClient.invalidateQueries({ queryKey: getGetCatalogQueryKey() }); } });
  const removeFiles = (submission: Submission) => {
    if (!window.confirm(`Supprimer définitivement les fichiers de « ${submission.title} » ? Cette action est irréversible.`)) return;
    deleteFiles.mutate({ id: submission.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey({ status: filter }) }) });
  };
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (!isAdmin) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-destructive" /><h1 className="display mt-5 text-4xl font-bold">Accès réservé</h1><p className="mt-3 text-muted-foreground">La modération est réservée à l’équipe INDAMORA RECORDS.</p></div>;
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Espace de modération</div><h1 className="display mt-3 text-5xl font-bold">INDAMORA<br /><span className="text-primary">RECORDS.</span></h1><p className="mt-4 text-muted-foreground">Donnez à chaque proposition l’attention qu’elle mérite.</p></div><div className="rounded-2xl bg-secondary px-5 py-4 text-secondary-foreground"><div className="font-mono text-[10px] uppercase tracking-[.15em] text-accent">État de la file</div><div className="mt-2 flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> File de revue active</div></div></div><div className="mt-12 flex gap-2 overflow-x-auto border-b border-border pb-3">{(['pending', 'approved', 'rejected'] as const).map((item) => <button onClick={() => setFilter(item)} key={item} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize', filter === item ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} data-testid={`button-filter-submissions-${item}`}>{item === 'pending' ? 'En attente' : item === 'approved' ? 'Approuvées' : 'Refusées'}</button>)}</div>{submissions.isLoading ? <div className="mt-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div> : submissions.error ? <div className="mt-6"><QueryState error={submissions.error} onRetry={() => void submissions.refetch()} label="submissions" /></div> : (submissions.data ?? []).length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted"><Check className="h-6 w-6 text-secondary" /></div><h2 className="mt-4 font-bold">Aucune œuvre dans cette file</h2><p className="mt-1 text-sm text-muted-foreground">La file est vide pour le moment.</p></div> : <div className="mt-6 space-y-3">{(submissions.data ?? []).map((submission) => <div key={submission.id} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50" data-testid={`row-submission-${submission.id}`}><div className="flex flex-col gap-5 md:flex-row md:items-center"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-primary"><FileMusic className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{submission.title}</h2><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">{categoryLabel(submission.category)}</span></div><p className="mt-1 text-sm text-muted-foreground">{submission.artist} · {new Date(submission.submittedAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}</p>{submission.note && <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/75">“{submission.note}”</p>}<SubmissionPreview submission={submission} /></div>{filter === 'pending' && <div className="flex gap-2"><button disabled={updateStatus.isPending} onClick={() => review(submission, 'rejected')} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-destructive hover:text-destructive disabled:opacity-50" data-testid={`button-reject-${submission.id}`}>Refuser</button><button disabled={updateStatus.isPending} onClick={() => review(submission, 'approved')} className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50" data-testid={`button-approve-${submission.id}`}>Approuver</button></div>} {filter !== 'pending' && <div className="flex flex-col items-end gap-2"><span className={cx('rounded-full px-3 py-1 text-xs font-bold capitalize', filter === 'approved' ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive')}>{filter === 'approved' ? 'Approuvée' : 'Refusée'}</span>{filter === 'rejected' && (submission.mediaObjectPath || submission.coverObjectPath) && <button disabled={deleteFiles.isPending} onClick={() => removeFiles(submission)} className="inline-flex items-center gap-2 rounded-full border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:border-destructive disabled:opacity-50" data-testid={`button-delete-submission-files-${submission.id}`}><Trash2 className="h-3.5 w-3.5" /> Supprimer les fichiers</button>}</div>}</div></div>)}</div>}</div>;
}

function Pricing() {
  const { isSignedIn } = useUser();
  const { toast } = useToast();
  const statusMessage = checkoutStatusMessage();
  const billingStatus = useQuery({ queryKey: ['billing-status'], queryFn: () => billingRequest<BillingStatus>('/api/billing/status'), enabled: Boolean(isSignedIn) });
  const checkout = useMutation({
    mutationFn: (plan: 'africa' | 'international') => billingRequest<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ kind: 'subscription', plan }) }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error: Error) => toast({ title: 'Checkout indisponible', description: error.message, variant: 'destructive' }),
  });
  const premiumBenefits = ['Tout le catalogue gratuit', 'Débloquer les sorties Premium', 'Accéder en avant-première aux nouveautés', 'Soutenir le développement d’INDAMORA PLAY'];
  const futureUses = ['Soutenir les artistes et créateurs', 'Accompagner certains projets artistiques', 'Produire de nouvelles créations et fonctionnalités', 'Contribuer au développement de la création centrafricaine et africaine'];
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-20">
    <div className="mx-auto max-w-3xl text-center">
      <div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Soutenir le mouvement</div>
      <h1 className="display mt-3 text-5xl font-bold leading-none md:text-7xl">Plus de ce qui<br /><span className="text-primary">vous fait vibrer.</span></h1>
      <p className="mt-6 text-lg leading-7 text-muted-foreground">Votre abonnement contribue au développement d’INDAMORA PLAY et au soutien des artistes et créateurs.</p>
    </div>

    <div className="mx-auto mt-14 grid max-w-6xl gap-5 lg:grid-cols-3">
      <div className="rounded-[2rem] border border-border bg-card p-7 md:p-8">
        <div className="flex items-center justify-between">
          <div><h2 className="display text-3xl font-bold">Gratuit</h2><p className="mt-1 text-sm text-muted-foreground">Pour découvrir la plateforme.</p></div>
          <Ticket className="h-7 w-7 text-secondary" />
        </div>
        <div className="mt-8 text-4xl font-bold">0 <span className="text-sm font-medium text-muted-foreground">FCFA / mois</span></div>
        <ul className="mt-8 space-y-4 text-sm">{['Découvrir les œuvres à la une', 'Explorer le répertoire des artistes', 'Écouter les sorties gratuites', 'Suivre les créateurs d’ici'].map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 text-secondary" />{item}</li>)}</ul>
        <Link href="/" className="mt-10 block rounded-full border border-border py-3 text-center text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-pricing-free">Continuer la découverte</Link>
      </div>

      <div className="relative rounded-[2rem] bg-secondary p-7 text-secondary-foreground shadow-xl md:p-8 lg:-translate-y-4">
        <div className="absolute right-6 top-6 rounded-full bg-accent px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-accent-foreground">Pour l’Afrique</div>
        <div className="flex items-center justify-between gap-4"><div><h2 className="display text-3xl font-bold">Premium Afrique</h2><p className="mt-1 text-sm text-secondary-foreground/65">Pour les membres situés en Afrique.</p></div><Crown className="h-7 w-7 shrink-0 text-accent" /></div>
        <div className="mt-8 text-4xl font-bold">500 <span className="text-sm font-medium text-secondary-foreground/65">FCFA / mois</span></div>
        <ul className="mt-8 space-y-4 text-sm text-secondary-foreground/85">{premiumBenefits.map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-accent" />{item}</li>)}</ul>
         <button type="button" disabled={!isSignedIn || checkout.isPending} onClick={() => checkout.mutate('africa')} className="mt-10 flex w-full items-center justify-center gap-2 rounded-full bg-accent py-3 text-center text-sm font-bold text-accent-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-pricing-africa"><Crown className="h-4 w-4" />{!isSignedIn ? 'Se connecter pour souscrire' : checkout.isPending ? 'Ouverture de Checkout…' : 'Souscrire avec Stripe'}</button>
      </div>

      <div className="rounded-[2rem] border border-primary/30 bg-card p-7 shadow-[var(--shadow-card)] md:p-8">
        <div className="flex items-center justify-between gap-4"><div><h2 className="display text-3xl font-bold">Premium International</h2><p className="mt-1 text-sm text-muted-foreground">Pour l’Europe, les États-Unis et les autres pays hors Afrique.</p></div><Crown className="h-7 w-7 shrink-0 text-primary" /></div>
        <div className="mt-8 text-4xl font-bold">5 <span className="text-sm font-medium text-muted-foreground">€ / mois</span></div>
        <ul className="mt-8 space-y-4 text-sm">{premiumBenefits.map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 shrink-0 text-primary" />{item}</li>)}</ul>
         <button type="button" disabled={!isSignedIn || checkout.isPending} onClick={() => checkout.mutate('international')} className="mt-10 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 text-center text-sm font-bold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-pricing-international"><Crown className="h-4 w-4" />{!isSignedIn ? 'Se connecter pour souscrire' : checkout.isPending ? 'Ouverture de Checkout…' : 'Souscrire avec Stripe'}</button>
      </div>
    </div>

    <section className="mx-auto mt-16 max-w-5xl rounded-[2rem] bg-muted p-7 md:p-10">
      <div className="max-w-2xl">
        <div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">À quoi sert votre soutien&nbsp;?</div>
        <h2 className="display mt-3 text-3xl font-bold md:text-4xl">Une communauté Premium qui grandit permet d’aller plus loin.</h2>
        <p className="mt-4 leading-7 text-muted-foreground">Plus la communauté Premium grandira, plus INDAMORA PLAY pourra développer ses projets et mettre en place des mécanismes de soutien aux créateurs.</p>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">{futureUses.map((item) => <div key={item} className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/60 p-4 text-sm"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{item}</div>)}</div>
      <p className="mt-8 border-t border-border/70 pt-6 text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Une précision importante :</strong> aucun montant fixe ni revenu garanti n’est promis aux artistes. La redistribution éventuelle ne sera définie par INDAMORA RECORDS que lorsque la plateforme disposera de suffisamment d’abonnés, de revenus et de données pour mettre en place un système équitable et transparent.</p>
    </section>

     {statusMessage && <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-primary/30 bg-primary/10 px-5 py-4 text-center text-sm text-primary">{statusMessage}</div>}
     {isSignedIn && billingStatus.data?.subscription && <div className="mx-auto mt-4 flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center text-sm text-muted-foreground"><span>Statut Premium Stripe : <strong className="text-foreground">{billingStatus.data.status}</strong></span><button type="button" onClick={async () => { const { url } = await billingRequest<{ url: string }>('/api/billing/portal', { method: 'POST' }); window.location.assign(url); }} className="rounded-full border border-border px-4 py-2 font-bold hover:border-primary hover:text-primary">Gérer mon abonnement</button></div>}
     <p className="mx-auto mt-10 max-w-xl text-center text-xs leading-5 text-muted-foreground">Les abonnements permettent actuellement de contribuer au fonctionnement et au développement de la plateforme associative INDAMORA PLAY ainsi qu’à la promotion des artistes. Lorsque les ressources de l’association le permettront, une partie pourra être consacrée à des actions de soutien ou de rémunération des artistes. Cela ne constitue pas une garantie de rémunération.</p>
  </div>;
}

function Support() {
  const amounts = [1, 5, 10, 20, 50, 100];
  const [selectedAmount, setSelectedAmount] = useState<number>(10);
  const { toast } = useToast();
  const checkout = useMutation({
    mutationFn: (amountEur: number) => billingRequest<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ kind: 'donation', amountEur }) }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error: Error) => toast({ title: 'Don indisponible', description: error.message, variant: 'destructive' }),
  });
  const statusMessage = checkoutStatusMessage();
  const chooseAmount = (amount: number) => {
    setSelectedAmount(amount);
  };
  const displayAmount = selectedAmount;
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20">
    <div className="grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-start">
      <div>
        <div className="w-40 rounded-2xl bg-white p-2 shadow-[var(--shadow-card)]"><Logo variant="full" /></div>
        <div className="mt-8 font-mono text-[10px] uppercase tracking-[.22em] text-primary">Donner / Soutenir INDAMORA</div>
        <h1 className="display mt-3 text-5xl font-bold leading-none md:text-7xl">Chaque contribution<br /><span className="text-primary">compte.</span></h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">Votre don aide INDAMORA à développer INDAMORA PLAY, à soutenir les artistes indépendants à travers VOIX DE L’AVENIR et à faire grandir nos projets.</p>
        <div className="mt-8 rounded-2xl border border-border bg-muted p-5 text-sm leading-6 text-muted-foreground">
          <strong className="text-foreground">VOIX DE L’AVENIR</strong> est une branche de l’écosystème INDAMORA dédiée aux artistes indépendants et aux projets de l’association.
        </div>
      </div>
      <section className="rounded-[2rem] border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-9">
        <div className="flex items-center justify-between gap-4">
          <div><h2 className="display text-3xl font-bold">Choisir une contribution</h2><p className="mt-2 text-sm text-muted-foreground">Le don est indépendant de l’abonnement Premium.</p></div>
          <HeartHandshake className="h-8 w-8 shrink-0 text-primary" />
        </div>
        <div className="mt-8 grid grid-cols-3 gap-3">{amounts.map((amount) => <button type="button" key={amount} onClick={() => chooseAmount(amount)} className={cx('rounded-2xl border px-3 py-4 font-bold transition-colors', selectedAmount === amount ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')} data-testid={`button-donation-${amount}`}>{amount} €</button>)}</div>
         <p className="mt-5 text-sm text-muted-foreground">Choisissez un montant prédéfini. Les dons personnalisés pourront être ajoutés après validation du catalogue Stripe.</p>
        <div className="mt-6 rounded-2xl bg-secondary p-5 text-secondary-foreground"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Votre sélection</div><div className="mt-2 text-3xl font-bold">{displayAmount > 0 ? `${displayAmount} €` : 'À définir'}</div></div>
         <button type="button" disabled={checkout.isPending} onClick={() => checkout.mutate(selectedAmount)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-donation-checkout"><HeartHandshake className="h-4 w-4" />{checkout.isPending ? 'Ouverture de Checkout…' : `Faire un don de ${selectedAmount} € avec Stripe`}</button>
         {statusMessage && <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-center text-xs leading-5 text-primary">{statusMessage}</p>}
         <p className="mt-4 text-center text-xs leading-5 text-muted-foreground">Le paiement est traité par Stripe Checkout. La confirmation affichée par INDAMORA PLAY dépend de la confirmation serveur Stripe.</p>
      </section>
    </div>
    <div className="mt-14 grid gap-4 md:grid-cols-3">
      {['Développer INDAMORA PLAY', 'Accompagner les artistes indépendants', 'Faire grandir les projets INDAMORA'].map((item) => <div key={item} className="rounded-2xl border border-border bg-card p-5"><Check className="h-5 w-5 text-primary" /><h2 className="mt-4 font-bold">{item}</h2></div>)}
    </div>
    <p className="mx-auto mt-10 max-w-2xl text-center text-xs leading-5 text-muted-foreground">Aucune déductibilité fiscale, aucun pourcentage reversé et aucun revenu artistique ne sont garantis par cette présentation.</p>
  </div>;
}

function RecordsPage() {
  useEffect(() => {
    const previousTitle = document.title;
    const description = document.querySelector('meta[name="description"]');
    const previousDescription = description?.getAttribute('content') ?? null;
    document.title = 'INDAMORA RECORDS — Créer. Produire. Développer. Faire rayonner les talents.';
    if (description) {
      description.setAttribute('content', 'INDAMORA RECORDS, un écosystème créatif dédié à la production, au développement, à la promotion et à la diffusion de projets artistiques et musicaux entre la France, l’Afrique et les diasporas.');
    }
    return () => {
      document.title = previousTitle;
      if (description && previousDescription !== null) description.setAttribute('content', previousDescription);
    };
  }, []);

  const poles = [
    { name: 'INDAMORA TV', description: 'Plateforme audiovisuelle consacrée aux freestyles, clips, interviews, sessions live et contenus originaux.', icon: Video },
    { name: 'INDAMORA MEDIA.FM', description: 'Un espace dédié à la diffusion, à la promotion et à la mise en avant des artistes et des projets musicaux.', icon: Radio },
    { name: 'LES STRATÈGES VISUELS', description: 'Direction artistique, identité visuelle, image de marque et communication créative.', icon: Palette },
    { name: 'GOSPEL FRANCOPHONE AWARDS', description: 'Une initiative destinée à mettre en lumière et valoriser les acteurs et talents du gospel francophone.', icon: Award },
    { name: 'RCA TALENTS CHANNEL', description: 'Une plateforme consacrée à la découverte et à la promotion des artistes émergents.', icon: Sparkles },
    { name: 'MEDIA.GOSPEL · UNIVERS GOSPEL', description: 'Des plateformes dédiées à la culture gospel, à son actualité, ses artistes et ses initiatives.', icon: Mic2 },
    { name: 'SHOWBIZZ AWARDS FRANCE', description: 'Des événements et initiatives consacrés à la mise en valeur des talents et des acteurs de l’industrie artistique et culturelle.', icon: Award },
    { name: 'LE MONDE DU GOSSIP', description: 'Un média consacré aux actualités, tendances et personnalités de la culture et du divertissement.', icon: Newspaper },
    { name: 'ROSE AFRICA MAGAZINE', description: 'Un média culturel mettant en avant l’Afrique, ses talents, ses cultures et ses diasporas.', icon: Camera },
    { name: 'RADIO INDAMORA', description: 'Un espace de diffusion dédié à la musique, aux artistes et aux contenus de l’univers INDAMORA.', icon: Radio },
    { name: 'ASSOCIATION VOIX DE L’AVENIR', description: 'Une initiative tournée vers l’accompagnement, la valorisation et la mise en lumière des talents et des initiatives porteuses d’avenir.', icon: HandHeart },
    { name: 'INDAMORA PLAY', description: 'Une plateforme musicale pensée pour offrir un espace de découverte, d’écoute et de valorisation des artistes et de leurs projets.', icon: Headphones, featured: true },
  ];
  const services = [
    ['Production & enregistrement', 'Accompagnement de vos projets musicaux, de la prise de voix à la production.', AudioLines],
    ['Composition & arrangement', 'Création, écriture, composition et arrangements adaptés à votre identité artistique.', FileMusic],
    ['Mixage & mastering', 'Finalisation technique de vos titres pour une qualité adaptée aux standards de diffusion.', Zap],
    ['Production & exploitation musicale', 'Accompagnement dans la structuration, la production et la valorisation de vos œuvres musicales.', Disc3],
    ['Communication & promotion', 'Développement de stratégies de communication et de visibilité autour de vos sorties et projets.', Megaphone],
    ['Création de contenus', 'Conception de contenus photo, vidéo et digitaux pour développer votre image et votre présence en ligne.', Camera],
    ['Audiovisuel', 'Production de contenus audiovisuels : clips, interviews, freestyles, sessions live et formats éditoriaux.', Video],
    ['Développement de carrière', 'Accompagnement dans la structuration de votre projet artistique et le développement de votre visibilité.', Briefcase],
  ] as const;

  return <div>
    <section className="relative overflow-hidden bg-secondary text-secondary-foreground">
      <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full border-[38px] border-accent/70 opacity-80 md:h-[30rem] md:w-[30rem]" />
      <div className="absolute bottom-[-5rem] left-[44%] h-48 w-48 rotate-12 border-[18px] border-primary/70 md:h-72 md:w-72" />
      <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-12 lg:px-8 lg:pb-24 lg:pt-20">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-secondary-foreground/70 transition-colors hover:text-accent" data-testid="link-records-back-home"><ChevronLeft className="h-4 w-4" /> Retour à INDAMORA PLAY</Link>
        <div className="mt-14 grid items-end gap-12 lg:grid-cols-[1.15fr_.85fr]">
          <div className="animate-rise-in">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-secondary-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.18em] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> L’écosystème INDAMORA</div>
            <h1 className="display max-w-4xl text-5xl font-bold leading-[.94] md:text-7xl"><span className="mb-5 block font-mono text-sm font-medium uppercase tracking-[.2em] text-accent md:text-base">INDAMORA RECORDS</span>Créer. Produire.<br /><span className="text-accent">Développer.</span></h1>
            <p className="mt-7 max-w-2xl text-xl font-semibold leading-8 text-secondary-foreground/90">Faire rayonner les talents.</p>
            <p className="mt-5 max-w-2xl text-base leading-7 text-secondary-foreground/75 md:text-lg">Bien plus qu’un label : un écosystème créatif au service des talents.</p>
            <p className="mt-5 max-w-2xl leading-7 text-secondary-foreground/70">INDAMORA RECORDS est une structure indépendante dédiée à la production, au développement, à la promotion et à la diffusion de projets artistiques et musicaux, avec une ambition forte : créer des passerelles entre la France, l’Afrique et les diasporas.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href="#poles" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-1" data-testid="link-records-poles">Découvrir l’écosystème <ArrowRight className="h-4 w-4" /></a>
              <Link href="/submit" className="inline-flex items-center gap-2 rounded-full border border-secondary-foreground/25 px-5 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent" data-testid="link-records-submit">Présenter un projet <Send className="h-4 w-4" /></Link>
            </div>
          </div>
          <div className="relative rounded-[2rem] border border-secondary-foreground/15 bg-secondary-foreground/5 p-6 backdrop-blur-sm md:p-8">
            <div className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Notre relation</div>
            <div className="mt-7 space-y-3">
              <div className="rounded-2xl bg-accent px-5 py-4 text-center font-bold text-accent-foreground">INDAMORA RECORDS<span className="mt-1 block text-xs font-medium opacity-75">L’écosystème créatif</span></div>
              <div className="text-center text-2xl text-accent" aria-hidden="true">↓</div>
              <Link href="/" className="block rounded-2xl border border-secondary-foreground/20 bg-background/10 px-5 py-4 text-center font-bold transition-colors hover:border-accent"><span>INDAMORA PLAY</span><span className="mt-1 block text-xs font-medium text-secondary-foreground/70">Une plateforme de INDAMORA RECORDS</span></Link>
            </div>
            <p className="mt-7 text-center text-xs leading-5 text-secondary-foreground/60">Musique · artistes · RÉPERTOIRE · découverte · écoute · contenus</p>
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Notre vision</div><h2 className="display mt-3 text-4xl font-bold leading-tight md:text-5xl">Révéler, structurer<br /><span className="text-primary">et faire rayonner.</span></h2></div>
        <div className="space-y-5 text-lg leading-8 text-muted-foreground"><p>Nous croyons que chaque talent mérite les moyens, l’accompagnement et la visibilité nécessaires pour transformer son potentiel en véritable projet.</p><p>Notre ambition est de créer des ponts entre les talents, les cultures et les opportunités, tout en contribuant à faire émerger une nouvelle génération d’artistes et de créateurs issus de France, d’Afrique et des diasporas.</p><p>INDAMORA RECORDS évolue comme un écosystème créatif en mouvement, pensé pour révéler, structurer et faire rayonner les talents.</p></div>
      </div>
    </section>

    <section id="poles" className="bg-muted">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Nos pôles & médias</div><h2 className="display mt-3 text-4xl font-bold leading-tight md:text-5xl">Un écosystème pour<br /><span className="text-primary">aller plus loin.</span></h2><p className="mt-5 leading-7 text-muted-foreground">Des médias, activités, initiatives et projets qui se complètent sans perdre leur identité.</p></div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {poles.map(({ name, description, icon: Icon, featured }) => <div key={name} className={cx('rounded-[1.5rem] border p-5 transition-all hover:-translate-y-1 hover:border-primary/60', featured ? 'border-primary/50 bg-secondary text-secondary-foreground shadow-lg' : 'border-border bg-card')} data-testid={`card-records-pole-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}>
            <div className={cx('grid h-11 w-11 place-items-center rounded-2xl', featured ? 'bg-accent text-accent-foreground' : 'bg-primary/10 text-primary')}><Icon className="h-5 w-5" /></div>
            <h3 className="mt-5 font-bold">{name}</h3><p className={cx('mt-2 text-sm leading-6', featured ? 'text-secondary-foreground/75' : 'text-muted-foreground')}>{description}</p>
            {featured && <Link href="/" className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline" data-testid="link-records-play">Accéder à INDAMORA PLAY <ArrowRight className="h-3 w-3" /></Link>}
          </div>)}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
      <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
        <div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Pour les artistes & créateurs</div><h2 className="display mt-3 text-4xl font-bold leading-tight md:text-5xl">Donnez une dimension nouvelle<br /><span className="text-primary">à votre talent.</span></h2></div>
        <div><p className="max-w-2xl text-lg leading-8 text-muted-foreground">Vous êtes artiste, auteur, compositeur, interprète ou porteur d’un projet musical ? INDAMORA RECORDS vous accompagne dans la transformation de votre idée en un projet structuré, professionnel et visible.</p><p className="mt-5 max-w-2xl leading-7 text-muted-foreground">De la création à la diffusion, nous mettons notre savoir-faire et notre écosystème au service du développement de votre projet.</p><Link href="/submit" className="mt-7 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition-transform hover:-translate-y-0.5" data-testid="link-records-artist-cta">Proposer une œuvre à INDAMORA PLAY <ArrowRight className="h-4 w-4" /></Link></div>
      </div>
      <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {services.map(([title, description, Icon]) => <div key={title} className="rounded-2xl border border-border bg-card p-5"><Icon className="h-5 w-5 text-primary" /><h3 className="mt-5 font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div>)}
      </div>
    </section>

    <section className="bg-secondary text-secondary-foreground">
      <div className="mx-auto max-w-7xl px-5 py-16 lg:px-8 lg:py-24">
        <div className="max-w-2xl"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-accent">De la première note à la réalisation du projet</div><h2 className="display mt-3 text-4xl font-bold leading-tight md:text-5xl">Vous avez le talent.<br /><span className="text-accent">Nous lui donnons une direction.</span></h2><p className="mt-5 leading-7 text-secondary-foreground/70">Chez INDAMORA RECORDS, nous souhaitons construire des collaborations durables avec les artistes et créateurs que nous accompagnons.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[['CRÉER', 'Donner vie aux idées et aux projets.', Sparkles], ['PRODUIRE', 'Mettre en place les ressources et les compétences nécessaires à leur réalisation.', Briefcase], ['DÉVELOPPER', 'Construire leur visibilité et créer des opportunités de rayonnement.', ArrowRight]].map(([title, text, Icon]) => <div key={title as string} className="rounded-[1.5rem] border border-secondary-foreground/15 bg-secondary-foreground/5 p-6"><Icon className="h-6 w-6 text-accent" /><div className="mt-8 font-mono text-xs tracking-[.2em] text-accent">{title as string}</div><p className="mt-3 font-semibold leading-6">{text as string}</p></div>)}
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-5xl px-5 py-16 text-center lg:px-8 lg:py-24">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Mail className="h-6 w-6" /></div>
      <div className="mt-6 font-mono text-[10px] uppercase tracking-[.22em] text-primary">Vous avez un projet ?</div>
      <h2 className="display mt-3 text-4xl font-bold md:text-6xl">Parlons de votre projet.</h2>
      <p className="mx-auto mt-5 max-w-xl leading-7 text-muted-foreground">Vous souhaitez présenter un morceau, développer votre carrière, produire un contenu ou collaborer avec notre écosystème ?</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <a href="mailto:indamorarecords@gmail.com" className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground hover:-translate-y-0.5" data-testid="link-records-email"><Mail className="h-4 w-4" /> indamorarecords@gmail.com</a>
        <a href="tel:+33780118869" className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-records-phone"><ExternalLink className="h-4 w-4" /> 07 80 11 88 69</a>
      </div>
      <div className="mx-auto mt-16 max-w-2xl border-t border-border pt-8"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">INDAMORA RECORDS</div><p className="display mt-3 text-2xl font-bold">Créer. Produire. Développer. Faire rayonner les talents.</p><Link href="/" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline" data-testid="link-records-final-home">Retourner à INDAMORA PLAY <ArrowRight className="h-4 w-4" /></Link></div>
    </section>
  </div>;
}

function AuthPage({ children }: { children: ReactNode }) {
  return <div className="min-h-[calc(100dvh-4.5rem)] bg-secondary px-4 py-10 text-foreground md:grid md:place-items-center"><div className="w-full max-w-2xl rounded-[2rem] bg-background p-3 shadow-2xl md:p-6"><div className="mb-4 flex justify-center"><Link href="/" data-testid="link-auth-logo" aria-label="Retour à l’accueil"><Logo variant="full" className="max-w-[11rem]" /></Link></div>{children}</div></div>;
}

type ArtistProfileFormValues = {
  name: string;
  category: string;
  bio: string;
  location: string;
  specialties: string[];
};

function ArtistProfileForm({
  artist,
  defaultName,
  onSaved,
}: {
  artist: Artist | null;
  defaultName: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const createArtist = useCreateArtist();
  const updateArtist = useUpdateArtist();
  const [values, setValues] = useState<ArtistProfileFormValues>(() => ({
    name: artist?.name ?? defaultName,
    category: artist?.category ?? 'Musique',
    bio: artist?.bio ?? '',
    location: artist?.location ?? '',
    specialties: artist?.specialties ?? [],
  }));
  const [activityError, setActivityError] = useState('');

  useEffect(() => {
    setValues({
      name: artist?.name ?? defaultName,
      category: artist?.category ?? 'Musique',
      bio: artist?.bio ?? '',
      location: artist?.location ?? '',
      specialties: artist?.specialties ?? [],
    });
  }, [artist, defaultName]);

  const toggleActivity = (activity: string) => {
    setValues((current) => {
      if (current.specialties.includes(activity)) {
        setActivityError('');
        return { ...current, specialties: current.specialties.filter((item) => item !== activity) };
      }
      if (current.specialties.length >= 2) {
        setActivityError('Deux activités maximum peuvent être sélectionnées.');
        return current;
      }
      setActivityError('');
      return { ...current, specialties: [...current.specialties, activity] };
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = values.name.trim();
    const bio = values.bio.trim();
    const location = values.location.trim();
    if (name.length < 2 || bio.length < 10 || location.length < 2) {
      toast({ title: 'Profil incomplet', description: 'Renseignez un nom, une localisation et une bio valide.', variant: 'destructive' });
      return;
    }
    if (values.specialties.length < 1 || values.specialties.length > 2) {
      setActivityError('Sélectionnez une ou deux activités.');
      return;
    }

    const data = {
      name,
      category: values.category,
      bio,
      location,
      specialties: values.specialties,
      profileGroup: profileGroupForActivities(values.specialties),
      subcategory: values.specialties[0],
    };
    const options = {
      onSuccess: () => {
        onSaved();
        toast({
          title: artist ? 'Profil mis à jour' : 'Profil créé',
          description: artist
            ? 'Votre modification sera visible après validation.'
            : 'Votre profil sera visible dans le RÉPERTOIRE après validation.',
        });
      },
      onError: () => {
        toast({ title: 'Impossible d’enregistrer', description: 'Vérifiez les champs puis réessayez.', variant: 'destructive' });
      },
    };
    if (artist) {
      updateArtist.mutate({ id: artist.id, data }, options);
    } else {
      createArtist.mutate({ data }, options);
    }
  };

  const pending = createArtist.isPending || updateArtist.isPending;
  return <section className="mt-12 rounded-[2rem] border border-border bg-card p-6 md:p-8">
    <div className="max-w-2xl">
      <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Je crée</div>
      <h2 className="display mt-2 text-3xl font-bold">{artist ? 'Modifier mon profil créatif' : 'Présentez votre univers'}</h2>
      <p className="mt-3 leading-7 text-muted-foreground">Choisissez une ou deux activités structurées. Votre bio reste libre pour raconter votre parcours et vos autres compétences.</p>
    </div>
    <form onSubmit={submit} className="mt-8 grid gap-5 md:grid-cols-2">
      <label className="grid gap-2 text-sm font-bold">Nom affiché
        <input value={values.name} onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))} minLength={2} maxLength={120} required className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="input-artist-profile-name" />
      </label>
      <label className="grid gap-2 text-sm font-bold">Catégorie principale
        <select value={values.category} onChange={(event) => setValues((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="select-artist-profile-category">
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-bold md:col-span-2">Localisation
        <input value={values.location} onChange={(event) => setValues((current) => ({ ...current, location: event.target.value }))} minLength={2} maxLength={120} required placeholder="Ville, pays ou diaspora" className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="input-artist-profile-location" />
      </label>
      <div className="grid gap-2 md:col-span-2">
        <div className="text-sm font-bold">Activités <span className="font-normal text-muted-foreground">(1 ou 2 maximum)</span></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {creationActivities.map(([activity, icon]) => {
            const selected = values.specialties.includes(activity);
            return <button key={activity} type="button" onClick={() => toggleActivity(activity)} className={cx('rounded-xl border px-3 py-3 text-left text-sm font-semibold transition-colors', selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-background hover:border-primary/60')} aria-pressed={selected} data-testid={`button-artist-activity-${activity.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`}><span className="mr-2" aria-hidden="true">{icon}</span>{activity}</button>;
          })}
        </div>
        {activityError && <p className="text-xs text-destructive">{activityError}</p>}
        {values.specialties.length > 2 && <p className="text-xs text-destructive">Ce profil existant contient plus de deux activités. Retirez-en avant d’enregistrer une modification.</p>}
      </div>
      <label className="grid gap-2 text-sm font-bold md:col-span-2">Bio / présentation
        <textarea value={values.bio} onChange={(event) => setValues((current) => ({ ...current, bio: event.target.value }))} minLength={10} maxLength={2000} required rows={6} placeholder="Parlez de votre parcours, de vos compétences et de vos autres activités." className="resize-y rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="textarea-artist-profile-bio" />
      </label>
      <div className="flex flex-wrap items-center gap-3 md:col-span-2">
        <button type="submit" disabled={pending} className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-save-artist-profile">{pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{artist ? 'Enregistrer la modification' : 'Créer mon profil'}</button>
        {artist && artist.profileGroup === 'artists' && <span className="text-xs text-muted-foreground">Les modifications repassent par la validation du profil.</span>}
      </div>
    </form>
  </section>;
}

function Profile() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();
  const myArtist = useGetMyArtist({ query: { enabled: Boolean(isSignedIn), queryKey: getGetMyArtistQueryKey() } });
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  const name = user?.fullName ?? user?.firstName ?? 'Membre INDAMORA';
  if (myArtist.isLoading) return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8"><div className="skeleton h-72 rounded-[2rem]" /></div>;
  if (myArtist.error) return <div className="mx-auto max-w-2xl px-5 py-20"><QueryState error={myArtist.error} onRetry={() => void myArtist.refetch()} label="profil INDAMORA" /></div>;

  const professionalProfile = myArtist.data?.specialties.length ? myArtist.data : null;
  const space = professionalProfile ? professionalSpaceCopy(professionalProfile) : null;
  const canSubmit = canSubmitWorks(professionalProfile);
  const refreshProfile = () => {
    void queryClient.invalidateQueries({ queryKey: getGetMyArtistQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getGetArtistsQueryKey() });
  };

  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex flex-col gap-6 rounded-[2rem] bg-secondary p-7 text-secondary-foreground md:flex-row md:items-center md:justify-between md:p-10">
      <div className="flex items-center gap-5">
        <Avatar name={name} src={user?.imageUrl} size="lg" />
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">{space?.eyebrow ?? 'Mon espace visiteur'}</div>
          <h1 className="display mt-2 text-4xl font-bold">{name}</h1>
          <p className="mt-1 text-secondary-foreground/70">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
      </div>
      <button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="inline-flex items-center justify-center gap-2 rounded-full border border-secondary-foreground/25 px-4 py-2 text-sm font-bold hover:border-accent hover:text-accent" data-testid="button-profile-logout">Se déconnecter</button>
    </div>

    <section className="mt-8 rounded-[2rem] border border-border bg-card p-6 md:p-8">
      <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{space?.eyebrow ?? 'Espace visiteur / auditeur'}</div>
      <h2 className="display mt-2 text-3xl font-bold">{space?.title ?? 'Mon espace visiteur'}</h2>
      <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">{space?.description ?? 'Découvrez les artistes, consultez le RÉPERTOIRE, gérez votre abonnement et soutenez INDAMORA sans accès aux outils réservés aux professionnels.'}</p>
      {professionalProfile && <div className="mt-5 flex flex-wrap gap-2">{professionalProfile.specialties.map((activity) => <span key={activity} className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1.5 text-sm font-bold text-primary">{activity}</span>)}</div>}
    </section>

    <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {isAdminUser(user) && <Link href="/administration" className="rounded-2xl border border-primary/40 bg-primary/5 p-6 hover:border-primary"><LayoutDashboard className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Centre de pilotage ADMIN</h2></Link>}
      <Link href="/explorer" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><History className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Mes découvertes</h2></Link>
      <Link href="/repertoire" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><UsersRound className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">RÉPERTOIRE</h2></Link>
      {professionalProfile && <Link href="/espace-artiste" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><FileMusic className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">{space?.title}</h2></Link>}
      {canSubmit && <Link href="/submit" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><Send className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Proposer une œuvre</h2></Link>}
      <Link href="/pricing" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><Crown className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Mon abonnement</h2></Link>
      <Link href="/soutenir" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><HeartHandshake className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Soutenir INDAMORA</h2></Link>
    </div>

    {!professionalProfile && <div className="mt-12 rounded-[2rem] bg-primary/5 p-6 md:p-8"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">🎨 Je crée mon espace</div><h2 className="display mt-2 text-3xl font-bold">Créer mon espace professionnel</h2><p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Choisissez une ou deux activités pour accéder aux outils correspondant à votre profil.</p></div>}
    <ArtistProfileForm artist={professionalProfile} defaultName={name} onSaved={refreshProfile} />
  </div>;
}

function ArtistSpace() {
  const { isSignedIn, user } = useUser();
  const queryClient = useQueryClient();
  const myArtist = useGetMyArtist({ query: { enabled: Boolean(isSignedIn), queryKey: getGetMyArtistQueryKey() } });
  const professionalProfile = myArtist.data?.specialties.length ? myArtist.data : null;
  const canSubmit = canSubmitWorks(professionalProfile);
  const submissions = useGetSubmissions(undefined, { query: { enabled: Boolean(isSignedIn && canSubmit), queryKey: getGetSubmissionsQueryKey() } });
  const deleteFiles = useDeleteSubmissionFiles();
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (myArtist.isLoading) return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8"><div className="skeleton h-72 rounded-[2rem]" /></div>;
  if (myArtist.error) return <div className="mx-auto max-w-2xl px-5 py-20"><QueryState error={myArtist.error} onRetry={() => void myArtist.refetch()} label="profil professionnel" /></div>;
  if (!professionalProfile) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-primary" /><h1 className="display mt-5 text-4xl font-bold">Espace professionnel non activé</h1><p className="mt-3 text-muted-foreground">Créez d’abord votre profil INDAMORA et choisissez une ou deux activités.</p><Link href="/profil" className="mt-7 inline-flex rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground">Créer mon espace professionnel</Link></div>;
  const space = professionalSpaceCopy(professionalProfile);
  const statusLabel = (status: string) => status === 'approved' ? 'Validée' : status === 'rejected' ? 'Refusée' : 'En attente';
  const removeFiles = (submission: Submission) => {
    if (!window.confirm(`Supprimer définitivement les fichiers de « ${submission.title} » ? Cette action est irréversible.`)) return;
    deleteFiles.mutate({ id: submission.id }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() }) });
  };
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex flex-col gap-6 rounded-[2rem] bg-primary p-7 text-primary-foreground md:flex-row md:items-end md:justify-between md:p-10">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary-foreground/70">{space.eyebrow}</div>
        <h1 className="display mt-3 text-5xl font-bold">{space.title}</h1>
        <p className="mt-4 max-w-xl leading-7 text-primary-foreground/80">{space.description}</p>
        <div className="mt-5 flex flex-wrap gap-2">{professionalProfile.specialties.map((activity) => <span key={activity} className="rounded-full bg-background/15 px-3 py-1 text-xs font-bold">{activity}</span>)}</div>
      </div>
      {canSubmit && <Link href="/submit" className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-5 py-3 text-sm font-bold text-foreground" data-testid="link-artist-submit"><Plus className="h-4 w-4" /> Envoyer une œuvre</Link>}
    </div>

    {!canSubmit ? <div className="mt-12 grid gap-4 sm:grid-cols-2"><Link href="/profil" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><UserRound className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Mon profil professionnel</h2><p className="mt-2 text-sm text-muted-foreground">Mettez à jour votre présentation et vos activités.</p></Link><Link href="/repertoire" className="rounded-2xl border border-border bg-card p-6 hover:border-primary"><UsersRound className="h-6 w-6 text-primary" /><h2 className="mt-5 font-bold">Ma visibilité dans le RÉPERTOIRE</h2><p className="mt-2 text-sm text-muted-foreground">Consultez les profils professionnels publiés.</p></Link></div> : <>
      <div className="mt-12 grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-border bg-card p-5"><div className="text-3xl font-bold">{submissions.data?.length ?? 0}</div><p className="mt-1 text-sm text-muted-foreground">Œuvres envoyées</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="text-3xl font-bold text-accent-foreground">{submissions.data?.filter((item) => item.status === 'approved').length ?? 0}</div><p className="mt-1 text-sm text-muted-foreground">Validées</p></div><div className="rounded-2xl border border-border bg-card p-5"><div className="text-3xl font-bold">{submissions.data?.filter((item) => item.status === 'pending').length ?? 0}</div><p className="mt-1 text-sm text-muted-foreground">En attente</p></div></div>
      <section className="mt-12"><SectionHeading eyebrow="Suivi des propositions" title="Le chemin de vos œuvres" />{submissions.isLoading ? <div className="space-y-3"><div className="skeleton h-24 rounded-2xl" /><div className="skeleton h-24 rounded-2xl" /></div> : submissions.error ? <QueryState error={submissions.error} onRetry={() => void submissions.refetch()} label="espace professionnel" /> : <div className="space-y-3">{(submissions.data ?? []).slice(0, 6).map((item) => <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-muted text-primary"><FileMusic className="h-5 w-5" /></div><div className="min-w-0 flex-1"><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{categoryLabel(item.category)} · Envoyée le {new Date(item.submittedAt).toLocaleDateString('fr-FR')}</p></div><div className="flex flex-col items-end gap-2"><span className={cx('rounded-full px-3 py-1 text-xs font-bold', item.status === 'approved' ? 'bg-secondary/10 text-secondary' : item.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-accent/20 text-foreground')}>{statusLabel(item.status)}</span>{item.status === 'rejected' && (item.mediaObjectPath || item.coverObjectPath) && <button disabled={deleteFiles.isPending} onClick={() => removeFiles(item)} className="inline-flex items-center gap-2 rounded-full border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:border-destructive disabled:opacity-50" data-testid={`button-artist-delete-submission-files-${item.id}`}><Trash2 className="h-3.5 w-3.5" /> Supprimer les fichiers</button>}</div></div>)}</div>}</section>
    </>}
  </div>;
}

function AdminDashboard() {
  const { isSignedIn, user } = useUser();
  const isAdmin = isAdminUser(user);
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const overview = useQuery({
    queryKey: ['admin-overview', days],
    queryFn: () => billingRequest<AdminOverview>(`/api/admin/overview?days=${days}`),
    enabled: Boolean(isSignedIn && isAdmin),
  });
  if (!isSignedIn) return <Redirect to="/sign-in" />;
  if (!isAdmin) return <div className="mx-auto max-w-2xl px-5 py-24 text-center"><ShieldCheck className="mx-auto h-10 w-10 text-destructive" /><h1 className="display mt-5 text-4xl font-bold">Accès réservé</h1><p className="mt-3 text-muted-foreground">L’administration est réservée à l’équipe INDAMORA RECORDS.</p></div>;
  if (overview.isLoading) return <div className="mx-auto max-w-7xl px-5 py-20 lg:px-8"><LoadingCards count={8} /></div>;
  if (overview.error || !overview.data) return <div className="mx-auto max-w-2xl px-5 py-20"><QueryState error={overview.error ?? new Error('Données indisponibles')} onRetry={() => void overview.refetch()} label="admin-overview" /></div>;
  const data = overview.data;
  const display = (value: number | null) => value === null ? '—' : value;
  const auditActionLabel = (action: string) => ({
    'profile.updated': 'Profil modifié',
    'submission.approved_and_published': 'Soumission validée et publiée',
    'submission.approved': 'Soumission validée',
    'submission.rejected': 'Soumission refusée',
    'submission.files_deleted': 'Fichiers de soumission supprimés',
  }[action] ?? action);
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Tableau de bord privé</div><h1 className="display mt-3 text-5xl font-bold">Piloter INDAMORA<br /><span className="text-primary">RECORDS.</span></h1><p className="mt-4 text-muted-foreground">Données réelles du site, de Clerk, de la base et de Stripe.</p></div><div className="flex flex-wrap gap-2"><Link href="/moderation" className="inline-flex items-center justify-center gap-2 rounded-full bg-secondary px-5 py-3 text-sm font-bold text-secondary-foreground" data-testid="link-dashboard-moderation"><ShieldCheck className="h-4 w-4" /> Modération</Link><Link href="/repertoire" className="inline-flex items-center justify-center gap-2 rounded-full border border-border px-5 py-3 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-dashboard-directory"><UsersRound className="h-4 w-4" /> Répertoire</Link></div></div>
    <div className="mt-10 flex flex-wrap items-center justify-between gap-3"><h2 className="display text-2xl font-bold">Activité sur {data.periodDays === 1 ? '24 heures' : `${data.periodDays} jours`}</h2><div className="flex gap-2">{([1, 7, 30] as const).map((period) => <button key={period} type="button" onClick={() => setDays(period)} className={cx('rounded-full border px-3 py-1.5 text-xs font-bold', days === period ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')} data-testid={`button-admin-period-${period}`}>{period === 1 ? 'Aujourd’hui' : `${period} jours`}</button>)}</div></div>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-border bg-card p-5"><BarChart3 className="h-5 w-5 text-primary" /><div className="mt-5 text-3xl font-bold">{data.visits.count}</div><p className="mt-1 text-sm text-muted-foreground">Visites</p><p className="mt-2 text-xs text-muted-foreground">{data.visits.uniqueVisitors} visiteurs uniques estimés</p></div><div className="rounded-2xl border border-border bg-card p-5"><UserRound className="h-5 w-5 text-primary" /><div className="mt-5 text-3xl font-bold">{display(data.counts.users)}</div><p className="mt-1 text-sm text-muted-foreground">Utilisateurs inscrits</p></div><div className="rounded-2xl border border-border bg-card p-5"><UsersRound className="h-5 w-5 text-secondary" /><div className="mt-5 text-3xl font-bold">{data.counts.artists}</div><p className="mt-1 text-sm text-muted-foreground">Profils artistes</p><p className="mt-2 text-xs text-muted-foreground">{data.counts.publishedArtists} publiés</p></div><div className="rounded-2xl border border-border bg-card p-5"><FileMusic className="h-5 w-5 text-accent-foreground" /><div className="mt-5 text-3xl font-bold">{data.counts.works}</div><p className="mt-1 text-sm text-muted-foreground">Œuvres publiées</p></div></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-2xl border border-accent/40 bg-accent/10 p-5"><LoaderCircle className="h-5 w-5 text-accent-foreground" /><div className="mt-5 text-3xl font-bold">{data.counts.pendingSubmissions}</div><p className="mt-1 text-sm text-muted-foreground">Soumissions en attente</p></div><div className="rounded-2xl border border-border bg-card p-5"><Newspaper className="h-5 w-5 text-primary" /><div className="mt-5 text-3xl font-bold">{data.counts.pendingPressRequests}</div><p className="mt-1 text-sm text-muted-foreground">Demandes presse en attente</p></div><div className="rounded-2xl border border-border bg-card p-5"><Crown className="h-5 w-5 text-primary" /><div className="mt-5 text-3xl font-bold">{display(data.stripe.activeSubscriptions)}</div><p className="mt-1 text-sm text-muted-foreground">Abonnements actifs</p></div><div className="rounded-2xl border border-border bg-card p-5"><HeartHandshake className="h-5 w-5 text-primary" /><div className="mt-5 text-3xl font-bold">{data.stripe.donations.totalEur === null ? '—' : `${data.stripe.donations.totalEur.toFixed(2)} €`}</div><p className="mt-1 text-sm text-muted-foreground">{data.stripe.donations.count === null ? 'Dons indisponibles' : `${data.stripe.donations.count} don(s) confirmé(s)`}</p></div></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><section className="rounded-[2rem] border border-border bg-card p-6 md:p-8"><div className="flex items-center justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Activité récente</div><h2 className="display mt-2 text-2xl font-bold">Ce qui se passe</h2></div><LayoutDashboard className="h-6 w-6 text-primary" /></div>{data.activity.length === 0 ? <p className="mt-6 rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Aucune activité disponible.</p> : <div className="mt-6 divide-y divide-border">{data.activity.map((item, index) => <div key={`${item.type}-${item.createdAt}-${index}`} className="flex items-start gap-3 py-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString('fr-FR')}</p></div></div>)}</div>}</section><section className="rounded-[2rem] bg-secondary p-6 text-secondary-foreground md:p-8"><div className="font-mono text-[10px] uppercase tracking-[.18em] text-accent">Pages les plus visitées</div><h2 className="display mt-2 text-2xl font-bold">Flux du site</h2>{data.visits.topPages.length === 0 ? <p className="mt-6 rounded-2xl border border-secondary-foreground/15 px-4 py-8 text-center text-sm text-secondary-foreground/70">Aucune visite enregistrée sur cette période.</p> : <div className="mt-6 space-y-3">{data.visits.topPages.map((page) => <div key={page.path} className="flex items-center justify-between gap-3 rounded-xl bg-secondary-foreground/10 px-4 py-3 text-sm"><span className="truncate">{page.path}</span><strong>{page.visits}</strong></div>)}</div>}<Link href="/moderation" className="mt-7 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-foreground" data-testid="link-dashboard-review">Examiner la file <ArrowRight className="h-4 w-4" /></Link></section></div>
    <section className="mt-8 overflow-hidden rounded-[2rem] border border-border bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border p-6 md:p-8"><div><div className="font-mono text-[10px] uppercase tracking-[.18em] text-primary">Journal ADMIN</div><h2 className="display mt-2 text-2xl font-bold">Actions d’administration</h2><p className="mt-2 text-sm text-muted-foreground">Journal privé des validations, refus, publications, modifications et suppressions effectuées depuis l’administration.</p></div><ShieldCheck className="h-6 w-6 shrink-0 text-primary" /></div>
      {data.auditLog.length === 0 ? <p className="m-6 rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Aucune action administrateur enregistrée pour le moment.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-3">Administrateur</th><th className="px-6 py-3">Action</th><th className="px-6 py-3">Élément</th><th className="px-6 py-3">Date et heure</th><th className="px-6 py-3">Résultat</th></tr></thead><tbody className="divide-y divide-border">{data.auditLog.map((entry) => <tr key={entry.id}><td className="px-6 py-4 font-mono text-xs">{entry.administratorId}</td><td className="px-6 py-4 font-semibold">{auditActionLabel(entry.action)}</td><td className="px-6 py-4">{entry.targetLabel ?? `${entry.entityType}${entry.entityId ? ` #${entry.entityId}` : ''}`}</td><td className="px-6 py-4 text-muted-foreground">{new Date(entry.createdAt).toLocaleString('fr-FR')}</td><td className="px-6 py-4"><span className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-bold text-secondary">{entry.result === 'success' ? 'Succès' : entry.result}</span></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}

const pressSchema = z.object({
  name: z.string().min(2, 'Nom requis'),
  organization: z.string().min(2, 'Organisation requise'),
  role: z.string().min(2, 'Rôle requis'),
  email: z.string().email('E-mail invalide'),
  phone: z.string().optional(),
  requestType: z.string().min(2, 'Type de demande requis'),
  subject: z.string().min(2, 'Sujet requis'),
  message: z.string().min(10, 'Message trop court'),
  requestedDate: z.string().optional(),
});

function Presse() {
  const { toast } = useToast();
  const createPress = useCreatePressRequest();
  const form = useForm<z.infer<typeof pressSchema>>({
    resolver: zodResolver(pressSchema),
    defaultValues: { name: '', organization: '', role: '', email: '', phone: '', requestType: 'Interview', subject: '', message: '', requestedDate: '' }
  });

  const onSubmit = (data: z.infer<typeof pressSchema>) => {
    createPress.mutate({ data }, {
      onSuccess: () => {
        toast({ title: 'Demande envoyée', description: 'Notre équipe presse vous répondra dans les plus brefs délais.' });
        form.reset();
      },
      onError: () => {
        toast({ title: 'Erreur', description: 'Impossible d\'envoyer la demande.', variant: 'destructive' });
      }
    });
  };

  const { register, handleSubmit, formState: { errors } } = form;
  const pending = createPress.isPending;

  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20">
    <div className="grid gap-12 lg:grid-cols-[1fr_1.3fr] lg:items-start">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Relations Presse</div>
        <h1 className="display mt-3 text-5xl font-bold leading-[.95] md:text-6xl">Espace<br /><span className="text-primary">Médias.</span></h1>
        <p className="mt-6 leading-7 text-muted-foreground">INDAMORA PLAY met en lumière les artistes, les créations et les initiatives culturelles d’Afrique centrale et de sa diaspora. Cet espace reçoit les demandes professionnelles des journalistes, radios, télévisions et médias en ligne.</p>

        <div className="mt-10 rounded-3xl bg-secondary p-8 text-secondary-foreground shadow-sm">
          <h3 className="mb-2 flex items-center gap-2 text-lg font-bold"><Newspaper className="h-5 w-5 text-accent" /> Ressources presse</h3>
          <p className="text-sm leading-relaxed text-secondary-foreground/80">Les logos, photos officielles, visuels, présentations institutionnelles et communiqués seront publiés ici lorsqu’ils seront disponibles. Aucun document provisoire n’est présenté comme officiel.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="rounded-[2.5rem] border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-10">
        <h2 className="display mb-8 text-2xl font-bold">Nouvelle demande</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">Nom complet <input {...register('name')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Votre nom" data-testid="input-press-name" />{errors.name && <span className="text-xs text-destructive">{errors.name.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold">Média / Organisation <input {...register('organization')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Nom du média" data-testid="input-press-org" />{errors.organization && <span className="text-xs text-destructive">{errors.organization.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold">Rôle <input {...register('role')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Journaliste, Rédacteur..." data-testid="input-press-role" />{errors.role && <span className="text-xs text-destructive">{errors.role.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold">E-mail <input type="email" {...register('email')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="adresse@media.com" data-testid="input-press-email" />{errors.email && <span className="text-xs text-destructive">{errors.email.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold">Type de demande <select {...register('requestType')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="select-press-type"><option value="Interview">Interview</option><option value="Demande d’informations">Demande d’informations</option><option value="Demande de visuels">Demande de visuels</option><option value="Demande de communiqué">Demande de communiqué</option><option value="Demande de partenariat média">Partenariat média</option><option value="Autre">Autre</option></select>{errors.requestType && <span className="text-xs text-destructive">{errors.requestType.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold">Téléphone <input {...register('phone')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="+236..." data-testid="input-press-phone" /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Date souhaitée (optionnelle) <input type="date" {...register('requestedDate')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="input-press-date" /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Sujet <input {...register('subject')} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Objet de votre demande" data-testid="input-press-subject" />{errors.subject && <span className="text-xs text-destructive">{errors.subject.message}</span>}</label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">Message <textarea {...register('message')} className="min-h-32 rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Détaillez votre demande..." data-testid="textarea-press-message" />{errors.message && <span className="text-xs text-destructive">{errors.message.message}</span>}</label>
        </div>
        <button disabled={pending} className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-4 font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-press">{pending ? <><LoaderCircle className="h-5 w-5 animate-spin" /> Envoi en cours...</> : <><Send className="h-5 w-5" /> Envoyer la demande</>}</button>
      </form>
    </div>
  </div>;
}

function NotFound() {
  return <div className="mx-auto max-w-xl px-5 py-32 text-center"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">404 / hors piste</div><h1 className="display mt-4 text-6xl font-bold">Cette piste<br />n’existe pas.</h1><Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-404-home">Retour à la découverte <ArrowRight className="h-4 w-4" /></Link></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Home} /><Route path="/indamora-records" component={RecordsPage} /><Route path="/explorer" component={Explorer} /><Route path="/recherche" component={SearchPage} /><Route path="/categorie/:slug" component={CategoryPage} /><Route path="/oeuvres/:id" component={WorkPage} /><Route path="/repertoire" component={() => <Directory />} /><Route path="/artists" component={() => <Directory />} /><Route path="/artists/:id" component={ArtistProfile} /><Route path="/presse" component={Presse} /><Route path="/submit" component={Submit} /><Route path="/espace-artiste" component={ArtistSpace} /><Route path="/moderation" component={Moderation} /><Route path="/administration" component={AdminDashboard} /><Route path="/admin" component={AdminDashboard} /><Route path="/pricing" component={Pricing} /><Route path="/soutenir" component={Support} /><Route path="/inscription" component={() => <Redirect to="/sign-up" />} /><Route path="/login" component={() => <Redirect to="/sign-in" />} /><Route path="/profil" component={Profile} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => addListener(({ user }) => {
    const userId = user?.id ?? null;
    if (previousUserId.current !== undefined && previousUserId.current !== userId) {
      queryClient.clear();
    }
    previousUserId.current = userId;
  }), [addListener, queryClient]);

  return null;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return <ClerkProvider publishableKey={clerkPubKey} proxyUrl={clerkProxyUrl} appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} localization={frFR} routerPush={(to) => setLocation(stripBase(to))} routerReplace={(to) => setLocation(stripBase(to), { replace: true })}><QueryClientProvider client={queryClient}><ClerkQueryClientCacheInvalidator /><TooltipProvider><Switch><Route path="/sign-in/*?" component={() => <Shell><AuthPage><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} /></AuthPage></Shell>} /><Route path="/sign-up/*?" component={() => <Shell><AuthPage><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} /></AuthPage></Shell>} /><Route component={Router} /></Switch><Toaster /></TooltipProvider></QueryClientProvider></ClerkProvider>;
}

function App() {
  if (!clerkPubKey) throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;