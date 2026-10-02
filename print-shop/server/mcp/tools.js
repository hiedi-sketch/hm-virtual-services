const { z } = require('zod');
const db = require('../db/database');
const { parseTracking, trackingLink } = require('../utils/tracking');
const { orderProjections, scheduleQueue } = require('../utils/planning');
const { getSettings } = require('../utils/costing');
const allocation = require('../services/allocation');
const board = require('../services/production-board');
const lineStatus = require('../services/line-status');
const flow = require('../services/order-flow');
const drawers = require('../utils/drawers');
const stages = require('../utils/order-stages');

/**
 * The shop, as things Claude can do to it.
 *
 * Every tool goes through the same services the screens do rather than writing
 * to the tables itself, so a change made by asking is the change that would
 * have been made by tapping — the same stock movements, the same stage history,
 * the same refusals.
 *
 * Tools are named for what she would say out loud. She says "order YVVVH3H256",
 * not "order id 41", so everything takes an order the way she says it and the
 * lookup does the work.
 */

/** A tool's answer: something to read, and the same thing to compute with. */
const reply = (summary, data) => ({
  content: [{ type: 'text', text: summary }],
  structuredContent: data === undefined ? undefined : { result: data },
});

const fail = (message) => ({
  content: [{ type: 'text', text: message }],
  isError: true,
});

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`;

/**
 * Whether what was given is a tracking number at all.
 *
 * The shop's own parser is deliberately forgiving, because at the bench what
 * was scanned is a label whatever it looks like, and showing her the number
 * beats an error she cannot act on. Asked in a sentence it is the other way
 * round: "the one from the email" would go in as THEONEFROMTHEEMAIL and sit
 * there looking like a tracking number until a customer asked about it.
 *
 * So a carrier the shop knows passes, and so does a code of the right shape
 * with real digits in it — a carrier this shop has not met yet. Prose does not.
 */
function looksLikeTracking(parsed) {
  if (!parsed?.number) return false;
  if (parsed.carrier) return true;
  const digits = (parsed.number.match(/\d/g) || []).length;
  return parsed.number.length >= 10 && parsed.number.length <= 35 && digits >= 8;
}
const stageLabel = (key) => stages.stageInfo?.(key)?.label || key;

/**
 * The order she means.
 *
 * What she says is whatever is in front of her — the number on the ticket, the
 * one the shop gave it, the customer's name, the Shopify reference off an
 * email. Any of them finds it. An ambiguous name says which ones it could be
 * rather than guessing, because the wrong order is worse than no order when
 * the next thing to happen is a change.
 */
function findOrders(query) {
  const text = String(query || '').trim();
  if (!text) return [];
  const exact = db.prepare(`
    SELECT * FROM orders
     WHERE order_number = ? COLLATE NOCASE OR barcode = ? OR shopify_order_id = ?
     ORDER BY id DESC
  `).all(text, text, text);
  if (exact.length) return exact;

  const like = `%${text}%`;
  return db.prepare(`
    SELECT * FROM orders
     WHERE order_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?
        OR barcode LIKE ? OR shopify_order_id LIKE ?
     ORDER BY CASE status WHEN 'shipped' THEN 1 WHEN 'completed' THEN 1 WHEN 'cancelled' THEN 1 ELSE 0 END,
              IFNULL(promised_ship_date, '9999-12-31'), id DESC
     LIMIT 25
  `).all(like, like, like, like, like);
}

/** One order, or a message saying why not one. */
function oneOrder(query) {
  const found = findOrders(query);
  if (!found.length) return { error: `No order matches "${query}". Try the order number, the customer's name, or the Shopify reference.` };
  if (found.length > 1) {
    const list = found.slice(0, 8)
      .map((o) => `${o.order_number} — ${o.customer_name || 'no name'} (${stageLabel(o.status)})`)
      .join('\n  ');
    return { error: `"${query}" matches ${found.length} orders. Say which one:\n  ${list}` };
  }
  return { order: found[0] };
}

