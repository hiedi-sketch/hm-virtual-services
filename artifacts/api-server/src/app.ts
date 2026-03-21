import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import cron from "node-cron";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { spawnRecurringTasks } from "./lib/spawn-recurring";

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

app.use("/api", router);

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

// Schedule daily at midnight server time
cron.schedule("0 0 * * *", () => {
  logger.info("Running scheduled recurring task spawn");
  spawnRecurringTasks().catch((err) => logger.error({ err }, "Scheduled spawn failed"));
});

export default app;
