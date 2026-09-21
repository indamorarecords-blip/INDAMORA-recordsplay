import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Signature Stripe manquante." });
      return;
    }

    try {
      await WebhookHandlers.processWebhook(
        req.body as Buffer,
        Array.isArray(signature) ? signature[0] : signature,
      );
      res.status(200).json({ received: true });
    } catch (error) {
      req.log.error({ error }, "Stripe webhook processing failed");
      res.status(400).json({ error: "Webhook Stripe invalide." });
    }
  },
);
const configuredOrigins = [
  process.env.PUBLIC_APP_URL,
  process.env.REPLIT_DEV_DOMAIN && `https://${process.env.REPLIT_DEV_DOMAIN}`,
  process.env.REPLIT_EXPO_DEV_DOMAIN && `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`,
  ...(process.env.REPLIT_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean)
    .map((domain) => (domain.startsWith("http") ? domain : `https://${domain}`)),
].filter((origin): origin is string => Boolean(origin)).map((origin) => origin.replace(/\/+$/, ""));

app.use(
  cors({
    credentials: true,
    origin: (origin, callback) => {
      const normalizedOrigin = origin?.replace(/\/+$/, "");
      const isLocalPreview = Boolean(
        normalizedOrigin &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(normalizedOrigin),
      );
      if (!origin || isLocalPreview || configuredOrigins.includes(normalizedOrigin ?? "")) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
