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

// Replace the inherited Polsia R2 uploader at runtime with the owned Sugar Oak Lane
// media service. Existing upload UI/API calls continue to work unchanged.
patch(
  'durable media upload bridge',
  "app.post('/api/admin/upload', (req, res, next) => {",
  `uploadToR2 = async function(buffer, r2Key, mimeType) {
    const base = String(process.env.MEDIA_SERVICE_URL || '').replace(/\\/$/, '');
    const adminKey = process.env.ADMIN_API_KEY || '';
    if (!base || !adminKey) throw new Error('Owned media service is not configured');
    const key = String(r2Key || '').replace(/^sugaroakos\\//, '');
    const form = new FormData();
    const filename = path.basename(key) || 'image';
    form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), filename);
    form.append('key', key);
    const response = await fetch(base + '/api/upload', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: form
    });
    const body = await response.text();
    if (!response.ok) throw new Error('Owned media upload failed: HTTP ' + response.status + ' ' + body.slice(0, 200));
    let data;
    try { data = JSON.parse(body); } catch { throw new Error('Owned media service returned invalid JSON'); }
    if (!data.key) throw new Error('Owned media service did not return a media key');
    return '/media-store/' + String(data.key).split('/').map(encodeURIComponent).join('/');
  };

app.post('/api/admin/upload', (req, res, next) => {`
);

// Preserve owned-media relative URLs in the admin media library instead of
// rewriting them to the old Postgres base64 endpoint.
patch(
  'preserve owned media urls',
  "url: (img.url && img.url.startsWith('http')) ? img.url : `/api/media/${img.id}`",
  "url: (img.url && (img.url.startsWith('http') || img.url.startsWith('/media-store/'))) ? img.url : `/api/media/${img.id}`"
);

// Stable application-level media path. The database never needs to know the
// Railway service hostname, so we can move the media backend later without
// rewriting all product records.
patch(
  'owned media proxy route',
  "app.use(express.static(path.join(__dirname, 'public')));",
  `app.get(/^\\/media-store\\/(.+)/, (req, res) => {
  const base = String(process.env.MEDIA_SERVICE_URL || '').replace(/\\/$/, '');
  if (!base) return res.status(503).send('Media service unavailable');
  const key = String(req.params[0] || '').split('/').map(encodeURIComponent).join('/');
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  return res.redirect(302, base + '/media/' + key);
});

app.use(express.static(path.join(__dirname, 'public')));`
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
