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

---

## 3D Print Shop (`/print`)

A second workspace in the same app for running the 3D printing business. Same login,
same deploy — sign in as admin and open **Print Shop** from the sidebar, or go straight
to `/print`. The layout collapses to a tab strip on iPad so the whole thing works on a
touch screen at the bench.

### Tabs

| Tab | What it does |
|-----|--------------|
| **Dashboard** | Open orders, queue load, reorder list, inventory value. Light for now — more panels to come. |
| **Orders** | Customer orders, retail or wholesale pricing, promised vs projected ship date, one tap to send to the queue. |
| **Catalog** | Items for sale, components used inside other items, and tools. Pick what each item is made of and the cost, wholesale and retail prices fall out. SKU + barcode generated automatically. |
| **Filament** | Colour library with per-spool tracking (new / opened / ordered / empty), grams on hand, what the queue will consume, reorder flag and a vendor reorder link. |
| **Materials** | Same idea for magnets, hardware, packaging — anything bought by the pack. |
| **Queue** | Jobs in print order with projected ship dates, priority, and the stock the queue will run into. |
| **Settings** | The rates and markups every cost, price and ship date is derived from. |

### How a price is worked out

For one unit of an item:

```
filament (grams ÷ 1000 × cost per kg)
+ materials (quantity × pack cost ÷ pack size)
+ sub-items (recursively costed)
+ bought-in cost
+ machine time (print minutes ÷ units per print ÷ 60 × machine rate)
+ labor (finishing minutes ÷ 60 × your hourly rate)
= direct cost
+ failed-print allowance (direct cost × failure rate %)
+ packaging (finished products only)
+ overhead (× overhead %)
= unit cost

suggested wholesale = unit cost × (1 + wholesale markup %)      rounded up
suggested retail    = suggested wholesale × retail multiplier   rounded up
```

Any item can override its cost, wholesale or retail individually. Everything else
recalculates the moment a rate changes in Settings.

### Ship dates

The queue is walked in print order (rush first, then position). Cumulative print hours
are divided by `print hours per day × printers` to find when each job comes off the
printer; finishing days are added on top. The promised date is never earlier than
`order date + turnaround min days`, and anything landing past `order date + turnaround
max days` is flagged at risk.

### Barcodes and scanning

- Every filament, material and catalog item gets a SKU (`HM-PRD-0001`) that doubles as
  its **Code 128** barcode. Individual spools get their own tag (`SPL-000001`).
- **Label** on any row opens a printable label with the barcode rendered as SVG.
- **Scan** (top right, on every tab) opens the camera. On an iPad this is the scanner —
  point it at a spool tag or shelf label and receive stock, mark a spool opened, weigh
  a partial spool, or set a counted quantity.
- The scan box is always focused, so a USB or Bluetooth wedge scanner works on the
  desktop with no camera at all, and codes can be typed by hand.
- The camera needs an `https://` origin. It works on the deployed site and on
  `localhost`; over plain http on a LAN address, use the wedge/manual box.
- Vendor barcodes (the UPC on the manufacturer's packaging) can be stored per item, so
  scanning the box you just opened finds the right record.

### Stock movement

Marking a queue job **done** is what moves stock: filament grams come off the open
spools (opening a new one automatically when needed), materials come off the shelf, and
finished units are added to the item's inventory. Every movement is written to
`print_stock_log`.

### API

All routes live under `/api/print` and are admin-only:
`settings`, `filaments`, `materials`, `catalog`, `orders`, `queue`, `scan`, `dashboard`.
Tables are prefixed `print_` and are created on server start by `server/db/print-schema.js`.
