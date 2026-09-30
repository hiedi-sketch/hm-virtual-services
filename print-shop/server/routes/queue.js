const express = require('express');
const db = require('../db/database');
const { getSettings, round2 } = require('../utils/costing');
const {
  scheduleQueue, orderProjections, estimatedMinutes, filamentSummary, materialSummary,
} = require('../utils/planning');
const { ensurePicks, readPicks } = require('../utils/picklist');
const flow = require('../services/order-flow');
const jobs = require('../services/job-complete');
const board = require('../services/production-board');

const router = express.Router();

const EDITABLE = [
  'order_id', 'order_item_id', 'item_id', 'custom_name', 'quantity', 'status', 'priority',
  'position', 'printer', 'filament_id', 'filament_grams', 'spool_id',
  'estimated_minutes', 'notes', 'started_at', 'print_minutes_override',
];

function queuePayload() {
  const settings = getSettings();
  const { scheduled, capacity_hours_per_day, queue_hours } = scheduleQueue(settings);
  const { projections } = orderProjections(settings);
  const byOrder = new Map(projections.map((p) => [p.order_id, p]));

  return {
    queue: scheduled.map((row) => ({ ...row, projection: byOrder.get(row.order_id) || null })),
    projections,
    capacity_hours_per_day,
    queue_hours,
    queue_days: Math.ceil(queue_hours / capacity_hours_per_day),
    settings,
    done: db.prepare(`
      SELECT q.*, IFNULL(i.name, q.custom_name) AS item_name, o.order_number FROM queue_jobs q
        LEFT JOIN items i ON q.item_id = i.id
        LEFT JOIN orders o ON q.order_id = o.id
       WHERE q.status IN ('done','cancelled')
       ORDER BY q.completed_at DESC, q.id DESC LIMIT 25
    `).all(),
  };
}

router.get('/', (req, res) => res.json({ data: queuePayload() }));

/** The two numbers the buttons at the top of every page carry. */
router.get('/board', (req, res) => res.json({ data: board.board() }));

/** What is on a printer now, and what has come off onto the bench. */
router.get('/printing', (req, res) => res.json({ data: board.printingNow() }));

/** Everything ordered that still has to be printed, gathered by product. */
router.get('/in-queue', (req, res) => res.json({ data: board.inQueue() }));

/**
 * Put something on the queue.
 *
 * Two kinds of thing go through a printer. One is a product: it has a recipe,
 * the time and the filament are worked out from it, and what comes off goes on
 * the shelf as stock. The other is a one-off — a test piece, a bracket, a spare
 * for the machine — which has none of that and must not be given any, because a
 * catalog entry made to get a test print queued would show up in stock counts,
 * in what is owed on orders, and eventually in Shopify.
 *
 * So a one-off is named rather than chosen, and carries its own figures: the
 * minutes it takes, the filament and grams it eats, the spool to take them off.
 * Anything else it needs goes on its pick list, which is the same list the
 * printer prints for every other job.
 */
