import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import { transactionsTable, transactionImportsTable, clientsTable, fileUploadsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { sendMail, template } from "../lib/mailer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// Column name aliases — case-insensitive matching is used, so only one case needed per variant.
// Covers QBO exports, Chase, Bank of America, Wells Fargo, and common bank/accounting formats.
const COL_DATE = [
  "date", "transaction date", "posted date", "posting date", "trans date",
  "effective date", "value date", "settlement date",
];
const COL_TYPE = ["transaction type", "type", "transaction_type", "trans type"];
const COL_NUM  = ["num", "check number", "check #", "ref no.", "reference", "ref", "check no"];
const COL_NAME = ["name", "payee", "vendor", "from/to", "payee name", "description", "merchant"];
const COL_MEMO = [
  "memo/description", "memo", "description", "bank description", "transaction description",
  "details", "narrative", "particulars", "remarks",
];
const COL_ACCT     = ["account", "account name", "account number"];
const COL_CATEGORY = ["match/categorize", "category", "split", "qbo match"];
// Single combined amount column (positive = credit, negative = debit)
const COL_AMT = ["amount", "transaction amount", "net amount", "total amount", "tran amount"];
// Separate debit/credit columns — covers Chase (Spent/Received), QBO, and many banks
const COL_DEBIT  = [
  "debit", "spent", "withdrawal", "withdrawals", "charges", "charge",
  "debit amount", "withdrawal amount", "amount debit", "dr", "dr.", "money out",
  "payment out", "out", "paid out",
];
const COL_CREDIT = [
  "credit", "received", "deposit", "deposits", "payments", "payment",
  "credit amount", "deposit amount", "amount credit", "cr", "cr.", "money in",
  "payment in", "in", "received in",
];

// Normalize a row so all keys are trimmed and lowercased for consistent matching.
function normalizeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k.trim().toLowerCase()] = v;
  }
  return out;
}

// Pick the first non-empty value from a normalized (lowercased-key) row.
function pick(row: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function parseAmount(val: string | null): number | null {
  if (!val) return null;
  // Strip currency symbols, commas, spaces; convert parentheses to negative sign
  const cleaned = val.replace(/[$£€,\s]/g, "").replace(/^\((.+)\)$/, "-$1");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// Resolve the net amount from a row, handling both combined and split debit/credit columns.
function resolveAmount(row: Record<string, any>): number | null {
  // Try combined amount column first
  const combined = pick(row, COL_AMT);
  if (combined !== null) return parseAmount(combined);

  // Try split debit / credit columns
  const debit  = parseAmount(pick(row, COL_DEBIT));
  const credit = parseAmount(pick(row, COL_CREDIT));

  // Some banks put 0.00 in the unused column — treat zero as absent
  if (credit !== null && credit !== 0) return Math.abs(credit);   // credit = positive
  if (debit  !== null && debit  !== 0) return -Math.abs(debit);   // debit  = negative
  return null;
}

function parseRows(buffer: Buffer, filename: string): Record<string, any>[] {
  const isXlsx = /\.(xlsx|xls)$/i.test(filename);
  const wb = XLSX.read(buffer, { type: "buffer", raw: !isXlsx });
  const ws = wb.Sheets[wb.SheetNames[0]!];
  const raw = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
  // Normalize all column header keys: trim whitespace and lowercase so matching is case-insensitive
  return raw.map(normalizeRow);
}

// GET /api/transactions?client_id=X
router.get("/transactions", requireAdmin, async (req, res) => {
  const clientId = Number(req.query.client_id);
  if (!clientId) return res.status(400).json({ error: "client_id required" });

  const imports = await db
    .select()
    .from(transactionImportsTable)
    .where(eq(transactionImportsTable.client_id, clientId))
    .orderBy(transactionImportsTable.id);

  if (imports.length === 0) {
    return res.json({ imports: [], transactions: [] });
  }

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.client_id, clientId))
    .orderBy(transactionsTable.import_id, transactionsTable.id);

  res.json({ imports, transactions: txs });
});

