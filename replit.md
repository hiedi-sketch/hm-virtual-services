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

## Features

### Business Manager App (artifacts/biz-app)

- **Dashboard** (`/`) — Client overview with hours used/remaining this month, monthly recurring revenue
- **Clients** (`/clients`) — Add and view clients (name, email, monthly hour budget, fee, service type)
- **Tasks** (`/tasks`) — Create and manage tasks across all clients, mark complete
- **Time Tracking** (`/time`) — Manual time entry form with client/task selection, view recent entries
- **Leads CRM** (`/leads`) — Add and manage leads (name, email, estimated value, status, source)

## Data Models

- **Clients**: id, name, email, monthly_hour_budget, monthly_fee, service_type (bookkeeping/va/hybrid)
- **Tasks**: id, title, description, client_id, assigned_to, status (pending/complete), due_date
- **TimeEntries**: id, client_id, task_id (optional), duration_minutes, date
- **Leads**: id, name, email, estimated_value, status (new/contacted/closed), lead_source

## API Routes

All under `/api`:
- `GET/POST /clients` — List/create clients
- `GET /clients/:id` — Get single client
- `GET /dashboard` — Dashboard data with hours used/remaining per client (current month)
- `GET/POST /tasks` — List/create tasks
- `PATCH /tasks/:id` — Update task (mark complete)
- `GET/POST /time` — List/create time entries
- `GET/POST /leads` — List/create leads
- `PATCH /leads/:id` — Update lead status

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