/** An order as a reader wants it: what it is, where it is, what it still owes. */
function describeOrder(order, plan = null) {
  const lines = db.prepare(`
    SELECT oi.id, oi.quantity, oi.unit_price, oi.packed_quantity, oi.item_id,
           IFNULL(i.name, oi.description) AS name, i.sku
      FROM order_items oi LEFT JOIN items i ON oi.item_id = i.id
     WHERE oi.order_id = ? ORDER BY oi.id
  `).all(order.id);

  const where = plan || allocation.plan();
  const projection = orderProjections().projections.find((p) => p.order_id === order.id) || null;
  const tracking = order.tracking_number
    ? { number: order.tracking_number, ...trackingLink(order.tracking_number) }
    : null;

  return {
    order_number: order.order_number,
    customer_name: order.customer_name,
    customer_email: order.customer_email,
    status: order.status,
    status_label: stageLabel(order.status),
    order_type: order.order_type,
    channel: order.channel || 'direct',
    order_date: order.order_date,
    promised_ship_date: order.promised_ship_date,
    shipped_date: order.shipped_date,
    tracking,
    projected_ship_date: projection?.projected_ship_date || null,
    late_by_days: projection?.late_by_days || 0,
    past_promised: !!projection?.at_risk,
    revenue: lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0),
    lines: lines.map((l) => ({
      product: l.name,
      sku: l.sku,
      quantity: l.quantity,
      packed: l.packed_quantity || 0,
      line_status: l.item_id ? lineStatus.statusOf(l, where) : null,
    })),
  };
}

const orderSummary = (o) => {
  const d = describeOrder(o);
  const bits = [
    `${d.order_number} — ${d.customer_name || 'no name'}`,
    `${d.status_label}, ${d.order_type}, from ${d.channel}`,
    d.promised_ship_date ? `promised ${d.promised_ship_date}` : 'no promised date',
  ];
  if (d.past_promised) bits.push(`${d.late_by_days}d past promised`);
  if (d.tracking) bits.push(`tracking ${d.tracking.number} (${d.tracking.carrier_label || 'carrier unknown'})`);
  return bits.join(' · ');
};

