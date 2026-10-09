import express, { Router, type IRouter } from "express";
import { verifyStripeSignature } from "../stripeSignature";
import { storeStripeApi } from "../storeStripeClient";
import { settleVerifiedShopSession } from "../lib/shop-session";
import { shopMode, shopWebhookEnabled, shopWebhookSecret, SHOP_WEBHOOK_EVENTS } from "../lib/shop-runtime";

const router: IRouter = Router();
const supportedEvents: Set<string> = new Set(SHOP_WEBHOOK_EVENTS);

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
    if (!shopWebhookEnabled()) {
      res.status(404).json({ error: "Endpoint indisponible." });
      return;
    }
    next();
  },
  express.raw({ type: "application/json", limit: "128kb" }),
  async (req, res): Promise<void> => {
    const secret = shopWebhookSecret();
    if (!secret?.startsWith("whsec_")) {
      res.status(503).json({ error: "Le webhook Boutique n’est pas configuré." });
      return;
    }

    let event: StoreEvent;
    let validationStage = "signature";
    try {
      const signature = req.get("stripe-signature");
      if (
        !signature ||
        !Buffer.isBuffer(req.body) ||
        !verifyStripeSignature(req.body, signature, secret)
      ) {
        throw new Error("Invalid signature");
      }
      validationStage = "event";
      event = JSON.parse(req.body.toString("utf8")) as StoreEvent;
      if (!event?.id?.startsWith("evt_") || !event.type || event.livemode !== (shopMode() === "live") || !event.data?.object) {
        throw new Error("Invalid Shop event");
      }
    } catch {
      req.log.warn({
        validationStage,
        rawBodyPresent: Buffer.isBuffer(req.body),
        signaturePresent: Boolean(req.get("stripe-signature")),
      }, "Boutique webhook signature or event rejected");
      res.status(400).json({ error: "Signature ou événement Boutique invalide." });
      return;
    }

    const object = event.data!.object!;
    if (
      !supportedEvents.has(event.type!) ||
      object.metadata?.storeFlow !== "indamora-play-boutique-v1"
    ) {
      // Events from other products must not touch Premium, donations or users.
      res.status(200).json({ received: true, ignored: true });
      return;
    }
    if (!object.id?.startsWith(`cs_${shopMode()}_`) || object.mode !== "payment") {
      res.status(400).json({ error: "Session Boutique invalide." });
      return;
    }

    try {
      const session = await storeStripeApi<StoreSession>(
        `/v1/checkout/sessions/${encodeURIComponent(object.id)}`,
      );
      if (
        session.id !== object.id ||
        session.livemode !== (shopMode() === "live") ||
        session.mode !== "payment" ||
        session.metadata?.storeFlow !== "indamora-play-boutique-v1"
      ) {
        throw new Error("Unexpected Shop session");
      }
      const paid = session.payment_status === "paid";
      if (event.type === "checkout.session.async_payment_succeeded" && !paid) {
        // Stripe can retry once the authoritative session reflects payment.
        res.status(503).json({ error: "Confirmation Stripe Boutique en attente." });
        return;
      }

      // Idempotent Shop-only settlement, no effect on other spaces or accounts.
      const matched = await settleVerifiedShopSession(session, event.type === "checkout.session.async_payment_failed");
      req.log.info(
        { eventId: event.id, eventType: event.type, paid },
        "Boutique webhook verified against Stripe",
      );
      res.status(200).json({ received: true, ...(matched ? {} : { ignored: true }) });
    } catch {
      req.log.warn("Boutique webhook Stripe confirmation unavailable");
      res.status(503).json({ error: "Vérification Stripe Boutique indisponible." });
    }
  },
);

export default router;
