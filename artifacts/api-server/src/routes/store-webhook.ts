import express, { Router, type IRouter } from "express";
import { verifyStripeSignature } from "../stripeSignature";
import { storeStripeApi } from "../storeStripeClient";
import { settleVerifiedShopSession } from "../lib/shop-session";

const router: IRouter = Router();
const supportedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

type StoreEvent = {
  id?: string;
  type?: string;
  livemode?: boolean;
  data?: {
    object?: {
      id?: string;
      mode?: string;
      metadata?: Record<string, unknown>;
    };
  };
};

type StoreSession = {
  id?: string;
  livemode?: boolean;
  mode?: string;
  payment_status?: string;
  status?: string;
  metadata?: Record<string, string>;
  amount_total?: number | null;
  currency?: string | null;
};

router.post(
  "/api/store/stripe/webhook",
  (req, res, next): void => {
    if (process.env.NODE_ENV !== "development") {
      res.status(404).json({ error: "Endpoint indisponible." });
      return;
    }
    next();
  },
  express.raw({ type: "application/json", limit: "128kb" }),
  async (req, res): Promise<void> => {
    const secret = process.env.STRIPE_BOUTIQUE_TEST_WEBHOOK_SECRET;
    if (!secret?.startsWith("whsec_")) {
      res.status(503).json({ error: "Le webhook Boutique TEST n’est pas configuré." });
      return;
    }

    let event: StoreEvent;
    try {
      const signature = req.get("stripe-signature");
      if (
        !signature ||
        !Buffer.isBuffer(req.body) ||
        !verifyStripeSignature(req.body, signature, secret)
      ) {
        throw new Error("Invalid signature");
      }
      event = JSON.parse(req.body.toString("utf8")) as StoreEvent;
      if (!event?.id?.startsWith("evt_") || !event.type || event.livemode !== false || !event.data?.object) {
        throw new Error("Invalid TEST event");
      }
    } catch {
      req.log.warn("Boutique TEST webhook signature or event rejected");
      res.status(400).json({ error: "Signature ou événement Boutique TEST invalide." });
      return;
    }

    const object = event.data!.object!;
    if (
      !supportedEvents.has(event.type!) ||
      object.metadata?.storeFlow !== "indamora-play-boutique-v1"
    ) {
      // Events from other TEST products must not touch Premium, donations or users.
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    if (!object.id?.startsWith("cs_test_") || object.mode !== "payment") {
      res.status(400).json({ error: "Session Boutique TEST invalide." });
      return;
    }

    try {
      const session = await storeStripeApi<StoreSession>(
        `/v1/checkout/sessions/${encodeURIComponent(object.id)}`,
      );
      if (
        session.id !== object.id ||
        session.livemode !== false ||
        session.mode !== "payment" ||
        session.metadata?.storeFlow !== "indamora-play-boutique-v1"
      ) {
        throw new Error("Unexpected TEST session");
      }
      const paid = session.payment_status === "paid";
      if (event.type === "checkout.session.async_payment_succeeded" && !paid) {
        // Stripe can retry once the authoritative session reflects payment.
        res.status(503).json({ error: "Confirmation Stripe TEST en attente." });
        return;
      }

      // Idempotent Shop-only settlement, no effect on other spaces or accounts.
      const matched = await settleVerifiedShopSession(session, event.type === "checkout.session.async_payment_failed");
      req.log.info(
        { eventId: event.id, eventType: event.type, paid },
        "Boutique TEST webhook verified against Stripe",
      );
      res.status(200).json({ received: true, ...(matched ? {} : { ignored: true }) });
    } catch {
      req.log.warn("Boutique TEST webhook Stripe confirmation unavailable");
      res.status(503).json({ error: "Vérification Stripe TEST indisponible." });
    }
  },
);

export default router;
