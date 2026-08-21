# Print Shop

A standalone app for running a 3D printing business: catalog costing, filament and
material inventory, barcode scanning, and a production queue that projects ship dates.

It has its own database, its own login and its own deploy. Nothing is shared with the
HM Virtual Services app that happens to live in the same repository.

---

## Quick start

```bash
cd print-shop

# Backend
cd server
cp .env.example .env          # then fill in the two JWT secrets — see below
npm install
npm run dev                   # API on http://localhost:4000

# Frontend (second terminal)
cd ../client
npm install
npm run dev                   # app on http://localhost:5174
```

Generate the secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server refuses to start without `JWT_SECRET` and `JWT_REFRESH_SECRET`.

### First sign-in

The first time the database is created, one account is made from `ADMIN_EMAIL` /
`ADMIN_PASSWORD` in `.env` (defaults: `owner@printshop.local` / `changeme123`).
Change the password from **Settings → Account** after signing in — that also signs out
every other device.

### Using it from the iPad

The dev server binds to `0.0.0.0`, so `http://<your-computer's-IP>:5174` works on the
iPad over the same Wi-Fi. **The camera scanner will not open over plain http** — browsers
only grant camera access on `https://` or `localhost`. On a LAN address use the text
box in the scan dialog (a Bluetooth wedge scanner types straight into it). For camera
scanning, use the deployed https site. Add it to the iPad home screen and it opens
full-screen like an app.

---

## Tabs

| Tab | What it does |
|-----|--------------|
| **Dashboard** | Open orders, queue load, reorder list, inventory value. Deliberately light — more panels to come. |
| **Orders** | Customer orders at retail or wholesale prices, promised vs projected ship date, one tap to send to the queue. |
| **Catalog** | Items for sale, components used inside other items, and tools. Pick what each is made of; cost and prices fall out. |
| **Filament** | Colour library with per-spool tracking, grams on hand, what the queue will consume, reorder flags, vendor reorder links. |
| **Materials** | The same for magnets, hardware, packaging — anything bought by the pack. |
| **Queue** | Jobs in print order with projected ship dates, priorities, and the stock the queue will run short of. |
| **Settings** | Every rate, markup and turnaround figure the app calculates from. |

---

## How a price is worked out

For one unit of an item:

```
filament (grams ÷ 1000 × cost per kg)
+ materials (quantity × pack cost ÷ pack size)
+ sub-items (costed recursively)
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
recalculates the moment a rate changes in Settings. The item editor previews the same
server-side calculation as you type, so what you see is what gets saved.

An item's bill of materials can reference another catalog item, and those are costed
recursively. Self-references are detected and ignored rather than looping.

---

## Ship dates

The queue is walked in print order — rush first, then position. Cumulative print hours
are divided by `print hours per day × printers` to find the day each job comes off the
printer, then finishing days are added. The projected ship date is never earlier than
`order date + turnaround min days`, and anything landing past `order date + turnaround
max days` is flagged at risk. New orders are offered the first date the shop can
actually hit given what is already queued.

---

## Barcodes and scanning

- Every filament, material and catalog item gets a SKU (`PS-PRD-0001`) that doubles as
  its **Code 128** barcode. Individual spools get their own tags (`SPL-000001`).
- **Label** on any row opens a printable label; the barcode is rendered as inline SVG,
  so it prints crisply at any size with no image assets.
- **Scan** is on every tab. It opens the camera, and the same dialog keeps a focused
  text box so a USB or Bluetooth wedge scanner — or typing — works identically.
- Scanning resolves to receive / open / weigh / count actions on the spot.
- Vendor barcodes (the UPC on the manufacturer's packaging) can be stored per item, so
  scanning a box you just opened finds the right record.
- The decoding library is lazy-loaded, so it is only downloaded when a scan starts.

---

## Stock movement

Marking a queue job **done** is what moves stock: filament grams come off the open
spools (opening a fresh one automatically when needed), materials come off the shelf,
and finished units are added to the item's inventory. Every movement is appended to
`stock_log`.

---

## Deploying

`render.yaml` at `print-shop/` deploys the whole thing as one service — the API serves
the built client in production. It mounts a disk and points `DB_PATH` at it so inventory
survives redeploys; `JWT_SECRET` and `JWT_REFRESH_SECRET` are generated by Render, and
`ADMIN_EMAIL` / `ADMIN_PASSWORD` are set once for the first account.

If the host runs from the repository root instead, set the root directory to
`print-shop` and use `npm run build` / `npm start`.

**SQLite needs a persistent disk.** On a host with an ephemeral filesystem the database
is wiped on every deploy — attach a volume, or move to Postgres.

---

## Layout

```
print-shop/
├── server/
│   ├── index.js              Express app; serves the client build in production
│   ├── db/schema.js          Every table, created on start; seeds settings + first account
│   ├── middleware/auth.js    JWT check
│   ├── routes/               auth, settings, filaments, materials, catalog, orders,
│   │                         queue, scan, dashboard
│   └── utils/
│       ├── costing.js        Recursive cost roll-up and price suggestions
│       ├── planning.js       Queue scheduling, ship-date projection, stock summaries
│       └── sku.js            SKU, spool tag and order number generation
└── client/
    └── src/
        ├── api/print.js      Typed-ish wrapper over the API + formatting helpers
        ├── components/       Layout, scan station, barcode renderer, shared UI
        └── pages/            One per tab
```

Tech: React 18 · Vite · Tailwind · React Router · Express · better-sqlite3 · ZXing.
The whole look is one file — `client/tailwind.config.js` — if you want to re-skin it.
