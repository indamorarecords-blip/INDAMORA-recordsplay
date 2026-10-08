// Boutique-only transport. It never reads the Premium/donation connector or keys.
export class StoreTestConfigurationError extends Error {}

type StoreStripeOptions = {
  method?: "GET" | "POST";
  params?: URLSearchParams;
  idempotencyKey?: string;
};

function dedicatedTestKey(): string {
  if (process.env.NODE_ENV !== "development") {
    throw new StoreTestConfigurationError("La Boutique Stripe TEST est réservée au développement.");
  }
  const key = process.env.STRIPE_BOUTIQUE_TEST_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) {
    throw new StoreTestConfigurationError("La clé Stripe TEST dédiée à la Boutique est absente ou invalide.");
  }
  return key;
}

export async function storeStripeApi<T>(
  path: string,
  options: StoreStripeOptions = {},
): Promise<T> {
  const key = dedicatedTestKey();
  const url = new URL(path, "https://api.stripe.com");
  if (
    !path.startsWith("/v1/") ||
    url.origin !== "https://api.stripe.com" ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error("Endpoint Stripe Boutique invalide.");
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        ...(options.params ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
      },
      body: options.params?.toString(),
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error("Le service Stripe TEST de la Boutique est indisponible.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    // Never surface Stripe's raw error text, headers, or credentials.
    throw new Error(`La requête Stripe Boutique TEST a échoué (HTTP ${response.status}).`);
  }
  if ("livemode" in body && body.livemode !== false) {
    throw new Error("Stripe n’a pas confirmé une ressource Boutique TEST.");
  }
  return body as T;
}

export function formData(
  entries: Record<string, string | number | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(entries)) {
    if (value !== undefined) params.set(name, String(value));
  }
  return params;
}
