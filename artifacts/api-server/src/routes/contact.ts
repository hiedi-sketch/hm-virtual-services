import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { leadsTable } from "@workspace/db";
import { z } from "zod";

const router: IRouter = Router();

const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  business_name: z.string().optional(),
  phone: z.string().optional(),
  message: z.string().min(1, "Message is required"),
});

/** POST /api/contact — public endpoint, no auth required */
router.post("/contact", async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.errors[0]?.message ?? "Invalid input" });
    return;
  }

  const { name, email, business_name, phone, message } = parsed.data;

  const [lead] = await db.insert(leadsTable).values({
    name,
    email,
    business_name: business_name ?? null,
    phone: phone ?? null,
    notes: message,
    lead_source: "Website Contact Form",
    status: "new",
  }).returning();

  res.status(201).json({ success: true, id: lead?.id });
});

export default router;
