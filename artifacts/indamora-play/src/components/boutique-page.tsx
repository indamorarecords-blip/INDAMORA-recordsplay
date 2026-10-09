import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  getGetStoreCheckoutStatusQueryKey,
  useCreateStoreCheckout,
  useGetStoreCatalog,
  useGetStoreCheckoutStatus,
} from '@workspace/api-client-react';
import type { StoreSku } from '@workspace/api-client-react';
import { COLOR_LABELS, COLOR_SWATCH, getProductPhotos, OFFICIAL_PREVIEW_QR, PRODUCT_COLORS } from './boutique-preview-media';
import type { ProductColor, ProductPhoto } from './boutique-preview-media';
import './boutique-page.css';

type ProductInfo = { sku: StoreSku; name: string; className: string; shortName: string; priceCents: number };
type CartLine = { sku: StoreSku; color?: ProductColor; quantity: number };

const STORE_PRODUCTS: ProductInfo[] = [
  { sku: 'tshirt', name: 'T-shirt INDAMORA PLAY', shortName: 'T-shirt', className: 'tshirt', priceCents: 1500 },
  { sku: 'bob', name: 'Bob INDAMORA PLAY', shortName: 'Bob', className: 'bob', priceCents: 1500 },
  { sku: 'tote-bag', name: 'Tote bag INDAMORA PLAY', shortName: 'Tote bag', className: 'tote', priceCents: 1500 },
  { sku: 'hoodie', name: 'Sweat à capuche INDAMORA PLAY', shortName: 'Sweat à capuche', className: 'hoodie', priceCents: 2500 },
];
const DEFAULT_COLOR: Partial<Record<StoreSku, ProductColor>> = { tshirt: 'rose', bob: 'noir' };

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


function readCart(): CartLine[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    const merged: CartLine[] = [];
    for (const raw of stored as Array<Partial<CartLine>>) {
      if (typeof raw !== 'object' || raw === null) continue;
      const product = STORE_PRODUCTS.find((p) => p.sku === raw.sku);
      if (!product || !Number.isInteger(raw.quantity) || (raw.quantity as number) <= 0) continue;
      const allowed = PRODUCT_COLORS[product.sku];
      let color: ProductColor | undefined;
      if (allowed) color = raw.color && allowed.includes(raw.color) ? raw.color : DEFAULT_COLOR[product.sku];
      const existing = merged.find((l) => l.sku === product.sku && l.color === color);
      const quantity = Math.min(raw.quantity as number, 20);
      if (existing) existing.quantity = Math.min(20, existing.quantity + quantity);
      else merged.push({ sku: product.sku, color, quantity });
    }
    return merged;
  } catch {
    return [];
  }
}

const lineKey = (sku: StoreSku, color?: ProductColor) => (color ? `${sku}-${color}` : sku);

function formatEUR(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function PhotoFrame({ image, alt, onError }: { image: ProductPhoto; alt: string; onError: () => void }) {
  const crop = image.crop;
  if (!crop) return <img className="bt-product-image" src={image.src} alt={alt} loading="lazy" decoding="async" onError={onError} />;
  // Display-only crop: same file, window sized to its true aspect ratio, no stretching.
  return <div className="bt-crop" style={{ aspectRatio: String(crop.ratio) }}>
    <img src={image.src} alt={alt} loading="lazy" decoding="async" onError={onError}
      style={{ width: `${100 / crop.w}%`, height: `${100 / crop.h}%`, left: `${-(crop.x / crop.w) * 100}%`, top: `${-(crop.y / crop.h) * 100}%` }} />
  </div>;
}

function ProductArt({ product, color, photoIndex, onPhotoChange }: {
  product: ProductInfo;
  color?: ProductColor;
  photoIndex: number;
  onPhotoChange: (index: number) => void;
}) {
  const photos = getProductPhotos(product.sku, color);
  const image = photos[photoIndex] ?? photos[0];
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]);
  const alt = `${image?.label ?? product.name} — photo fournie`;
  return <div data-testid={`visual-product-${product.sku}`}>
    <div className={`bt-product-art ${product.className}`}>
    {image && !failed ? <PhotoFrame image={image} alt={alt} onError={() => setFailed(true)} /> : <div className="bt-product-placeholder">
      <span>{product.name}</span>
      <small>L’image fournie n’a pas pu être chargée.</small>
    </div>}
    {image && !failed && <span data-testid={`img-product-${product.sku}`} hidden />}
    </div>
    <div className="bt-photo-controls">
      {photos.length > 1 && <>
        <button type="button" aria-label={`Photo précédente de ${product.shortName}`}
          onClick={() => onPhotoChange((photoIndex + photos.length - 1) % photos.length)}
          data-testid={`button-photo-prev-${product.sku}`}>‹</button>
        <span aria-live="polite">{photoIndex + 1}/{photos.length}</span>
        <button type="button" aria-label={`Photo suivante de ${product.shortName}`}
          onClick={() => onPhotoChange((photoIndex + 1) % photos.length)}
          data-testid={`button-photo-next-${product.sku}`}>›</button>
      </>}
      {image && <a href={image.original} target="_blank" rel="noreferrer" className="bt-photo-link"
        aria-label={`Voir la photo originale de ${product.shortName}`} data-testid={`link-photo-${product.sku}`}>Photo originale ↗</a>}
    </div>
  </div>;
}

