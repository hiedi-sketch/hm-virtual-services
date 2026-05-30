import { db } from "@workspace/db";
import { appNotificationsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

export type NotifyType =
  | "overdue_task"
  | "service_request"
  | "invoice_created"
  | "invoice_updated"
  | "invoice_sent"
  | "invoice_reminder"
  | "task_assigned"
  | "task_comment"
  | "new_message"
  | "task_reset";

interface CreateNotificationOpts {
  userId: number;
  type: NotifyType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: number;
  /** If true, skip insert if a notification with same type+entityType+entityId already exists for this user */
  dedupeEntity?: boolean;
}

export async function createNotification(opts: CreateNotificationOpts): Promise<void> {
  try {
    if (opts.dedupeEntity && opts.entityType && opts.entityId != null) {
      const existing = await db
        .select({ id: appNotificationsTable.id })
        .from(appNotificationsTable)
        .where(
          and(
            eq(appNotificationsTable.user_id, opts.userId),
            eq(appNotificationsTable.type, opts.type),
            eq(appNotificationsTable.entity_type, opts.entityType),
            eq(appNotificationsTable.entity_id, opts.entityId)
          )
        )
        .limit(1);
      if (existing.length > 0) return;
    }

    await db.insert(appNotificationsTable).values({
      user_id: opts.userId,
      type: opts.type,
      title: opts.title,
      message: opts.message,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      is_read: false,
    });
  } catch { /* fire-and-forget — never let notification errors break the main flow */ }
}

/** Notify all admin users */
export async function notifyAdmins(opts: Omit<CreateNotificationOpts, "userId">): Promise<void> {
  try {
    const admins = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.role, "admin"));
    await Promise.all(admins.map(a => createNotification({ ...opts, userId: a.id })));
  } catch { /* ignore */ }
}

/** Notify the portal user(s) linked to a given clientId */
export async function notifyClientUser(
  clientId: number,
  opts: Omit<CreateNotificationOpts, "userId">
): Promise<void> {
  try {
    const clientUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.role, "client"), eq(usersTable.client_id, clientId)));
    await Promise.all(clientUsers.map(u => createNotification({ ...opts, userId: u.id })));
  } catch { /* ignore */ }
}
