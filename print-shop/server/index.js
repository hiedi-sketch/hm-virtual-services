require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
  console.error('\n❌  JWT_SECRET and JWT_REFRESH_SECRET must be set.');
  console.error('   Local: copy server/.env.example to server/.env and fill them in.');
  console.error('   Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\n');
  process.exit(1);
}

require('./db/schema');

const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 4000;

// Render terminates TLS at its proxy; without this, req.ip is the proxy's.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// In production the API and the client are the same origin, so no CORS grant is
// needed at all. In development the Vite dev server is a different port.
if (!IS_PRODUCTION) {
  app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5174', credentials: true }));
} else if (process.env.CLIENT_URL) {
  app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
}

// The raw body is kept because Shopify signs it: a re-serialised body would
// not match the signature it sent.
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Render pings this to decide whether a deploy came up healthy.
app.get('/api/health', (req, res) => res.json({ ok: true }));

// Shopify has no account here, so this one endpoint sits outside the sign-in
// and proves itself with the signature on its body instead.
app.use('/api/shopify/webhook', require('./routes/shopify-webhook'));

app.use('/api', require('./routes'));
app.use('/api', (req, res) => res.status(404).json({ error: 'No such endpoint' }));

// ── Serve the built client in production ─────────────────────────────────────
if (IS_PRODUCTION) {
  const clientBuild = path.join(__dirname, '../client/dist');
  const fs = require('fs');
  if (!fs.existsSync(path.join(clientBuild, 'index.html'))) {
    console.error(`\n❌  No client build at ${clientBuild}. Run "npm run build" from print-shop/.\n`);
    process.exit(1);
  }

  // Hashed asset filenames can be cached hard; index.html must never be.
  app.use(express.static(clientBuild, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.get('*', (req, res) => res.sendFile(path.join(clientBuild, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: IS_PRODUCTION ? 'Something went wrong' : err.message });
});

const server = app.listen(PORT, () => {
  console.log(`Print Shop running on port ${PORT}${IS_PRODUCTION ? '' : ' — API only, run the client separately'}`);
  // Catches any order whose webhook never arrived.
  require('./services/shopify-poll').start();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌  Port ${PORT} is already in use. Free it, or set PORT in server/.env.\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});
