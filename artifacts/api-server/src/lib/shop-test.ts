import { randomUUID } from "node:crypto";
import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { CreateShopProductBody, CreateShopProductResponse, GetShopAdminResponse, CreateShopQuoteBody } from "@workspace/api-zod";

// Project files survive development workflow restarts. Never use /tmp or dist.
// .env.* blocks Vite. An unregistered .store extension ALSO prevents Metro
// from bundling these private files: .env.*.json is NOT safe in a monorepo.
function workspaceRoot() {
  let directory = process.cwd();
  while (!existsSync(path.join(directory, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error("Workspace root not found; Shop storage remains unavailable.");
    directory = parent;
  }
  return directory;
}
// Importing the API in production must not inspect or initialize TEST storage.
export const SHOP_TEST_DIR = process.env.NODE_ENV === "development" ? path.join(workspaceRoot(), ".local/shop-test") : "";
const DEFAULT_FILE = path.join(SHOP_TEST_DIR, ".env.shop-state.store");
type Product = ReturnType<typeof CreateShopProductResponse.parse>;
type Reservation = { id: string; status: "pending" | "paid" | "released"; expiresAt: string; sessionId?: string; items: CartItem[] };
type State = { version: 1; products: Product[]; history: ReturnType<typeof GetShopAdminResponse.parse>["history"]; reservations: Reservation[] };
function validateState(input: unknown): State {
  if (!input || typeof input !== "object") throw new Error("Invalid state");
  const value = input as State;
  const partial = GetShopAdminResponse.pick({ products: true, history: true }).parse(value);
  if (value.version !== 1 || !Array.isArray(value.reservations)) throw new Error("Invalid state");
  const reservations = value.reservations.map(r => {
    if (!r || typeof r.id !== "string" || !["pending", "paid", "released"].includes(r.status) ||
      !Number.isFinite(Date.parse(r.expiresAt)) || (r.sessionId !== undefined && !/^cs_test_/.test(r.sessionId))) throw new Error("Invalid reservation");
    return { ...r, items: CreateShopQuoteBody.shape.items.parse(r.items) };
  });
  return { ...partial, version: 1, reservations };
}

const originals = {
  tshirtRose: "IMG_3390_1791538149840.jpeg",
  tshirtNoir: "AEEDAA04-AFB7-4383-AC87-C143F64FAD76_1791538149840.png",
  tshirtBlanc: "389CB62C-81B4-4AA9-B231-E66F73DDA2EF_1791538149840.jpeg",
  tshirtBlanc2: "IMG_3392_1791538149840.jpeg",
  bob: "IMG_3389_1791538149840.jpeg",
  bobNoir: "IMG_3391_1791538149840.jpeg",
  tote: "IMG_3395_1791538149840.jpeg",
  hoodie: "IMG_3387_1791538149840.jpeg",
  hoodie2: "IMG_3388_1791538149840.jpeg",
} as const;
export const SHOP_ORIGINALS = Object.values(originals);
const image = (filename: string, crop?: { x: number; y: number; w: number; h: number; ratio: number }) =>
  ({ reference: `original:${filename}`, ...(crop ? { crop } : {}) });
const variant = (id: string, color: string, photo: ReturnType<typeof image>) =>
  ({ id, color, size: "Taille unique", stock: null, photos: [photo] });

export function initialShopState(): State {
  const products: Product[] = [
    { id: "tshirt", name: "T-shirt INDAMORA PLAY", description: "", category: "T-shirts", priceCents: 1500, status: "active", visible: true, shippingInfo: "", variants: [
      variant("rose", "Rose", image(originals.tshirtRose)),
      variant("noir", "Noir", image(originals.tshirtNoir, { x: 0, y: .02, w: .5, h: .64, ratio: .5 / .64 })),
      { ...variant("blanc", "Blanc", image(originals.tshirtBlanc)), photos: [image(originals.tshirtBlanc), image(originals.tshirtBlanc2)] },
    ], revision: 0, updatedAt: "" },
    { id: "bob", name: "Bob INDAMORA PLAY", description: "", category: "Bobs", priceCents: 1500, status: "active", visible: true, shippingInfo: "", variants: [
      variant("blanc", "Blanc", image(originals.bob, { x: .47, y: 0, w: .53, h: 1, ratio: .53 * 748 / 383 })),
      variant("noir", "Noir", image(originals.bobNoir)),
      variant("orange", "Orange", image(originals.bob, { x: 0, y: 0, w: .47, h: 1, ratio: .47 * 748 / 383 })),
    ], revision: 0, updatedAt: "" },
    { id: "tote-bag", name: "Tote bag INDAMORA PLAY", description: "", category: "Tote bags", priceCents: 1500, status: "active", visible: true, shippingInfo: "", variants: [
      variant("unique", "", image(originals.tote)),
    ], revision: 0, updatedAt: "" },
    { id: "hoodie", name: "Sweat à capuche INDAMORA PLAY", description: "", category: "Sweats", priceCents: 2500, status: "active", visible: true, shippingInfo: "", variants: [
      { ...variant("unique", "", image(originals.hoodie)), photos: [image(originals.hoodie), image(originals.hoodie2)] },
    ], revision: 0, updatedAt: "" },
  ];
  return { version: 1, products, history: [], reservations: [] };
}

export class ShopError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function validateProduct(input: unknown): ReturnType<typeof CreateShopProductBody.parse> {
  const parsed = CreateShopProductBody.strict().safeParse(input);
  if (!parsed.success) throw new ShopError("Produit invalide : vérifiez les champs obligatoires, prix, photos et stocks.");
  const product = parsed.data;
  if (product.name.trim().length < 2 || !product.category.trim()) throw new ShopError("Nom et catégorie obligatoires.");
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const item of product.variants) {
    if (!item.size.trim()) throw new ShopError("Taille obligatoire.");
    const key = `${item.color.trim().toLocaleLowerCase("fr")}:${item.size.trim().toLocaleLowerCase("fr")}`;
    if (keys.has(item.id) || labels.has(key)) throw new ShopError("Les variantes doivent être distinctes.");
    keys.add(item.id); labels.add(key);
    for (const photo of item.photos) {
      if (photo.reference.startsWith("original:")) {
        if (!SHOP_ORIGINALS.includes(photo.reference.slice(9) as typeof SHOP_ORIGINALS[number])) throw new ShopError("Photo originale inconnue.");
      } else if (!/^upload:[a-f0-9-]{36}\.(png|jpeg|webp)$/.test(photo.reference)) throw new ShopError("Référence photo invalide.");
      if (photo.crop && (photo.crop.x + photo.crop.w > 1.000001 || photo.crop.y + photo.crop.h > 1.000001)) throw new ShopError("Recadrage invalide.");
    }
  }
  return product;
}

export class ShopTestRepository {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(public readonly filename = DEFAULT_FILE) {}
  private assertDevelopment() {
    if (process.env.NODE_ENV !== "development") throw new ShopError("Shop TEST indisponible.", 404);
  }
  async read(): Promise<State> {
    this.assertDevelopment();
    await this.queue;
    return this.readUnlocked();
  }
  private async readUnlocked(): Promise<State> {
    let content: string;
    try { content = await fs.readFile(this.filename, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return initialShopState();
      throw error;
    }
    // Never overwrite corrupt state or silently replace it with the seed.
    try {
      const state = validateState(JSON.parse(content));
      for (const { id: _id, revision: _rev, updatedAt: _date, ...input } of state.products) validateProduct(input);
      return state;
    } catch { throw new ShopError("Stockage Shop invalide. Écriture bloquée ; restauration administrateur nécessaire.", 503); }
  }
  private async writeUnlocked(state: State) {
    validateState(state);
    await fs.mkdir(path.dirname(this.filename), { recursive: true, mode: 0o700 });
    await fs.chmod(path.dirname(this.filename), 0o700);
    const temp = `${this.filename}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(temp, "wx", 0o600);
      await handle.writeFile(JSON.stringify(state, null, 2));
      await handle.sync(); await handle.close(); handle = undefined;
      try { await fs.copyFile(this.filename, `${this.filename}.backup`); await fs.chmod(`${this.filename}.backup`, 0o600); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await fs.rename(temp, this.filename);
      const dir = await fs.open(path.dirname(this.filename), "r");
      try { await dir.sync(); } finally { await dir.close(); }
    } finally {
      if (handle) await handle.close();
      await fs.unlink(temp).catch(() => {});
    }
  }
  async mutate<T>(action: (state: State) => T): Promise<T> {
    this.assertDevelopment();
    const job = this.queue.then(async () => {
      const state = await this.readUnlocked();
      const result = action(state);
      await this.writeUnlocked(state);
      return result;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async save(input: unknown, id?: string, expectedRevision?: number): Promise<Product> {
    const value = validateProduct(input);
    return this.mutate(state => {
      const existing = id ? state.products.find(product => product.id === id) : undefined;
      if (id && !existing) throw new ShopError("Produit introuvable.", 404);
      if (existing && existing.revision !== expectedRevision) throw new ShopError("Le produit a changé. Rechargez avant d’enregistrer.", 409);
      if (existing) {
        const held = state.reservations.filter(r => r.status === "pending").flatMap(r => r.items).filter(item => item.productId === existing.id);
        for (const item of held) {
          const next = value.variants.find(v => v.id === item.variantId);
          const total = held.filter(v => v.variantId === item.variantId).reduce((sum,v) => sum + v.quantity, 0);
          if (!next || next.stock === null || next.stock < total) throw new ShopError("Une réservation TEST utilise cette variante. Stock ou suppression refusés.", 409);
        }
      }
      const product: Product = { ...value, id: id ?? `shop-${randomUUID()}`, revision: (existing?.revision ?? 0) + 1, updatedAt: new Date().toISOString() };
      if (existing) state.products[state.products.indexOf(existing)] = product;
      else state.products.push(product);
      const stockBefore = existing?.variants.map(v => `${v.id}=${v.stock ?? "?"}`).join(", ") ?? "—";
      const stockAfter = product.variants.map(v => `${v.id}=${v.stock ?? "?"}`).join(", ");
      state.history.unshift({ id: randomUUID(), productId: product.id, at: product.updatedAt, action: existing ? "Modification du produit" : "Création du produit", detail: `Stock : ${stockBefore} → ${stockAfter}` });
      return product;
    });
  }
  async reserve(id: string, items: CartItem[], country: string, expectedPrices: Map<string, number>) {
    return this.mutate(state => {
      const quote = quoteCart(state, items, country);
      for (const line of quote.lines) {
        if (expectedPrices.get(line.productId) !== line.priceCents) throw new ShopError("Le prix Stripe TEST ne correspond pas au catalogue géré. Checkout bloqué.", 503);
      }
      if (quote.contactRequired) throw new ShopError("Livraison à confirmer.");
      state.reservations.push({ id, status: "pending", expiresAt: new Date(Date.now() + 30 * 60000).toISOString(), items });
      return quote;
    });
  }
  async attachSession(id: string, sessionId: string) {
    await this.mutate(state => {
      const reservation = state.reservations.find(r => r.id === id && r.status === "pending");
      if (!reservation || !sessionId.startsWith("cs_test_")) throw new ShopError("Réservation TEST invalide.");
      reservation.sessionId = sessionId;
    });
  }
  async release(id: string) {
    // No writes when no matching reservation exists (old TEST sessions untouched).
    if (!(await this.read()).reservations.some(r => r.id === id && r.status === "pending")) return;
    await this.mutate(state => {
      const reservation = state.reservations.find(r => r.id === id && r.status === "pending");
      if (reservation) reservation.status = "released";
    });
  }
  async settleSession(sessionId: string, paid: boolean, expired: boolean) {
    if (!sessionId.startsWith("cs_test_") || (!paid && !expired)) return;
    if (!(await this.read()).reservations.some(r => r.sessionId === sessionId && r.status === "pending")) return;
    await this.mutate(state => {
      const reservation = state.reservations.find(r => r.sessionId === sessionId && r.status === "pending");
      if (!reservation) return;
      if (paid) for (const item of reservation.items) {
        const product = state.products.find(p => p.id === item.productId);
        const variant = product?.variants.find(v => v.id === item.variantId);
        if (!variant || variant.stock === null || variant.stock < item.quantity) throw new ShopError("Stock incohérent : règlement TEST à rapprocher manuellement.", 409);
        variant.stock -= item.quantity;
        product!.revision += 1; product!.updatedAt = new Date().toISOString();
        state.history.unshift({ id: randomUUID(), productId: item.productId, at: product!.updatedAt, action: "Paiement TEST confirmé", detail: `${item.variantId} : −${item.quantity}` });
      }
      reservation.status = paid ? "paid" : "released";
    });
  }
}

export const shopTest = new ShopTestRepository();
export const EU_SHOP_COUNTRIES = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE"]);
export type CartItem = { productId: string; variantId: string; quantity: number };
export function quoteCart(state: State, items: CartItem[], country: string) {
  const seen = new Set<string>();
  let subtotalCents = 0;
  const lines = items.map(item => {
    const key = `${item.productId}:${item.variantId}`;
    if (seen.has(key)) throw new ShopError("Variante dupliquée.");
    seen.add(key);
    const product = state.products.find(p => p.id === item.productId && p.status === "active" && p.visible);
    const variant = product?.variants.find(v => v.id === item.variantId);
    if (!product || !variant) throw new ShopError("Article indisponible.", 409);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw new ShopError("Quantité invalide.");
    const reserved = state.reservations.filter(r => r.status === "pending")
      .flatMap(r => r.items).filter(v => v.productId === item.productId && v.variantId === item.variantId).reduce((sum, v) => sum + v.quantity, 0);
    const available = variant.stock === null ? 0 : variant.stock - reserved;
    if (available < item.quantity) throw new ShopError(variant.stock === null ? "Stock à renseigner par l’administrateur." : "Stock insuffisant pour cette variante.", 409);
    const amountCents = product.priceCents * item.quantity;
    subtotalCents += amountCents;
    return { ...item, name: product.name, color: variant.color, size: variant.size, priceCents: product.priceCents, amountCents };
  });
  const shippingCents = country === "FR" ? 0 : EU_SHOP_COUNTRIES.has(country) ? 700 : null;
  return { lines, subtotalCents, shippingCents, totalCents: shippingCents === null ? null : subtotalCents + shippingCents, contactRequired: shippingCents === null };
}
