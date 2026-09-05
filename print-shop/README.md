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
| **Orders** | Customer orders at retail or wholesale prices, promised vs projected ship date, printable tickets, and a seven-stage pipeline moved along by scanning. |
| **Catalog** | Items for sale, components used inside other items, and tools. Pick what each is made of; cost and prices fall out. Shop photos on the cards, and import a product list from a CSV. |
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
recalculates the moment a rate changes in Settings.

### What it actually sells for

Those three figures are what an item *should* fetch. Underneath them, each product also
carries the price you really charge on each place you sell — Shopify, Faire, Etsy and
Amazon out of the box, editable in **Settings → sales channels**, so a new marketplace
is a settings change rather than a migration.

Each one shows the profit and margin it leaves against the unit cost, and a price below
what the item costs to make is called out in red on the form and on the catalog card. A
channel with no price set still appears, so the gap is visible rather than absent.

Margins here are against the unit cost only — before that channel takes its own cut, so
the real figure is lower than the one shown. Clearing a box removes that channel's price
rather than storing a zero.

Pulling a new product in from Shopify records its Shopify price as that channel's price. The item editor previews the same
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
- Scanning a **product** opens its print run: how many the shop owes across every open
  order, and how many you are printing now. See *Scanning a product: the print run*.
- Scanning an **order ticket** moves that order a stage on. See *Order tickets and the
  seven stages* above.
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

## Order tickets and the seven stages

Every order carries a printed ticket, and scanning that ticket is what moves the order
along. The stages are:

**New → Confirmed → Queued → Production → Finishing → Packing → Shipped**

One scan moves an order to the next one. **Cancelled** and **Completed** sit off the
chain — they are chosen by hand, never arrived at by scanning.

### Printing a ticket

**Print** on any order card opens its ticket; **Print tickets** at the top prints every
order currently shown, one to a sheet. A ticket carries the order number, who it is for,
the promised ship date, every line with quantity and SKU, the total, any note, a row of
stage boxes ticked off as far as the order has got, and a Code 128 barcode.

The barcode at the foot is the order's own code — `ORD-` and its order number, so `#1001`
from Shopify prints as `ORD-1001`. The prefix means an order code can never be mistaken
for a product SKU at the scanner. It is generated when the order is created, whether by
hand, by import or by Shopify, and it never changes.

Each product line also carries its own small barcode: that product's barcode, or its SKU
if it has no barcode. It is the same code as the shelf label, so one scan means one
product wherever it is read — off the ticket, off a bin, off a tag. Scanning it opens the
print run described below. A line matching no catalog product prints no code, because
there is no product to print.

### Scanning

Scan a ticket from anywhere — the **Scan** button on any tab. The sheet shows the order,
who it is for, its lines and where it has got to, with the next stage as one large
button. **Send it somewhere else instead** opens the full list for the times work skips
a step.

**A ticket read twice within eight seconds counts once.** Holding a sheet under the
camera would otherwise walk it down the whole chain in a second.

### Starting one product, or all of them

An order moves through its stages as a whole, but production does not. From **Confirmed**
onwards, its card lists every product on it with the state of that product's print job, a
**Start** beside each one still waiting, and **Start all** above them. Starting from
Confirmed queues the line on the way, so the Queued step is never in the way of getting
work moving.

When there is nothing to start, the panel says why instead of disappearing — an order
whose lines match no catalog product cannot be printed, and that is worth reading rather
than guessing at.

Starting one product puts that job on a printer and leaves the rest queued. The order
itself moves to **Production** the moment any part of it starts — so a three-product order
with one on the plate reads as in production, which is what it is.

Starting a job from the Queue tab does the same thing, so the two tabs never disagree.
Starting a line on an order that was never explicitly queued queues it on the way. A line
started late never drags an order backwards: one already scanned to packing stays there.

### Scanning a product: the print run

Scanning a product's barcode — from an order ticket, a shelf, or a bin — asks the
question that actually matters at the printer: **how many of these does the shop owe?**

The sheet leads with the total needed across every open order, what is on the shelf, what
is already on a plate, and how short that leaves you. Under it are the orders waiting on
that product, soonest promise first. It fills in a suggested quantity — the shortfall,
less anything already printing — and asks how many you are putting on this job.

**Print N and move to production** starts the run. The units are handed to the waiting
orders soonest promise first, and each order that gets its units moves to **Production**.
An order line is only taken when the run covers all of it: half a line printed is not a
line that can ship, so a run of three against lines of one, two and four fills the first
two and leaves the four waiting. Whatever the orders do not take becomes a **stock job**
on the queue, marked *For stock* — printed against nobody's order, landing on the shelf
when it finishes.

