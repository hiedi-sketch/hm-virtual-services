import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { invoicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { isSquareConfigured, createSquarePaymentLink } from "../lib/squareClient";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/square/config", requireAuth, async (_req, res) => {
  res.json({ enabled: isSquareConfigured() });
});

router.post("/square/checkout/:invoiceId", requireAuth, async (req, res) => {
  const invoiceId = Number(req.params["invoiceId"]);
  if (!invoiceId || isNaN(invoiceId)) {
    res.status(400).json({ error: "Invalid invoice id" });
    return;
  }

  const [invoice] = await db.select().from(invoicesTable).where(eq(invoicesTable.id, invoiceId));
  if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }
  if (invoice.status === "paid") { res.status(400).json({ error: "Invoice is already paid" }); return; }

  const origin = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
  try {
    const { url, orderId } = await createSquarePaymentLink({
      amountDollars: invoice.amount,
      name: `Invoice #${invoice.id}`,
      invoiceId: invoice.id,
      successUrl: `${origin}/invoices?payment=success&invoice=${invoice.id}`,
    });
    // Store the Square order_id so we can match payment webhook events back to this invoice
    await db
      .update(invoicesTable)
      .set({ square_invoice_id: orderId } as any)
      .where(eq(invoicesTable.id, invoiceId));
    logger.info({ invoiceId, orderId }, "[Square] Payment link created, order_id stored");
    res.json({ url });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Square error" });
  }
});

export default router;
