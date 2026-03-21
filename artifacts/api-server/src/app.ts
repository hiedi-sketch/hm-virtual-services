import express, { type Express } from "express";
import cors from "cors";
import session from "express-session";
import bcrypt from "bcryptjs";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";

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

export default app;