**Queue the orders** lines the waiting orders up without starting anything, walking each
one up to Queued. **Adjust stock** switches to the old receive / remove / count buttons
for the times you are counting a shelf rather than printing.

Tools have no print run; scanning one goes straight to the stock buttons.

### What each stage does

Reaching **Queued** is what actually puts the work in front of a printer — the same
thing *Send to queue* does, so the ticket and the app never disagree about it. Reaching
**Shipped** stamps the shipped date. Everything else just records where the order is.

The shop moves an order along by itself in one place only: when the last print job on an
order finishes, the order moves to **Finishing**. That only ever moves forward — if you
have already scanned the order into packing, the queue does not drag it back.

### The record

Every move is logged with what caused it — a scan, a button, the queue, Shopify, or the
order being created — and shows under **Details** on the order card as *How it got
here*. The status tells you where an order is; this tells you when each step happened
and what did it.

---

## Shopify

Connect a store from **Settings → Shopify** and pull products and orders in from it.

### Connecting

Shopify retired the admin-created custom app — the kind that handed you a token to paste —
so an app is now made in the **Dev Dashboard** and authorises the ordinary way. The shop
does the whole handshake itself; no token is ever typed in or shown.

In Shopify's Dev Dashboard, create an app, then release a version whose configuration
carries:

- the access scopes `read_products`, `read_orders`, `write_inventory` and `read_locations`
  (add `read_all_orders` for orders older than 60 days). The write scope does one job:
  putting this shop's stock figure back on the store. `read_locations` only names the
  places stock sits — without it Shopify returns a location's id and refuses its name, and
  the location picker falls back to listing ids;
- an **allowed redirection URL** of `https://your-shop-address/api/shopify/oauth/callback`.
  Settings shows the exact address to copy; Shopify refuses the connect unless it matches
  character for character.

Then paste the app's **client ID** and **client secret** into Settings here and press
**Connect to Shopify**. Shopify asks you to approve, sends you back, and the shop swaps
the one-time code for a token it stores encrypted.

Both the token and the secret are encrypted before storage and never sent back to the
browser — the settings page only ever shows the first and last few characters of a token.
Encryption is keyed on `SECRETS_KEY` if set, otherwise derived from `JWT_SECRET`; rotate
`JWT_SECRET` and you reconnect. `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_API_KEY`,
`SHOPIFY_API_SECRET` and `SHOPIFY_ACCESS_TOKEN` environment variables take priority over
anything stored, if you would rather keep the credentials in Render.

The client secret does double duty: it completes the handshake, and it is what signs the
orders Shopify pushes here. One value, set once.

**Test connection** confirms the token works and names the shop it belongs to.

#### How the callback is kept safe

Shopify sends you back to `/api/shopify/oauth/callback`, and a browser redirect cannot
carry a sign-in — so like the webhook, that route sits outside the login. Three things
stand in for one, and all three must hold before anything is stored:

1. the `state` nonce was issued by this shop, within fifteen minutes, and is unused —
   it is deleted on first sight, so a replayed callback finds nothing;
2. the store it comes back for is the store that nonce was issued for;
3. the parameters carry Shopify's signature, made with the client secret and compared in
   constant time.

Only a signed-in session can mint a nonce, which is what makes an open callback safe.
Approving with fewer scopes than were asked for is reported rather than left to fail on
the first sync.

**If you already have a `shpat_` token** from an app made under the old system, it still
works. *I already have an access token to paste* in Settings takes it.

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

### Orders as they come in

**Settings → Shopify → Push new orders here** subscribes Shopify to send every new
order straight to this shop as it is placed. It appears within seconds, as **New**, with
a ticket ready to print. Nothing is queued and nothing reaches a printer on its own.

The endpoint that receives them, `/api/shopify/webhook`, is the one part of the shop
that is not behind a sign-in — Shopify has no account here. What stands in for one is
the signature Shopify puts on every request, checked against your API secret key with a
constant-time comparison over the exact bytes received. A request that does not verify,
or that verifies but names a different shop, is refused and nothing is written. With no
secret stored, nothing is accepted at all.

Three topics are subscribed: `orders/create`, `orders/updated` and `orders/cancelled`.

- **Create** brings the order in, exactly as a pull would.
- **Update** only ever touches what Shopify owns — customer, email, note. **It never
  moves an order back down the pipeline**: an order you have already scanned into
  packing stays in packing.
- **Cancel** moves the order to Cancelled, unless it has already shipped.

An order that arrives twice is recognised by its Shopify id and not duplicated.

