import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  createShopQuote,
  getGetStoreCheckoutStatusQueryKey,
  useCreateStoreCheckout,
  useGetShopCatalog,
  useGetStoreCatalog,
  useGetStoreCheckoutStatus,
} from '@workspace/api-client-react';
import type { ShopPhoto, ShopPublicProduct, ShopPublicVariant, ShopQuote, StoreSku } from '@workspace/api-client-react';
import { COLOR_LABELS, COLOR_SWATCH, OFFICIAL_PREVIEW_QR } from './boutique-preview-media';
import type { ProductColor } from './boutique-preview-media';
import './boutique-page.css';

// Cart lines now reference dynamic ids. Older lines (sku/color) are kept until they can be resolved.
type CartLine = { productId?: string; variantId?: string; sku?: string; color?: string; quantity: number };
const LEGACY_DEFAULT_COLOR: Record<string, string> = { tshirt: 'rose', bob: 'noir' };

const STORAGE_KEY = 'indamora-play-boutique-cart';
const OFFICIAL_LOGO_URL = `${import.meta.env.BASE_URL}assets/indamora-play-logo.png`;
const EU_COUNTRIES: Record<string, string> = {
  AT: 'Autriche', BE: 'Belgique', BG: 'Bulgarie', HR: 'Croatie', CY: 'Chypre',
  CZ: 'Tchéquie', DK: 'Danemark', EE: 'Estonie', FI: 'Finlande', DE: 'Allemagne',
  GR: 'Grèce', HU: 'Hongrie', IE: 'Irlande', IT: 'Italie', LV: 'Lettonie',
  LT: 'Lituanie', LU: 'Luxembourg', MT: 'Malte', NL: 'Pays-Bas', PL: 'Pologne',
  PT: 'Portugal', RO: 'Roumanie', SK: 'Slovaquie', SI: 'Slovénie', ES: 'Espagne',
  SE: 'Suède',
};
const OTHER_COUNTRIES: Array<[string, string]> = [
  ['AF', 'Afghanistan'], ['ZA', 'Afrique du Sud'], ['AL', 'Albanie'], ['DZ', 'Algérie'],
  ['DE', 'Allemagne'], ['AD', 'Andorre'], ['AO', 'Angola'], ['AG', 'Antigua-et-Barbuda'],
  ['SA', 'Arabie saoudite'], ['AR', 'Argentine'], ['AM', 'Arménie'], ['AU', 'Australie'],
  ['AZ', 'Azerbaïdjan'], ['BS', 'Bahamas'], ['BH', 'Bahreïn'], ['BD', 'Bangladesh'],
  ['BB', 'Barbade'], ['BE', 'Belgique'], ['BZ', 'Belize'], ['BJ', 'Bénin'],
  ['BT', 'Bhoutan'], ['BY', 'Biélorussie'], ['BO', 'Bolivie'], ['BA', 'Bosnie-Herzégovine'],
  ['BW', 'Botswana'], ['BR', 'Brésil'], ['BN', 'Brunei'], ['BG', 'Bulgarie'],
  ['BF', 'Burkina Faso'], ['BI', 'Burundi'], ['KH', 'Cambodge'], ['CM', 'Cameroun'],
  ['CA', 'Canada'], ['CV', 'Cap-Vert'], ['CL', 'Chili'], ['CN', 'Chine'],
  ['CY', 'Chypre'], ['CO', 'Colombie'], ['KM', 'Comores'], ['CG', 'Congo'],
  ['CD', 'Congo (RDC)'], ['KR', 'Corée du Sud'], ['CR', 'Costa Rica'], ['CI', 'Côte d’Ivoire'],
  ['HR', 'Croatie'], ['DK', 'Danemark'], ['DJ', 'Djibouti'], ['DM', 'Dominique'],
  ['EG', 'Égypte'], ['AE', 'Émirats arabes unis'], ['EC', 'Équateur'], ['ER', 'Érythrée'],
  ['ES', 'Espagne'], ['EE', 'Estonie'], ['US', 'États-Unis'], ['ET', 'Éthiopie'],
  ['FJ', 'Fidji'], ['FI', 'Finlande'], ['GA', 'Gabon'], ['GM', 'Gambie'],
  ['GE', 'Géorgie'], ['GH', 'Ghana'], ['GR', 'Grèce'], ['GD', 'Grenade'],
  ['GT', 'Guatemala'], ['GN', 'Guinée'], ['GQ', 'Guinée équatoriale'], ['GW', 'Guinée-Bissau'],
  ['GY', 'Guyana'], ['HT', 'Haïti'], ['HN', 'Honduras'], ['HU', 'Hongrie'],
  ['IN', 'Inde'], ['ID', 'Indonésie'], ['IQ', 'Irak'], ['IR', 'Iran'],
  ['IE', 'Irlande'], ['IS', 'Islande'], ['IL', 'Israël'], ['IT', 'Italie'],
  ['JM', 'Jamaïque'], ['JP', 'Japon'], ['JO', 'Jordanie'], ['KZ', 'Kazakhstan'],
  ['KE', 'Kenya'], ['KG', 'Kirghizistan'], ['KI', 'Kiribati'], ['KW', 'Koweït'],
  ['LA', 'Laos'], ['LS', 'Lesotho'], ['LV', 'Lettonie'], ['LB', 'Liban'],
  ['LR', 'Libéria'], ['LY', 'Libye'], ['LI', 'Liechtenstein'], ['LT', 'Lituanie'],
  ['LU', 'Luxembourg'], ['MK', 'Macédoine du Nord'], ['MG', 'Madagascar'], ['MY', 'Malaisie'],
  ['MW', 'Malawi'], ['MV', 'Maldives'], ['ML', 'Mali'], ['MT', 'Malte'],
  ['MA', 'Maroc'], ['MH', 'Îles Marshall'], ['MU', 'Maurice'], ['MR', 'Mauritanie'],
  ['MX', 'Mexique'], ['FM', 'Micronésie'], ['MD', 'Moldavie'], ['MC', 'Monaco'],
  ['MN', 'Mongolie'], ['ME', 'Monténégro'], ['MZ', 'Mozambique'], ['MM', 'Myanmar'],
  ['NA', 'Namibie'], ['NR', 'Nauru'], ['NP', 'Népal'], ['NI', 'Nicaragua'],
  ['NE', 'Niger'], ['NG', 'Nigéria'], ['NO', 'Norvège'], ['NZ', 'Nouvelle-Zélande'],
  ['OM', 'Oman'], ['UG', 'Ouganda'], ['UZ', 'Ouzbékistan'], ['PK', 'Pakistan'],
  ['PW', 'Palaos'], ['PA', 'Panama'], ['PG', 'Papouasie-Nouvelle-Guinée'], ['PY', 'Paraguay'],
  ['NL', 'Pays-Bas'], ['PE', 'Pérou'], ['PH', 'Philippines'], ['PL', 'Pologne'],
  ['PT', 'Portugal'], ['QA', 'Qatar'], ['RO', 'Roumanie'], ['GB', 'Royaume-Uni'],
  ['RU', 'Russie'], ['RW', 'Rwanda'], ['KN', 'Saint-Christophe-et-Niévès'], ['LC', 'Sainte-Lucie'],
  ['VC', 'Saint-Vincent-et-les-Grenadines'], ['SV', 'Salvador'], ['WS', 'Samoa'], ['SM', 'Saint-Marin'],
  ['ST', 'Sao Tomé-et-Principe'], ['SN', 'Sénégal'], ['RS', 'Serbie'], ['SC', 'Seychelles'],
  ['SL', 'Sierra Leone'], ['SG', 'Singapour'], ['SK', 'Slovaquie'], ['SI', 'Slovénie'],
  ['SO', 'Somalie'], ['SD', 'Soudan'], ['SS', 'Soudan du Sud'], ['LK', 'Sri Lanka'],
  ['SE', 'Suède'], ['CH', 'Suisse'], ['SR', 'Suriname'], ['SY', 'Syrie'],
  ['TJ', 'Tadjikistan'], ['TZ', 'Tanzanie'], ['TD', 'Tchad'], ['CZ', 'Tchéquie'],
  ['TH', 'Thaïlande'], ['TL', 'Timor oriental'], ['TG', 'Togo'], ['TO', 'Tonga'],
  ['TT', 'Trinité-et-Tobago'], ['TN', 'Tunisie'], ['TM', 'Turkménistan'], ['TR', 'Turquie'],
  ['TV', 'Tuvalu'], ['UA', 'Ukraine'], ['UY', 'Uruguay'], ['VU', 'Vanuatu'],
  ['VA', 'Vatican'], ['VE', 'Venezuela'], ['VN', 'Viêt Nam'], ['YE', 'Yémen'],
  ['ZM', 'Zambie'], ['ZW', 'Zimbabwe'],
];

