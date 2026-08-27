# Print Shop

A standalone app for running a 3D printing business: catalog costing, filament and
material inventory, barcode scanning, and a production queue that projects ship dates.

It has its own database, its own login and its own deploy. Nothing is shared with the
HM Virtual Services app that happens to live in the same repository.

**Live at https://print-shop-u4kd.onrender.com**

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

### Using it from your devices

Once deployed (see **Deploying** below) there is one https URL that works on the
desktop, the iPad, and a phone, from anywhere — no VPN, no certificates, nothing to
install on each device.

**Install it as an app.** On the iPad or iPhone: open the URL in Safari, tap Share →
**Add to Home Screen**. On Android or desktop Chrome: the address bar shows an
**Install** button. Either way it opens full-screen with its own icon, and the session
lasts 30 days so you are not signing in every morning.

**The camera scanner needs https.** Browsers only grant camera access on `https://` or
`localhost`. The deployed URL is https, so the camera works there. Running the dev
server over your Wi-Fi (`http://192.168.x.x:5174`) will *not* open the camera — use the
text box in the scan dialog instead, which is also where a Bluetooth or USB wedge
scanner types.

### Running it locally

The dev server binds to `0.0.0.0`, so `http://<your-computer's-IP>:5174` reaches it from
another device on the same Wi-Fi — handy for testing, but see the camera note above.

---

## Tabs