**A sweep runs behind the push**, every 15 minutes by default, doing a normal pull to
catch anything a webhook never delivered — a deploy at the wrong moment, a few hours of
failed retries. It creates nothing that is already here, so a sweep that finds nothing
does nothing. Set `SHOPIFY_POLL_MINUTES` to change the interval, or to `0` to turn it
off. **Check for missed orders** runs it on demand.

No extra scope is needed to subscribe: a webhook topic is governed by the scope of the
thing it is about, so `read_orders` covers the `orders/*` topics. If Shopify refuses the
subscription, the usual cause is `read_orders` missing from the app, or a token issued
before that scope was added — a token does not gain scopes granted later. Release a new
app version carrying the scope, then press **Connect to Shopify** again.

**If you would rather not let the app subscribe at all**, create the webhook by hand in
**Settings → Notifications → Webhooks** in your Shopify admin, pointing at the same
`/api/shopify/webhook` address. Webhooks made there are signed with the signing secret
shown on that page rather than the app's API secret — paste *that* value into the API
secret key field instead, and everything else works the same.

### Pulling orders

Pulling by hand still works, and is what the sweep uses. Orders arrive with status
**New**. Nothing is queued automatically — you look at an
order and press *Send to queue* yourself, so no order reaches a printer unseen.

Line items match to a catalog item in four passes, in order of certainty: the Shopify
variant id, this shop's own SKU, the **barcode or vendor barcode**, and finally an exact
name. The barcode pass matters because a catalog imported from a spreadsheet keeps this
shop's numbering and parks the file's code — for a Shopify export, Shopify's own SKU —
in the barcode field; matching on our SKU alone would never find it.

A line that matches nothing is still recorded on the order with its title and Shopify's
SKU, so the order total is right and the line can be matched later. Those lines are listed
after every sync, and **Match them to the catalog** on the order card runs the four passes
again over every unmatched line in the shop — for orders that arrived before their product
existed here, or before the matcher looked in the right place.

The first pull takes the last 30 days; after that each run picks up from the end of the
last successful one. Orders already brought in are skipped rather than duplicated.

Note that a Shopify app only sees the last 60 days of orders unless it has been granted
`read_all_orders`.

### API version

Shopify retires API versions on a rolling schedule. The default is set in
`server/utils/shopify.js`; if Shopify starts refusing it, the sync says so plainly and
you can set a newer version in Settings without a code change.

### Stock going back the other way

**Settings → Shopify → Push stock to Shopify** makes this shop the master: whatever it
says is on the shelf decides what the store sells. Pick the Shopify location to write to,
turn it on, and every stock movement here reaches Shopify shortly after — a print run
finishing, a count, a receipt, a spool of parts consumed, an order shipping.

**What is sent is not the raw on-hand count.** It is what is still *sellable*:

```
on the shelf  −  already sold and not yet shipped
```

Those two numbers differ for exactly as long as an order sits between its sale and its
shipment, and that gap is where a naive mirror oversells. Shopify decrements when someone
buys; this shop decrements when you ship. Sending the raw count in between would put back
the unit Shopify had just taken away and offer it to a second customer. Sending the
sellable figure holds steady across both events:

| | on the shelf | sold, unshipped | sent to Shopify |
|---|---|---|---|
| Print 20 for stock | 32 | 0 | **32** |
| Someone buys one | 32 | 1 | **31** |
| You ship it | 31 | 0 | **31** |

Orders placed here count as reserved too, so ten promised to a wholesale customer are not
offered online as well.

**Details worth knowing.** A figure that has not moved since the last push is not re-sent.
A shelf gone negative is sent as zero, while staying negative here where it is a problem
you can see. Products Shopify has never heard of are skipped. Changes queue in an outbox
and are retried, so a push that fails while Shopify is unreachable is not lost — anything
stuck is shown with its reason under the toggle. **Send every product now** reconciles the
whole catalog, which is also what happens the moment you turn it on.

If Shopify refuses the write, the app is missing `write_inventory`: release a new version
carrying it and press **Connect to Shopify** again. Which figure gets set — *available* or
*on hand* — is a dropdown, because a store not tracking them separately needs the other.

### Not done yet

Creating Shopify products from this catalog is not built. Products and orders come in,
stock goes out; nothing else does.

---

## Importing a product list

**Import products** on the Catalog tab reads a CSV with a row per product. A Shopify
products export works as it comes out of Shopify; a list of your own works too.

Two choices sit above the preview:

- **Bring them in as** — item for sale, a part used in other items, or a tool. A file is
  usually all one kind, so it is said once here rather than per row.
- **Category** — leave it blank to use whatever the file calls each row, or type one to
  put the whole file under it.

