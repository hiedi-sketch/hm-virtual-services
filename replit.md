# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Business management application for a virtual assistant and bookkeeping business.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TailwindCSS + shadcn/ui

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── biz-app/            # React + Vite frontend (Business Manager)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   └── db/                 # Drizzle ORM schema + DB connection
├── scripts/                # Utility scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Authentication

Session-based authentication with three roles:
- **admin** — Full access to all pages: Dashboard, Clients, Tasks, Time, Invoices, Leads, Team
- **team_member** — Tasks, Time Tracking, Leads only (tasks filtered to assigned_to = user.name)
- **client** — Client Portal view only (tasks/invoices/time filtered to their client_id)

Default admin seeded on first startup: `admin@flowstate.app` / `admin123`

Session managed by `express-session` with cookie-based sessions. `credentials: 'include'` set globally in `customFetch`.
Auth middleware: `requireAuth`, `requireAdmin`, `requireRole(...)` in `artifacts/api-server/src/middleware/auth.ts`.

## Features

### Business Manager App (artifacts/biz-app)

- **Login** — Email/password login form with error handling; shown to all unauthenticated visitors
- **Dashboard** (`/dashboard`) — Client overview with hours used/remaining; admin only
- **Clients** (`/clients`) — Add and view clients (name, email, monthly hour budget, fee, service type); admin only
- **Tasks** (`/tasks`) — Create and manage tasks; team_member sees own assigned tasks; client sees their tasks
- **Time Tracking** (`/time`) — Timer + manual entry; client sees their time only
- **Leads CRM** (`/leads`) — 4-stage pipeline (New/Contacted/Proposal/Closed); admin + team_member
- **Invoices** (`/invoices`) — Full invoice lifecycle: create with line items (service picker + custom), edit, mark as paid (with date/method/notes), void, delete, send via email; status tabs (All/Draft/Sent/Unpaid/Paid/Void/Recurring); draft toggle, PDF download, Stripe pay-by-link; bell icon per invoice opens Reminder Modal; 4-card summary (Paid, Outstanding, Total, Overdue)
- **Recurring Invoices** — Recurring schedules (weekly/monthly/custom) auto-generate invoices daily via cron; `auto_send` flag emails invoice to client when generated; per-schedule active/auto_send toggles; manual "Generate" button per schedule
- **Payment Reminders** — Automated reminders at: due date, 3 days overdue, 5 days overdue, 10 days overdue; deduped in `invoice_reminders` DB table; manual send via bell icon → Reminder Modal; Stripe pay-link embedded in reminder emails
- **Team** (`/team`) — User management (create/edit/delete users, assign roles & client links); admin only
- **Client Portal** — Dedicated portal for client-role users: open tasks, hours used this month (reset-date-aware for VA), unpaid balance, invoice list; shows VA hours reset countdown
- **Monthly VA Hours Reset** — Per-client-service `monthly_hours_reset_day` (1–31) field on VA services; `computeResetWindow()` helper computes last/next reset date; services-hours endpoint filters VA time entries from last reset forward; admin sees "Resets in X days" on VA service cards and client detail; dashboard cards show VA reset countdown; client portal displays reset-window-aware hours + countdown
- **Asana Sync** (`/asana`) — Admin-only page. Connects to a single Asana project via Personal Access Token. Settings (PAT + Project ID) stored in `app_settings` DB table. View tasks (name, due date, assignee), create new tasks, toggle complete/incomplete — all synced to Asana in real time. Filter tabs: All / Active / Completed. Auto-refreshes every 5 minutes. Backend service in `artifacts/api-server/src/services/asana.ts`; routes in `artifacts/api-server/src/routes/asana.ts`.
- **Missive Webhook** — `POST /api/missive-webhook`. Receives Missive conversation webhooks and creates tasks automatically. Security: `x-webhook-secret` header checked against `MISSIVE_WEBHOOK_SECRET` env secret. Gate: only creates tasks when conversation has a label named "Task". Client matching: structured "Client: Name" in body → sender email → recipient email. Structured body overrides: `Client: Name`, `Task: Description`, `Due: YYYY-MM-DD`. Email body saved as initial task comment. No client match → returns 200 with `skipped: true` (no retry storm). Route: `artifacts/api-server/src/routes/missive-webhook.ts`.

## Data Models

- **Clients**: id, name, email, monthly_hour_budget, monthly_fee, service_type (bookkeeping/va/hybrid)
- **Services**: id, name, description, service_type ("Bookkeeping"|"Virtual Assistant"), price, billing_type ("Flat Rate"|"Hourly"), hourly_rate (nullable), budgeted_hours (nullable, VA only), active, created_at
- **ClientServices**: id, client_id, service_id, custom_price, custom_hourly_rate, custom_budgeted_hours, monthly_hours_reset_day (1–31, nullable), created_at
- **Tasks**: id, title, description, client_id, assigned_to, status ("Not Started"|"Pending"|"Confirmed"|"In Progress"|"Completed"), due_date, completed_date (auto-set on status→Completed), recurrence fields, service_type (nullable, "Bookkeeping"|"Virtual Assistant")
- **TimeEntries**: id, client_id, task_id (optional), duration_minutes, date, started_at, ended_at
- **Leads**: id, name, email, estimated_value, status (new/contacted/proposal/closed), lead_source
- **Invoices**: id, client_id, lead_id (nullable), amount, type (invoice/estimate), status (draft/sent/paid/unpaid/void/accepted/declined), billing_type ("one_time"|"recurring", default "one_time"), due_date, description, line_items (json — each item has name, description, qty, unit_price, billing_type ("one_time"|"recurring")), notes, thank_you_message, paid_at, payment_method, payment_notes, recurring_id (nullable), updated_at
- **RecurringInvoices**: id, client_id, frequency (weekly/monthly/custom), interval_days, start_date, end_date, next_due_date, description, line_items, amount, active, auto_send, created_at
- **InvoiceReminders**: id, invoice_id, type (due/day3/day5/day10), sent_at, created_at
- **Users**: id, email, password_hash, name, role (admin/team_member/client), client_id (nullable)

