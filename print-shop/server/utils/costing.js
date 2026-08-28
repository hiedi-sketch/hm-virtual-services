const db = require('../db/database');

const NUMERIC_DEFAULTS = {
  machine_rate_per_hour: 1.5,
  labor_rate_per_hour: 25,
  default_labor_minutes: 10,
  failure_rate_percent: 8,
  overhead_percent: 10,
  packaging_cost: 0.75,
  wholesale_markup_percent: 100,
  retail_multiplier: 2,
  price_rounding: 0.25,
  turnaround_min_days: 5,
  turnaround_max_days: 7,
  print_hours_per_day: 18,
  finishing_days: 1,
  printer_count: 1,
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const raw = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const settings = { ...raw };
  for (const [key, fallback] of Object.entries(NUMERIC_DEFAULTS)) {
    const n = parseFloat(raw[key]);
    settings[key] = Number.isFinite(n) ? n : fallback;
  }
  return settings;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Effective per-unit cost of a material, preferring pack cost ÷ pack size. */
function materialUnitCost(material) {
  if (material.pack_cost != null && material.pack_size > 0) {
    return material.pack_cost / material.pack_size;
  }
  return material.cost_per_unit || 0;
}

function roundPrice(value, increment) {
  if (!increment || increment <= 0) return round2(value);
  return round2(Math.ceil(value / increment) * increment);
}

/**
 * Roll up the cost of one unit of an item, walking sub-items recursively.
 * `seen` guards against a BOM that references itself.
 */
function computeItemCost(itemId, settings = getSettings(), seen = new Set()) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return null;
  const components = db.prepare('SELECT * FROM item_components WHERE item_id = ?').all(itemId);
  return costFrom(item, components, itemId, settings, seen);
}

/** Cost an item that has not been saved yet, so the editor can preview prices. */
function previewItemCost(draft, settings = getSettings()) {
  const item = {
    id: draft.id ?? null,
    name: draft.name || 'Draft item',
    item_type: draft.item_type || 'product',
    print_time_minutes: Number(draft.print_time_minutes) || 0,
    units_per_print: Number(draft.units_per_print) || 1,
    labor_minutes: draft.labor_minutes === '' || draft.labor_minutes == null ? null : Number(draft.labor_minutes),
    purchase_cost: draft.purchase_cost == null || draft.purchase_cost === '' ? null : Number(draft.purchase_cost),
    cost_override: draft.cost_override == null || draft.cost_override === '' ? null : Number(draft.cost_override),
    wholesale_override: draft.wholesale_override == null || draft.wholesale_override === '' ? null : Number(draft.wholesale_override),
    retail_override: draft.retail_override == null || draft.retail_override === '' ? null : Number(draft.retail_override),
  };
  const components = (draft.components || []).map((c) => ({
    component_type: c.component_type,
    ref_id: Number(c.ref_id),
    quantity: Number(c.quantity) || 0,
  }));
  const breakdown = costFrom(item, components, item.id, settings, new Set());
  return { cost_breakdown: breakdown, unit_cost: breakdown.total_cost, ...computeItemPricing(item, breakdown.total_cost, settings) };
}

