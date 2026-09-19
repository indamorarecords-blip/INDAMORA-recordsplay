import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export type StripeMetadata = Record<string, string>;

export type StripePrice = {
  id: string;
  active: boolean;
  type: "one_time" | "recurring";
  currency: string;
  unit_amount: number | null;
  metadata: StripeMetadata;
  recurring?: { interval: string } | null;
};

type StripeApiOptions = {
  method?: "GET" | "POST";
  params?: URLSearchParams;
};

export async function stripeApi<T>(
  path: string,
  options: StripeApiOptions = {},
): Promise<T> {
  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers: options.params
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : undefined,
    body: options.params?.toString(),
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | T
    | null;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? body.error?.message
        : undefined;
    throw new Error(message || `Stripe a répondu avec le statut ${response.status}.`);
  }
  return body as T;
}

export function formData(entries: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}