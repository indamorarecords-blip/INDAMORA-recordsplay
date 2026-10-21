// Shop-only runtime boundaries. No Premium/donation key or configuration is used.
export type ShopMode = "test" | "live";
export const SHOP_PUBLIC_ORIGIN = "https://indamoraplay.com";
export const SHOP_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const;

export function shopMode(env: NodeJS.ProcessEnv = process.env): ShopMode {
  return env.NODE_ENV === "development" ? "test" : "live";
}

export function shopRoutesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" ||
    (env.NODE_ENV === "production" && env.BOUTIQUE_LIVE_ENABLED === "true");
}

export function shopAdminSetupRoutesEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === "development" ||
    (env.NODE_ENV === "production" && env.BOUTIQUE_LIVE_CATALOG_SETUP_ENABLED === "true");
}

function shopRouteSegments(pathname: string): string[] {
  const segments = pathname.split(/[?#]/, 1)[0].split("/").filter(Boolean);
  const shopIndex = segments.lastIndexOf("shop");
  return shopIndex >= 0 ? segments.slice(shopIndex + 1) : segments;
}

function isShopAdminPath(pathname: string): boolean {
  return shopRouteSegments(pathname)[0] === "admin";
}

export function shopRouteAccessEnabled(pathname: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return isShopAdminPath(pathname)
    ? shopAdminSetupRoutesEnabled(env)
    : shopRoutesEnabled(env);
}

export function shopPublicReadAccessEnabled(
  method: string,
  pathname: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (method.toUpperCase() !== "GET" || env.NODE_ENV !== "production" || shopRoutesEnabled(env)) {
    return false;
  }
  const segments = shopRouteSegments(pathname);
  return segments.length === 1 && (segments[0] === "catalog" || segments[0] === "media");
}

export function shopWebhookSecret(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return shopMode(env) === "test"
    ? env.STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET
    : env.STRIPE_BOUTIQUE_LIVE_WEBHOOK_SECRET;
}

export function shopWebhookEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Pausing new LIVE Checkout must not prevent settlement of an existing order.
  return env.NODE_ENV === "development" ||
    (env.NODE_ENV === "production" && Boolean(shopWebhookSecret(env)?.startsWith("whsec_")));
}

export function shopAllowedHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  if (shopMode(env) === "live") return new Set([new URL(SHOP_PUBLIC_ORIGIN).host]);
  const hosts = new Set<string>();
  for (const value of [env.REPLIT_DEV_DOMAIN, ...(env.REPLIT_DOMAINS ?? "").split(",")]) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.includes("://") ? value.trim() : `https://${value.trim()}`);
      if (url.protocol === "https:" && !url.username && !url.password &&
          (url.hostname.endsWith(".replit.dev") || url.hostname.endsWith(".repl.co"))) {
        hosts.add(url.host.toLowerCase());
      }
    } catch { /* An invalid host is never an allowed return or webhook origin. */ }
  }
  return hosts;
}

export function shopReturnBase(env: NodeJS.ProcessEnv = process.env): string | null {
  if (shopMode(env) === "live") return `${SHOP_PUBLIC_ORIGIN}/boutique`;
  const host = env.REPLIT_DEV_DOMAIN?.trim();
  if (!host) return null;
  try {
    const url = new URL(host.includes("://") ? host : `https://${host}`);
    return url.protocol === "https:" && shopAllowedHosts(env).has(url.host.toLowerCase()) && !url.username && !url.password
      ? `https://${url.host}/boutique` : null;
  } catch { return null; }
}
