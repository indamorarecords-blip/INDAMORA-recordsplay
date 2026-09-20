import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { siteVisitsTable, db } from "@workspace/db";

const router: IRouter = Router();
type VisitBody = { sessionId: string; path: string; referrer?: string };

function parseVisitBody(body: unknown): VisitBody | null {
  if (!body || typeof body !== "object") return null;
  const value = body as Record<string, unknown>;
  if (
    typeof value.sessionId !== "string" ||
    value.sessionId.length < 16 ||
    value.sessionId.length > 200 ||
    typeof value.path !== "string" ||
    value.path.length < 1 ||
    value.path.length > 200 ||
    (value.referrer !== undefined &&
      (typeof value.referrer !== "string" || value.referrer.length > 2_000))
  ) {
    return null;
  }
  return {
    sessionId: value.sessionId,
    path: value.path,
    referrer: value.referrer as string | undefined,
  };
}

function deviceFromUserAgent(userAgent: string): string {
  if (/mobile|android|iphone|ipad/i.test(userAgent)) return "mobile";
  if (/tablet/i.test(userAgent)) return "tablet";
  return "desktop";
}

router.post("/analytics/visit", async (req, res): Promise<void> => {
  const parsed = parseVisitBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Données de visite invalides." });
    return;
  }

  let referrerDomain: string | undefined;
  if (parsed.referrer) {
    try {
      referrerDomain = new URL(parsed.referrer).hostname.slice(0, 200) || undefined;
    } catch {
      referrerDomain = undefined;
    }
  }

  await db.insert(siteVisitsTable).values({
    sessionHash: createHash("sha256").update(parsed.sessionId).digest("hex"),
    path: parsed.path,
    referrerDomain,
    device: deviceFromUserAgent(req.get("user-agent") ?? ""),
  });
  res.status(201).json({ recorded: true });
});

export default router;