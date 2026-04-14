import app from "./app";
import { logger } from "./lib/logger";
import cron from "node-cron";
import { runPush } from "./routes/asana";
import { runClickUpPush } from "./routes/clickup";

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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
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
