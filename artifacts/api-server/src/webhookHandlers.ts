import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function readSignature(signature: string): { timestamp: number; signatures: string[] } {
  const values = new Map<string, string[]>();
  for (const part of signature.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    values.set(key, [...(values.get(key) ?? []), value]);
  }

  const timestamp = Number(values.get("t")?.[0]);
  const signatures = values.get("v1") ?? [];
  if (!Number.isInteger(timestamp) || signatures.length === 0) {
    throw new Error("Signature Stripe malformée.");
  }
  return { timestamp, signatures };
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new Error("STRIPE_WEBHOOK_SECRET n’est pas configuré.");
    }

    const { timestamp, signatures } = readSignature(signature);
    if (Math.abs(Math.floor(Date.now() / 1000) - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
      throw new Error("La signature Stripe est expirée.");
    }

    const signedPayload = `${timestamp}.${payload.toString("utf8")}`;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    const isValid = signatures.some((candidate) => {
      const candidateBuffer = Buffer.from(candidate, "utf8");
      return (
        candidateBuffer.length === expectedBuffer.length &&
        timingSafeEqual(candidateBuffer, expectedBuffer)
      );
    });
    if (!isValid) throw new Error("La signature Stripe est invalide.");

    JSON.parse(payload.toString("utf8")) as { type?: string };
  }
}