import { createHmac } from "node:crypto";
import { isIP } from "node:net";

const publicPaths = new Set(["/", "/explorer", "/recherche", "/repertoire", "/artists", "/presse", "/pricing", "/soutenir"]);

export function normalizeAnalyticsPath(value: string): string | null {
  const path = value.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  if (publicPaths.has(path)) return path;
  if (/^\/(?:oeuvres|artists)\/[1-9]\d{0,9}$/.test(path)) return path;
  if (/^\/categorie\/[a-z0-9-]{1,60}$/.test(path)) return path;
  return null; // Never collect auth URLs, personal areas, arbitrary strings or search terms.
}

function normalizeIp(value: string): string | null {
  const ip = value.trim().replace(/^::ffff:(?=\d+\.)/i, "");
  return isIP(ip) ? ip : null;
}

function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return ip === "::" || ip === "::1" || /^(?:fc|fd|fe[89ab])/i.test(ip);
}

// Only the existing reverse-proxied API uses this. Read from the right so a
// client-supplied prefix cannot override an address appended by the proxy.
// This is an approximate traffic signal, never an authentication signal.
export function analyticsClientIp(forwarded: string | undefined, remote: string | undefined): string | null {
  const addresses = (forwarded ?? "").split(",").slice(-16).reverse();
  for (const address of addresses) {
    const ip = normalizeIp(address);
    if (ip && !isPrivateIp(ip)) return ip;
  }
  const ip = normalizeIp(remote ?? "");
  return ip && !isPrivateIp(ip) ? ip : null;
}

export function visitorFingerprint(ip: string, userAgent: string, secret: string): string {
  return createHmac("sha256", secret).update(`indamora-traffic-v1\0${ip}\0${userAgent.slice(0, 512)}`).digest("hex");
}

export function excludedTraffic(userAgent: string, dnt: string | undefined, gpc: string | undefined): boolean {
  return dnt === "1" || gpc === "1" || !userAgent ||
    /bot|crawler|spider|headless|lighthouse|preview|facebookexternalhit|curl|wget/i.test(userAgent);
}

export function parisDate(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(date);
}

export function validRange(start: string, end: string, today = parisDate()): boolean {
  const dates = [start, end, today].map((date) => new Date(`${date}T12:00:00Z`));
  if (dates.some((date, i) => !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== [start, end, today][i])) return false;
  const [s, e, t] = dates.map((date) => date.getTime());
  return s <= e && e <= t && s >= t - 89 * 86400000;
}