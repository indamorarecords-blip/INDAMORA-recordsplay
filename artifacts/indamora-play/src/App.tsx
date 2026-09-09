import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, AudioLines, Check, ChevronLeft, Crown, Disc3,
  FileMusic, Headphones, LoaderCircle, LockKeyhole, Menu, Mic2,
  Play, Plus, Search, Send, Sparkles, Star, Ticket, UserRound, UsersRound, X, Zap,
} from 'lucide-react';
import { Link, Route, Switch, useLocation, useParams } from 'wouter';
import {
  getGetArtistQueryKey, getGetArtistsQueryKey, getGetCatalogQueryKey, getGetSubmissionsQueryKey,
  getGetWorkQueryKey, useCreateArtist, useCreateSubmission, useGetArtist, useGetArtists,
  useGetCatalog, useGetSubmissions, useGetWork, useUpdateSubmissionStatus,
} from '@workspace/api-client-react';
import type { Artist, Submission, Work } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const categories = ['Musique', 'Humour', 'Cinéma', 'Podcasts'];
const categoryIcons = { Musique: AudioLines, Humour: Sparkles, Cinéma: Disc3, Podcasts: Mic2 };
const categoryLabels: Record<string, string> = {
  Music: 'Musique',
  Comedy: 'Humour',
  Cinema: 'Cinéma',
  Podcasts: 'Podcasts',
  Musique: 'Musique',
  Humour: 'Humour',
  Cinéma: 'Cinéma',
};
const categoryLabel = (value: string) => categoryLabels[value] ?? value;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
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
  const nav = [
    { href: '/', label: 'Découvrir', icon: Sparkles },
    { href: '/artists', label: 'Artistes', icon: UsersRound },
    { href: '/pricing', label: 'Premium', icon: Crown },
  ];
  return (
    <div className="grain min-h-[100dvh] bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-5 lg:px-8">
          <Link href="/" className="group flex items-center gap-3" data-testid="link-logo">
            <span className="relative grid h-10 w-10 place-items-center rounded-[13px] bg-primary text-primary-foreground shadow-[4px_4px_0_hsl(var(--accent))] transition-transform group-hover:-translate-y-0.5">
              <span className="display text-xl font-bold">I</span>
            </span>
            <span className="display text-[1.35rem] font-bold tracking-tight">INDAMORA <span className="text-primary">PLAY</span></span>
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
            <Link href="/login" className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground transition-all hover:-translate-y-0.5 hover:shadow-lg" data-testid="link-login-header">Se connecter</Link>
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
              <Link href="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-3 rounded-xl px-3 py-3 font-semibold hover:bg-muted" data-testid="link-mobile-login"><UserRound className="h-4 w-4 text-primary" />Se connecter</Link>
            </div>
          </div>
        )}
      </header>
      <main>{children}</main>
      <footer className="mt-24 border-t border-border bg-secondary px-5 py-10 text-secondary-foreground lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="display text-2xl font-bold">INDAMORA <span className="text-accent">PLAY</span></div><p className="mt-2 max-w-xs text-sm leading-6 text-secondary-foreground/70">Le foyer chaleureux des sons, des histoires et des écrans d’Afrique centrale.</p></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-secondary-foreground/80"><Link href="/artists" data-testid="link-footer-artists">Artistes</Link><Link href="/pricing" data-testid="link-footer-pricing">Premium</Link><Link href="/submit" data-testid="link-footer-submit">Proposer une œuvre</Link></div>
        </div>
        <div className="mx-auto mt-8 max-w-7xl border-t border-secondary-foreground/15 pt-4 font-mono text-[10px] uppercase tracking-[.2em] text-secondary-foreground/50">Bangui · République centrafricaine · La diaspora</div>
      </footer>
      <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border bg-card/95 px-2 pt-2 backdrop-blur-xl md:hidden">
        {nav.map(({ href, label, icon: Icon }) => <Link href={href} key={href} className={cx('flex flex-col items-center gap-1 px-4 py-1 text-[10px] font-bold', location === href ? 'text-primary' : 'text-muted-foreground')} data-testid={`link-bottom-${label.toLowerCase()}`}><Icon className="h-5 w-5" />{label}</Link>)}
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
  return <button onClick={() => onOpen(work.id)} className="group block w-full text-left" data-testid={`card-work-${work.id}`}>
    <div className="relative aspect-[.9] overflow-hidden rounded-2xl bg-secondary shadow-[var(--shadow-card)]">
      {work.image ? <img src={work.image} alt={work.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" /> : <div className="grid h-full place-items-center bg-primary/80 text-primary-foreground"><FileMusic className="h-10 w-10" /></div>}
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
      {work && <><div className="relative aspect-video overflow-hidden rounded-2xl bg-secondary">{work.image && <img src={work.image} alt={work.title} className="h-full w-full object-cover" />}<div className="absolute inset-0 grid place-items-center bg-foreground/20"><button className="grid h-16 w-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-lg transition-transform hover:scale-105" data-testid={`button-play-work-${work.id}`} aria-label="Lire l’œuvre"><Play className="ml-1 h-6 w-6 fill-current" /></button></div></div><div className="mt-6 flex items-start justify-between gap-4"><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">{categoryLabel(work.category)} · {work.duration}</div><h2 className="display mt-2 text-3xl font-bold">{work.title}</h2><p className="mt-1 font-semibold text-muted-foreground">{work.artist}</p></div>{work.access === 'premium' && <span className="rounded-full bg-accent px-3 py-1 text-xs font-bold">Premium</span>}</div><p className="mt-5 leading-7 text-muted-foreground">{work.description}</p><button className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-bold text-primary-foreground transition-all hover:-translate-y-0.5" data-testid={`button-start-work-${work.id}`}><Headphones className="h-4 w-4" /> Commencer l’écoute</button></>}
    </div>
  </div>;
}

function Home() {
  const catalog = useGetCatalog({ query: { queryKey: getGetCatalogQueryKey() } });
  const artists = useGetArtists({ query: { queryKey: getGetArtistsQueryKey() } });
  const [category, setCategory] = useState('Toutes');
  const [selectedWork, setSelectedWork] = useState<number | null>(null);
  const works = useMemo(() => (catalog.data ?? []).filter((work) => category === 'Toutes' || work.category === category), [catalog.data, category]);
  const featured = (catalog.data ?? []).filter((work) => work.featured);
  return <div>
    <section className="relative overflow-hidden bg-secondary text-secondary-foreground">
      <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full border-[42px] border-accent/80 opacity-80 md:h-[34rem] md:w-[34rem]" />
      <div className="absolute bottom-[-5rem] left-[42%] h-40 w-40 rotate-12 border-[20px] border-primary/70 md:h-64 md:w-64" />
      <div className="relative mx-auto grid max-w-7xl items-end gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:px-8 lg:pb-24 lg:pt-24">
        <div className="animate-rise-in"><div className="mb-5 inline-flex items-center gap-2 rounded-full border border-secondary-foreground/20 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.18em] text-accent"><span className="h-1.5 w-1.5 rounded-full bg-accent" /> Depuis Bangui, avec émotion</div><h1 className="display max-w-3xl text-5xl font-bold leading-[.98] md:text-7xl">Écoutez les voix<br /><span className="text-accent">qui ont le goût du pays.</span></h1><p className="mt-6 max-w-lg text-base leading-7 text-secondary-foreground/75 md:text-lg">Musique, humour, cinéma et podcasts d’Afrique centrale — pour celles et ceux d’ici, et pour partout où nous emportons notre chez-nous.</p><div className="mt-8 flex flex-wrap gap-3"><a href="#discover" className="flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-1" data-testid="link-start-discover">Commencer à découvrir <ArrowRight className="h-4 w-4" /></a><Link href="/submit" className="rounded-full border border-secondary-foreground/25 px-5 py-3 text-sm font-bold transition-colors hover:border-accent hover:text-accent" data-testid="link-share-hero">Je crée</Link></div></div>
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
    <section className="mx-auto max-w-7xl px-5 pb-16 lg:px-8"><SectionHeading eyebrow="Les personnes à suivre" title="Rencontrez les créateurs" action={<Link href="/artists" className="flex items-center gap-1 text-sm font-bold text-primary" data-testid="link-view-artists">Tout voir <ArrowRight className="h-4 w-4" /></Link>} />{artists.isLoading ? <LoadingCards count={4} /> : artists.error ? <QueryState error={artists.error} onRetry={() => void artists.refetch()} label="artists" /> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{(artists.data ?? []).slice(0, 4).map((artist) => <Link href={`/artists/${artist.id}`} key={artist.id} className="group rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-1 hover:border-primary" data-testid={`card-artist-${artist.id}`}><Avatar name={artist.name} src={artist.avatar} /><p className="mt-4 font-bold group-hover:text-primary">{artist.name}</p><p className="mt-1 text-xs text-muted-foreground">{categoryLabel(artist.category)} · {artist.location}</p></Link>)}</div>}</section>
    <WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} />
  </div>;
}

