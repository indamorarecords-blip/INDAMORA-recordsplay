import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/expo';
import {
  getGetAdminDirectoryQueryKey,
  useGetAdminDirectory,
  useUpdateAdminProfileStatus,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppHeader, BackButton, EmptyState, ErrorState, Screen } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';

type Scope = 'all' | 'users' | 'profiles' | 'artists' | 'professionals';
type Status = 'all' | 'no-profile' | 'pending' | 'approved' | 'rejected' | 'published' | 'unpublished';
type ListMode = 'accounts' | 'profiles' | 'artists';
type StatusAction = 'approve' | 'reject' | 'publish' | 'unpublish';

const scopeOptions: { value: Scope; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'all', label: 'Tout', icon: 'layers-outline' },
  { value: 'users', label: 'Comptes', icon: 'person-outline' },
  { value: 'profiles', label: 'Profils', icon: 'id-card-outline' },
  { value: 'artists', label: 'Artistes', icon: 'mic-outline' },
  { value: 'professionals', label: 'Professionnels', icon: 'briefcase-outline' },
];

const statusOptions: { value: Status; label: string }[] = [
  { value: 'all', label: 'Tous les statuts' },
  { value: 'pending', label: 'À valider' },
  { value: 'approved', label: 'Approuvés' },
  { value: 'rejected', label: 'Refusés' },
  { value: 'published', label: 'Publiés' },
  { value: 'unpublished', label: 'Non publiés' },
  { value: 'no-profile', label: 'Sans profil' },
];

function formatDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function statusLabel(status?: string | null) {
  switch (status) {
    case 'approved':
      return 'Approuvé';
    case 'rejected':
      return 'Refusé';
    case 'pending':
      return 'À valider';
    default:
      return status || 'Sans profil';
  }
}

function statusTone(status?: string | null) {
  if (status === 'approved') return 'positive';
  if (status === 'rejected') return 'negative';
  return 'neutral';
}

