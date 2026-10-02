const crypto = require('crypto');
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const db = require('../db/database');
const { registerTools } = require('./tools');

/**
 * The shop, over MCP, so Claude can work it.
 *
 * She says "add the USPS tracking to Pam's order" into a chat and it happens —
 * the same change the Orders screen would have made, through the same services,
 * with the same refusals. The screens are still the shop; this is another way
 * in, not a second set of rules.
 *
 * Stateless: every request builds its own server and transport and throws them
 * away. A shop on one small Render instance that sleeps between uses has
 * nothing to gain from held sessions and everything to gain from a request
 * that cannot arrive against a session the server has forgotten.
 */

/** The key that gets in, made once and kept in settings. */
function apiKey() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'mcp_api_key'").get();
  if (row?.value) return row.value;

  const made = crypto.randomBytes(24).toString('base64url');
  db.prepare("INSERT INTO settings (key, value) VALUES ('mcp_api_key', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(made);
  console.log('MCP key created — copy it from Settings to connect Claude.');
  return made;
}

/**
 * Whether this request may work the shop.
 *
 * Two ways in, because clients differ in what they can carry. Claude Code and
 * Cowork can send a header; a connector that takes nothing but a URL gets the
 * key in the path instead. Both are the one key, compared in constant time so
 * the comparison itself cannot be used to guess it a character at a time.
 */
function authorised(req) {
  const expected = apiKey();
  const header = String(req.get('authorization') || '');
  const bearer = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
  const offered = bearer || req.params.key || null;
  if (!offered) return false;

  const a = Buffer.from(String(offered));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** A fresh server with the shop's tools on it. */
function buildServer() {
  const server = new McpServer(
    { name: 'print-shop', version: '1.0.0' },
    {
      instructions:
        'The print shop: its orders, its print queue, its catalog and its drawers. '
        + 'Find an order before changing it — the user says order numbers out loud and they are not always exact. '
        + 'Shipping an order and marking a line printed both move real stock and real dates, so say what you are about to do '
        + 'and let the user confirm before calling those.',
    },
  );
  registerTools(server);
  return server;
}

async function handle(req, res) {
  if (!authorised(req)) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Not this shop\'s key. The key is in Settings, under Claude.' },
      id: null,
    });
    return;
  }

  // Built per request and closed after it, so nothing is held between calls.
  const server = buildServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,   // stateless: no session to lose
    enableJsonResponse: true,
  });

  res.on('close', () => { transport.close(); server.close(); });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP request failed:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'The shop could not answer that.' },
        id: null,
      });
    }
  }
}

const router = express.Router();

// A client that can send a header posts here.
router.post('/', handle);
// One that can only be given a URL carries the key in it instead.
router.post('/k/:key', handle);

// Streamable HTTP allows GET for a server-opened stream. This server never
// opens one, and saying so plainly beats letting a client wait on it.
const noStream = (req, res) => res.status(405).json({
  jsonrpc: '2.0',
  error: { code: -32000, message: 'This server answers on POST only.' },
  id: null,
});
router.get('/', noStream);
router.get('/k/:key', noStream);

module.exports = { router, apiKey };
