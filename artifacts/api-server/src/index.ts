import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runPush } from "./routes/asana";
import { runClickUpPush } from "./routes/clickup";
import { db } from "@workspace/db";
import { tasksTable } from "@workspace/db";
import { eq, and, ne, isNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { notifyAdmins } from "./lib/notify";

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
// Runs at 12:01am every day. Resets pinned tasks with no specific per-task
// schedule back to "Not Started". Tasks with reset_interval_hours or
// reset_daily_time set are handled by the per-task scheduler below.
cron.schedule("1 0 * * *", async () => {
  logger.info("Daily task reset (global): starting");
  try {
    const today = new Date().toISOString().split("T")[0]!;
    const result = await db
      .update(tasksTable)
      .set({ status: "Not Started", due_date: today, last_reset_at: new Date() })
      .where(
        and(
          eq(tasksTable.is_pinned, true),
          ne(tasksTable.status, "Not Started"),
          ne(tasksTable.status, "Completed"),
          isNull(tasksTable.reset_interval_hours),
          isNull(tasksTable.reset_daily_time),
        )
      )
      .returning({ id: tasksTable.id, title: tasksTable.title });
    logger.info({ count: result.length }, "Daily task reset (global): complete");
    for (const task of result) {
      await notifyAdmins({
        type: "task_reset",
        title: `Daily task reset: ${task.title}`,
        message: `"${task.title}" was automatically reset to Not Started.`,
        entityType: "task",
        entityId: task.id,
      });
    }
  } catch (err) {
    logger.error({ err }, "Daily task reset (global): failed");
  }
});

// ── Per-task scheduled reset ───────────────────────────────────────────────
// Runs every 5 minutes. Handles two flavours:
//   1. reset_interval_hours — resets when (NOW - last_reset_at) >= N hours
//   2. reset_daily_time     — resets once per day when the clock passes HH:MM
// Only resets tasks that are NOT already "Not Started" or "Completed".
cron.schedule("*/5 * * * *", async () => {
  try {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const currentHHMM = `${hh}:${mm}`;

    // 1. Interval-based tasks: elapsed time >= reset_interval_hours
    const intervalTasks = await db
      .select({ id: tasksTable.id, title: tasksTable.title })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.is_pinned, true),
          ne(tasksTable.status, "Not Started"),
          ne(tasksTable.status, "Completed"),
          sql`${tasksTable.reset_interval_hours} IS NOT NULL`,
          sql`(${tasksTable.last_reset_at} IS NULL OR (NOW() - ${tasksTable.last_reset_at}) >= (${tasksTable.reset_interval_hours} * INTERVAL '1 hour'))`,
        )
      );

    // 2. Daily-time tasks: current time has passed reset_daily_time and hasn't
    //    been reset yet today at that time
    const dailyTimeTasks = await db
      .select({ id: tasksTable.id, title: tasksTable.title })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.is_pinned, true),
          ne(tasksTable.status, "Not Started"),
          ne(tasksTable.status, "Completed"),
          sql`${tasksTable.reset_daily_time} IS NOT NULL`,
          sql`${tasksTable.reset_daily_time} <= ${currentHHMM}`,
          sql`(${tasksTable.last_reset_at} IS NULL OR ${tasksTable.last_reset_at} < (CURRENT_DATE + ${tasksTable.reset_daily_time}::time))`,
        )
      );

    const allTasks = [...intervalTasks, ...dailyTimeTasks];

    for (const task of allTasks) {
      const today = now.toISOString().split("T")[0]!;
      await db
        .update(tasksTable)
        .set({ status: "Not Started", due_date: today, last_reset_at: now })
        .where(eq(tasksTable.id, task.id));

      await notifyAdmins({
        type: "task_reset",
        title: `Task auto-reset: ${task.title}`,
        message: `"${task.title}" was automatically reset to Not Started.`,
        entityType: "task",
        entityId: task.id,
      });

      logger.info({ taskId: task.id, title: task.title }, "Per-task scheduled reset applied");
    }

    if (allTasks.length > 0) {
      logger.info({ count: allTasks.length }, "Per-task scheduled reset: complete");
    }
  } catch (err) {
    logger.error({ err }, "Per-task scheduled reset: failed");
  }
});
