import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import cron from "node-cron";
import pinoHttp from "pino-http";
import path from "path";
import fs from "fs";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { spawnRecurringTasks } from "./lib/spawn-recurring";
import { runDailyRecurringInvoices, runDailyReminders } from "./lib/invoice-scheduler";
import { WebhookHandlers } from "./lib/webhookHandlers";
import { invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const app: Express = express();

// ── Stripe webhook: must be registered BEFORE express.json() ─────────────
// Stripe sends a raw Buffer body; express.json() would break signature verification.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0]! : signature;
    try {
      // Let stripe-replit-sync process the webhook for its own sync
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      // Also handle checkout.session.completed to mark invoices as paid.
      // stripe-replit-sync already verified the signature above, so we parse the event
      // directly from the raw body without re-verifying.
      try {
        const rawBody = (req.body as Buffer).toString("utf-8");
        const event = JSON.parse(rawBody) as { type: string; data: { object: Record<string, unknown> } };
        if (event.type === "checkout.session.completed") {
          const session = event.data.object as { metadata?: Record<string, string>; payment_status?: string };
          const invoiceId = Number(session.metadata?.["invoice_id"]);
          if (invoiceId && session.payment_status === "paid") {
            await db.update(invoicesTable).set({ status: "paid" }).where(eq(invoicesTable.id, invoiceId));
            logger.info({ invoiceId }, "Invoice marked paid via Stripe webhook");
          }
        }
      } catch (parseErr) {
        logger.error({ parseErr }, "Failed to parse Stripe event for invoice update");
      }

      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error({ err }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env["SESSION_SECRET"] ?? "flowstate-dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      secure: false,
    },
  }),
);

// Refresh lastActivity timestamp on every authenticated request
app.use((req, _res, next) => {
  if (req.session?.user) {
    req.session.lastActivity = Date.now();
  }
  next();
});

app.use("/api", router);

// Serve the compiled biz-app React frontend for all non-API routes whenever the
// built dist exists. This works in both production deployments and local builds,
// without depending on NODE_ENV being explicitly set.
const frontendPath = path.resolve(process.cwd(), "artifacts/biz-app/dist/public");
if (fs.existsSync(frontendPath)) {
  logger.info({ frontendPath }, "Serving frontend static files");
  app.use(express.static(frontendPath));
  // Express 5 requires a named wildcard or regex — bare "*" is no longer valid.
  app.get(/(.*)/, (_req, res) => {
    res.sendFile(path.join(frontendPath, "index.html"));
  });
}

async function seedAdmin() {
  try {
    const existing = await db.select({ id: usersTable.id }).from(usersTable).limit(1);
    if (existing.length > 0) return;
    const hash = await bcrypt.hash("admin123", 12);
    await db.insert(usersTable).values({
      email: "admin@flowstate.app",
      password_hash: hash,
      name: "Admin",
      role: "admin",
      client_id: null,
    });
    logger.info("Default admin created → admin@flowstate.app / admin123");
  } catch (err) {
    logger.error({ err }, "Failed to seed admin");
  }
}

seedAdmin();

// Run on startup to catch any tasks that became due while the server was down
spawnRecurringTasks().catch((err) => logger.error({ err }, "Startup spawn failed"));
runDailyRecurringInvoices().catch((err) => logger.error({ err }, "Startup recurring invoices failed"));
runDailyReminders().catch((err) => logger.error({ err }, "Startup reminders failed"));

// Schedule daily at midnight server time
cron.schedule("0 0 * * *", () => {
  logger.info("Running scheduled recurring task spawn");
  spawnRecurringTasks().catch((err) => logger.error({ err }, "Scheduled spawn failed"));
  runDailyRecurringInvoices().catch((err) => logger.error({ err }, "Scheduled recurring invoices failed"));
  runDailyReminders().catch((err) => logger.error({ err }, "Scheduled reminders failed"));
});

export default app;