function ProductSkeletons() {
  return <div className="bt-product-grid" aria-label="Chargement de la boutique" data-testid="loading-store-catalog">
    {STORE_PRODUCTS.map((product) => <div className="bt-product-skeleton bt-skeleton" key={product.sku} />)}
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
  const catalogQuery = useGetStoreCatalog();
  const checkout = useCreateStoreCheckout();
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [country, setCountry] = useState('');
  const [checkoutError, setCheckoutError] = useState('');
  const [colors, setColors] = useState<Partial<Record<StoreSku, ProductColor>>>(DEFAULT_COLOR);
  const [photoIndexes, setPhotoIndexes] = useState<Record<string, number>>({});
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id') ?? '';
  const canceled = params.get('checkout') === 'cancelled';

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* Storage can be disabled. */ }
  }, [cart]);

  const catalogProducts = useMemo(
    () => new Map((catalogQuery.data?.products ?? []).map((product) => [product.sku, product])),
    [catalogQuery.data?.products],
  );
  const priceOf = (sku: StoreSku): number => {
    const live = (catalogProducts.get(sku) as { priceCents?: number } | undefined)?.priceCents;
    return live ?? STORE_PRODUCTS.find((p) => p.sku === sku)!.priceCents;
  };
  const cartCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalCents = cart.reduce((sum, line) => sum + priceOf(line.sku) * line.quantity, 0);
  const isFrance = country === 'FR';
  const isEU = Boolean(country && country in EU_COUNTRIES);
  const isWorld = Boolean(country && !isFrance && !isEU);
  const shippingCents = isFrance ? 0 : isEU ? 700 : 0;
  const totalCents = subtotalCents + shippingCents;
  const catalogReady = Boolean(catalogQuery.data?.checkoutAvailable);
  const returnToCheckout = Boolean(sessionId);

  const same = (line: CartLine, sku: StoreSku, color?: ProductColor) => line.sku === sku && line.color === color;

  function addProduct(sku: StoreSku, color?: ProductColor) {
    setCart((current) => {
      if (current.some((line) => same(line, sku, color))) {
        return current.map((line) => same(line, sku, color) ? { ...line, quantity: Math.min(20, line.quantity + 1) } : line);
      }
      return [...current, { sku, color, quantity: 1 }];
    });
  }

  function changeQuantity(sku: StoreSku, color: ProductColor | undefined, adjustment: number) {
    setCart((current) => current.map((line) => same(line, sku, color)
      ? { ...line, quantity: Math.max(1, Math.min(20, line.quantity + adjustment)) }
      : line));
  }

  function removeProduct(sku: StoreSku, color?: ProductColor) {
    setCart((current) => current.filter((line) => !same(line, sku, color)));
  }

  function startCheckout() {
    setCheckoutError('');
    if (!cart.length || !country || isWorld || !catalogReady || !catalogProducts.size) return;
    checkout.mutate({
      data: {
        items: cart.map(({ sku, quantity, color }) => color ? { sku, quantity, color } : { sku, quantity }),
        shippingCountry: country,
      },
    }, {
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
          <span>{catalogQuery.data?.message ?? 'Photos fournies · validation requise avant publication.'}</span>
        </div>
      </section>

      <section className="bt-shell bt-section" id="produits" data-testid="section-products">
        {catalogQuery.isLoading && <ProductSkeletons />}
        {catalogQuery.error && <div className="bt-query-error" role="alert" data-testid="error-store-catalog">
          La boutique n’a pas pu charger son catalogue.
          <button className="bt-retry" onClick={() => void catalogQuery.refetch()} data-testid="button-retry-store-catalog">Réessayer</button>
        </div>}
        {!catalogQuery.isLoading && !catalogQuery.error && <>
          <div className="bt-product-grid">
            {STORE_PRODUCTS.map((product) => {
              const available = catalogProducts.has(product.sku);
              const options = PRODUCT_COLORS[product.sku];
              const color = options ? colors[product.sku] ?? options[0] : undefined;
              const quantity = cart.find((line) => same(line, product.sku, color))?.quantity ?? 0;
              const photoKey = lineKey(product.sku, color);
              return <article className="bt-product" key={product.sku} data-testid={`card-product-${product.sku}`}>
                <ProductArt product={product} color={color} photoIndex={photoIndexes[photoKey] ?? 0}
                  onPhotoChange={(nextIndex) => setPhotoIndexes((current) => ({ ...current, [photoKey]: nextIndex }))} />
                <div className="bt-product-body">
                  <h3 className="bt-product-title" data-testid={`text-product-name-${product.sku}`}>{product.name}</h3>
                  <div className="bt-product-type" data-testid={`text-product-size-${product.sku}`}>Taille unique</div>
                  {options && <div className="bt-swatches" role="radiogroup" aria-label={`Couleur du ${product.shortName.toLowerCase()}`}>
                    {options.map((option) => <button type="button" role="radio" aria-checked={option === color} key={option}
                      className={`bt-swatch${option === color ? ' active' : ''}`}
                      onClick={() => setColors((current) => ({ ...current, [product.sku]: option }))}
                      data-testid={`button-color-${product.sku}-${option}`}>
                      <i style={{ background: COLOR_SWATCH[option] }} />{COLOR_LABELS[option]}
                    </button>)}
                  </div>}
                  {color && <div className="bt-color-selected" data-testid={`text-color-${product.sku}`}>Couleur : {COLOR_LABELS[color]}</div>}
                  <div className="bt-product-bottom">
                    <strong className="bt-price" data-testid={`text-product-price-${product.sku}`}>{formatEUR(priceOf(product.sku)).replace(',00', '')}</strong>
                    <button className="bt-add" onClick={() => addProduct(product.sku, color)} disabled={!available || quantity >= 20} data-testid={`button-add-${product.sku}`}>
                      {quantity ? `Ajouter · ${quantity}` : 'Ajouter au panier'}
                    </button>
                  </div>
                  <div className="bt-availability" data-testid={`status-product-${product.sku}`}>{quantity ? `${quantity} dans le panier TEST` : 'Article du catalogue TEST'}</div>
                </div>
              </article>;
            })}
          </div>
          <div className="bt-shipping-band" data-testid="section-shipping-rates">
            <div className="bt-ship-cell"><div className="bt-ship-place">France</div><div className="bt-ship-price">Livraison gratuite</div><div className="bt-ship-detail">Délai indicatif : 3 à 4 jours</div></div>
            <div className="bt-ship-cell"><div className="bt-ship-place">Union européenne</div><div className="bt-ship-price">7 €</div><div className="bt-ship-detail">Frais de livraison par commande<br />Délai indicatif : 3 à 4 jours</div></div>
            <div className="bt-ship-cell"><div className="bt-ship-place">Europe hors UE &amp; reste du monde</div><div className="bt-ship-price">Nous contacter</div><div className="bt-ship-detail">Contactez-nous avant de commander.</div><div className="bt-contact-links"><a href="https://wa.me/33780118869" target="_blank" rel="noreferrer">WhatsApp : +33 7 80 11 88 69</a><a href="mailto:indamorarecords@gmail.com">indamorarecords@gmail.com</a></div></div>
          </div>
        </>}
        {catalogQuery.data?.message && <p className="bt-country-note" role="status" data-testid="text-catalog-message">{catalogQuery.data.message}</p>}
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
              <p>Le T-shirt, le bob et le tote bag sont proposés à 15 €, le sweat à capuche à 25 €.</p>
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
        <aside className="bt-cart-panel" aria-label="Récapitulatif du panier">
          <div className="bt-cart-heading"><h3>Votre panier</h3><span className="bt-cart-count" data-testid="text-cart-items-count">{cartCount} article{cartCount === 1 ? '' : 's'}</span></div>
          {!cart.length && <div className="bt-cart-empty" data-testid="empty-cart"><div><i className="bt-cart-empty-mark" />Votre panier attend sa première pièce.</div></div>}
          {Boolean(cart.length) && <div className="bt-cart-items">
            {cart.map((line) => {
              const product = STORE_PRODUCTS.find((item) => item.sku === line.sku)!;
              const key = lineKey(line.sku, line.color);
              const label = line.color ? `${product.shortName} ${COLOR_LABELS[line.color].toLowerCase()}` : product.shortName;
              return <div className="bt-cart-row" key={key} data-testid={`row-cart-${key}`}>
                <div>
                  <div className="bt-cart-row-name">{product.name}</div>
                  {line.color && <div className="bt-cart-row-color" data-testid={`text-cart-color-${key}`}>Couleur : {COLOR_LABELS[line.color]} · Taille unique</div>}
                  <div className="bt-cart-row-price">{formatEUR(priceOf(line.sku) * line.quantity)}</div>
                  <button className="bt-remove" onClick={() => removeProduct(line.sku, line.color)} data-testid={`button-remove-${key}`}>Supprimer</button>
                </div>
                <div className="bt-cart-row-controls" aria-label={`Quantité de ${label}`}>
                  <button className="bt-quantity" onClick={() => changeQuantity(line.sku, line.color, -1)} disabled={line.quantity <= 1} aria-label={`Réduire la quantité de ${label}`} data-testid={`button-decrease-${key}`}>−</button>
                  <span className="bt-qty-number" data-testid={`text-quantity-${key}`}>{line.quantity}</span>
                  <button className="bt-quantity" onClick={() => changeQuantity(line.sku, line.color, 1)} disabled={line.quantity >= 20} aria-label={`Augmenter la quantité de ${label}`} data-testid={`button-increase-${key}`}>+</button>
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
            <div className="bt-total-line"><span>Sous-total</span><strong data-testid="text-cart-subtotal">{formatEUR(subtotalCents)}</strong></div>
            <div className="bt-total-line"><span>Livraison{country ? ` · ${selectedCountryName}` : ''}</span><strong data-testid="text-cart-shipping">{isWorld ? 'À confirmer' : country ? formatEUR(shippingCents) : '—'}</strong></div>
            <div className="bt-total-line final"><span>Total</span><strong data-testid="text-cart-total">{isWorld ? 'À confirmer' : formatEUR(totalCents)}</strong></div>
          </div>
          <button className="bt-checkout" onClick={startCheckout} disabled={!cart.length || !country || isWorld || !catalogReady || checkout.isPending} data-testid="button-checkout">
            <span>{checkout.isPending ? 'Préparation du paiement…' : isWorld ? 'Contactez-nous avant commande' : 'Continuer vers le paiement'}<small>Vérification et paiement sur Stripe TEST</small></span><span aria-hidden="true">→</span>
          </button>
          {!catalogReady && !catalogQuery.isLoading && !catalogQuery.error && <p className="bt-checkout-error" data-testid="text-checkout-unavailable">{catalogQuery.data?.message ?? 'Le paiement TEST est momentanément indisponible.'}</p>}
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
