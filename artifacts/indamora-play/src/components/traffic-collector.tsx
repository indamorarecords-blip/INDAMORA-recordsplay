import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { recordPageview } from "@workspace/api-client-react";

const publicPaths = new Set(["/", "/explorer", "/recherche", "/repertoire", "/artists", "/presse", "/pricing", "/soutenir"]);

// Invisible and independent of sign-in, playback, payments and artist flows.
// No cookie, storage entry, personal/account information or query is sent.
export function TrafficCollector() {
  const [location] = useLocation();
  const last = useRef("");
  useEffect(() => {
    const path = location.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
    if (!publicPaths.has(path) && !/^\/(?:oeuvres|artists)\/[1-9]\d{0,9}$/.test(path) &&
      !/^\/categorie\/[a-z0-9-]{1,60}$/.test(path)) return;
    const browser = navigator as Navigator & { globalPrivacyControl?: boolean };
    if (browser.doNotTrack === "1" || browser.globalPrivacyControl === true) return;
    const visit = `${path}:${Math.floor(Date.now() / 5000)}`;
    if (last.current === visit) return;
    last.current = visit;
    // Failure must never interrupt the existing website or show a public toast.
    void recordPageview({ path }, { credentials: "omit", keepalive: true }).catch(() => undefined);
  }, [location]);
  return null;
}