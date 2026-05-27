import { pgTable, serial, integer, text, real, boolean } from "drizzle-orm/pg-core";

export const transactionImportsTable = pgTable("transaction_imports", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  filename: text("filename").notNull(),
  date_range_start: text("date_range_start"),
  date_range_end: text("date_range_end"),
  imported_at: text("imported_at").notNull(),
  row_count: integer("row_count").notNull().default(0),
});

export type TransactionImport = typeof transactionImportsTable.$inferSelect;

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  client_id: integer("client_id").notNull(),
  import_id: integer("import_id").notNull(),
  date: text("date"),
  transaction_type: text("transaction_type"),
  num: text("num"),
  name: text("name"),
  memo: text("memo"),
  account: text("account"),
  amount: real("amount"),
  is_uncategorized: boolean("is_uncategorized").notNull().default(false),
});

export type Transaction = typeof transactionsTable.$inferSelect;
