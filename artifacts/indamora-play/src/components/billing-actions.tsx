import { useEffect, useState } from 'react';
import { useAuth } from '@clerk/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Crown, HeartHandshake, LoaderCircle } from 'lucide-react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';

type Plan = 'africa' | 'international';
type BillingPlans = {
  available: boolean;
  mode: 'test' | 'live' | 'unavailable';
  plans: Record<Plan, { available: boolean }>;
  reason?: string;
};
type BillingStatus = {
  status: string;
  subscription: {
    id: string;
    status: string;
    currentPeriodEnd: number | null;
    cancelAtPeriodEnd: boolean;
    priceId: string | null;
  } | null;
  isPremium: boolean;
};
type CheckoutReturn = 'success' | 'cancelled' | null;

async function billingRequest<T>(
  path: string,
  getToken: () => Promise<string | null>,
  init: RequestInit = {},
  authenticated = false,
): Promise<T> {
  const token = authenticated ? await getToken() : null;
  if (authenticated && !token) {
    throw new Error('Votre session a expiré. Reconnectez-vous pour continuer.');
  }
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => null) as ({ error?: string } & Partial<T>) | null;
  if (!response.ok) {
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Opération de paiement impossible.',
    );
  }
  return body as T;
}

function getCheckoutReturn(): CheckoutReturn {
  const query = new URLSearchParams(window.location.search);
  const value = query.get('checkout');
  if (value !== 'success' && value !== 'cancelled') return null;
  query.delete('checkout');
  const remaining = query.toString();
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${remaining ? `?${remaining}` : ''}${window.location.hash}`,
  );
  return value;
}

export function useBillingActions() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const { toast } = useToast();
  const [checkoutReturn, setCheckoutReturn] = useState<CheckoutReturn>(null);
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);

  useEffect(() => {
    setCheckoutReturn(getCheckoutReturn());
  }, []);

  const plans = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: () => billingRequest<BillingPlans>('/api/billing/plans', getToken),
    staleTime: 60_000,
    retry: 1,
  });
  const status = useQuery({
    queryKey: ['billing', 'status', userId],
    queryFn: () => billingRequest<BillingStatus>('/api/billing/status', getToken, {}, true),
    enabled: Boolean(isLoaded && isSignedIn),
    staleTime: 5_000,
    retry: 1,
  });

  useEffect(() => {
    if (
      checkoutReturn !== 'success' ||
      !isSignedIn ||
      status.data?.isPremium ||
      confirmationTimedOut
    ) return;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      void status.refetch();
      if (attempts >= 10) {
        window.clearInterval(interval);
        setConfirmationTimedOut(true);
      }
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [checkoutReturn, isSignedIn, status.data?.isPremium, status.refetch, confirmationTimedOut]);

  const checkout = useMutation({
    mutationFn: async (request: { kind: 'subscription'; plan: Plan } | { kind: 'donation'; amountEur: number }) => {
      const result = await billingRequest<{ url: string }>(
        '/api/billing/checkout',
        getToken,
        { method: 'POST', body: JSON.stringify(request) },
        Boolean(isSignedIn),
      );
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw new Error('Stripe n’a pas fourni une adresse Checkout sécurisée.');
      return url.toString();
    },
    onSuccess: (url) => window.location.assign(url),
    onError: (error: Error) => toast({
      title: 'Paiement indisponible',
      description: error.message,
      variant: 'destructive',
    }),
  });
  const portal = useMutation({
    mutationFn: async () => {
      const result = await billingRequest<{ url: string }>(
        '/api/billing/portal',
        getToken,
        { method: 'POST' },
        true,
      );
      const url = new URL(result.url);
      if (url.protocol !== 'https:') throw new Error('Stripe n’a pas fourni une adresse sécurisée.');
      return url.toString();
    },
    onSuccess: (url) => window.location.assign(url),
    onError: (error: Error) => toast({
      title: 'Gestion de l’abonnement indisponible',
      description: error.message,
      variant: 'destructive',
    }),
  });

  const hasSubscription = Boolean(
    status.data?.subscription &&
    !['canceled', 'incomplete_expired'].includes(status.data.subscription.status),
  );
  const checkoutBusy = checkout.isPending || portal.isPending;

  return {
    isSignedIn: Boolean(isLoaded && isSignedIn),
    plans,
    status,
    checkout,
    portal,
    hasSubscription,
    checkoutBusy,
    checkoutReturn,
    confirmationTimedOut,
    subscribe: (plan: Plan) => checkout.mutate({ kind: 'subscription', plan }),
    donate: (amountEur: number) => checkout.mutate({ kind: 'donation', amountEur }),
    manage: () => portal.mutate(),
  };
}

type BillingActions = ReturnType<typeof useBillingActions>;

export function PremiumPlanAction({ plan, billing }: { plan: Plan; billing: BillingActions }) {
  const available = billing.plans.data?.plans?.[plan]?.available === true;
  const unavailable = billing.plans.data?.mode === 'unavailable' || billing.plans.data?.plans?.[plan]?.available === false;
  const busy = billing.checkoutBusy || billing.plans.isLoading || (billing.isSignedIn && billing.status.isLoading);
  const statusUnavailable = billing.isSignedIn && (billing.status.isError || !billing.status.data);
  const disabled = busy || statusUnavailable || !billing.isSignedIn || !available || billing.hasSubscription;
  const variant = plan === 'africa'
    ? 'bg-accent text-accent-foreground'
    : 'bg-primary text-primary-foreground';

  return (
    <div className="mt-10">
      {billing.isSignedIn
        ? <button
          type="button"
          disabled={disabled}
          onClick={() => billing.subscribe(plan)}
          className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-center text-sm font-bold transition-opacity disabled:cursor-not-allowed disabled:opacity-50 ${variant}`}
          data-testid={`button-pricing-${plan}`}
        >
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
          {busy
            ? 'Vérification…'
            : billing.hasSubscription
              ? 'Abonnement déjà enregistré'
            : statusUnavailable
              ? 'Statut à vérifier'
              : !billing.plans.data
                ? 'Vérification de l’offre…'
                : unavailable
                  ? 'Offre indisponible'
                  : 'Souscrire avec Stripe'}
        </button>
        : <Link
          href={`/sign-in?redirect_url=${encodeURIComponent(`${window.location.origin}${window.location.pathname}${window.location.search}`)}`}
          className={`flex w-full items-center justify-center gap-2 rounded-full py-3 text-center text-sm font-bold ${variant}`}
          data-testid={`link-pricing-${plan}-sign-in`}
        >
          <Crown className="h-4 w-4" /> Se connecter pour souscrire
        </Link>}
      {unavailable && <p className="mt-3 text-center text-xs leading-5 text-destructive">
        {billing.plans.data?.reason ?? 'Cette offre n’est pas configurée pour le moment. Réessayez plus tard.'}
      </p>}
      {billing.plans.error && <p role="alert" className="mt-3 text-center text-xs leading-5 text-destructive">
        {billing.plans.error.message}
      </p>}
    </div>
  );
}