router.post('/', (req, res) => {
  const { item_id, custom_name, quantity = 1, picks = [] } = req.body;
  const name = typeof custom_name === 'string' ? custom_name.trim() : '';

  if (!item_id && !name) {
    return res.status(400).json({ error: 'Choose an item, or give the one-off a name' });
  }
  if (item_id && !db.prepare('SELECT id FROM items WHERE id = ?').get(item_id)) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const custom = !item_id;
  const qty = Number(quantity) || 1;
  // Two decimals, settled here rather than left to drift: the pick list rounds
  // to two, and a job saying 24.3456 while its list says 24.35 is two numbers.
  const grams = round2(Number(req.body.filament_grams) || 0);

  if (custom) {
    if (req.body.filament_id && !db.prepare('SELECT id FROM filaments WHERE id = ?').get(req.body.filament_id)) {
      return res.status(404).json({ error: 'That filament is not in the shop' });
    }
    if (grams > 0 && !req.body.filament_id) {
      return res.status(400).json({ error: 'Say which filament those grams come off' });
    }
    if (req.body.spool_id) {
      const spool = db.prepare('SELECT * FROM filament_spools WHERE id = ?').get(req.body.spool_id);
      if (!spool) return res.status(404).json({ error: 'That spool is not on the shelf' });
      if (req.body.filament_id && spool.filament_id !== Number(req.body.filament_id)) {
        return res.status(400).json({ error: 'That spool is a different filament' });
      }
    }
  }

  // One plate can serve several orders. Shares say how many of it are whose,
  // and whatever is left over on the plate is stock.
  if (!custom && Array.isArray(req.body.shares) && req.body.shares.length) {
    try {
      return res.status(201).json(queueShared(item_id, qty, req.body));
    } catch (err) {
      return res.status(err.status || 500).json({ error: err.message });
    }
  }

  const maxPosition = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;
  const body = {
    ...req.body,
    item_id: custom ? null : item_id,
    custom_name: custom ? name : null,
    quantity: qty,
    filament_grams: custom && grams > 0 ? grams : null,
    spool_id: custom && req.body.spool_id ? Number(req.body.spool_id) : null,
    position: req.body.position ?? maxPosition + 1,
    // A job created already on a plate has been running since now, not since
    // never — the panel counts elapsed time from this.
    started_at: req.body.status === 'printing' ? new Date().toISOString() : req.body.started_at,
    // Hers if she gave one. A one-off has no recipe to work one out from, so
    // an unanswered box means zero rather than a guess.
    estimated_minutes: req.body.estimated_minutes ??
      (custom ? 0 : estimatedMinutes({ item_id, quantity: qty, estimated_minutes: null })),
  };
  const keys = EDITABLE.filter((k) => body[k] !== undefined);

  const created = db.prepare(
    `INSERT INTO queue_jobs (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`
  ).run(...keys.map((k) => body[k]));

  // A one-off's list is written now, while she is the one who knows what it is
  // made of. The filament line comes from the job; everything else she added.
  if (custom) {
    const job = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(created.lastInsertRowid);
    ensurePicks(job);
    addExtraPicks(job.id, picks);
  }

  res.status(201).json({ data: queuePayload() });
});

/**
 * One plate, several orders.
 *
 * Nine openers is nine on the bed whether three are Susie's and six are Pam's,
 * so they go on as one run: a job per share, all carrying the same run id,
 * which is what keeps them together as one entry on the Print Queue with the
 * shares listed underneath. Whatever is left over is stock.
 *
 * Each share is tied to that order's own line where there is one, because a
 * job with no line behind it cannot count towards what the order still needs
 * — it would print and the order would still be asking for them.
 */
const bad = (message, status = 400) => Object.assign(new Error(message), { status });

/**
 * Who a plate is for, checked before anything is written.
 *
 * Shared by queuing a plate and by changing one already on the queue, so the
 * two cannot drift into disagreeing about what a share is allowed to be.
 */
function readShares(itemId, raw) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  const shares = [];

  for (const line of raw || []) {
    const orderId = Number(line.order_id);
    const quantity = Number(line.quantity);
    if (!orderId) continue;
    if (!(quantity > 0)) throw bad('Say how many of the plate are for each order');

    const order = db.prepare('SELECT id, order_number FROM orders WHERE id = ?').get(orderId);
    if (!order) throw bad('One of those orders is not here any more', 404);
    if (shares.some((sh) => sh.order_id === orderId)) {
      throw bad(`${order.order_number} is on the plate twice — put it on once for the whole amount`);
    }

    const row = db.prepare(
      'SELECT id FROM order_items WHERE order_id = ? AND item_id = ? ORDER BY id LIMIT 1'
    ).get(orderId, itemId);
    if (!row) throw bad(`${order.order_number} does not have ${item.name} on it`);

    shares.push({ order_id: orderId, order_number: order.order_number, order_item_id: row.id, quantity });
  }

  return shares;
}

/** What the orders have claimed, and what is left over for the shelf. */
function splitPlate(shares, total) {
  const claimed = shares.reduce((sum, sh) => sum + sh.quantity, 0);
  if (claimed > total) throw bad(`The orders want ${claimed} but the plate is ${total}`);
  return { claimed, forStock: total - claimed };
}

