import express, { Router, type IRouter, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getAuth } from "@clerk/express";
import { requireAdmin } from "../middlewares/auth";
import { storeStripeApi } from "../storeStripeClient";
import { CreateShopQuoteBody, GetShopAdminResponse, GetShopCatalogResponse, CreateShopQuoteResponse, UploadShopPhotoBody, UpdateShopProductBody, GetShopOrdersResponse, RequestShopPhotoUploadBody, CompleteShopPhotoUploadBody, RequestShopPhotoUploadResponse } from "@workspace/api-zod";
import { SHOP_TEST_DIR, SHOP_ORIGINALS, ShopError, quoteCart, validateProduct } from "../lib/shop-test";
import { shop as shopTest, isPersistentShop, persistentShop } from "../lib/shop-repository";
import { requestPrivateShopPhoto, completePrivateShopPhoto } from "../lib/shop-object-media";
import { ObjectStorageService } from "../lib/objectStorage";
import { settleVerifiedShopSession } from "../lib/shop-session";
import { shopMode, shopRouteAccessEnabled, shopAllowedHosts } from "../lib/shop-runtime";

const router: IRouter = Router();
const guard: RequestHandler = (req, res, next) => {
  if (!shopRouteAccessEnabled(req.originalUrl)) { res.status(404).json({ error: "Shop indisponible." }); return; }
  const origin = req.get("origin");
  if (origin) {
    const allowedHosts = shopAllowedHosts();
    try {
      const url = new URL(origin);
      if (url.protocol !== "https:" || !allowedHosts.has(url.host.toLowerCase())) throw new Error();
    } catch { res.status(403).json({ error: "Origine non autorisée." }); return; }
  }
  if (req.get("sec-fetch-site") === "cross-site") { res.status(403).json({ error: "Accès intersite refusé." }); return; }
  res.set({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "X-Content-Type-Options": "nosniff" });
  next();
};
router.use("/shop", guard);
router.use("/shop/admin", requireAdmin);
function fail(res: express.Response, error: unknown) {
  res.status(error instanceof ShopError ? error.status : 503).json({
    error: error instanceof ShopError ? error.message : `Le stockage privé Shop ${shopMode().toUpperCase()} est indisponible. Aucune donnée n’a été remplacée.`,
  });
}
async function checkPhotoReferences(variants: { photos: { reference: string }[] }[]) {
  for (const variant of variants) for (const photo of variant.photos) {
    if (isPersistentShop()) { await persistentShop.objectPath(photo.reference); continue; }
    if (photo.reference.startsWith("upload:")) {
      const filename = uploadFilename(photo.reference);
      if (!filename) throw new ShopError("Photo inconnue.");
      try { if (!(await fs.stat(filename)).isFile()) throw new Error(); }
      catch { throw new ShopError("La photo envoyée est introuvable."); }
    }
  }
}
export function uploadFilename(reference: string) {
  const match = /^upload:([a-f0-9-]{36}\.(png|jpeg|webp))$/.exec(reference);
  return match ? path.join(SHOP_TEST_DIR, `.env.photo-${match[1]}.store`) : null;
}
export function validateImage(bytes: Buffer, contentType: string): string {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new ShopError("Photo vide ou supérieure à 5 Mo.");
  if (contentType === "image/png" && bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR" && bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND") {
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    if (w > 0 && h > 0 && w * h <= 25000000) return "png";
  }
  if (contentType === "image/jpeg" && bytes.length >= 32 && bytes[0] === 255 && bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 && bytes[bytes.length - 1] === 217) {
    // Verify segment lengths and an actual frame header, not just declared MIME.
    let offset = 2;
    while (offset + 4 <= bytes.length && bytes[offset] === 255) {
      const marker = bytes[offset + 1]!;
      if (marker === 0xda) break;
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2].includes(marker) && length >= 8) {
        const h = bytes.readUInt16BE(offset + 5), w = bytes.readUInt16BE(offset + 7);
        if (w > 0 && h > 0 && w * h <= 25000000) return "jpeg";
      }
      offset += 2 + length;
    }
  }
  if (contentType === "image/webp" && bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.readUInt32LE(4) + 8 === bytes.length && bytes.toString("ascii", 8, 12) === "WEBP" &&
    ["VP8 ", "VP8L", "VP8X"].includes(bytes.toString("ascii", 12, 16))) return "webp";
  throw new ShopError("Photo invalide. Seuls les vrais fichiers JPEG, PNG et WebP sont acceptés.");
}

