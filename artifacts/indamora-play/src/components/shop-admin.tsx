import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { useAuth, useUser } from '@clerk/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createShopProduct, getGetShopAdminQueryKey, updateShopProduct, requestShopPhotoUpload, completeShopPhotoUpload,
  useGetShopAdmin, useGetShopOrders,
} from '@workspace/api-client-react';
import type { ShopPhoto, ShopProduct, ShopProductInput, ShopVariant } from '@workspace/api-client-react';
import './shop-admin.css';

const ADMIN_EMAIL = 'indamorarecords@gmail.com';
const ORIGINALS = [
  'IMG_3387_1791538149840.jpeg', 'IMG_3388_1791538149840.jpeg', 'IMG_3389_1791538149840.jpeg', 'IMG_3390_1791538149840.jpeg',
  'IMG_3391_1791538149840.jpeg', 'IMG_3392_1791538149840.jpeg', 'IMG_3395_1791538149840.jpeg',
  'AEEDAA04-AFB7-4383-AC87-C143F64FAD76_1791538149840.png', '389CB62C-81B4-4AA9-B231-E66F73DDA2EF_1791538149840.jpeg',
].map((f) => `original:${f}`);
const STATUS_LABELS: Record<string, string> = { draft: 'Brouillon', active: 'Actif', hidden: 'Masqué', archived: 'Archivé' };
const LOW_STOCK_HINT = 'Stock inconnu : saisissez une quantité pour l’activer.';

function apiMessage(err: unknown, fallback: string): string {
  const e = err as { data?: { error?: unknown }; message?: unknown } | null;
  const m = e?.data?.error;
  if (typeof m === 'string' && m) return m;
  return fallback;
}

const media = (reference: string) => `/api/shop/media?reference=${encodeURIComponent(reference)}`;
const newVariantId = () => `v-${Math.random().toString(36).slice(2, 10)}`;
const eur = (cents: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);

type FormVariant = { id: string; color: string; size: string; stock: string; photos: ShopPhoto[] };
type FormState = { name: string; description: string; category: string; price: string; status: ShopProductInput['status']; visible: boolean; shippingInfo: string; variants: FormVariant[] };

const blankVariant = (): FormVariant => ({ id: newVariantId(), color: '', size: '', stock: '', photos: [] });
const blankForm = (): FormState => ({ name: '', description: '', category: '', price: '', status: 'draft', visible: false, shippingInfo: '', variants: [blankVariant()] });
const fromProduct = (p: ShopProduct): FormState => ({
  name: p.name, description: p.description, category: p.category, price: (p.priceCents / 100).toFixed(2).replace('.', ','),
  status: p.status, visible: p.visible, shippingInfo: p.shippingInfo,
  variants: p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock === null ? '' : String(v.stock), photos: v.photos })),
});

// Exact decimal -> cents without float math.
function parsePrice(text: string): number | null {
  const m = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return cents >= 1 && cents <= 1000000 ? cents : null;
}

function buildInput(form: FormState): { input?: ShopProductInput; errors: string[] } {
  const errors: string[] = [];
  const priceCents = parsePrice(form.price);
  if (form.name.trim().length < 2) errors.push('Le nom est obligatoire (2 caractères minimum).');
  if (!form.category.trim()) errors.push('La catégorie est obligatoire.');
  if (priceCents === null) errors.push('Le prix doit être un montant en euros, par exemple 25 ou 19,90.');
  const variants: ShopVariant[] = [];
  form.variants.forEach((v, i) => {
    if (!v.size.trim()) errors.push(`Variante ${i + 1} : la taille est obligatoire.`);
    if (!v.photos.length) errors.push(`Variante ${i + 1} : au moins une photo est obligatoire.`);
    let stock: number | null = null;
    if (v.stock.trim() !== '') {
      if (!/^\d+$/.test(v.stock.trim()) || Number(v.stock) > 100000) errors.push(`Variante ${i + 1} : stock invalide.`);
      else stock = Number(v.stock);
    }
    variants.push({ id: v.id, color: v.color.trim(), size: v.size.trim(), stock, photos: v.photos });
  });
  if (errors.length || priceCents === null) return { errors };
  return { errors, input: { name: form.name.trim(), description: form.description, category: form.category.trim(), priceCents, status: form.status, visible: form.visible, shippingInfo: form.shippingInfo, variants } };
}

