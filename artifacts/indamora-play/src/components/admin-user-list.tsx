import { useState } from 'react';
import { useGetAdminUsers } from '@workspace/api-client-react';

function Detail({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm">{value === null || value === undefined || value === '' ? 'Non renseigné' : value}</dd>
    </div>
  );
}

export function AdminUserList() {
  const [offset, setOffset] = useState(0);
  const users = useGetAdminUsers({ offset });

  return (
    <section className="mt-12" aria-labelledby="admin-users-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="admin-users-title" className="display text-3xl font-bold">Utilisateurs enregistrés</h2>
          <p className="mt-2 text-sm text-muted-foreground">Comptes existants dans Clerk, visibles uniquement par l’administration.</p>
        </div>
        {users.data && <p className="text-sm text-muted-foreground">{users.data.totalCount} compte{users.data.totalCount === 1 ? '' : 's'}</p>}
      </div>

      {users.isLoading ? (
        <div className="mt-6 space-y-3" aria-label="Chargement des utilisateurs">
          {[0, 1, 2].map((item) => <div key={item} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : users.error ? (
        <div className="mt-6 rounded-2xl border border-destructive/25 bg-card p-6" role="alert">
          <p className="font-semibold">Impossible de charger les utilisateurs.</p>
          <button type="button" onClick={() => void users.refetch()} className="mt-3 text-sm font-bold text-primary underline">Réessayer</button>
        </div>
      ) : users.data?.users.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-border bg-card px-5 py-10 text-center text-muted-foreground">Aucun utilisateur sur cette page.</p>
      ) : (
        <div className="mt-6 space-y-3" data-testid="admin-users-list">
          {users.data?.users.map((user) => {
            const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || user.email || user.id;
            return (
              <article key={user.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-bold">{name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Detail label="Prénom" value={user.firstName} />
                  <Detail label="Nom" value={user.lastName} />
                  <Detail label="Email" value={user.email} />
                  <Detail label="Nom d’utilisateur" value={user.username} />
                  <Detail label="Téléphone Clerk" value={user.phoneNumber} />
                  <Detail label="Identifiant Clerk" value={user.id} />
                </dl>

                <section className="mt-6 border-t border-border pt-5" aria-label={`Profils associés à ${name}`}>
                  <h4 className="font-semibold">Profils associés</h4>
                  {user.profiles.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Aucun profil artiste rattaché à ce compte.</p>
                  ) : (
                    <div className="mt-3 space-y-3">
                      {user.profiles.map((profile) => (
                        <div key={profile.id} className="rounded-xl bg-muted p-4">
                          <div className="flex items-center gap-3">
                            {profile.avatar && <img src={profile.avatar} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />}
                            <div className="min-w-0">
                              <h5 className="break-words font-semibold">{profile.name}</h5>
                              <p className="text-xs text-muted-foreground">Profil #{profile.id}</p>
                            </div>
                          </div>
                          <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            <Detail label="Groupe de profil" value={profile.profileGroup} />
                            <Detail label="Catégorie" value={profile.category} />
                            <Detail label="Sous-catégorie" value={profile.subcategory} />
                            <Detail label="Biographie" value={profile.bio} />
                            <Detail label="Localisation" value={profile.location} />
                            <Detail label="Pays" value={profile.country} />
                            <Detail label="Spécialités" value={profile.specialties.join(', ')} />
                            <Detail label="Site web" value={profile.website} />
                            <Detail label="Réseaux sociaux" value={profile.socialLinks.join(', ')} />
                            <Detail label="Contact professionnel" value={profile.professionalContact} />
                            <Detail label="Statut du profil" value={profile.profileStatus} />
                            <Detail label="Publié" value={profile.isPublished ? 'Oui' : 'Non'} />
                            <Detail label="Avatar" value={profile.avatar} />
                            <Detail label="Nombre d’œuvres" value={profile.worksCount} />
                            <Detail label="Identifiant du propriétaire" value={profile.ownerId} />
                            <Detail label="Créé le" value={new Date(profile.createdAt).toLocaleDateString('fr-FR')} />
                          </dl>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            );
          })}
        </div>
      )}

      {users.data && users.data.totalCount > users.data.limit && (
        <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Pages des utilisateurs">
          <button type="button" disabled={offset === 0 || users.isFetching} onClick={() => setOffset(Math.max(0, offset - users.data!.limit))} className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">Précédent</button>
          <span className="text-center text-xs text-muted-foreground">{offset + 1}–{Math.min(offset + users.data.limit, users.data.totalCount)} sur {users.data.totalCount}</span>
          <button type="button" disabled={offset + users.data.limit >= users.data.totalCount || users.isFetching} onClick={() => setOffset(offset + users.data!.limit)} className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40">Suivant</button>
        </nav>
      )}
    </section>
  );
}