router.get("/shop/admin", async (_req, res) => {
  try {
    const state = await shopTest.read();
    res.json(GetShopAdminResponse.parse({
      products: state.products, history: state.history.slice(0, 200),
      active: state.products.filter(p => p.status === "active" && p.visible).length,
      inactive: state.products.filter(p => p.status !== "active" || !p.visible).length,
      outOfStock: state.products.filter(p => p.variants.every(v => v.stock === 0)).length,
      lowStock: state.products.filter(p => p.variants.some(v => v.stock !== null && v.stock > 0 && v.stock <= 5)).length,
      unknownStock: state.products.filter(p => p.variants.some(v => v.stock === null)).length,
    }));
  } catch (error) { fail(res, error); }
});
router.post("/shop/admin/products", async (req, res) => {
  try {
    const product = validateProduct(req.body);
    await checkPhotoReferences(product.variants);
    res.json(await shopTest.save(product));
  } catch (error) { fail(res, error); }
});
router.put("/shop/admin/products/:id", async (req, res) => {
  try {
    const parsed = UpdateShopProductBody.safeParse(req.body);
    if (!parsed.success) throw new ShopError("Modification invalide.");
    const { revision, ...product } = parsed.data;
    await checkPhotoReferences(product.variants);
    res.json(await shopTest.save(product, String(req.params.id), revision));
  } catch (error) { fail(res, error); }
});
router.post("/shop/admin/photos", express.json({ limit: "7mb" }), async (req, res) => {
  try {
    if (isPersistentShop()) throw new ShopError("Utilisez le téléversement direct vers App Storage.", 409);
    const input = UploadShopPhotoBody.strict().safeParse(req.body);
    if (!input.success || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data.base64)) throw new ShopError("Envoi photo invalide.");
    const bytes = Buffer.from(input.data.base64, "base64");
    const ext = validateImage(bytes, input.data.contentType);
    const reference = `upload:${randomUUID()}.${ext}`;
    const filename = uploadFilename(reference)!;
    await fs.mkdir(SHOP_TEST_DIR, { recursive: true, mode: 0o700 });
    const handle = await fs.open(filename, "wx", 0o600);
    try { await handle.writeFile(bytes); await handle.sync(); }
    catch (error) { await fs.unlink(filename).catch(() => {}); throw error; }
    finally { await handle.close(); }
    res.json({ reference });
  } catch (error) { fail(res, error); }
});
router.post("/shop/admin/photos/request-url", async (req, res) => {
  try {
    const input = RequestShopPhotoUploadBody.strict().safeParse(req.body);
    if (!isPersistentShop() || !input.success) throw new ShopError("Envoi persistant invalide.");
    res.json(RequestShopPhotoUploadResponse.parse(await requestPrivateShopPhoto(input.data.contentType, input.data.size)));
  } catch (error) { fail(res, error); }
});
router.post("/shop/admin/photos/complete", async (req, res) => {
  try {
    const input = CompleteShopPhotoUploadBody.strict().safeParse(req.body);
    const owner = getAuth(req).userId;
    if (!isPersistentShop() || !input.success || !owner) throw new ShopError("Envoi persistant invalide.");
    res.json(await completePrivateShopPhoto(input.data.reference, owner, validateImage));
  } catch (error) { fail(res, error); }
});
router.get("/shop/catalog", async (_req, res) => {
  try {
    const state = await shopTest.read();
    const held = state.reservations.filter(r => r.status === "pending").flatMap(r => r.items);
    res.json(GetShopCatalogResponse.parse({ products: state.products.filter(p => p.status === "active" && p.visible).map(p => ({
      id: p.id, name: p.name, description: p.description, category: p.category, priceCents: p.priceCents, shippingInfo: p.shippingInfo,
      variants: p.variants.map(v => ({ id: v.id, color: v.color, size: v.size, photos: v.photos,
        available: v.stock !== null && v.stock - held.filter(item => item.productId === p.id && item.variantId === v.id).reduce((n,item) => n + item.quantity, 0) > 0 })),
    })) }));
  } catch (error) { fail(res, error); }
});
router.post("/shop/quote", async (req, res) => {
  try {
    const input = CreateShopQuoteBody.strict().safeParse(req.body);
    if (!input.success) throw new ShopError("Panier invalide.");
    res.json(CreateShopQuoteResponse.parse(quoteCart(await shopTest.read(), input.data.items, input.data.shippingCountry)));
  } catch (error) { fail(res, error); }
});
router.get("/shop/media", async (req, res) => {
  try {
    const reference = typeof req.query.reference === "string" ? req.query.reference : "";
    const state = await shopTest.read();
    const publicPhoto = state.products.some(p => p.status === "active" && p.visible && p.variants.some(v => v.photos.some(photo => photo.reference === reference)));
    if (!publicPhoto) {
      let authorized = false;
      await requireAdmin(req, res, () => { authorized = true; });
      if (!authorized) return;
    }
    if (isPersistentShop()) {
      const storage = new ObjectStorageService();
      const file = await storage.getObjectEntityFile(await persistentShop.objectPath(reference));
      res.set({ "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" });
      res.type(reference.endsWith(".png") ? "image/png" : reference.endsWith(".webp") ? "image/webp" : "image/jpeg");
      file.createReadStream().on("error", () => { if (!res.headersSent) res.status(503).end(); else res.destroy(); }).pipe(res);
      return;
    }
    let filename: string | null = null;
    if (reference.startsWith("original:") && SHOP_ORIGINALS.includes(reference.slice(9) as typeof SHOP_ORIGINALS[number])) {
      filename = path.resolve(SHOP_TEST_DIR, "../../attached_assets", reference.slice(9));
    } else filename = uploadFilename(reference);
    if (!filename) throw new ShopError("Photo introuvable.", 404);
    res.set({ "Content-Security-Policy": "default-src 'none'; sandbox", "Cross-Origin-Resource-Policy": "same-origin" });
    const extension = path.extname(reference);
    res.type(extension === ".jpeg" ? "image/jpeg" : extension === ".webp" ? "image/webp" : "image/png");
    // Protected route: sendFile never mounts the containing private directory.
    res.sendFile(filename, { dotfiles: "allow" }, error => { if (error && !res.headersSent) res.status(404).end(); });
  } catch (error) { fail(res, error); }
});
router.get("/shop/admin/orders", async (_req, res) => {
  try {
    type Session = { id: string; livemode: boolean; mode?: string; currency?: string; metadata?: Record<string, string>; payment_status?: string; status?: string; amount_total?: number; created: number };
    const page = await storeStripeApi<{ data: Session[] }>("/v1/checkout/sessions?limit=100");
    const mode = shopMode();
    const sessions = page.data.filter(s => s.livemode === (mode === "live") && s.id.startsWith(`cs_${mode}_`) && s.metadata?.storeFlow === "indamora-play-boutique-v1");
    const state = await shopTest.read();
    for (const session of sessions) {
      const pending = state.reservations.find(r => r.status === "pending" && r.id === session.metadata?.orderReference);
      if (pending && !pending.sessionId) await shopTest.attachSession(pending.id, session.id);
      await settleVerifiedShopSession(session);
    }
    const orders = sessions
      .map(s => ({ id: s.id, status: s.payment_status === "paid" ? "paid" : s.status === "expired" ? "expired" : "unpaid", amountCents: s.amount_total ?? null, created: s.created }));
    res.json(GetShopOrdersResponse.parse({ orders, message: orders.length
      ? `Sessions Stripe ${mode.toUpperCase()} vérifiées.${mode === "test" ? " Aucune commande réelle." : ""}`
      : `Aucune session de commande Boutique trouvée dans les 100 dernières sessions Stripe ${mode.toUpperCase()}.` }));
  } catch {
    res.json(GetShopOrdersResponse.parse({ orders: [], message: "Les sessions Stripe Boutique n’ont pas pu être vérifiées. Aucun paiement n’est considéré comme confirmé." }));
  }
});

export default router;
