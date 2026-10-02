import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAdminContentQueryKey, getGetAdminUsersQueryKey, getGetArtistsQueryKey,
  getGetCatalogQueryKey, getGetSubmissionsQueryKey,
  useGetAdminContent, useDeleteAdminProfile, useDeleteAdminWork, useCleanupAdminDemos,
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type Selection = { kind: 'profile' | 'work'; id: number; label: string; category: string } | { kind: 'demos' };

export function AdminContentManagement() {
  const content = useGetAdminContent();
  const deleteProfile = useDeleteAdminProfile();
  const deleteWork = useDeleteAdminWork();
  const cleanupDemos = useCleanupAdminDemos();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [search, setSearch] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);
  const client = useQueryClient();
  const { toast } = useToast();
  const pending = deleteProfile.isPending || deleteWork.isPending || cleanupDemos.isPending;
  const term = search.trim().toLocaleLowerCase('fr');
  const profiles = (content.data?.profiles ?? []).filter((p) => `${p.name} ${p.category}`.toLocaleLowerCase('fr').includes(term));
  const works = (content.data?.works ?? []).filter((w) => `${w.title} ${w.artist} ${w.category}`.toLocaleLowerCase('fr').includes(term));

  useEffect(() => { setDialogError(null); }, [selection]);

  async function confirmDeletion() {
    if (!selection || pending) return;
    setDialogError(null);
    try {
      let description = 'L’élément sélectionné a été supprimé.';
      if (selection.kind === 'profile') {
        await deleteProfile.mutateAsync({ id: selection.id, data: { confirmed: true } });
        client.removeQueries({ queryKey: [`/api/artists/${selection.id}`] });
        description = 'Profil supprimé. Le compte Clerk, les œuvres et les fichiers sont conservés.';
      } else if (selection.kind === 'work') {
        await deleteWork.mutateAsync({ id: selection.id, data: { confirmed: true } });
        client.removeQueries({ queryKey: [`/api/catalog/${selection.id}`] });
        description = 'Publication supprimée. Les propositions liées sont détachées et marquées refusées ; les fichiers partagés ou de propriété incertaine sont conservés.';
      } else {
        const result = await cleanupDemos.mutateAsync({ data: { confirmed: true } });
        // Remove any cached details of the exact legacy records as well as lists.
        for (const path of ['/api/artists/1', '/api/artists/2', '/api/catalog/1', '/api/catalog/2']) {
          client.removeQueries({ queryKey: [path] });
        }
        description = `${result.profiles} profil(s), ${result.works} œuvre(s) et ${result.submissions} proposition(s) de démonstration supprimés. La publication ultérieure « Nzelé » est conservée.`;
      }
      await Promise.all([
        getGetAdminContentQueryKey(), getGetAdminUsersQueryKey(),
        getGetArtistsQueryKey(), getGetCatalogQueryKey(), getGetSubmissionsQueryKey(),
      ].map((queryKey) => client.invalidateQueries({ queryKey })));
      setSelection(null);
      toast({ title: 'Suppression terminée', description });
    } catch (error) {
      const message = (error as { data?: { error?: string } }).data?.error ?? 'La suppression a échoué. Aucune réussite n’a été confirmée. Réessayez après avoir vérifié la liste.';
      setDialogError(message);
    }
  }

  return <section className="mt-12" aria-labelledby="admin-content-title">
    <h2 id="admin-content-title" className="display text-3xl font-bold">Gestion des profils et publications</h2>
    <p className="mt-2 text-sm text-muted-foreground">Supprimer uniquement l’élément choisi. Les comptes Clerk et les autres contenus ne sont pas supprimés.</p>
    <div className="mt-5 flex flex-wrap items-center gap-3">
      <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un profil ou une publication" placeholder="Rechercher un profil ou une publication" className="w-full rounded-xl border border-border bg-card px-4 py-3 text-sm sm:max-w-md" />
      <button type="button" onClick={() => setSelection({ kind: 'demos' })} disabled={pending} className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-40" data-testid="button-cleanup-demos">Nettoyer les démonstrations confirmées</button>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">Commentaires : non disponibles dans le système actuel. Les fichiers partagés, externes ou de propriété incertaine sont conservés.</p>
    {content.isLoading ? <div className="skeleton mt-6 h-24 rounded-2xl" aria-label="Chargement des contenus" /> : content.error ?
      <div role="alert" className="mt-6 rounded-2xl border border-destructive/25 bg-card p-6"><p>Impossible de charger les contenus.</p><button type="button" onClick={() => void content.refetch()} className="mt-3 font-semibold text-primary underline">Réessayer</button></div> :
      <div className="mt-6 space-y-8">
        <div><h3 className="font-bold">Profils du Répertoire</h3><div className="mt-3 space-y-3">
          {profiles.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Aucun profil correspondant.</p>}
          {profiles.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5" data-testid={`admin-profile-${p.id}`}>
            <div className="min-w-0"><p className="break-words font-semibold">{p.name}</p><p className="text-xs text-muted-foreground">Profil #{p.id} · {p.category} · {p.profileStatus}</p></div>
            <button type="button" disabled={pending} onClick={() => setSelection({ kind: 'profile', id: p.id, label: p.name, category: p.category })} className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-40" data-testid={`button-delete-profile-${p.id}`}>Supprimer le profil</button>
          </div>)}
        </div></div>
        <div><h3 className="font-bold">Musiques et autres publications du catalogue</h3><div className="mt-3 space-y-3">
          {works.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">Aucune publication correspondante.</p>}
          {works.map((w) => <div key={w.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5" data-testid={`admin-work-${w.id}`}>
            <div className="min-w-0"><p className="break-words font-semibold">{w.title}</p><p className="text-xs text-muted-foreground">Œuvre #{w.id} · {w.artist} · {w.category}</p></div>
            <button type="button" disabled={pending} onClick={() => setSelection({ kind: 'work', id: w.id, label: w.title, category: w.category })} className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-40" data-testid={`button-delete-work-${w.id}`}>{['Musique', 'Music'].includes(w.category) ? 'Supprimer la musique' : 'Supprimer la publication'}</button>
          </div>)}
        </div></div>
      </div>}
    <AlertDialog open={selection !== null} onOpenChange={(open) => { if (!open && !pending) setSelection(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="space-y-3 text-sm text-muted-foreground">
            <p>Voulez-vous vraiment supprimer {selection?.kind === 'demos' ? 'les données de démonstration confirmées' : `« ${selection && 'label' in selection ? selection.label : ''} »` } ? Cette action est irréversible.</p>
            {selection?.kind === 'profile' && <p>Seul le profil #{selection.id} sera supprimé. Le compte Clerk, les œuvres et les fichiers restent conservés.</p>}
            {selection?.kind === 'work' && <p>Seule l’œuvre #{selection.id} sera supprimée du catalogue. Ses propositions liées seront conservées, détachées et marquées refusées. Les fichiers partagés ou de propriété incertaine restent conservés.</p>}
            {selection?.kind === 'demos' && <p>Seules les empreintes exactes vérifiées des profils Béatrice Londo et Mikaël Gbaï, des œuvres initiales « Bangui la belle » et « Rire en famille » et de leurs deux propositions initiales peuvent être supprimées. La publication ultérieure « Nzelé » et les données modifiées ou d’origine incertaine sont conservées.</p>}
          </div></AlertDialogDescription>
        </AlertDialogHeader>
        {dialogError && <p role="alert" className="text-sm text-destructive">{dialogError}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Annuler</AlertDialogCancel>
          <button type="button" disabled={pending} onClick={() => void confirmDeletion()} className="rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50" data-testid="button-confirm-admin-deletion">{pending ? 'Suppression…' : 'Supprimer définitivement'}</button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}