// PATCH /api/transactions/:id
router.patch("/transactions/:id", requireAdmin, async (req, res) => {
  const txId = Number(req.params.id);
  if (!txId) return res.status(400).json({ error: "Invalid id" });

  const {
    status,
    memo,
    account,
    category,
    internal_notes,
    flagged_question,
    send_question,
    client_response,
    resolve,
    flagged_for_client,
  } = req.body as {
    status?: string;
    memo?: string;
    account?: string;
    category?: string;
    internal_notes?: string;
    flagged_question?: string;
    send_question?: boolean;
    client_response?: string;
    resolve?: boolean;
    flagged_for_client?: boolean;
  };

  const updates: Record<string, any> = {};

  if (status !== undefined)              updates.status = status;
  if (internal_notes !== undefined)      updates.internal_notes = internal_notes;
  if (flagged_question !== undefined)    updates.flagged_question = flagged_question;
  if (account !== undefined)             updates.account = account;
  if (flagged_for_client !== undefined)  updates.flagged_for_client = flagged_for_client;

  if (memo !== undefined)     updates.memo = memo;
  if (category !== undefined) { updates.category = category; updates.is_uncategorized = !category; }

  if (send_question) {
    const [tx] = await db
      .select({ client_id: transactionsTable.client_id })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txId));
    if (tx) {
      const [client] = await db
        .select({ preferred_channel: clientsTable.preferred_channel })
        .from(clientsTable)
        .where(eq(clientsTable.id, tx.client_id));
      updates.routed_to_channel = client?.preferred_channel ?? "dashboard";
    }
    updates.question_sent_at   = new Date().toISOString();
    updates.status             = "awaiting_response";
  }

  if (client_response !== undefined) {
    updates.client_response      = client_response;
    updates.response_received_at = new Date().toISOString();
    updates.status               = "responded";
  }

  if (resolve) {
    updates.status      = "resolved";
    updates.resolved_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields to update" });
  }

  const [updated] = await db
    .update(transactionsTable)
    .set(updates)
    .where(eq(transactionsTable.id, txId))
    .returning();

  res.json(updated);
});

