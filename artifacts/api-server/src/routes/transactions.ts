import { Router, type IRouter } from "express";
import multer from "multer";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { transactionsTable, transactionImportsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAdmin } from "../middleware/auth";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Column name aliases from QBO exports
const COL_DATE = ["Date", "DATE", "date"];
const COL_TYPE = ["Transaction Type", "Type", "TRANSACTION TYPE", "transaction_type"];
const COL_NUM  = ["Num", "NUM", "num", "Check Number", "Ref No."];
const COL_NAME = ["Name", "NAME", "name", "Payee", "Vendor"];
const COL_MEMO = ["Memo/Description", "Memo", "Description", "MEMO", "memo"];
const COL_ACCT = ["Account", "ACCOUNT", "account", "Category", "Split"];
const COL_AMT  = ["Amount", "AMOUNT", "amount", "Debit", "Credit"];

function pick(row: Record<string, any>, keys: string[]): string | null {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return String(row[k]).trim();
    }
  }
  return null;
}

function parseAmount(val: string | null): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "").replace(/[()]/g, m => m === "(" ? "-" : "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseRows(buffer: Buffer, filename: string): Record<string, any>[] {
  const isXlsx = /\.(xlsx|xls)$/i.test(filename);
  const wb = XLSX.read(buffer, { type: "buffer", raw: !isXlsx });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

// GET /api/transactions?client_id=X
router.get("/api/transactions", requireAdmin, async (req, res) => {
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

// POST /api/transactions/upload
router.post("/api/transactions/upload", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const clientId = Number(req.body.client_id);
  if (!clientId) return res.status(400).json({ error: "client_id required" });

  const overwrite = req.body.overwrite === "true";

  let rows: Record<string, any>[];
  try {
    rows = parseRows(req.file.buffer, req.file.originalname);
  } catch (err: any) {
    return res.status(422).json({ error: `Could not parse file: ${err.message}` });
  }

  if (rows.length === 0) return res.status(422).json({ error: "File contains no rows" });

  // Determine date range from the data
  const dates = rows
    .map(r => pick(r, COL_DATE))
    .filter(Boolean) as string[];
  const datesSorted = [...dates].sort();
  const dateRangeStart = datesSorted[0] ?? null;
  const dateRangeEnd   = datesSorted[datesSorted.length - 1] ?? null;

  // Check for existing import for this client + date range
  const existing = await db
    .select()
    .from(transactionImportsTable)
    .where(
      and(
        eq(transactionImportsTable.client_id, clientId),
        eq(transactionImportsTable.date_range_start, dateRangeStart ?? ""),
        eq(transactionImportsTable.date_range_end, dateRangeEnd ?? ""),
      )
    );

  if (existing.length > 0 && !overwrite) {
    return res.status(409).json({
      conflict: true,
      existing_import: existing[0],
      message: `Transactions for this date range (${dateRangeStart} – ${dateRangeEnd}) have already been uploaded for this client. Confirm to overwrite.`,
    });
  }

  // Delete existing imports+transactions for this client+range if overwriting
  if (existing.length > 0 && overwrite) {
    for (const imp of existing) {
      await db.delete(transactionsTable).where(eq(transactionsTable.import_id, imp.id));
      await db.delete(transactionImportsTable).where(eq(transactionImportsTable.id, imp.id));
    }
  }

  // Create import record
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

  // Insert transactions
  const txRows = rows.map(r => {
    const account = pick(r, COL_ACCT);
    return {
      client_id: clientId,
      import_id: importRecord.id,
      date:             pick(r, COL_DATE),
      transaction_type: pick(r, COL_TYPE),
      num:              pick(r, COL_NUM),
      name:             pick(r, COL_NAME),
      memo:             pick(r, COL_MEMO),
      account:          account,
      amount:           parseAmount(pick(r, COL_AMT)),
      is_uncategorized: !account,
    };
  });

  await db.insert(transactionsTable).values(txRows);

  res.json({ ok: true, import: importRecord, count: txRows.length });
});

// DELETE /api/transactions/import/:id
router.delete("/api/transactions/import/:id", requireAdmin, async (req, res) => {
  const importId = Number(req.params.id);
  await db.delete(transactionsTable).where(eq(transactionsTable.import_id, importId));
  await db.delete(transactionImportsTable).where(eq(transactionImportsTable.id, importId));
  res.json({ ok: true });
});

export default router;
