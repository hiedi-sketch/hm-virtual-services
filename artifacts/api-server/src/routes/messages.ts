import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { messagesTable, clientsTable } from "@workspace/db";
import { eq, and, or, desc } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { z } from "zod";

const router: IRouter = Router();

const createMessageSchema = z.object({
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1),
  client_id: z.number().int().positive().optional(),
  parent_id: z.number().int().positive().optional(),
});

// GET /api/messages — list messages for client (their own) or admin (all or by clientId)
router.get("/messages", requireAuth, async (req, res) => {
  const user = req.session.user!;
  const clientIdParam = req.query.clientId ? Number(req.query.clientId) : undefined;

  let whereClause;
  if (user.role === "client") {
    if (!user.client_id) {
      res.json([]);
      return;
    }
    whereClause = eq(messagesTable.client_id, user.client_id);
  } else {
    // admin / team_member
    whereClause = clientIdParam ? eq(messagesTable.client_id, clientIdParam) : undefined;
  }

  const rows = await db
    .select({
      id: messagesTable.id,
      client_id: messagesTable.client_id,
      parent_id: messagesTable.parent_id,
      subject: messagesTable.subject,
      body: messagesTable.body,
      sender_name: messagesTable.sender_name,
      sender_role: messagesTable.sender_role,
      is_read: messagesTable.is_read,
      created_at: messagesTable.created_at,
      client_name: clientsTable.name,
    })
    .from(messagesTable)
    .leftJoin(clientsTable, eq(messagesTable.client_id, clientsTable.id))
    .where(whereClause)
    .orderBy(desc(messagesTable.created_at));

  res.json(rows);
});

// POST /api/messages — send a message
router.post("/messages", requireAuth, async (req, res) => {
  const user = req.session.user!;
  const body = createMessageSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.errors[0]?.message ?? "Invalid request" });
    return;
  }

  let clientId: number;
  if (user.role === "client") {
    if (!user.client_id) {
      res.status(403).json({ error: "No client account linked" });
      return;
    }
    clientId = user.client_id;
  } else {
    // admin/team must specify client_id
    if (!body.data.client_id) {
      res.status(400).json({ error: "client_id is required for admin/team messages" });
      return;
    }
    clientId = body.data.client_id;
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      client_id: clientId,
      parent_id: body.data.parent_id ?? null,
      subject: body.data.subject ?? null,
      body: body.data.body,
      sender_name: user.name,
      sender_role: user.role as "admin" | "team_member" | "client",
      is_read: false,
    })
    .returning();

  res.status(201).json(msg);
});

// PATCH /api/messages/:id/read — mark message as read
router.patch("/messages/:id/read", requireAuth, async (req, res) => {
  const user = req.session.user!;
  const id = Number(req.params.id);

  const [msg] = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.id, id));

  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  // Clients can only mark their own messages read; admins can mark any
  if (user.role === "client" && msg.client_id !== user.client_id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  await db
    .update(messagesTable)
    .set({ is_read: true })
    .where(eq(messagesTable.id, id));

  res.json({ ok: true });
});

export default router;
