import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { serviceRequestsTable, usersTable, clientsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { sendMail, template } from "../lib/mailer";

const router: IRouter = Router();

const createSchema = z.object({
  type: z.enum(["new_service", "upgrade_package", "consultation", "other"]),
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(2000),
});

const TYPE_LABELS: Record<string, string> = {
  new_service: "New Service Request",
  upgrade_package: "Upgrade Package",
  consultation: "Schedule Consultation",
  other: "General Inquiry",
};

// Clients: list their own requests
// Admin/team: no access here (admins can see via a future admin view)
router.get("/service-requests", requireAuth, async (req, res) => {
  const user = req.session.user!;
  if (user.role !== "client" || !user.client_id) {
    res.status(403).json({ error: "Client access only" });
    return;
  }

  const rows = await db
    .select()
    .from(serviceRequestsTable)
    .where(eq(serviceRequestsTable.client_id, user.client_id))
    .orderBy(desc(serviceRequestsTable.created_at));

  res.json(rows);
});

// Clients: submit a new service request
router.post("/service-requests", requireAuth, async (req, res) => {
  const user = req.session.user!;
  if (user.role !== "client" || !user.client_id) {
    res.status(403).json({ error: "Client access only" });
    return;
  }

  const body = createSchema.safeParse(req.body);
  if (!body.success) {
    const msg = body.error.errors[0]?.message ?? "Invalid request";
    res.status(400).json({ error: msg });
    return;
  }

  const [record] = await db
    .insert(serviceRequestsTable)
    .values({
      client_id: user.client_id,
      type: body.data.type,
      subject: body.data.subject,
      message: body.data.message,
      status: "pending",
    })
    .returning();

  // Notify admins via email (fire-and-forget)
  (async () => {
    try {
      const admins = await db
        .select({ email: usersTable.email, name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.role, "admin"));

      const [clientRecord] = await db
        .select({ name: clientsTable.name })
        .from(clientsTable)
        .where(eq(clientsTable.id, user.client_id!));

      const clientName = clientRecord?.name ?? user.name;
      const typeLabel = TYPE_LABELS[body.data.type] ?? body.data.type;

      for (const admin of admins) {
        if (!admin.email) continue;
        await sendMail(
          admin.email,
          `[Flowstate] New ${typeLabel} from ${clientName}`,
          template(`
            <p>Hi ${admin.name},</p>
            <p>A client has submitted a new service request:</p>
            <div style="margin:16px 0;padding:16px;background:#f8fafc;border-left:4px solid #6366f1;border-radius:4px;">
              <p style="margin:0;font-size:13px;font-weight:600;text-transform:uppercase;color:#6366f1;">${typeLabel}</p>
              <p style="margin:8px 0 0;font-size:17px;font-weight:600;color:#1e293b;">${body.data.subject}</p>
              <p style="margin:8px 0 0;color:#475569;">${body.data.message}</p>
            </div>
            <p><strong>From:</strong> ${clientName} (${user.email})</p>
            <p style="color:#64748b;">Log in to Flowstate to review and respond.</p>
          `)
        );
      }
    } catch { /* ignore */ }
  })();

  res.status(201).json(record);
});

export default router;