// POST /api/transactions/batch-send
// Marks all listed "needs_info" transactions as "awaiting_response", stamps send metadata, and emails the client.
router.post("/transactions/batch-send", requireAdmin, async (req, res) => {
  const { client_id, transaction_ids, note } = req.body as {
    client_id?: number;
    transaction_ids?: number[];
    note?: string;
  };

  if (!client_id || !Array.isArray(transaction_ids) || transaction_ids.length === 0) {
    return res.status(400).json({ error: "client_id and transaction_ids required" });
  }

  const [client] = await db
    .select({
      preferred_channel: clientsTable.preferred_channel,
      email:             clientsTable.email,
      name:              clientsTable.name,
      contact_name:      clientsTable.contact_name,
    })
    .from(clientsTable)
    .where(eq(clientsTable.id, client_id));

  const channel   = client?.preferred_channel ?? "dashboard";
  const sentAt    = new Date().toISOString();
  const now       = new Date();
  const monthYear = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Fetch the transaction rows so we can include them in the email
  const txRows = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.client_id, client_id),
      inArray(transactionsTable.id, transaction_ids),
    ));

  // Update all flagged transactions
  const updated = [];
  for (const txId of transaction_ids) {
    const [row] = await db
      .update(transactionsTable)
      .set({
        status:             "awaiting_response",
        question_sent_at:   sentAt,
        routed_to_channel:  channel,
        flagged_for_client: false,
      })
      .where(and(eq(transactionsTable.id, txId), eq(transactionsTable.client_id, client_id)))
      .returning();
    if (row) updated.push(row);
  }

  // ── Send email ────────────────────────────────────────────────────────────
  let emailSent  = false;
  let emailError = "";

  if (client?.email) {
    const firstName  = (client.contact_name ?? client.name ?? "").split(" ")[0] || "there";
    const count      = txRows.length;
    const portalLink = "https://hmvirtualservices.com/client/transactions";

    const txListHtml = txRows.map(tx => {
      const amt = tx.amount != null
        ? `$${Math.abs(tx.amount).toFixed(2)}${tx.amount < 0 ? " (credit)" : ""}`
        : "—";
      let date = "—";
      if (tx.date) {
        // Handle both YYYY-MM-DD and MM/DD/YYYY formats
        const d = tx.date.includes("/") ? new Date(tx.date) : new Date(tx.date + "T00:00:00");
        date = isNaN(d.getTime()) ? tx.date : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
      const description = tx.memo || tx.name || "—";
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#475569;">${date}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:500;">${description}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:600;text-align:right;">${amt}</td>
        </tr>`;
    }).join("");

    const noteHtml = note
      ? `<p style="margin:0 0 20px;padding:14px 16px;background:#f1f5f9;border-left:3px solid #266b75;border-radius:4px;color:#475569;font-size:14px;">${note}</p>`
      : "";

    const body = `
      ${noteHtml}
      <p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#1e293b;">Hi ${firstName},</p>
      <p style="margin:0 0 20px;color:#475569;font-size:15px;line-height:1.6;">
        We have <strong>${count} transaction${count === 1 ? "" : "s"}</strong> from your QuickBooks account that need your attention.
        Please log in to your client portal to review and respond.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:24px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Date</th>
            <th style="padding:10px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Vendor / Description</th>
            <th style="padding:10px 12px;text-align:right;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;border-bottom:1px solid #e2e8f0;">Amount</th>
          </tr>
        </thead>
        <tbody>${txListHtml}</tbody>
      </table>
      <p style="margin:0 0 24px;color:#64748b;font-size:14px;">
        Log in to see our specific questions about each transaction and submit your responses.
      </p>
      <p style="margin:0 0 32px;text-align:center;">
        <a href="${portalLink}" style="display:inline-block;background:#266b75;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:8px;letter-spacing:-0.2px;">
          Review Transactions →
        </a>
      </p>
      <p style="margin:0;color:#64748b;font-size:14px;line-height:1.6;">
        Thank you,<br>
        <strong style="color:#1e293b;">Hiedi</strong><br>
        HM Virtual Services
      </p>`;

    try {
      await sendMail(
        client.email,
        `Action Needed: Transaction Review — ${monthYear}`,
        template(body),
      );
      emailSent = true;
    } catch (err: any) {
      emailError = err?.message ?? "Email send failed";
    }
  }

  res.json({ ok: true, updated, channel, sentAt, emailSent, emailAddress: client?.email ?? null, emailError: emailError || undefined });
});

// GET /api/transactions/my-flagged
// Client-facing: returns this client's "awaiting_response" transactions
router.get("/transactions/my-flagged", requireAuth, async (req, res) => {
  const user = req.session.user!;
  if (user.role !== "client" || !user.client_id) {
    return res.status(403).json({ error: "Client access only" });
  }

  const txs = await db
    .select()
    .from(transactionsTable)
    .where(and(
      eq(transactionsTable.client_id, user.client_id),
      eq(transactionsTable.status, "awaiting_response"),
    ))
    .orderBy(transactionsTable.date, transactionsTable.id);

  res.json({ transactions: txs });
});

// PATCH /api/transactions/:id/respond
// Client-facing: submit a response (+ optional comment + optional receipt) to a flagged transaction
router.patch("/transactions/:id/respond", requireAuth, receiptUpload.single("receipt"), async (req, res) => {
  const user = req.session.user!;
  if (user.role !== "client" || !user.client_id) {
    return res.status(403).json({ error: "Client access only" });
  }

  const txId = Number(req.params.id);
  if (isNaN(txId)) return res.status(400).json({ error: "Invalid id" });

  const response = typeof req.body.response === "string" ? req.body.response.trim() : "";
  const comment  = typeof req.body.comment  === "string" ? req.body.comment.trim()  : "";
  if (!response) return res.status(400).json({ error: "Response text required" });

  let receiptUrl: string | null = null;
  if (req.file) {
    const ext = req.file.mimetype === "application/pdf" ? ".pdf"
              : req.file.mimetype === "image/png"       ? ".png"
              : ".jpg";
    const filename   = `receipt_${randomUUID()}${ext}`;
    const uploadsDir = path.resolve(process.cwd(), "uploads");
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    await fs.promises.writeFile(path.join(uploadsDir, filename), req.file.buffer);
    receiptUrl = `/api/transactions/receipt/${filename}`;
  }

  const [updated] = await db
    .update(transactionsTable)
    .set({
      client_response:      response,
      client_comment:       comment || null,
      receipt_url:          receiptUrl,
      response_received_at: new Date().toISOString(),
      status:               "responded",
    })
    .where(and(
      eq(transactionsTable.id, txId),
      eq(transactionsTable.client_id, user.client_id),
      eq(transactionsTable.status, "awaiting_response"),
    ))
    .returning();

  if (!updated) return res.status(404).json({ error: "Transaction not found or already responded" });

  res.json(updated);
});

// POST /api/transactions/:id/receipt — admin uploads a receipt, auto-adds to client Documents
router.post("/transactions/:id/receipt", requireAdmin, receiptUpload.single("file"), async (req, res) => {
  const txId = Number(req.params.id);
  if (isNaN(txId)) return res.status(400).json({ error: "Invalid id" });
  if (!req.file)   return res.status(400).json({ error: "No file provided" });

  const user = req.session.user!;

  const [tx] = await db
    .select({ client_id: transactionsTable.client_id })
    .from(transactionsTable)
    .where(eq(transactionsTable.id, txId));
  if (!tx) return res.status(404).json({ error: "Transaction not found" });

  const ext = req.file.mimetype === "application/pdf" ? ".pdf"
            : req.file.mimetype === "image/png"       ? ".png"
            : ".jpg";
  const filename   = `receipt_${randomUUID()}${ext}`;
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  await fs.promises.mkdir(uploadsDir, { recursive: true });
  await fs.promises.writeFile(path.join(uploadsDir, filename), req.file.buffer);

  const [fileRecord] = await db
    .insert(fileUploadsTable)
    .values({
      client_id:            tx.client_id,
      uploaded_by_user_id:  user.id,
      original_name:        req.file.originalname || `receipt${ext}`,
      stored_name:          filename,
      mimetype:             req.file.mimetype,
      size_bytes:           req.file.size,
    })
    .returning();

  const receiptUrl = `/api/uploads/${fileRecord.id}/download`;
  const [updated] = await db
    .update(transactionsTable)
    .set({ receipt_url: receiptUrl })
    .where(eq(transactionsTable.id, txId))
    .returning();

  res.json({ transaction: updated, upload: fileRecord });
});

// GET /api/transactions/receipt/:filename
// Serve a client-uploaded receipt file. Accessible by authenticated users (admin sees all, client sees own).
router.get("/transactions/receipt/:filename", requireAuth, async (req, res) => {
  const { filename } = req.params;
  if (!filename || /[/\\]/.test(filename)) return res.status(400).json({ error: "Invalid filename" });

  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const filePath   = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Receipt not found" });

  const ext     = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
  };
  res.setHeader("Content-Type", mimeMap[ext] ?? "application/octet-stream");
  res.sendFile(filePath);
});

// POST /api/transactions/upload
router.post("/transactions/upload", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const clientId = Number(req.body.client_id);
  if (!clientId) return res.status(400).json({ error: "client_id required" });

  let rows: Record<string, any>[];
  try {
    rows = parseRows(req.file.buffer, req.file.originalname);
  } catch (err: any) {
    return res.status(422).json({ error: `Could not parse file: ${err.message}` });
  }

  if (rows.length === 0) return res.status(422).json({ error: "File contains no rows" });

  const dates = rows.map(r => pick(r, COL_DATE)).filter(Boolean) as string[];
  const datesSorted = [...dates].sort();
  const dateRangeStart = datesSorted[0] ?? null;
  const dateRangeEnd   = datesSorted[datesSorted.length - 1] ?? null;

  const [importRecord] = await db
    .insert(transactionImportsTable)
    .values({
      client_id: clientId,
      filename: req.file.originalname,
      date_range_start: dateRangeStart,
      date_range_end: dateRangeEnd,
      imported_at: new Date().toISOString(),
      row_count: rows.length,
    })
    .returning();

  const txRows = rows.map(r => {
    const account = pick(r, COL_ACCT);
    return {
      client_id:        clientId,
      import_id:        importRecord.id,
      date:             pick(r, COL_DATE),
      transaction_type: pick(r, COL_TYPE),
      num:              pick(r, COL_NUM),
      name:             pick(r, COL_NAME),
      memo:             pick(r, COL_MEMO),
      account,
      category:         pick(r, COL_CATEGORY) || undefined,
      amount:           resolveAmount(r),
      is_uncategorized: false,
      status:           "needs_info",
    };
  });

  await db.insert(transactionsTable).values(txRows);

  res.json({ ok: true, import: importRecord, count: txRows.length });
});

// DELETE /api/transactions/:id  — delete a single transaction row
router.delete("/transactions/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "Invalid id" });
  await db.delete(transactionsTable).where(eq(transactionsTable.id, id));
  res.json({ ok: true });
});

// DELETE /api/transactions/import/:id
router.delete("/transactions/import/:id", requireAdmin, async (req, res) => {
  const importId = Number(req.params.id);
  await db.delete(transactionsTable).where(eq(transactionsTable.import_id, importId));
  await db.delete(transactionImportsTable).where(eq(transactionImportsTable.id, importId));
  res.json({ ok: true });
});

export default router;
