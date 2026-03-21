import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUncachableStripeClient, getStripePublishableKey } from "../lib/stripeClient";
import { requireAuth } from "../middleware/auth";

const router: IRouter = Router();

// Return the publishable key so the frontend can confirm Stripe is configured
router.get("/stripe/config", requireAuth, async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey, enabled: true });
  } catch {
    res.json({ publishableKey: null, enabled: false });
  }
});

// Create a Stripe Checkout session for a single invoice
router.post("/stripe/checkout/:invoiceId", requireAuth, async (req, res) => {
  const invoiceId = Number(req.params["invoiceId"]);
  if (!invoiceId || isNaN(invoiceId)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) {
    res.status(404).json({ error: "Invoice not found" });
    return;
  }
  if (invoice.status === "paid") {
    res.status(400).json({ error: "Invoice is already paid" });
    return;
  }

  const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(invoice.amount * 100),
            product_data: {
              name: `Invoice #${invoice.id}`,
              description: invoice.description ?? `Payment due ${invoice.due_date}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { invoice_id: String(invoice.id) },
      success_url: `${origin}/?payment=success&invoice=${invoice.id}`,
      cancel_url: `${origin}/?payment=cancelled&invoice=${invoice.id}`,
    });

    res.json({ url: session.url });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Stripe error" });
  }
});

export default router;
