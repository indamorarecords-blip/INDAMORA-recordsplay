import AdminModeration from './pages/AdminModeration';
import { type FormEvent, type ReactNode, lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp, useClerk, useUser } from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { frFR } from '@clerk/localizations';
import { shadcn } from '@clerk/themes';
import {
  ArrowRight, AudioLines, BarChart3, Check, ChevronLeft, CirclePlay, Crown, Disc3,
  FileMusic, Headphones, HeartHandshake, History, LayoutDashboard, LoaderCircle, LockKeyhole, Menu, Mic2, ShoppingBag,
  Pause, Play, Plus, Search, Send, ShieldCheck, Sparkles, Star, Ticket, UserRound,
  UsersRound, Video, X, Zap, Globe, Mail, Newspaper, Briefcase, ExternalLink, MapPin
} from 'lucide-react';
import { Link, Redirect, Route, Router as WouterRouter, Switch, useLocation, useParams } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Upload } from 'tus-js-client';
import {
  getGetArtistQueryKey, getGetArtistsQueryKey, getGetCatalogQueryKey, getGetSubmissionsQueryKey,
  getGetWorkQueryKey, useCreateArtist, useCreateSubmission, useGetArtist, useGetArtists,
  useGetCatalog, useGetSubmissions, useGetWork, useUpdateSubmissionStatus, useCreatePressRequest
} from '@workspace/api-client-react';
import type { Artist, Submission, Work } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { AdminUserList } from '@/components/admin-user-list';
import { AdminContentManagement } from '@/components/admin-content-management';
import { AdminTraffic } from '@/components/admin-traffic';
import { TrafficCollector } from '@/components/traffic-collector';
import {
  CheckoutReturnNotice, DonationCheckoutButton, PremiumBillingStatus, PremiumPlanAction, useBillingActions
} from '@/components/billing-actions';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const BoutiqueRoutePage = lazy(() => import('./components/boutique-page'));
const ShopAdminRoutePage = lazy(() => import('./components/shop-admin'));
const ADMIN_EMAIL = 'indamorarecords@gmail.com';
const categories = ['Musique', 'Humour', 'Cinéma et vidéos', 'Podcasts', 'Autres créations'];
const categoryIcons = { Musique: AudioLines, Humour: Sparkles, 'Cinéma et vidéos': Disc3, Podcasts: Mic2, 'Autres créations': Sparkles };
const categoryLabels: Record<string, string> = {
  Music: 'Musique',
  Comedy: 'Humour',
  Cinema: 'Cinéma',
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

const clerkPubKey = publishableKeyFromHost(window.location.hostname, import.meta.env.VITE_CLERK_PUBLISHABLE_KEY);
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}
function isAdminEmail(email?: string | null) {
  return email?.toLowerCase() === ADMIN_EMAIL;
}
const storageUrl = (path?: string | null) => path ? `/api/storage${path}` : undefined;
const uploadContentTypes: Record<string, string> = {
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', flac: 'audio/flac', ogg: 'audio/ogg',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
};
function uploadContentType(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return file.type && file.type !== 'application/octet-stream' ? file.type : uploadContentTypes[extension] ?? file.type;
}
async function uploadFingerprint(file: File, userId: string) {
  const value = `${userId}\u0000${file.name}\u0000${file.size}\u0000${file.lastModified}\u0000${uploadContentType(file)}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return `indamora:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
async function uploadAsset(file: File, userId: string, onProgress: (value: number) => void) {
  const contentType = uploadContentType(file);
  const fingerprint = await uploadFingerprint(file, userId);
  const storageKey = `indamora-upload-key:${fingerprint}`;
  let uploadKey: string;
  try {
    uploadKey = localStorage.getItem(storageKey) ?? crypto.randomUUID();
    localStorage.setItem(storageKey, uploadKey);
  } catch {
    throw new Error('Le navigateur ne permet pas de conserver la reprise du téléversement.');
  }
  const response = await fetch('/api/storage/uploads/request-url', {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: file.name,
      size: file.size,
      contentType,
      uploadKey,
    }),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error ?? 'Le téléversement n’a pas pu être préparé.');
  const { uploadURL, uploadToken, bucketName, objectPath, alreadyUploaded } = await response.json() as {
    uploadURL: string;
    uploadToken: string | null;
    bucketName: string;
    objectPath: string;
    alreadyUploaded: boolean;
  };
  if (!alreadyUploaded) {
    if (!uploadToken) throw new Error('La reprise du téléversement a expiré. Relancez l’envoi.');
    const objectName = objectPath.replace('/objects/supabase/', '');
    const upload = new Upload(file, {
      endpoint: uploadURL,
      fingerprint: async () => fingerprint,
      headers: { 'x-signature': uploadToken },
      metadata: {
        bucketName,
        objectName,
        contentType,
        cacheControl: '3600',
        uploadKey,
      },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      onProgress: (bytesSent, bytesTotal) => onProgress(Math.round(bytesSent / bytesTotal * 100)),
    });
    const previousUploads = await upload.findPreviousUploads();
    if (previousUploads.length) upload.resumeFromPreviousUpload(previousUploads[previousUploads.length - 1]);
    await new Promise<void>((resolve, reject) => {
      upload.options.onError = () => reject(new Error('Le transfert a été interrompu. Vérifiez votre connexion puis relancez l’envoi avec le même fichier.'));
      upload.options.onSuccess = () => resolve();
      upload.start();
    });
  }
  const completed = await fetch('/api/storage/uploads/complete', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    objectPath,
    size: file.size,
    contentType,
  }),
});
  if (!completed.ok) throw new Error((await completed.json().catch(() => null))?.error ?? 'Le fichier téléversé n’a pas pu être vérifié.');
  try { localStorage.removeItem(storageKey); } catch { /* Resumable URL storage is also cleared on success. */ }
  return objectPath;
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
  return src ? (
    <img src={src} alt={name} className={cx('rounded-full object-cover ring-2 ring-background', size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-24 w-24' : 'h-12 w-12')} data-testid={`img-avatar-${name}`} />
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
  const isAdmin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);
  const nav = [
    { href: '/', label: 'Accueil', icon: Sparkles },
    { href: '/explorer', label: 'Explorer', icon: CirclePlay },
    { href: '/repertoire', label: 'Répertoire', icon: UsersRound },
    { href: '/pricing', label: 'Premium', icon: Crown },
    { href: '/soutenir', label: 'Soutenir', icon: HeartHandshake },
    { href: '/boutique', label: 'SHOP', icon: ShoppingBag },
  ];
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="group flex items-center gap-3" data-testid="link-logo">
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
            <Link href="/submit" className="rounded-full border border-border px-4 py-2 text-sm font-bold transition-all hover:-translate-y-0.5 hover:border-primary hover:text-primary" data-testid="link-submit-header">Partager votre œuvre</Link>
             {isSignedIn ? <><Link href="/profil" className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-profile-header">{user?.firstName ?? 'Mon compte'}</Link><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground" data-testid="button-logout-header">Déconnexion</button></> : <><Link href="/sign-up" className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-register-header">Créer un compte</Link><Link href="/sign-in" className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg" data-testid="link-login-header">Se connecter</Link></>}
          </div>
          <button className="rounded-full p-2 md:hidden" onClick={() => setMenuOpen(!menuOpen)} data-testid="button-open-menu" aria-label="Ouvrir la navigation">
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {menuOpen && (
          <div className="border-t border-border bg-card px-5 py-4 md:hidden">
            <div className="grid gap-2">
              {nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid={`link-mobile-${label.toLowerCase()}`}><Icon className="h-4 w-4 text-primary" />{label}</Link>)}
              <Link href="/submit" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-submit"><Send className="h-4 w-4 text-primary" />Partager votre œuvre</Link>
               {isSignedIn ? <><Link href="/profil" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-profile"><UserRound className="h-4 w-4 text-primary" />Mon compte</Link><button onClick={() => void signOut({ redirectUrl: basePath || '/' })} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left font-semibold hover:bg-muted" data-testid="button-mobile-logout"><UserRound className="h-4 w-4 text-primary" />Déconnexion</button></> : <Link href="/sign-in" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-login"><UserRound className="h-4 w-4 text-primary" />Se connecter</Link>}
            </div>
          </div>
        )}
        {import.meta.env.DEV && <nav aria-label="Accès Preview TEST" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border bg-muted px-4 py-2 text-xs" data-testid="nav-preview-test">
          <Link href="/boutique" className="font-bold text-primary underline underline-offset-4" data-testid="link-preview-boutique">Boutique — Preview TEST</Link>
          <span className="text-muted-foreground">Développement uniquement · aucune publication</span>
        </nav>}
      </header>
      <main>{children}</main>
      <footer className="mt-24 border-t border-border bg-secondary px-5 py-10 text-secondary-foreground lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="mb-3 w-36 rounded-xl bg-white p-1"><Logo variant="full" /></div><p className="max-w-xs text-sm leading-6 text-secondary-foreground/70">Le foyer chaleureux des sons, des histoires et des écrans d’Afrique centrale.</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-secondary-foreground/80"><Link href="/explorer" data-testid="link-footer-explorer">Explorer</Link><Link href="/repertoire" data-testid="link-footer-repertoire">Répertoire</Link><Link href="/presse" data-testid="link-footer-presse">Presse</Link><Link href="/pricing" data-testid="link-footer-pricing">Premium</Link><Link href="/soutenir" data-testid="link-footer-support">Soutenir INDAMORA</Link><Link href="/profil" data-testid="link-footer-profile">Mon profil</Link><Link href="/espace-artiste" data-testid="link-footer-artist-space">Espace artiste</Link>{isAdmin && <Link href="/administration" data-testid="link-footer-admin">Administration</Link>}{import.meta.env.DEV && isAdmin && user?.primaryEmailAddress?.verification?.status === 'verified' && <Link href="/administration/shop" data-testid="link-footer-admin-shop">SHOP</Link>}<Link href="/submit" data-testid="link-footer-submit">Proposer une œuvre</Link></div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-secondary-foreground/15 pt-4 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/50">Bangui · République centrafricaine · La diaspora</div>
      </footer>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 px-2 pt-2 backdrop-blur-xl md:hidden">
        {[{ href: '/', label: 'Accueil', icon: Sparkles }, { href: '/explorer', label: 'Explorer', icon: CirclePlay }, { href: '/repertoire', label: 'Répertoire', icon: UsersRound }, { href: '/submit', label: 'Créer', icon: Plus }, { href: '/profil', label: 'Profil', icon: UserRound }].map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={cx('flex flex-col items-center gap-1 px-4 py-1 text-[10px] font-bold', location === href ? 'text-primary' : 'text-muted-foreground')} data-testid={`link-bottom-${label.toLowerCase()}`}><Icon className="h-5 w-5" />{label}</Link>)}
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
         <div className="animate-rise-in"><div className="mb-6 w-44 rounded-2xl bg-white p-2 shadow-xl"><Logo variant="full" /></div><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-secondary-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.18em] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Depuis Bangui, avec émotion</div><h1 className="display max-w-3xl text-5xl font-bold leading-[.98] md:text-7xl">Écoutez les voix<br /><span className="text-accent">qui ont le goût du pays.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-secondary-foreground/75 md:text-lg">Musique, humour, cinéma et podcasts d’Afrique centrale — pour celles et ceux d’ici, et pour partout où nous emportons notre chez-nous.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#discover" className="flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-1" data-testid="link-start-discover">Commencer à découvrir <ArrowRight className="h-4 w-4" /></a><Link href="/submit" className="rounded-full border border-secondary-foreground/25 px-5 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent" data-testid="link-share-hero">Je crée</Link></div></div>
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
            <div className="mt-8">
              <h3 className="text-lg font-bold mb-3">Spécialités</h3>
              <div className="flex flex-wrap gap-2">
                {person.specialties.map((specialty) => (
                  <span
                    key={specialty}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold"
                  >
                    {specialty}
                  </span>
                ))}
              </div>
            </div>
          )}

          {works.length > 0 && (
            <div className="mt-12">
              <SectionHeading title="Ses œuvres" />
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {works.map((work) => (
                  <WorkArtwork
                    key={work.id}
                    work={work}
                    onOpen={setSelectedWork}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-xl font-bold">Informations</h3>
          <p className="mt-4 text-sm text-muted-foreground">
            {person.location}
            {person.country ? `, ${person.country}` : ''}
          </p>
          <Link
            href="/repertoire"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour au répertoire
          </Link>
        </aside>
      </div>
    </section>

    <WorkSheet
      id={selectedWork}
      onClose={() => setSelectedWork(null)}
    />
  </div>;
}
            

_This response is too long to display in full._
