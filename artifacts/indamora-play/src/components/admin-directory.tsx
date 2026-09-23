import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronRight,
  Globe2,
  Search,
  ShieldCheck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';
import * as apiClient from '@workspace/api-client-react';

type AdminUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username?: string | null;
  email: string | null;
  createdAt: string;
  lastSignInAt?: string | null;
  emailVerified: boolean;
  hasProfile: boolean;
  profileId?: number | null;
  activities: string[];
  profileStatus: string | null;
  isPublished: boolean;
};
type AdminWork = { id: number; title: string; artist: string; category: string; status: string; createdAt: string };
type AdminSubmission = { id: number; title: string; category: string; status: string; submittedAt: string };
type AdminProfile = {
  id: number;
  ownerId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  name: string;
  category: string;
  subcategory?: string | null;
  bio: string;
  location: string;
  country?: string | null;
  phone?: string | null;
  avatar?: string | null;
  website?: string | null;
  socialLinks?: string[];
  specialties: string[];
  profileGroup: string;
  profileStatus: string;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string | null;
  publicPath?: string | null;
  works: AdminWork[];
  submissions: AdminSubmission[];
};
type AdminDirectory = {
  users: AdminUser[];
  profiles: AdminProfile[];
  summary: { users: number; profiles: number; publishedProfiles: number; pendingProfiles: number; works: number };
};
type DirectoryParams = { search?: string; status?: DirectoryStatus; scope?: DirectoryScope };
type AdminProfileStatusInput = { profileStatus?: 'pending' | 'approved' | 'rejected'; isPublished?: boolean };
type DirectoryQuery = {
  data?: AdminDirectory;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
};
type DirectoryMutation = {
  isPending: boolean;
  mutate: (
    value: { id: number; data: AdminProfileStatusInput },
    options?: { onSuccess?: () => void | Promise<void>; onError?: () => void },
  ) => void;
};
type DirectoryApi = {
  getGetAdminDirectoryQueryKey: (params?: DirectoryParams) => readonly unknown[];
  useGetAdminDirectory: (params?: DirectoryParams, options?: { query?: { queryKey: readonly unknown[] } }) => DirectoryQuery;
  useUpdateAdminProfileStatus: () => DirectoryMutation;
};
const {
  getGetAdminDirectoryQueryKey,
  useGetAdminDirectory,
  useUpdateAdminProfileStatus,
} = apiClient as unknown as DirectoryApi;

type DirectoryScope = 'all' | 'users' | 'profiles' | 'artists' | 'professionals';
type DirectoryStatus = 'all' | 'no-profile' | 'pending' | 'approved' | 'rejected' | 'published' | 'unpublished';
type ProfileAction = 'approve' | 'reject' | 'publish' | 'unpublish';

type AdminDirectoryProps = {
  className?: string;
};

const scopeOptions: Array<{ value: DirectoryScope; label: string }> = [
  { value: 'all', label: 'Tous les comptes' },
  { value: 'users', label: 'Comptes' },
  { value: 'profiles', label: 'Profils' },
  { value: 'artists', label: 'Artistes' },
  { value: 'professionals', label: 'Professionnels' },
];

const statusOptions: Array<{ value: DirectoryStatus; label: string }> = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'no-profile', label: 'Sans profil' },
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvés' },
  { value: 'rejected', label: 'Refusés' },
  { value: 'published', label: 'Publiés' },
  { value: 'unpublished', label: 'Non publiés' },
];

const profileStatusLabels: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvé',
  rejected: 'Refusé',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Non renseigné';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const displayValue = (value?: string | null) => value?.trim() || 'Non renseigné';
const avatarUrl = (value?: string | null) => value?.startsWith('/objects/') ? `/api/storage${value}` : value;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Avatar({ name, src }: { name: string; src?: string | null }) {
  return src ? (
    <img src={src} alt={name} className="h-11 w-11 rounded-2xl object-cover ring-1 ring-border" />
  ) : (
    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-secondary text-sm font-extrabold text-secondary-foreground">
      {initials(name) || 'IN'}
    </div>
  );
}

function StatusPill({ status, published }: { status?: string | null; published?: boolean }) {
  const label = published ? 'Publié' : profileStatusLabels[status ?? ''] ?? 'Sans profil';
  const color = published
    ? 'bg-secondary/12 text-secondary'
    : status === 'approved'
      ? 'bg-accent/25 text-foreground'
      : status === 'rejected'
        ? 'bg-destructive/10 text-destructive'
        : status === 'pending'
          ? 'bg-primary/10 text-primary'
          : 'bg-muted text-muted-foreground';
  return <span className={cx('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold', color)}>{label}</span>;
}

function DirectorySkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <div className="skeleton h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-4 w-2/5 rounded" />
            <div className="skeleton h-3 w-3/5 rounded" />
          </div>
          <div className="skeleton h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/5 px-5 py-10 text-center">
      <p className="font-semibold">Le répertoire n’est pas disponible.</p>
      <p className="mt-1 text-sm text-muted-foreground">Réessayez pour charger les comptes et les profils.</p>
      <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
        Réessayer
      </button>
    </div>
  );
}

function SummaryBar({ summary }: { summary: AdminDirectory['summary'] }) {
  const items = [
    { label: 'Comptes', value: summary.users, icon: UsersRound },
    { label: 'Profils', value: summary.profiles, icon: UserRound },
    { label: 'En attente', value: summary.pendingProfiles, icon: ShieldCheck },
    { label: 'Œuvres', value: summary.works, icon: Globe2 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-[.12em] text-muted-foreground">{label}</span>
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="mt-3 text-2xl font-extrabold tracking-tight">{value}</div>
        </div>
      ))}
    </div>
  );
}

function UserRow({ user, selected, onSelect }: { user: AdminUser; selected: boolean; onSelect: () => void }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || 'Compte sans nom';
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60',
        selected ? 'border-primary bg-primary/5 shadow-[var(--shadow-card)]' : 'border-border',
      )}
      data-testid={`admin-directory-user-${user.id}`}
    >
      <Avatar name={name} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{name}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{user.email || 'E-mail non renseigné'}</span>
      </span>
      <span className="hidden shrink-0 text-right sm:block">
        <span className="block text-[11px] font-semibold text-muted-foreground">{user.hasProfile ? 'Profil lié' : 'Sans profil'}</span>
        {user.hasProfile && <StatusPill status={user.profileStatus} published={user.isPublished} />}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function ProfileRow({ profile, selected, onSelect }: { profile: AdminProfile; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cx(
        'group flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60',
        selected ? 'border-primary bg-primary/5 shadow-[var(--shadow-card)]' : 'border-border',
      )}
      data-testid={`admin-directory-profile-${profile.id}`}
    >
      <Avatar name={profile.name} src={avatarUrl(profile.avatar)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{profile.name}</span>
        <span className="mt-1 block truncate text-xs text-muted-foreground">{profile.category} · {profile.location}</span>
      </span>
      <span className="hidden shrink-0 text-right sm:block">
        <StatusPill status={profile.profileStatus} published={profile.isPublished} />
        <span className="mt-1 block text-[11px] text-muted-foreground">{profile.works.length} œuvre{profile.works.length === 1 ? '' : 's'}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

function EmptyDirectory({ scope }: { scope: DirectoryScope }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-12 text-center">
      <UsersRound className="mx-auto h-8 w-8 text-primary/70" />
      <p className="mt-4 font-semibold">Aucun élément dans cette vue.</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {scope === 'users' ? 'Aucun compte ne correspond aux critères.' : 'Aucun profil ne correspond aux critères.'}
      </p>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold">{displayValue(value)}</dd>
    </div>
  );
}

function ProfileDetail({
  profile,
  mutation,
  onAction,
}: {
  profile: AdminProfile;
  mutation: ReturnType<typeof useUpdateAdminProfileStatus>;
  onAction: (action: ProfileAction) => void;
}) {
  const actionBusy = mutation.isPending;
  return (
    <div className="overflow-hidden rounded-[2rem] border border-border bg-card shadow-[var(--shadow-card)]">
      <div className="border-b border-border bg-secondary p-5 text-secondary-foreground md:p-7">
        <div className="flex items-start gap-4">
          <Avatar name={profile.name} src={avatarUrl(profile.avatar)} />
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[.2em] text-accent">Profil INDAMORA · #{profile.id}</div>
            <h3 className="display mt-2 break-words text-2xl font-bold">{profile.name}</h3>
            <p className="mt-1 text-sm text-secondary-foreground/75">{profile.category}{profile.subcategory ? ` · ${profile.subcategory}` : ''}</p>
          </div>
          <StatusPill status={profile.profileStatus} published={profile.isPublished} />
        </div>
        <div className="mt-6 grid gap-2 sm:grid-cols-2">
          {profile.profileStatus !== 'approved' && (
            <button type="button" disabled={actionBusy} onClick={() => onAction('approve')} className="inline-flex items-center justify-center gap-2 rounded-full bg-background px-4 py-2.5 text-sm font-bold text-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50" data-testid="button-admin-approve-profile">
              <Check className="h-4 w-4" /> Approuver
            </button>
          )}
          {profile.profileStatus !== 'rejected' && (
            <button type="button" disabled={actionBusy} onClick={() => onAction('reject')} className="inline-flex items-center justify-center gap-2 rounded-full border border-secondary-foreground/25 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-secondary-foreground/10 disabled:opacity-50" data-testid="button-admin-reject-profile">
              <X className="h-4 w-4" /> Refuser
            </button>
          )}
          {profile.isPublished ? (
            <button type="button" disabled={actionBusy} onClick={() => onAction('unpublish')} className="inline-flex items-center justify-center gap-2 rounded-full border border-secondary-foreground/25 px-4 py-2.5 text-sm font-bold transition-colors hover:bg-secondary-foreground/10 disabled:opacity-50" data-testid="button-admin-unpublish-profile">
              Retirer du répertoire
            </button>
          ) : (
            <button type="button" disabled={actionBusy || profile.profileStatus !== 'approved'} onClick={() => onAction('publish')} className="inline-flex items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50" data-testid="button-admin-publish-profile">
              Publier dans le répertoire
            </button>
          )}
        </div>
        {actionBusy && <p className="mt-3 text-xs text-secondary-foreground/70">Mise à jour du profil…</p>}
      </div>

      <div className="space-y-7 p-5 md:p-7">
        <section>
          <h4 className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">Champs visibles par l’administration</h4>
          <dl className="mt-4 grid gap-x-5 gap-y-5 sm:grid-cols-2">
            <DetailField label="Nom public" value={profile.name} />
            <DetailField label="Propriétaire" value={[profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.ownerId} />
            <DetailField label="E-mail" value={profile.email} />
            <DetailField label="Téléphone" value={profile.phone} />
            <DetailField label="Activité" value={profile.category} />
            <DetailField label="Sous-catégorie" value={profile.subcategory} />
            <DetailField label="Groupe" value={profile.profileGroup} />
            <DetailField label="Localisation" value={[profile.location, profile.country].filter(Boolean).join(' · ')} />
            <DetailField label="Créé le" value={formatDate(profile.createdAt)} />
            <DetailField label="Mis à jour le" value={formatDate(profile.updatedAt)} />
            <DetailField label="Site web" value={profile.website} />
            <DetailField label="URL publique" value={profile.publicPath} />
          </dl>
          <div className="mt-5">
            <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Spécialités</dt>
            <dd className="mt-2 flex flex-wrap gap-2">
              {profile.specialties.length > 0 ? profile.specialties.map((specialty) => <span key={specialty} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">{specialty}</span>) : <span className="text-sm font-semibold">Non renseigné</span>}
            </dd>
          </div>
          {profile.socialLinks && profile.socialLinks.length > 0 && (
            <div className="mt-5">
              <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Réseaux et liens</dt>
              <dd className="mt-2 space-y-1 text-sm font-semibold">{profile.socialLinks.map((link) => <div key={link} className="break-all text-primary">{link}</div>)}</dd>
            </div>
          )}
          <div className="mt-5 rounded-2xl bg-muted/70 p-4">
            <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Biographie</dt>
            <dd className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{displayValue(profile.bio)}</dd>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border pt-6 md:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h4 className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">Œuvres ({profile.works.length})</h4>
            </div>
            {profile.works.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Aucune œuvre liée à ce profil.</p> : <div className="mt-3 space-y-2">{profile.works.map((work) => <div key={work.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{work.title}</p><p className="mt-1 text-xs text-muted-foreground">{work.category} · {formatDate(work.createdAt)}</p></div><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{work.status}</span></div><p className="mt-2 text-xs text-muted-foreground">{work.artist}</p></div>)}</div>}
          </div>
          <div>
            <h4 className="font-mono text-[10px] font-medium uppercase tracking-[.2em] text-primary">Soumissions ({profile.submissions.length})</h4>
            {profile.submissions.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">Aucune soumission liée à ce profil.</p> : <div className="mt-3 space-y-2">{profile.submissions.map((submission) => <div key={submission.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="font-bold">{submission.title}</p><p className="mt-1 text-xs text-muted-foreground">{submission.category} · {formatDate(submission.submittedAt)}</p></div><span className="rounded-full bg-muted px-2 py-1 text-[10px] font-bold">{submission.status}</span></div></div>)}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}

function UserDetail({ user }: { user: AdminUser }) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || 'Compte sans nom';
  return (
    <div className="rounded-[2rem] border border-border bg-card p-5 shadow-[var(--shadow-card)] md:p-7">
      <div className="flex items-start gap-4">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[.2em] text-primary">Compte INDAMORA · {user.id}</div>
          <h3 className="display mt-2 break-words text-2xl font-bold">{name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{user.email || 'E-mail non renseigné'}</p>
        </div>
        {user.hasProfile && <StatusPill status={user.profileStatus} published={user.isPublished} />}
      </div>
      <dl className="mt-7 grid gap-x-5 gap-y-5 sm:grid-cols-2">
        <DetailField label="Prénom" value={user.firstName} />
        <DetailField label="Nom" value={user.lastName} />
        <DetailField label="Nom d’utilisateur" value={user.username} />
        <DetailField label="E-mail" value={user.email} />
        <DetailField label="E-mail vérifié" value={user.emailVerified ? 'Oui' : 'Non'} />
        <DetailField label="Profil lié" value={user.hasProfile ? `Profil #${user.profileId}` : 'Aucun profil'} />
        <DetailField label="Compte créé le" value={formatDate(user.createdAt)} />
        <DetailField label="Dernière connexion" value={formatDate(user.lastSignInAt)} />
      </dl>
      <div className="mt-6 border-t border-border pt-5">
        <dt className="text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">Activités déclarées</dt>
        <dd className="mt-2 flex flex-wrap gap-2">{user.activities.length > 0 ? user.activities.map((activity) => <span key={activity} className="rounded-full bg-muted px-3 py-1.5 text-xs font-semibold">{activity}</span>) : <span className="text-sm font-semibold">Aucune activité</span>}</dd>
      </div>
    </div>
  );
}

export function AdminDirectory({ className }: AdminDirectoryProps) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [scope, setScope] = useState<DirectoryScope>('all');
  const [status, setStatus] = useState<DirectoryStatus>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<'user' | 'profile' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const params = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    status: status === 'all' ? undefined : status,
    scope: scope === 'all' ? undefined : scope,
  }), [debouncedSearch, scope, status]);
  const directory = useGetAdminDirectory(params, { query: { queryKey: getGetAdminDirectoryQueryKey(params) } });
  const mutation = useUpdateAdminProfileStatus();
  const data = directory.data;

  const selectedProfile = useMemo(() => {
    if (selectedKind !== 'profile' || !selectedId || !data) return null;
    return data.profiles.find((profile) => String(profile.id) === selectedId) ?? null;
  }, [data, selectedId, selectedKind]);
  const selectedUser = useMemo(() => {
    if (selectedKind !== 'user' || !selectedId || !data) return null;
    return data.users.find((user) => user.id === selectedId) ?? null;
  }, [data, selectedId, selectedKind]);

  const selectProfile = (id: number) => {
    setSelectedKind('profile');
    setSelectedId(String(id));
    setNotice(null);
  };
  const selectUser = (id: string) => {
    setSelectedKind('user');
    setSelectedId(id);
    setNotice(null);
  };

  const performAction = (action: ProfileAction) => {
    if (!selectedProfile) return;
    const dataForAction = action === 'approve'
      ? { profileStatus: 'approved' as const }
      : action === 'reject'
        ? { profileStatus: 'rejected' as const }
        : action === 'publish'
          ? { isPublished: true }
          : { isPublished: false };
    mutation.mutate({ id: selectedProfile.id, data: dataForAction }, {
      onSuccess: async () => {
        const directoryKey = getGetAdminDirectoryQueryKey();
        await queryClient.invalidateQueries({ queryKey: directoryKey });
        await directory.refetch();
        setNotice(action === 'approve' ? 'Profil approuvé.' : action === 'reject' ? 'Profil refusé.' : action === 'publish' ? 'Profil publié dans le répertoire.' : 'Profil retiré du répertoire.');
      },
      onError: () => setNotice('La mise à jour n’a pas pu être enregistrée.'),
    });
  };

  const profiles = data?.profiles ?? [];
  const users = data?.users ?? [];
  const showUsers = scope === 'all' || scope === 'users';
  const showProfiles = scope !== 'users';
  const hasResults = users.length > 0 || profiles.length > 0;

  return (
    <section className={cx('mt-12', className)} aria-labelledby="admin-directory-title">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[.22em] text-primary">Répertoire privé</div>
          <h2 id="admin-directory-title" className="display mt-2 text-3xl font-bold">Comptes et profils</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Recherchez les comptes INDAMORA, contrôlez les profils et rendez visibles les présentations validées.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-secondary" />
          Accès réservé à INDAMORA RECORDS
        </div>
      </div>

      {data && <SummaryBar summary={data.summary} />}

      <div className="mt-5 rounded-3xl border border-border bg-card p-4 shadow-[var(--shadow-card)] md:p-5">
        <div className="flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Rechercher un compte ou un profil</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher par nom, e-mail, activité ou localisation" className="h-11 w-full rounded-full border border-input bg-background pl-11 pr-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15" data-testid="input-admin-directory-search" />
          </label>
          <div className="grid grid-cols-2 gap-3 sm:flex">
            <label className="min-w-0">
              <span className="sr-only">Filtrer par périmètre</span>
              <select value={scope} onChange={(event) => { setScope(event.target.value as DirectoryScope); setSelectedId(null); setSelectedKind(null); }} className="h-11 w-full rounded-full border border-input bg-background px-4 text-sm font-semibold outline-none focus:border-primary sm:w-48" data-testid="select-admin-directory-scope">
                {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="min-w-0">
              <span className="sr-only">Filtrer par statut</span>
              <select value={status} onChange={(event) => { setStatus(event.target.value as DirectoryStatus); setSelectedId(null); setSelectedKind(null); }} className="h-11 w-full rounded-full border border-input bg-background px-4 text-sm font-semibold outline-none focus:border-primary sm:w-48" data-testid="select-admin-directory-status">
                {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
        </div>
        {directory.isFetching && !directory.isLoading && <p className="mt-3 text-xs font-semibold text-muted-foreground">Actualisation du répertoire…</p>}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,.95fr)_minmax(420px,1.05fr)] xl:items-start">
        <div className="space-y-6">
          {directory.isLoading ? <DirectorySkeleton /> : directory.error ? <ErrorState onRetry={() => void directory.refetch()} /> : !hasResults ? <EmptyDirectory scope={scope} /> : (
            <>
              {showUsers && users.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="display text-xl font-bold">Comptes <span className="font-mono text-sm text-muted-foreground">({users.length})</span></h3>
                    <span className="text-xs text-muted-foreground">Tous les comptes protégés</span>
                  </div>
                  <div className="space-y-2">{users.map((user) => <UserRow key={user.id} user={user} selected={selectedKind === 'user' && selectedId === user.id} onSelect={() => selectUser(user.id)} />)}</div>
                </section>
              )}
              {showProfiles && profiles.length > 0 && (
                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="display text-xl font-bold">{scope === 'artists' ? 'Artistes' : scope === 'professionals' ? 'Professionnels' : 'Profils'} <span className="font-mono text-sm text-muted-foreground">({profiles.length})</span></h3>
                    <span className="text-xs text-muted-foreground">Fiches administratives</span>
                  </div>
                  <div className="space-y-2">{profiles.map((profile) => <ProfileRow key={profile.id} profile={profile} selected={selectedKind === 'profile' && selectedId === String(profile.id)} onSelect={() => selectProfile(profile.id)} />)}</div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="xl:sticky xl:top-24">
          {notice && <div className={cx('mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold', notice.includes('pas pu') ? 'border-destructive/25 bg-destructive/5 text-destructive' : 'border-secondary/25 bg-secondary/8 text-secondary')} role="status">{notice}</div>}
          {selectedProfile ? <ProfileDetail profile={selectedProfile} mutation={mutation} onAction={performAction} /> : selectedUser ? <UserDetail user={selectedUser} /> : <div className="rounded-[2rem] border border-dashed border-border bg-card px-6 py-16 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-primary/75" /><h3 className="display mt-5 text-2xl font-bold">Sélectionnez une fiche</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">Choisissez un compte ou un profil pour consulter ses informations administratives et agir sur sa visibilité.</p></div>}
        </div>
      </div>
    </section>
  );
}

export default AdminDirectory;