export function PremiumBillingStatus({ billing }: { billing: BillingActions }) {
  if (!billing.isSignedIn) return null;
  if (billing.status.isLoading) {
    return <p className="mt-4 text-center text-sm text-muted-foreground">Vérification de votre abonnement…</p>;
  }
  if (billing.status.error) {
    return <p role="alert" className="mt-4 text-center text-sm text-destructive">
      Le statut de votre abonnement n’a pas pu être vérifié. {billing.status.error.message}
    </p>;
  }
  const subscription = billing.status.data?.subscription;
  if (!subscription) {
    if (billing.checkoutReturn === 'success') {
      return <p role="status" className="mx-auto mt-5 max-w-2xl rounded-xl bg-accent/20 px-4 py-3 text-center text-sm">
        {billing.confirmationTimedOut
          ? 'Le retour de Stripe est reçu, mais sa confirmation serveur reste en attente. Votre Premium ne sera activé qu’après confirmation par Stripe.'
          : 'Le retour de Stripe est reçu. La confirmation serveur de votre abonnement est en cours.'}
      </p>;
    }
    return null;
  }

  const isPremium = billing.status.data?.isPremium === true;
  const periodEnd = subscription.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd * 1000).toLocaleDateString('fr-FR')
    : null;
  const statusLabel = isPremium
    ? subscription.cancelAtPeriodEnd
      ? `Premium actif jusqu’au ${periodEnd ?? 'terme de la période'}`
      : 'Premium actif — confirmé par Stripe'
    : subscription.status === 'past_due'
      ? 'Paiement en retard — accès Premium non confirmé'
      : subscription.status === 'incomplete'
        ? 'Paiement en attente de confirmation Stripe'
        : `Statut de l’abonnement : ${subscription.status}`;

  return (
    <div className="mx-auto mt-5 flex max-w-3xl flex-wrap items-center justify-center gap-3 text-center text-sm text-muted-foreground">
      <span role="status">{statusLabel}</span>
      {billing.hasSubscription && <button
        type="button"
        disabled={billing.checkoutBusy}
        onClick={billing.manage}
        className="rounded-full border border-border px-4 py-2 font-bold hover:border-primary hover:text-primary disabled:opacity-50"
      >
        {billing.portal.isPending ? 'Ouverture…' : 'Gérer mon abonnement'}
      </button>}
    </div>
  );
}

export function CheckoutReturnNotice({ billing }: { billing: BillingActions }) {
  if (billing.checkoutReturn !== 'cancelled') return null;
  return (
    <p role="status" className="mx-auto mt-5 max-w-2xl rounded-xl bg-muted px-4 py-3 text-center text-sm text-muted-foreground">
      Vous avez annulé Checkout. Aucun abonnement n’a été activé ici.
    </p>
  );
}

export function DonationCheckoutButton({
  billing,
  amount,
  supported,
}: {
  billing: BillingActions;
  amount: number;
  supported: boolean;
}) {
  const disabled = billing.checkoutBusy || !supported;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => billing.donate(amount)}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3.5 font-bold text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="button-donation-checkout"
      >
        {billing.checkout.isPending
          ? <LoaderCircle className="h-4 w-4 animate-spin" />
          : <HeartHandshake className="h-4 w-4" />}
        {billing.checkout.isPending
          ? 'Ouverture de Checkout…'
          : supported
            ? `Faire un don de ${amount} € avec Stripe`
            : 'Choisissez un montant disponible'}
      </button>
      {!supported && <p role="alert" className="mt-3 text-center text-xs text-destructive">
        Montants disponibles : 1 €, 5 €, 10 €, 20 €, 50 € et 100 €.
      </p>}
      {billing.checkoutReturn === 'cancelled' && <p role="status" className="mt-4 rounded-xl bg-muted px-4 py-3 text-center text-xs text-muted-foreground">
        Vous avez annulé Checkout. Aucun don n’a été confirmé ici.
      </p>}
      {billing.checkoutReturn === 'success' && <p role="status" className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-center text-xs text-primary">
        Le retour de Stripe est reçu. La confirmation du don dépend de la vérification serveur.
      </p>}
    </>
  );
}