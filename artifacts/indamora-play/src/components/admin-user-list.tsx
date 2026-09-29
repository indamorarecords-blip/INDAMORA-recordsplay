import { useState } from 'react';
import { useGetAdminUsers } from '@workspace/api-client-react';

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
                    {user.email && <p className="mt-1 break-all text-sm text-muted-foreground">{user.email}</p>}
                    {user.username && <p className="mt-1 text-xs text-muted-foreground">@{user.username}</p>}
                  </div>
                  <p className="text-xs text-muted-foreground">Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</p>
                </div>
                <p className="mt-3 break-all font-mono text-xs text-muted-foreground">ID : {user.id}</p>
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