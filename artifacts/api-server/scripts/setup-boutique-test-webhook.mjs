import { createHash } from "node:crypto";
import { storeStripeApi } from "../src/storeStripeClient.ts";

// Explicit manual TEST setup only; never called by startup, build or deployment.
const balance = await storeStripeApi("/v1/balance");
if (balance.livemode !== false) throw new Error("Stripe TEST non confirmé.");

const domain = process.env.REPLIT_DEV_DOMAIN;
if (!domain) throw new Error("Domaine Preview manquant.");
const url = new URL(domain.includes("://") ? domain : `https://${domain}`);
if (
  url.protocol !== "https:" ||
  !url.hostname.endsWith(".replit.dev") ||
  url.username ||
  url.password ||
  url.port
) throw new Error("Seul un domaine Preview Replit HTTPS est autorisé.");
url.pathname = "/api/store/stripe/webhook";
url.search = "";
url.hash = "";

const requiredEvents = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
];
const endpoints = [];
let cursor;
for (let page = 0; page < 5; page += 1) {
  const params = new URLSearchParams({ limit: "100" });
  if (cursor) params.set("starting_after", cursor);
  const result = await storeStripeApi(`/v1/webhook_endpoints?${params}`);
  if (!Array.isArray(result.data) || result.data.some((item) => item.livemode !== false)) {
    throw new Error("Liste de webhooks TEST non confirmée.");
  }
  endpoints.push(...result.data);
  if (!result.has_more) break;
  cursor = result.data.at(-1)?.id;
  if (!cursor || page === 4) throw new Error("Liste de webhooks incomplète : aucune création.");
}

const matching = endpoints.filter((item) => item.url === url.toString());
if (matching.length > 1) throw new Error("Plusieurs destinations existent : aucune modification.");
let endpoint = matching[0];
let created = false;
if (endpoint) {
  if (
    endpoint.status !== "enabled" ||
    !requiredEvents.every((event) => endpoint.enabled_events?.includes(event) || endpoint.enabled_events?.includes("*"))
  ) {
    throw new Error("Destination existante incompatible : aucune modification.");
  }
} else {
  const params = new URLSearchParams({
    url: url.toString(),
    description: "Boutique INDAMORA PLAY — TEST / Preview uniquement",
    "metadata[storeFlow]": "indamora-play-boutique-v1",
  });
  requiredEvents.forEach((event, index) => params.set(`enabled_events[${index}]`, event));
  endpoint = await storeStripeApi("/v1/webhook_endpoints", {
    method: "POST",
    params,
    idempotencyKey: `boutique-test-webhook-${createHash("sha256").update(url.toString()).digest("hex").slice(0, 32)}`,
  });
  created = true;
}

if (
  endpoint.livemode !== false ||
  endpoint.status !== "enabled" ||
  endpoint.url !== url.toString()
) throw new Error("Destination Boutique TEST non confirmée.");

// Stripe can return a signing secret on creation. Never print, persist, or
// expose that response; the owner copies the secret using Replit's secure form.
console.log(JSON.stringify({
  created,
  testModeConfirmed: true,
  endpointId: endpoint.id,
  url: endpoint.url,
  enabledEvents: endpoint.enabled_events,
  existingEndpointsChanged: false,
}));