function Artists() {
  const artists = useGetArtists({ query: { queryKey: getGetArtistsQueryKey() } });
  const [search, setSearch] = useState('');
  const shown = useMemo(() => (artists.data ?? []).filter((artist) => `${artist.name} ${artist.category} ${artist.location}`.toLowerCase().includes(search.toLowerCase())), [artists.data, search]);
  return <div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-16"><div className="max-w-2xl animate-rise-in"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Le répertoire</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-6xl">Les personnes<br /><span className="text-primary">qui font vibrer.</span></h1><p className="mt-5 leading-7 text-muted-foreground">Découvrez les voix qui façonnent la culture centrafricaine, de Bangui au reste du monde.</p></div><div className="mt-10 flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"><Search className="h-5 w-5 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom, un lieu, un univers" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" data-testid="input-search-artists" /></div><div className="mt-12">{artists.isLoading ? <LoadingCards count={6} /> : artists.error ? <QueryState error={artists.error} onRetry={() => void artists.refetch()} label="artists" /> : shown.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-16 text-center text-muted-foreground">Aucun artiste ne correspond à cette recherche.</div> : <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{shown.map((artist, index) => <Link href={`/artists/${artist.id}`} key={artist.id} className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:border-primary hover:shadow-[var(--shadow-card)]" data-testid={`card-directory-artist-${artist.id}`}><Avatar name={artist.name} src={artist.avatar} size="lg" /><div className="min-w-0 flex-1"><div className="mb-2 font-mono text-[10px] text-primary">0{index + 1}</div><h2 className="truncate text-lg font-bold group-hover:text-primary">{artist.name}</h2><p className="mt-1 text-sm text-muted-foreground">{categoryLabel(artist.category)}</p><p className="mt-3 text-xs text-muted-foreground">{artist.location} · {artist.worksCount} œuvres</p></div><ChevronRightIcon /></Link>)}</div>}</div></div>;
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
  return <div><section className="bg-secondary text-secondary-foreground"><div className="mx-auto max-w-7xl px-5 py-12 lg:px-8 lg:py-20"><Link href="/artists" className="mb-10 inline-flex items-center gap-2 text-sm font-semibold text-secondary-foreground/70 hover:text-accent" data-testid="link-back-artists"><ChevronLeft className="h-4 w-4" /> Tous les artistes</Link><div className="flex flex-col items-start gap-7 sm:flex-row sm:items-end"><Avatar name={person.name} src={person.avatar} size="lg" /><div><div className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">{categoryLabel(person.category)} · {person.location}</div><h1 className="display mt-2 text-5xl font-bold md:text-7xl">{person.name}</h1><p className="mt-4 max-w-2xl leading-7 text-secondary-foreground/75">{person.bio}</p></div></div></div></section><section className="mx-auto max-w-7xl px-5 py-14 lg:px-8"><SectionHeading eyebrow={`${person.worksCount} œuvres sur Indamora`} title="Écoutez, regardez, restez un peu" />{catalog.isLoading ? <LoadingCards /> : catalog.error ? <QueryState error={catalog.error} onRetry={() => void catalog.refetch()} /> : works.length === 0 ? <div className="rounded-2xl border border-dashed border-border px-5 py-16 text-center text-muted-foreground">Ses œuvres arrivent bientôt.</div> : <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{works.map((work) => <WorkArtwork key={work.id} work={work} onOpen={setSelectedWork} />)}</div>}</section><WorkSheet id={selectedWork} onClose={() => setSelectedWork(null)} /></div>;
}

function Submit() {
  const createSubmission = useCreateSubmission();
  const createArtist = useCreateArtist();
  const queryClient = useQueryClient();
   const [form, setForm] = useState({ title: '', artist: '', category: 'Musique', note: '', location: '', bio: '', addProfile: false });
  const [done, setDone] = useState<Submission | null>(null);
  const [error, setError] = useState('');
  const update = (key: keyof typeof form, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (form.title.trim().length < 2 || form.artist.trim().length < 2) { setError('Ajoutez un titre et un nom d’artiste pour que l’équipe retrouve votre œuvre.'); return; }
    const sendSubmission = () => createSubmission.mutate({ data: { title: form.title, artist: form.artist, category: form.category, note: form.note || undefined } }, { onSuccess: (created) => { setDone(created); void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey() }); }, onError: () => setError('Votre proposition n’a pas pu être envoyée. Veuillez réessayer.') });
    if (form.addProfile) createArtist.mutate({ data: { name: form.artist, category: form.category, bio: form.bio, location: form.location } }, { onSuccess: sendSubmission, onError: () => setError('Le profil artiste n’a pas pu être créé. Vérifiez les informations, puis réessayez.') });
    else sendSubmission();
  };
  if (done) return <div className="mx-auto max-w-2xl px-5 py-20 text-center lg:py-28"><div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="h-9 w-9" /></div><div className="mt-8 font-mono text-[10px] uppercase tracking-[.2em] text-primary">Reçu par Indamora Records</div><h1 className="display mt-3 text-5xl font-bold">Votre œuvre est bien arrivée.</h1><p className="mx-auto mt-5 max-w-md leading-7 text-muted-foreground">Nous avons reçu <strong className="text-foreground">{done.title}</strong> dans notre espace d’écoute. Notre équipe va l’examiner avec attention et vous répondre.</p><Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-submission-home">Retour à la découverte <ArrowRight className="h-4 w-4" /></Link></div>;
  const pending = createSubmission.isPending || createArtist.isPending;
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Indamora Records</div><h1 className="display mt-3 text-5xl font-bold leading-[.95] md:text-6xl">Mettez votre œuvre<br /><span className="text-primary">dans la lumière.</span></h1><p className="mt-6 max-w-sm leading-7 text-muted-foreground">Une façon simple de présenter votre musique, votre humour, votre cinéma ou votre podcast à un public qui cherche quelque chose de vrai.</p><div className="mt-10 space-y-4 border-l-2 border-accent pl-5 text-sm font-semibold"><p>01 · Parlez-nous de votre création</p><p>02 · Notre équipe l’écoute avec attention</p><p>03 · Si elle trouve sa place, elle rencontre son public</p></div></div><form onSubmit={submit} className="rounded-[2rem] border border-border bg-card p-6 shadow-[var(--shadow-card)] md:p-9"><div className="mb-8 flex items-center justify-between"><div><h2 className="display text-2xl font-bold">Détails de l’œuvre</h2><p className="mt-1 text-sm text-muted-foreground">Les champs marqués d’un astérisque sont essentiels.</p></div><FileMusic className="h-7 w-7 text-primary" /></div><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold sm:col-span-2">Titre <input required value={form.title} onChange={(e) => update('title', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="Comment s’appelle-t-elle&nbsp;?" data-testid="input-submission-title" /></label><label className="grid gap-2 text-sm font-bold">Artiste ou collectif <input required value={form.artist} onChange={(e) => update('artist', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Votre nom public" data-testid="input-submission-artist" /></label><label className="grid gap-2 text-sm font-bold">Catégorie <select value={form.category} onChange={(e) => update('category', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" data-testid="select-submission-category">{categories.map((item) => <option key={item} value={item}>{categoryLabel(item)}</option>)}</select></label><label className="grid gap-2 text-sm font-bold sm:col-span-2">Un mot pour l’équipe d’écoute <textarea value={form.note} onChange={(e) => update('note', e.target.value)} className="min-h-28 resize-y rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Dites-nous ce que cette œuvre représente pour vous…" data-testid="textarea-submission-note" /></label></div><label className="mt-6 flex cursor-pointer items-start gap-3 rounded-2xl bg-muted p-4 text-sm"><input type="checkbox" checked={form.addProfile} onChange={(e) => update('addProfile', e.target.checked)} className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]" data-testid="checkbox-create-profile" /><span><strong>Ajouter mon profil au répertoire</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">Partagez votre biographie et votre lieu pour que l’on découvre aussi vos autres créations.</span></span></label>{form.addProfile && <div className="mt-4 grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm font-bold">Où êtes-vous basé&nbsp;? <input required value={form.location} onChange={(e) => update('location', e.target.value)} className="rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Bangui, République centrafricaine" data-testid="input-artist-location" /></label><label className="grid gap-2 text-sm font-bold">Courte biographie <textarea required value={form.bio} onChange={(e) => update('bio', e.target.value)} className="min-h-12 rounded-xl border border-input bg-background px-4 py-3 font-normal outline-none focus:border-primary" placeholder="Que créez-vous&nbsp;?" data-testid="textarea-artist-bio" /></label></div>}{error && <p className="mt-5 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive" data-testid="status-submission-error">{error}</p>}<button disabled={pending} className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-wait disabled:opacity-60" data-testid="button-submit-work">{pending ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Envoi en cours…</> : <><Send className="h-4 w-4" /> Envoyer pour examen</>}</button></form></div></div>;
}

function Moderation() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const submissions = useGetSubmissions({ status: filter }, { query: { queryKey: getGetSubmissionsQueryKey({ status: filter }) } });
  const updateStatus = useUpdateSubmissionStatus();
  const review = (submission: Submission, status: 'approved' | 'rejected') => updateStatus.mutate({ id: submission.id, data: { status } }, { onSuccess: () => { void queryClient.invalidateQueries({ queryKey: getGetSubmissionsQueryKey({ status: filter }) }); } });
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-16"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Espace de modération</div><h1 className="display mt-3 text-5xl font-bold">INDAMORA<br /><span className="text-primary">RECORDS.</span></h1><p className="mt-4 text-muted-foreground">Donnez à chaque proposition l’attention qu’elle mérite.</p></div><div className="rounded-2xl bg-secondary px-5 py-4 text-secondary-foreground"><div className="font-mono text-[10px] uppercase tracking-[.15em] text-accent">État de la file</div><div className="mt-2 flex items-center gap-2 text-sm font-bold"><span className="h-2 w-2 animate-pulse rounded-full bg-accent" /> File de revue active</div></div></div><div className="mt-12 flex gap-2 overflow-x-auto border-b border-border pb-3">{(['pending', 'approved', 'rejected'] as const).map((item) => <button onClick={() => setFilter(item)} key={item} className={cx('shrink-0 rounded-full px-4 py-2 text-sm font-bold capitalize', filter === item ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')} data-testid={`button-filter-submissions-${item}`}>{item === 'pending' ? 'En attente' : item === 'approved' ? 'Approuvées' : 'Refusées'}</button>)}</div>{submissions.isLoading ? <div className="mt-6 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="skeleton h-28 rounded-2xl" />)}</div> : submissions.error ? <div className="mt-6"><QueryState error={submissions.error} onRetry={() => void submissions.refetch()} label="submissions" /></div> : (submissions.data ?? []).length === 0 ? <div className="mt-6 rounded-2xl border border-dashed border-border px-5 py-20 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted"><Check className="h-6 w-6 text-secondary" /></div><h2 className="mt-4 font-bold">Aucune œuvre dans cette file</h2><p className="mt-1 text-sm text-muted-foreground">La file est vide pour le moment.</p></div> : <div className="mt-6 space-y-3">{(submissions.data ?? []).map((submission) => <div key={submission.id} className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/50" data-testid={`row-submission-${submission.id}`}><div className="flex flex-col gap-5 md:flex-row md:items-center"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted text-primary"><FileMusic className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-bold">{submission.title}</h2><span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">{categoryLabel(submission.category)}</span></div><p className="mt-1 text-sm text-muted-foreground">{submission.artist} · {new Date(submission.submittedAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric', year: 'numeric' })}</p>{submission.note && <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground/75">“{submission.note}”</p>}</div>{filter === 'pending' && <div className="flex gap-2"><button disabled={updateStatus.isPending} onClick={() => review(submission, 'rejected')} className="rounded-full border border-border px-4 py-2 text-sm font-bold hover:border-destructive hover:text-destructive disabled:opacity-50" data-testid={`button-reject-${submission.id}`}>Refuser</button><button disabled={updateStatus.isPending} onClick={() => review(submission, 'approved')} className="rounded-full bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground hover:bg-primary hover:text-primary-foreground disabled:opacity-50" data-testid={`button-approve-${submission.id}`}>Approuver</button></div>} {filter !== 'pending' && <span className={cx('rounded-full px-3 py-1 text-xs font-bold capitalize', filter === 'approved' ? 'bg-secondary/10 text-secondary' : 'bg-destructive/10 text-destructive')}>{filter === 'approved' ? 'Approuvée' : 'Refusée'}</span>}</div></div>)}</div>}</div>;
}

function Pricing() {
  return <div className="mx-auto max-w-6xl px-5 py-12 lg:px-8 lg:py-20"><div className="mx-auto max-w-2xl text-center"><div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Gardez le signal vivant</div><h1 className="display mt-3 text-5xl font-bold leading-none md:text-7xl">Plus de ce qui<br /><span className="text-primary">vous fait vibrer.</span></h1><p className="mt-6 text-lg leading-7 text-muted-foreground">Commencez gratuitement. Allez plus loin quand vous voulez garder toute l’Afrique centrale dans votre poche.</p></div><div className="mx-auto mt-14 grid max-w-4xl gap-5 md:grid-cols-2"><div className="rounded-[2rem] border border-border bg-card p-7 md:p-9"><div className="flex items-center justify-between"><div><h2 className="display text-3xl font-bold">Gratuit</h2><p className="mt-1 text-sm text-muted-foreground">Un bon point de départ.</p></div><Ticket className="h-7 w-7 text-secondary" /></div><div className="mt-8 text-4xl font-bold">0 <span className="text-sm font-medium text-muted-foreground">FCFA / mois</span></div><ul className="mt-8 space-y-4 text-sm">{['Découvrir les œuvres à la une', 'Explorer le répertoire des artistes', 'Écouter les sorties gratuites', 'Soutenir les créateurs d’ici'].map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 text-secondary" />{item}</li>)}</ul><Link href="/" className="mt-10 block rounded-full border border-border py-3 text-center text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-pricing-free">Continuer la découverte</Link></div><div className="relative rounded-[2rem] bg-secondary p-7 text-secondary-foreground shadow-xl md:-translate-y-4 md:p-9"><div className="absolute right-6 top-6 rounded-full bg-accent px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-accent-foreground">Meilleur choix</div><div className="flex items-center justify-between"><div><h2 className="display text-3xl font-bold">Premium</h2><p className="mt-1 text-sm text-secondary-foreground/65">Pour toute la fréquence.</p></div><Crown className="h-7 w-7 text-accent" /></div><div className="mt-8 text-4xl font-bold">500 <span className="text-sm font-medium text-secondary-foreground/65">FCFA / mois</span></div><ul className="mt-8 space-y-4 text-sm text-secondary-foreground/85">{['Tout le contenu Gratuit', 'Débloquer les sorties Premium', 'Accéder en avant-première aux nouveautés', 'Donner un coup de main direct aux créateurs'].map((item) => <li key={item} className="flex items-center gap-3"><Check className="h-4 w-4 text-accent" />{item}</li>)}</ul><Link href="/login" className="mt-10 flex items-center justify-center gap-2 rounded-full bg-accent py-3 text-center text-sm font-bold text-accent-foreground" data-testid="link-pricing-premium">Choisir Premium <ArrowRight className="h-4 w-4" /></Link></div></div><p className="mx-auto mt-10 flex max-w-md items-center justify-center gap-2 text-center text-xs leading-5 text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" /> Paiement sécurisé. Résiliez quand vous le souhaitez.</p></div>;
}

function Login() {
  const [sent, setSent] = useState(false);
  const [email, setEmail] = useState('');
  const submit = (event: FormEvent) => { event.preventDefault(); if (email) setSent(true); };
  return <div className="min-h-[calc(100dvh-4.5rem)] bg-secondary px-5 py-14 text-secondary-foreground lg:grid lg:place-items-center"><div className="grid w-full max-w-5xl gap-12 lg:grid-cols-[1fr_.8fr] lg:items-center"><div><Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-secondary-foreground/65 hover:text-accent" data-testid="link-login-back"><ChevronLeft className="h-4 w-4" /> Retour à Indamora Play</Link><h1 className="display mt-16 text-6xl font-bold leading-[.93] md:text-8xl">Votre espace<br /><span className="text-accent">vous attend.</span></h1><p className="mt-6 max-w-sm leading-7 text-secondary-foreground/70">Connectez-vous pour reprendre votre écoute, suivre vos artistes préférés et débloquer toute la collection.</p></div><div className="rounded-[2rem] bg-background p-7 text-foreground shadow-2xl md:p-10"><div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><Headphones className="h-5 w-5" /></div>{sent ? <div><div className="grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="h-5 w-5" /></div><h2 className="display mt-6 text-3xl font-bold">Consultez votre boîte mail.</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">Nous avons envoyé un lien de connexion à <strong className="text-foreground">{email}</strong>.</p><button onClick={() => setSent(false)} className="mt-7 text-sm font-bold text-primary" data-testid="button-login-change-email">Utiliser une autre adresse</button></div> : <><h2 className="display text-3xl font-bold">Ravi de vous revoir.</h2><p className="mt-2 text-sm text-muted-foreground">Un e-mail suffit. Aucun mot de passe à retenir.</p><form onSubmit={submit} className="mt-8"><label className="grid gap-2 text-sm font-bold">Adresse e-mail<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 rounded-xl border border-input bg-card px-4 py-3 font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" placeholder="vous@exemple.com" data-testid="input-login-email" /></label><button className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground" data-testid="button-login-submit">Recevoir mon lien de connexion <ArrowRight className="h-4 w-4" /></button></form><div className="my-7 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground"><span className="h-px flex-1 bg-border" />Pour les créateurs aussi<span className="h-px flex-1 bg-border" /></div><Link href="/submit" className="flex w-full items-center justify-center gap-2 rounded-full border border-border py-3 text-sm font-bold hover:border-primary hover:text-primary" data-testid="link-login-submit-work"><Plus className="h-4 w-4" /> Proposer une œuvre</Link></>}</div></div></div>;
}

function NotFound() {
  return <div className="mx-auto max-w-xl px-5 py-32 text-center"><div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">404 / hors piste</div><h1 className="display mt-4 text-6xl font-bold">Cette piste<br />n’existe pas.</h1><Link href="/" className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground" data-testid="link-404-home">Retour à la découverte <ArrowRight className="h-4 w-4" /></Link></div>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch><Route path="/" component={Home} /><Route path="/artists" component={Artists} /><Route path="/artists/:id" component={ArtistProfile} /><Route path="/submit" component={Submit} /><Route path="/moderation" component={Moderation} /><Route path="/pricing" component={Pricing} /><Route path="/login" component={Login} /><Route component={NotFound} /></Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><Router /><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;