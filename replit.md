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

## Data Models

- **Clients**: id, name, email, monthly_hour_budget, monthly_fee, service_type (bookkeeping/va/hybrid)
- **Services**: id, name, description, service_type ("Bookkeeping"|"Virtual Assistant"), price, billing_type ("Flat Rate"|"Hourly"), hourly_rate (nullable), budgeted_hours (nullable, VA only), active, created_at
- **ClientServices**: id, client_id, service_id, custom_price, custom_hourly_rate, custom_budgeted_hours, monthly_hours_reset_day (1–31, nullable), created_at
- **Tasks**: id, title, description, client_id, assigned_to, status ("Pending"|"Confirmed"|"In Progress"|"Completed"), due_date, recurrence fields, service_type (nullable, "Bookkeeping"|"Virtual Assistant")
- **TimeEntries**: id, client_id, task_id (optional), duration_minutes, date, started_at, ended_at
- **Leads**: id, name, email, estimated_value, status (new/contacted/proposal/closed), lead_source
- **Invoices**: id, client_id, amount, status (draft/sent/paid/unpaid/void), due_date, description, line_items (json), notes, thank_you_message, paid_at, payment_method, payment_notes, recurring_id (nullable), updated_at
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