/** Register every tool on a server. */
function registerTools(server) {
  // ── reading ──────────────────────────────────────────────────────────────
  server.registerTool('printshop_find_order', {
    title: 'Find an order',
    description:
      'Find orders by order number, customer name, email, or Shopify reference. '
      + 'Use this first when the user names an order, to get its exact order_number before changing anything.',
    inputSchema: { query: z.string().min(1).describe('Order number, customer name, email, or Shopify reference') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query }) => {
    const found = findOrders(query);
    if (!found.length) return reply(`Nothing matches "${query}".`, []);
    return reply(
      found.map(orderSummary).join('\n'),
      found.map((o) => describeOrder(o)),
    );
  });

  server.registerTool('printshop_get_order', {
    title: 'Get one order',
    description: 'Everything about one order: its stage, what it is promised, its tracking, and each product on it with how far along that product is.',
    inputSchema: { order: z.string().min(1).describe('Order number, or anything else that identifies it uniquely') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ order }) => {
    const { order: found, error } = oneOrder(order);
    if (error) return fail(error);
    const d = describeOrder(found);
    const lines = d.lines.map((l) => `  ${l.quantity} × ${l.product}${l.sku ? ` (${l.sku})` : ''} — ${l.line_status || 'not a catalog product'}`);
    return reply([orderSummary(found), `${money(d.revenue)}`, ...lines].join('\n'), d);
  });

  server.registerTool('printshop_list_orders', {
    title: 'List orders',
    description: 'Orders at a given stage, soonest promise first. Omit the stage for every open order.',
    inputSchema: {
      stage: z.enum(['new', 'confirmed', 'in_production', 'finishing', 'packing', 'mail_bin', 'shipped', 'completed', 'cancelled'])
        .optional().describe('Only orders at this stage'),
      past_promised: z.boolean().optional().describe('Only orders projected to miss the date they were promised'),
      limit: z.number().int().min(1).max(100).default(25),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ stage, past_promised: late, limit }) => {
    const rows = stage
      ? db.prepare('SELECT * FROM orders WHERE status = ?').all(stage)
      : db.prepare("SELECT * FROM orders WHERE status NOT IN ('shipped','completed','cancelled')").all();
    const plan = allocation.plan();
    let out = rows.map((o) => describeOrder(o, plan));
    if (late) out = out.filter((o) => o.past_promised);
    out.sort((a, b) => String(a.promised_ship_date || '9999').localeCompare(String(b.promised_ship_date || '9999')));
    out = out.slice(0, limit);
    const head = `${out.length} order${out.length === 1 ? '' : 's'}${stage ? ` at ${stageLabel(stage)}` : ' still open'}${late ? ', past promised' : ''}`;
    return reply([head, ...out.map((o) => `  ${o.order_number} — ${o.customer_name || 'no name'} · ${o.status_label} · ${o.promised_ship_date || 'no date'}`)].join('\n'), out);
  });

  server.registerTool('printshop_print_queue', {
    title: 'The print queue',
    description: 'What is on the printers and waiting for one, in print order, with the clock time each plate starts and comes off.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const { scheduled, queue_hours, queue_clear_at } = scheduleQueue();
    const rows = scheduled.map((r) => ({
      sequence: r.sequence,
      product: r.item_name,
      quantity: r.quantity,
      status: r.status,
      printer: r.printer,
      estimated_minutes: r.estimated_minutes,
      starts: r.estimated_start,
      comes_off: r.estimated_finish,
      running_late: r.running_late,
      for_orders: (r.parts || []).filter((p) => p.order_id).map((p) => `${p.quantity} for ${p.order_number}`),
    }));
    const text = rows.length
      ? [`${rows.length} plate${rows.length === 1 ? '' : 's'}, ${queue_hours}h of printing`,
        ...rows.map((r) => `  ${r.sequence}. ${r.quantity} × ${r.product} — ${r.status}${r.running_late ? ' (running over)' : ''}${r.for_orders.length ? ` · ${r.for_orders.join(', ')}` : ' · stock'}`)].join('\n')
      : 'Nothing on the queue.';
    return reply(text, { plates: rows, queue_hours, queue_clear_at });
  });

  server.registerTool('printshop_to_print', {
    title: 'What still has to be printed',
    description: 'Every product with printing left to do, how many, and the days those are promised for. This is the shop\'s To Print list.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const { needing, units_to_print } = board.inQueue();
    const rows = needing.map((i) => ({
      product: i.name, sku: i.sku, to_print: i.to_print, on_hand: i.on_hand,
      orders_waiting: i.order_count, due: i.due.map((d) => ({ date: d.date, to_print: d.to_print })),
    }));
    return reply(
      rows.length
        ? [`${units_to_print} to print across ${rows.length} product${rows.length === 1 ? '' : 's'}`,
          ...rows.map((r) => `  ${r.to_print} × ${r.product} — ${r.due.map((d) => `${d.date || 'no date'} (${d.to_print})`).join(', ')}`)].join('\n')
        : 'Nothing needs printing.',
      rows,
    );
  });

  server.registerTool('printshop_find_product', {
    title: 'Find a product',
    description: 'Catalog products by name or SKU, with what is on hand and which drawer it is kept in.',
    inputSchema: { query: z.string().min(1).describe('Product name or SKU') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ query }) => {
    const like = `%${query.trim()}%`;
    const rows = db.prepare(
      'SELECT id, name, sku, barcode, qty_on_hand, drawer, is_active FROM items WHERE name LIKE ? OR sku LIKE ? ORDER BY name LIMIT 25'
    ).all(like, like);
    return reply(
      rows.length
        ? rows.map((r) => `${r.name} (${r.sku}) — ${r.qty_on_hand} on hand${r.drawer ? `, drawer ${r.drawer}` : ', no drawer'}`).join('\n')
        : `Nothing in the catalog matches "${query}".`,
      rows,
    );
  });

  // ── changing things ──────────────────────────────────────────────────────
  server.registerTool('printshop_set_tracking', {
    title: 'Add tracking to an order',
    description:
      'Put a tracking number on an order. The carrier is worked out from the number itself, and a scanned USPS label barcode is '
      + 'reduced to the number a customer can actually look up. Pass an empty string to clear it. '
      + 'This does not ship the order — use printshop_ship_order for that.',
    inputSchema: {
      order: z.string().min(1).describe('Order number, or anything else that identifies it uniquely'),
      tracking_number: z.string().describe('The tracking number, or a scanned label barcode. Empty clears it.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ order, tracking_number: code }) => {
    const { order: found, error } = oneOrder(order);
    if (error) return fail(error);

    const text = String(code || '').trim();
    const parsed = text ? parseTracking(text) : null;
    if (text && !looksLikeTracking(parsed)) {
      return fail(
        `"${text}" does not look like a tracking number. Give the number itself, or the barcode scanned off the label.`,
      );
    }

    const was = found.tracking_number;
    db.prepare('UPDATE orders SET tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(parsed ? parsed.number : null, found.id);

    const message = parsed
      ? `${found.order_number}: ${parsed.carrier_label || 'tracking'} ${parsed.number}${was && was !== parsed.number ? ` (was ${was})` : ''}`
      : `${found.order_number}: tracking cleared${was ? ` (was ${was})` : ''}`;
    const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(found.id);
    return reply(message, describeOrder(fresh));
  });

  server.registerTool('printshop_ship_order', {
    title: 'Ship an order',
    description:
      'Mark an order shipped, optionally with its tracking number. This is the real thing: it stamps the ship date, '
      + 'moves the order out of the shop and off the calendar. Confirm with the user before calling it.',
    inputSchema: {
      order: z.string().min(1).describe('Order number, or anything else that identifies it uniquely'),
      tracking_number: z.string().optional().describe('Tracking number to record as it ships'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  }, async ({ order, tracking_number: code }) => {
    const { order: found, error } = oneOrder(order);
    if (error) return fail(error);
    if (found.status === 'shipped') return fail(`${found.order_number} has already shipped.`);

    try {
      const result = flow.setStatus(found.id, 'shipped', { source: 'mcp', tracking: code || null });
      const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(found.id);
      return reply(`${found.order_number} shipped. ${result.message}`, describeOrder(fresh));
    } catch (err) {
      return fail(`Could not ship ${found.order_number}: ${err.message}`);
    }
  });

  server.registerTool('printshop_advance_order', {
    title: 'Move an order to a stage',
    description:
      'Move an order along the shop: new, confirmed, in_production, finishing, packing, mail_bin, shipped, completed, cancelled. '
      + 'Moving it does what that stage means — confirming queues what has to be printed, for instance.',
    inputSchema: {
      order: z.string().min(1).describe('Order number, or anything else that identifies it uniquely'),
      stage: z.enum(['new', 'confirmed', 'in_production', 'finishing', 'packing', 'mail_bin', 'shipped', 'completed', 'cancelled']),
      note: z.string().optional().describe('A note kept with the order history'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ order, stage, note }) => {
    const { order: found, error } = oneOrder(order);
    if (error) return fail(error);
    try {
      const result = flow.setStatus(found.id, stage, { source: 'mcp', note });
      const fresh = db.prepare('SELECT * FROM orders WHERE id = ?').get(found.id);
      return reply(`${found.order_number} — ${result.message.toLowerCase()}`, describeOrder(fresh));
    } catch (err) {
      return fail(`Could not move ${found.order_number} to ${stage}: ${err.message}`);
    }
  });

  server.registerTool('printshop_set_line_status', {
    title: 'Move one product on one order',
    description:
      'Set how far along one product on one order is: waiting, queued, printing, finishing, printed. '
      + 'Setting it does the thing — queuing puts it on the Print Queue, printed puts its units on the shelf. '
      + 'Printed is one way: its stock has moved and a dropdown cannot walk that back.',
    inputSchema: {
      order: z.string().min(1).describe('Order number, or anything else that identifies it uniquely'),
      product: z.string().min(1).describe('Product name or SKU, as it appears on the order'),
      status: z.enum(['waiting', 'queued', 'printing', 'finishing', 'printed']),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ order, product, status }) => {
    const { order: found, error } = oneOrder(order);
    if (error) return fail(error);

    const like = `%${product.trim()}%`;
    const matches = db.prepare(`
      SELECT oi.id, i.name, i.sku FROM order_items oi JOIN items i ON oi.item_id = i.id
       WHERE oi.order_id = ? AND (i.name LIKE ? OR i.sku LIKE ?)
    `).all(found.id, like, like);
    if (!matches.length) return fail(`${found.order_number} has nothing matching "${product}" on it.`);
    if (matches.length > 1) {
      return fail(`"${product}" matches ${matches.length} products on ${found.order_number}: ${matches.map((m) => m.name).join(', ')}. Say which.`);
    }

    try {
      const result = lineStatus.setLineStatus(matches[0].id, status);
      return reply(`${found.order_number}: ${result.message}`, describeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(found.id)));
    } catch (err) {
      return fail(err.message);
    }
  });

  server.registerTool('printshop_file_in_drawer', {
    title: 'File a product in a drawer',
    description: 'Put a catalog product in one of the inventory drawers, or take it out with an empty drawer. A product lives in one drawer, so filing it moves it.',
    inputSchema: {
      product: z.string().min(1).describe('Product name or SKU'),
      drawer: z.string().describe('Drawer code such as D4. Empty takes it out of whatever drawer it is in.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async ({ product, drawer }) => {
    const like = `%${product.trim()}%`;
    const matches = db.prepare('SELECT id, name, sku FROM items WHERE name LIKE ? OR sku LIKE ? LIMIT 10').all(like, like);
    if (!matches.length) return fail(`Nothing in the catalog matches "${product}".`);
    if (matches.length > 1) return fail(`"${product}" matches ${matches.length}: ${matches.map((m) => `${m.name} (${m.sku})`).join(', ')}. Say which.`);
    try {
      const code = String(drawer || '').trim();
      const result = code
        ? drawers.fileInDrawer(code, { item_id: matches[0].id })
        : drawers.assign(matches[0].id, null);
      return reply(result.message, result.drawer || null);
    } catch (err) {
      return fail(err.message);
    }
  });

  server.registerTool('printshop_shop_status', {
    title: 'How the shop stands',
    description: 'The numbers the dashboard leads with: open orders, what is past its promised date, hours of printing queued, what needs reordering.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    const settings = getSettings();
    const { projections } = orderProjections();
    const { queue_hours, queue_clear_at } = scheduleQueue(settings);
    const open = db.prepare("SELECT COUNT(*) n FROM orders WHERE status NOT IN ('shipped','completed','cancelled')").get().n;
    const late = projections.filter((p) => p.at_risk);
    const { units_to_print, product_count } = board.inQueue();
    const data = {
      open_orders: open,
      past_promised: late.length,
      past_promised_orders: late.map((p) => ({ order_number: p.order_number, late_by_days: p.late_by_days })),
      units_to_print,
      products_to_print: product_count,
      queue_hours,
      queue_clear_at,
      timezone: settings.shop_timezone,
    };
    return reply([
      `${open} open order${open === 1 ? '' : 's'}, ${late.length} past promised`,
      `${units_to_print} to print across ${product_count} product${product_count === 1 ? '' : 's'}`,
      `${queue_hours}h of printing queued`,
    ].join('\n'), data);
  });
}

module.exports = { registerTools, findOrders, describeOrder };