It previews first: how many will be added, how many already exist, which fields would be
filled in on those, and any rows it cannot use. Nothing is written until you say so.

| Column | Also accepted |
|--------|---------------|
| Title | Name, Product Name, Product |
| Type | Product Type, Category |
| Variant SKU | SKU |
| Variant Barcode | Barcode, UPC, EAN |
| Variant Price | Price, Retail Price |
| Cost per item | Cost, Unit Cost |
| Body HTML | Description, Body |
| Vendor | Brand, Supplier |
| Variant Inventory Qty | Quantity, On Hand, Qty |
| Image Src | Image, Image URL |
| Print time minutes | Print Time |
| Finishing minutes | Labor Minutes |
| Status | Published |

**SKUs are the shop's own.** Every product gets the next `PS-PRD-####` (or `PS-CMP-` /
`PS-TL-`) regardless of what the file called it, so one scheme runs through the catalog,
the labels and the scanner.

**Barcodes come from the file where there is one** — the *Variant Barcode* column, or the
file's SKU if that column is empty — and one is generated from the new SKU otherwise. A
spreadsheet's leading apostrophe (`'0123456`) is stripped, since it belongs to the
spreadsheet rather than the barcode, and a code already used by another item is not
reused.

**What it does not fill in.** Print time, finishing minutes and inventory are left at zero
unless the file carries them: those are yours to enter, and a guess would quietly feed the
costing. Until a product has its filament, materials and print time, its suggested prices
read zero — the imported ones are listed with a note saying so.

Descriptions are converted from HTML to plain text and trimmed to 600 characters. A price
in the file is stored as the **Shopify** price under *What it sells for*, not as a cost.
A row marked `draft` comes in inactive.

**Matching** is on SKU first, then on name ignoring case and padding. An existing product
only has its **blanks filled in** — category, description, vendor, image, barcode. Nothing
already set is overwritten. Rows a products export repeats for extra images (no title, just
a handle and an image) are skipped without comment; a row that genuinely duplicates another
in the same file is listed as skipped.

Running the same file twice changes nothing the second time.

---

## Importing a filament list

**Import a list** on the Filament tab reads a CSV with a row per colour — the shape a
supplier list or a spreadsheet of your own tends to be in already.

It always previews first: how many will be added, which existing ones will change and
exactly what changes, and any rows it cannot use and why. Nothing is written until you
say so.

| Column | Also accepted |
|--------|---------------|
| Color Name | Colour Name, Color, Name |
| Brand | Manufacturer, Maker |
| Type | Material, Material Type |
| Swatch | Hex, Hex Code, Color Hex |
| Spool Size (KG) | Spool Size, Size KG |
| Current Cost per KG | Cost per KG, Price per KG, Cost, Price |
| Reorder when below (spools) | Reorder Point, Reorder At |
| Spools on hand now | Spools on Hand, On Hand, Quantity, Qty |
| Where they go | Location, Slot, Shelf |
| Vendor | Vendor Name, Supplier, Seller |
| Reorder link | Vendor URL, Link, Product Link |

Headers are matched ignoring case, spaces and punctuation, and values are trimmed — a
brand of `"Sunlu "` matches `Sunlu`. Columns it does not recognise are named in the
preview and otherwise ignored.

**Matching** is on colour, brand and type together, ignoring case and padding. For a
colour already in the library:

- **Swatch and cost per kg are brought up to date** — the two that go stale.
- Blank fields are filled in from the file.
- **Anything already set is left alone.** If you corrected a vendor by hand, a
  spreadsheet does not get to undo it.

**Inventory is never invented.** A blank *Spools on hand now* creates no spools, so
importing a supplier's catalogue does not tell the shop you own all of it. Put a number
in that column and it creates that many, and *Where they go* puts them straight into a
slot.

Running the same file twice changes nothing the second time.

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
│   │                         queue, scan, dashboard, backup, shopify,
│   │                         shopify-webhook + shopify-oauth (the two routes
│   │                         outside the sign-in, each proving itself instead)
│   ├── services/
│   │   ├── order-flow.js     Moving an order along, and what each stage does
│   │   ├── oauth-state.js    One-time nonces tying a Shopify connect to its start
│   │   ├── inventory-sync.js Stock back to Shopify: sellable figure, outbox, retries
│   │   ├── shopify-sync.js   Pulling products and orders in, and taking webhooks
│   │   ├── shopify-poll.js   The sweep that catches orders a webhook missed
│   │   ├── catalog-import.js Reading a product list out of a CSV
│   │   └── filament-import.js
│   └── utils/
│       ├── costing.js        Recursive cost roll-up and price suggestions
│       ├── order-stages.js   The seven stages, in order — the one definition
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