function queueShared(itemId, total, body) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  const shares = readShares(itemId, body.shares);

  if (!shares.length) throw bad('Choose an order, or leave the plate for stock');

  const { forStock } = splitPlate(shares, total);

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const insert = db.prepare(`
    INSERT INTO queue_jobs
      (order_id, order_item_id, item_id, quantity, status, priority, position, printer, filament_id,
       estimated_minutes, run_id)
    VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)
  `);
  const priority = body.priority || 'normal';
  const printer = body.printer || null;
  const filamentId = body.filament_id || null;

  db.transaction(() => {
    let position = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;
    for (const share of shares) {
      position += 1;
      insert.run(
        share.order_id, share.order_item_id, itemId, share.quantity, priority, position, printer, filamentId,
        estimatedMinutes({ item_id: itemId, quantity: share.quantity, estimated_minutes: null }),
        runId,
      );
    }
    if (forStock > 0) {
      position += 1;
      insert.run(
        null, null, itemId, forStock, priority, position, printer, filamentId,
        estimatedMinutes({ item_id: itemId, quantity: forStock, estimated_minutes: null }),
        runId,
      );
    }
  })();

  // Agreeing to make it is what confirming an order means, the same as queuing
  // from the To Print list. Forward only, so an order already past this stays.
  for (const share of shares) {
    flow.advanceTo(share.order_id, 'confirmed', { source: 'queue', note: `${item.name} queued` });
  }

  const named = shares.map((sh) => `${sh.quantity} for ${sh.order_number}`).join(', ');
  return {
    data: queuePayload(),
    run_id: runId,
    message: `${total} × ${item.name} on the queue — ${named}${forStock > 0 ? `, ${forStock} for stock` : ''}`,
  };
}

/**
 * The rest of what a one-off needs: a material, or a part already on the shelf.
 * Anything that does not name something real is dropped rather than stored as a
 * line pointing at nothing, which would read as "Missing material" at the
 * printer and tell her nothing about what went wrong.
 */
function addExtraPicks(queueId, lines) {
  if (!Array.isArray(lines) || !lines.length) return;
  const insert = db.prepare(`
    INSERT INTO queue_picks (queue_id, line_type, ref_id, quantity, unit, spool_id)
    VALUES (?, ?, ?, ?, ?, NULL)
  `);
  db.transaction(() => {
    for (const line of lines) {
      const refId = Number(line.ref_id);
      const quantity = round2(Number(line.quantity));
      if (!refId || !(quantity > 0)) continue;

      if (line.line_type === 'material') {
        const m = db.prepare('SELECT unit FROM materials WHERE id = ?').get(refId);
        if (!m) continue;
        insert.run(queueId, 'material', refId, quantity, m.unit || 'each');
      } else if (line.line_type === 'item') {
        if (!db.prepare('SELECT id FROM items WHERE id = ?').get(refId)) continue;
        insert.run(queueId, 'item', refId, quantity, 'each');
      }
    }
  })();
}

/**
 * Every job on the same plate. A run moves as one: it went on together and it
 * comes off together, so starting, finishing or removing any of it is doing
 * that to all of it.
 */
function runJobs(entry) {
  if (!entry.run_id) return [entry];
  return db.prepare("SELECT * FROM queue_jobs WHERE run_id = ? AND status NOT IN ('done','cancelled') ORDER BY id")
    .all(entry.run_id);
}

