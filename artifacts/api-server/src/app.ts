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
import storeWebhookRouter from "./routes/store-webhook";

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
app.use(cors({ credentials: true, origin: true }));
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
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
    } catch {
      req.log.warn("Stripe webhook rejected");
      res.status(400).json({ error: "Webhook Stripe invalide." });
    }
  },
);
app.use(storeWebhookRouter);
const defaultJsonParser = express.json();
// Parse large Shop photo bodies only AFTER its existing administrator guard.
app.use((req, res, next) => req.path === "/api/shop/admin/photos" ? next() : defaultJsonParser(req, res, next));
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
