# HM Virtual Services — Business Management App

Full-stack business management portal for bookkeeping & payroll. Built with React + Vite (frontend), Node.js/Express (backend), SQLite (local dev).

## Quick Start

### 1. Backend

```bash
cd server
npm install
npm run seed    # Creates DB + loads seed data
npm run dev     # Starts API on http://localhost:5000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev     # Starts app on http://localhost:5173
```

---

## Login Credentials

| Role  | Email                          | Password      |
|-------|--------------------------------|---------------|
| Admin | hiedi@hmvirtualservices.com    | changeme123   |
| Client| sarah@example.com              | client123     |
| Client| maria@example.com              | client123     |
| Client| dana@example.com               | client123     |

---

## Features

### Admin Portal
- **Dashboard** — stats cards, activity feed, quick actions
- **Clients** — full CRUD with packages, add-ons, prepay discounts
- **Time Tracking** — live timer, manual entry, weekly view, CSV export
- **Tasks** — Kanban board (To Do → In Progress → In Review → Done)
- **Invoices** — create from client package, PDF export, status management
- **Documents** — upload/download with tagging by type
- **Messages** — threaded per-client conversation
- **Reports** — revenue, profitability, add-on breakdown, aging
- **Settings** — business profile, payment terms, internal hourly rate

### Client Portal
- **Dashboard** — package summary, next invoice, unread messages
- **Invoices** — view + download PDF (no draft access)
- **Documents** — upload + download shared files
- **Messages** — chat with HM Virtual Services
- **Profile** — view contact info, change password

---

## Billing Model

| Package      | Price   |
|--------------|---------|
| Essentials   | $250/mo |
| Growth       | $350/mo |
| Scale        | $500/mo |
| Full Service | $800/mo |

**Add-ons:** Clean Up $149 · Payroll $75+$5/emp · Priority $100 · State Tax $50/state/qtr · W-2/1099 $250+$2/piece

**Prepay discounts:** 3-mo 5% · 6-mo 10% · Annual 20%

---

## Swapping to PostgreSQL (Production)

1. Replace `better-sqlite3` with `pg` + `knex`
2. Set `DATABASE_URL` in `.env`
3. Rewrite `db/database.js` to use a pg pool
4. Convert `db.prepare(...).get/all/run` calls to `await knex.raw(...)` or knex query builder
5. Deploy `/uploads` to S3 or similar object storage

---

## Tech Stack

- **Frontend:** React 18 · Vite · Tailwind CSS · React Router v6 · Axios · react-hot-toast
- **Backend:** Node.js · Express · better-sqlite3 · JWT · multer · pdfkit
- **Font:** Raleway (Google Fonts)
- **Brand Colors:** Primary Teal #2B7A8B · Accent #4AAFC4 · Silver #B0B5BC · Greige #D8D3CC · Linen #EDE9E3