router.put('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });

  // A quantity is about one share, not the plate; everything else is the plate.
  const perJob = req.body.quantity !== undefined || req.body.order_item_id !== undefined;
  const members = perJob ? [entry] : runJobs(entry);

  const update = db.transaction(() => {
    for (const job of members) {
      const nextStatus = req.body.status || job.status;
      const justCompleted = nextStatus === 'done' && job.status !== 'done';

      const keys = EDITABLE.filter((k) => req.body[k] !== undefined);
      if (keys.length) {
        db.prepare(
          `UPDATE queue_jobs SET ${keys.map((k) => `${k}=?`).join(', ')}, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).run(...keys.map((k) => req.body[k]), job.id);
      }
      if (nextStatus === 'printing' && !job.started_at) {
        db.prepare('UPDATE queue_jobs SET started_at = CURRENT_TIMESTAMP WHERE id = ?').run(job.id);
      }
      // Starting a job here means the same thing as starting it from the
      // order: that order is in production now. Forward only.
      if (nextStatus === 'printing' && job.order_id) {
        flow.advanceTo(job.order_id, 'in_production', { source: 'queue', note: 'a print started' });
      }
      if (justCompleted) {
        db.prepare('UPDATE queue_jobs SET completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(job.id);
        jobs.completeJob({ ...job, ...req.body, id: job.id, quantity: job.quantity });
      }
    }

    // Settled after the whole plate has moved, or the first share would send
    // its order to finishing while the rest of the plate is still on it.
    for (const orderId of new Set(members.map((j) => j.order_id).filter(Boolean))) {
      jobs.settleOrder(orderId);
    }
  });
  update();

  res.json({ data: queuePayload() });
});

/**
 * Who a plate's units are for, changed after it is already on the queue.
 *
 * Seven Highland Calf openers are seven on the bed whether four are Pam's and
 * two are for the shelf or all seven are spoken for. What changes while it
 * prints is who is waiting for them: an order comes in for the two that were
 * headed to stock, or a customer adds to theirs. The plate has not changed —
 * only the labels on what comes off it.
 *
 * So this rewrites the run's shares in place rather than making her remove the
 * plate and queue it again. An order that is staying keeps its row, and with it
 * its pick list, the time it started and its place in the queue.
 */
function reshare(entry, body) {
  if (!entry.item_id) throw bad('A one-off belongs to nobody — there is nothing to share out');
  if (['done', 'cancelled'].includes(entry.status)) throw bad('That plate is finished — it cannot be shared out again');

  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(entry.item_id);
  const members = runJobs(entry);
  const plate = members.reduce((sum, job) => sum + (Number(job.quantity) || 0), 0);

  const total = body.total === undefined ? plate : Number(body.total);
  if (!(total > 0)) throw bad('A plate has to make at least one');

  const shares = readShares(entry.item_id, body.shares);
  const { forStock } = splitPlate(shares, total);

  // Everything a new row inherits so the plate stays one plate: it prints on
  // the same printer, off the same spool, in the same place in the queue, and
  // at the same stage as the rest of it.
  const [first] = members;
  const insert = db.prepare(`
    INSERT INTO queue_jobs
      (order_id, order_item_id, item_id, quantity, status, priority, position, printer, filament_id,
       spool_id, estimated_minutes, print_minutes_override, started_at, run_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const addRow = (orderId, orderItemId, quantity) => insert.run(
    orderId, orderItemId, entry.item_id, quantity, first.status, first.priority, first.position,
    first.printer, first.filament_id, first.spool_id,
    estimatedMinutes({ item_id: entry.item_id, quantity, estimated_minutes: null }),
    first.print_minutes_override, first.started_at, first.run_id,
  );
  const setQuantity = db.prepare(`
    UPDATE queue_jobs SET quantity = ?, order_item_id = ?,
           estimated_minutes = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?
  `);

  const byOrder = new Map(members.filter((j) => j.order_id).map((j) => [j.order_id, j]));
  const stockRow = members.find((j) => !j.order_id) || null;
  const added = [];

  db.transaction(() => {
    // A plate queued before runs existed has no run id, and sharing it out is
    // what makes it a run. It needs one before any row is added against it, or
    // the new rows would have nothing to belong to and the plate would split.
    if (!first.run_id) {
      const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      db.prepare('UPDATE queue_jobs SET run_id = ? WHERE id = ?').run(runId, first.id);
      first.run_id = runId;
    }

    for (const share of shares) {
      const existing = byOrder.get(share.order_id);
      if (existing) {
        setQuantity.run(
          share.quantity, share.order_item_id,
          estimatedMinutes({ item_id: entry.item_id, quantity: share.quantity, estimated_minutes: null }),
          existing.id,
        );
        byOrder.delete(share.order_id);
      } else {
        addRow(share.order_id, share.order_item_id, share.quantity);
        added.push(share);
      }
    }

    // What is left over. A plate with nothing spare loses its stock row rather
    // than keeping one for nought, which would read as a stock build on the
    // queue and have her looking for it on the shelf afterwards.
    if (forStock > 0 && stockRow) {
      setQuantity.run(
        forStock, null,
        estimatedMinutes({ item_id: entry.item_id, quantity: forStock, estimated_minutes: null }),
        stockRow.id,
      );
    } else if (forStock > 0) {
      addRow(null, null, forStock);
    } else if (stockRow) {
      db.prepare('DELETE FROM queue_jobs WHERE id = ?').run(stockRow.id);
    }

    // Orders taken off the plate. Their row goes, and its pick list with it;
    // the order itself is untouched, because it still wants the thing — it is
    // simply not coming off this plate any more.
    for (const job of byOrder.values()) {
      db.prepare('DELETE FROM queue_jobs WHERE id = ?').run(job.id);
    }
  })();

  // Agreeing to make it is what confirming an order means, the same as queuing
  // it. Forward only, so an order already further on stays where it is — and a
  // plate already running puts its new orders straight into production.
  const stage = ['printing', 'post_processing'].includes(first.status) ? 'in_production' : 'confirmed';
  for (const share of added) {
    flow.advanceTo(share.order_id, stage, { source: 'queue', note: `${item.name} shared out` });
  }

  const named = shares.map((sh) => `${sh.quantity} for ${sh.order_number}`).join(', ');
  return {
    data: queuePayload(),
    message: shares.length
      ? `${total} × ${item.name} — ${named}${forStock > 0 ? `, ${forStock} for stock` : ''}`
      : `${total} × ${item.name}, all for stock`,
  };
}

router.put('/:id/shares', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  try {
    res.json(reshare(entry, req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
  const ids = runJobs(entry).map((j) => j.id);
  db.prepare(`DELETE FROM queue_jobs WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
  res.json({ data: queuePayload() });
});

/** Drag-and-drop reordering sends the whole list of ids in their new order. */
router.put('/reorder/positions', (req, res) => {
  const { ids = [] } = req.body;
  const update = db.prepare('UPDATE queue_jobs SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  db.transaction(() => ids.forEach((id, index) => {
    const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(id);
    if (!entry) return;
    // The list sends one id per plate. Every share of that plate takes the
    // same place, or the plate would come apart the moment it is moved.
    for (const job of runJobs(entry)) update.run(index + 1, job.id);
  }))();
  res.json({ data: queuePayload() });
});

// ── Pick list ────────────────────────────────────────────────────────────────

function pickListPayload(entry) {
  const lines = readPicks(entry.id);
  return {
    queue_id: entry.id,
    // A job's name is its item's, or the name she typed for a one-off — the
    // same rule the queue itself reads by.
    item_name: (entry.item_id
      ? db.prepare('SELECT name FROM items WHERE id = ?').get(entry.item_id)?.name
      : entry.custom_name) || 'this job',
    quantity: entry.quantity,
    status: entry.status,
    lines,
    total: lines.length,
    picked: lines.filter((l) => l.picked).length,
    short: lines.filter((l) => l.short_by > 0).length,
  };
}

/** Everything to gather for a job, built on first ask and kept thereafter. */
router.get('/:id/picklist', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  // Gathering is done for the plate: nine openers is nine openers' worth of
  // filament, whoever they are for.
  ensurePicks(wholeRun(entry));
  res.json({ data: pickListPayload(wholeRun(entry)) });
});

/**
 * Print that again.
 *
 * A finished job is the best description of a plate she is about to set up a
 * second time — the product, how many fitted, the colour, the time it really
 * took — so making another one is a copy of it rather than a form to fill in.
 *
 * The copy is a stock build. Whatever order the original was for has been made
 * and is gone; wanting more of the same thing is a different job, and hanging
 * it off the old order would put units against a line that is already covered.
 *
 * Two things are copied only when the quantity is unchanged, because both are
 * figures about a particular plate rather than about one unit: her corrected
 * print time, and a one-off's minutes. Ask for a different number and the time
 * is worked out afresh from the recipe, or left for her to correct.
 */
router.post('/:id/again', (req, res) => {
  const source = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!source) return res.status(404).json({ error: 'That job is not here any more' });

  const quantity = req.body?.quantity === undefined ? Number(source.quantity) : Number(req.body.quantity);
  if (!(quantity > 0)) return res.status(400).json({ error: 'How many?' });

  const custom = !source.item_id;
  const name = custom
    ? source.custom_name
    : db.prepare('SELECT name FROM items WHERE id = ?').get(source.item_id)?.name;
  if (!custom && !name) {
    return res.status(400).json({ error: 'That product is not in the catalog any more' });
  }

  const samePlate = quantity === Number(source.quantity);
  const maxPosition = db.prepare('SELECT IFNULL(MAX(position), 0) AS max FROM queue_jobs').get().max;

  const created = db.prepare(`
    INSERT INTO queue_jobs
      (item_id, custom_name, quantity, priority, position, printer, notes,
       filament_id, filament_grams, spool_id, estimated_minutes, print_minutes_override)
    VALUES (?, ?, ?, 'normal', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    source.item_id,
    source.custom_name,
    quantity,
    maxPosition + 1,
    source.printer,
    source.notes,
    source.filament_id,
    // A one-off's grams are for the whole plate, so a different plate needs a
    // different figure — hers to give, not ours to scale.
    custom && samePlate ? source.filament_grams : null,
    source.spool_id,
    custom
      ? (samePlate ? source.estimated_minutes : 0)
      : estimatedMinutes({ item_id: source.item_id, quantity, estimated_minutes: null }),
    samePlate ? source.print_minutes_override : null,
  );

  // A one-off's list is the only record of what it is made of, so it is copied
  // across rather than left to be worked out from a recipe it does not have.
  if (custom) {
    const job = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(created.lastInsertRowid);
    ensurePicks(job);
    if (samePlate) {
      const extras = db.prepare(`
        SELECT line_type, ref_id, quantity, unit FROM queue_picks
         WHERE queue_id = ? AND line_type IN ('material','item')
      `).all(source.id);
      const insert = db.prepare(`
        INSERT INTO queue_picks (queue_id, line_type, ref_id, quantity, unit, spool_id)
        VALUES (?, ?, ?, ?, ?, NULL)
      `);
      db.transaction(() => {
        for (const line of extras) insert.run(job.id, line.line_type, line.ref_id, line.quantity, line.unit);
      })();
    }
  }

  res.status(201).json({
    data: queuePayload(),
    message: `${quantity} × ${name} back on the queue`,
  });
});

/** The primary job of a run, carrying the run's whole quantity. */
function wholeRun(entry) {
  const members = runJobs(entry);
  const primary = members[0] || entry;
  return { ...primary, quantity: members.reduce((sum, j) => sum + (Number(j.quantity) || 0), 0) };
}

/** Rebuild from current stock — useful if the recipe or shelf changed. */
router.delete('/:id/picklist', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  db.prepare('DELETE FROM queue_picks WHERE queue_id = ?').run(entry.id);
  ensurePicks(entry);
  res.json({ data: pickListPayload(entry) });
});

router.put('/picks/:pickId', (req, res) => {
  const pick = db.prepare('SELECT * FROM queue_picks WHERE id = ?').get(req.params.pickId);
  if (!pick) return res.status(404).json({ error: 'That line is not on the list' });

  const picked = req.body.picked ? 1 : 0;
  db.prepare('UPDATE queue_picks SET picked = ?, picked_at = ? WHERE id = ?')
    .run(picked, picked ? new Date().toISOString() : null, pick.id);

  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(pick.queue_id);
  res.json({ data: pickListPayload(entry) });
});

/** Tick a line off by scanning whatever is in your hand. */
router.post('/:id/picklist/scan', (req, res) => {
  const entry = db.prepare('SELECT * FROM queue_jobs WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Queue job not found' });
  ensurePicks(entry);

  const code = String(req.body.code || '').trim();
  if (!code) return res.status(400).json({ error: 'Nothing scanned' });

  const lines = readPicks(entry.id);
  const matches = lines.filter((l) => (l.codes || []).includes(code));

  if (!matches.length) {
    return res.status(404).json({
      error: 'That is not on this list',
      code,
      data: pickListPayload(entry),
    });
  }

  const line = matches.find((l) => !l.picked) || matches[0];
  const already = !!line.picked;
  if (!already) {
    db.prepare('UPDATE queue_picks SET picked = 1, picked_at = ? WHERE id = ?')
      .run(new Date().toISOString(), line.id);
  }

  res.json({
    data: pickListPayload(entry),
    matched: { id: line.id, label: line.label, quantity: line.quantity, unit: line.unit },
    message: already ? `${line.label} was already ticked off` : `${line.label} — collected`,
  });
});

/** What the queue will burn versus what is actually on the shelf. */
router.get('/shortages', (req, res) => {
  res.json({
    data: {
      filament: filamentSummary().filter((f) => f.short_by_grams > 0 || f.needs_reorder),
      materials: materialSummary().filter((m) => m.short_by > 0 || m.needs_reorder),
    },
  });
});

module.exports = router;