## API Routes

All under `/api`. All routes require auth except `/api/auth/*`.
- `GET/POST /auth/me`, `POST /auth/login`, `POST /auth/logout`
- `GET/POST /users` — Admin only; list/create users
- `PATCH/DELETE /users/:id` — Admin only
- `GET/POST /clients` — Admin only
- `GET/PATCH /clients/:id` — Admin or client (own only)
- `GET /dashboard` — Admin only
- `GET/POST /tasks` — Auth required; role-filtered
- `PATCH /tasks/:id` — Admin + team_member
- `GET/POST /time` — Auth required; client sees own; admin/team_member see all
- `DELETE /time/:id` — Admin + team_member
- `GET/POST /leads` — Admin + team_member
- `PATCH /leads/:id` — Admin + team_member; DELETE admin only
- `GET /invoices` — Auth required; client sees own
- `POST/PATCH/DELETE /invoices/:id` — Admin only
- `POST /invoices/:id/send` — Send invoice via email (with Stripe pay button if configured)
- `GET /invoices/:id/reminders` — List sent reminders for an invoice
- `POST /invoices/:id/send-reminder` — Manually trigger a reminder (body: { type: "due"|"day3"|"day5"|"day10" })
- `GET/POST /recurring-invoices` — Admin only; list/create recurring schedules
- `PATCH/DELETE /recurring-invoices/:id` — Admin only
- `POST /recurring-invoices/:id/generate` — Manually generate next invoice from template
- `GET /invoices/:id/pdf` — Download PDF of an invoice

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

### `artifacts/biz-app` (`@workspace/biz-app`)

React + Vite frontend. Uses generated React Query hooks from `@workspace/api-client-react`.

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Schema tables: clients, tasks, time_entries, leads.

### `lib/api-spec` (`@workspace/api-spec`)

OpenAPI 3.1 spec (`openapi.yaml`) and Orval config. Run codegen: `pnpm --filter @workspace/api-spec run codegen`

## ClickUp Integration

Two-way sync between local Task Manager and ClickUp (API v2).

**Setup flow (admin only):**
1. Click "Connect ClickUp" on the Tasks page → enter API token → pick workspace → space → list.
2. Optionally register a webhook for real-time inbound sync.

**Outbound (local → ClickUp):**
- Every `PATCH /api/tasks/:id` auto-pushes title, status, due date, description, and tags to ClickUp if the task has a `clickup_task_id`.
- Every `POST /api/tasks/:taskId/comments` auto-posts the comment to ClickUp.
- Manual "Sync all" via `POST /api/clickup/sync`. Nightly cron at 00:05.

**Inbound (ClickUp → local) via webhook:**
- `POST /api/clickup/webhook` (public, HMAC-SHA256 signature verification when secret is stored).
- Handles: `taskNameUpdated`, `taskStatusUpdated`, `taskDueDateUpdated`, `taskUpdated`, `taskTagUpdated`, `taskCommentPosted`.
- Comments from ClickUp stored with `clickup_comment_id` to prevent echo-back.

**Fields synced:** title, status (mapped bidirectionally), due date, tags (comma-separated), comments.

**Status mapping:**
- ClickUp "complete/closed/done" ↔ local "Completed"
- ClickUp "in progress/active" ↔ local "In Progress"
- ClickUp "pending/waiting" ↔ local "Pending"

**DB columns added:** `tasks.clickup_task_id`, `tasks.tags`, `task_comments.clickup_comment_id`

**Key files:**
- `artifacts/api-server/src/services/clickup.ts` — API wrapper
- `artifacts/api-server/src/routes/clickup.ts` — all ClickUp routes

## Parent Client / Subclients

Clients support a self-referential parent/subclient hierarchy via `parent_id` (nullable FK on `clients`).

- **Schema**: `clients.parent_id` → integer, nullable, references `clients(id)`.
- **Backend endpoint**: `GET /api/clients/:id/subclients` — returns subclient rows with VA hours computed via reset-window-aware logic (`computeResetWindow`), including `monthly_va_budget`, `va_hours_used`, `hours_remaining`, `hours_remaining_pct`, `next_reset_date`, `days_until_reset`.
- **Client detail page** (`client-detail.tsx`):
  - Subclients section renders only when the client has subclients.
  - Shows 3 summary cards: Total VA Budget, Hours Used, Total Remaining.
  - Sortable table (Name, VA Budget, Used, Remaining, Usage bar, Resets) with color-coded rows: red < 20%, amber 20–50%, green ≥ 50% remaining.
  - Low-hours alert banner when any subclient is below 20%.
  - Edit Profile form has a "Parent Client (optional)" dropdown populated from the dashboard client list.
