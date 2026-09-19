import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function stripeApi<T>(
  path: string,
  options: { method?: "GET" | "POST"; params?: URLSearchParams } = {},
): Promise<T> {
  const response = await connectors.proxy("stripe", path, {
    method: options.method ?? "GET",
    headers: options.params
      ? { "Content-Type": "application/x-www-form-urlencoded" }
      : undefined,
    body: options.params?.toString(),
  });
  const body = await response.json() as T;
  if (!response.ok) throw new Error(`Stripe a répondu avec le statut ${response.status}.`);
  return body;
}

export function formData(entries: Record<string, string | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params;
}