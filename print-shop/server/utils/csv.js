/**
 * A small CSV reader: quoted fields, escaped quotes, commas and newlines
 * inside quotes, CRLF, and a byte-order mark from a spreadsheet export.
 */
function parseCsv(text) {
  const input = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let started = false;

  const endField = () => { row.push(field); field = ''; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += char;
      continue;
    }

    if (char === '"' && !started) { inQuotes = true; started = true; continue; }
    if (char === ',') { endField(); continue; }
    if (char === '\r') continue;
    if (char === '\n') { endRow(); continue; }
    field += char;
    started = true;
  }

  // A file that does not end in a newline still has a last row.
  if (field !== '' || row.length) endRow();

  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/** Headers vary between exports; compare them stripped of case and padding. */
const headerKey = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Rows as objects keyed by a canonical field name.
 * `aliases` maps a canonical name to the header spellings that mean it.
 */
function readTable(text, aliases) {
  const rows = parseCsv(text);
  if (!rows.length) return { headers: [], rows: [], unmapped: [] };

  const headers = rows[0].map((h) => String(h).trim());
  const lookup = new Map();
  for (const [field, spellings] of Object.entries(aliases)) {
    for (const spelling of spellings) lookup.set(headerKey(spelling), field);
  }

  const columns = headers.map((h) => lookup.get(headerKey(h)) || null);
  const unmapped = headers.filter((h, i) => !columns[i] && h);

  const records = rows.slice(1).map((cells, index) => {
    const record = { _line: index + 2 };
    columns.forEach((field, i) => {
      if (!field) return;
      const value = String(cells[i] ?? '').trim();
      if (value !== '') record[field] = value;
    });
    return record;
  });

  return { headers, rows: records, unmapped };
}

module.exports = { parseCsv, readTable, headerKey };
