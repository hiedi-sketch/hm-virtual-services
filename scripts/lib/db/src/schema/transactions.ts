import { pgTable, serial, integer, text, real, boolean } from "drizzle-orm/pg-core";

export const transactionImportsTable = pgTable("transaction_imports", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  filename: text("filename").notNull(),
  date_range_start: text("date_range_start"),
  date_range_end: text("date_range_end"),
  imported_at: text("imported_at").notNull(),
  row_count: integer("row_count").notNull().default(0),
  /** Source of import: 'csv_upload' or 'qbo_sync' */
  source: text("source").default("csv_upload"),
  /** QBO realm ID this sync came from (null for CSV uploads) */
  realm_id: text("realm_id"),
  /** QBO sync date range start */
  sync_start: text("sync_start"),
  /** QBO sync date range end */
  sync_end: text("sync_end"),
});

export type TransactionImport = typeof transactionImportsTable.$inferSelect;

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  import_id: integer("import_id").notNull(),
  // Core QBO fields
  date: text("date"),
  transaction_type: text("transaction_type"),
  num: text("num"),
  name: text("name"),
  memo: text("memo"),
  account: text("account"),
  category: text("category"),
  amount: real("amount"),
  is_uncategorized: boolean("is_uncategorized").notNull().default(false),
  // Review workflow
  status: text("status").notNull().default("uncategorized"),
  flagged_question: text("flagged_question"),
  question_sent_at: text("question_sent_at"),
  routed_to_channel: text("routed_to_channel"),
  client_response: text("client_response"),
  response_received_at: text("response_received_at"),
  internal_notes: text("internal_notes"),
  resolved_at: text("resolved_at"),
  // QBO write-back
  qbo_txn_id: text("qbo_txn_id"),
  qbo_txn_type: text("qbo_txn_type"),
  qbo_account_id: text("qbo_account_id"),
  qbo_last_synced_at: text("qbo_last_synced_at"),
  qbo_pending: boolean("qbo_pending").notNull().default(false),
});

export type Transaction = typeof transactionsTable.$inferSelect;
