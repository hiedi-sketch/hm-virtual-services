import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();

router.get("/audit", requireAdmin, async (_req, res) => {
  const logs = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.created_at))
    .limit(100);

  res.json(logs);
});

export default router;
