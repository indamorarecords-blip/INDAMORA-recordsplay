import { shop, isPersistentShop } from "./shop-repository";
import { ShopError } from "./shop-test";
import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
  return value;
}
export const shopQuoteHash = (quote: unknown) => createHash("sha256").update(JSON.stringify(canonical(quote))).digest("hex");

type VerifiedSession = {
  id?: string; livemode?: boolean; mode?: string; payment_status?: string;
  status?: string | null; amount_total?: number | null; currency?: string | null;
  metadata?: Record<string, string>;
};
// A browser return URL never constitutes payment proof. All callers first
// retrieve the session from the dedicated Stripe account, or verify its signed
// webhook and then retrieve it. Compare the immutable reservation quote too.
export async function settleVerifiedShopSession(session: VerifiedSession, asyncFailed = false) {
  if (isPersistentShop()) {
    const mode = process.env.NODE_ENV === "development" ? "test" : "live";
    if (!session.id?.startsWith(`cs_${mode}_`) || session.livemode !== (mode === "live") ||
        session.mode !== "payment" || session.metadata?.storeFlow !== "indamora-play-boutique-v1") {
      throw new ShopError("Session Stripe Boutique incorrecte.", 503);
    }
    const order = (await shop.read()).reservations.find(r => r.id === session.metadata?.orderReference);
    if (!order) return false; // Existing sessions outside the imported Shop are not touched.
    if (order.sessionId && order.sessionId !== session.id) throw new ShopError("Session de commande incohérente.", 409);
    if (!order.quote || order.quote.totalCents === null || session.amount_total !== order.quote.totalCents ||
        session.currency !== "eur") throw new ShopError("Montant de commande non confirmé.", 503);
    if (session.metadata?.shopQuoteHash !== shopQuoteHash(order.quote) ||
        session.metadata?.shippingCountry !== order.quote.shippingCountry) {
      throw new ShopError("Articles ou livraison de commande non confirmés.", 503);
    }
    if (!order.sessionId && order.status === "pending") await shop.attachSession(order.id, session.id);
  }
  await shop.settleSession(session.id!, session.payment_status === "paid",
    session.status === "expired" || (asyncFailed && session.payment_status !== "paid"));
  return true;
}
