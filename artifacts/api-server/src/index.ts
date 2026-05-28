import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runPush } from "./routes/asana";
import { runClickUpPush } from "./routes/clickup";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db";
import { eq, and, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Ensure the connect-pg-simple session table exists before the server starts.
// We create it inline because the SQL file from the package is not available
// in the esbuild bundle.
async function ensureSessionTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid"    VARCHAR NOT NULL,
      "sess"   JSON    NOT NULL,
      "expire" TIMESTAMP(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `);
}

ensureSessionTable()
  .then(() => {
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }
      logger.info({ port }, "Server listening");
    });
  })
  .catch((err) => {
    logger.error({ err }, "Failed to ensure session table — aborting startup");
    process.exit(1);
  });

// ── Midnight Asana push ────────────────────────────────────────────────────
// Runs at 00:00 every day (server local time / UTC).
cron.schedule("0 0 * * *", async () => {
  logger.info("Midnight Asana push: starting");
  try {
    const result = await runPush();
    logger.info(result, "Midnight Asana push: complete");
  } catch (err) {
    logger.error({ err }, "Midnight Asana push: failed (Asana may not be configured)");
  }
});

// ── Midnight ClickUp sync ─────────────────────────────────────────────────
// Runs at 00:05 every day to keep ClickUp in sync with local changes.
cron.schedule("5 0 * * *", async () => {
  logger.info("Midnight ClickUp sync: starting");
  try {
    const result = await runClickUpPush();
    logger.info(result, "Midnight ClickUp sync: complete");
  } catch (err) {
    logger.error({ err }, "Midnight ClickUp sync: failed (ClickUp may not be configured)");
  }
});

// ── Daily task reset ──────────────────────────────────────────────────────
// Runs at 12:01am every day. Resets all pinned (daily) tasks that are not
// already "Not Started" back to "Not Started" so they appear fresh each day.
cron.schedule("1 0 * * *", async () => {
  logger.info("Daily task reset: starting");
  try {
    const result = await db
      .update(tasksTable)
      .set({ status: "Not Started" })
      .where(
        and(
          eq(tasksTable.is_pinned, true),
          ne(tasksTable.status, "Not Started"),
        )
      )
      .returning({ id: tasksTable.id });
    logger.info({ count: result.length }, "Daily task reset: complete");
  } catch (err) {
    logger.error({ err }, "Daily task reset: failed");
  }
});