function costFrom(item, components, itemId, settings, seen) {

  const breakdown = {
    item_id: item.id,
    name: item.name,
    item_type: item.item_type,
    filament: [],
    materials: [],
    sub_items: [],
    filament_cost: 0,
    material_cost: 0,
    sub_item_cost: 0,
    purchased_cost: item.purchase_cost || 0,
    machine_cost: 0,
    labor_cost: 0,
    packaging_cost: 0,
    failure_allowance: 0,
    overhead: 0,
    total_cost: 0,
    total_grams: 0,
    print_minutes_per_unit: 0,
    circular: false,
  };

  if (itemId != null && seen.has(itemId)) {
    breakdown.circular = true;
    return breakdown;
  }
  const nextSeen = new Set(seen);
  if (itemId != null) nextSeen.add(itemId);

  for (const c of components) {
    const qty = c.quantity || 0;
    if (c.component_type === 'filament') {
      const f = db.prepare('SELECT * FROM filaments WHERE id = ?').get(c.ref_id);
      if (!f) continue;
      const cost = (qty / 1000) * (f.cost_per_kg || 0);
      breakdown.filament.push({
        id: f.id,
        label: `${f.brand} ${f.material_type} — ${f.color_name}`,
        color_hex: f.color_hex,
        grams: qty,
        cost_per_kg: f.cost_per_kg,
        cost: round2(cost),
      });
      breakdown.filament_cost += cost;
      breakdown.total_grams += qty;
    } else if (c.component_type === 'material') {
      const m = db.prepare('SELECT * FROM materials WHERE id = ?').get(c.ref_id);
      if (!m) continue;
      const unitCost = materialUnitCost(m);
      const cost = qty * unitCost;
      breakdown.materials.push({
        id: m.id,
        label: m.name,
        quantity: qty,
        unit: m.unit,
        unit_cost: round2(unitCost),
        cost: round2(cost),
      });
      breakdown.material_cost += cost;
    } else if (c.component_type === 'item') {
      const sub = computeItemCost(c.ref_id, settings, nextSeen);
      if (!sub) continue;
      const cost = qty * sub.total_cost;
      breakdown.sub_items.push({
        id: sub.item_id,
        label: sub.name,
        quantity: qty,
        unit_cost: round2(sub.total_cost),
        cost: round2(cost),
        circular: sub.circular,
      });
      breakdown.sub_item_cost += cost;
      breakdown.total_grams += qty * (sub.total_grams || 0);
      breakdown.print_minutes_per_unit += qty * (sub.print_minutes_per_unit || 0);
      if (sub.circular) breakdown.circular = true;
    }
  }

  const unitsPerPrint = item.units_per_print > 0 ? item.units_per_print : 1;
  const ownPrintMinutes = (item.print_time_minutes || 0) / unitsPerPrint;
  breakdown.print_minutes_per_unit += ownPrintMinutes;

  breakdown.machine_cost = (ownPrintMinutes / 60) * settings.machine_rate_per_hour;

  const laborMinutes =
    item.labor_minutes != null ? item.labor_minutes : settings.default_labor_minutes;
  breakdown.labor_cost = (laborMinutes / 60) * settings.labor_rate_per_hour;
  breakdown.labor_minutes = laborMinutes;

  // Only finished products get packaged and shipped.
  breakdown.packaging_cost = item.item_type === 'product' ? settings.packaging_cost : 0;

  const direct =
    breakdown.filament_cost +
    breakdown.material_cost +
    breakdown.sub_item_cost +
    breakdown.purchased_cost +
    breakdown.machine_cost +
    breakdown.labor_cost;

  // Failed prints waste filament and machine time, not packaging.
  breakdown.failure_allowance = direct * (settings.failure_rate_percent / 100);
  const withFailure = direct + breakdown.failure_allowance + breakdown.packaging_cost;
  breakdown.overhead = withFailure * (settings.overhead_percent / 100);

  const computed = withFailure + breakdown.overhead;
  breakdown.computed_cost = round2(computed);
  breakdown.total_cost = item.cost_override != null ? item.cost_override : round2(computed);
  breakdown.cost_is_override = item.cost_override != null;

  // Round the working numbers for display
  breakdown.filament_cost = round2(breakdown.filament_cost);
  breakdown.material_cost = round2(breakdown.material_cost);
  breakdown.sub_item_cost = round2(breakdown.sub_item_cost);
  breakdown.machine_cost = round2(breakdown.machine_cost);
  breakdown.labor_cost = round2(breakdown.labor_cost);
  breakdown.failure_allowance = round2(breakdown.failure_allowance);
  breakdown.overhead = round2(breakdown.overhead);
  breakdown.total_grams = round2(breakdown.total_grams);
  breakdown.print_minutes_per_unit = round2(breakdown.print_minutes_per_unit);

  return breakdown;
}

