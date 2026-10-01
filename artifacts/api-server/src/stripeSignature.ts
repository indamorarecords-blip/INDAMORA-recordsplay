import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_TOLERANCE_SECONDS = 300;

function readSignature(signature: string): {
  timestamp: number;
  signatures: string[];
} {
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

export function verifyStripeSignature(
  payload: Buffer,
  signature: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const { timestamp, signatures } = readSignature(signature);
  if (Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload.toString("utf8")}`)
    .digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });
}