function AdminSkeleton({ colors }: { colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.skeletonStack}>
      <View style={[styles.skeletonHero, { backgroundColor: colors.secondary }]} />
      <View style={[styles.skeletonLine, { backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonLineShort, { backgroundColor: colors.muted }]} />
      <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
      <View style={[styles.skeletonCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
    </View>
  );
}

export default function AdminDirectoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isLoaded, isSignedIn } = useAuth();
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [status, setStatus] = useState<Status>('all');
  const [mode, setMode] = useState<ListMode>('profiles');
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const directoryParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      scope: scope === 'all' ? undefined : scope,
      status: status === 'all' ? undefined : status,
    }),
    [scope, search, status],
  );
  const directory = useGetAdminDirectory(directoryParams, {
    query: {
      enabled: isLoaded && !!isSignedIn,
      queryKey: getGetAdminDirectoryQueryKey(directoryParams),
    },
  });
  const updateStatus = useUpdateAdminProfileStatus();

  const users = directory.data?.users ?? [];
  const profiles = directory.data?.profiles ?? [];
  const artists = useMemo(() => profiles.filter((profile) => profile.profileGroup === 'artists'), [profiles]);
  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const runStatusAction = (action: StatusAction) => {
    if (!selectedProfile) return;
    const actionCopy = {
      approve: 'approuver',
      reject: 'refuser',
      publish: 'publier',
      unpublish: 'dépublier',
    }[action];
    Alert.alert(
      `${actionCopy.charAt(0).toUpperCase()}${actionCopy.slice(1)} ce profil ?`,
      'Cette action sera visible par les équipes et pourra modifier l’accès public du profil.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: action === 'reject' ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              setActionError(null);
              try {
                const data =
                  action === 'approve'
                    ? { profileStatus: 'approved' as const }
                    : action === 'reject'
                      ? { profileStatus: 'rejected' as const }
                      : { isPublished: action === 'publish' };
                await updateStatus.mutateAsync({ id: selectedProfile.id, data });
                await queryClient.invalidateQueries({ queryKey: directory.queryKey });
                await directory.refetch();
              } catch {
                setActionError('L’action n’a pas pu être enregistrée. Vérifiez vos droits puis réessayez.');
              }
            })();
          },
        },
      ],
    );
  };

  if (!isLoaded) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <Screen scroll>
        <AppHeader eyebrow="Accès réservé" title="Administration" action={<BackButton />} />
        <View style={[styles.guardCard, { backgroundColor: colors.secondary }]}>
          <View style={[styles.guardIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="lock-closed-outline" size={24} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.guardTitle, { color: colors.secondaryForeground }]}>Connexion requise</Text>
          <Text style={[styles.guardText, { color: colors.secondaryForeground }]}>
            Connectez-vous avec un compte INDAMORA autorisé pour ouvrir cet espace.
          </Text>
          <Pressable
            testID="button-admin-sign-in"
            onPress={() => router.push('/sign-in')}
            style={({ pressed }) => [
              styles.primaryButton,
              { backgroundColor: colors.accent },
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.primaryButtonText, { color: colors.accentForeground }]}>Se connecter</Text>
            <Ionicons name="arrow-forward" size={16} color={colors.accentForeground} />
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (directory.isLoading) {
    return (
      <Screen scroll>
        <AppHeader eyebrow="Espace sécurisé" title="Administration" action={<BackButton />} />
        <AdminSkeleton colors={colors} />
      </Screen>
    );
  }

  if (directory.isError) {
    return (
      <Screen scroll>
        <AppHeader eyebrow="Espace sécurisé" title="Administration" action={<BackButton />} />
        <ErrorState onRetry={() => void directory.refetch()} />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <AppHeader eyebrow="INDAMORA RECORDS" title="Administration" action={<BackButton />} />

      <View style={[styles.introRow, { borderBottomColor: colors.border }]}>
        <View style={styles.introCopy}>
          <Text style={[styles.introTitle, { color: colors.foreground }]}>Répertoire protégé</Text>
          <Text style={[styles.introText, { color: colors.mutedForeground }]}>
            Contrôlez les comptes, les profils et leur visibilité publique.
          </Text>
        </View>
        <View style={[styles.lockBadge, { backgroundColor: colors.secondary }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.secondaryForeground} />
        </View>
      </View>

      {directory.data?.summary && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.summaryRow}>
          <SummaryPill label="Comptes" value={directory.data.summary.users} colors={colors} />
          <SummaryPill label="Profils" value={directory.data.summary.profiles} colors={colors} />
          <SummaryPill label="À valider" value={directory.data.summary.pendingProfiles} colors={colors} accent />
          <SummaryPill label="Publiés" value={directory.data.summary.publishedProfiles} colors={colors} />
          <SummaryPill label="Œuvres" value={directory.data.summary.works} colors={colors} />
        </ScrollView>
      )}

      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={19} color={colors.mutedForeground} />
        <TextInput
          testID="input-admin-search"
          value={search}
          onChangeText={setSearch}
          placeholder="Rechercher un nom, un email ou une activité"
          placeholderTextColor={colors.mutedForeground}
          style={[styles.searchInput, { color: colors.foreground }]}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable testID="button-admin-clear-search" onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={19} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {scopeOptions.map((option) => {
          const active = scope === option.value;
          return (
            <Pressable
              key={option.value}
              testID={`filter-admin-scope-${option.value}`}
              onPress={() => {
                setScope(option.value);
                if (option.value === 'users') setMode('accounts');
                else if (option.value === 'artists') setMode('artists');
                else if (option.value === 'profiles') setMode('profiles');
              }}
              style={({ pressed }) => [
                styles.filterChip,
                { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card },
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name={option.icon} size={15} color={active ? colors.primaryForeground : colors.mutedForeground} />
              <Text style={[styles.filterChipText, { color: active ? colors.primaryForeground : colors.foreground }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRowCompact}>
        {statusOptions.map((option) => {
          const active = status === option.value;
          return (
            <Pressable
              key={option.value}
              testID={`filter-admin-status-${option.value}`}
              onPress={() => {
                setStatus(option.value);
                if (option.value === 'no-profile') setMode('accounts');
              }}
              style={({ pressed }) => [
                styles.statusFilter,
                { borderColor: active ? colors.accent : colors.border, backgroundColor: active ? colors.accent : colors.background },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.statusFilterText, { color: active ? colors.accentForeground : colors.mutedForeground }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.modeBar, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <ModeButton label="Comptes" icon="people-outline" active={mode === 'accounts'} onPress={() => setMode('accounts')} testID="tab-admin-accounts" colors={colors} />
        <ModeButton label="Profils" icon="id-card-outline" active={mode === 'profiles'} onPress={() => setMode('profiles')} testID="tab-admin-profiles" colors={colors} />
        <ModeButton label="Artistes" icon="mic-outline" active={mode === 'artists'} onPress={() => setMode('artists')} testID="tab-admin-artists" colors={colors} />
      </View>

      {actionError && (
        <View style={[styles.actionError, { backgroundColor: colors.destructive }]}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.destructiveForeground} />
          <Text style={[styles.actionErrorText, { color: colors.destructiveForeground }]}>{actionError}</Text>
          <Pressable testID="button-admin-dismiss-error" onPress={() => setActionError(null)}>
            <Ionicons name="close" size={18} color={colors.destructiveForeground} />
          </Pressable>
        </View>
      )}

      {mode === 'accounts' ? (
        <View style={styles.listStack}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {users.length} compte{users.length > 1 ? 's' : ''}
          </Text>
          {users.length === 0 ? (
            <EmptyState icon="people-outline" title="Aucun compte trouvé" text="Essayez une autre recherche ou un autre filtre." />
          ) : (
            users.map((user) => (
              <AccountRow
                key={user.id}
                user={user}
                colors={colors}
                onProfilePress={user.profileId ? () => {
                  setSelectedProfileId(user.profileId ?? null);
                  setMode('profiles');
                } : undefined}
              />
            ))
          )}
        </View>
      ) : (
        <View style={styles.listStack}>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
            {mode === 'artists' ? artists.length : profiles.length} profil{(mode === 'artists' ? artists.length : profiles.length) > 1 ? 's' : ''}
          </Text>
          {(mode === 'artists' ? artists : profiles).length === 0 ? (
            <EmptyState icon={mode === 'artists' ? 'mic-outline' : 'id-card-outline'} title="Aucun profil trouvé" text="Essayez une autre recherche ou un autre filtre." />
          ) : (
            (mode === 'artists' ? artists : profiles).map((profile) => (
              <ProfileRow key={profile.id} profile={profile} selected={profile.id === selectedProfileId} colors={colors} onPress={() => setSelectedProfileId(profile.id)} />
            ))
          )}
        </View>
      )}

      {selectedProfile && (
        <ProfileDetail
          profile={selectedProfile}
          colors={colors}
          isUpdating={updateStatus.isPending}
          onClose={() => setSelectedProfileId(null)}
          onAction={runStatusAction}
        />
      )}
    </Screen>
  );
}

function SummaryPill({
  label,
  value,
  colors,
  accent = false,
}: {
  label: string;
  value: number;
  colors: ReturnType<typeof useColors>;
  accent?: boolean;
}) {
  return (
    <View style={[styles.summaryPill, { backgroundColor: accent ? colors.accent : colors.card, borderColor: accent ? colors.accent : colors.border }]}>
      <Text style={[styles.summaryValue, { color: accent ? colors.accentForeground : colors.foreground }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: accent ? colors.accentForeground : colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

function ModeButton({
  label,
  icon,
  active,
  onPress,
  testID,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  testID: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.modeButton, pressed && styles.pressed]}>
      <Ionicons name={icon} size={17} color={active ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.modeText, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
      {active && <View style={[styles.modeIndicator, { backgroundColor: colors.primary }]} />}
    </Pressable>
  );
}

function AccountRow({
  user,
  colors,
  onProfilePress,
}: {
  user: {
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
  colors: ReturnType<typeof useColors>;
  onProfilePress?: () => void;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || 'Compte sans nom';
  return (
    <View style={[styles.accountRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.avatar, { backgroundColor: colors.secondary }]}>
        <Text style={[styles.avatarText, { color: colors.secondaryForeground }]}>{name.slice(0, 1).toUpperCase()}</Text>
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{name}</Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>{user.email || 'Email non renseigné'}</Text>
        <View style={styles.rowFoot}>
          <Text style={[styles.tinyMeta, { color: colors.mutedForeground }]}>Créé le {formatDate(user.createdAt)}</Text>
          <StatusBadge label={user.hasProfile ? statusLabel(user.profileStatus) : 'Sans profil'} tone={statusTone(user.profileStatus)} colors={colors} />
        </View>
      </View>
      {onProfilePress && (
        <Pressable testID={`button-admin-account-profile-${user.profileId}`} onPress={onProfilePress} hitSlop={8} style={({ pressed }) => [styles.rowAction, pressed && styles.pressed]}>
          <Ionicons name="arrow-forward-circle-outline" size={25} color={colors.primary} />
        </Pressable>
      )}
    </View>
  );
}

function ProfileRow({
  profile,
  selected,
  colors,
  onPress,
}: {
  profile: {
    id: number;
    name: string;
    category: string;
    subcategory?: string | null;
    location: string;
    profileGroup: string;
    profileStatus: string;
    isPublished: boolean;
    works: { id: number }[];
    submissions: { id: number }[];
  };
  selected: boolean;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  return (
    <Pressable testID={`button-admin-profile-${profile.id}`} onPress={onPress} style={({ pressed }) => [styles.profileRow, { backgroundColor: selected ? colors.secondary : colors.card, borderColor: selected ? colors.primary : colors.border }, pressed && styles.pressed]}>
      <View style={[styles.avatar, { backgroundColor: selected ? colors.primary : colors.muted }]}>
        <Ionicons name={profile.profileGroup === 'artists' ? 'mic-outline' : 'person-outline'} size={19} color={selected ? colors.primaryForeground : colors.foreground} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, { color: colors.foreground }]} numberOfLines={1}>{profile.name}</Text>
        <Text style={[styles.rowMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
          {profile.category}{profile.subcategory ? ` · ${profile.subcategory}` : ''} · {profile.location || 'Localisation non renseignée'}
        </Text>
        <View style={styles.rowFoot}>
          <StatusBadge label={statusLabel(profile.profileStatus)} tone={statusTone(profile.profileStatus)} colors={colors} />
          <Text style={[styles.tinyMeta, { color: colors.mutedForeground }]}>{profile.works.length} œuvre{profile.works.length > 1 ? 's' : ''}</Text>
          <Text style={[styles.tinyMeta, { color: colors.mutedForeground }]}>{profile.isPublished ? 'Publié' : 'Privé'}</Text>
        </View>
      </View>
      <Ionicons name={selected ? 'chevron-up' : 'chevron-forward'} size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

function StatusBadge({
  label,
  tone,
  colors,
}: {
  label: string;
  tone: 'positive' | 'negative' | 'neutral';
  colors: ReturnType<typeof useColors>;
}) {
  const backgroundColor = tone === 'positive' ? colors.secondary : tone === 'negative' ? colors.destructive : colors.muted;
  const color = tone === 'positive' ? colors.secondaryForeground : tone === 'negative' ? colors.destructiveForeground : colors.mutedForeground;
  return (
    <View style={[styles.badge, { backgroundColor }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ProfileDetail({
  profile,
  colors,
  isUpdating,
  onClose,
  onAction,
}: {
  profile: {
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
    works: { id: number; title: string; artist: string; category: string; status: string; createdAt: string }[];
    submissions: { id: number; title: string; category: string; status: string; submittedAt: string }[];
  };
  colors: ReturnType<typeof useColors>;
  isUpdating: boolean;
  onClose: () => void;
  onAction: (action: StatusAction) => void;
}) {
  return (
    <View style={[styles.detailPanel, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeading}>
          {profile.avatar ? (
            <Image source={{ uri: profile.avatar }} style={styles.detailAvatar} />
          ) : (
            <View style={[styles.detailAvatar, { backgroundColor: colors.primary }]}>
              <Ionicons name="person" size={21} color={colors.primaryForeground} />
            </View>
          )}
          <View style={styles.rowCopy}>
            <Text style={[styles.detailTitle, { color: colors.foreground }]}>{profile.name}</Text>
            <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{profile.category} · {profile.profileGroup}</Text>
          </View>
        </View>
        <Pressable testID="button-admin-close-profile" onPress={onClose} hitSlop={8}>
          <Ionicons name="close-circle-outline" size={24} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <View style={styles.detailBadges}>
        <StatusBadge label={statusLabel(profile.profileStatus)} tone={statusTone(profile.profileStatus)} colors={colors} />
        <StatusBadge label={profile.isPublished ? 'Publié' : 'Non publié'} tone={profile.isPublished ? 'positive' : 'neutral'} colors={colors} />
      </View>

      <View style={[styles.actionGrid, { borderTopColor: colors.border, borderBottomColor: colors.border }]}>
        <ActionButton action="approve" label="Approuver" icon="checkmark-circle-outline" disabled={isUpdating || profile.profileStatus === 'approved'} onPress={onAction} colors={colors} />
        <ActionButton action="reject" label="Refuser" icon="close-circle-outline" disabled={isUpdating || profile.profileStatus === 'rejected'} onPress={onAction} colors={colors} destructive />
        <ActionButton action="publish" label="Publier" icon="eye-outline" disabled={isUpdating || profile.isPublished} onPress={onAction} colors={colors} />
        <ActionButton action="unpublish" label="Dépublier" icon="eye-off-outline" disabled={isUpdating || !profile.isPublished} onPress={onAction} colors={colors} />
      </View>

      <DetailSection title="Informations administratives" colors={colors}>
        <DetailLine label="ID profil" value={`#${profile.id}`} colors={colors} />
        <DetailLine label="Propriétaire" value={profile.ownerId || 'Non associé'} colors={colors} />
        <DetailLine label="Nom du compte" value={[profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Non renseigné'} colors={colors} />
        <DetailLine label="Compte" value={profile.email || 'Email non renseigné'} colors={colors} />
        <DetailLine label="Contact" value={[profile.phone, profile.location, profile.country].filter(Boolean).join(' · ') || 'Non renseigné'} colors={colors} />
        <DetailLine label="Créé le" value={formatDate(profile.createdAt)} colors={colors} />
        <DetailLine label="Mis à jour" value={formatDate(profile.updatedAt)} colors={colors} />
        {profile.publicPath && <DetailLine label="Chemin public" value={profile.publicPath} colors={colors} />}
        {!!profile.socialLinks?.length && <DetailLine label="Réseaux" value={profile.socialLinks.join(' · ')} colors={colors} />}
      </DetailSection>

      <DetailSection title="Présentation" colors={colors}>
        <Text style={[styles.bio, { color: colors.foreground }]}>{profile.bio || 'Aucune biographie renseignée.'}</Text>
        {!!profile.specialties.length && (
          <View style={styles.tagRow}>
            {profile.specialties.map((specialty) => (
              <View key={specialty} style={[styles.specialtyTag, { backgroundColor: colors.muted }]}>
                <Text style={[styles.specialtyText, { color: colors.foreground }]}>{specialty}</Text>
              </View>
            ))}
          </View>
        )}
        {!!profile.website && <DetailLine label="Site web" value={profile.website} colors={colors} />}
      </DetailSection>

      <DetailSection title={`Œuvres · ${profile.works.length}`} colors={colors}>
        {profile.works.length === 0 ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>Aucune œuvre associée.</Text>
        ) : (
          profile.works.map((work) => (
            <View key={work.id} style={[styles.workLine, { borderBottomColor: colors.border }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.workTitle, { color: colors.foreground }]} numberOfLines={1}>{work.title}</Text>
                <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{work.category} · {formatDate(work.createdAt)}</Text>
              </View>
              <StatusBadge label={statusLabel(work.status)} tone={statusTone(work.status)} colors={colors} />
            </View>
          ))
        )}
      </DetailSection>

      <DetailSection title={`Soumissions · ${profile.submissions.length}`} colors={colors}>
        {profile.submissions.length === 0 ? (
          <Text style={[styles.mutedText, { color: colors.mutedForeground }]}>Aucune soumission associée.</Text>
        ) : (
          profile.submissions.map((submission) => (
            <View key={submission.id} style={[styles.workLine, { borderBottomColor: colors.border }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.workTitle, { color: colors.foreground }]} numberOfLines={1}>{submission.title}</Text>
                <Text style={[styles.rowMeta, { color: colors.mutedForeground }]}>{submission.category} · {formatDate(submission.submittedAt)}</Text>
              </View>
              <StatusBadge label={statusLabel(submission.status)} tone={statusTone(submission.status)} colors={colors} />
            </View>
          ))
        )}
      </DetailSection>
    </View>
  );
}

function DetailSection({ title, colors, children }: { title: string; colors: ReturnType<typeof useColors>; children: ReactNode }) {
  return (
    <View style={styles.detailSection}>
      <Text style={[styles.detailSectionTitle, { color: colors.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

function DetailLine({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.detailLine}>
      <Text style={[styles.detailLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: colors.foreground }]} numberOfLines={3}>{value}</Text>
    </View>
  );
}

function ActionButton({
  action,
  label,
  icon,
  disabled,
  onPress,
  colors,
  destructive = false,
}: {
  action: StatusAction;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  disabled: boolean;
  onPress: (action: StatusAction) => void;
  colors: ReturnType<typeof useColors>;
  destructive?: boolean;
}) {
  return (
    <Pressable
      testID={`button-admin-${action}`}
      disabled={disabled}
      onPress={() => onPress(action)}
      style={({ pressed }) => [styles.actionButton, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={18} color={disabled ? colors.mutedForeground : destructive ? colors.destructive : colors.primary} />
      <Text style={[styles.actionButtonText, { color: disabled ? colors.mutedForeground : destructive ? colors.destructive : colors.primary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  guardCard: { borderRadius: 24, padding: 24, marginTop: 10 },
  guardIcon: { width: 48, height: 48, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  guardTitle: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.5, marginTop: 20 },
  guardText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, opacity: 0.82 },
  primaryButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 13, marginTop: 21 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  introRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  introCopy: { flex: 1, paddingRight: 14 },
  introTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  introText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 5 },
  lockBadge: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  summaryRow: { gap: 8, paddingVertical: 16 },
  summaryPill: { minWidth: 76, borderRadius: 15, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  summaryValue: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  summaryLabel: { fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 2 },
  searchBox: { minHeight: 50, borderRadius: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14, paddingVertical: 13 },
  filterRow: { gap: 8, paddingTop: 13, paddingBottom: 4 },
  filterRowCompact: { gap: 7, paddingTop: 8, paddingBottom: 13 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  filterChipText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  statusFilter: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  statusFilterText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  modeBar: { flexDirection: 'row', borderWidth: 1, borderRadius: 16, padding: 4, marginBottom: 16 },
  modeButton: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, borderRadius: 12, position: 'relative' },
  modeText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  modeIndicator: { position: 'absolute', left: 16, right: 16, bottom: 0, height: 2, borderRadius: 2 },
  listStack: { gap: 10 },
  sectionLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 1 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 13 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1, padding: 13 },
  avatar: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  rowCopy: { flex: 1, minWidth: 0 },
  rowTitle: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  rowMeta: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  rowFoot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 7 },
  tinyMeta: { fontFamily: 'Inter_400Regular', fontSize: 10 },
  rowAction: { padding: 3 },
  badge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  badgeText: { fontFamily: 'Inter_600SemiBold', fontSize: 10 },
  actionError: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  actionErrorText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  detailPanel: { borderRadius: 22, borderWidth: 1.5, padding: 16, marginTop: 18, marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  detailHeading: { flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1, paddingRight: 10 },
  detailAvatar: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontFamily: 'Inter_700Bold', fontSize: 18, letterSpacing: -0.4 },
  detailBadges: { flexDirection: 'row', gap: 7, marginTop: 13 },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingVertical: 7 },
  actionButton: { width: '50%', minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7 },
  actionButtonText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  detailSection: { marginTop: 19 },
  detailSectionTitle: { fontFamily: 'Inter_700Bold', fontSize: 13, marginBottom: 10 },
  detailLine: { flexDirection: 'row', gap: 12, paddingVertical: 5 },
  detailLabel: { width: 84, fontFamily: 'Inter_500Medium', fontSize: 11 },
  detailValue: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17 },
  bio: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 11 },
  specialtyTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  specialtyText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  mutedText: { fontFamily: 'Inter_400Regular', fontSize: 13 },
  workLine: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 9 },
  workTitle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  skeletonStack: { gap: 12, marginTop: 10 },
  skeletonHero: { height: 94, borderRadius: 22, opacity: 0.55 },
  skeletonLine: { width: '58%', height: 14, borderRadius: 7, opacity: 0.6 },
  skeletonLineShort: { width: '35%', height: 11, borderRadius: 6, opacity: 0.45 },
  skeletonCard: { height: 76, borderRadius: 18, borderWidth: 1, opacity: 0.55 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.48 },
});