const mediaUrl = (reference: string) => `/api/shop/media?reference=${encodeURIComponent(reference)}`;
const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function readCart(): CartLine[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const merged: CartLine[] = [];
    for (const raw of stored as Array<Partial<CartLine>>) {
      if (typeof raw !== 'object' || raw === null) continue;
      if (!Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0) continue;
      const quantity = Math.min(raw.quantity as number, 20);
      const line: CartLine = raw.productId && raw.variantId
        ? { productId: String(raw.productId), variantId: String(raw.variantId), quantity }
        : typeof raw.sku === 'string' ? { sku: raw.sku, color: raw.color ?? LEGACY_DEFAULT_COLOR[raw.sku], quantity } : { quantity: 0 };
      if (!line.quantity) continue;
      const existing = merged.find((l) => l.productId === line.productId && l.variantId === line.variantId && l.sku === line.sku && l.color === line.color);
      if (existing) existing.quantity = Math.min(20, existing.quantity + quantity); else merged.push(line);
    }
    return merged;
  } catch {
    return [];
  }
}

// Resolve an older sku/color line to a catalog product/variant, only when unambiguous.
function resolveLegacy(line: CartLine, products: ShopPublicProduct[]): CartLine {
  if (line.productId || !line.sku) return line;
  const sku = norm(line.sku);
  const product = products.find((p) => norm(p.id) === sku || norm(p.id).includes(sku) || norm(p.name).includes(sku.replace('-', ' ')));
  if (!product) return line;
  const color = line.color ? norm(line.color) : '';
  const variants = product.variants.filter((v) => !color || norm(v.id) === color || norm(v.color) === color || norm(v.id).includes(color));
  if (variants.length !== 1 && !(variants.length > 1 && !color)) return line;
  return { productId: product.id, variantId: variants[0].id, quantity: line.quantity };
}

const lineId = (line: CartLine) => line.productId ? `${line.productId}__${line.variantId}` : `legacy-${line.sku}-${line.color ?? ''}`;

