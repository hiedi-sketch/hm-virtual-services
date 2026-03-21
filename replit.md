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
- **Invoices** (`/invoices`) — Create invoices, track paid/unpaid/overdue; client sees their invoices only
- **Team** (`/team`) — User management (create/edit/delete users, assign roles & client links); admin only
- **Client Portal** — Dedicated portal for client-role users: open tasks, hours used this month, unpaid balance, invoice list

## Data Models

- **Clients**: id, name, email, monthly_hour_budget, monthly_fee, service_type (bookkeeping/va/hybrid)
- **Tasks**: id, title, description, client_id, assigned_to, status (pending/complete), due_date, recurrence fields
- **TimeEntries**: id, client_id, task_id (optional), duration_minutes, date, started_at, ended_at
- **Leads**: id, name, email, estimated_value, status (new/contacted/proposal/closed), lead_source
- **Invoices**: id, client_id, amount, status (paid/unpaid), due_date, description
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
