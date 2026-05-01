# Workspace

## Overview
This project is a pnpm monorepo using TypeScript, designed as a business management application for virtual assistant and bookkeeping services. It aims to streamline operations for service-based businesses, offering features like client management, task tracking, time tracking, invoicing, lead management, and team collaboration. The application targets virtual assistants, bookkeepers, and small to medium-sized businesses needing robust client and service management tools.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `lib/api-spec`.
Do not make changes to the file `artifacts/api-server/src/middleware/auth.ts`.

## System Architecture
The application is structured as a pnpm monorepo with separate `artifacts` for deployable applications (API server and frontend) and `lib` for shared libraries. The backend is an Express 5 API server, while the frontend is built with React, Vite, TailwindCSS, and shadcn/ui. PostgreSQL with Drizzle ORM handles data persistence. Authentication is session-based with three roles: `admin`, `team_member`, and `client`, each having distinct access levels. Data models cover key business entities like Clients, Services, Tasks, TimeEntries, Leads, Invoices, and Users. UI/UX emphasizes a professional, clear interface with features like guided onboarding wizards, status-based dashboards, and client portals.

### Technical Implementations
- **Monorepo Tool**: pnpm workspaces
- **Node.js**: Version 24
- **TypeScript**: Version 5.9
- **API Framework**: Express 5
- **Database**: PostgreSQL with Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API Codegen**: Orval (from OpenAPI spec)
- **Build Tool**: esbuild (CJS bundle)
- **Frontend**: React, Vite, TailwindCSS, shadcn/ui
- **Authentication**: Session-based using `express-session` with cookie-based sessions.
- **Role-Based Access Control**: `admin`, `team_member`, `client` roles with specific access middleware.
- **Invoice Management**: Full lifecycle support, recurring invoices, automated payment reminders, PDF generation, and Square integration.
- **Client Onboarding**: Multi-step wizard for new client setup, including service configuration and portal invites.
- **Time Tracking**: Timer and manual entry, with monthly VA hours reset logic based on client-specific reset days.
- **Task Management**: Creation, assignment, status tracking, and integration with external tools like Asana and Missive.
- **Client Portal**: Dedicated interface for clients to view tasks, hours, and invoices.
- **Parent/Subclient Hierarchy**: `clients.parent_id` for managing nested client relationships, including aggregated VA hour tracking for parent clients.

### Feature Specifications
- **Business Manager App (Frontend)**:
    - Login, Dashboard (admin-only client overview).
    - Clients: Add/view clients, onboarding wizard (8-step, saves to `client_onboarding_data`), quick add, portal invite.
    - Onboarding Checklist: Per-client 6-phase checklist (49 items for hybrid; Phase 4 BK-only, Phase 5 VA-only); collapsible phases, auto-saving checkboxes/notes, progress bar, reset with confirmation. State in `client_checklist_state` table.
    - Tasks: Create/manage, role-filtered views.
    - Time Tracking: Timer + manual entry, client-specific views.
    - Leads CRM: 4-stage pipeline.
    - Invoices: Create, edit, mark paid, void, delete, send, recurring schedules, automated reminders, Square integration.
    - Team: User management (admin-only).
    - Client Portal: Open tasks, hours used, unpaid balance, invoice list; estimate acceptance/declination.
    - Asana Sync: Admin-only page for connecting to Asana, real-time task syncing.
    - Missive Webhook: Automatic task creation from Missive conversations.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Square API (Invoices API, Orders API)**: Used for syncing invoices and payment processing.
- **Asana API**: Used for two-way synchronization of tasks.
- **Missive Webhooks**: Receives conversation data to automate task creation.
- **Orval**: API codegen tool, generates TypeScript client and Zod schemas from OpenAPI.
- **Zod**: Schema validation library.
- **Drizzle ORM**: TypeScript ORM for interacting with PostgreSQL.
- **express-session**: Middleware for managing user sessions.