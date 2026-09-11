const fs = require('fs');
const path = require('path');

const sourcePath = path.join(__dirname, 'server.js');
const runtimePath = path.join(__dirname, '.runtime-server.js');
let src = fs.readFileSync(sourcePath, 'utf8');

function patch(label, pattern, replacement, required = true) {
  const before = src;
  src = src.replace(pattern, replacement);
  if (src === before) {
    const message = `[runtime-hardening] patch not applied: ${label}`;
    if (required) throw new Error(message);
    console.warn(message);
  } else {
    console.log(`[runtime-hardening] applied: ${label}`);
  }
}

// Railway preview domains must never compete with the permanent Sugar Oak Lane domains.
patch(
  'staging no-index header',
  "app.use(express.urlencoded({ extended: false }));",
  "app.use(express.urlencoded({ extended: false }));\n\napp.use((req, res, next) => {\n  const host = String(req.headers.host || '').toLowerCase();\n  if (host.endsWith('.up.railway.app')) {\n    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');\n  }\n  next();\n});"
);

// Never silently fall back to a known/default admin secret.
patch(
  'remove default admin secret',
  "return process.env.ADMIN_PASSWORD || process.env.POLSIA_API_KEY || 'changeme';",
  "return process.env.ADMIN_PASSWORD || process.env.ADMIN_API_KEY || process.env.POLSIA_API_KEY || '';"
);

// The inherited Polsia-era payment paths could confirm orders without verified payment.
// Keep them explicitly unavailable until the Stripe webhook implementation is connected.
patch(
  'disable legacy floral checkout',
  "app.post('/api/create-checkout-session', async (req, res) => {",
  "app.post('/api/create-checkout-session', async (req, res) => {\n  return res.status(503).json({ success: false, payment_unavailable: true, message: 'Secure online payment is being finalized. No charge or order confirmation has occurred.' });"
);
patch(
  'disable legacy direct order endpoint',
  "app.post('/api/orders', async (req, res) => {",
  "app.post('/api/orders', async (req, res) => {\n  return res.status(410).json({ success: false, message: 'This legacy order endpoint has been retired.' });"
);
patch(
  'disable unverified farm checkout',
  "app.post('/api/sol/checkout', async (req, res) => {",
  "app.post('/api/sol/checkout', async (req, res) => {\n  return res.status(503).json({ success: false, payment_unavailable: true, message: 'Secure online payment is being finalized. No charge or order confirmation has occurred.' });"
);
patch(
  'disable legacy success confirmation',
  "app.get('/order-success', async (req, res) => {",
  "app.get('/order-success', async (req, res) => {\n  return res.status(410).send('Legacy payment confirmation route retired.');"
);
patch(
  'disable unverified SOL confirmation',
  "app.get('/sol/order-confirmed', async (req, res) => {",
  "app.get('/sol/order-confirmed', async (req, res) => {\n  return res.status(410).send('Payment confirmation is available only after verified payment processing is connected.');"
);

// Retire the embedded one-time export token/route from the runtime.
patch(
  'remove embedded export token',
  /const EXPORT_TOKEN = '[a-f0-9]+';/,
  "const EXPORT_TOKEN = process.env.EXPORT_TOKEN || '';"
);
patch(
  'disable project export route',
  "app.get('/admin/export-download', async (req, res) => {",
  "app.get('/admin/export-download', async (req, res) => {\n  return res.status(404).send('Not found');"
);

fs.writeFileSync(runtimePath, src, 'utf8');
require(runtimePath);