function formatEUR(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function PhotoFrame({ photo, alt, onError }: { photo: ShopPhoto; alt: string; onError: () => void }) {
  const src = mediaUrl(photo.reference);
  const crop = photo.crop;
  if (!crop) return <img className="bt-product-image" src={src} alt={alt} loading="lazy" decoding="async" onError={onError} />;
  return <div className="bt-crop" style={{ aspectRatio: String(crop.ratio) }}>
    <img src={src} alt={alt} loading="lazy" decoding="async" onError={onError}
      style={{ width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, left: `${-(crop.x / crop.w) * 100}%`, top: `${-(crop.y / crop.h) * 100}%` }} />
  </div>;
}

function swatchColor(color: string): string {
  const key = norm(color) as ProductColor;
  return key in COLOR_SWATCH ? COLOR_SWATCH[key] : 'linear-gradient(135deg,#F4A6C1,#fff)';
}
const variantLabel = (variant: ShopPublicVariant) => [variant.color, variant.size].filter(Boolean).join(' · ') || 'Standard';

function ProductCard({ product, inCart, onAdd, cartUpdating }: { product: ShopPublicProduct; inCart: (variantId: string) => number; onAdd: (variantId: string) => void; cartUpdating: boolean }) {
  const [variantId, setVariantId] = useState(product.variants.find((v) => v.available)?.id ?? product.variants[0]?.id ?? '');
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const variant = product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const photos = variant?.photos ?? [];
  const photo = photos[photoIndex] ?? photos[0];
  useEffect(() => { setFailed(false); }, [photo?.reference]);
  const colors = Array.from(new Set(product.variants.map((v) => v.color)));
  const sizesForColor = product.variants.filter((v) => v.color === variant?.color);
  const quantity = variant ? inCart(variant.id) : 0;
  const pid = product.id;
  const choose = (id: string) => { setVariantId(id); setPhotoIndex(0); };
  return <article className="bt-product" data-testid={`card-product-${pid}`}>
    <div data-testid={`visual-product-${pid}`}>
      <div className="bt-product-art">
        {photo && !failed ? <PhotoFrame photo={photo} alt={`${product.name} ${variant ? variantLabel(variant) : ''}`} onError={() => setFailed(true)} /> : <div className="bt-product-placeholder">
          <span>{product.name}</span><small>Photo indisponible.</small>
        </div>}
      </div>
      <div className="bt-photo-controls">
        {photos.length > 1 && <>
          <button type="button" aria-label={`Photo précédente de ${product.name}`} onClick={() => setPhotoIndex((photoIndex + photos.length - 1) % photos.length)} data-testid={`button-photo-prev-${pid}`}>‹</button>
          <span aria-live="polite">{photoIndex + 1}/{photos.length}</span>
          <button type="button" aria-label={`Photo suivante de ${product.name}`} onClick={() => setPhotoIndex((photoIndex + 1) % photos.length)} data-testid={`button-photo-next-${pid}`}>›</button>
        </>}
        {photo && <a href={mediaUrl(photo.reference)} target="_blank" rel="noreferrer" className="bt-photo-link" data-testid={`link-photo-${pid}`}>Photo originale ↗</a>}
      </div>
    </div>
    <div className="bt-product-body">
      <h3 className="bt-product-title" data-testid={`text-product-name-${pid}`}>{product.name}</h3>
      {product.description && <div className="bt-product-type">{product.description}</div>}
      {colors.length > 1 || (colors[0] && colors.length === 1 && colors[0] !== '') ? <div className="bt-swatches" role="radiogroup" aria-label={`Couleur : ${product.name}`}>
        {colors.map((color) => {
          const target = product.variants.find((v) => v.color === color && v.available) ?? product.variants.find((v) => v.color === color)!;
          return <button type="button" role="radio" aria-checked={color === variant?.color} key={color || 'none'}
            className={`bt-swatch${color === variant?.color ? ' active' : ''}`} onClick={() => choose(target.id)} data-testid={`button-color-${pid}-${target.id}`}>
            <i style={{ background: swatchColor(color) }} />{COLOR_LABELS[norm(color) as ProductColor] ?? color}
          </button>;
        })}
      </div> : null}
      {sizesForColor.length > 1 && <div className="bt-swatches bt-sizes" role="radiogroup" aria-label={`Taille : ${product.name}`}>
        {sizesForColor.map((v) => <button type="button" role="radio" aria-checked={v.id === variant?.id} key={v.id}
          className={`bt-swatch bt-size${v.id === variant?.id ? ' active' : ''}${v.available ? '' : ' off'}`} onClick={() => choose(v.id)} data-testid={`button-size-${pid}-${v.id}`}>
          {v.size}{v.available ? '' : ' · indisponible'}
        </button>)}
      </div>}
      {variant && sizesForColor.length === 1 && <div className="bt-color-selected" data-testid={`text-color-${pid}`}>{variantLabel(variant)}</div>}
      <div className="bt-product-bottom">
        <strong className="bt-price" data-testid={`text-product-price-${pid}`}>{formatEUR(product.priceCents).replace(',00', '')}</strong>
        <button className="bt-add" onClick={() => variant && onAdd(variant.id)} disabled={cartUpdating || !variant || !variant.available || quantity >= 20} data-testid={`button-add-${pid}`}>
          {!variant?.available ? 'Indisponible' : quantity ? `Ajouter · ${quantity}` : 'Ajouter au panier'}
        </button>
      </div>
      <div className="bt-availability" data-testid={`status-product-${pid}`}>{!variant?.available ? 'Indisponible' : quantity ? `${quantity} dans le panier TEST` : 'Article du catalogue TEST'}</div>
      {product.shippingInfo && <div className="bt-availability">{product.shippingInfo}</div>}
    </div>
  </article>;
}

function ProductSkeletons() {
  return <div className="bt-product-grid" aria-label="Chargement de la boutique" data-testid="loading-store-catalog">
    {[0, 1, 2, 3].map((i) => <div className="bt-product-skeleton bt-skeleton" key={i} />)}
  </div>;
}

function ReturnState({ sessionId }: { sessionId: string }) {
  const statusQuery = useGetStoreCheckoutStatus(
    { sessionId },
    { query: { enabled: Boolean(sessionId), queryKey: getGetStoreCheckoutStatusQueryKey({ sessionId }), refetchInterval: (query) => query.state.data?.status === 'pending' ? 3000 : false } },
  );
  const status = statusQuery.data?.status;
  const isPaid = status === 'paid';
  const isExpired = status === 'expired';
  const title = isPaid ? 'Merci de faire partie du mouvement.' : isExpired ? 'Cette session a expiré.' : 'Votre paiement reste à confirmer.';
  const detail = isPaid
    ? 'Stripe a confirmé ce paiement de TEST. Aucune commande réelle ni aucun débit réel ne sont créés.'
    : isExpired
      ? 'La session de paiement n’est plus active. Vous pouvez revenir à la boutique et reprendre votre commande.'
      : status === 'unpaid'
        ? 'Stripe indique que le paiement n’a pas été effectué. Aucun achat n’est confirmé.'
        : status === 'pending'
          ? 'Stripe traite encore votre paiement. Cette page ne confirme pas une commande tant que le statut n’est pas payé.'
          : 'Nous vérifions le statut de cette session auprès de Stripe. Cette page ne confirme pas le paiement.';

  return <section className="bt-return bt-shell" aria-live="polite">
    <div className={`bt-status-card ${isPaid ? 'success' : isExpired || status === 'unpaid' ? 'failure' : ''}`} data-testid="status-checkout-return">
      <div className="bt-eyebrow">{isPaid ? 'Paiement confirmé par Stripe' : 'Retour de paiement'}</div>
      <h1 data-testid="text-checkout-return-title">{statusQuery.isLoading ? 'Vérification en cours.' : title}</h1>
      {statusQuery.isLoading && <div className="bt-skeleton" style={{ height: 48, maxWidth: 400, marginTop: 18 }} data-testid="loading-checkout-status" />}
      {statusQuery.error && <div className="bt-query-error" role="alert" data-testid="error-checkout-status">
        Le statut Stripe n’a pas pu être vérifié. Aucun paiement n’est considéré comme confirmé.
        <button className="bt-retry" onClick={() => void statusQuery.refetch()} data-testid="button-retry-checkout-status">Réessayer</button>
      </div>}
      {!statusQuery.isLoading && !statusQuery.error && <>
        <p className="bt-status-copy" data-testid="text-checkout-return-detail">{detail}</p>
        <span className="bt-status-tag" data-testid="text-checkout-status">{status ?? 'en attente de vérification'}</span>
        <p><Link href="/boutique" className="bt-status-button" data-testid="link-return-to-boutique">Retourner à la boutique</Link></p>
      </>}
      {statusQuery.isLoading && <p className="bt-status-copy">Nous interrogeons le statut réel de la session, pas seulement l’adresse de retour.</p>}
      <div className="bt-return-foot">INDAMORA PLAY · Stripe TEST uniquement · aucun paiement réel</div>
    </div>
  </section>;
}

export function BoutiquePage() {
  const shopQuery = useGetShopCatalog();
  const storeQuery = useGetStoreCatalog(); // Stripe TEST readiness only
  const checkout = useCreateStoreCheckout();
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [country, setCountry] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [cartUpdating, setCartUpdating] = useState(false);
  const [cartUpdateError, setCartUpdateError] = useState('');
  const cartUpdateLock = useRef(false);
  const [quote, setQuote] = useState<{ state: 'idle' | 'pending' | 'error' | 'ok'; data?: ShopQuote; key?: string; message?: string }>({ state: 'idle' });
  const quoteSeq = useRef(0);
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id') ?? '';
  const canceled = params.get('checkout') === 'cancelled';
  const products = useMemo(() => shopQuery.data?.products ?? [], [shopQuery.data?.products]);

  // Migrate older sku/color lines once the dynamic catalog is known; unresolved lines are never dropped.
  useEffect(() => {
    if (!products.length) return;
    setCart((current) => {
      if (!current.some((l) => !l.productId)) return current;
      const merged: CartLine[] = [];
      for (const line of current.map((l) => resolveLegacy(l, products))) {
        const same = line.productId ? merged.find((m) => m.productId === line.productId && m.variantId === line.variantId) : undefined;
        if (same) same.quantity = Math.min(20, same.quantity + line.quantity); else merged.push({ ...line });
      }
      return merged;
    });
  }, [products]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* Storage can be disabled. */ }
  }, [cart]);

  const findLine = (line: CartLine) => {
    const product = products.find((p) => p.id === line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    return { product, variant };
  };
  const quotable = useMemo(() => cart.filter((l) => {
    const { product, variant } = findLine(l);
    return product && variant?.available;
  }).map((l) => ({ productId: l.productId as string, variantId: l.variantId as string, quantity: l.quantity })),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [cart, products]);
  const quoteKey = `${country}|${JSON.stringify(quotable)}`;

  useEffect(() => {
    if (!country || !quotable.length) { quoteSeq.current += 1; setQuote({ state: 'idle' }); return; }
    const seq = ++quoteSeq.current;
    setQuote((q) => ({ ...q, state: 'pending' }));
    const timer = window.setTimeout(() => {
      createShopQuote({ items: quotable, shippingCountry: country })
        .then((data) => { if (seq === quoteSeq.current) setQuote({ state: 'ok', data, key: quoteKey }); })
        .catch((err: { data?: { error?: unknown } }) => { if (seq === quoteSeq.current) setQuote({ state: 'error', message: typeof err?.data?.error === 'string' ? err.data.error : undefined }); });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const isFrance = country === 'FR';
  const isEU = Boolean(country && country in EU_COUNTRIES);
  const isWorld = Boolean(country && !isFrance && !isEU);
  const q = quote.state === 'ok' && quote.key === quoteKey ? quote.data : undefined;
  const quotePending = Boolean(country && quotable.length) && !q && quote.state !== 'error';
  const hasUnavailable = cart.some((l) => { const { product, variant } = findLine(l); return !product || !variant?.available; });
  const catalogReady = Boolean(storeQuery.data?.checkoutAvailable);
  const legacyPrices = new Map((storeQuery.data?.products ?? []).map((p) => [p.sku as string, p.priceCents as number]));
  // Dynamic Shop identifiers and server-authoritative Stripe prices.
  const legacyItems = useMemo(() => {
    if (!q || !products.length) return null;
    const items: Array<{ sku: StoreSku; quantity: number; variantId: string }> = [];
    for (const l of cart) {
      const sku = l.productId;
      const { variant } = findLine(l);
      if (!sku || !variant) return null;
      const ql = q.lines.find((x) => x.productId === l.productId && x.variantId === l.variantId);
      if (!ql || legacyPrices.get(sku) !== ql.priceCents) return null;
      items.push({ sku, quantity: l.quantity, variantId: variant.id });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, cart, products, storeQuery.data]);
  const canCheckout = Boolean(cart.length && country && !isWorld && q && !q.contactRequired && q.totalCents !== null && !hasUnavailable && catalogReady && legacyItems && legacyItems.length && !checkout.isPending && !cartUpdating);
  const returnToCheckout = Boolean(sessionId);

  const sameLine = (l: CartLine, productId: string, variantId: string) => l.productId === productId && l.variantId === variantId;
  async function validateCartUpdate(next: CartLine[]) {
    if (cartUpdateLock.current) return;
    cartUpdateLock.current = true;
    setCartUpdating(true);
    setCartUpdateError('');
    try {
      const items = next.filter(line => {
        const { product, variant } = findLine(line);
        return product && variant?.available;
      }).map(line => ({ productId: line.productId!, variantId: line.variantId!, quantity: line.quantity }));
      // Validate stock before committing/persisting the proposed quantities.
      // Unknown legacy/unavailable lines are retained, never silently deleted.
      if (items.length) await createShopQuote({ items, shippingCountry: country || 'FR' });
      setCart(next);
    } catch (error) {
      const data = (error as { data?: { error?: unknown } })?.data;
      setCartUpdateError(typeof data?.error === 'string' ? data.error : 'Modification du panier refusée : le stock n’a pas pu être vérifié.');
    } finally {
      cartUpdateLock.current = false;
      setCartUpdating(false);
    }
  }
  function addVariant(productId: string, variantId: string) {
    if (cartUpdateLock.current) return;
    void validateCartUpdate(cart.some((l) => sameLine(l, productId, variantId))
      ? cart.map((l) => sameLine(l, productId, variantId) ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l)
      : [...cart, { productId, variantId, quantity: 1 }]);
  }
  function changeQuantity(line: CartLine, adjustment: number) {
    if (cartUpdateLock.current) return;
    void validateCartUpdate(cart.map((l) => l === line ? { ...l, quantity: Math.max(1, Math.min(20, l.quantity + adjustment)) } : l));
  }
  function removeLine(line: CartLine) {
    if (cartUpdateLock.current) return;
    setCartUpdateError('');
    setCart((current) => current.filter((l) => l !== line));
  }

  function startCheckout() {
    setCheckoutError('');
    if (!canCheckout || !legacyItems) return;
    checkout.mutate({ data: { items: legacyItems, shippingCountry: country } }, {
      onSuccess: (result) => {
        const checkoutUrl = new URL(result.url);
        if (result.mode !== 'test' || !result.sessionId.startsWith('cs_test_') || checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.stripe.com') {
          setCheckoutError('Le lien de paiement TEST sécurisé n’a pas pu être validé. Veuillez réessayer plus tard.');
          return;
        }
        window.location.assign(result.url);
      },
      onError: () => setCheckoutError('Le paiement TEST est temporairement indisponible. Votre panier est conservé. Réessayez dans un instant.'),
    });
  }

  const selectedCountryName = country === 'FR' ? 'France' : EU_COUNTRIES[country] ?? OTHER_COUNTRIES.find(([code]) => code === country)?.[1];
  const inCartFor = (productId: string) => (variantId: string) => cart.find((l) => sameLine(l, productId, variantId))?.quantity ?? 0;

  return <main className="boutique" data-testid="page-boutique">
    <header className="bt-masthead bt-shell">
      <Link href="/boutique" className="bt-brand" aria-label="INDAMORA PLAY Boutique" data-testid="link-boutique-logo">
        <img src={OFFICIAL_LOGO_URL} alt="INDAMORA PLAY — Notre musique. Notre culture. Notre scène." data-testid="img-official-logo" />
      </Link>
      <a className="bt-cart-jump" href="#panier" aria-label={`Panier, ${cartCount} article${cartCount === 1 ? '' : 's'}`} data-testid="link-open-cart">
        Panier <span className="bt-count" data-testid="text-cart-count">{cartCount}</span>
      </a>
    </header>

    {returnToCheckout ? <ReturnState sessionId={sessionId} /> : <>
      {canceled && <div className="bt-shell bt-canceled" role="status" data-testid="status-checkout-canceled">Le paiement n’a pas été finalisé. Votre panier est conservé.</div>}
      <section className="bt-shell bt-title-row" data-testid="section-boutique-hero">
        <h1>INDAMORA PLAY — SHOP</h1>
        <div className="bt-preview-banner" role="status" data-testid="status-preview-only">
          <strong>Preview TEST · aucune commande réelle</strong>
          <span>{storeQuery.data?.message ?? 'Photos fournies · validation requise avant publication.'}</span>
        </div>
      </section>

      <section className="bt-shell bt-section" id="produits" data-testid="section-products">
        {shopQuery.isLoading && <ProductSkeletons />}
        {shopQuery.error && <div className="bt-query-error" role="alert" data-testid="error-store-catalog">
          La boutique n’a pas pu charger son catalogue.
          <button className="bt-retry" onClick={() => void shopQuery.refetch()} data-testid="button-retry-store-catalog">Réessayer</button>
        </div>}
        {!shopQuery.isLoading && !shopQuery.error && <>
          {products.length === 0 ? <div className="bt-cart-empty" data-testid="empty-catalog"><div><i className="bt-cart-empty-mark" />Le catalogue se prépare. Revenez très bientôt.</div></div> :
            <div className="bt-product-grid">
              {products.map((product) => <ProductCard key={product.id} product={product} inCart={inCartFor(product.id)} onAdd={(variantId) => addVariant(product.id, variantId)} cartUpdating={cartUpdating} />)}
            </div>}
          <div className="bt-shipping-band" data-testid="section-shipping-rates">
            <div className="bt-ship-cell"><div className="bt-ship-place">France</div><div className="bt-ship-price">Livraison gratuite</div><div className="bt-ship-detail">Délai indicatif : 3 à 4 jours</div></div>
            <div className="bt-ship-cell"><div className="bt-ship-place">Union européenne</div><div className="bt-ship-price">7 €</div><div className="bt-ship-detail">Frais de livraison par commande<br />Délai indicatif : 3 à 4 jours</div></div>
            <div className="bt-ship-cell"><div className="bt-ship-place">Europe hors UE &amp; reste du monde</div><div className="bt-ship-price">Nous contacter</div><div className="bt-ship-detail">Contactez-nous avant de commander.</div><div className="bt-contact-links"><a href="https://wa.me/33780118869" target="_blank" rel="noreferrer">WhatsApp : +33 7 80 11 88 69</a><a href="mailto:indamorarecords@gmail.com">indamorarecords@gmail.com</a></div></div>
          </div>
        </>}
        {storeQuery.data?.message && <p className="bt-country-note" role="status" data-testid="text-catalog-message">{storeQuery.data.message}</p>}
      </section>

      <section className="bt-story" data-testid="section-editorial">
        <details className="bt-shell bt-story-inner">
          <summary data-testid="button-toggle-editorial"><span className="bt-eyebrow">Notre démarche</span><span className="bt-story-title">PLUS QU’UNE BOUTIQUE : UN GESTE POUR NOS TALENTS</span></summary>
          <div className="bt-story-layout">
            <div className="bt-story-copy">
              <p>INDAMORA PLAY est un projet porté par INDAMORA RECORDS, une association engagée dans la promotion, la diffusion et l’accompagnement de projets musicaux et artistiques, avec une attention particulière portée aux artistes émergents et indépendants.</p>
              <p>À travers INDAMORA PLAY, notre ambition est de créer un espace où les talents peuvent être découverts, écoutés, mis en lumière et valorisés, en donnant une place aux artistes et créateurs issus d’Afrique, de la diaspora et de différents horizons.</p>
              <p>Parce que derrière chaque artiste, chaque créateur et chaque projet, il y a du travail, une histoire, une identité et souvent un rêve qui mérite d’avoir une chance.</p>
              <h3>🛍️ ACHETER INDAMORA PLAY, C’EST AUSSI SOUTENIR CET ÉCOSYSTÈME</h3>
              <p>Les produits proposés sur cette boutique sont pensés comme des produits de soutien et d’appartenance à l’univers INDAMORA PLAY.</p>
              <p>Chaque achat contribue au développement de l’écosystème INDAMORA, notamment à la création de contenus, à la visibilité des artistes et créateurs, ainsi qu’au développement des projets culturels et artistiques portés par INDAMORA RECORDS.</p>
              <p>Notre objectif est simple : faire circuler les talents, les histoires et les cultures au-delà des frontières.</p>
              <p>🌍 De l’Afrique à la diaspora.<br />De l’Europe aux États-Unis.<br />Et partout où les talents veulent être entendus.</p>
              <h3>💛 VOTRE ACHAT A DU SENS</h3>
              <p>Vous n’achetez pas seulement un T-shirt, un bob, un tote bag ou un sweat à capuche.</p>
              <p>Vous choisissez de porter une identité.</p>
              <p>Vous choisissez de soutenir une initiative indépendante.</p>
              <p>Vous choisissez de contribuer, à votre manière, à un écosystème qui veut donner davantage de visibilité aux talents émergents.</p>
              <p>INDAMORA PLAY — La voix de nos talents.</p>
            </div>
            <aside className="bt-story-stamp" data-testid="card-editorial-manifesto">
               <img src={OFFICIAL_LOGO_URL} alt="Logo officiel INDAMORA PLAY" />
              <div className="bt-stamp-line" />
              <p className="bt-stamp-quote">« Notre musique. Notre culture. Notre scène. »</p>
              <div className="bt-stamp-credit">INDAMORA PLAY × INDAMORA RECORDS</div>
              <div className="bt-official-qr">
                <img src={OFFICIAL_PREVIEW_QR} alt="QR officiel vers https://indamoraplay.com" width="132" height="132" />
                <span>QR officiel · indamoraplay.com</span>
              </div>
            </aside>
            <div className="bt-story-copy">
              <h3>💶 UN PRIX SIMPLE ET ACCESSIBLE</h3>
              <p>Le T-shirt, le bob, le tote bag et le sweat à capuche sont proposés à 15 € chacun.</p>
              <p>Pas de prix compliqué.<br />Pas de formule obligatoire.</p>
              <p>Un produit → un prix clair.</p>
              <p>L’idée est de permettre au plus grand nombre de participer et de soutenir le projet tout en portant l’univers INDAMORA PLAY au quotidien.</p>
              <h3>🌍 ENSEMBLE, DONNONS UNE VOIX AUX TALENTS DE DEMAIN</h3>
              <p>Chaque artiste mérite une chance d’être entendu.</p>
              <p>Chaque créateur mérite d’être découvert.</p>
              <p>Chaque culture mérite d’être valorisée.</p>
              <p>INDAMORA PLAY est notre façon de contribuer à cette visibilité, en créant des passerelles entre l’Afrique, la diaspora et le reste du monde.</p>
              <p>Merci à toutes celles et ceux qui portent le projet, le partagent, l’écoutent, le soutiennent et croient aux talents.</p>
              <p>INDAMORA PLAY × INDAMORA RECORDS<br />La voix de nos talents.</p>
            </div>
          </div>
        </details>
      </section>


      <section className="bt-shell bt-order-area" id="panier" data-testid="section-cart">
        <div>
          <div className="bt-eyebrow">Prendre part au mouvement</div>
          <h2 className="bt-order-title">Votre soutien<br />commence ici.</h2>
          <p className="bt-order-desc">Choisissez votre pays pour voir les frais exacts. Pour les destinations hors France et Union européenne, contactez-nous avant de commander afin de connaître les modalités de livraison.</p>
          <div className="bt-test-note" data-testid="notice-stripe-test">
            <span aria-hidden="true">!</span>
            <span><strong>Stripe TEST uniquement.</strong> Aucun paiement réel ne sera effectué. Le règlement est traité sur la page sécurisée hébergée par Stripe ; aucune donnée de carte n’est saisie ni conservée ici.</span>
          </div>
        </div>
        <aside className="bt-cart-panel" aria-label="Récapitulatif du panier" aria-busy={cartUpdating}>
          {cartUpdateError && <div className="bt-query-error" role="alert" data-testid="error-cart-update">{cartUpdateError}</div>}
          {cartUpdating && <p role="status">Vérification du stock…</p>}
          <div className="bt-cart-heading"><h3>Votre panier</h3><span className="bt-cart-count" data-testid="text-cart-items-count">{cartCount} article{cartCount === 1 ? '' : 's'}</span></div>
          {!cart.length && <div className="bt-cart-empty" data-testid="empty-cart"><div><i className="bt-cart-empty-mark" />Votre panier attend sa première pièce.</div></div>}
          {Boolean(cart.length) && <div className="bt-cart-items">
            {cart.map((line) => {
              const key = lineId(line);
              const { product, variant } = findLine(line);
              const ql = q?.lines.find((x) => x.productId === line.productId && x.variantId === line.variantId);
              const name = product?.name ?? (line.sku ? `Article ${line.sku}` : 'Article');
              const detail = variant ? variantLabel(variant) : line.color ?? '';
              const unavailable = shopQuery.isSuccess && (!product || !variant || !variant.available);
              const label = `${name} ${detail}`.trim();
              return <div className="bt-cart-row" key={key} data-testid={`row-cart-${key}`}>
                <div>
                  <div className="bt-cart-row-name">{name}</div>
                  {detail && <div className="bt-cart-row-color" data-testid={`text-cart-color-${key}`}>{detail}</div>}
                  {unavailable && <div className="bt-cart-row-color" role="status">Indisponible · à retirer ou à remplacer</div>}
                  {product && !unavailable && <div className="bt-cart-row-price">{formatEUR((ql?.amountCents) ?? product.priceCents * line.quantity)}</div>}
                  <button className="bt-remove" onClick={() => removeLine(line)} disabled={cartUpdating} data-testid={`button-remove-${key}`}>Supprimer</button>
                </div>
                <div className="bt-cart-row-controls" aria-label={`Quantité de ${label}`}>
                  <button className="bt-quantity" onClick={() => changeQuantity(line, -1)} disabled={cartUpdating || line.quantity <= 1} aria-label={`Réduire la quantité de ${label}`} data-testid={`button-decrease-${key}`}>−</button>
                  <span className="bt-qty-number" data-testid={`text-quantity-${key}`}>{line.quantity}</span>
                  <button className="bt-quantity" onClick={() => changeQuantity(line, 1)} disabled={cartUpdating || !variant?.available || line.quantity >= 20} aria-label={`Augmenter la quantité de ${label}`} data-testid={`button-increase-${key}`}>+</button>
                </div>
              </div>;
            })}
          </div>}
          <div className="bt-country">
            <label htmlFor="bt-country-select">Pays de livraison · obligatoire</label>
            <select id="bt-country-select" value={country} onChange={(event) => setCountry(event.target.value)} required aria-required="true" data-testid="select-shipping-country">
              <option value="">Choisir un pays</option>
              <option value="FR">France</option>
              <optgroup label="Union européenne">{Object.entries(EU_COUNTRIES).sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([code, name]) => <option value={code} key={code}>{name}</option>)}</optgroup>
              <optgroup label="Reste du monde">{OTHER_COUNTRIES.filter(([code]) => code !== 'FR' && !(code in EU_COUNTRIES)).sort((a, b) => a[1].localeCompare(b[1], 'fr')).map(([code, name]) => <option value={code} key={code}>{name}</option>)}</optgroup>
            </select>
            {!country && <p className="bt-country-note" data-testid="text-country-required">Sélectionnez votre pays pour calculer la livraison.</p>}
            {country && isFrance && <p className="bt-country-note" data-testid="text-shipping-country-message">Livraison gratuite en France. Délai indicatif : 3 à 4 jours.</p>}
            {country && isEU && <p className="bt-country-note" data-testid="text-shipping-country-message">Livraison en Union européenne : 7 €.</p>}
            {country && isWorld && <div className="bt-country-note" data-testid="text-shipping-country-message">
              Pour {selectedCountryName}, contactez-nous avant de commander afin de connaître les modalités et frais de livraison.
              <div className="bt-contact-links">
                <a href="https://wa.me/33780118869" target="_blank" rel="noreferrer" data-testid="link-contact-whatsapp">WhatsApp : +33 7 80 11 88 69</a>
                <a href="mailto:indamorarecords@gmail.com" data-testid="link-contact-email">indamorarecords@gmail.com</a>
              </div>
            </div>}
          </div>
          <div className="bt-totals" aria-live="polite">
            <div className="bt-total-line"><span>Sous-total</span><strong data-testid="text-cart-subtotal">{q ? formatEUR(q.subtotalCents) : quotePending ? 'Calcul…' : '—'}</strong></div>
            <div className="bt-total-line"><span>Livraison{country ? ` · ${selectedCountryName}` : ''}</span><strong data-testid="text-cart-shipping">{isWorld || q?.contactRequired ? 'À confirmer' : q?.shippingCents != null ? formatEUR(q.shippingCents) : quotePending ? 'Calcul…' : '—'}</strong></div>
            <div className="bt-total-line final"><span>Total</span><strong data-testid="text-cart-total">{isWorld || q?.contactRequired ? 'À confirmer' : q?.totalCents != null ? formatEUR(q.totalCents) : quotePending ? 'Calcul…' : '—'}</strong></div>
          </div>
          {quote.state === 'error' && <p className="bt-checkout-error" role="alert" data-testid="error-quote">{quote.message ?? 'Le total n’a pas pu être calculé.'} <button className="bt-retry" onClick={() => setQuote({ state: 'idle' })} type="button">Réessayer</button></p>}
          {hasUnavailable && <p className="bt-checkout-error" data-testid="text-cart-unavailable">Un article de votre panier n’est plus disponible. Retirez-le pour continuer.</p>}
          {Boolean(q && cart.length && !legacyItems && !q.contactRequired && !hasUnavailable) && <p className="bt-country-note" data-testid="text-checkout-legacy">Le paiement TEST n’est pas encore activé pour ces articles.</p>}
          <button className="bt-checkout" onClick={startCheckout} disabled={!canCheckout} data-testid="button-checkout">
            <span>{checkout.isPending ? 'Préparation du paiement…' : isWorld ? 'Contactez-nous pour commander' : 'Payer en mode TEST'}</span>
          </button>
          {!catalogReady && !storeQuery.isLoading && !storeQuery.error && <p className="bt-checkout-error" data-testid="text-checkout-unavailable">{storeQuery.data?.message ?? 'Le paiement TEST est momentanément indisponible.'}</p>}
          {checkoutError && <p className="bt-checkout-error" role="alert" data-testid="error-checkout">{checkoutError}</p>}
        </aside>
      </section>
    </>}
    <footer className="bt-footer">
      <div className="bt-shell bt-footer-inner"><span>INDAMORA PLAY × INDAMORA RECORDS</span><span>La voix de nos talents.</span><span>Stripe TEST · aucun paiement réel</span></div>
    </footer>
  </main>;
}

export default BoutiquePage;