/** Suggested wholesale / retail off the rolled-up cost, honouring overrides. */
function computeItemPricing(item, cost, settings = getSettings()) {
  const suggestedWholesale = roundPrice(
    cost * (1 + settings.wholesale_markup_percent / 100),
    settings.price_rounding
  );
  const suggestedRetail = roundPrice(
    suggestedWholesale * settings.retail_multiplier,
    settings.price_rounding
  );
  const wholesale = item.wholesale_override != null ? item.wholesale_override : suggestedWholesale;
  const retail = item.retail_override != null ? item.retail_override : suggestedRetail;

  return {
    suggested_wholesale: suggestedWholesale,
    suggested_retail: suggestedRetail,
    wholesale_price: round2(wholesale),
    retail_price: round2(retail),
    wholesale_is_override: item.wholesale_override != null,
    retail_is_override: item.retail_override != null,
    wholesale_margin_percent: wholesale > 0 ? round2(((wholesale - cost) / wholesale) * 100) : 0,
    retail_margin_percent: retail > 0 ? round2(((retail - cost) / retail) * 100) : 0,
    profit_wholesale: round2(wholesale - cost),
    profit_retail: round2(retail - cost),
  };
}

/** Cost + pricing for one item, ready to hand to the UI. */
/** The places this shop sells, in the order they should be shown. */
function salesChannels() {
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'sales_channels'").get()?.value;
  return String(raw ?? 'Shopify,Faire,Etsy,Amazon')
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * What an item makes on each channel. Channels with no price set still appear,
 * so the gap is visible rather than absent.
 */
function channelPricing(itemId, unitCost) {
  const stored = new Map(
    db.prepare('SELECT channel, price FROM item_channel_prices WHERE item_id = ?').all(itemId)
      .map((r) => [r.channel, r.price])
  );

  return salesChannels().map((channel) => {
    const price = stored.get(channel);
    const set = price != null;
    return {
      channel,
      price: set ? round2(price) : null,
      profit: set ? round2(price - unitCost) : null,
      margin_percent: set && price > 0 ? round2(((price - unitCost) / price) * 100) : null,
      below_cost: set ? price < unitCost : false,
    };
  });
}

function priceItem(itemId, settings = getSettings()) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);
  if (!item) return null;
  const breakdown = computeItemCost(itemId, settings);
  const pricing = computeItemPricing(item, breakdown.total_cost, settings);
  return {
    ...item,
    cost_breakdown: breakdown,
    unit_cost: breakdown.total_cost,
    ...pricing,
    channel_prices: channelPricing(itemId, breakdown.total_cost),
  };
}

/**
 * Flatten an item's filament demand into { filament_id: grams } for one unit,
 * so the queue can project what a print run will actually burn.
 */
function filamentDemandForItem(itemId, seen = new Set()) {
  const demand = {};
  if (seen.has(itemId)) return demand;
  const nextSeen = new Set(seen).add(itemId);

  const components = db
    .prepare('SELECT * FROM item_components WHERE item_id = ?')
    .all(itemId);

  for (const c of components) {
    if (c.component_type === 'filament') {
      demand[c.ref_id] = (demand[c.ref_id] || 0) + (c.quantity || 0);
    } else if (c.component_type === 'item') {
      const sub = filamentDemandForItem(c.ref_id, nextSeen);
      for (const [fid, grams] of Object.entries(sub)) {
        demand[fid] = (demand[fid] || 0) + grams * (c.quantity || 0);
      }
    }
  }
  return demand;
}

/** Same idea for consumable materials: { material_id: quantity } per unit. */
function materialDemandForItem(itemId, seen = new Set()) {
  const demand = {};
  if (seen.has(itemId)) return demand;
  const nextSeen = new Set(seen).add(itemId);

  const components = db
    .prepare('SELECT * FROM item_components WHERE item_id = ?')
    .all(itemId);

  for (const c of components) {
    if (c.component_type === 'material') {
      demand[c.ref_id] = (demand[c.ref_id] || 0) + (c.quantity || 0);
    } else if (c.component_type === 'item') {
      const sub = materialDemandForItem(c.ref_id, nextSeen);
      for (const [mid, qty] of Object.entries(sub)) {
        demand[mid] = (demand[mid] || 0) + qty * (c.quantity || 0);
      }
    }
  }
  return demand;
}

module.exports = {
  getSettings,
  salesChannels,
  channelPricing,
  computeItemCost,
  previewItemCost,
  computeItemPricing,
  priceItem,
  filamentDemandForItem,
  materialDemandForItem,
  materialUnitCost,
  roundPrice,
  round2,
  NUMERIC_DEFAULTS,
};
