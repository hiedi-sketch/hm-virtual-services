import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

export type EntityType = "task" | "time_entry" | "invoice" | "lead";
export type AuditAction = "created" | "updated" | "deleted";

export interface AuditActor {
  id?: number;
  name?: string | null;
}

export async function logAudit(
  entity_type: EntityType,
  entity_id: number,
  action: AuditAction,
  summary: string,
  actor?: AuditActor
): Promise<void> {
  try {
    const created_at = new Date().toISOString();
    await db.insert(auditLogsTable).values({
      entity_type,
      entity_id,
      action,
      summary,
      user_id: actor?.id ?? null,
      user_name: actor?.name ?? null,
      created_at,
    });

    // Fire-and-forget cleanup: delete entries older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    db.delete(auditLogsTable)
      .where(lt(auditLogsTable.created_at, cutoff))
      .catch(() => {});
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
  }
}