function AdminPhoto({ reference, alt }: { reference: string; alt: string }) {
  const { getToken, userId } = useAuth();
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    setUrl('');
    setFailed(false);
    void (async () => {
      const token = await getToken();
      const response = await fetch(media(reference), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: controller.signal, cache: 'no-store',
      });
      if (!response.ok) throw new Error('Photo inaccessible.');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reference, userId, getToken]);
  return url ? <img src={url} alt={alt} /> : <span className="sa-muted">{failed ? 'Photo inaccessible : vérifiez votre accès administrateur.' : 'Chargement de la photo…'}</span>;
}

function VariantEditor({ variant, index, canRemove, onChange, onRemove, knownRefs }: {
  variant: FormVariant; index: number; canRemove: boolean; onChange: (v: FormVariant) => void; onRemove: () => void; knownRefs: string[];
}) {
  const [chooser, setChooser] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState('');
  async function upload(file: File | undefined) {
    if (!file) return;
    setErr('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErr('Format accepté : JPEG, PNG ou WebP.'); return; }
    if (file.size > 5 * 1024 * 1024) { setErr('Fichier trop lourd : 5 Mo maximum.'); return; }
    setUploading(true);
    try {
      const upload = await requestShopPhotoUpload({ contentType: file.type as 'image/jpeg', size: file.size });
      const response = await fetch(upload.url, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      if (!response.ok) throw new Error('App Storage n’a pas reçu la photo.');
      const photo = await completeShopPhotoUpload({ reference: upload.reference });
      onChange({ ...variant, photos: [...variant.photos, { reference: photo.reference }] });
    } catch (e) { setErr(apiMessage(e, 'Le téléversement a échoué. Réessayez.')); } finally { setUploading(false); }
  }
  const addRef = (reference: string) => { if (variant.photos.length < 12) onChange({ ...variant, photos: [...variant.photos, { reference }] }); };
  return <div className="sa-variant" data-testid={`variant-${index}`}>
    <div className="sa-grid">
      <label className="sa-f">Couleur<input value={variant.color} onChange={(e) => onChange({ ...variant, color: e.target.value })} data-testid={`input-variant-color-${index}`} /></label>
      <label className="sa-f">Taille *<input value={variant.size} onChange={(e) => onChange({ ...variant, size: e.target.value })} data-testid={`input-variant-size-${index}`} /></label>
      <label className="sa-f">Stock<input inputMode="numeric" value={variant.stock} placeholder="Inconnu" onChange={(e) => onChange({ ...variant, stock: e.target.value })} data-testid={`input-variant-stock-${index}`} /></label>
    </div>
    {variant.stock.trim() === '' && <p className="sa-muted">{LOW_STOCK_HINT} Non disponible à l’achat tant que vide.</p>}
    <div className="sa-photos">
      {variant.photos.map((photo, pi) => <div className="sa-photo" key={`${photo.reference}-${pi}`}>
        <AdminPhoto reference={photo.reference} alt={`Photo ${pi + 1}`} />
        <button type="button" className="sa-btn" onClick={() => onChange({ ...variant, photos: variant.photos.filter((_, i) => i !== pi) })} data-testid={`button-remove-photo-${index}-${pi}`}>Retirer</button>
      </div>)}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <button type="button" className="sa-btn" onClick={() => setChooser(!chooser)} data-testid={`button-choose-original-${index}`}>Choisir un original</button>
      <label className="sa-btn" style={{ cursor: 'pointer' }}>{uploading ? 'Envoi…' : 'Téléverser une photo'}
        <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={uploading} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} data-testid={`input-upload-${index}`} />
      </label>
      {canRemove && <button type="button" className="sa-btn danger" onClick={onRemove} data-testid={`button-remove-variant-${index}`}>Retirer la variante</button>}
    </div>
    {err && <div className="sa-error" role="alert">{err}</div>}
    {chooser && <div className="sa-chooser">{knownRefs.map((r) => <button type="button" key={r} onClick={() => addRef(r)} aria-label={`Ajouter ${r}`}><img src={media(r)} alt="" loading="lazy" /></button>)}</div>}
  </div>;
}

function ProductEditor({ product, knownRefs, onDone }: { product: ShopProduct | null; knownRefs: string[]; onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(product ? fromProduct(product) : blankForm());
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState('');
  const save = useMutation({
    mutationFn: (input: ShopProductInput) => product ? updateShopProduct(product.id, { ...input, revision: product.revision }) : createShopProduct(input),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: getGetShopAdminQueryKey() }); setSaved('Produit enregistré.'); onDone(); },
    onError: (err) => setErrors([apiMessage(err, 'L’enregistrement a échoué. Si le produit a été modifié ailleurs, rechargez la liste puis réessayez.')]),
  });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => { setForm((f) => ({ ...f, [key]: value })); setSaved(''); };
  const price = parsePrice(form.price);
  const previewPhoto = form.variants.flatMap((v) => v.photos)[0];

  function submit(status?: ShopProductInput['status']) {
    const next = status ? { ...form, status } : form;
    if (status === 'archived' && !window.confirm('Archiver ce produit ? Il disparaîtra de la boutique (aucune suppression).')) return;
    if (status) setForm(next);
    const { input, errors: errs } = buildInput(next);
    setErrors(errs);
    if (input) save.mutate(input);
  }
  return <div className="sa-layout edit">
    <div className="sa-card">
      <h2>{product ? 'Modifier le produit' : 'Nouveau produit'}</h2>
      <div className="sa-grid">
        <label className="sa-f">Nom *<input value={form.name} onChange={(e) => set('name', e.target.value)} data-testid="input-product-name" /></label>
        <label className="sa-f">Catégorie *<input value={form.category} onChange={(e) => set('category', e.target.value)} data-testid="input-product-category" /></label>
        <label className="sa-f">Prix en euros *<input inputMode="decimal" value={form.price} placeholder="25,00" onChange={(e) => set('price', e.target.value)} data-testid="input-product-price" /></label>
        <label className="sa-f">Statut<select value={form.status} onChange={(e) => set('status', e.target.value as FormState['status'])} data-testid="select-product-status">
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      </div>
      <label className="sa-f" style={{ marginTop: 12 }}>Description<textarea rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} data-testid="input-product-description" /></label>
      <label className="sa-f" style={{ marginTop: 12 }}>Livraison<textarea rows={2} value={form.shippingInfo} onChange={(e) => set('shippingInfo', e.target.value)} data-testid="input-product-shipping" /></label>
      <label className="sa-f" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" style={{ width: 18 }} checked={form.visible} onChange={(e) => set('visible', e.target.checked)} data-testid="checkbox-product-visible" />Visible dans la boutique (si actif)</label>
      <h2 style={{ marginTop: 20 }}>Variantes</h2>
      {form.variants.map((v, i) => <VariantEditor key={v.id} variant={v} index={i} knownRefs={knownRefs} canRemove={form.variants.length > 1}
        onChange={(nv) => set('variants', form.variants.map((x, xi) => xi === i ? nv : x))} onRemove={() => set('variants', form.variants.filter((_, xi) => xi !== i))} />)}
      <button type="button" className="sa-btn" onClick={() => set('variants', [...form.variants, blankVariant()])} disabled={form.variants.length >= 30} data-testid="button-add-variant">Ajouter une variante</button>
      {errors.length > 0 && <div className="sa-error" role="alert" data-testid="error-product-form"><ul style={{ margin: 0, paddingLeft: 18 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {saved && <div className="sa-ok" role="status">{saved}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
        <button type="button" className="sa-btn primary" onClick={() => submit()} disabled={save.isPending} data-testid="button-save-product">{save.isPending ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button type="button" className="sa-btn" onClick={() => submit('draft')} disabled={save.isPending} data-testid="button-save-draft">Enregistrer en brouillon</button>
        {product && product.status !== 'archived' && <button type="button" className="sa-btn danger" onClick={() => submit('archived')} disabled={save.isPending} data-testid="button-archive-product">Archiver</button>}
        <button type="button" className="sa-btn" onClick={onDone} data-testid="button-cancel-edit">Annuler</button>
      </div>
    </div>
    <aside className="sa-card sa-preview" aria-label="Aperçu" data-testid="preview-product">
      <div className="sa-eyebrow">Aperçu</div>
      {previewPhoto ? <img src={media(previewPhoto.reference)} alt="" /> : <p className="sa-muted">Ajoutez une photo pour voir l’aperçu.</p>}
      <h2 style={{ marginTop: 10 }}>{form.name || 'Nom du produit'}</h2>
      <p className="sa-muted">{form.description}</p>
      <strong>{price !== null ? eur(price) : '—'}</strong>
      <p className="sa-muted">{form.variants.map((v) => [v.color, v.size].filter(Boolean).join(' ')).filter(Boolean).join(' / ')}</p>
      <span className="sa-tag">{STATUS_LABELS[form.status]}</span>
    </aside>
  </div>;
}

function stockLabel(p: ShopProduct) {
  if (p.variants.some((v) => v.stock === null)) return 'Stock inconnu';
  const total = p.variants.reduce((s, v) => s + (v.stock ?? 0), 0);
  return total === 0 ? 'Épuisé' : `${total} en stock`;
}

function OrdersPanel() {
  const orders = useGetShopOrders();
  return <div className="sa-card" data-testid="panel-orders">
     <h2>Commandes Stripe</h2>
    {orders.isLoading && <div className="sa-sk" />}
    {orders.error && <div className="sa-error" role="alert">{apiMessage(orders.error, 'Les commandes n’ont pas pu être chargées.')} <button className="sa-btn" onClick={() => void orders.refetch()} data-testid="button-retry-orders">Réessayer</button></div>}
    {orders.data?.message && <p className="sa-muted" data-testid="text-orders-message">{orders.data.message}</p>}
    {orders.data && !orders.data.orders.length && !orders.data.message && <p className="sa-muted">Aucune session de test pour le moment.</p>}
    <div className="sa-list">{orders.data?.orders.map((o) => <div className="sa-row" style={{ gridTemplateColumns: '1fr auto auto' }} key={o.id} data-testid={`row-order-${o.id}`}>
      <span style={{ overflowWrap: 'anywhere' }}>{o.id}</span><span className="sa-tag">{o.status}</span><b>{o.amountCents === null ? '—' : eur(o.amountCents)}</b></div>)}</div>
  </div>;
}

function Dashboard() {
  const dash = useGetShopAdmin();
  const [tab, setTab] = useState<'products' | 'history' | 'orders'>('products');
  const [editing, setEditing] = useState<ShopProduct | 'new' | null>(null);
  const knownRefs = useMemo(() => Array.from(new Set([...ORIGINALS, ...(dash.data?.products ?? []).flatMap((p) => p.variants.flatMap((v) => v.photos.map((ph) => ph.reference)))])), [dash.data?.products]);
  const d = dash.data;
  const cnt = (st: string) => (d?.products ?? []).filter((p) => p.status === st).length;
  return <div className="sa-wrap">
    <div className="sa-top">
      <div><div className="sa-eyebrow">Administration privée</div><h1>Gestion du SHOP</h1><p className="sa-muted">Les produits actifs et visibles apparaissent dans la Boutique.</p></div>
      <div style={{ display: 'flex', gap: 8 }}><Link href="/boutique" className="sa-btn" data-testid="link-view-boutique">Voir la Boutique</Link>
        <button className="sa-btn primary" onClick={() => setEditing('new')} data-testid="button-new-product">Nouveau produit</button></div>
    </div>
    {dash.isLoading && <><div className="sa-sk" /><div className="sa-sk" /><div className="sa-sk" /></>}
    {dash.error && <div className="sa-error" role="alert" data-testid="error-shop-admin">{apiMessage(dash.error, 'Le tableau de bord n’a pas pu être chargé.')} <button className="sa-btn" onClick={() => void dash.refetch()} data-testid="button-retry-admin">Réessayer</button></div>}
    {d && <>
      <div className="sa-stats" data-testid="stats-shop">
        {([['Actifs', d.active], ['Brouillons', cnt('draft')], ['Masqués', cnt('hidden')], ['Archivés', cnt('archived')], ['Épuisés', d.outOfStock], ['Stock bas', d.lowStock], ['Stock inconnu', d.unknownStock], ['Produits', d.products.length]] as const).map(([l, n]) => <div className="sa-stat" key={l}><b>{n}</b><span>{l}</span></div>)}
      </div>
      {editing ? <ProductEditor key={editing === 'new' ? 'new' : editing.id} product={editing === 'new' ? null : editing} knownRefs={knownRefs} onDone={() => setEditing(null)} /> : <>
        <div className="sa-tabs" role="tablist">{([['products', 'Produits'], ['history', 'Historique'], ['orders', 'Commandes']] as const).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`sa-btn${tab === k ? ' tab-on' : ''}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>{l}</button>)}</div>
        {tab === 'products' && (d.products.length === 0 ? <div className="sa-card" data-testid="empty-products"><h2>Aucun produit</h2><p className="sa-muted">Créez votre premier produit : il restera en brouillon jusqu’à son activation.</p></div> :
          <div className="sa-list">{d.products.map((p) => { const ph = p.variants[0]?.photos[0]; return <div className="sa-row" key={p.id} data-testid={`row-product-${p.id}`}>
            {ph ? <img className="sa-thumb" src={media(ph.reference)} alt="" loading="lazy" /> : <div className="sa-thumb" />}
            <div><b>{p.name}</b><div className="sa-muted">{p.category} · {eur(p.priceCents)} · {p.variants.length} variante{p.variants.length > 1 ? 's' : ''}</div>
              <span className="sa-tag">{STATUS_LABELS[p.status]}</span><span className="sa-tag">{p.visible ? 'Visible' : 'Non visible'}</span><span className="sa-tag">{stockLabel(p)}</span></div>
            <button className="sa-btn" onClick={() => setEditing(p)} data-testid={`button-edit-${p.id}`}>Modifier</button></div>; })}</div>)}
        {tab === 'history' && <div className="sa-list" data-testid="list-history">{d.history.length === 0 && <div className="sa-card"><p className="sa-muted">Aucun historique.</p></div>}
          {d.history.map((h) => <div className="sa-row" style={{ gridTemplateColumns: '1fr' }} key={h.id}><div><span className="sa-tag">{h.action}</span>{h.detail}<div className="sa-muted">{new Date(h.at).toLocaleString('fr-FR')} · {h.productId}</div></div></div>)}</div>}
        {tab === 'orders' && <OrdersPanel />}
      </>}
    </>}
  </div>;
}

export function ShopAdminPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const email = user?.primaryEmailAddress;
  const isAdmin = Boolean(isSignedIn && email?.emailAddress?.toLowerCase() === ADMIN_EMAIL && email.verification?.status === 'verified');
  if (!isLoaded) return <div className="shopadmin"><div className="sa-wrap"><div className="sa-sk" /></div></div>;
  return <main className="shopadmin" data-testid="page-shop-admin">
    {isAdmin ? <Dashboard /> : <div className="sa-wrap"><div className="sa-card" data-testid="text-shop-admin-denied"><h1>Accès réservé</h1><p className="sa-muted">Cet espace est réservé à l’administrateur INDAMORA RECORDS.</p></div></div>}
  </main>;
}

export default ShopAdminPage;
