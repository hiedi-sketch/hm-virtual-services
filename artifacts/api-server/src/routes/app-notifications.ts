import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { appNotificationsTable, tasksTable, clientsTable, usersTable } from "@workspace/db";
import { eq, and, lt, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { createNotification } from "../lib/notify";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().split("T")[0]!;
}

// GET /api/app-notifications — list for current user
router.get("/app-notifications", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  const limit = Math.min(Number(req.query["limit"] ?? 50), 100);

  const rows = await db
    .select()
    .from(appNotificationsTable)
    .where(eq(appNotificationsTable.user_id, userId))
    .orderBy(desc(appNotificationsTable.created_at))
    .limit(limit);

  const unreadCount = rows.filter(r => !r.is_read).length;
  res.json({ notifications: rows, unreadCount });
});

// PATCH /api/app-notifications/read-all — mark all as read for current user
router.patch("/app-notifications/read-all", requireAuth, async (req, res) => {
  const userId = req.session.user!.id;
  await db
    .update(appNotificationsTable)
    .set({ is_read: true })
    .where(and(
      eq(appNotificationsTable.user_id, userId),
      eq(appNotificationsTable.is_read, false)
    ));
  res.json({ ok: true });
});

// PATCH /api/app-notifications/:id/read — mark single notification as read
router.patch("/app-notifications/:id/read", requireAuth, async (req, res) => {
  const id = parseInt(req.params["id"]!);
  const userId = req.session.user!.id;
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  await db
    .update(appNotificationsTable)
    .set({ is_read: true })
    .where(and(
      eq(appNotificationsTable.id, id),
      eq(appNotificationsTable.user_id, userId)
    ));
  res.json({ ok: true });
});

// POST /api/app-notifications/scan — create notifications for newly overdue tasks
// Called on load of the notifications page; dedupes so it's safe to call repeatedly
router.post("/app-notifications/scan", requireAuth, async (req, res) => {
  const user = req.session.user!;
  // Only admins and team members use this
  if (user.role === "client") { res.json({ created: 0 }); return; }

  const today = todayStr();

  // Find overdue pending tasks
  let taskQuery = db
    .select({
      id: tasksTable.id,
      title: tasksTable.title,
      due_date: tasksTable.due_date,
      client_name: clientsTable.name,
      assigned_to: tasksTable.assigned_to,
    })
    .from(tasksTable)
    .leftJoin(clientsTable, eq(tasksTable.client_id, clientsTable.id))
    .where(and(
      eq(tasksTable.status, "Pending"),
      lt(tasksTable.due_date, today)
    ));

  const overdueTasks = await taskQuery;

  // Get all admin IDs (we'll notify all admins)
  const admins = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));

  let created = 0;
  for (const task of overdueTasks) {
    const daysLate = Math.floor(
      (Date.now() - new Date(task.due_date! + "T00:00:00").getTime()) / 86_400_000
    );
    const message = `"${task.title}" ${task.client_name ? `for ${task.client_name} ` : ""}was due ${daysLate}d ago.`;

    for (const admin of admins) {
      const existing = await db
        .select({ id: appNotificationsTable.id })
        .from(appNotificationsTable)
        .where(and(
          eq(appNotificationsTable.user_id, admin.id),
          eq(appNotificationsTable.type, "overdue_task"),
          eq(appNotificationsTable.entity_type, "task"),
          eq(appNotificationsTable.entity_id, task.id)
        ))
        .limit(1);

      if (existing.length === 0) {
        await createNotification({
          userId: admin.id,
          type: "overdue_task",
          title: `Overdue task: ${task.title}`,
          message,
          entityType: "task",
          entityId: task.id,
        });
        created++;
      }
    }

    // Also notify the assigned team member if different from admins
    if (task.assigned_to) {
      const [member] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.name, task.assigned_to))
        .limit(1);

      if (member && !admins.find(a => a.id === member.id)) {
        const existing = await db
          .select({ id: appNotificationsTable.id })
          .from(appNotificationsTable)
          .where(and(
            eq(appNotificationsTable.user_id, member.id),
            eq(appNotificationsTable.type, "overdue_task"),
            eq(appNotificationsTable.entity_type, "task"),
            eq(appNotificationsTable.entity_id, task.id)
          ))
          .limit(1);

        if (existing.length === 0) {
          await createNotification({
            userId: member.id,
            type: "overdue_task",
            title: `Overdue task: ${task.title}`,
            message,
            entityType: "task",
            entityId: task.id,
          });
          created++;
        }
      }
    }
  }

  res.json({ created, scanned: overdueTasks.length });
});

export default router;