| Tab | What it does |
|-----|--------------|
| **Dashboard** | Open orders, queue load, reorder list, inventory value. Deliberately light — more panels to come. |
| **Orders** | Customer orders at retail or wholesale prices, promised vs projected ship date, one tap to send to the queue. |
| **Catalog** | Items for sale, components used inside other items, and tools. Pick what each is made of; cost and prices fall out. |
| **Filament** | Colour library with per-spool tracking, where each spool is, grams on hand, what the queue will consume, reorder flags, vendor reorder links. |
| **Materials** | The same for magnets, hardware, packaging — anything bought by the pack. |
| **Queue** | Jobs in print order with projected ship dates, priorities, a pick list per job, and the stock the queue will run short of. |
| **Settings** | Every rate, markup and turnaround figure the app calculates from, plus the Shopify connection, your password and backups. |

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
- Scanning a filament — its shelf label, its vendor barcode, or one spool's own tag —
  offers the three things you do with a spool in your hand:
  - **Receiving** — how many spools, and where they go, in one step.
  - **Open one** — takes a sealed spool and marks it opened.
  - **Move** — pick which spool (skipped when a spool's own tag was scanned), then pick
    where it is going. This is the `A1` → `AMS2` move you make before every print.
- Materials and catalog items keep the plain receive / use / count actions.
- Vendor barcodes (the UPC on the manufacturer's packaging) can be stored per item, so
  scanning a box you just opened finds the right record.
- **Scanning something the shop has never seen** offers to add it there and then — a
  short form for a new filament or material, in stock as soon as it is saved. It also
  offers to attach the code to something already stocked, which is the answer to
  scanning a colour you have had for months but never recorded the maker's barcode for.
  Without that, scanning a familiar spool would quietly create a duplicate. One code can
  only ever point at one thing.
- The decoding library is lazy-loaded, so it is only downloaded when a scan starts.

---

## Shopify

Connect a store from **Settings → Shopify** and pull products and orders in from it.

### Connecting

In your Shopify admin: **Settings → Apps and sales channels → Develop apps**, create an
app, give it the `read_products` and `read_orders` scopes, install it, and copy the
Admin API access token. Paste that and your store address into Settings here.

The token is encrypted before it is stored and is never sent back to the browser — the
settings page only ever shows the first and last few characters. Encryption is keyed on
`SECRETS_KEY` if set, otherwise derived from `JWT_SECRET`; rotate `JWT_SECRET` and the
token has to be entered again. `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ACCESS_TOKEN`
environment variables take priority over anything stored, if you would rather keep the
credentials in Render.

**Test connection** confirms the token works and names the shop it belongs to.

### Pulling products

Matched on SKU, and deliberately additive:

- A Shopify variant whose SKU already exists here **keeps its local name, prices and
  recipe** and only gains the Shopify link. Nothing you have costed is overwritten.
- A variant with no match is created as a product with its SKU, barcode and Shopify
  price as its retail override, and no recipe — add filament, materials and print time
  to make costing work.
- A variant with **no SKU in Shopify** is skipped and reported. Give it a SKU in Shopify
  and pull again.

Running it twice changes nothing the second time.

### Pulling orders

Orders arrive with status **New**. Nothing is queued automatically — you look at an
order and press *Send to queue* yourself, so no order reaches a printer unseen.

Line items match to catalog items by Shopify variant, then by SKU. A line that matches
nothing is still recorded on the order as text, so the order total is right, but it
cannot be queued until some catalog item carries that SKU. Those lines are listed after
every sync.

The first pull takes the last 30 days; after that each run picks up from the end of the
last successful one. Orders already brought in are skipped rather than duplicated.

Note that a Shopify app only sees the last 60 days of orders unless it has been granted
`read_all_orders`.

### API version

Shopify retires API versions on a rolling schedule. The default is set in
`server/utils/shopify.js`; if Shopify starts refusing it, the sync says so plainly and
you can set a newer version in Settings without a code change.

### Not done yet

Pushing the other way — creating Shopify products from this catalog, and updating
Shopify stock levels when a print finishes — is not built. Both are pulls only for now.

---

## Where spools are

Every physical spool can be given a place: a shelf slot (`A1`–`A6`, `B1`–`B3` out of the
box) or a bay in the printer (`AMS1`–`AMS4`). Both lists are editable in
**Settings → Where filament lives**, so the shelf can grow without a code change.

The two kinds behave differently, because the shelf and the printer do:

- **An AMS bay holds one spool.** Moving into a loaded bay names what is in it and offers
  to swap; the spool that comes out is left without a place so it shows up as needing
  one. This is enforced in the database, not just the screen.
- **A shelf slot holds as many as fit.** Four blacks can sit in `B2` together, and moving
  another one in asks nothing.

Location sits on the **spool**, not the colour — three blacks can be in `A3`, `B1` and
`AMS2` at once, and you need to know which one to reach for.

A place can be set when the filament is first added ("where they go" on the add form,
which puts the whole batch on a shelf slot), when more spools are received, and per
spool from the edit form.

The everyday move looks like this: Beige is in `A1`, you are about to print with it, so
you tap its `A1` chip, tap `AMS2`, and it is loaded. Chips are shown on the colour and on
each spool; the ones in the printer are filled in, the ones on the shelf are not, so a
glance tells you what is loaded.

**Where things are** on the Filament tab opens the whole rack — every slot, what is in
it, and how much is left on each spool.

Moves are recorded in `stock_log`, so a spool's history shows where it has been as well
as what has been used off it.

If a slot is removed from Settings while something is still parked in it, that spool is
listed separately under **Slots no longer on the list** rather than disappearing.

---

## Starting a print

**Start print** on a queued job opens its pick list — everything to gather before the
printer runs, in three groups:

- **Filament**, with the grams needed and which spool to take them off. The oldest open
  spool comes first, and a spool that has to be unsealed is flagged.
- **Parts off the shelf** — components in the recipe that are already made. Anything in
  stock is pulled rather than reprinted, and only the shortfall goes through the printer.
- **Materials** — hardware, magnets, packaging.

Tick lines off by tapping them, or hit **Scan to tick off** and scan each thing as you
pick it up; the scanner stays open until the list is done. Scanning something that is
not on the list says so rather than ticking the wrong line. Progress is stored per job,
so the screen can sleep, or you can walk away and come back.

Anything the shop is short of is flagged in red, and starting with items still
outstanding asks first.

**Rebuild list** recalculates against current stock — worth it if the recipe or the
shelf changed after the list was first made.

Because the list decides what gets pulled rather than printed, its filament and material
figures are what the machine will actually use — and completing the job deducts exactly
those lines, so the pick list and the stock movement can never disagree.

---

## Stock movement

Marking a queue job **done** is what moves stock: filament grams come off the open
spools (opening a fresh one automatically when needed), materials come off the shelf,
components pulled from stock are deducted, and finished units are added to the item's
inventory. Every movement is appended to `stock_log`.

A job with a pick list is completed against that list. A job without one falls back to
costing the recipe out in full, treating every component as printed.

---

## Deploying to Render

This gets you one https URL that works on every device, with a working camera scanner.

### Before you start

The repository root already has a `render.yaml` for the HM Virtual Services app, and
Render only reads a Blueprint from the repository root — so **create this service by
hand in the dashboard** rather than as a Blueprint. `print-shop/render.yaml` in this
folder is the same configuration written out for reference, and becomes a one-click
Blueprint if you ever move this folder into its own repository.

### Cost

About **$7.25 a month**: a Starter instance ($7) plus a 1 GB disk ($0.25).

The free instance type cannot be used here. Free instances get no persistent disk, so
the SQLite database would be erased on every deploy — you would lose your whole
inventory each time. They also sleep after 15 minutes idle and take about a minute to
wake, which is miserable when you are stood at a printer with a spool in your hand.

### Steps

1. In Render, click **New +** → **Web Service** and connect this repository.
2. Fill in:

   | Field | Value |
   |-------|-------|
   | Name | `print-shop` |
   | Branch | whichever branch you want deployed |
   | **Root Directory** | `print-shop` |
   | Runtime | Node |
   | Build Command | `npm run build` |
   | Start Command | `npm start` |
   | Instance Type | **Starter** |

   The Root Directory field is what keeps this separate from the other app in the
   repository — Render only builds and deploys this folder.

3. Under **Advanced**, set **Health Check Path** to `/api/health`.

4. Still under Advanced, **Add Disk**:

   | Field | Value |
   |-------|-------|
   | Name | `print-shop-data` |
   | Mount Path | `/var/data` |
   | Size | 1 GB |

5. Add these environment variables:

   | Key | Value |
   |-----|-------|
   | `NODE_ENV` | `production` |
   | `NODE_VERSION` | `22` |
   | `DB_PATH` | `/var/data/print_shop.sqlite` |
   | `JWT_SECRET` | click **Generate** |
   | `JWT_REFRESH_SECRET` | click **Generate** |
   | `ADMIN_EMAIL` | your email |
   | `ADMIN_PASSWORD` | a strong password, just for the first sign-in |

   `DB_PATH` must point inside the mounted disk — that is the whole reason the disk
   exists. The two JWT values are what keep other people out of your shop; let Render
   generate them and never paste them anywhere.

6. **Create Web Service**. The first build takes a few minutes.

### The live service

This shop runs at **https://print-shop-u4kd.onrender.com** — Render service `print-shop`,
built from the `print-shop` root directory of this repository.

### After the first deploy

1. Open the URL Render gives you (`https://print-shop-xxxx.onrender.com`) and sign in
   with the `ADMIN_EMAIL` / `ADMIN_PASSWORD` you set.
2. Go to **Settings → Account** and change the password. That signs out every other
   device, which is what you want after using a bootstrap password.
3. Back in Render, delete the `ADMIN_PASSWORD` environment variable. It is only read
   when the database is empty, so it does nothing after this point — but there is no
   reason to leave a password sitting in a settings page.
4. Fill in **Settings** — your hourly rate, machine rate, markups and turnaround. Every
   price and ship date in the app comes off those numbers.
5. Add it to your home screen on the iPad, and check the camera scanner works.

A custom domain is optional and free to attach; Render issues the certificate.

### Backups

Your entire shop lives on that one disk. **Settings → Backup** downloads the whole
database as a single `.sqlite` file — do it every so often, and before any big change.
It is a consistent snapshot taken while the app is running, so it is safe to click
mid-print.

To restore, put that file back at the `DB_PATH` location and restart the service.

### Notes on going public

- The app is on the open internet behind one password, so repeated failed logins are
  throttled — 10 tries per 10 minutes, per device and email.
- Sessions last 30 days. Changing your password ends all of them.
- Auto-deploy is on by default: pushing to the branch you chose redeploys. Turn it off
  in Render's settings if you would rather deploy manually.

### If you outgrow SQLite

One shop on one instance is exactly what SQLite is good at, and a 1 GB disk holds far
more inventory history than this will ever generate. The reason to move to Postgres
would be wanting more than one Render instance, not size — SQLite on a disk cannot be
shared between instances.

## Layout

```
print-shop/
├── server/
│   ├── index.js              Express app; serves the client build in production
│   ├── db/schema.js          Every table, created on start; seeds settings + first account
│   ├── middleware/auth.js    JWT check
│   ├── routes/               auth, settings, filaments, materials, catalog, orders,
│   │                         queue, scan, dashboard, backup, shopify
│   ├── services/
│   │   └── shopify-sync.js   Pulling products and orders in from Shopify
│   └── utils/
│       ├── costing.js        Recursive cost roll-up and price suggestions
│       ├── picklist.js       What to gather for a job, and which spools to pull
│       ├── planning.js       Queue scheduling, ship-date projection, stock summaries
│       └── sku.js            SKU, spool tag and order number generation
└── client/
    ├── public/               Icons, web manifest, cache-free service worker
    └── src/
        ├── api/print.js      Typed-ish wrapper over the API + formatting helpers
        ├── components/       Layout, scan station, barcode renderer, shared UI
        └── pages/            One per tab
```

Tech: React 18 · Vite · Tailwind · React Router · Express · better-sqlite3 · ZXing.
The whole look is one file — `client/tailwind.config.js` — if you want to re-skin it.
