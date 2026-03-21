import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc, inArray } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Full audit trail — admin only, returns last 100 entries across all entity types
router.get("/audit", requireAdmin, async (_req, res) => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.created_at))
    .limit(100);

  res.json(logs);
});

// Activity feed — any authenticated user, filtered to task/invoice/time_entry, capped at 50
router.get("/activity-feed", requireAuth, async (_req, res) => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .where(inArray(auditLogsTable.entity_type, ["task", "invoice", "time_entry"]))
    .orderBy(desc(auditLogsTable.created_at))
    .limit(50);

  res.json(logs);
});

export default router;
