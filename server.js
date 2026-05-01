const express = require('express');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const multer = require('multer');
const app = express();
const port = process.env.PORT || 3000;

// Fail fast if DATABASE_URL is missing
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const APP_URL = process.env.APP_URL || 'https://sugaroakos.polsia.app';

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────
/** Minimal HTML escape for email template content */
function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Payment & Subscription Links (created via Stripe MCP — 2026-04-08)
// ─────────────────────────────────────────────────────────────────────────────
const STRIPE_LINKS = {
  subscriptions: {
    weekly_bouquet:   'https://buy.stripe.com/8x29AT6Kuf369lh04rgYU00',  // $128/mo (4x $32)
    biweekly_bouquet: 'https://buy.stripe.com/4gMcN5b0Kg7a0OL2czgYU01',  // $76/mo (2x $38)
    monthly_bouquet:  'https://buy.stripe.com/aFa00jc4Og7a5512czgYU02',  // $45/mo
  },
  payments: {
    mixed_seasonal_bucket:  'https://buy.stripe.com/00w5kD7OybQUbtp5oLgYU03',  // $55
    dahlia_growers_bucket:  'https://buy.stripe.com/5kQcN59WGaMQbtp2czgYU04',  // $72
    event_growers_bundle:   'https://buy.stripe.com/5kQ28r5Gq8EI695aJ5gYU05',  // $140
    workshop_bouquet:       'https://buy.stripe.com/5kQ4gzd8Sg7a7d97wTgYU06',  // $45
    workshop_wreath:        'https://buy.stripe.com/aFa9ATecW08c7d9cRdgYU07',  // $65
    workshop_private:       'https://buy.stripe.com/8x27sL7Oy8EI7d9eZlgYU08',  // $85
  },
};

// Auto-create media_uploads table if not exists (idempotent safety net)
pool.query(`
  CREATE TABLE IF NOT EXISTS media_uploads (
    id            SERIAL PRIMARY KEY,
    filename      VARCHAR(512)  NOT NULL,
    original_name VARCHAR(512)  NOT NULL,
    url           TEXT          NOT NULL,
    mime_type     VARCHAR(100),
    file_size     INTEGER,
    alt_text      TEXT,
    created_at    TIMESTAMPTZ   DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] media_uploads auto-create warning:', e.message));

// Auto-create analytics tables if not exists (idempotent safety net)
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_page_views (
    id         BIGSERIAL PRIMARY KEY,
    path       VARCHAR(2000) NOT NULL,
    referrer   TEXT,
    user_agent TEXT,
    ip_hash    VARCHAR(64),
    session_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] sol_page_views auto-create warning:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS sol_product_views (
    id         BIGSERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    session_id VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] sol_product_views auto-create warning:', e.message));

// Auto-create reviews table
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_reviews (
    id                SERIAL PRIMARY KEY,
    product_id        INTEGER NOT NULL,
    customer_name     VARCHAR(255) NOT NULL,
    customer_email    VARCHAR(255) NOT NULL,
    rating            INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text       TEXT,
    verified_purchase BOOLEAN DEFAULT FALSE,
    status            VARCHAR(20) DEFAULT 'approved',
    created_at        TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] sol_reviews auto-create warning:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_sol_reviews_product_status ON sol_reviews(product_id, status)`)
  .catch(() => {});

// Auto-add inventory tracking columns to sol_products (idempotent)
pool.query(`
  ALTER TABLE sol_products
    ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER DEFAULT 5
`).catch(e => console.warn('[startup] inventory columns:', e.message));

// Auto-create subscription inquiries table (idempotent safety net)
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_subscription_inquiries (
    id               SERIAL PRIMARY KEY,
    plan_type        TEXT NOT NULL CHECK (plan_type IN ('weekly', 'biweekly', 'monthly')),
    customer_name    TEXT NOT NULL,
    customer_email   TEXT NOT NULL,
    customer_phone   TEXT,
    recipient_name   TEXT,
    recipient_phone  TEXT,
    delivery_address TEXT,
    delivery_day     TEXT CHECK (delivery_day IN ('tuesday', 'thursday')),
    start_date       DATE,
    delivery_notes   TEXT,
    is_gift          BOOLEAN NOT NULL DEFAULT false,
    card_message     TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] sol_subscription_inquiries auto-create warning:', e.message));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ─────────────────────────────────────────────────────────────────────────────
// Analytics — Page View Tracking Middleware
// ─────────────────────────────────────────────────────────────────────────────
const BOT_PATTERNS = /bot|crawl|spider|slurp|facebookexternalhit|curl|wget|python|java|go-http|axios|node-fetch|undici|lighthouse|pingdom|uptimerobot|monitor|checker|scan|googlebot|bingbot|yandex|baidu|duckduckbot|semrush|ahrefs|mj12bot|dotbot|rogerbot|archive\.org/i;

function getOrSetSessionCookie(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.sol_session) return cookies.sol_session;
  const sid = crypto.randomUUID();
  res.setHeader('Set-Cookie', `sol_session=${sid}; Path=/; Max-Age=1800; SameSite=Lax; HttpOnly`);
  return sid;
}

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + (process.env.ANALYTICS_SALT || 'sol-analytics')).digest('hex').slice(0, 16);
}

// Paths that generate monitoring/infrastructure noise — never record these
const EXCLUDED_PATHS = new Set(['/health', '/favicon.ico', '/robots.txt', '/sitemap.xml']);

app.use((req, res, next) => {
  // Skip infrastructure noise paths (health checks, favicon, etc.)
  if (EXCLUDED_PATHS.has(req.path)) return next();

  // Skip API calls, admin, static assets
  if (
    req.path.startsWith('/api/') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/sol/') ||
    req.path.match(/\.(js|css|ico|png|jpg|jpeg|gif|svg|webp|woff|woff2|ttf|map|txt|xml|json)$/i)
  ) return next();

  // Skip bots
  const ua = req.headers['user-agent'] || '';
  if (BOT_PATTERNS.test(ua)) return next();

  const sessionId = getOrSetSessionCookie(req, res);
  const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
  const ipHash = hashIp(rawIp);

  // Extract UTM attribution from query string
  const q = req.query || {};
  const utmSource   = (q.utm_source   || '').slice(0, 255) || null;
  const utmMedium   = (q.utm_medium   || '').slice(0, 255) || null;
  const utmCampaign = (q.utm_campaign || '').slice(0, 255) || null;

  // Capture referrer header
  const referrer = (req.headers.referer || '').slice(0, 500) || null;

  // Fire and forget — don't block the request
  pool.query(
    `INSERT INTO sol_page_views (path, referrer, user_agent, ip_hash, session_id, utm_source, utm_medium, utm_campaign)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [req.path.slice(0, 500), referrer, ua.slice(0, 500), ipHash, sessionId, utmSource, utmMedium, utmCampaign]
  ).catch(() => {}); // silent — never block page load

  next();
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin Auth — cookie-based session (ADMIN_PASSWORD env var)
// ─────────────────────────────────────────────────────────────────────────────
function adminAuthSecret() {
  return process.env.ADMIN_PASSWORD || process.env.POLSIA_API_KEY || 'changeme';
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  header.split(';').forEach(part => {
    const eq = part.indexOf('=');
    if (eq < 0) return;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  });
  return out;
}

function signAdminCookie() {
  const val = 'admin-auth-v1';
  const sig = crypto.createHmac('sha256', adminAuthSecret()).update(val).digest('base64url');
  return `${val}.${sig}`;
}

function isValidAdminCookie(cookieVal) {
  if (!cookieVal) return false;
  const expected = signAdminCookie();
  if (cookieVal.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(cookieVal), Buffer.from(expected));
  } catch { return false; }
}

function isAdminRequest(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidAdminCookie(cookies.admin_session)) return true;
  const key = req.headers['x-api-key'] || req.query.key;
  const expected = process.env.POLSIA_API_KEY || process.env.ADMIN_API_KEY;
  return !!(expected && key === expected);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wholesale Customer Auth — separate from admin, uses ws_session cookie
// ─────────────────────────────────────────────────────────────────────────────

function signWsCookie(customerId) {
  const val = `ws-auth-v1:${customerId}`;
  const sig = crypto.createHmac('sha256', adminAuthSecret()).update(val).digest('base64url');
  return `${val}.${sig}`;
}

function parseWsCookie(cookieVal) {
  if (!cookieVal) return null;
  const lastDot = cookieVal.lastIndexOf('.');
  if (lastDot < 0) return null;
  const val = cookieVal.slice(0, lastDot);
  const sig = cookieVal.slice(lastDot + 1);
  const expectedSig = crypto.createHmac('sha256', adminAuthSecret()).update(val).digest('base64url');
  try {
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch { return null; }
  const match = val.match(/^ws-auth-v1:(\d+)$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

function getWsCustomerId(req) {
  const cookies = parseCookies(req.headers.cookie);
  return parseWsCookie(cookies.ws_session);
}

// Hash wholesale customer password using scrypt (no bcrypt dependency)
function hashWsPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyWsPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const verify = crypto.scryptSync(password, salt, 64).toString('hex');
    if (verify.length !== hash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(verify), Buffer.from(hash));
  } catch { return false; }
}

// Recursively update child category levels when a parent moves
async function updateChildLevels(pool, parentId, parentLevel) {
  const children = await pool.query('SELECT id FROM categories WHERE parent_id = $1', [parentId]);
  for (const child of children.rows) {
    const childLevel = parentLevel + 1;
    await pool.query('UPDATE categories SET level = $1 WHERE id = $2', [childLevel, child.id]);
    await updateChildLevels(pool, child.id, childLevel);
  }
}

// Get all descendant category slugs (for hierarchical filtering)
async function getDescendantSlugs(pool, parentSlug) {
  const result = await pool.query(`
    WITH RECURSIVE cat_tree AS (
      SELECT id, slug FROM categories WHERE slug = $1 AND is_active = TRUE
      UNION ALL
      SELECT c.id, c.slug FROM categories c
      INNER JOIN cat_tree ct ON c.parent_id = ct.id
      WHERE c.is_active = TRUE
    )
    SELECT slug FROM cat_tree
  `, [parentSlug]);
  return result.rows.map(r => r.slug);
}

// ─────────────────────────────────────────────────────────────────────────────
// Health check (required for Render — does NOT query DB to allow Neon suspend)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// ─────────────────────────────────────────────────────────────────────────────
// robots.txt
// ─────────────────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  res.set('Cache-Control', 'public, max-age=86400').type('text/plain').send(
`User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin.html
Disallow: /admin/
Disallow: /downloads/
Disallow: /health
Disallow: /api/

Sitemap: ${APP_URL}/sitemap.xml`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// XML Sitemap (dynamic — homepage, sol_products, blog_posts, static pages)
// 1-hour in-memory cache
// ─────────────────────────────────────────────────────────────────────────────
let _sitemapCache = null;
let _sitemapCachedAt = 0;
const SITEMAP_TTL_MS = 60 * 60 * 1000; // 1 hour

app.get('/sitemap.xml', async (req, res) => {
  try {
    const nowMs = Date.now();
    if (_sitemapCache && (nowMs - _sitemapCachedAt) < SITEMAP_TTL_MS) {
      return res.set('Content-Type', 'application/xml').send(_sitemapCache);
    }

    const [prodRes, blogRes] = await Promise.all([
      pool.query(`SELECT slug, updated_at FROM sol_products WHERE is_active = TRUE ORDER BY sort_order, id`),
      pool.query(`SELECT slug, updated_at FROM blog_posts WHERE is_published = true ORDER BY published_at DESC`).catch(() => ({ rows: [] })),
    ]);

    const today = new Date().toISOString().split('T')[0];

    // Static pages — homepage 1.0, shop 0.8, rest 0.5
    const staticUrls = [
      { loc: `${APP_URL}/`,                 priority: '1.0', changefreq: 'daily',   lastmod: today },
      { loc: `${APP_URL}/shop`,             priority: '0.8', changefreq: 'weekly',  lastmod: today },
      { loc: `${APP_URL}/workshops`,        priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/weddings`,         priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/wholesale`,        priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/wholesale-portal`, priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/blog`,             priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/about`,            priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/contact`,          priority: '0.5', changefreq: 'monthly', lastmod: today },
      { loc: `${APP_URL}/faq`,              priority: '0.5', changefreq: 'monthly', lastmod: today },
    ];

    // SOL product detail pages: /shop/product/:slug — priority 0.8
    const prodUrls = prodRes.rows.map(p => ({
      loc: `${APP_URL}/shop/product/${p.slug}`,
      priority: '0.8',
      changefreq: 'weekly',
      lastmod: p.updated_at ? p.updated_at.toISOString().split('T')[0] : today,
    }));

    // Blog post pages: /blog/:slug — priority 0.6
    const blogUrls = blogRes.rows.map(b => ({
      loc: `${APP_URL}/blog/${b.slug}`,
      priority: '0.6',
      changefreq: 'monthly',
      lastmod: b.updated_at ? b.updated_at.toISOString().split('T')[0] : today,
    }));

    const allUrls = [...staticUrls, ...prodUrls, ...blogUrls];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    _sitemapCache = xml;
    _sitemapCachedAt = nowMs;

    res.set('Content-Type', 'application/xml').send(xml);
  } catch (err) {
    console.error('[sitemap]', err.message);
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Categories (public)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description, icon, sort_order, sidebar_visible, parent_id, level
       FROM categories
       WHERE is_active = TRUE
       ORDER BY level ASC, sort_order ASC, id ASC`
    );
    // Build tree structure for clients
    const flat = result.rows;
    const byId = {};
    flat.forEach(c => { byId[c.id] = { ...c, children: [] }; });
    const roots = [];
    flat.forEach(c => {
      if (c.parent_id && byId[c.parent_id]) {
        byId[c.parent_id].children.push(byId[c.id]);
      } else {
        roots.push(byId[c.id]);
      }
    });
    res.json({ success: true, categories: flat, tree: roots });
  } catch (err) {
    console.error('[api/categories]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load categories' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN API: Categories CRUD
// ─────────────────────────────────────────────────────────────────────────────

// List all categories (admin, includes inactive) — returns flat + tree
app.get('/api/admin/categories', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const result = await pool.query(
      `SELECT id, name, slug, description, icon, sort_order, is_active, sidebar_visible,
              parent_id, level, is_floral_category, created_at
       FROM categories
       ORDER BY level ASC, sort_order ASC, id ASC`
    );
    const flat = result.rows;
    const byId = {};
    flat.forEach(c => { byId[c.id] = { ...c, children: [] }; });
    const roots = [];
    flat.forEach(c => {
      if (c.parent_id && byId[c.parent_id]) {
        byId[c.parent_id].children.push(byId[c.id]);
      } else {
        roots.push(byId[c.id]);
      }
    });
    res.json({ success: true, categories: flat, tree: roots });
  } catch (err) {
    console.error('[admin/categories GET]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create category (supports hierarchy via parent_id)
app.post('/api/admin/categories', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, is_floral_category } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, error: 'name and slug required' });
    // Compute level from parent
    let level = 0;
    if (parent_id) {
      const parentRow = await pool.query('SELECT level FROM categories WHERE id = $1', [parent_id]);
      if (parentRow.rows.length) level = (parentRow.rows[0].level || 0) + 1;
    }
    const result = await pool.query(
      `INSERT INTO categories (name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, level, is_floral_category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, slug, description || null, icon || '💐', sort_order || 0,
       is_active !== false, sidebar_visible !== false, parent_id || null, level,
       is_floral_category === true || is_floral_category === 'true']
    );
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Slug already exists' });
    console.error('[admin/categories POST]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update category (supports hierarchy via parent_id)
app.put('/api/admin/categories/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { name, slug, description, icon, sort_order, is_active, sidebar_visible, parent_id, is_floral_category } = req.body;
    // Compute level from parent
    let level = 0;
    const resolvedParentId = parent_id === '' || parent_id === undefined ? null : parent_id;
    if (resolvedParentId) {
      const parentRow = await pool.query('SELECT level FROM categories WHERE id = $1', [resolvedParentId]);
      if (parentRow.rows.length) level = (parentRow.rows[0].level || 0) + 1;
    }
    const result = await pool.query(
      `UPDATE categories
       SET name=$1, slug=$2, description=$3, icon=$4, sort_order=$5, is_active=$6, sidebar_visible=$7,
           parent_id=$8, level=$9, is_floral_category=$10
       WHERE id=$11 RETURNING *`,
      [name, slug, description || null, icon || '💐', sort_order || 0,
       is_active !== false, sidebar_visible !== false, resolvedParentId, level,
       is_floral_category === true || is_floral_category === 'true', req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Category not found' });
    // Also update children's levels if this category moved
    await updateChildLevels(pool, result.rows[0].id, level);
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Slug already exists' });
    console.error('[admin/categories PUT]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete category
app.delete('/api/admin/categories/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    await pool.query('DELETE FROM categories WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin/categories DELETE]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk reorder categories
app.put('/api/admin/categories/reorder', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { order } = req.body; // Array of { id, sort_order }
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });
    for (const item of order) {
      await pool.query('UPDATE categories SET sort_order=$1 WHERE id=$2', [item.sort_order, item.id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Products
// Query params: ?category=roses (slug filter)  ?featured=true  ?limit=N
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/products', async (req, res) => {
  try {
    const { category, featured, limit } = req.query;
    let where = `WHERE p.is_active = TRUE`;
    const params = [];

    if (category) {
      params.push(category);
      where += ` AND c.slug = $${params.length}`;
    }
    if (featured === 'true') {
      where += ` AND p.is_featured = TRUE`;
    }

    const limitClause = limit ? `LIMIT ${parseInt(limit, 10) || 100}` : '';

    const result = await pool.query(
      `SELECT p.id, p.name, p.slug, p.short_description, p.description,
              p.price_standard, p.price_deluxe, p.price_premium,
              p.image_url, p.occasion_tags, p.is_featured, p.sort_order,
              p.seo_title, p.seo_description,
              c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ${where}
       ORDER BY p.is_featured DESC, p.sort_order ASC, p.id ASC
       ${limitClause}`,
      params
    );
    res.json({ success: true, products: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[api/products]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load products' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Single Product by slug
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/products/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.slug = $1 AND p.is_active = TRUE`,
      [req.params.slug]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('[api/products/:slug]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load product' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery Zone Definitions (Tiered)
// ─────────────────────────────────────────────────────────────────────────────

// Zone definitions
const ZONE_LOGANVILLE = new Set(['30052']);
const ZONE_STANDARD = new Set(['30017', '30043', '30044', '30045', '30046', '30039', '30078', '30019', '30047']);

// Metro Atlanta — coming soon (show waitlist, no checkout)
const METRO_ATLANTA_ZIPS = new Set([
  '30301','30302','30303','30304','30305','30306','30307','30308','30309','30310',
  '30311','30312','30313','30314','30315','30316','30317','30318','30319','30320',
  '30324','30325','30326','30327','30328','30329','30330','30331','30332','30333',
  '30334','30336','30337','30338','30339','30340','30341','30342','30344','30345',
  '30346','30349','30350','30354','30355','30356','30357','30358','30359','30360',
  '30361','30362','30363','30364','30366','30368','30369','30370','30371','30374',
  '30375','30376','30377','30378','30379','30380','30384','30385','30388','30394',
  '30396','30398','30399','30060','30062','30064','30066','30067','30068','30069',
  '30075','30076','30080','30082','30084','30087','30088','30090','30092','30093',
  '30094','30096','30097','30101','30102','30103','30106','30107','30108','30009'
]);

const ZONE_FEES = {
  loganville: 12.99,
  standard: 14.99,
  metro_atlanta: 24.99
};

const EXPRESS_UPCHARGE = 6.99;

function getZoneForZip(zip) {
  const z = String(zip || '').trim();
  if (ZONE_LOGANVILLE.has(z)) return 'loganville';
  if (ZONE_STANDARD.has(z)) return 'standard';
  if (METRO_ATLANTA_ZIPS.has(z)) return 'metro_atlanta';
  return null;
}

const ZIP_CITY_MAP = {
  '30052': 'Loganville',
  '30017': 'Grayson',
  '30043': 'Lawrenceville', '30044': 'Lawrenceville', '30045': 'Lawrenceville', '30046': 'Lawrenceville',
  '30039': 'Snellville', '30078': 'Snellville',
  '30019': 'Dacula',
  '30047': 'Lilburn',
};

function extractZip(address) {
  const m = String(address || '').match(/\b(\d{5})\b/);
  return m ? m[1] : null;
}

function getDeliveryOptions(zone) {
  const baseFee = ZONE_FEES[zone] || 14.99;
  const now = new Date();
  const easternStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  const etHour = parseInt(easternStr, 10);
  const easternDay = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const isWeekday = easternDay !== 'Sun';

  const options = [];
  const totalExpress = parseFloat((baseFee + EXPRESS_UPCHARGE).toFixed(2));

  if (isWeekday && etHour < 10) {
    options.push({
      type: 'express_morning', label: '4-Hour Express — Morning',
      description: 'Delivered 9AM–12PM today',
      base_fee: baseFee, express_upcharge: EXPRESS_UPCHARGE, total_fee: totalExpress
    });
  }
  if (isWeekday && etHour < 12) {
    options.push({ type: 'same_day_morning', label: 'Morning Window', description: 'Delivered 9AM–12PM today', fee: baseFee, window: 'morning' });
    options.push({ type: 'same_day_afternoon', label: 'Afternoon Window', description: 'Delivered 12PM–4PM today', fee: baseFee, window: 'afternoon' });
  }
  if (isWeekday && etHour < 16) {
    options.push({ type: 'same_day_evening', label: 'Evening Window', description: 'Delivered 4PM–7PM today', fee: baseFee, window: 'evening' });
  }
  // Always offer next-day with time windows
  options.push({ type: 'next_day_morning', label: 'Next-Day Morning', description: 'Delivered 9AM–12PM tomorrow', fee: baseFee, window: 'morning', next_day: true });
  options.push({ type: 'next_day_afternoon', label: 'Next-Day Afternoon', description: 'Delivered 12PM–4PM tomorrow', fee: baseFee, window: 'afternoon', next_day: true });
  options.push({ type: 'next_day_evening', label: 'Next-Day Evening', description: 'Delivered 4PM–7PM tomorrow', fee: baseFee, window: 'evening', next_day: true });

  return options;
}

// ─────────────────────────────────────────────────────────────────────────────
// API: Check delivery zone (for frontend zip validation)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/check-zip', (req, res) => {
  const { zip } = req.body || {};
  const cleanZip = String(zip || '').trim().slice(0, 5);
  const zone = getZoneForZip(cleanZip);
  const city = ZIP_CITY_MAP[cleanZip] || null;

  if (!zone) {
    return res.json({ success: true, in_zone: false, coming_soon: false, zip: cleanZip });
  }

  if (zone === 'metro_atlanta') {
    return res.json({
      success: true,
      in_zone: false,
      coming_soon: true,
      zone: 'metro_atlanta',
      base_delivery_fee: ZONE_FEES.metro_atlanta,
      zip: cleanZip,
      message: 'Coming Soon to Atlanta — join the waitlist to be notified!'
    });
  }

  const deliveryOptions = getDeliveryOptions(zone);
  const baseFee = ZONE_FEES[zone];

  res.json({
    success: true,
    in_zone: true,
    zone,
    city,
    zip: cleanZip,
    base_delivery_fee: baseFee,
    delivery_options: deliveryOptions,
    coming_soon: false
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Create Stripe Checkout Session
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { order_data } = req.body;
    if (!order_data) {
      return res.status(400).json({ success: false, message: 'order_data is required.' });
    }

    // Validate order data
    const zip = order_data.delivery_zip;
    const zone = getZoneForZip(zip);
    if (!zone || zone === 'metro_atlanta') {
      return res.status(400).json({ success: false, message: 'Delivery not available for this ZIP code.' });
    }

    if (!order_data.sender_name || !order_data.sender_email || !order_data.delivery_address) {
      return res.status(400).json({ success: false, message: 'Sender name, email, and delivery address are required.' });
    }

    if (!order_data.cancellation_accepted) {
      return res.status(400).json({ success: false, message: 'You must accept the cancellation policy.' });
    }

    // Calculate total
    const productPrice = parseFloat(order_data.price_product) || 0;
    const baseFee = ZONE_FEES[zone];
    const isExpress = (order_data.delivery_type || '').indexOf('express') !== -1;
    const expressFee = isExpress ? EXPRESS_UPCHARGE : 0;
    const addOnsTotal = parseFloat(order_data.add_ons_total) || 0;
    const totalAmount = parseFloat((productPrice + addOnsTotal + baseFee + expressFee).toFixed(2));

    // Store order as pending_payment in sol_orders
    const itemsJson = JSON.stringify([{
      name: order_data.product_name || 'Custom Arrangement',
      price: productPrice,
      quantity: 1,
      slug: order_data.product_slug || '',
      tier: order_data.tier || 'standard',
    }]);
    const metaJson = JSON.stringify({
      add_ons: order_data.add_ons || [],
      add_ons_total: addOnsTotal,
      express_fee: expressFee,
      substitution_allowed: order_data.substitution_allowed,
      substitution_notes: order_data.substitution_notes || '',
      service_date: order_data.service_date || null,
      cancellation_accepted: order_data.cancellation_accepted,
      recipient_phone: order_data.recipient_phone || null,
      forwarding_address: (order_data.forwarding_address || '').trim() || null,
      zone,
    });
    const orderResult = await pool.query(
      `INSERT INTO sol_orders
         (status, fulfillment_type, tracker_stage,
          customer_name, customer_email, customer_phone,
          recipient_name, shipping_address, shipping_city, shipping_state, shipping_zip,
          delivery_zip, delivery_fee, total_price,
          delivery_date, delivery_window, card_message,
          product_name, tier, items, metadata)
       VALUES ('pending_payment','delivery','order_received',$1,$2,$3,$4,$5,$6,'GA',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
       RETURNING id`,
      [
        order_data.sender_name.trim(),
        order_data.sender_email.trim(),
        (order_data.sender_phone || '').trim() || null,
        (order_data.recipient_name || '').trim() || null,
        order_data.delivery_address.trim(),
        ZIP_CITY_MAP[zip] || null,
        zip,
        baseFee + expressFee,
        totalAmount,
        order_data.delivery_date || null,
        order_data.delivery_window || null,
        (order_data.card_message || '').trim() || null,
        order_data.product_name || null,
        order_data.tier || 'standard',
        itemsJson,
        metaJson,
      ]
    );
    const orderId = orderResult.rows[0].id;
    // Generate human-readable order number
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const orderNumber = `SOL-${today}-${String(orderId).padStart(4,'0')}`;
    await pool.query(`UPDATE sol_orders SET order_number = $1 WHERE id = $2`, [orderNumber, orderId]);
    console.log(`[create-checkout-session] New order #${orderId} (${orderNumber}) — ${order_data.product_name} → ${order_data.delivery_address} (zip ${zip}, total $${totalAmount})`);

    // Create Stripe checkout session via Polsia payment proxy
    const polsiaApiKey = process.env.POLSIA_API_KEY;
    if (!polsiaApiKey) {
      // No payment key configured — fall back to pending order (mark confirmed, skip Stripe)
      await pool.query(`UPDATE sol_orders SET status='confirmed', tracker_stage='order_received' WHERE id=$1`, [orderId]);
      console.warn('[create-checkout-session] POLSIA_API_KEY not set — skipping Stripe, order confirmed');
      return res.json({ success: true, order_id: orderId, order_number: orderNumber, fallback: true, redirect_url: `/order-tracker?order=${orderNumber}&confirmed=1`, total_price: totalAmount });
    }

    const checkoutRes = await fetch('https://polsia.com/api/payments/checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${polsiaApiKey}`
      },
      body: JSON.stringify({
        amount: totalAmount,
        name: `Sugar Oak Lane — ${order_data.product_name || 'Arrangement'}`,
        description: `Delivery to ${order_data.delivery_address}`,
        success_url: `${APP_URL}/order-success?order_id=${orderId}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${APP_URL}/?cancelled=1`
      })
    });

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text();
      console.error('[create-checkout-session] Polsia payment API error:', checkoutRes.status, errText);
      // Fallback: mark order as confirmed and redirect to tracker
      await pool.query(`UPDATE sol_orders SET status='confirmed', tracker_stage='order_received' WHERE id=$1`, [orderId]);
      return res.json({ success: true, order_id: orderId, order_number: orderNumber, fallback: true, redirect_url: `/order-tracker?order=${orderNumber}&confirmed=1`, total_price: totalAmount });
    }

    const checkoutData = await checkoutRes.json();
    res.json({ success: true, checkout_url: checkoutData.url, order_id: orderId, order_number: orderNumber, total_price: totalAmount });
  } catch (err) {
    console.error('[create-checkout-session]', err.message);
    res.status(500).json({ success: false, message: 'Failed to create checkout. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Place an Order (legacy endpoint — kept for backward compat)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/orders', async (req, res) => {
  try {
    const {
      product_slug, product_name, tier, arrangement,
      price_product,
      delivery_type, delivery_window, delivery_date,
      sender_name, sender_email, sender_phone,
      recipient_name, delivery_address, delivery_zip,
      card_message,
    } = req.body || {};

    if (!sender_name || !sender_name.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required.' });
    }
    if (!delivery_address || !delivery_address.trim()) {
      return res.status(400).json({ success: false, message: 'Delivery address is required.' });
    }

    const zip = delivery_zip || extractZip(delivery_address);
    const zone = getZoneForZip(zip);
    if (!zone || zone === 'metro_atlanta') {
      return res.status(400).json({
        success: false,
        out_of_zone: true,
        message: `We don't currently deliver to zip code ${zip || '(unknown)'}. We serve Loganville, Grayson, Lawrenceville & Snellville, GA.`,
      });
    }

    const addOns = Array.isArray(req.body.add_ons) ? req.body.add_ons : [];
    const addOnsTotal = parseFloat(req.body.add_ons_total) || addOns.reduce((s, ao) => s + (parseFloat(ao.subtotal) || 0), 0);

    const productPrice = parseFloat(price_product) || 0;
    const isExpress = (delivery_type || '').indexOf('express') !== -1;
    const baseFee = ZONE_FEES[zone];
    const expressFee = isExpress ? EXPRESS_UPCHARGE : 0;
    const deliveryFee = baseFee + expressFee;
    const totalPrice = parseFloat((productPrice + addOnsTotal + deliveryFee).toFixed(2));

    const orderMetadata = JSON.stringify({
      add_ons:               addOns,
      add_ons_total:         addOnsTotal,
      delivery_location_type: req.body.delivery_location_type || 'residential',
      leave_at_door:         req.body.leave_at_door || null,
      location_details:      req.body.location_details || {},
      substitution_must_haves: req.body.substitution_must_haves || [],
      express_fee: expressFee,
    });

    const legacyItems = JSON.stringify([{
      name: product_name || arrangement || 'Custom Arrangement',
      price: productPrice,
      quantity: 1,
      slug: product_slug || '',
      tier: tier || 'standard',
    }]);

    const result = await pool.query(
      `INSERT INTO sol_orders
         (status, fulfillment_type, tracker_stage,
          customer_name, customer_email, customer_phone,
          recipient_name, shipping_address, shipping_city, shipping_state, shipping_zip,
          delivery_zip, delivery_fee, total_price,
          delivery_date, delivery_window, card_message,
          product_name, tier, items, metadata)
       VALUES ('confirmed','delivery','order_received',$1,$2,$3,$4,$5,$6,'GA',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb)
       RETURNING id, created_at`,
      [
        sender_name.trim(),
        (sender_email || '').trim() || null,
        (sender_phone || '').trim() || null,
        (recipient_name || '').trim() || null,
        delivery_address.trim(),
        ZIP_CITY_MAP[zip] || null,
        zip,
        deliveryFee,
        totalPrice,
        delivery_date || null,
        delivery_window || null,
        (card_message || '').trim() || null,
        product_name || arrangement || null,
        tier || 'standard',
        legacyItems,
        orderMetadata,
      ]
    );

    const order = result.rows[0];
    // Generate human-readable order number
    const todayStr = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const orderNum = `SOL-${todayStr}-${String(order.id).padStart(4,'0')}`;
    await pool.query(`UPDATE sol_orders SET order_number = $1 WHERE id = $2`, [orderNum, order.id]);
    console.log(`[api/orders] New order #${order.id} (${orderNum}) — ${arrangement} → ${delivery_address} (zip ${zip})`);

    res.json({
      success: true,
      order_id: order.id,
      order_number: orderNum,
      total_price: totalPrice,
      delivery_type: delivery_type || 'standard',
      message: 'Order placed successfully.',
    });
  } catch (err) {
    console.error('[api/orders]', err.message);
    res.status(500).json({ success: false, message: 'Failed to place order. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Waitlist (out-of-zone email capture)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/waitlist', async (req, res) => {
  try {
    const { email, zip_code, city, state, source } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }

    await pool.query(
      `INSERT INTO waitlist (email, zip_code, city, state, source)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET zip_code = EXCLUDED.zip_code`,
      [
        email.trim().toLowerCase(),
        (zip_code || '').trim() || null,
        (city || '').trim() || null,
        (state || 'GA').trim(),
        source || 'storefront',
      ]
    );

    console.log(`[api/waitlist] ${email} added (zip: ${zip_code})`);
    res.json({ success: true, message: "You're on the list! We'll notify you when we expand to your area." });
  } catch (err) {
    console.error('[api/waitlist]', err.message);
    res.status(500).json({ success: false, message: 'Failed to join waitlist. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Newsletter subscription (sol_subscribers + WELCOME10 discount code)
// ─────────────────────────────────────────────────────────────────────────────
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_subscribers (
    id                 SERIAL PRIMARY KEY,
    email              VARCHAR(320) NOT NULL UNIQUE,
    subscribed_at      TIMESTAMPTZ DEFAULT NOW(),
    source             VARCHAR(100) DEFAULT 'homepage',
    discount_code_used BOOLEAN NOT NULL DEFAULT FALSE
  )
`).catch(e => console.warn('[startup] sol_subscribers auto-create warning:', e.message));

// Auto-create email sequence table
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_email_sequence (
    id               SERIAL PRIMARY KEY,
    subscriber_email VARCHAR(320) NOT NULL,
    sequence_step    SMALLINT NOT NULL CHECK (sequence_step IN (1, 2, 3)),
    scheduled_for    TIMESTAMPTZ NOT NULL,
    sent_at          TIMESTAMPTZ,
    status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    created_at       TIMESTAMPTZ DEFAULT NOW()
  )
`).then(() => pool.query(`
  CREATE UNIQUE INDEX IF NOT EXISTS sol_email_sequence_unique_step_idx
  ON sol_email_sequence (subscriber_email, sequence_step)
`)).then(() => pool.query(`
  CREATE INDEX IF NOT EXISTS sol_email_sequence_pending_idx
  ON sol_email_sequence (scheduled_for, status)
  WHERE status = 'pending'
`)).catch(e => console.warn('[startup] sol_email_sequence auto-create warning:', e.message));

// Enqueue 3-step nurture sequence for a new subscriber
async function enqueueEmailSequence(email) {
  const now = new Date();
  const steps = [
    { step: 1, delayDays: 1 },
    { step: 2, delayDays: 3 },
    { step: 3, delayDays: 5 },
  ];
  for (const { step, delayDays } of steps) {
    const scheduled = new Date(now.getTime() + delayDays * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO sol_email_sequence (subscriber_email, sequence_step, scheduled_for)
       VALUES ($1, $2, $3) ON CONFLICT (subscriber_email, sequence_step) DO NOTHING`,
      [email, step, scheduled]
    );
  }
  console.log(`[email-sequence] Enqueued 3-step nurture for ${email}`);
}

async function sendWelcomeEmail(email) {
  return sendEmail({
    to: email,
    subject: '🌿 Welcome to Sugar Oak Lane — Your 10% Off Code',
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Welcome to the Farm Family</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:600">Thanks for joining the Garden Club!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">You'll be the first to know about new varieties, seasonal updates, workshop dates, and farm stories. We're so glad you're here.</p>
    <div style="background:#f0fdf4;border:2px solid #3A5A40;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Your Welcome Gift</p>
      <div style="font-family:'Courier New',monospace;font-size:32px;font-weight:700;color:#3A5A40;letter-spacing:0.15em;margin:12px 0">WELCOME10</div>
      <p style="margin:0;font-size:14px;color:#374151">10% off your first order · applies at checkout</p>
    </div>
    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/shop" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px">Shop Now</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:#3A5A40">Sugar Oak Lane</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">Farm-Fresh Flowers · Loganville, GA</p>
  </div>
</div></body></html>`,
    text: `Welcome to Sugar Oak Lane! Use code WELCOME10 at checkout for 10% off your first order. Shop at ${APP_URL}/shop`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Email nurture sequence — 3-step drip after WELCOME10 signup
// ─────────────────────────────────────────────────────────────────────────────

function buildNurtureEmail1Html() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Welcome to the Farm</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.7">Hi there,</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7">Welcome to Sugar Oak Lane — I'm so glad you're here.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7">We're a small specialty cut flower farm nestled in <strong>Loganville, Georgia</strong>, growing with care for the land. While we're not certified organic, we follow sustainable, low-spray practices — because we believe flowers grown with intention are flowers worth having in your home.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.7">Sugar Oak Lane started as a dream and a patch of dirt. Today we grow dozens of specialty varieties — from heirloom zinnias and lisianthus to dahlias and ranunculus — each one chosen for its beauty, vase life, and the joy it brings.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7">Whether you're looking for a weekly bouquet, seeds to start your own cutting garden, or flowers for a special occasion — we've got you covered.</p>
    <div style="background:#f0fdf4;border:2px solid #3A5A40;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Your Welcome Gift</p>
      <div style="font-family:'Courier New',monospace;font-size:30px;font-weight:700;color:#3A5A40;letter-spacing:0.15em;margin:8px 0">WELCOME10</div>
      <p style="margin:0;font-size:14px;color:#374151">10% off your first order · applies at checkout</p>
    </div>
    <div style="text-align:center;margin-bottom:28px">
      <a href="${APP_URL}/shop" style="display:inline-block;background:#3A5A40;color:#FEFDF8;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.3px">Shop the Farm →</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">You'll hear from us a couple more times this week — we want to make sure you find something you love.</p>
    <p style="margin:16px 0 0;font-size:14px;color:#374151">With warmth,<br><strong style="color:#3A5A40">Sugar Oak Lane</strong><br><span style="color:#9ca3af;font-size:13px">Loganville, GA</span></p>
  </div>
</div></body></html>`;
}

async function buildNurtureEmail2Html() {
  // Fetch 3–4 featured products from DB (newest non-out-of-stock arrangements & seeds)
  let productRows = [];
  try {
    const r = await pool.query(
      `SELECT name, price, images, description, id
       FROM sol_products
       WHERE (out_of_stock IS NULL OR out_of_stock = false)
         AND (sold_out IS NULL OR sold_out = false)
         AND images IS NOT NULL AND array_length(images, 1) > 0
       ORDER BY created_at DESC LIMIT 4`
    );
    productRows = r.rows;
  } catch (e) {
    console.warn('[email-sequence] Could not fetch products for email 2:', e.message);
  }

  const productCards = productRows.map(p => {
    const img = p.images && p.images[0] ? p.images[0] : '';
    const price = p.price ? `$${parseFloat(p.price).toFixed(2)}` : '';
    const shopUrl = `${APP_URL}/shop/product/${p.id}`;
    return `
    <div style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      ${img ? `<img src="${img}" alt="${p.name}" style="width:100%;height:200px;object-fit:cover;display:block">` : ''}
      <div style="padding:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong style="font-size:15px;color:#374151">${p.name}</strong>
          ${price ? `<span style="font-size:14px;color:#3A5A40;font-weight:600">${price}</span>` : ''}
        </div>
        ${p.description ? `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;line-height:1.5">${String(p.description).substring(0, 100)}${p.description.length > 100 ? '…' : ''}</p>` : ''}
        <a href="${shopUrl}" style="display:inline-block;background:#3A5A40;color:#FEFDF8;text-decoration:none;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600">Shop Now →</a>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌸 What's Growing This Season</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <p style="margin:0 0 8px;font-size:16px;color:#374151;line-height:1.7">The fields are looking beautiful right now.</p>
    <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7">Here are a few of our favorites available in the shop this season — grown right here in Loganville and ready to bring some color into your home.</p>
    ${productCards || '<p style="color:#6b7280;font-size:14px">Browse everything in bloom at the shop.</p>'}
    <div style="text-align:center;margin-top:28px;margin-bottom:20px">
      <a href="${APP_URL}/shop" style="display:inline-block;background:#3A5A40;color:#FEFDF8;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">See Everything in the Shop →</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af">Don't forget — your <strong>WELCOME10</strong> code is still waiting for you at checkout.</p>
    <p style="margin:16px 0 0;font-size:14px;color:#374151">With warmth,<br><strong style="color:#3A5A40">Sugar Oak Lane</strong></p>
  </div>
</div></body></html>`;
}

async function buildNurtureEmail3Html() {
  // Fetch top-viewed products for urgency email
  let productRows = [];
  try {
    const r = await pool.query(
      `SELECT p.name, p.price, p.images, p.id, COUNT(v.id) AS view_count
       FROM sol_products p
       LEFT JOIN sol_product_views v ON v.product_id = p.id
       WHERE (p.out_of_stock IS NULL OR p.out_of_stock = false)
         AND (p.sold_out IS NULL OR p.sold_out = false)
         AND p.images IS NOT NULL AND array_length(p.images, 1) > 0
       GROUP BY p.id, p.name, p.price, p.images
       ORDER BY view_count DESC, p.created_at DESC LIMIT 3`
    );
    productRows = r.rows;
  } catch (e) {
    console.warn('[email-sequence] Could not fetch top products for email 3:', e.message);
  }

  const productCards = productRows.map(p => {
    const img = p.images && p.images[0] ? p.images[0] : '';
    const price = p.price ? `$${parseFloat(p.price).toFixed(2)}` : '';
    const shopUrl = `${APP_URL}/shop/product/${p.id}`;
    return `
    <div style="display:flex;align-items:center;gap:16px;padding:14px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px">
      ${img ? `<img src="${img}" alt="${p.name}" style="width:72px;height:72px;object-fit:cover;border-radius:8px;flex-shrink:0">` : ''}
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:14px;color:#374151;margin-bottom:4px">${p.name}</div>
        ${price ? `<div style="font-size:13px;color:#3A5A40;font-weight:600;margin-bottom:8px">${price}</div>` : ''}
        <a href="${shopUrl}" style="font-size:12px;color:#3A5A40;font-weight:600;text-decoration:none">Shop Now →</a>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">⏳ Your 10% Off is Waiting</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px">
    <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.7">Hey — just a friendly reminder.</p>
    <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7">Your <strong>WELCOME10</strong> discount code is still sitting there, waiting for you. It gives you <strong>10% off your entire first order</strong> — flowers, seeds, arrangements, everything.</p>
    <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px">
      <p style="margin:0 0 4px;font-size:13px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">Your Discount Code</p>
      <div style="font-family:'Courier New',monospace;font-size:28px;font-weight:700;color:#92400e;letter-spacing:0.15em;margin:6px 0">WELCOME10</div>
      <p style="margin:0;font-size:13px;color:#92400e">Use it before it's gone — first order only</p>
    </div>
    ${productCards ? `<p style="margin:0 0 16px;font-size:14px;color:#374151;font-weight:600">Our most popular picks right now:</p>${productCards}` : ''}
    <div style="text-align:center;margin-top:24px;margin-bottom:20px">
      <a href="${APP_URL}/shop" style="display:inline-block;background:#3A5A40;color:#FEFDF8;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">Use Your Discount Before It's Gone →</a>
    </div>
    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6">Farm-fresh flowers, grown with care in Loganville, GA. We'd love to be part of your home.</p>
    <p style="margin:16px 0 0;font-size:14px;color:#374151">With warmth,<br><strong style="color:#3A5A40">Sugar Oak Lane</strong></p>
  </div>
</div></body></html>`;
}

// Process pending email sequence rows — called on an interval
// Retry logic: emails retry up to 5 times with 30-min backoff before permanently failing
const EMAIL_MAX_RETRIES = 5;
const EMAIL_RETRY_DELAY_MS = 30 * 60 * 1000; // 30 minutes between retries

let _sequenceProcessing = false;
async function processEmailSequences() {
  if (_sequenceProcessing) return;
  _sequenceProcessing = true;
  try {
    // Ensure retry_count column exists (safe to run repeatedly)
    await pool.query(`ALTER TABLE sol_email_sequence ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0`).catch(() => {});

    // Fetch up to 5 pending rows that are due
    const { rows } = await pool.query(
      `SELECT id, subscriber_email, sequence_step, retry_count
       FROM sol_email_sequence
       WHERE status = 'pending' AND scheduled_for <= NOW()
       ORDER BY scheduled_for ASC
       LIMIT 5`
    );
    if (rows.length === 0) { _sequenceProcessing = false; return; }

    console.log(`[email-sequence] Processing ${rows.length} pending email(s)`);

    for (const row of rows) {
      const { id, subscriber_email, sequence_step, retry_count } = row;
      try {
        let subject, html, text;
        if (sequence_step === 1) {
          subject = '🌿 Welcome to Sugar Oak Lane — The Farm Story';
          html = buildNurtureEmail1Html();
          text = `Welcome to Sugar Oak Lane! We're a specialty cut flower farm in Loganville, GA. Your WELCOME10 code gives you 10% off your first order. Shop at ${APP_URL}/shop`;
        } else if (sequence_step === 2) {
          subject = '🌸 What\'s Growing at Sugar Oak Lane This Season';
          html = await buildNurtureEmail2Html();
          text = `See what's growing at the farm this season. Shop at ${APP_URL}/shop — and don't forget your WELCOME10 code for 10% off!`;
        } else if (sequence_step === 3) {
          subject = '⏳ Your 10% Off is Still Waiting — Sugar Oak Lane';
          html = await buildNurtureEmail3Html();
          text = `Your WELCOME10 discount code is still waiting. 10% off your first order at ${APP_URL}/shop — use it before it's gone!`;
        }

        const result = await sendEmail({ to: subscriber_email, subject, html, text });
        if (result.success) {
          await pool.query(
            `UPDATE sol_email_sequence SET status = 'sent', sent_at = NOW() WHERE id = $1`,
            [id]
          );
          console.log(`[email-sequence] Sent step ${sequence_step} to ${subscriber_email}`);
        } else {
          const newRetryCount = (retry_count || 0) + 1;
          if (newRetryCount >= EMAIL_MAX_RETRIES) {
            // Permanently fail after max retries
            await pool.query(
              `UPDATE sol_email_sequence SET status = 'failed', retry_count = $2 WHERE id = $1`,
              [id, newRetryCount]
            );
            console.error(`[email-sequence] Permanently failed step ${sequence_step} to ${subscriber_email} after ${newRetryCount} retries: ${result.reason}`);
          } else {
            // Retry later — push scheduled_for forward and increment retry_count
            const retryAt = new Date(Date.now() + EMAIL_RETRY_DELAY_MS);
            await pool.query(
              `UPDATE sol_email_sequence SET retry_count = $2, scheduled_for = $3 WHERE id = $1`,
              [id, newRetryCount, retryAt]
            );
            console.warn(`[email-sequence] Retry ${newRetryCount}/${EMAIL_MAX_RETRIES} for step ${sequence_step} to ${subscriber_email} (next: ${retryAt.toISOString()}): ${result.reason}`);
          }
        }
      } catch (err) {
        const newRetryCount = (row.retry_count || 0) + 1;
        if (newRetryCount >= EMAIL_MAX_RETRIES) {
          await pool.query(
            `UPDATE sol_email_sequence SET status = 'failed', retry_count = $2 WHERE id = $1`,
            [id, newRetryCount]
          ).catch(() => {});
          console.error(`[email-sequence] Permanently failed step ${sequence_step} to ${subscriber_email} after ${newRetryCount} retries: ${err.message}`);
        } else {
          const retryAt = new Date(Date.now() + EMAIL_RETRY_DELAY_MS);
          await pool.query(
            `UPDATE sol_email_sequence SET retry_count = $2, scheduled_for = $3 WHERE id = $1`,
            [id, newRetryCount, retryAt]
          ).catch(() => {});
          console.warn(`[email-sequence] Retry ${newRetryCount}/${EMAIL_MAX_RETRIES} for step ${sequence_step} to ${subscriber_email}: ${err.message}`);
        }
      }
    }
  } catch (err) {
    console.error('[email-sequence] processEmailSequences error:', err.message);
  } finally {
    _sequenceProcessing = false;
  }
}

// Run sequence processor every 5 minutes
setInterval(processEmailSequences, 5 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Workshop inquiry email helpers
// ─────────────────────────────────────────────────────────────────────────────
const WORKSHOP_TYPE_LABELS = { bouquet: 'Farm Bouquet Workshop', wreath: 'Seasonal Wreath Making', private: 'Private Group Workshop' };
const MONTH_LABELS = { spring: 'Spring (Mar–May)', summer: 'Summer (Jun–Aug)', fall: 'Fall (Sep–Nov)', winter: 'Winter (Dec–Feb)', flexible: 'Flexible — I\'ll take what\'s available' };

async function sendWorkshopConfirmationEmail(inquiry) {
  const typeLabel = WORKSHOP_TYPE_LABELS[inquiry.workshop_type] || inquiry.workshop_type || 'Workshop';
  const monthLabel = MONTH_LABELS[inquiry.preferred_month] || inquiry.preferred_month || 'TBD';
  return sendEmail({
    to: inquiry.email,
    subject: `🌸 Your ${typeLabel} Inquiry — Sugar Oak Lane`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Workshop Inquiry Received</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px;font-size:16px;color:#111827;font-weight:600">Hi ${esc(inquiry.name)},</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6">We've received your workshop inquiry and we love that you're interested! We'll be in touch within 1–2 business days with available dates, venue details, and everything you need to lock in your spot.</p>
    <div style="background:#f9fafb;border-radius:12px;padding:20px;margin-bottom:24px">
      <p style="margin:0 0 10px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.1em;font-weight:600">Your Inquiry</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:40%">Workshop</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:600">${esc(typeLabel)}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Preferred Timeframe</td><td style="padding:4px 0;font-size:13px;color:#111827">${esc(monthLabel)}</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Group Size</td><td style="padding:4px 0;font-size:13px;color:#111827">${inquiry.group_size ? `${inquiry.group_size} people` : 'Not specified'}</td></tr>
        ${inquiry.occasion ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280">Occasion</td><td style="padding:4px 0;font-size:13px;color:#111827">${esc(inquiry.occasion)}</td></tr>` : ''}
      </table>
    </div>
    ${inquiry.message ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 16px;margin-bottom:20px"><p style="margin:0 0 4px;font-size:12px;color:#92400e;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Your Note</p><p style="margin:0;font-size:13px;color:#78350f;line-height:1.6">${esc(inquiry.message)}</p></div>` : ''}
    <div style="background:#f0fdf4;border:2px solid #3A5A40;border-radius:12px;padding:20px;text-align:center">
      <p style="margin:0 0 6px;font-size:13px;color:#6b7280;font-weight:600">What to expect next</p>
      <p style="margin:0;font-size:13px;color:#374151;line-height:1.6">We'll reach out with open dates, venue options near you, and details on how to officially reserve your spot. No payment needed until you've confirmed a date.</p>
    </div>
    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/workshops" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">Learn More About Workshops</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:#3A5A40">Sugar Oak Lane</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">Farm-Fresh Flowers · Loganville, GA</p>
  </div>
</div></body></html>`,
    text: `Hi ${inquiry.name},\n\nWe've received your workshop inquiry and we'll be in touch within 1–2 business days. Your details:\n\nWorkshop: ${typeLabel}\nPreferred Timeframe: ${monthLabel}\nGroup Size: ${inquiry.group_size || 'Not specified'}\n${inquiry.occasion ? `Occasion: ${inquiry.occasion}\n` : ''}${inquiry.message ? `Note: ${inquiry.message}\n` : ''}\n\nStay tuned — we'll have your dates soon!\n\nSugar Oak Lane\n${APP_URL}/workshops`,
  });
}

async function sendWorkshopAdminNotification(inquiry) {
  const typeLabel = WORKSHOP_TYPE_LABELS[inquiry.workshop_type] || inquiry.workshop_type || 'Workshop';
  const monthLabel = MONTH_LABELS[inquiry.preferred_month] || inquiry.preferred_month || 'TBD';
  return sendEmail({
    to: 'sugaroakos@polsia.app',
    subject: `🌸 New Workshop Inquiry — ${inquiry.name} (${typeLabel})`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#15803d;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <h1 style="margin:0;color:#ffffff;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:4px 0 0;color:#bbf7d0;font-size:13px;letter-spacing:0.5px">NEW WORKSHOP INQUIRY</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px;font-size:15px;color:#374151">A new workshop inquiry just came in!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:35%">Name</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(inquiry.name)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Email</td><td style="padding:6px 0;font-size:14px;color:#111827"><a href="mailto:${esc(inquiry.email)}" style="color:#15803d">${esc(inquiry.email)}</a></td></tr>
      ${inquiry.phone ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Phone</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc(inquiry.phone)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Workshop</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(typeLabel)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Timeframe</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc(monthLabel)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Group Size</td><td style="padding:6px 0;font-size:14px;color:#111827">${inquiry.group_size || 'Not specified'}</td></tr>
      ${inquiry.occasion ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Occasion</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc(inquiry.occasion)}</td></tr>` : ''}
    </table>
    ${inquiry.message ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:20px"><p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Message</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${esc(inquiry.message)}</p></div>` : ''}
    <div style="text-align:center">
      <a href="${APP_URL}/admin" style="display:inline-block;background:#15803d;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">View in Admin →</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">Sugar Oak Lane Admin · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>
</div></body></html>`,
    text: `New workshop inquiry!\n\nName: ${inquiry.name}\nEmail: ${inquiry.email}\n${inquiry.phone ? `Phone: ${inquiry.phone}\n` : ''}Workshop: ${typeLabel}\nTimeframe: ${monthLabel}\nGroup Size: ${inquiry.group_size || 'Not specified'}\n${inquiry.occasion ? `Occasion: ${inquiry.occasion}\n` : ''}\n${inquiry.message ? `Message: ${inquiry.message}\n` : ''}\n\nView in admin: ${APP_URL}/admin`,
  });
}

app.post('/api/newsletter', async (req, res) => {
  try {
    const { email, source } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const src = source || 'homepage';

    // Also insert into waitlist for backwards compat
    await pool.query(
      `INSERT INTO waitlist (email, source) VALUES ($1, 'newsletter') ON CONFLICT (email) DO NOTHING`,
      [cleanEmail]
    ).catch(() => {});

    // Check if already subscribed
    const existing = await pool.query(
      `SELECT id FROM sol_subscribers WHERE email = $1`,
      [cleanEmail]
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        already_subscribed: true,
        discount_code: 'WELCOME10',
        message: "You're already subscribed! Your code is WELCOME10.",
      });
    }

    // New subscriber — insert and send welcome email
    await pool.query(
      `INSERT INTO sol_subscribers (email, source) VALUES ($1, $2)`,
      [cleanEmail, src]
    );

    // Fire and forget — don't block the response
    sendWelcomeEmail(cleanEmail).catch(err =>
      console.error('[newsletter] Welcome email failed:', err.message)
    );

    // Enqueue 3-step nurture sequence
    enqueueEmailSequence(cleanEmail).catch(err =>
      console.error('[newsletter] Failed to enqueue sequence:', err.message)
    );

    console.log(`[newsletter] New subscriber: ${cleanEmail} via ${src}`);
    res.json({
      success: true,
      already_subscribed: false,
      discount_code: 'WELCOME10',
      message: "Welcome! Use code WELCOME10 at checkout for 10% off your first order.",
    });
  } catch (err) {
    console.error('[api/newsletter]', err.message);
    res.status(500).json({ success: false, message: 'Could not subscribe. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Workshop Inquiries — /api/sol/workshop-inquiries
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/sol/workshop-inquiries', async (req, res) => {
  try {
    const { name, email, phone, workshop_type, preferred_month, preferred_date, group_size, occasion, location, message } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required.' });
    }
    if (!email || !email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }
    if (!workshop_type || !['bouquet', 'wreath', 'private'].includes(workshop_type)) {
      return res.status(400).json({ success: false, message: 'Please select a workshop type.' });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    // Parse preferred_date — accept ISO date string (YYYY-MM-DD) or null
    let parsedDate = null;
    if (preferred_date && typeof preferred_date === 'string' && preferred_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
      parsedDate = preferred_date;
    }

    const result = await pool.query(
      `INSERT INTO sol_workshop_inquiries
        (name, email, phone, workshop_type, preferred_month, preferred_date, group_size, occasion, location, message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        cleanName,
        cleanEmail,
        phone ? phone.trim() : null,
        workshop_type,
        preferred_month || null,
        parsedDate,
        group_size ? parseInt(group_size, 10) : null,
        occasion ? occasion.trim() : null,
        location ? location.trim() : null,
        message ? message.trim() : null,
      ]
    );

    const inquiryId = result.rows[0].id;
    const inquiry = { name: cleanName, email: cleanEmail, phone: phone ? phone.trim() : null, workshop_type, preferred_month: preferred_month || null, preferred_date: parsedDate, group_size: group_size ? parseInt(group_size, 10) : null, occasion: occasion ? occasion.trim() : null, location: location ? location.trim() : null, message: message ? message.trim() : null };

    // Fire and forget — don't block the response
    sendWorkshopConfirmationEmail(inquiry).catch(err =>
      console.error('[workshop-inquiry] Confirmation email failed:', err.message)
    );
    sendWorkshopAdminNotification(inquiry).catch(err =>
      console.error('[workshop-inquiry] Admin notification failed:', err.message)
    );

    console.log(`[workshop-inquiry] #${inquiryId} saved: ${cleanName} <${cleanEmail}> — ${workshop_type}`);
    res.json({ success: true, message: "Thanks! We'll confirm your booking within 24 hours." });
  } catch (err) {
    console.error('[api/workshop-inquiries]', err.message);
    res.status(500).json({ success: false, message: 'Could not submit your inquiry. Please try again or email hello@sugaroaklane.com directly.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Subscription Inquiries — POST /api/subscriptions
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/subscriptions', async (req, res) => {
  try {
    const {
      plan_type, customer_name, customer_email, customer_phone,
      recipient_name, recipient_phone, delivery_address,
      delivery_day, start_date, delivery_notes, is_gift, card_message,
    } = req.body || {};

    // Validate required fields
    if (!plan_type || !['weekly','biweekly','monthly'].includes(plan_type)) {
      return res.status(400).json({ success: false, message: 'Please select a valid plan (weekly, biweekly, or monthly).' });
    }
    const cleanName  = (customer_name || '').trim();
    const cleanEmail = (customer_email || '').trim().toLowerCase();
    if (!cleanName)  return res.status(400).json({ success: false, message: 'Please enter your full name.' });
    if (!cleanEmail || !cleanEmail.includes('@')) return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    if (!delivery_address || !delivery_address.trim()) return res.status(400).json({ success: false, message: 'Please enter your delivery address.' });
    if (!delivery_day || !['tuesday','thursday'].includes(delivery_day)) return res.status(400).json({ success: false, message: 'Please select a delivery day (Tuesday or Thursday).' });

    const startDateVal = start_date && start_date.trim() ? start_date.trim() : null;
    const isGiftBool   = is_gift === true || is_gift === 'true';

    const result = await pool.query(
      `INSERT INTO sol_subscription_inquiries
         (plan_type, customer_name, customer_email, customer_phone, recipient_name, recipient_phone,
          delivery_address, delivery_day, start_date, delivery_notes, is_gift, card_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id, created_at`,
      [
        plan_type,
        cleanName,
        cleanEmail,
        (customer_phone || '').trim() || null,
        (recipient_name || '').trim() || null,
        (recipient_phone || '').trim() || null,
        (delivery_address || '').trim(),
        delivery_day,
        startDateVal,
        (delivery_notes || '').trim() || null,
        isGiftBool,
        (card_message || '').trim() || null,
      ]
    );

    const subId = result.rows[0].id;
    const PLAN_LABELS = { weekly: 'Weekly — $45/week', biweekly: 'Bi-Weekly — $50/delivery', monthly: 'Monthly — $60/month' };
    const planLabel   = PLAN_LABELS[plan_type] || plan_type;

    // Fire-and-forget admin notification email
    sendEmail({
      to: 'sugaroakos@polsia.app',
      subject: `🌸 New Subscription Inquiry #${subId} — ${cleanName} (${planLabel})`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <h1 style="margin:0;color:#ffffff;font-family:Georgia,serif;font-size:26px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:4px 0 0;color:#c6dbc8;font-size:13px;letter-spacing:0.5px">NEW SUBSCRIPTION INQUIRY</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px;font-size:15px;color:#374151">A new subscription inquiry just came in!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:35%">Plan</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(planLabel)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Customer</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(cleanName)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Email</td><td style="padding:6px 0;font-size:14px;color:#111827"><a href="mailto:${esc(cleanEmail)}" style="color:#3A5A40">${esc(cleanEmail)}</a></td></tr>
      ${(customer_phone||'').trim() ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Phone</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc((customer_phone||'').trim())}</td></tr>` : ''}
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Delivery Day</td><td style="padding:6px 0;font-size:14px;color:#111827;text-transform:capitalize">${esc(delivery_day)}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Delivery Address</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc((delivery_address||'').trim())}</td></tr>
      ${startDateVal ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Start Date</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc(startDateVal)}</td></tr>` : ''}
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Is Gift?</td><td style="padding:6px 0;font-size:14px;color:#111827">${isGiftBool ? 'Yes' : 'No'}</td></tr>
      ${(recipient_name||'').trim() ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Recipient</td><td style="padding:6px 0;font-size:14px;color:#111827">${esc((recipient_name||'').trim())}${(recipient_phone||'').trim() ? ' · ' + esc((recipient_phone||'').trim()) : ''}</td></tr>` : ''}
    </table>
    ${(delivery_notes||'').trim() ? `<div style="background:#f9fafb;border-radius:8px;padding:14px 16px;margin-bottom:12px"><p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Delivery Notes</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${esc((delivery_notes||'').trim())}</p></div>` : ''}
    ${(card_message||'').trim() ? `<div style="background:#f0fdf4;border-radius:8px;padding:14px 16px;margin-bottom:12px"><p style="margin:0 0 4px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Card Message</p><p style="margin:0;font-size:13px;color:#374151;line-height:1.6">${esc((card_message||'').trim())}</p></div>` : ''}
    <div style="text-align:center;margin-top:20px">
      <a href="${APP_URL}/admin" style="display:inline-block;background:#3A5A40;color:#ffffff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">View in Admin →</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0;font-size:12px;color:#9ca3af">Sugar Oak Lane Admin · ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
  </div>
</div></body></html>`,
      text: `New subscription inquiry!\n\nPlan: ${planLabel}\nCustomer: ${cleanName}\nEmail: ${cleanEmail}\nDelivery Day: ${delivery_day}\nDelivery Address: ${(delivery_address||'').trim()}\n${startDateVal ? `Start Date: ${startDateVal}\n` : ''}Is Gift: ${isGiftBool ? 'Yes' : 'No'}\n`,
    }).catch(err => console.error('[subscription-inquiry] Admin email failed:', err.message));

    console.log(`[subscription-inquiry] #${subId} saved: ${cleanName} <${cleanEmail}> — ${plan_type}`);
    res.json({ success: true, id: subId, message: "We've received your subscription inquiry! We'll be in touch within 1–2 business days to confirm and complete checkout." });
  } catch (err) {
    console.error('[api/subscriptions]', err.message);
    res.status(500).json({ success: false, message: 'Could not submit your subscription inquiry. Please try again or contact hello@sugaroaklane.com.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Storefront Event Tracking (UTM + conversion funnel)
// ─────────────────────────────────────────────────────────────────────────────
const VALID_EVENTS = new Set(['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'order_complete']);

app.post('/api/events', async (req, res) => {
  try {
    const { event_type, session_id, product_id, product_slug, utm_params, timestamp } = req.body || {};

    if (!event_type || !VALID_EVENTS.has(event_type)) {
      return res.status(400).json({ success: false, message: 'Invalid event_type' });
    }

    await pool.query(
      `INSERT INTO storefront_events (event_type, session_id, product_id, product_slug, utm_params, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        event_type,
        session_id ? String(session_id).slice(0, 100) : null,
        product_id ? (parseInt(product_id, 10) || null) : null,
        product_slug ? String(product_slug).slice(0, 255) : null,
        JSON.stringify(utm_params && typeof utm_params === 'object' ? utm_params : {}),
        timestamp ? new Date(timestamp) : new Date(),
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[api/events]', err.message);
    res.status(500).json({ success: false, message: 'Failed to log event' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Order success page
// ─────────────────────────────────────────────────────────────────────────────
app.get('/order-success', async (req, res) => {
  const { order_id, session_id } = req.query;
  let orderNumber = null;
  // Mark order as confirmed and redirect to order tracker
  if (order_id && session_id) {
    try {
      const result = await pool.query(
        `UPDATE sol_orders SET status='confirmed', tracker_stage='order_received',
           stripe_session_id = $1
         WHERE id=$2 AND status='pending_payment'
         RETURNING order_number`,
        [session_id, order_id]
      );
      if (result.rows.length) {
        orderNumber = result.rows[0].order_number;
      } else {
        // Already confirmed — just get the order_number
        const r2 = await pool.query(`SELECT order_number FROM sol_orders WHERE id=$1`, [order_id]);
        if (r2.rows.length) orderNumber = r2.rows[0].order_number;
      }
    } catch(e) { console.error('[order-success]', e.message); }
  }
  // Redirect to tracker page (Domino's-style)
  if (orderNumber) {
    return res.redirect(`/order-tracker?order=${encodeURIComponent(orderNumber)}&confirmed=1`);
  }
  // Fallback: serve static success page
  const htmlPath = path.join(__dirname, 'public', 'order-success.html');
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('__ORDER_ID__', order_id || '').replace('__POLSIA_SLUG__', process.env.POLSIA_ANALYTICS_SLUG || '');
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  } else {
    res.redirect('/');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Order Tracker page: /order-tracker
// ─────────────────────────────────────────────────────────────────────────────
app.get('/order-tracker', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'order-tracker.html');
  if (fs.existsSync(htmlPath)) {
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('__POLSIA_SLUG__', process.env.POLSIA_ANALYTICS_SLUG || '');
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  } else {
    res.redirect('/');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// API: Order Tracker (customer-facing — look up by order_number)
// ─────────────────────────────────────────────────────────────────────────────
const TRACKER_STAGES = ['order_received', 'in_design', 'ready_to_deliver', 'out_for_delivery', 'delivery_completed'];
const TRACKER_LABELS = {
  order_received:      'Order Received',
  in_design:           'In Design',
  ready_to_deliver:    'Ready to Deliver',
  out_for_delivery:    'Out for Delivery',
  delivery_completed:  'Delivery Completed',
};

app.get('/api/track/:orderNumber', async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const cleanNum = String(orderNumber || '').trim().toUpperCase();
    if (!cleanNum) return res.status(400).json({ success: false, message: 'Order number required.' });

    const result = await pool.query(
      `SELECT id, order_number, tracker_stage, status,
              recipient_name,
              shipping_address    AS delivery_address,
              shipping_city       AS delivery_city,
              shipping_zip        AS delivery_zip,
              fulfillment_type    AS delivery_type,
              delivery_date, delivery_window,
              product_name, tier, total_price,
              created_at, updated_at
       FROM sol_orders
       WHERE UPPER(order_number) = $1`,
      [cleanNum]
    );

    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Order not found. Check your order number and try again.' });
    }

    const order = result.rows[0];
    const stageIndex = TRACKER_STAGES.indexOf(order.tracker_stage || 'order_received');

    res.json({
      success: true,
      order: {
        order_number: order.order_number,
        status: order.status,
        tracker_stage: order.tracker_stage || 'order_received',
        tracker_stage_label: TRACKER_LABELS[order.tracker_stage] || 'Order Received',
        tracker_stage_index: stageIndex,
        stages: TRACKER_STAGES.map((s, i) => ({
          key: s,
          label: TRACKER_LABELS[s],
          completed: i <= stageIndex,
          active: i === stageIndex,
        })),
        recipient_name: order.recipient_name,
        delivery_address: order.delivery_address,
        delivery_city: order.delivery_city,
        delivery_zip: order.delivery_zip,
        product_name: order.product_name,
        tier: order.tier,
        total_price: order.total_price,
        delivery_date: order.delivery_date,
        created_at: order.created_at,
      }
    });
  } catch (err) {
    console.error('[api/track]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load order status.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: List orders (requires API key)
// ─────────────────────────────────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  if (isAdminRequest(req)) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.get('/api/admin/orders', requireApiKey, async (req, res) => {
  try {
    const { limit = 50, offset = 0, status, stage, order_status } = req.query;
    let where = `WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); where += ` AND o.status = $${params.length}`; }
    if (stage)  { params.push(stage);  where += ` AND o.tracker_stage = $${params.length}`; }
    if (order_status) { params.push(order_status); where += ` AND o.order_status = $${params.length}`; }
    params.push(parseInt(limit, 10) || 50);
    params.push(parseInt(offset, 10) || 0);

    const result = await pool.query(
      `SELECT o.id, o.order_number, o.tracker_stage, o.status,
              COALESCE(o.order_status, 'new') AS order_status,
              o.customer_name        AS sender_name,
              o.customer_email       AS sender_email,
              o.customer_phone       AS sender_phone,
              o.recipient_name,
              o.shipping_address     AS delivery_address,
              o.shipping_city        AS delivery_city,
              o.shipping_zip         AS delivery_zip,
              o.shipping_state,
              COALESCE(
                o.product_name,
                CASE WHEN jsonb_array_length(COALESCE(o.items,'[]'::jsonb)) > 0
                     THEN (o.items->0->>'name') || CASE WHEN jsonb_array_length(o.items) > 1 THEN ' +' || (jsonb_array_length(o.items)-1)::text || ' more' ELSE '' END
                     ELSE NULL END
              ) AS product_name,
              o.tier, o.total_price, o.subtotal, o.shipping_fee, o.delivery_fee,
              o.fulfillment_type     AS delivery_type,
              o.delivery_date, o.delivery_window,
              o.card_message, o.notes, o.created_at, o.metadata, o.items,
              o.confirmation_email_sent, o.status_email_sent, o.tracking_number
       FROM sol_orders o
       ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countRes = await pool.query(`SELECT COUNT(*) FROM sol_orders o ${where}`, params.slice(0, -2));

    res.json({ success: true, orders: result.rows, total: parseInt(countRes.rows[0].count, 10) });
  } catch (err) {
    console.error('[api/admin/orders]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load orders.' });
  }
});

// Admin API: Create a new order
app.post('/api/admin/orders', requireApiKey, async (req, res) => {
  try {
    const { sender_name, sender_email, sender_phone, recipient_name, delivery_address, delivery_city, delivery_zip, product_name, tier, total_price, delivery_type, delivery_date, delivery_window, card_message, notes } = req.body;
    if (!sender_name || !recipient_name) {
      return res.status(400).json({ success: false, message: 'Sender name and recipient name are required.' });
    }
    // Generate a SOL-style order number
    const cntRes = await pool.query(`SELECT COUNT(*) AS cnt FROM sol_orders`);
    const seq = parseInt(cntRes.rows[0].cnt, 10) + 1001;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderNumber = `SOL-${today}-${String(seq).padStart(4, '0')}`;

    // Wrap single-product fields into items JSONB array
    const adminItems = JSON.stringify([{
      name: product_name || 'Custom Arrangement',
      price: parseFloat(total_price) || 0,
      quantity: 1,
      slug: '',
      tier: (tier || 'standard').toLowerCase(),
    }]);

    const result = await pool.query(
      `INSERT INTO sol_orders (order_number, customer_name, customer_email, customer_phone,
         recipient_name, shipping_address, shipping_city, shipping_zip,
         product_name, tier, total_price, fulfillment_type,
         delivery_date, delivery_window, card_message, notes,
         tracker_stage, status, items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'delivery',$12,$13,$14,$15,'order_received','confirmed',$16)
       RETURNING *`,
      [orderNumber, sender_name, sender_email||null, sender_phone||null,
       recipient_name, delivery_address||null, delivery_city||null, delivery_zip||null,
       product_name||null, tier||'Standard', total_price||0,
       delivery_date||null, delivery_window||null, card_message||null, notes||null,
       adminItems]
    );
    const row = result.rows[0];
    console.log(`[admin] New order ${orderNumber} created`);
    res.json({ success: true, order: {
      ...row,
      sender_name:      row.customer_name,
      sender_email:     row.customer_email,
      sender_phone:     row.customer_phone,
      delivery_address: row.shipping_address,
      delivery_city:    row.shipping_city,
      delivery_zip:     row.shipping_zip,
      delivery_type:    row.fulfillment_type,
    }});
  } catch (err) {
    console.error('[api/admin/orders POST]', err.message);
    res.status(500).json({ success: false, message: 'Failed to create order: ' + err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Update order tracker stage
// ─────────────────────────────────────────────────────────────────────────────
app.put('/api/admin/orders/:id/stage', requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { stage, notes } = req.body || {};
    if (!stage || !TRACKER_STAGES.includes(stage)) {
      return res.status(400).json({ success: false, message: `Invalid stage. Must be one of: ${TRACKER_STAGES.join(', ')}` });
    }
    const updates = [`tracker_stage = $1`, `updated_at = NOW()`];
    const params = [stage];
    if (notes !== undefined) {
      params.push(notes);
      updates.push(`notes = $${params.length}`);
    }
    // Auto-update status when delivery is completed
    if (stage === 'delivery_completed') {
      updates.push(`status = 'delivered'`);
    } else if (stage === 'order_received') {
      updates.push(`status = 'confirmed'`);
    }
    params.push(parseInt(id, 10));
    const result = await pool.query(
      `UPDATE sol_orders SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING id, order_number, tracker_stage, status`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Order not found.' });
    console.log(`[admin] Order #${result.rows[0].order_number} stage updated to "${stage}"`);
    res.json({ success: true, order: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/orders/:id/stage]', err.message);
    res.status(500).json({ success: false, message: 'Failed to update order stage.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Update order fulfillment status (new → processing → shipped → delivered)
// ─────────────────────────────────────────────────────────────────────────────
const ORDER_STATUSES = ['new', 'processing', 'shipped', 'delivered'];

app.put('/api/admin/orders/:id/order-status', requireApiKey, async (req, res) => {
  try {
    const { id } = req.params;
    const { order_status, tracking_number } = req.body || {};
    if (!order_status || !ORDER_STATUSES.includes(order_status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${ORDER_STATUSES.join(', ')}` });
    }
    // Build update fields
    const updates = ['order_status = $1', 'updated_at = NOW()'];
    const params = [order_status];
    if (tracking_number !== undefined) {
      params.push(tracking_number || null);
      updates.push(`tracking_number = $${params.length}`);
    }
    // Mark status email sent for shipped/ready transitions
    if (order_status === 'shipped' || order_status === 'ready') {
      updates.push('status_email_sent = TRUE');
    }
    params.push(parseInt(id, 10));

    const result = await pool.query(
      `UPDATE sol_orders SET ${updates.join(', ')} WHERE id = $${params.length}
       RETURNING id, order_number, order_status, status, customer_email, sender_email, fulfillment_type,
                 items, total_price, tracking_number, customer_name, sender_name,
                 shipping_address, shipping_city, shipping_state, shipping_zip,
                 delivery_address, delivery_date, delivery_window`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Order not found.' });
    const updatedOrder = result.rows[0];

    // Parse items JSON if needed
    if (typeof updatedOrder.items === 'string') {
      try { updatedOrder.items = JSON.parse(updatedOrder.items); } catch(e) {}
    }

    console.log(`[admin] Order #${updatedOrder.order_number} status updated to "${order_status}"`);

    // Send customer status email for shipped/ready
    if (order_status === 'shipped' || order_status === 'ready') {
      sendStatusUpdateEmail(updatedOrder);
    }

    // Return the full order for frontend refresh
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    console.error('[api/admin/orders/:id/order-status]', err.message);
    res.status(500).json({ success: false, message: 'Failed to update order status.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Email sending via Polsia company email proxy
// ─────────────────────────────────────────────────────────────────────────────
const POLSIA_EMAIL_API_URL = process.env.POLSIA_EMAIL_API_URL || 'https://polsia.com/api/company-email/send';

async function sendEmail({ to, subject, html, text }) {
  const polsiaApiKey = process.env.POLSIA_API_KEY;
  if (!polsiaApiKey) {
    console.warn('[email] POLSIA_API_KEY not set — skipping email to', to);
    return { success: false, reason: 'no_api_key' };
  }
  try {
    console.log(`[email] Sending to ${to} via ${POLSIA_EMAIL_API_URL}`);
    const resp = await fetch(POLSIA_EMAIL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${polsiaApiKey}` },
      body: JSON.stringify({ to, subject, html, text }),
    });
    if (!resp.ok) {
      const errText = await resp.text();
      console.error(`[email] Polsia email API error: status=${resp.status} url=${POLSIA_EMAIL_API_URL} response=${errText.substring(0, 200)}`);
      return { success: false, reason: 'api_error', status: resp.status };
    }
    const data = await resp.json();
    console.log(`[email] Sent to ${to}: "${subject}"`);
    return { success: true, data };
  } catch (err) {
    console.error(`[email] Failed to send to ${to}: url=${POLSIA_EMAIL_API_URL} error=${err.message}`);
    return { success: false, reason: 'network_error', error: err.message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventory helpers
// ─────────────────────────────────────────────────────────────────────────────
async function sendLowStockAlert(product) {
  return sendEmail({
    to: 'nakita.hemingway@gmail.com',
    subject: `Low Stock Alert — ${product.name} (${product.stock_quantity} remaining)`,
    html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:20px 28px">
    <h1 style="margin:0;color:#FEFDF8;font-size:22px;font-style:italic">Sugar Oak Lane</h1>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;border:1px solid #e5e7eb;border-top:none">
    <h2 style="margin:0 0 12px;color:#dc2626;font-size:18px">⚠️ Low Stock Alert</h2>
    <p style="margin:0 0 8px;color:#374151;font-size:15px"><strong>${esc(product.name)}</strong> is running low.</p>
    <p style="margin:0 0 20px;color:#374151;font-size:15px">Only <strong style="color:#dc2626">${product.stock_quantity}</strong> unit${product.stock_quantity !== 1 ? 's' : ''} remaining.</p>
    <a href="${APP_URL}/admin" style="background:#3A5A40;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:14px;font-weight:600;display:inline-block">Manage Inventory →</a>
  </div>
</div></body></html>`,
    text: `Low Stock Alert: "${product.name}" — ${product.stock_quantity} unit(s) remaining. Manage at ${APP_URL}/admin`,
  });
}

async function decrementInventory(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  for (const item of items) {
    const productId = item.product_id || item.id;
    if (!productId) continue;
    const qty = item.quantity || 1;
    try {
      const result = await pool.query(
        `UPDATE sol_products
         SET stock_quantity = GREATEST(0, stock_quantity - $1), updated_at = NOW()
         WHERE id = $2 AND track_inventory = true AND stock_quantity IS NOT NULL
         RETURNING id, name, stock_quantity, low_stock_threshold`,
        [qty, productId]
      );
      if (result.rows.length > 0) {
        const product = result.rows[0];
        if (product.stock_quantity === 0) {
          // Mark out of stock
          await pool.query(
            `UPDATE sol_products SET availability = 'out_of_stock', updated_at = NOW() WHERE id = $1`,
            [product.id]
          );
          console.log(`[inventory] "${product.name}" is now out of stock`);
        } else if (product.stock_quantity <= product.low_stock_threshold) {
          // Send low-stock alert
          sendLowStockAlert(product).catch(e => console.error('[inventory] alert error:', e.message));
        }
      }
    } catch (e) {
      console.error('[inventory] decrement error for product', productId, e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order email helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildAdminOrderEmailHtml(order) {
  const items = (order.items || []).map(i =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151">${i.name || 'Item'}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:center">${i.quantity || 1}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:right">$${parseFloat(i.price || 0).toFixed(2)}</td></tr>`
  ).join('');

  const address = [order.shipping_address, order.shipping_city, order.shipping_state, order.shipping_zip].filter(Boolean).join(', ');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f9fafb;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:24px 32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:4px 0 0;color:#d1fae5;font-size:13px;letter-spacing:0.5px">NEW ORDER RECEIVED</p>
  </div>
  <div style="background:#ffffff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 16px;font-size:15px;color:#374151">A new order just came in!</p>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280;width:140px">Order Number</td><td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${order.order_number}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Customer</td><td style="padding:6px 0;font-size:14px;color:#111827">${order.customer_name || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Email</td><td style="padding:6px 0;font-size:14px;color:#111827">${order.customer_email || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Phone</td><td style="padding:6px 0;font-size:14px;color:#111827">${order.customer_phone || '—'}</td></tr>
      <tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Fulfillment</td><td style="padding:6px 0;font-size:14px;color:#111827">${(order.fulfillment_type || 'pickup').replace(/^\w/, c => c.toUpperCase())}</td></tr>
      ${address ? `<tr><td style="padding:6px 0;font-size:13px;color:#6b7280">Ship To</td><td style="padding:6px 0;font-size:14px;color:#111827">${address}</td></tr>` : ''}
    </table>
    <h3 style="margin:20px 0 10px;font-size:14px;color:#374151;font-weight:600">Items</h3>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f9fafb"><th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Item</th><th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Qty</th><th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase">Price</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div style="margin-top:16px;padding-top:16px;border-top:2px solid #3A5A40;text-align:right">
      <span style="font-size:18px;font-weight:700;color:#111827">Total: $${parseFloat(order.total_price || 0).toFixed(2)}</span>
    </div>
    <div style="margin-top:24px;text-align:center">
      <a href="${APP_URL}/admin" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600">View in Admin Dashboard</a>
    </div>
  </div>
  <div style="padding:16px;text-align:center;font-size:12px;color:#9ca3af">Sugar Oak Lane · Loganville, GA</div>
</div></body></html>`;
}

function buildCustomerConfirmationHtml(order) {
  const items = (order.items || []).map(i =>
    `<tr><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151">${i.name || 'Item'}</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:center">${i.quantity || 1}</td><td style="padding:10px 16px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:right">$${parseFloat(i.price || 0).toFixed(2)}</td></tr>`
  ).join('');

  const subtotal = parseFloat(order.subtotal || 0).toFixed(2);
  const shippingFee = parseFloat(order.shipping_fee || 0).toFixed(2);
  const total = parseFloat(order.total_price || 0).toFixed(2);
  const fulfillment = order.fulfillment_type || 'pickup';
  const isShipping = fulfillment === 'ship';

  const shipAddress = isShipping && (order.shipping_address || order.delivery_address)
    ? `<div style="margin-bottom:16px"><p style="margin:0 0 4px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Shipping To</p><p style="margin:0;font-size:14px;color:#374151">${esc(order.shipping_address || order.delivery_address || '')}<br>${esc(order.shipping_city || '')}${order.shipping_state ? ', ' + esc(order.shipping_state) : ''} ${esc(order.shipping_zip || order.delivery_zip || '')}</p></div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Order Confirmed</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 4px;font-size:18px;color:#111827;font-weight:600">Thank you for your order!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">We're getting everything ready for you. Here's your order summary.</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px">
      <table style="width:100%">
        <tr><td style="font-size:13px;color:#6b7280">Order Number</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${order.order_number}</td></tr>
        ${order.applied_promo ? `<tr><td style="font-size:13px;color:#6b7280">Discount</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">WELCOME10 applied (−$${parseFloat(order.discount_amount || 0).toFixed(2)})</td></tr>` : ''}
      </table>
    </div>

    ${shipAddress}

    <h3 style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Order Items</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
      <thead><tr style="background:#f9fafb"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Item</th><th style="padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">Qty</th><th style="padding:10px 16px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">Price</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <div style="border-top:1px solid #e5e7eb;padding-top:12px;margin-bottom:24px">
      <table style="width:100%">
        <tr><td style="padding:4px 0;font-size:14px;color:#6b7280">Subtotal</td><td style="padding:4px 0;font-size:14px;color:#374151;text-align:right">$${subtotal}</td></tr>
        ${order.discount_amount > 0 ? `<tr><td style="padding:4px 0;font-size:14px;color:#15803d">Discount (WELCOME10)</td><td style="padding:4px 0;font-size:14px;color:#15803d;text-align:right">−$${parseFloat(order.discount_amount).toFixed(2)}</td></tr>` : ''}
        ${isShipping ? `<tr><td style="padding:4px 0;font-size:14px;color:#6b7280">Shipping</td><td style="padding:4px 0;font-size:14px;color:#374151;text-align:right">${parseFloat(shippingFee) > 0 ? '$' + shippingFee : 'Free'}</td></tr>` : ''}
        <tr><td style="padding:8px 0 0;font-size:16px;color:#111827;font-weight:700;border-top:2px solid #3A5A40">Total</td><td style="padding:8px 0 0;font-size:16px;color:#111827;font-weight:700;text-align:right;border-top:2px solid #3A5A40">$${total}</td></tr>
      </table>
    </div>

    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#92400e;font-weight:600">📦 ${isShipping ? 'Shipping Info' : 'Pickup Info'}</p>
      <p style="margin:6px 0 0;font-size:13px;color:#78350f">${isShipping ? 'We ship on <strong>Tuesdays and Thursdays</strong>. You\'ll receive tracking info when your order ships.' : 'Your order will be ready for pickup at Sugar Oak Lane farm. We\'ll let you know when it\'s ready!'}</p>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/order-tracker?order=${order.order_number}" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px">Track Your Order</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:#3A5A40">Sugar Oak Lane</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">Farm-Fresh Flowers · Loganville, GA</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Questions? Reply to this email or visit <a href="${APP_URL}/contact" style="color:#3A5A40">our contact page</a>.</p>
  </div>
</div></body></html>`;
}

async function sendOrderNotificationEmails(order) {
  const emailTo = order.customer_email || order.sender_email;
  const orderId = order.id;

  // Mark confirmation email as sent
  if (orderId) {
    pool.query(
      `UPDATE sol_orders SET confirmation_email_sent = TRUE WHERE id = $1`,
      [orderId]
    ).catch(err => console.error('[email] Failed to mark confirmation sent:', err.message));
  }

  // 1. Send admin notification to Nakita
  sendEmail({
    to: 'nakita.hemingway@gmail.com',
    subject: `🌿 New Order #${order.order_number} — $${parseFloat(order.total_price || 0).toFixed(2)}`,
    html: buildAdminOrderEmailHtml(order),
    text: `New order ${order.order_number} from ${order.customer_name} — $${parseFloat(order.total_price || 0).toFixed(2)}. View at ${APP_URL}/admin`,
  }).catch(err => console.error('[email] Admin notification failed:', err.message));

  // 2. Send customer confirmation
  if (emailTo) {
    sendEmail({
      to: emailTo,
      subject: `Order Confirmed — ${order.order_number} | Sugar Oak Lane`,
      html: buildCustomerConfirmationHtml(order),
      text: `Thank you for your order! Order ${order.order_number} — Total: $${parseFloat(order.total_price || 0).toFixed(2)}. Track at ${APP_URL}/order-tracker?order=${order.order_number}`,
    }).catch(err => console.error('[email] Customer confirmation failed:', err.message));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Order status update email helpers
// ─────────────────────────────────────────────────────────────────────────────
function buildShippedEmailHtml(order) {
  const items = (order.items || []).map(i =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151">${i.name || 'Item'}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:center">${i.quantity || 1}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Your Order Has Shipped!</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 4px;font-size:18px;color:#111827;font-weight:600">Great news!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Your Sugar Oak Lane order is on its way. 🌻</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px">
      <table style="width:100%">
        <tr><td style="font-size:13px;color:#6b7280">Order Number</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${order.order_number}</td></tr>
        ${order.tracking_number ? `<tr><td style="font-size:13px;color:#6b7280">Tracking Number</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${order.tracking_number}</td></tr>` : ''}
      </table>
    </div>

    <h3 style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Items Shipped</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#f9fafb"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Item</th><th style="padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">Qty</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#1e40af;font-weight:600">📦 Delivery Tips</p>
      <p style="margin:6px 0 0;font-size:13px;color:#1e3a8a">We deliver on <strong>Tuesdays and Thursdays</strong>. Please ensure someone is available to receive your flowers. Keep them in a cool spot and add fresh water as soon as possible!</p>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/order-tracker?order=${order.order_number}" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px">Track Your Order</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:#3A5A40">Sugar Oak Lane</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">Farm-Fresh Flowers · Loganville, GA</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Questions? Reply to this email or visit <a href="${APP_URL}/contact" style="color:#3A5A40">our contact page</a>.</p>
  </div>
</div></body></html>`;
}

function buildReadyEmailHtml(order) {
  const items = (order.items || []).map(i =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151">${i.name || 'Item'}</td><td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-family:Inter,sans-serif;font-size:14px;color:#374151;text-align:center">${i.quantity || 1}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#FEFDF8;font-family:Inter,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#3A5A40;border-radius:12px 12px 0 0;padding:32px;text-align:center">
    <h1 style="margin:0;color:#FEFDF8;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;font-style:italic;font-weight:600">Sugar Oak Lane</h1>
    <p style="margin:8px 0 0;color:#d1fae5;font-size:14px;letter-spacing:1px">🌿 Your Order is Ready for Pickup!</p>
  </div>
  <div style="background:#ffffff;padding:32px;border:1px solid #e5e7eb;border-top:none">
    <p style="margin:0 0 4px;font-size:18px;color:#111827;font-weight:600">Your order is ready!</p>
    <p style="margin:0 0 24px;font-size:14px;color:#6b7280">Swing by Sugar Oak Lane farm to pick up your beautiful blooms. 🌻</p>

    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:24px">
      <table style="width:100%">
        <tr><td style="font-size:13px;color:#6b7280">Order Number</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${order.order_number}</td></tr>
        ${order.delivery_date ? `<tr><td style="font-size:13px;color:#6b7280">Pickup Date</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${new Date(order.delivery_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</td></tr>` : ''}
        ${order.delivery_window ? `<tr><td style="font-size:13px;color:#6b7280">Pickup Window</td><td style="font-size:15px;color:#15803d;font-weight:700;text-align:right">${order.delivery_window}</td></tr>` : ''}
      </table>
    </div>

    <h3 style="margin:0 0 12px;font-size:14px;color:#374151;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Items Ready</h3>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
      <thead><tr style="background:#f9fafb"><th style="padding:10px 16px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Item</th><th style="padding:10px 16px;text-align:center;font-size:12px;color:#6b7280;font-weight:600">Qty</th></tr></thead>
      <tbody>${items}</tbody>
    </table>

    <div style="background:#fdf4ff;border:1px solid #e9d5ff;border-radius:8px;padding:16px;margin-bottom:24px">
      <p style="margin:0;font-size:14px;color:#7e22ce;font-weight:600">📍 Pickup at Sugar Oak Lane Farm</p>
      <p style="margin:6px 0 0;font-size:13px;color:#6b21a8">Loganville, GA · We'll send a text or call when we're ready for you!</p>
    </div>

    <div style="text-align:center;margin-top:24px">
      <a href="${APP_URL}/order-tracker?order=${order.order_number}" style="display:inline-block;background:#3A5A40;color:#FEFDF8;padding:14px 36px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600;letter-spacing:0.3px">Track Your Order</a>
    </div>
  </div>
  <div style="padding:20px;text-align:center">
    <p style="margin:0 0 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:18px;font-style:italic;color:#3A5A40">Sugar Oak Lane</p>
    <p style="margin:0;font-size:12px;color:#9ca3af">Farm-Fresh Flowers · Loganville, GA</p>
    <p style="margin:8px 0 0;font-size:12px;color:#9ca3af">Questions? Reply to this email or visit <a href="${APP_URL}/contact" style="color:#3A5A40">our contact page</a>.</p>
  </div>
</div></body></html>`;
}

async function sendStatusUpdateEmail(order) {
  const emailTo = order.customer_email || order.sender_email;
  if (!emailTo) return;

  const isShipped = order.order_status === 'shipped';
  const subject = isShipped
    ? `Your Sugar Oak Lane order #${order.order_number} has shipped!`
    : `Your Sugar Oak Lane order #${order.order_number} is ready for pickup!`;
  const html = isShipped ? buildShippedEmailHtml(order) : buildReadyEmailHtml(order);
  const text = isShipped
    ? `Your order ${order.order_number} has shipped${order.tracking_number ? `! Tracking: ${order.tracking_number}` : '.'} Track at ${APP_URL}/order-tracker?order=${order.order_number}`
    : `Your order ${order.order_number} is ready for pickup at Sugar Oak Lane farm! Track at ${APP_URL}/order-tracker?order=${order.order_number}`;

  sendEmail({ to: emailTo, subject, html, text }).catch(err => console.error('[email] Status update failed:', err.message));
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed image downloader (existing functionality)
// ─────────────────────────────────────────────────────────────────────────────
const os = require('os');
const SEED_ZIP_PATH = path.join(os.tmpdir(), 'sugar-oak-lane-seed-images.zip');
const SEED_ZIP_PERMANENT = path.join(__dirname, 'downloads', 'sugar-oak-lane-seed-images.zip');

app.get('/downloads/seed-images.zip', (req, res) => {
  const zipPath = fs.existsSync(SEED_ZIP_PERMANENT) ? SEED_ZIP_PERMANENT :
                  fs.existsSync(SEED_ZIP_PATH) ? SEED_ZIP_PATH : null;
  if (!zipPath) {
    return res.status(404).json({ error: 'ZIP file not yet generated.' });
  }
  const stat = fs.statSync(zipPath);
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="sugar-oak-lane-seed-images.zip"',
    'Content-Length': stat.size,
  });
  fs.createReadStream(zipPath).pipe(res);
});

app.get('/downloads/manifest.csv', (req, res) => {
  const csvPath = path.join(__dirname, 'downloads', 'manifest.csv');
  if (!fs.existsSync(csvPath)) {
    return res.status(404).json({ error: 'Manifest not yet generated.' });
  }
  res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="seed-images-manifest.csv"' });
  fs.createReadStream(csvPath).pipe(res);
});

const downloadRunning = { active: false, result: null, logs: [] };
app.post('/admin/download-seed-images', async (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  const expectedKey = process.env.POLSIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) return res.status(401).json({ error: 'Unauthorized' });
  if (downloadRunning.active) return res.status(202).json({ status: 'running', logs: downloadRunning.logs.slice(-20) });
  downloadRunning.active = true;
  downloadRunning.result = null;
  downloadRunning.logs = ['Starting...'];
  const log = (msg) => { console.log('[seed-download]', msg); downloadRunning.logs.push(msg); };
  const { runDownload } = require('./scripts/download-seed-images-server');
  runDownload(log).then(r => { downloadRunning.result = r; downloadRunning.active = false; })
                  .catch(e => { downloadRunning.result = { success: false, error: e.message }; downloadRunning.active = false; });
  res.json({ status: 'started' });
});
app.get('/admin/download-seed-images/status', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.query.key;
  const expectedKey = process.env.POLSIA_API_KEY || process.env.OPENAI_API_KEY;
  if (!expectedKey || apiKey !== expectedKey) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ active: downloadRunning.active, result: downloadRunning.result, logs: downloadRunning.logs.slice(-50) });
});

// ─────────────────────────────────────────────────────────────────────────────
// SOL Storefront API: Products
// GET /api/sol/products?category=flower-shop&featured=true&limit=12
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/sol/products', async (req, res) => {
  try {
    const {
      category, featured, limit, search,
      subcategory, flower_name, flower_type, dahlia_type,
      in_stock, exclude_category, virtual_category
    } = req.query;
    let where = `WHERE is_active = TRUE`;
    const params = [];

    // virtual_category=dahlias: show all dahlia products across categories
    if (virtual_category === 'dahlias') {
      where += ` AND (LOWER(COALESCE(flower_name,'')) LIKE 'dahlia%' OR dahlia_type IS NOT NULL)`;
    } else if (category) {
      // Hierarchical lookup: get this category + all descendant category slugs
      const allSlugs = await getDescendantSlugs(pool, category);
      if (allSlugs.length > 0) {
        params.push(allSlugs);
        const pidx = params.length;
        // Match products whose sol_category, JSONB categories array, OR type_tags overlap any descendant slug
        where += ` AND (sol_category = ANY($${pidx}) OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(COALESCE(categories,'[]'::jsonb)) AS elem WHERE elem = ANY($${pidx})) OR type_tags && $${pidx}::text[])`;
      }
    } else if (exclude_category) {
      // Support comma-separated list: exclude_category=flower-shop
      const excl = String(exclude_category).split(',').map(s => s.trim()).filter(Boolean);
      if (excl.length === 1) {
        params.push(excl[0]);
        where += ` AND sol_category != $${params.length}`;
      } else if (excl.length > 1) {
        const placeholders = excl.map((_, i) => `$${params.length + i + 1}`).join(',');
        params.push(...excl);
        where += ` AND sol_category NOT IN (${placeholders})`;
      }
    }

    if (featured === 'true') {
      where += ` AND is_featured = TRUE`;
    }
    if (subcategory) {
      params.push(subcategory);
      // Check subcategory column OR type_tags array
      where += ` AND (subcategory = $${params.length} OR $${params.length} = ANY(type_tags))`;
    }
    if (flower_name) {
      params.push(flower_name);
      // Check flower_name column OR type_tags array (case-insensitive tag match)
      where += ` AND (flower_name ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(type_tags) t WHERE t ILIKE $${params.length}))`;
    }
    if (flower_type) {
      params.push(flower_type);
      // Check flower_type column OR type_tags array
      where += ` AND (flower_type ILIKE $${params.length} OR EXISTS (SELECT 1 FROM unnest(type_tags) t WHERE t ILIKE $${params.length}))`;
    }
    if (dahlia_type) {
      params.push(dahlia_type);
      where += ` AND dahlia_type ILIKE $${params.length}`;
    }
    if (in_stock === 'true') {
      where += ` AND availability = 'in_stock'`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR short_description ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }

    const limitClause = limit ? `LIMIT ${Math.min(parseInt(limit, 10) || 50, 200)}` : `LIMIT 50`;

    const result = await pool.query(
      `SELECT sp.id, sp.name, sp.slug, sp.sol_category, sp.subcategory, sp.short_description,
              sp.price, sp.price_label, sp.images, sp.availability, sp.inventory_count,
              sp.season_tags, sp.type_tags, sp.is_featured, sp.sort_order, sp.seo_title, sp.seo_description,
              sp.flower_name, sp.flower_type, sp.dahlia_type,
              sp.stock_quantity, sp.track_inventory, sp.low_stock_threshold,
              (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved') AS avg_rating,
              (SELECT COUNT(*) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved')::int AS review_count
       FROM sol_products sp
       ${where}
       ORDER BY sp.is_featured DESC, sp.sort_order ASC, sp.id ASC
       ${limitClause}`,
      params
    );
    res.json({ success: true, products: result.rows, count: result.rows.length });
  } catch (err) {
    console.error('[api/sol/products]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load products' });
  }
});

// GET /api/sol/products/:slug
app.get('/api/sol/products/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sp.*,
              (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved') AS avg_rating,
              (SELECT COUNT(*) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved')::int AS review_count,
              CASE
                WHEN sp.requires_floral_checkout IS NOT NULL THEN sp.requires_floral_checkout
                ELSE COALESCE(
                  (SELECT c.is_floral_category FROM categories c WHERE c.slug = sp.sol_category LIMIT 1),
                  FALSE
                )
              END AS is_floral,
              COALESCE(sp.floral_has_vase, FALSE) AS floral_has_vase
       FROM sol_products sp WHERE sp.slug = $1 AND sp.is_active = TRUE`,
      [req.params.slug]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('[api/sol/products/:slug]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load product' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Floral Checkout: Add-ons catalog
// GET /api/sol/floral/addons
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/sol/floral/addons', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, price, image_url, sort_order,
              addon_group, radio_group, options, requires_option, max_quantity, vase_type
       FROM sol_floral_addons WHERE active = TRUE ORDER BY sort_order ASC, id ASC`
    );
    res.json({ success: true, addons: result.rows });
  } catch (err) {
    console.error('[api/sol/floral/addons]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load add-ons' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Floral Checkout: Save delivery details for a cart item
// POST /api/sol/floral/order-details
// Body: { cart_item_id, delivery_date, recipient_name, delivery_address,
//         delivery_city, delivery_state, delivery_zip, location_type,
//         delivery_instructions, card_message, sender_name, addons[] }
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/sol/floral/order-details', async (req, res) => {
  try {
    const {
      cart_item_id, delivery_date, recipient_name, delivery_address,
      delivery_city, delivery_state, delivery_zip, location_type,
      delivery_instructions, card_message, sender_name, addons
    } = req.body;

    if (!cart_item_id || !delivery_date || !recipient_name || !delivery_address || !location_type) {
      return res.status(400).json({ success: false, message: 'Missing required floral details' });
    }

    // Upsert: delete existing for this cart_item_id then insert fresh
    await pool.query(
      `DELETE FROM sol_floral_order_details WHERE cart_item_id = $1`, [cart_item_id]
    );

    const detailResult = await pool.query(
      `INSERT INTO sol_floral_order_details
         (cart_item_id, delivery_date, recipient_name, delivery_address,
          delivery_city, delivery_state, delivery_zip, location_type,
          delivery_instructions, card_message, sender_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING id`,
      [cart_item_id, delivery_date, recipient_name, delivery_address,
       delivery_city || null, delivery_state || null, delivery_zip || null,
       location_type, delivery_instructions || null, card_message || null, sender_name || null]
    );

    const detailId = detailResult.rows[0].id;

    // Insert selected add-ons
    if (Array.isArray(addons) && addons.length > 0) {
      for (const a of addons) {
        if (a.addon_id && a.quantity > 0) {
          await pool.query(
            `INSERT INTO sol_floral_order_addons (floral_order_detail_id, addon_id, quantity, option_selected)
             VALUES ($1,$2,$3,$4)`,
            [detailId, a.addon_id, a.quantity || 1, a.option_selected || null]
          );
        }
      }
    }

    res.json({ success: true, floral_detail_id: detailId });
  } catch (err) {
    console.error('[api/sol/floral/order-details]', err.message);
    res.status(500).json({ success: false, message: 'Failed to save floral details' });
  }
});

// GET /api/sol/floral/order-details/:cart_item_id — retrieve stored details
app.get('/api/sol/floral/order-details/:cart_item_id', async (req, res) => {
  try {
    const detailResult = await pool.query(
      `SELECT d.*,
              COALESCE(json_agg(json_build_object(
                'addon_id', a.addon_id, 'quantity', a.quantity,
                'name', fa.name, 'price', fa.price, 'option_selected', a.option_selected
              )) FILTER (WHERE a.id IS NOT NULL), '[]') AS addons
       FROM sol_floral_order_details d
       LEFT JOIN sol_floral_order_addons a ON a.floral_order_detail_id = d.id
       LEFT JOIN sol_floral_addons fa ON fa.id = a.addon_id
       WHERE d.cart_item_id = $1
       GROUP BY d.id
       ORDER BY d.created_at DESC LIMIT 1`,
      [req.params.cart_item_id]
    );
    if (!detailResult.rows.length) {
      return res.json({ success: true, detail: null });
    }
    res.json({ success: true, detail: detailResult.rows[0] });
  } catch (err) {
    console.error('[api/sol/floral/order-details GET]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load floral details' });
  }
});

// Admin: GET /api/admin/floral/addons — manage add-on catalog
app.get('/api/admin/floral/addons', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM sol_floral_addons ORDER BY sort_order ASC, id ASC`
    );
    res.json({ success: true, addons: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Admin: PUT /api/admin/floral/addons/:id — toggle active, update price/name
app.put('/api/admin/floral/addons/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { name, price, active, sort_order, image_url } = req.body;
    const result = await pool.query(
      `UPDATE sol_floral_addons SET name=COALESCE($1,name), price=$2, active=COALESCE($3,active),
       sort_order=COALESCE($4,sort_order), image_url=$5
       WHERE id=$6 RETURNING *`,
      [name, price !== undefined ? price : null, active, sort_order, image_url || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Addon not found' });
    res.json({ success: true, addon: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Popular Products (homepage section) — admin-configured via site_settings
// GET /api/sol/popular-products
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/sol/popular-products', async (req, res) => {
  try {
    let products = null;

    // Check for admin-configured selection in site_settings
    const settingsResult = await pool.query(
      `SELECT value FROM site_settings WHERE key = 'popular_products'`
    );
    if (settingsResult.rows.length > 0) {
      let ids;
      try { ids = JSON.parse(settingsResult.rows[0].value); } catch(e) { ids = []; }
      if (Array.isArray(ids) && ids.length > 0) {
        const result = await pool.query(
          `SELECT sp.id, sp.name, sp.slug, sp.sol_category, sp.subcategory, sp.short_description,
                  sp.price, sp.price_label, sp.images, sp.availability, sp.is_featured, sp.sort_order,
                  (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved') AS avg_rating,
                  (SELECT COUNT(*) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved')::int AS review_count
           FROM sol_products sp
           WHERE sp.id = ANY($1) AND sp.is_active = TRUE AND sp.slug IS NOT NULL AND sp.slug != ''`,
          [ids]
        );
        // Preserve admin-defined order
        const productMap = {};
        result.rows.forEach(p => { productMap[p.id] = p; });
        const ordered = ids.map(id => productMap[id]).filter(Boolean);
        if (ordered.length > 0) products = ordered;
      }
    }

    // Fallback: featured products with valid slugs
    if (!products || products.length === 0) {
      const result = await pool.query(
        `SELECT sp.id, sp.name, sp.slug, sp.sol_category, sp.subcategory, sp.short_description,
                sp.price, sp.price_label, sp.images, sp.availability, sp.is_featured, sp.sort_order,
                (SELECT ROUND(AVG(r.rating)::numeric, 1) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved') AS avg_rating,
                (SELECT COUNT(*) FROM sol_reviews r WHERE r.product_id = sp.id AND r.status = 'approved')::int AS review_count
         FROM sol_products sp
         WHERE sp.is_active = TRUE AND sp.is_featured = TRUE AND sp.slug IS NOT NULL AND sp.slug != ''
         ORDER BY sp.sort_order ASC, sp.id ASC
         LIMIT 4`
      );
      products = result.rows;
    }

    res.json({ success: true, products: products.slice(0, 4) });
  } catch (err) {
    console.error('[api/sol/popular-products]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load popular products' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Promo Code Validation API
// POST /api/validate-promo
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/validate-promo', async (req, res) => {
  try {
    const { code, email } = req.body || {};
    if (!code) return res.json({ valid: false, message: 'No promo code provided.' });
    const codeUpper = String(code).toUpperCase().trim();
    if (codeUpper !== 'WELCOME10') {
      return res.json({ valid: false, message: `"${codeUpper}" is not a valid promo code.` });
    }
    if (!email || !email.includes('@')) {
      // Allow preview without email (show what discount would be)
      return res.json({ valid: true, discount_pct: 10, message: '10% off your order — enter your email to apply at checkout.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const row = await pool.query(
      `SELECT discount_code_used FROM sol_subscribers WHERE email = $1`,
      [cleanEmail]
    );
    if (row.rows.length > 0 && row.rows[0].discount_code_used) {
      return res.json({ valid: false, message: 'This code has already been used for your account.' });
    }
    return res.json({ valid: true, discount_pct: 10, message: '10% off applied!' });
  } catch (err) {
    console.error('[api/validate-promo]', err.message);
    res.json({ valid: false, message: 'Could not validate code. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SOL Checkout API
// POST /api/sol/checkout
// ─────────────────────────────────────────────────────────────────────────────
// Auto-add promo columns if migration hasn't run yet
pool.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS promo_code VARCHAR(50)`)
  .catch(() => {});
pool.query(`ALTER TABLE sol_orders ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(10,2) DEFAULT 0`)
  .catch(() => {});

app.post('/api/sol/checkout', async (req, res) => {
  try {
    const {
      customer_name, customer_email, customer_phone,
      fulfillment_type, shipping_address, shipping_city, shipping_state, shipping_zip,
      delivery_zip, delivery_fee, shipping_fee,
      subtotal, total_price, items, notes,
      promo_code,
    } = req.body || {};

    if (!customer_name || !customer_name.trim()) {
      return res.status(400).json({ success: false, message: 'Your name is required.' });
    }
    if (!customer_email || !customer_email.includes('@')) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'No items in cart.' });
    }

    const sub = parseFloat(subtotal) || 0;
    const cleanEmail = customer_email.trim().toLowerCase();

    // ── Promo code validation ─────────────────────────────────────────────────
    let discountAmount = 0;
    let appliedPromo = null;
    const promoUpper = (promo_code || '').toUpperCase().trim();

    if (promoUpper === 'WELCOME10') {
      // Check if subscriber exists and hasn't used the code
      const subCheck = await pool.query(
        `SELECT id, discount_code_used FROM sol_subscribers WHERE email = $1`,
        [cleanEmail]
      );
      if (subCheck.rows.length > 0 && !subCheck.rows[0].discount_code_used) {
        // Valid! Apply 10% off subtotal
        discountAmount = parseFloat((sub * 0.10).toFixed(2));
        appliedPromo = 'WELCOME10';
      } else if (subCheck.rows.length > 0 && subCheck.rows[0].discount_code_used) {
        return res.status(400).json({ success: false, message: 'Promo code WELCOME10 has already been used for this email address.' });
      } else {
        // Not a subscriber — still honour the code but register them
        discountAmount = parseFloat((sub * 0.10).toFixed(2));
        appliedPromo = 'WELCOME10';
        // Auto-subscribe them
        await pool.query(
          `INSERT INTO sol_subscribers (email, source) VALUES ($1, 'checkout') ON CONFLICT (email) DO NOTHING`,
          [cleanEmail]
        ).catch(() => {});
      }
    } else if (promoUpper && promoUpper !== '') {
      return res.status(400).json({ success: false, message: `Promo code "${promoUpper}" is not valid.` });
    }

    const discountedSub = parseFloat((sub - discountAmount).toFixed(2));

    // Server-side recalculate shipping to enforce rates (never trust client)
    // $4.79 flat, free over $25. Ships Tue/Thu only.
    const SOL_SHIP_FEE = 4.79;
    const SOL_FREE_SHIP_THRESHOLD = 25;
    let calcShippingFee = 0;
    let calcDeliveryFee = parseFloat(delivery_fee) || 0;
    if (fulfillment_type === 'ship') {
      calcShippingFee = discountedSub >= SOL_FREE_SHIP_THRESHOLD ? 0 : SOL_SHIP_FEE;
    }

    const totalAmt = parseFloat((discountedSub + calcShippingFee + calcDeliveryFee).toFixed(2));
    if (totalAmt <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid order total.' });
    }

    // Validate shipping if selected
    if (fulfillment_type === 'ship' && (!shipping_address || !shipping_city || !shipping_zip)) {
      return res.status(400).json({ success: false, message: 'Shipping address is required.' });
    }

    // Insert order
    const orderResult = await pool.query(
      `INSERT INTO sol_orders
         (status, fulfillment_type, customer_name, customer_email, customer_phone,
          shipping_address, shipping_city, shipping_state, shipping_zip,
          delivery_zip, subtotal, shipping_fee, delivery_fee, total_price,
          items, notes, promo_code, discount_amount)
       VALUES ('pending_payment',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17)
       RETURNING id`,
      [
        fulfillment_type || 'pickup',
        customer_name.trim(),
        customer_email.trim(),
        (customer_phone || '').trim() || null,
        (shipping_address || '').trim() || null,
        (shipping_city || '').trim() || null,
        (shipping_state || 'GA').trim(),
        (shipping_zip || '').trim() || null,
        delivery_zip || null,
        discountedSub,
        calcShippingFee,
        calcDeliveryFee,
        totalAmt,
        JSON.stringify(items || []),
        (notes || '').trim() || null,
        appliedPromo || null,
        discountAmount,
      ]
    );
    const orderId = orderResult.rows[0].id;
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    const orderNumber = `SOL-FARM-${today}-${String(orderId).padStart(4,'0')}`;
    await pool.query(`UPDATE sol_orders SET order_number = $1 WHERE id = $2`, [orderNumber, orderId]);

    // Mark promo code as used
    if (appliedPromo === 'WELCOME10') {
      await pool.query(
        `UPDATE sol_subscribers SET discount_code_used = TRUE WHERE email = $1`,
        [cleanEmail]
      ).catch(err => console.warn('[checkout] Could not mark promo used:', err.message));
    }

    console.log(`[sol/checkout] New order #${orderId} (${orderNumber}) — ${customer_name} — $${totalAmt} — ${fulfillment_type}${appliedPromo ? ` — promo: ${appliedPromo} (-$${discountAmount})` : ''}`);

    // Stripe via Polsia proxy
    const polsiaApiKey = process.env.POLSIA_API_KEY;
    if (!polsiaApiKey) {
      const fallbackRes = await pool.query(`UPDATE sol_orders SET status='confirmed', order_status='new' WHERE id=$1 RETURNING *`, [orderId]);
      console.warn('[sol/checkout] POLSIA_API_KEY not set — order confirmed without payment');
      // Send email notifications even without Stripe
      if (fallbackRes.rows.length > 0) {
        const fbOrder = fallbackRes.rows[0];
        if (typeof fbOrder.items === 'string') { try { fbOrder.items = JSON.parse(fbOrder.items); } catch(e) {} }
        sendOrderNotificationEmails(fbOrder);
      }
      const fulfillSuffix = fulfillment_type === 'ship' ? '&fulfillment=ship' : '';
      return res.json({ success: true, order_id: orderId, order_number: orderNumber, redirect_url: `/sol/order-confirmed?order=${orderNumber}${fulfillSuffix}` });
    }

    // Build product name for Stripe
    const itemSummary = items.slice(0,2).map(i => i.name).join(', ') + (items.length > 2 ? ` +${items.length-2} more` : '');
    const fulfillSuffix = fulfillment_type === 'ship' ? '&fulfillment=ship' : '';

    const checkoutRes = await fetch('https://polsia.com/api/payments/checkout-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${polsiaApiKey}` },
      body: JSON.stringify({
        amount: totalAmt,
        name: `Sugar Oak Lane — ${itemSummary}`,
        description: fulfillment_type === 'pickup' ? 'Farm pickup order' : `Ship to ${shipping_city || 'your address'}`,
        success_url: `${APP_URL}/sol/order-confirmed?order=${orderNumber}&session_id={CHECKOUT_SESSION_ID}${fulfillSuffix}`,
        cancel_url: `${APP_URL}/shop/cart`
      })
    });

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text();
      console.error('[sol/checkout] Polsia payment error:', checkoutRes.status, errText);
      await pool.query(`UPDATE sol_orders SET status='confirmed' WHERE id=$1`, [orderId]);
      return res.json({ success: true, order_id: orderId, order_number: orderNumber, redirect_url: `/sol/order-confirmed?order=${orderNumber}${fulfillSuffix}` });
    }

    const checkoutData = await checkoutRes.json();
    res.json({ success: true, checkout_url: checkoutData.url, order_id: orderId, order_number: orderNumber });
  } catch (err) {
    console.error('[api/sol/checkout]', err.message);
    res.status(500).json({ success: false, message: 'Failed to create checkout. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SOL order confirmation (after Stripe payment)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/sol/order-confirmed', async (req, res) => {
  const { order, session_id } = req.query;
  if (order && session_id) {
    try {
      const updateRes = await pool.query(
        `UPDATE sol_orders SET status='confirmed', order_status='new', stripe_session_id=$1 WHERE order_number=$2 AND status='pending_payment' RETURNING *`,
        [session_id, order]
      );
      // Send email notifications for confirmed orders
      if (updateRes.rows.length > 0) {
        const confirmedOrder = updateRes.rows[0];
        // Parse items if stored as string
        if (typeof confirmedOrder.items === 'string') {
          try { confirmedOrder.items = JSON.parse(confirmedOrder.items); } catch(e) {}
        }
        sendOrderNotificationEmails(confirmedOrder);
        decrementInventory(confirmedOrder);
      }
    } catch(e) { console.error('[sol/order-confirmed]', e.message); }
  }
  serveStaticPage('sol-order-confirmed')(req, res);
});

// ─────────────────────────────────────────────────────────────────────────────
// Product detail page: /product/:slug → redirect to SOL layout
// ─────────────────────────────────────────────────────────────────────────────
app.get('/product/:slug', (req, res) => {
  res.redirect(301, `/shop/product/${req.params.slug}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Homepage (must come before express.static to override index.html)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'sol-home.html');
  if (fs.existsSync(htmlPath)) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate').sendFile(htmlPath);
  } else {
    res.redirect('/sugar-oak-lane');
  }
});

// Block direct access to index.html — redirect to proper homepage
app.get('/index.html', (req, res) => res.redirect(301, '/'));

// Block direct access to admin.html (must go before express.static)
app.get('/admin.html', (req, res) => res.redirect(301, '/admin'));
app.get('/admin-login.html', (req, res) => res.redirect(301, '/admin/login'));

// Block direct access to wholesale portal HTML files (must go before express.static)
app.get('/sol-wholesale-portal.html', (req, res) => res.redirect(301, '/wholesale-portal'));
app.get('/sol-wholesale-login.html', (req, res) => res.redirect(301, '/wholesale-portal/login'));

// Block access to template files (contain raw {{...}} placeholders)
app.get('/templates/*', (req, res) => res.redirect('/'));

// ─────────────────────────────────────────────────────────────────────────────
// Admin dashboard — session-protected (MUST come before express.static)
// ─────────────────────────────────────────────────────────────────────────────

// Login page
app.get('/admin/login', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidAdminCookie(cookies.admin_session)) return res.redirect('/admin');
  const htmlPath = path.join(__dirname, 'public', 'admin-login.html');
  if (fs.existsSync(htmlPath)) {
    res.set('Cache-Control', 'no-store').sendFile(htmlPath);
  } else {
    res.status(404).send('Login page not found');
  }
});

// Login POST
app.post('/admin/login', (req, res) => {
  const { password } = req.body || {};
  const expected = process.env.ADMIN_PASSWORD || process.env.POLSIA_API_KEY;
  if (!expected) {
    return res.redirect('/admin/login?error=no-password-set');
  }
  const pBuf = Buffer.from(String(password || ''));
  const eBuf = Buffer.from(expected);
  const match = pBuf.length === eBuf.length && crypto.timingSafeEqual(pBuf, eBuf);
  if (!match) {
    return res.redirect('/admin/login?error=1');
  }
  const cookieVal = signAdminCookie();
  const maxAge = 7 * 24 * 60 * 60; // 7 days
  res.setHeader('Set-Cookie', `admin_session=${encodeURIComponent(cookieVal)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
  res.redirect('/admin');
});

app.post('/admin/forgot-password', async (req, res) => {
  try {
    const pw = process.env.ADMIN_PASSWORD || 'changeme';
    const baseUrl = process.env.BASE_URL || 'https://sugaroakos.polsia.app';
    await sendEmail({
      to: 'nakita.hemingway@gmail.com',
      subject: 'Sugar Oak Lane - Your Admin Password',
      html: '<p>Your admin password is: <strong>' + pw + '</strong></p><p>Log in at: <a href="' + baseUrl + '/admin/login">' + baseUrl + '/admin/login</a></p>'
    });
  } catch (e) { console.error('[Admin] Forgot password email error:', e); }
  res.json({ success: true, message: 'Password sent to admin email.' });
});

// Logout
app.get('/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.redirect('/admin/login');
});

// Admin dashboard (requires session)
app.get('/admin', (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  if (!isValidAdminCookie(cookies.admin_session)) {
    return res.redirect('/admin/login');
  }
  const htmlPath = path.join(__dirname, 'public', 'admin.html');
  if (!fs.existsSync(htmlPath)) return res.redirect('/admin/login');
  res.set('Cache-Control', 'no-store').sendFile(htmlPath);
});

// Trailing slash redirect for /admin/
app.get('/admin/', (req, res) => res.redirect(301, '/admin'));

// ─────────────────────────────────────────────────────────────────────────────
// Static files (public/)
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────────────────────────────────────────
// Policy pages (serve static HTML at clean URLs)
// ─────────────────────────────────────────────────────────────────────────────
function serveStaticPage(pageName) {
  return (req, res) => {
    const htmlPath = path.join(__dirname, 'public', `${pageName}.html`);
    if (fs.existsSync(htmlPath)) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate').sendFile(htmlPath);
    } else {
      res.redirect('/');
    }
  };
}
// Policy pages — SOL branded (substitution + refund already serve correct files)
app.get('/delivery-policy', (req, res) => res.redirect(301, '/delivery-info')); // legacy redirect
app.get('/delivery-info', serveStaticPage('sol-delivery'));
app.get('/substitution-policy', serveStaticPage('substitution-policy'));
app.get('/refund-policy', serveStaticPage('refund-policy'));

// ─────────────────────────────────────────────────────────────────────────────
// Sugar Oak Lane Farm Storefront — fully built pages
// ─────────────────────────────────────────────────────────────────────────────
app.get('/sugar-oak-lane', serveStaticPage('sol-home'));
app.get('/farm', serveStaticPage('sol-home'));

// ─── Shop ───────────────────────────────────────────────────────────────────
app.get('/shop', serveStaticPage('sol-shop'));
app.get('/shop/flower-shop', serveStaticPage('sol-shop-flowers'));
app.get('/shop/seeds-bulbs', (req, res) => res.redirect(301, '/shop?cat=seeds-bulbs'));
app.get('/shop/plant-nursery', (req, res) => res.redirect(301, '/shop?cat=plant-nursery'));
app.get('/shop/farm-goods', (req, res) => res.redirect(301, '/shop?cat=farm-goods'));
app.get('/shop/farm-goods-merch', (req, res) => res.redirect(301, '/shop?cat=farm-goods')); // legacy

// ─── SOL Product Detail, Cart, Checkout ─────────────────────────────────────
app.get('/shop/product/:slug', serveStaticPage('sol-product'));
app.get('/shop/cart', serveStaticPage('sol-cart'));
app.get('/shop/checkout', serveStaticPage('sol-checkout'));

// ─── Wholesale (marketing page) ─────────────────────────────────────────────
app.get('/wholesale', serveStaticPage('sol-wholesale'));

// ─── Wholesale Portal (password-protected ordering portal) ───────────────────
app.get('/wholesale-portal/login', (req, res) => {
  const customerId = getWsCustomerId(req);
  if (customerId) return res.redirect('/wholesale-portal');
  const htmlPath = path.join(__dirname, 'public', 'sol-wholesale-login.html');
  res.set('Cache-Control', 'no-store').sendFile(htmlPath);
});

app.get('/wholesale-portal', (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.redirect('/wholesale-portal/login');
  const htmlPath = path.join(__dirname, 'public', 'sol-wholesale-portal.html');
  res.set('Cache-Control', 'no-store').sendFile(htmlPath);
});

// ─── Weddings + Events ──────────────────────────────────────────────────────
app.get('/weddings', serveStaticPage('sol-weddings'));
app.get('/weddings/diy', serveStaticPage('sol-weddings-diy'));
app.get('/weddings/events', serveStaticPage('sol-events'));
// Legacy route aliases
app.get('/weddings-events', (req, res) => res.redirect(301, '/weddings'));
app.get('/weddings-events/weddings', (req, res) => res.redirect(301, '/weddings'));
app.get('/weddings-events/diy-wedding-flowers', (req, res) => res.redirect(301, '/weddings/diy'));
app.get('/weddings-events/banquets', (req, res) => res.redirect(301, '/weddings/events'));

// ─── Workshops ──────────────────────────────────────────────────────────────
app.get('/workshops', serveStaticPage('sol-workshops'));

// ─── Subscriptions ──────────────────────────────────────────────────────────
app.get('/subscriptions', serveStaticPage('sol-subscriptions'));

// ─── About ──────────────────────────────────────────────────────────────────
app.get('/about', serveStaticPage('sol-about'));
app.get('/about/our-story', serveStaticPage('sol-about'));
app.get('/about/contact', (req, res) => res.redirect(301, '/contact'));
app.get('/contact', serveStaticPage('sol-contact'));

// ─── Help / FAQ ─────────────────────────────────────────────────────────────
app.get('/faq', serveStaticPage('sol-faq'));
app.get('/privacy', serveStaticPage('sol-coming-soon'));
app.get('/terms', serveStaticPage('sol-coming-soon'));

// ─── Blog ───────────────────────────────────────────────────────────────────
// Public blog API — returns published posts from database
app.get('/api/blog', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, title, slug, excerpt, image_url, author, tags, is_published, published_at, created_at
       FROM blog_posts WHERE is_published = true ORDER BY published_at DESC, created_at DESC`
    );
    res.json({ success: true, posts: result.rows });
  } catch (err) {
    // Table may not exist yet
    res.json({ success: true, posts: [] });
  }
});

// Public blog API — returns published posts (DB + hardcoded fallbacks) with pagination
// IMPORTANT: This must be registered BEFORE /api/blog/:slug to avoid :slug matching "posts"
app.get('/api/blog/posts', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 6));
  const offset = (page - 1) * limit;

  // Build the hardcoded fallback posts array (always available)
  const hcPosts = Object.entries(BLOG_POSTS).map(([slug, p], i) => ({
    id: -(i + 1), title: p.title, slug, excerpt: p.excerpt,
    image_url: null, author: 'Sugar Oak Lane',
    tags: [p.category], published_at: p.date, created_at: p.date,
    _gradient: p.gradient, _category: p.category
  }));

  try {
    const countR = await pool.query(`SELECT COUNT(*) FROM blog_posts WHERE is_published = true`);
    const totalDb = parseInt(countR.rows[0].count);
    const postsR = await pool.query(
      `SELECT id, title, slug, excerpt, image_url, author, tags, published_at, created_at
       FROM blog_posts WHERE is_published = true
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    let posts = postsR.rows;
    let total = totalDb;

    // Merge strategy: if DB has fewer posts than we need for a full page,
    // supplement with hardcoded posts (excluding those with matching slugs).
    if (total < limit && page === 1) {
      const dbSlugs = new Set(posts.map(p => p.slug));
      const extras = hcPosts.filter(hp => !dbSlugs.has(hp.slug));
      posts = [...posts, ...extras].slice(0, limit);
      total = Math.max(total, posts.length);
    } else if (total === 0) {
      // No DB posts at all — return hardcoded
      total = hcPosts.length;
      posts = hcPosts.slice(offset, offset + limit);
    }

    res.json({
      success: true, posts, total,
      page, limit, pages: Math.ceil(total / limit)
    });
  } catch (err) {
    // If table doesn't exist yet, return hardcoded
    res.json({
      success: true, posts: hcPosts.slice(0, limit), total: hcPosts.length,
      page: 1, limit, pages: 1
    });
  }
});

// Public blog post by slug — returns a single published post
// MUST come AFTER /api/blog/posts to avoid :slug matching "posts"
app.get('/api/blog/:slug', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true`,
      [req.params.slug]
    );
    if (result.rows.length) {
      return res.json({ success: true, post: result.rows[0] });
    }
    res.status(404).json({ success: false, message: 'Post not found' });
  } catch (err) {
    res.status(404).json({ success: false, message: 'Post not found' });
  }
});

app.get('/blog', serveStaticPage('sol-blog'));

const BLOG_POSTS = {
  'how-to-grow-dahlias': {
    title: 'How to Grow Dahlias from Tubers: A Step-by-Step Farm Guide',
    category: 'Growing Guide',
    date: 'March 18, 2026',
    excerpt: 'Everything you need to know about planting, staking, and harvesting dahlias — straight from our fields where we grow 50+ varieties each season.',
    gradient: '#5a6b40, #8a9a60',
    content: `
      <h2>Why We Love Dahlias</h2>
      <p>Dahlias are the showstoppers of the cutting garden. They bloom from midsummer through the first frost, producing an almost absurd number of flowers in every color imaginable — except blue. On our farm, we grow over 50 varieties, from dinnerplate-sized 'Café au Lait' to the tight pompom blooms of 'Wizard of Oz'.</p>
      <p>If you've never grown dahlias before, don't be intimidated. They're one of the most rewarding flowers you can grow, and the tubers we sell are the same ones we plant in our own fields every spring.</p>

      <h2>When to Plant</h2>
      <p>In Georgia (Zone 7b–8a), we plant dahlia tubers in <strong>mid-April to early May</strong>, after the last frost date has passed and soil temperatures are consistently above 60°F. Planting too early in cold, wet soil is the number one cause of tuber rot.</p>
      <blockquote>If you can walk barefoot on the soil comfortably, it's warm enough for dahlias.</blockquote>
      <p>We typically start planting the week after Tax Day and finish by Mother's Day. This gives us blooms from early July through November.</p>

      <h2>Step 1: Choose Your Spot</h2>
      <p>Dahlias need <strong>full sun</strong> — at least 6-8 hours of direct sunlight per day. They also need well-drained soil. If your garden holds water after rain, either amend with compost and perlite or plant in raised beds.</p>
      <p>Avoid planting near large trees or buildings that cast afternoon shade. Morning sun with afternoon shade is acceptable, but full sun produces the strongest stems and most vibrant colors.</p>

      <h2>Step 2: Prepare the Soil</h2>
      <p>We amend our dahlia beds with:</p>
      <ul>
        <li>2-3 inches of finished compost worked into the top 12 inches</li>
        <li>A balanced granular fertilizer (we use 10-10-10) at planting time</li>
        <li>A handful of bone meal in each planting hole for root development</li>
      </ul>
      <p>Dahlias are heavy feeders, so don't skimp on soil preparation. Good soil = bigger blooms.</p>

      <h2>Step 3: Plant the Tubers</h2>
      <p>Dig a hole about <strong>6 inches deep</strong>. Lay the tuber horizontally with the eye (growing point) facing up. The eye is the small bump where the tuber meets the old stem — that's where the new plant will sprout.</p>
      <p><strong>Do not water at planting.</strong> This is the most common mistake new dahlia growers make. The tuber has enough stored energy and moisture to begin growing. Watering too early promotes rot. Wait until you see green growth above the soil (usually 2-3 weeks), then begin watering regularly.</p>
      <p>Space tubers <strong>18-24 inches apart</strong> for standard varieties, 12-15 inches for smaller types.</p>

      <h2>Step 4: Stake at Planting Time</h2>
      <p>This is critical — stake when you plant, not after the plant is 4 feet tall and flopping over. We use 5-foot bamboo stakes or metal T-posts next to each tuber. As the plant grows, tie it to the stake with soft twine every 12-18 inches.</p>

      <h2>Step 5: Pinch for More Blooms</h2>
      <p>When your dahlia plant reaches about <strong>12 inches tall with 4 sets of leaves</strong>, pinch out the center growing tip. This encourages the plant to branch, producing 3-4x more flowering stems than an unpinched plant. Yes, it feels wrong to cut off a perfectly healthy growing tip. Do it anyway.</p>

      <h2>Step 6: Water and Feed</h2>
      <p>Once dahlias are growing, they want <strong>deep watering 2-3 times per week</strong> (not daily shallow watering). We use drip irrigation on timers. Overhead watering promotes powdery mildew, so try to keep foliage dry.</p>
      <p>Beginning in July, we switch to a high-phosphorus fertilizer (like 5-10-10) every two weeks to promote blooming over leafy growth.</p>

      <h2>Step 7: Harvest and Enjoy</h2>
      <p>Cut dahlias when blooms are <strong>75% open</strong> — they don't continue opening once cut. Harvest in the morning or evening, and immediately place stems in cool water. Strip all leaves that would be below the waterline.</p>
      <p>With regular cutting, each plant will produce 20-40+ stems over the season. The more you cut, the more they bloom — it's like the plant is daring you to keep going.</p>

      <blockquote>Dahlias are the one flower that rewards you for being greedy. The more you pick, the more they give.</blockquote>

      <h2>Our Favorite Varieties for Beginners</h2>
      <ul>
        <li><strong>Café au Lait</strong> — The classic creamy peachy-pink dinnerplate. Impossible to grow just one.</li>
        <li><strong>Labyrinth</strong> — Bronze-gold with incredible texture. A florist favorite.</li>
        <li><strong>Jowey Winnie</strong> — Compact, prolific, and absolutely covered in blooms.</li>
        <li><strong>Thomas Edison</strong> — Deep purple dinnerplate. Dramatic and reliable.</li>
        <li><strong>Cornel Bronze</strong> — Warm bronze tones that look stunning in autumn arrangements.</li>
      </ul>
      <p>All of these varieties (and more) are available in our <a href="/shop?cat=seeds-bulbs">seed and tuber shop</a> while supplies last.</p>
    `
  },
  'cutting-garden-spring-planning': {
    title: "Planning Your Spring Cutting Garden: What We're Growing This Year",
    category: 'Farm Planning',
    date: 'February 28, 2026',
    excerpt: "A look inside our spring planning process — which varieties we're adding, what we're phasing out, and how we decide what makes the cut (literally).",
    gradient: '#4a3a50, #7a6a80',
    content: `
      <h2>The Annual Seed Audit</h2>
      <p>Every February, we sit down at the kitchen table with our seed inventory, last year's harvest records, and a ruthless attitude. This is when we decide what earns a spot in the field — and what gets dropped. Space on the farm is finite. Every row planted with something mediocre is a row that could have held something extraordinary.</p>
      <p>Our criteria are simple: <strong>Does it grow well here? Does it harvest well? Do people love it?</strong> If the answer isn't yes to all three, it's out.</p>

      <h2>What We're Adding in 2026</h2>
      <p>This year, we're excited about a few new additions to the farm:</p>
      <ul>
        <li><strong>Ranunculus 'Champagne'</strong> — We've trialed these in small batches for two years. The soft peachy-champagne color is unlike anything else we grow, and they hold up beautifully in arrangements.</li>
        <li><strong>Lisianthus (double rose series)</strong> — We're expanding our lisianthus beds from 200 to 500 plants. They're slow to start but the blooms rival roses and last 2+ weeks in a vase. Our wedding clients can't get enough of them.</li>
        <li><strong>Chocolate Cosmos</strong> — Yes, they really do smell like chocolate. A conversation starter in every bouquet.</li>
        <li><strong>Orlaya grandiflora</strong> — The most delicate, lace-like white flower you'll ever see. Perfect filler for garden-style arrangements.</li>
      </ul>

      <h2>What We're Phasing Out</h2>
      <p>Every addition means something has to go. Here's what's leaving the rotation:</p>
      <ul>
        <li><strong>Standard snapdragons</strong> — We're replacing these with butterfly snapdragons, which have a more open, airy form that works better in loose arrangements.</li>
        <li><strong>Rudbeckia 'Cherokee Sunset'</strong> — Beautiful flower, terrible vase life. We tried every post-harvest trick and could never get more than 4 days out of them.</li>
        <li><strong>Marigolds (standard African varieties)</strong> — The market is oversaturated. Everyone grows marigolds. We're keeping our heirloom French varieties but dropping the big pom-pom types.</li>
      </ul>

      <h2>Our Core Crops (Never Changing)</h2>
      <p>Some crops earn their spot every year without question:</p>
      <ul>
        <li><strong>Dahlias</strong> — Our #1 crop. 50+ varieties, planted across 6 rows. They produce from July through frost and our customers are borderline obsessed.</li>
        <li><strong>Zinnias</strong> — The backbone of our summer bouquets. We grow 'Benary's Giant' and 'Queen Lime' series in massive quantities.</li>
        <li><strong>Sunflowers</strong> — Succession-planted every 10 days from April through August. We can never grow enough.</li>
        <li><strong>Sweet peas</strong> — Our earliest spring crop. They go in as seeds in November (yes, November) and are the first flowers we sell in March.</li>
        <li><strong>Cosmos</strong> — 'Double Click' and standard 'Sensation' mix. They fill bouquets with movement and airiness that no other flower provides.</li>
      </ul>

      <h2>The Seed Ordering Process</h2>
      <p>We order from a handful of trusted suppliers:</p>
      <ul>
        <li><strong>Johnny's Selected Seeds</strong> — Our primary source for annual cutting flowers. Excellent germination rates and variety selection.</li>
        <li><strong>Floret Flowers</strong> — Specifically for dahlia tubers and specialty ranunculus. Their varieties are curated for the cut flower market.</li>
        <li><strong>Select Seeds</strong> — Heirloom and unusual varieties that you can't find elsewhere.</li>
      </ul>
      <p>We place our main seed order in December and a smaller succession order in February. By March, everything has arrived and we're starting seeds in the greenhouse.</p>

      <blockquote>A cutting garden isn't about growing every flower that exists. It's about growing the right flowers incredibly well.</blockquote>

      <h2>Your Turn</h2>
      <p>If you're planning your own cutting garden this spring, start with 5 varieties max. Master those, then expand next year. We sell seed packets and tubers for all of our core varieties in our <a href="/shop?cat=seeds-bulbs">farm shop</a>.</p>
      <p>Need help deciding what to grow? Send us a note at <a href="mailto:hello@sugaroaklane.com">hello@sugaroaklane.com</a> — we love talking about this stuff.</p>
    `
  },
  'georgia-flower-farming-calendar': {
    title: 'A Flower Farmer\'s Calendar: What to Plant When in Georgia',
    category: 'Farm Life',
    date: 'March 28, 2026',
    excerpt: 'Month-by-month, here\'s what we\'re planting, cutting, and selling on the farm in Zone 7b. A practical guide for Georgia home gardeners and aspiring flower growers.',
    gradient: '#3a5040, #6a8060',
    content: `
      <h2>Why a Georgia-Specific Calendar Matters</h2>
      <p>Most flower growing guides are written for the Pacific Northwest or New England. They assume cool summers, mild winters, and a growing season that doesn't start sweating until August. That is not Georgia. Zone 7b/8a presents a completely different set of conditions — hot humid summers, mild winters, the occasional late frost that punches you in February just when you thought you were safe.</p>
      <p>This calendar is built from over a decade of growing cut flowers in Loganville, Georgia. It reflects what actually works in red clay, in 95-degree July heat, in the weird warm spells we get in January that make you want to start seeds too early. Use it as a guide, not gospel — every year is a little different.</p>

      <h2>January: Planning and Ordering</h2>
      <p>January is desk work. Order seeds now. Our seed orders go out the first week of January, before the most popular varieties sell out. We order from Johnny's Selected Seeds (primary), Floret (dahlia tubers, specialty ranunculus), and Select Seeds (heirlooms and unusual varieties).</p>
      <p>This month we're also starting: <strong>snapdragons</strong> under grow lights (they need 8–10 weeks to size up before transplant). If you have greenhouse space, sweet peas go out as winter sowings this month.</p>

      <h2>February: Seeds Under Lights</h2>
      <p>The seeding starts in earnest. Under grow lights, we're starting:</p>
      <ul>
        <li><strong>Lisianthus</strong> — The slowest, most finicky crop we grow. 5+ months from seed to bloom. Start now and they'll be ready for summer markets.</li>
        <li><strong>Stocks and larkspur</strong> — Both benefit from direct sowing outside now if temps stay above 25°F at night.</li>
        <li><strong>Anemones and ranunculus corms</strong> — Pre-soak and plant in the greenhouse in February for March–May blooms.</li>
      </ul>
      <p>Late February: Watch the extended forecast carefully. We've had 70-degree days in February followed by a killing frost in March. Don't transplant anything outdoors yet.</p>

      <h2>March: Spring Awakens (Sort Of)</h2>
      <p>March is the most exciting and most treacherous month on the farm. The daffodils and tulips are peaking. Sweet peas that were planted in fall or winter are climbing and starting to bloom. The greenhouse is packed with seedlings.</p>
      <p>Outdoor planting starts cautiously mid-to-late March after the last expected frost date (March 15–20 for our area, though we've seen frost into early April). We start transplanting cold-hardy crops:</p>
      <ul>
        <li>Snapdragons (can handle light frost)</li>
        <li>Stock and larkspur</li>
        <li>Bachelor's button (direct sow)</li>
        <li>Orlaya and ammi (direct sow)</li>
      </ul>

      <blockquote>If you can walk barefoot on the soil comfortably, it's warm enough to start planting tender crops. Before that, cold-tolerant only.</blockquote>

      <h2>April: Main Planting Season Begins</h2>
      <p>April is one of the two busiest months on the farm (October is the other). Tax Day is our unofficial marker for transitioning from cold-tolerant to warm-season planting. After April 15, we're clear to plant everything.</p>
      <ul>
        <li><strong>Dahlia tubers</strong> — Plant mid-to-late April, once soil is 60°F+. Do not rush this; cold wet soil rots tubers.</li>
        <li><strong>Zinnia, sunflower, cosmos</strong> — Direct sow after last frost. They germinate fast and catch up quickly.</li>
        <li><strong>Basil and celosia</strong> — Transplant starts outdoors once nights stay above 50°F reliably.</li>
      </ul>
      <p>Harvest this month: sweet peas (peak!), anemones, ranunculus, snapdragons, larkspur, stock. This is one of the prettiest months in the cutting garden.</p>

      <h2>May: Full Production Kicks In</h2>
      <p>Sweet peas start fading as temps warm. Everything else is ramping up. Zinnias are 4–6 inches tall. Dahlia eyes are emerging from the soil. The farm starts looking like a farm.</p>
      <p>This is also when we transplant our <strong>lisianthus plugs</strong> to the field (they've been growing under lights since January — those 5 months pay off now). We stake dahlia beds as soon as the plants reach 8–10 inches.</p>

      <h2>June: First Summer Blooms</h2>
      <p>Zinnias start cutting in late June. Sunflowers follow. The farm transitions from the delicate spring palette (soft pinks, mauves, lavenders) to the rich, saturated summer palette (vivid oranges, magentas, golds). It's a different kind of beautiful.</p>
      <p>Early dahlias (particularly the smaller varieties) may start blooming by late June in a warm year.</p>

      <h2>July–August: Peak Summer Production</h2>
      <p>This is the hardest and most productive time of year. Temperatures hit 95°F+ regularly. We harvest in the early morning (before 8am) to avoid stress-cutting. Dahlias, zinnias, sunflowers, and cosmos are all in full swing simultaneously.</p>
      <p>Succession planting matters in summer: we direct-sow zinnia and sunflower seeds every 2–3 weeks through July to keep fresh flushes coming through September.</p>

      <h2>September–October: Autumn Glory</h2>
      <p>September brings cooler nights and dahlias go absolutely wild. This is peak dahlia season — the best blooms of the year come in the last weeks before frost. October is when we cut the most and the fastest, racing the calendar.</p>
      <p>We also direct-sow: <strong>larkspur, bachelor's button, and sweet peas</strong> in October for spring blooms. These overwinter as small plants and bloom earlier than spring-sown seed.</p>

      <h2>November–December: Wind Down and Rest</h2>
      <p>First frost (typically mid-to-late November for us) kills the dahlias. We dig tubers before the ground freezes, cure them, divide, and store for next spring. The farm goes quiet. We plant cover crops (Austrian winter peas, crimson clover) in the beds to build soil over winter.</p>
      <p>December is for rest, seed orders, and planning what's going to change next year. It's the month we look at our harvest records, talk about what worked and what didn't, and start dreaming about next season.</p>

      <p>Questions about what to grow in your Georgia garden? We're happy to talk through variety selection and timing. Reach out at <a href="mailto:hello@sugaroaklane.com">hello@sugaroaklane.com</a> or visit our <a href="/shop?cat=seeds-bulbs">seeds &amp; bulbs shop</a> for varieties tested in our own fields.</p>
    `
  },
  'farm-to-vase-bouquet-tips': {
    title: 'Farm to Vase: How to Make Flowers Last Longer',
    category: 'Floral Design',
    date: 'February 10, 2026',
    excerpt: 'The tricks we use to keep farm-fresh flowers looking their best — from harvest timing to water additives and the best vase shapes for different stems.',
    gradient: '#5a4a30, #8a7a50',
    content: `
      <h2>It Starts in the Field</h2>
      <p>The vase life of a flower is largely determined before it ever reaches your kitchen table. How and when a flower is harvested matters more than any flower food packet. On our farm, we harvest at specific times and stages to maximize how long each bloom lasts.</p>

      <h2>Rule #1: Harvest at the Right Stage</h2>
      <p>Not all flowers should be cut at the same stage. Here's our cheat sheet:</p>
      <ul>
        <li><strong>Dahlias</strong> — Cut when 75% open. They won't continue opening in the vase, so don't cut too tight.</li>
        <li><strong>Zinnias</strong> — Grab the stem 8 inches below the flower and wiggle it. If the stem is firm, it's ready. If it bends, wait another day. Soft stems = short vase life.</li>
        <li><strong>Sunflowers</strong> — Cut when petals are just starting to lift away from the center. They'll continue opening in the vase.</li>
        <li><strong>Sweet peas</strong> — Cut when the bottom 2-3 flowers are open and the top buds are still closed. They'll open in sequence over 5-7 days.</li>
        <li><strong>Roses</strong> — Cut in "marshmallow stage" — when the bud feels like a soft marshmallow, not a tight marble. Tight buds won't open; open blooms won't last.</li>
        <li><strong>Cosmos</strong> — Cut when fully open. They don't open further in the vase and will actually close at night (which is charming, not a flaw).</li>
      </ul>

      <h2>Rule #2: Harvest at the Right Time</h2>
      <p>We cut flowers in the <strong>early morning (before 9am) or late evening (after 6pm)</strong>. During the heat of the day, flowers are stressed and their stems are pumping water at maximum capacity. Cutting a stressed flower shortens its vase life by 2-3 days.</p>
      <p>If morning harvest isn't possible, at minimum cut into a bucket of cool water immediately. Don't let stems sit dry for even 5 minutes — air enters the stem and creates a blockage that reduces water uptake.</p>

      <h2>Rule #3: Clean Everything</h2>
      <p>This is the single biggest factor most people overlook. Bacteria in vase water is what kills flowers. Here's our protocol:</p>
      <ul>
        <li>Wash vases with hot soapy water and a drop of bleach before each use</li>
        <li>Use clean, cool (not cold) water — about 100°F is ideal for most flowers</li>
        <li>Strip ALL leaves that would be below the waterline — no exceptions. Submerged foliage = bacterial soup</li>
        <li>Re-cut stems at an angle (45°) every 2-3 days</li>
        <li>Change the water completely every 2-3 days</li>
      </ul>

      <blockquote>The #1 killer of cut flowers isn't dehydration — it's bacteria. Clean vases, clean water, no submerged leaves.</blockquote>

      <h2>Rule #4: The Right Additives</h2>
      <p>Those little flower food packets work, but here's what we use in our studio:</p>
      <ul>
        <li><strong>Commercial flower preservative</strong> (Floralife or Chrysal) — The professional standard. Contains sugar (food), citric acid (lowers pH), and biocide (kills bacteria).</li>
        <li><strong>DIY alternative</strong>: 1 teaspoon sugar + 1 teaspoon white vinegar + ¼ teaspoon bleach per quart of water. Not as precise, but it works.</li>
        <li><strong>Vodka trick</strong>: A few drops of vodka in the water inhibits bacterial growth. We've tested this and it genuinely extends vase life by 1-2 days.</li>
      </ul>
      <p>What doesn't work: aspirin, copper pennies, or Sprite. We've tested all of these. They're garden myths.</p>

      <h2>Rule #5: Choose the Right Vase</h2>
      <p>The vase matters more than most people think:</p>
      <ul>
        <li><strong>Tight, compact bouquets</strong> (roses, dahlias) → Use a vase with a narrow neck that supports the stems</li>
        <li><strong>Loose, garden-style arrangements</strong> (cosmos, sweet peas, wildflowers) → Use a wider mouth vase that lets stems fall naturally</li>
        <li><strong>Single statement stems</strong> (sunflowers, hydrangeas) → Tall, narrow bud vases</li>
        <li><strong>Short, voluminous arrangements</strong> → Compote or low bowl with a flower frog inside</li>
      </ul>

      <h2>Rule #6: Location Matters</h2>
      <p>Keep your arrangement:</p>
      <ul>
        <li>Away from direct sunlight (heat accelerates wilting)</li>
        <li>Away from fruit bowls (ripening fruit releases ethylene gas, which kills flowers)</li>
        <li>In a cool spot — flowers last significantly longer at 65°F vs 75°F</li>
        <li>Away from heating/AC vents</li>
      </ul>

      <h2>Expected Vase Life by Flower</h2>
      <p>Here's what to expect with proper care:</p>
      <ul>
        <li><strong>Dahlias</strong>: 5-7 days</li>
        <li><strong>Zinnias</strong>: 7-10 days</li>
        <li><strong>Sunflowers</strong>: 7-12 days</li>
        <li><strong>Sweet peas</strong>: 5-7 days</li>
        <li><strong>Roses</strong>: 7-10 days</li>
        <li><strong>Cosmos</strong>: 4-6 days</li>
        <li><strong>Lisianthus</strong>: 10-14 days (the marathon runner)</li>
        <li><strong>Dried flowers</strong>: Indefinitely (cheating, but still counts)</li>
      </ul>

      <p>Want flowers that come with all this care already handled? Our <a href="/shop/flower-shop">farm bouquets</a> are harvested the morning of delivery and arranged with maximum vase life in mind.</p>
    `
  },
  'zone-7b-spring-flowers': {
    title: 'The Best Spring Flowers to Grow in Zone 7b (Plus What to Skip)',
    category: 'Growing Guide',
    date: 'January 12, 2026',
    excerpt: 'Zone 7b is a dream for spring flowers — if you grow the right ones. Here\'s what thrives, what sulks, and what we\'ve learned the hard way about spring in Georgia.',
    gradient: '#4a6070, #6a90a0',
    content: `
      <h2>What Zone 7b Actually Means for Spring Growers</h2>
      <p>Zone 7b sits in a sweet spot that most gardeners don't fully appreciate. Our winters are mild enough to overwinter hardy annuals outdoors, and our springs arrive early — often 2–3 weeks before gardeners in zones 5 or 6 can even think about outdoor planting. But we also get the occasional sucker punch: a hard freeze in mid-March right when the ranunculus are at their peak.</p>
      <p>The key is choosing varieties that can tolerate our late-frost window and thrive in our characteristic warm-up: cool nights through April, hot days arriving suddenly in May.</p>

      <h2>Spring Flowers That Excel in Zone 7b</h2>

      <h3>Sweet Peas</h3>
      <p>Our #1 spring crop, and nothing else comes close for fragrance. We direct-sow sweet peas in November (yes, November) so they can establish roots over winter and bloom their hearts out in March–April before the heat arrives. Choose heat-tolerant varieties like 'Mammoth' or 'Spencer' types — standard sweet peas will bolt the moment temps hit 75°F consistently.</p>

      <h3>Ranunculus</h3>
      <p>Ranunculus are the tulips of the south. They're not reliably hardy in the ground over our winters, but corms planted in February in the greenhouse bloom beautifully in April–May. 'Cloni' and 'Elegance' series are our workhorses. Expect 5–7 stems per corm with proper care.</p>

      <h3>Anemones</h3>
      <p>Planted alongside ranunculus corms, anemones are among the most striking spring flowers — bold single-petaled blooms with dramatic black centers. Plant pre-soaked corms in February for April blooms. 'Meron' series is our pick.</p>

      <h3>Larkspur</h3>
      <p>One of the few flowers that actually benefits from our mild winters. Direct-sow larkspur in October–November and it will overwinter as a small rosette, then bolt upward in March and bloom in April–May. Stunning vertical presence in bouquets.</p>

      <h3>Snapdragons</h3>
      <p>We start these under grow lights in January for transplant in late February or March. They're our first reliable spring cutting crop and they love the cool temperatures. Choose Rocket or Maryland series for cut flower production.</p>

      <h3>Stock (Matthiola)</h3>
      <p>Underappreciated and incredibly fragrant. Start seeds in January, transplant in late February, and you'll have heavily scented spikes by April. They are phenomenal in mixed spring bouquets. The fragrance alone sells them — customers come back just for stock.</p>

      <h2>What to Skip (Or Manage Carefully)</h2>

      <h3>Tulips</h3>
      <p>Zone 7b is challenging for tulips. Our winters don't get cold enough for reliable tulip forcing without pre-chilling bulbs in the refrigerator for 12–14 weeks before planting. It's doable, but it's work. If you want tulips, chill bulbs in paper bags in the fridge from November through January, then plant in January–February.</p>

      <h3>Peonies</h3>
      <p>Garden peonies can grow in 7b but they need full sun and excellent drainage to bloom reliably. Expect fewer blooms than northern growers get. Itoh (intersectional) peonies perform better here than standard herbaceous varieties.</p>

      <h3>Standard Delphiniums</h3>
      <p>Classic delphiniums are bred for Pacific Northwest conditions. In our heat and humidity they're typically short-lived and prone to crown rot. Grow larkspur instead — it has a similar look and actually loves our climate.</p>

      <blockquote>Our spring seasons are short and spectacular. Plant for peak impact in April, because by Memorial Day, the heat is already pushing tender crops out of production.</blockquote>

      <p>All of our spring-flowering seeds and bulbs are available in the <a href="/shop?cat=seeds-bulbs">farm shop</a>, tested and selected specifically for Zone 7b performance.</p>
    `
  },
  'dahlia-tuber-storage-winter': {
    title: 'How to Dig, Store, and Divide Dahlia Tubers for Winter',
    category: 'Growing Guide',
    date: 'November 4, 2025',
    excerpt: 'Don\'t let your dahlia investment die in the ground. Here\'s our exact farm process for digging, curing, dividing, and storing tubers through winter — the same method we use on 1,500+ plants.',
    gradient: '#6b3a2a, #9b5a40',
    content: `
      <h2>When to Dig</h2>
      <p>We dig dahlia tubers after the <strong>first killing frost</strong> blackens the foliage. In Loganville, that's typically mid-to-late November. The frost signals the plant to move energy from the foliage back into the tubers, and we want that process to complete before we dig.</p>
      <p>Don't wait too long after the blackening frost — if the ground freezes hard, you'll have a difficult time digging and risk breaking tubers. In Georgia, we usually have a 2–3 week window between first frost and true ground freeze. Use it.</p>

      <h2>The Digging Process</h2>
      <p>A week before digging, we cut the foliage down to 4–6 inches above the crown. This reduces moisture loss and makes digging easier. Then on digging day:</p>
      <ol>
        <li>Use a digging fork (not a spade) and work in a circle 12 inches away from the stem</li>
        <li>Gently lift the entire clump — don't tug on the stalks or you'll break eyes off the crown</li>
        <li>Shake off loose soil but don't wash or scrub</li>
        <li>Label immediately with the variety name — this is critical and you WILL forget if you don't label as you go</li>
        <li>Let clumps cure for 1–2 weeks in a cool, dry place (around 50°F) before storing</li>
      </ol>

      <h2>Why Curing Matters</h2>
      <p>Curing allows the skin of the tuber to harden slightly, which reduces moisture loss and rot during storage. We lay our freshly dug clumps on wire shelving in our barn for 1–2 weeks. Some growers skip curing and go straight to storage — we don't recommend it. The extra step meaningfully improves over-winter survival rates.</p>

      <h2>Dividing Dahlia Clumps</h2>
      <p>After curing, we divide the clumps before storage. This is the part that intimidates new growers but gets easier with practice. The key is understanding where the eyes are.</p>
      <p><strong>Eyes (the growing points) are always at the crown</strong> — the swollen section where the stems attached. They're often visible as small pink or purple buds, but sometimes you can only see them by looking carefully. Every viable division must include at least one eye attached to a section of crown tissue. A tuber without an eye will never sprout, no matter how healthy it looks.</p>
      <p>We use a sharp, clean knife (sterilized between cuts with rubbing alcohol) and cut downward through the crown, making sure each division has:</p>
      <ul>
        <li>At least one visible eye or crown tissue where an eye can develop</li>
        <li>A full, plump tuber with no rot, soft spots, or shriveling</li>
        <li>A clean cut (ragged cuts invite rot)</li>
      </ul>

      <h2>What to Discard</h2>
      <p>Be ruthless. Discard any tubers that are:</p>
      <ul>
        <li>Soft, mushy, or shriveled</li>
        <li>Show black rot or mold</li>
        <li>"Hollow" feeling when squeezed</li>
        <li>Very thin or pencil-thin (these rarely survive storage)</li>
        <li>Completely without any crown attachment</li>
      </ul>
      <p>On our farm, we typically discard 20–30% of the clump at division time. It's better to have fewer high-quality divisions than more low-quality ones that rot in storage.</p>

      <h2>Storage Methods That Work</h2>
      <p>We store tubers in <strong>slightly damp vermiculite or peat moss</strong> in plastic bins with the lids cracked for air circulation. The "slightly damp" part is critical — too dry and tubers desiccate; too wet and they rot. We aim for vermiculite that feels like a well-wrung-out sponge.</p>
      <p>Storage temperature: <strong>40–50°F</strong>. A basement or insulated garage typically works in Georgia. Never store where temps will drop below freezing (garage in a severe cold snap) or stay above 55°F (tubers may break dormancy too early).</p>

      <p>Check your tubers monthly during storage. Remove any that show signs of rot immediately — one bad tuber can spread to others quickly.</p>

      <blockquote>Dahlia tubers are not delicate, but they're not indestructible either. Give them proper conditions and most will reward you with beautiful plants next season.</blockquote>

      <p>We sell divided, cured dahlia tubers every spring from varieties we've grown and tested in our own fields. Check our <a href="/shop?cat=seeds-bulbs">tuber shop</a> starting in late February.</p>
    `
  },
  'sweet-pea-growing-guide': {
    title: 'How to Grow Sweet Peas in Georgia: A Zone 7b Success Guide',
    category: 'Growing Guide',
    date: 'October 15, 2025',
    excerpt: 'Sweet peas are our most requested spring flower — and one of the trickiest to time right in Georgia. Here\'s everything we\'ve learned about growing them in Zone 7b.',
    gradient: '#5a3a5a, #8a6a8a',
    content: `
      <h2>Why Sweet Peas Are Worth the Effort</h2>
      <p>Sweet peas are intoxicating. Not just the fragrance — though that alone would justify growing them — but the colors: soft lavenders, dusty mauves, peachy creams, vivid fuchsias. They look like they were painted by someone who knew exactly what romance means.</p>
      <p>They're also genuinely tricky in Georgia, which is why most local gardeners give up after one failed attempt. The secret is timing. Get the timing right and sweet peas are surprisingly easy. Get it wrong and you get nothing but leggy vines that never bloom.</p>

      <h2>The Fundamental Problem in Zone 7b</h2>
      <p>Sweet peas are a cool-season crop that needs cool roots and cool nights to set flower buds. Our challenge in Zone 7b is that our springs warm up fast — often going from pleasant to oppressively hot in the space of two weeks in May. Sweet peas that aren't already established and blooming by early May will get caught by the heat and fail to bloom at all.</p>
      <p>The solution: <strong>plant earlier than you think is possible.</strong></p>

      <h2>Our Planting Calendar</h2>
      <p>We plant sweet peas in <strong>late October through November</strong>. This gives them the entire winter to establish a strong root system while staying small and vegetative above-ground. Come February, when the days start lengthening, those well-rooted plants explode into growth. By mid-March, we're cutting armloads.</p>
      <p>This is called "fall sowing" and it's the standard practice for serious cut flower growers in zones 6b–8a. The seeds germinate in the fall, overwinter as small seedlings, and take off in spring.</p>

      <h3>Timing Alternatives</h3>
      <ul>
        <li><strong>October 15 – November 15</strong>: Ideal fall sowing window for Zone 7b</li>
        <li><strong>January–February</strong>: Direct sow in the ground during mild spells. Later start = later bloom, but still works</li>
        <li><strong>February indoor start</strong>: Start in root trainers inside, transplant in March. Works but sweet peas hate root disturbance, so use deep pots</li>
        <li><strong>March or later</strong>: Too late for Georgia. The heat arrives before the vines can mature and bloom</li>
      </ul>

      <h2>Soil Preparation</h2>
      <p>Sweet peas are hungry plants with deep roots. They reward deep soil preparation:</p>
      <ul>
        <li>Dig or till 18–24 inches deep</li>
        <li>Amend heavily with compost — 4–6 inches worked in</li>
        <li>Add lime if your soil pH is below 6.5 (sweet peas prefer 6.5–7.5)</li>
        <li>Work in a balanced granular fertilizer at planting</li>
        <li>Sweet peas fix their own nitrogen, so go lighter on nitrogen and heavier on phosphorus and potassium</li>
      </ul>

      <h2>Planting and Support</h2>
      <p>Soak seeds in water for 12–24 hours before planting. Direct sow 1 inch deep, 4–6 inches apart, in rows. They will climb — provide a trellis, netting, or twiggy brush before the vines need it (i.e., at planting time, not later). We use 6-foot bamboo poles with horizontal twine every 6 inches.</p>

      <h2>Watering and Care</h2>
      <p>Sweet peas want consistent moisture but hate waterlogged roots. Once established, we water deeply 2–3 times per week. Mulching around the base keeps roots cool and moist (remember: cool roots = flower buds).</p>
      <p>Pinch seedlings when they're 4–6 inches tall — just like dahlias, pinching causes sweet peas to branch and produce more stems. It feels counterintuitive but makes a significant difference in production.</p>

      <h2>Harvesting for Maximum Production</h2>
      <p>Pick sweet peas daily if possible. Every flower left on the vine signals the plant to set seed — and the moment a sweet pea goes to seed, it stops producing flowers. This is not a maybe. It's a biological imperative. Cut them mercilessly and they'll reward you for weeks. Leave them to set seed and production stops within days.</p>
      <p>Cut stems when the bottom 2–3 flowers are open and the top buds are still closed. They'll open in sequence over 5–7 days, giving a long vase display.</p>

      <blockquote>The two secrets to Georgia sweet peas: plant in November, and pick every single flower before it sets seed. Do these two things and you'll have armloads of blooms from March through late April.</blockquote>

      <h2>Our Favorite Varieties</h2>
      <ul>
        <li><strong>'Mammoth'</strong> series — Most heat-tolerant, longest stems, best for Zone 7b</li>
        <li><strong>'Spencer'</strong> series — Classic cut flower type, beautiful wavy petals, excellent fragrance</li>
        <li><strong>'Juliet'</strong> — Soft salmon-pink with outstanding heat tolerance</li>
        <li><strong>'Jilly'</strong> — Ivory cream with delicate lavender flush. Elegant in all-white arrangements</li>
        <li><strong>'Prince Edward of York'</strong> — Bicolor pink and white, very fragrant</li>
      </ul>
      <p>Sweet pea seeds are available in our <a href="/shop?cat=seeds-bulbs">seeds shop</a> in September and October — exactly when you need to plant them.</p>
    `
  },
  'best-sunflowers-cut-flower': {
    title: 'The Best Sunflower Varieties for Cutting (From Our Farm Trials)',
    category: 'Growing Guide',
    date: 'May 20, 2026',
    excerpt: 'Not all sunflowers are created equal. After trialing 30+ varieties, here are the ones that actually make it from field to vase — and the popular ones that disappoint.',
    gradient: '#7a6010, #b08020',
    content: `
      <h2>Why Variety Selection Matters for Cut Sunflowers</h2>
      <p>The sunflower section of any seed catalog is enormous. Beautiful photographs, exciting variety names, and very little practical guidance on what works for cutting. We've trialed over 30 varieties on our farm, and the differences are dramatic — stem length, pollen production, branching habit, vase life, and heat tolerance all vary widely. Here's what we've learned.</p>

      <h2>What Makes a Good Cut Sunflower</h2>
      <ul>
        <li><strong>Pollen-free or low-pollen</strong> — Pollen shedding stains surfaces and clothing. For bouquets and markets, pollen-free varieties are strongly preferred.</li>
        <li><strong>Strong, long stems</strong> — At least 18–24 inches for a usable cut. Dwarf varieties look cute but have limited market value.</li>
        <li><strong>Branching habit</strong> — Single-stemmed sunflowers give one big flower per plant. Branching varieties produce multiple smaller stems from one plant, which is far more economical for home gardens and market growing.</li>
        <li><strong>Good vase life</strong> — 7–12 days with proper care. Some varieties fade within 4 days regardless of what you do.</li>
        <li><strong>Heat tolerance</strong> — In Georgia summers, your sunflowers will experience 90°F+ temperatures regularly. Varieties that go limp or fade in heat aren't worth growing here.</li>
      </ul>

      <h2>Our Top-Performing Varieties</h2>

      <h3>1. 'ProCut Orange' — Our #1 Recommendation</h3>
      <p>Pollen-free, single stem, 18–24 inch stems, absolutely classic sunflower look with deep orange-gold petals and a dark center. Exceptional heat tolerance. This is the standard against which we measure all other cut sunflowers. If you grow one sunflower variety, make it ProCut Orange.</p>

      <h3>2. 'ProCut Plum' — The Showstopper</h3>
      <p>Same reliable ProCut genetics, but with dramatic burgundy-mahogany petals that fade to russet at the tips. Absolutely stunning in autumn arrangements. Customers stop at our stand and ask "what IS that?" every single time.</p>

      <h3>3. 'Joker' — Best Branching Variety</h3>
      <p>A branching type that produces 5–8 stems per plant, all with 3–4 inch golden flowers. Pollen-free. This is what we grow when we want volume over statement — excellent for mixed bouquets where you want sunflower as an accent, not the focal point.</p>

      <h3>4. 'Strawberry Blonde' — Best Multi-Color</h3>
      <p>Creamy yellow with a coral-raspberry center zone. Distinctly softer than traditional sunflowers — pairs beautifully with dusty miller, cosmos, and garden roses. Pollen-producing, but the unique color makes it worth the extra care.</p>

      <h3>5. 'Lemon Queen' — Best for Pollinators and Cutting</h3>
      <p>A branching, pollen-bearing variety with soft pale yellow petals and a dark center. Not ideal for markets (pollen stains) but gorgeous in garden bouquets and an important pollinator flower. We grow a dedicated row for bees.</p>

      <h2>Popular Varieties We've Stopped Growing</h2>

      <h3>'Mammoth Russian'</h3>
      <p>Great for seeds, terrible for cutting. Stems are enormous but vase life is poor and the seed head is the star, not the flower. Skip it for cut flower purposes.</p>

      <h3>'Autumn Beauty' Mix</h3>
      <p>Beautiful color range (orange, red, gold, bronze) but extremely variable stem length. Half your plants will produce 12-inch stems and half will be 36 inches. Inconsistency makes market production difficult.</p>

      <h2>Succession Planting for Continuous Blooms</h2>
      <p>Sunflowers bloom once per plant (branching types produce multiple stems, but there's still a peak and decline). The key to continuous harvest is succession planting every 10–14 days from April through July. We make our final sowing July 15, which gives us blooms through October before frost.</p>

      <blockquote>Succession plant your sunflowers like clockwork and you'll never have a gap in production. One 10-foot row every two weeks adds up to armloads all summer.</blockquote>

      <p>Sunflower seeds for all varieties mentioned above are available in our <a href="/shop?cat=seeds-bulbs">seeds shop</a>.</p>
    `
  },
  'diy-wedding-flowers-guide': {
    title: 'How to DIY Your Wedding Flowers: A Realistic Guide from a Flower Farmer',
    category: 'Weddings',
    date: 'April 5, 2026',
    excerpt: 'DIY wedding flowers can save thousands — or become a weekend-before nightmare. Here\'s what actually goes into it, from a farmer who\'s helped dozens of couples pull it off beautifully.',
    gradient: '#4a3050, #7a6080',
    content: `
      <h2>First, the Honest Truth</h2>
      <p>DIY wedding flowers are absolutely achievable. We've worked with dozens of couples who have done it beautifully, and the satisfaction of saying "I arranged those myself" is real. But let's be honest about what it takes, because the beautiful DIY flower photos on Pinterest don't show the 14-hour days in the week before the wedding.</p>
      <p>This guide is written from the perspective of a flower farmer who has sold flowers to DIY brides for a decade. We want you to succeed, and success requires clear eyes about the project scope.</p>

      <h2>Is DIY Right for Your Wedding?</h2>
      <p>DIY wedding flowers make sense if:</p>
      <ul>
        <li>You have 3+ people who will commit to helping for 2–3 full days before the wedding</li>
        <li>You have a dedicated work space (a garage with tables works great)</li>
        <li>Your aesthetic is garden-style, loose, and organic rather than tightly structured</li>
        <li>Your wedding is under ~150 guests</li>
        <li>You genuinely enjoy the process, not just the end result</li>
      </ul>
      <p>DIY is harder than it looks if:</p>
      <ul>
        <li>You want very structured, precise arrangements (cascading bouquets, tight pave designs)</li>
        <li>Your ceremony is multiple venues or very large scale</li>
        <li>You're already stressed and can't afford one more project</li>
        <li>Your helpers are unreliable or unbounded by your timeline</li>
      </ul>

      <h2>The Wedding Flower Formula</h2>
      <p>Here's a rough breakdown of what you'll need to order. These are estimates — your wedding style, arrangement size, and flower choices will affect actual quantities:</p>
      <ul>
        <li><strong>Bridal bouquet</strong>: 15–25 stems (large, lush) or 8–12 stems (compact)</li>
        <li><strong>Bridesmaid bouquets</strong>: 8–12 stems per bouquet</li>
        <li><strong>Boutonnieres</strong>: 3–5 stems per boutonniere (many will be single flowers)</li>
        <li><strong>Centerpieces</strong>: 25–40 stems per large arrangement, 10–15 per bud vase cluster</li>
        <li><strong>Ceremony arch or backdrop</strong>: 80–150+ stems depending on size</li>
        <li><strong>Miscellaneous</strong>: Cake flowers, place card arrangements, cocktail hour arrangements — add 15% to your total as a buffer</li>
      </ul>

      <h2>Ordering from a Farm</h2>
      <p>Ordering locally from a flower farm rather than a wholesale house has real advantages for DIY couples: the flowers are fresh (often cut the morning before pickup), you can see the actual varieties before committing, and you can ask questions from someone who grows what they sell.</p>
      <p>When you order from us, here's what we recommend:</p>
      <ul>
        <li><strong>Book 6–12 months in advance</strong> for summer weddings — our capacity fills up</li>
        <li><strong>Pick up Thursday before a Saturday wedding</strong> — flowers need 24–48 hours of cold storage before arranging</li>
        <li><strong>Order 15–20% more than you think you need</strong> — you will break stems, drop bouquets, and encounter flowers that are slightly off</li>
        <li><strong>Discuss your color palette, not specific varieties</strong> — we'll suggest what's at peak at your wedding date</li>
      </ul>

      <h2>The Day-Before Timeline That Works</h2>
      <p>Friday before a Saturday wedding:</p>
      <ul>
        <li><strong>8am</strong>: Pick up flowers, strip all foliage below waterline, re-cut stems at 45°, place in buckets of treated water in a cool room</li>
        <li><strong>10am–2pm</strong>: Arrange centerpieces and ceremony arrangements (the large pieces first)</li>
        <li><strong>2pm–5pm</strong>: Bouquets and boutonnieres</li>
        <li><strong>5pm</strong>: Everything is in buckets in the coolest room in the house (ideally 60–65°F)</li>
        <li><strong>Saturday morning</strong>: Transport carefully packed in buckets of water in boxes</li>
      </ul>

      <blockquote>The arrangements that look best are the ones made with fresh flowers and rested overnight. Arrangements made the morning of a wedding almost always look rushed.</blockquote>

      <h2>One Technique That Changes Everything</h2>
      <p>Learn the "hand-tie bouquet" method. It's the most versatile and forgiving bouquet technique: hold the stems loosely in your non-dominant hand, adding stems one at a time while rotating the bouquet slightly with each addition. Keep stems roughly parallel. When you reach the desired size, wrap with floral tape or ribbon and trim stems to even length.</p>
      <p>The beauty of hand-tie bouquets is that they look garden-gathered and natural — and they're extremely forgiving of imperfect technique. Tight, structured designs require years of training; hand-tied bouquets look beautiful even when made by someone who has never arranged before.</p>

      <p>Ready to order farm flowers for your wedding? <a href="/contact">Contact us here</a> to discuss your date, color palette, and quantity needs. We love working with DIY couples.</p>
    `
  },
  'ranunculus-zone-7b': {
    title: 'Growing Ranunculus in Zone 7b: Everything We Know After 8 Years',
    category: 'Growing Guide',
    date: 'January 28, 2026',
    excerpt: 'Ranunculus are the most elegant spring flower we grow — and one of the most misunderstood. Here\'s how we get extraordinary results in Zone 7b conditions.',
    gradient: '#5a3040, #8a6070',
    content: `
      <h2>The Zone 7b Ranunculus Problem</h2>
      <p>Ranunculus aren't listed as reliably hardy below Zone 8, which sends many Zone 7b gardeners away before they try. That's a mistake. With proper timing and technique, you can grow exceptional ranunculus in our climate — arguably better than zones that are too warm for proper vernalization.</p>
      <p>Our secret is the greenhouse. We don't leave ranunculus corms in the ground over winter (they'd likely rot in our wet winters). Instead, we plant in the greenhouse in late January/early February and transplant to the field in March, where they bloom spectacularly through May.</p>

      <h2>Understanding Ranunculus Corms</h2>
      <p>Ranunculus grow from small, dried, claw-shaped corms that look a bit like a brown, crumpled octopus. They need to be hydrated before planting — dry corms planted directly in the ground often fail to germinate, especially in cooler temperatures.</p>
      <p>Our pre-planting process:</p>
      <ol>
        <li>Place dry corms in a single layer on a tray lined with damp paper towel</li>
        <li>Mist lightly, cover with plastic wrap, and keep at 50–55°F for 3–4 hours</li>
        <li>Plant immediately after pre-soaking — don't over-soak or corms get mushy</li>
        <li>Plant with the "claws" pointing downward, about 1.5 inches deep</li>
        <li>Space 6 inches apart in rows 12 inches apart</li>
      </ol>

      <h2>Our Growing Calendar</h2>
      <ul>
        <li><strong>Late January</strong>: Pre-soak and plant in greenhouse flats or directly into greenhouse beds</li>
        <li><strong>February</strong>: Maintain temperatures between 50–60°F. Too warm = poor bloom quality. Keep moist but not waterlogged</li>
        <li><strong>Early March</strong>: Transplant to field beds (with row cover protection for late frosts)</li>
        <li><strong>Late March–May</strong>: Harvest window. Peak in April for most varieties</li>
        <li><strong>May</strong>: Plants decline as heat arrives. Foliage yellows; this is normal. Corms can be dug, dried, and stored for fall planting</li>
      </ul>

      <h2>The Cool Temperature Requirement</h2>
      <p>Ranunculus need cool growing conditions — ideally 50–65°F daytime, 40–50°F nighttime — to produce their best blooms. This is why we start them in the greenhouse where we can control temperatures, and why they naturally peak before our Georgia heat arrives.</p>
      <p>If temperatures rise above 70°F consistently during active growth, stem quality drops and bloom time is cut short. Row cover can help extend the season by a week or two in warm springs.</p>

      <h2>Our Favorite Varieties</h2>

      <h3>'Cloni' Series</h3>
      <p>The gold standard for cut flower ranunculus. Large, multi-petaled blooms with extraordinary color depth. 'Cloni Success' and 'Cloni Elegance' sub-series have the best stem length for cutting. The 'Ariadne' (peach), 'Chamomile' (blush white), and 'Barbablù' (deep plum) colorways are our best sellers.</p>

      <h3>'Elegance' Series</h3>
      <p>More widely available and slightly less expensive than Cloni. Still excellent quality with good color range. 'Elegance Champagne' (soft apricot-cream) and 'Elegance Pink' are our workhorses for weddings.</p>

      <h3>'Bloomingdale' Series</h3>
      <p>The most widely available in garden centers, sold as tubers for home garden use. Produces smaller flowers than Cloni/Elegance but is more heat-tolerant and forgiving. Good choice for first-time growers.</p>

      <h2>Troubleshooting Common Problems</h2>
      <ul>
        <li><strong>Corms rotting in the ground</strong>: Soil too wet, temperature too cold, or corms were damaged before planting. Solution: better drainage, lower planting density, greenhouse start</li>
        <li><strong>Plants come up but don't bloom</strong>: Usually means temperatures were too warm during growth period, causing the plant to rush through its cycle. Move planting earlier</li>
        <li><strong>Short, weak stems</strong>: Overcrowding, insufficient fertility, or growing in too much shade. Ranunculus need full sun for maximum stem length</li>
        <li><strong>Flowers open too fast</strong>: Harvest earlier (when bud is still mostly round, showing color but not yet fully open). Ranunculus are best harvested when 50–70% open</li>
      </ul>

      <blockquote>Ranunculus repay careful attention to temperature and timing with some of the most extraordinary flowers you'll ever grow. They're worth the extra care.</blockquote>

      <p>We sell ranunculus corms in our <a href="/shop?cat=seeds-bulbs">farm shop</a> in January and February, in a curated selection of varieties that have performed best in our Zone 7b conditions.</p>
    `
  },
  'fall-farm-update-october': {
    title: 'October Farm Update: Racing the First Frost',
    category: 'Farm Life',
    date: 'October 28, 2025',
    excerpt: 'October is the most bittersweet month on the farm. The dahlias are at their absolute peak — and the clock is ticking. Here\'s what\'s happening in the fields right now.',
    gradient: '#6a4020, #9a6030',
    content: `
      <h2>The Best Blooms of the Year</h2>
      <p>There's a phenomenon that experienced dahlia growers know but beginners are always surprised by: the best blooms of the dahlia season come right at the end. October dahlias — grown through a long season of cool nights returning after August's heat — are simply different. The stems are longer. The colors are richer. The blooms hold longer in the vase. Something about those cooling nighttime temperatures in September intensifies everything.</p>
      <p>This week, we're cutting the most beautiful flowers we've grown all year. And we're watching the ten-day forecast obsessively.</p>

      <h2>What the Farm Looks Like Right Now</h2>
      <p>The dahlia rows are at max height — some plants are over 5 feet tall now, staked and strapped and absolutely covered in blooms. The colors have shifted from summer's vivid oranges and magentas to something softer and richer: deep rusts, warm bronzes, dusty mauves, and dark plums. It's the color palette of October itself, and it's our favorite time of year to be in the fields.</p>
      <p>The zinnias are still going, though they've slowed. Our last sunflower succession was planted in mid-July and those plants are now giving us their final flush — gorgeous warm-toned blooms that look like October has decided to become a flower.</p>
      <p>We also direct-sowed larkspur, bachelor's button, and sweet peas last week in the beds that we've cleared. Those seeds will germinate in the cool weather, overwinter as small plants, and bloom for us in March and April — a quiet promise the farm is making to itself about spring.</p>

      <h2>Market Season Wind-Down</h2>
      <p>Our farmers market season officially ends after the first weekend of November. This week's markets are among our last, and we always bring our best for the finale. If you've been meaning to stop by the Loganville market, this weekend would be the time.</p>
      <p>Our farm stand remains open for online orders through the end of October. After November 1, we shift to delivery and pickup by appointment only through the holiday season.</p>

      <h2>What Happens After Frost</h2>
      <p>When the killing frost comes — probably mid-to-late November for us, though we've had it as early as the first week of November in bad years — the dahlias will blacken overnight. It's jarring the first time you see it. One day: lush, green, blooming. The next: black and limp.</p>
      <p>The week after frost, we'll cut all the foliage to 4–6 inches above the crown and let the clumps cure for a week before digging. Digging 1,500+ plants is a 3-4 day project. Then comes curing, dividing, labeling, and storage in our temperature-controlled barn. It's satisfying, messy work that always goes faster than expected because of the hope built into it — every tuber we store carefully is a promise of next year's blooms.</p>

      <h2>What We're Grateful for This Season</h2>
      <p>It was a good year. We had one hailstorm in June that damaged about 20% of our zinnia crop (painful but recoverable). Otherwise, the growing season cooperated. The new 'Café au Lait Rose' dahlia we trialed was everything we hoped for. Our sweet peas in April were exceptional — the best crop we've ever grown.</p>
      <p>Most importantly: the farm community that's been growing around us. The customers who drive 45 minutes because they heard about our dahlias from a friend. The brides who trust us with their wedding flowers. The home gardeners who come for seeds and end up staying for a farm tour. This is why we do what we do.</p>

      <blockquote>Every fall we close a chapter and plant the seeds of the next one. That rhythm — the ending that's also a beginning — is one of the best things about farming.</blockquote>

      <p>Thank you for a beautiful season. See you at the market one last time, and check back in February when the seed shop reopens for spring.</p>
    `
  },
  'spring-dahlia-preview-2026': {
    title: 'A First Look at Our 2026 Spring Dahlia Collection',
    category: 'Farm Life',
    date: 'February 5, 2026',
    excerpt: "What we're planting, what's new, and the varieties we're most excited about for 2026. Plus: how to pre-order tubers before they sell out.",
    gradient: '#3a4060, #6a7090',
    content: `
      <h2>Planning Season is Here</h2>
      <p>February in the farmhouse means one thing: dahlia catalogs spread across the kitchen table, seed inventory spreadsheets, and a lot of very serious conversations about whether we really need three different blush-pink varieties (answer: yes, clearly, they are all different).</p>
      <p>We finalized our 2026 dahlia collection last week. Here's a preview of what we're growing — and what we're offering for home gardeners who want to grow alongside us.</p>

      <h2>Returning Favorites</h2>
      <p>These varieties have earned permanent spots in our rotation through years of exceptional performance in our Zone 7b fields:</p>

      <h3>Café au Lait</h3>
      <p>The queen of the cutting garden. Creamy peachy-blush with pink undertones that shift subtly depending on light and temperature. Dinnerplate-sized. We grow more of this than any other single variety. Our customers are obsessed, and we don't blame them.</p>

      <h3>Cornel Bronze</h3>
      <p>Small-medium cactus dahlia in warm bronze-copper tones. Prolific, long-stemmed, and absolutely spectacular in fall arrangements when paired with marigolds and zinnias. This is the variety that makes non-dahlia people become dahlia people.</p>

      <h3>Labyrinth</h3>
      <p>Deep warm gold with a touch of amber. Formal decorative type with remarkable petal structure. One of the most photographed flowers in our booth at every market we've done.</p>

      <h3>Thomas Edison</h3>
      <p>Deep purple dinnerplate. Reliable, dramatic, and one of the few purple dahlias that holds its color rather than fading to lavender. Makes an extraordinary focal flower in any arrangement.</p>

      <h3>Jowey Winnie</h3>
      <p>Ball dahlia in warm amber-orange tones. Compact, prolific, and one of our best producers per plant. Perfect for mixed bouquets where you want warmth and texture without a dominant bloom.</p>

      <h2>New for 2026</h2>

      <h3>Café au Lait Rose</h3>
      <p>We trialed this in 2025 and it exceeded every expectation. A sport of the original Café au Lait with deeper pink tones — almost a warm rose rather than a blush. It pairs with the original beautifully for a monochromatic arrangement. Offering tubers for the first time this spring.</p>

      <h3>Ivanetti</h3>
      <p>Deep burgundy ball dahlia with an almost blackcurrant depth of color. We saw this in a colleague's field in 2024 and tracked down tubers. Dark-toned dahlias are having a moment, and this one is exceptional.</p>

      <h3>Hamari Gold</h3>
      <p>Formal decorative in rich golden-orange with outstanding stem length — we're regularly cutting 28-inch stems. One of the best large-flowered varieties for market growers who need long vase-quality stems.</p>

      <h3>Wizard of Oz</h3>
      <p>Lavender-pink pompom dahlia. One of the few truly lavender dahlias with reliable color that doesn't go muddy. Pairs beautifully with white and blush varieties. Very prolific.</p>

      <h2>Pre-Order Now</h2>
      <p>Our dahlia tubers are available for pre-order starting February 15. We offer pre-season pricing (10% off) through March 1, and most popular varieties sell out before spring. Last year we were sold out of Café au Lait by the second week of March.</p>
      <p>Each tuber we sell is grown in our own fields and hand-divided — we don't source from wholesale distributors. You're getting tubers that have been proven in Zone 7b conditions, divided by people who know exactly what they're looking at.</p>

      <blockquote>Growing dahlias connects you to the rhythm of the season in a way few things do. You plant a wrinkled brown tuber in April and three months later you're cutting flowers that people stop and stare at. That never gets old.</blockquote>

      <p>Visit our <a href="/shop?cat=seeds-bulbs">dahlia tuber shop</a> starting February 15 to place your pre-order. Have questions about which varieties will work best for your space or style? Email us at <a href="mailto:hello@sugaroaklane.com">hello@sugaroaklane.com</a> — we love talking dahlias.</p>
    `
  }
};

app.get('/blog/:slug', async (req, res) => {
  const templatePath = path.join(__dirname, 'public', 'sol-blog-post.html');
  if (!fs.existsSync(templatePath)) {
    return serveStaticPage('sol-coming-soon')(req, res);
  }
  let post = null;
  // First check database
  try {
    const dbR = await pool.query(
      `SELECT * FROM blog_posts WHERE slug = $1 AND is_published = true LIMIT 1`,
      [req.params.slug]
    );
    if (dbR.rows.length) {
      const dbPost = dbR.rows[0];
      post = {
        title: dbPost.title,
        category: dbPost.category || (dbPost.tags && dbPost.tags[0]) || 'Blog',
        date: dbPost.published_at ? new Date(dbPost.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
        excerpt: dbPost.excerpt || '',
        meta_description: dbPost.meta_description || dbPost.excerpt || '',
        gradient: '#3A5A40 0%, #4D7A55 100%',
        content: dbPost.content || '',
        image_url: dbPost.image_url
      };
    }
  } catch (e) { /* table may not exist, fall through to hardcoded */ }
  // Fall back to hardcoded posts
  if (!post) {
    const hc = BLOG_POSTS[req.params.slug];
    if (hc) post = hc;
  }
  if (!post) {
    return serveStaticPage('sol-coming-soon')(req, res);
  }
  const slug = req.params.slug;
  const ogImage = post.image_url || `${APP_URL}/logos/sugar-oak-lane-og.jpg`;
  // Build ISO date for article:published_time (parse human date or use now)
  let isoDate = new Date().toISOString();
  if (post.date) {
    const parsed = new Date(post.date);
    if (!isNaN(parsed)) isoDate = parsed.toISOString();
  }
  // JSON-LD Article schema
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: ogImage,
    datePublished: isoDate,
    dateModified: isoDate,
    author: { '@type': 'Organization', name: 'Sugar Oak Lane' },
    publisher: {
      '@type': 'Organization',
      name: 'Sugar Oak Lane',
      logo: { '@type': 'ImageObject', url: `${APP_URL}/logos/sugar-oak-lane-og.jpg` }
    },
    url: `${APP_URL}/blog/${slug}`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${APP_URL}/blog/${slug}` }
  });

  let html = fs.readFileSync(templatePath, 'utf8');
  html = html.replace(/__BLOG_TITLE__/g, post.title);
  html = html.replace(/__BLOG_CATEGORY__/g, post.category);
  html = html.replace(/__BLOG_DATE__/g, post.date);
  html = html.replace(/__BLOG_META_DESC__/g, post.meta_description || post.excerpt || '');
  html = html.replace(/__BLOG_EXCERPT__/g, post.excerpt);
  html = html.replace(/__BLOG_IMG_GRADIENT__/g, post.gradient);
  html = html.replace(/__BLOG_SLUG__/g, slug);
  html = html.replace(/__BLOG_OG_IMAGE__/g, ogImage);
  html = html.replace(/__BLOG_ISO_DATE__/g, isoDate);
  html = html.replace('__BLOG_JSON_LD__', jsonLd);
  // If post has a cover image, inject it
  if (post.image_url) {
    html = html.replace(
      '<section class="article-hero">',
      `<section class="article-hero" style="background-image:url('${post.image_url}');background-size:cover;background-position:center;">`
    );
  }
  html = html.replace('__BLOG_CONTENT__', post.content);
  res.set('Cache-Control', 'no-cache').type('html').send(html);
});

// ─────────────────────────────────────────────────────────────────────────────
// Site Settings — message bar (public read, admin write)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/site-settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT key, value FROM site_settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, settings });
  } catch (err) {
    // Table may not exist yet on first deploy before migration runs
    res.json({ success: true, settings: {} });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic theme CSS — GET /api/theme.css
// Reads active_theme + theme_colors from site_settings and returns CSS vars.
// active_theme = 'default' (green/white/pink) | 'alternate' (warm taupe/linen)
// Falls back to design token defaults so pages degrade gracefully.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/theme.css', async (req, res) => {
  // Default palette — green, white, and soft pastel pink
  const DEFAULT_PALETTE = {
    '--white':       '#FFFFFF',
    '--linen':       '#FEFDF8',
    '--linen-dk':    '#F5F0E8',
    '--linen-md':    '#EDE7DC',
    '--green':       '#3A5A40',
    '--green-dk':    '#2C4730',
    '--green-lt':    '#4D7A55',
    '--green-bg':    '#EDF3EE',
    '--accent-pink': '#D4748A',
    '--warm-beige':  '#F5EFE6',
    '--border':      '#DDD8CC',
    '--border-lt':   '#EEEBE3',
  };
  // Alternate palette — warm taupe/linen
  const ALTERNATE_PALETTE = {
    '--white':       '#FFFDF9',
    '--linen':       '#FFFDF9',
    '--linen-dk':    '#EBE8E5',
    '--linen-md':    '#E8E9EB',
    '--green':       '#C7B8A9',
    '--green-dk':    '#B0A293',
    '--green-lt':    '#D4C8BC',
    '--green-bg':    '#EBE8E5',
    '--accent-pink': '#C7B8A9',
    '--warm-beige':  '#EBE8E5',
    '--border':      '#C7B8A9',
    '--border-lt':   '#D8D2CB',
  };
  try {
    const result = await pool.query(
      `SELECT key, value FROM site_settings WHERE key IN ('active_theme', 'theme_colors')`
    );
    const settingsMap = {};
    result.rows.forEach(r => { settingsMap[r.key] = r.value; });

    const activeTheme = settingsMap['active_theme'] || 'default';
    let colors = activeTheme === 'alternate' ? { ...ALTERNATE_PALETTE } : { ...DEFAULT_PALETTE };

    // If on default theme, also apply any custom theme_colors overrides
    if (activeTheme !== 'alternate' && settingsMap['theme_colors']) {
      try {
        const stored = JSON.parse(settingsMap['theme_colors']);
        if (stored && typeof stored === 'object') {
          // Map legacy primary/secondary/accent keys to CSS vars
          if (stored.primary)   colors['--green']       = stored.primary;
          if (stored['--green']) colors['--green']       = stored['--green'];
          if (stored['--green-dk']) colors['--green-dk'] = stored['--green-dk'];
        }
      } catch(e) { /* use palette defaults */ }
    }

    const vars = Object.entries(colors)
      .map(([k, v]) => `  ${k}: ${v};`)
      .join('\n');
    const css = `:root {\n${vars}\n}\n`;
    res
      .set('Content-Type', 'text/css')
      .set('Cache-Control', 'public, max-age=30')
      .send(css);
  } catch(err) {
    // Fallback to hardcoded defaults if DB unavailable
    const css = `:root {\n${Object.entries(DEFAULT_PALETTE).map(([k,v]) => `  ${k}: ${v};`).join('\n')}\n}\n`;
    res.set('Content-Type', 'text/css').set('Cache-Control', 'no-cache').send(css);
  }
});

// GET /api/sol/settings/theme — returns current active theme (public endpoint)
app.get('/api/sol/settings/theme', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT value FROM site_settings WHERE key = 'active_theme'`
    );
    const activeTheme = result.rows.length ? result.rows[0].value : 'default';
    res.json({ success: true, active_theme: activeTheme });
  } catch(err) {
    res.json({ success: true, active_theme: 'default' });
  }
});

// PUT /api/admin/settings/theme — toggle active theme (admin only)
app.put('/api/admin/settings/theme', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { active_theme } = req.body;
  if (!active_theme || !['default', 'alternate'].includes(active_theme)) {
    return res.status(400).json({ success: false, error: 'active_theme must be "default" or "alternate"' });
  }
  try {
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ('active_theme', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [active_theme]
    );
    res.json({ success: true, active_theme });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/site-settings', async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized. Please log in at /admin/login' });
  }
  const { settings } = req.body;
  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ success: false, error: 'Invalid settings object' });
  }
  try {
    for (const [key, value] of Object.entries(settings)) {
      await pool.query(
        `INSERT INTO site_settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [key, String(value)]
      );
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin Settings API — delivery zones, staff, hours, order settings
// Uses site_settings table (key-value store) with JSON values
// ─────────────────────────────────────────────────────────────────────────────

// Generic settings getter for admin
app.get('/api/admin/settings/:category', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT value FROM site_settings WHERE key = $1`,
      [req.params.category]
    );
    const data = result.rows.length ? JSON.parse(result.rows[0].value) : null;
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: null });
  }
});

// Generic settings saver for admin
app.post('/api/admin/settings/:category', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { data } = req.body;
    if (data === undefined) return res.status(400).json({ success: false, error: 'data field required' });
    await pool.query(
      `INSERT INTO site_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [req.params.category, JSON.stringify(data)]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Page Block System — Admin API + Public Renderer
// ─────────────────────────────────────────────────────────────────────────────

function checkAdminKey(req, res) {
  if (isAdminRequest(req)) return true;
  res.status(401).json({ success: false, error: 'Unauthorized. Please log in at /admin/login' });
  return false;
}

// GET /api/admin/pages — list all pages (static site pages + CMS pages)
app.get('/api/admin/pages', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    // Static site pages (built-in routes)
    const staticPages = [
      { id: 'static-home',       slug: '',               title: 'Homepage',            type: 'static', is_published: true, is_live: true, route: '/' },
      { id: 'static-shop',       slug: 'shop',           title: 'Shop',                type: 'static', is_published: true, is_live: true, route: '/shop' },
      { id: 'static-flowers',    slug: 'shop/flower-shop', title: 'Flower Shop',       type: 'static', is_published: true, is_live: true, route: '/shop/flower-shop' },
      { id: 'static-blog',       slug: 'blog',           title: 'Blog',                type: 'static', is_published: true, is_live: true, route: '/blog' },
      { id: 'static-about',      slug: 'about',          title: 'About',               type: 'static', is_published: true, is_live: true, route: '/about' },
      { id: 'static-contact',    slug: 'contact',        title: 'Contact',             type: 'static', is_published: true, is_live: true, route: '/contact' },
      { id: 'static-weddings',   slug: 'weddings',       title: 'Weddings',            type: 'static', is_published: true, is_live: true, route: '/weddings' },
      { id: 'static-diy',        slug: 'weddings/diy',   title: 'DIY Wedding Flowers', type: 'static', is_published: true, is_live: true, route: '/weddings/diy' },
      { id: 'static-events',     slug: 'weddings/events', title: 'Events',             type: 'static', is_published: true, is_live: true, route: '/weddings/events' },
      { id: 'static-workshops',  slug: 'workshops',      title: 'Workshops',           type: 'static', is_published: true, is_live: true, route: '/workshops' },
      { id: 'static-wholesale',  slug: 'wholesale',      title: 'Wholesale',           type: 'static', is_published: true, is_live: true, route: '/wholesale' },
      { id: 'static-faq',        slug: 'faq',            title: 'FAQ',                 type: 'static', is_published: true, is_live: true, route: '/faq' },
      { id: 'static-delivery',   slug: 'delivery-info',  title: 'Delivery Info',       type: 'static', is_published: true, is_live: true, route: '/delivery-info' },
      { id: 'static-cart',       slug: 'shop/cart',      title: 'Cart',                type: 'static', is_published: true, is_live: true, route: '/shop/cart' },
      { id: 'static-checkout',   slug: 'shop/checkout',  title: 'Checkout',            type: 'static', is_published: true, is_live: true, route: '/shop/checkout' },
    ];

    // CMS pages from database
    const r = await pool.query(
      `SELECT id, slug, title, description, is_published, created_at, updated_at
       FROM pages ORDER BY created_at DESC`
    );
    const cmsPages = r.rows.map(p => ({ ...p, type: 'cms', is_live: !!p.is_published }));

    // Merge: static pages first, then CMS pages
    res.json({ success: true, pages: [...staticPages, ...cmsPages] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/pages — create a page
app.post('/api/admin/pages', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { title, slug, description, seo_title, seo_desc } = req.body;
  if (!title || !slug) return res.status(400).json({ success: false, error: 'title and slug are required' });
  const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  try {
    const r = await pool.query(
      `INSERT INTO pages (title, slug, description, seo_title, seo_desc)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, cleanSlug, description || '', seo_title || '', seo_desc || '']
    );
    res.json({ success: true, page: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'Slug already in use' });
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/pages/:slug — get page + blocks
app.get('/api/admin/pages/:slug', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const pr = await pool.query(`SELECT * FROM pages WHERE slug = $1`, [req.params.slug]);
    if (!pr.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    const page = pr.rows[0];
    const br = await pool.query(
      `SELECT * FROM page_blocks WHERE page_id = $1 ORDER BY display_order ASC`,
      [page.id]
    );
    res.json({ success: true, page, blocks: br.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/pages/:slug — update page metadata
app.put('/api/admin/pages/:slug', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { title, description, is_published, seo_title, seo_desc } = req.body;
  try {
    const r = await pool.query(
      `UPDATE pages SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         is_published = COALESCE($3, is_published),
         seo_title = COALESCE($4, seo_title),
         seo_desc = COALESCE($5, seo_desc),
         updated_at = NOW()
       WHERE slug = $6 RETURNING *`,
      [title ?? null, description ?? null, is_published ?? null, seo_title ?? null, seo_desc ?? null, req.params.slug]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    res.json({ success: true, page: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/pages/:slug — delete page + all blocks
app.delete('/api/admin/pages/:slug', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    await pool.query(`DELETE FROM pages WHERE slug = $1`, [req.params.slug]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/pages/:slug/blocks — add a block
app.post('/api/admin/pages/:slug/blocks', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { block_type, config } = req.body;
  if (!block_type) return res.status(400).json({ success: false, error: 'block_type required' });
  try {
    const pr = await pool.query(`SELECT id FROM pages WHERE slug = $1`, [req.params.slug]);
    if (!pr.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    const pageId = pr.rows[0].id;
    const oR = await pool.query(
      `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM page_blocks WHERE page_id = $1`,
      [pageId]
    );
    const nextOrder = parseInt(oR.rows[0].next_order, 10);
    const r = await pool.query(
      `INSERT INTO page_blocks (page_id, block_type, config, display_order) VALUES ($1, $2, $3, $4) RETURNING *`,
      [pageId, block_type, JSON.stringify(config || {}), nextOrder]
    );
    res.json({ success: true, block: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/blocks/:id — update block config / visibility / order
app.put('/api/admin/blocks/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { config, is_visible, display_order } = req.body;
  try {
    const r = await pool.query(
      `UPDATE page_blocks SET
         config        = CASE WHEN $1::text IS NOT NULL THEN $1::jsonb ELSE config END,
         is_visible    = COALESCE($2, is_visible),
         display_order = COALESCE($3, display_order),
         updated_at    = NOW()
       WHERE id = $4 RETURNING *`,
      [config ? JSON.stringify(config) : null, is_visible ?? null, display_order ?? null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Block not found' });
    res.json({ success: true, block: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/admin/blocks/:id — delete a block
app.delete('/api/admin/blocks/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    await pool.query(`DELETE FROM page_blocks WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/admin/page-routes — list all unique routes with their page versions
app.get('/api/admin/page-routes', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const r = await pool.query(`
      SELECT
        COALESCE(route_slug, slug) AS route,
        json_agg(
          json_build_object(
            'id', id, 'slug', slug, 'title', title,
            'version_label', COALESCE(version_label, 'Version 1'),
            'is_live', COALESCE(is_live, is_published),
            'is_published', is_published,
            'updated_at', updated_at
          ) ORDER BY id ASC
        ) AS versions
      FROM pages
      GROUP BY COALESCE(route_slug, slug)
      ORDER BY MIN(created_at) DESC
    `);
    res.json({ success: true, routes: r.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/pages/:id/set-live — make this page version live for its route
app.put('/api/admin/pages/:id/set-live', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    // Get the page to find its route_slug
    const pr = await pool.query(`SELECT * FROM pages WHERE id = $1`, [id]);
    if (!pr.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    const page = pr.rows[0];
    const routeSlug = page.route_slug || page.slug;
    // Unset is_live on all versions of this route
    await pool.query(`
      UPDATE pages SET is_live = false WHERE COALESCE(route_slug, slug) = $1
    `, [routeSlug]);
    // Set is_live on this version + publish it
    const updated = await pool.query(`
      UPDATE pages SET is_live = true, is_published = true, updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, [id]);
    res.json({ success: true, page: updated.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/pages/:id/clone-version — fork a page into a new draft version
app.post('/api/admin/pages/:id/clone-version', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    const { version_label } = req.body;
    // Get source page
    const pr = await pool.query(`SELECT * FROM pages WHERE id = $1`, [id]);
    if (!pr.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    const src = pr.rows[0];
    const routeSlug = src.route_slug || src.slug;
    // Generate unique slug for the clone
    const newSlug = `${src.slug}-v${Date.now()}`;
    // Create cloned page (draft, not live)
    const newPage = await pool.query(`
      INSERT INTO pages (slug, title, description, seo_title, seo_desc, is_published, route_slug, version_label, is_live)
      VALUES ($1, $2, $3, $4, $5, false, $6, $7, false) RETURNING *
    `, [newSlug, src.title, src.description || '', src.seo_title || '', src.seo_desc || '',
        routeSlug, version_label || `Version (copy)`]);
    // Clone all blocks
    const blocks = await pool.query(`SELECT * FROM page_blocks WHERE page_id = $1 ORDER BY display_order ASC`, [id]);
    for (const blk of blocks.rows) {
      await pool.query(`
        INSERT INTO page_blocks (page_id, block_type, config, display_order, is_visible)
        VALUES ($1, $2, $3, $4, $5)
      `, [newPage.rows[0].id, blk.block_type, JSON.stringify(blk.config), blk.display_order, blk.is_visible]);
    }
    res.json({ success: true, page: newPage.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/pages/:id/meta — update version_label and route_slug
app.put('/api/admin/pages/:id/meta', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { version_label, route_slug } = req.body;
    const r = await pool.query(`
      UPDATE pages SET
        version_label = COALESCE($1, version_label),
        route_slug    = COALESCE($2, route_slug),
        updated_at    = NOW()
      WHERE id = $3 RETURNING *
    `, [version_label || null, route_slug || null, req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Page not found' });
    res.json({ success: true, page: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/admin/pages/:slug/blocks/reorder — reorder blocks
app.put('/api/admin/pages/:slug/blocks/reorder', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { order } = req.body; // array of block IDs in desired order
  if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order must be an array of IDs' });
  try {
    for (let i = 0; i < order.length; i++) {
      await pool.query(`UPDATE page_blocks SET display_order = $1, updated_at = NOW() WHERE id = $2`, [i, order[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/admin/pages/publish-all — publish all draft pages
app.post('/api/admin/pages/publish-all', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(`
      UPDATE pages SET is_published = true, updated_at = NOW()
      WHERE is_published = false
      RETURNING id, title, slug
    `);
    res.json({ success: true, published: result.rows, count: result.rowCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Analytics Dashboard Metrics
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/analytics', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const [
      ordersToday,
      ordersWeek,
      ordersMonth,
      revenueWeek,
      revenueMonth,
      subscriberCount,
      recentOrders,
      topProducts,
    ] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM sol_orders WHERE created_at >= NOW() - INTERVAL '1 day'`),
      pool.query(`SELECT COUNT(*) FROM sol_orders WHERE created_at >= NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT COUNT(*) FROM sol_orders WHERE created_at >= NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COALESCE(SUM(total_price),0) AS rev FROM sol_orders WHERE created_at >= NOW() - INTERVAL '7 days'`),
      pool.query(`SELECT COALESCE(SUM(total_price),0) AS rev FROM sol_orders WHERE created_at >= NOW() - INTERVAL '30 days'`),
      pool.query(`SELECT COUNT(*) FROM sol_subscribers`).catch(() => pool.query(`SELECT COUNT(*) FROM waitlist`)),
      pool.query(`SELECT o.order_number, o.customer_name, o.total_price, o.status, o.tracker_stage, o.created_at, o.product_name FROM sol_orders o ORDER BY o.created_at DESC LIMIT 10`),
      pool.query(`SELECT product_name, COUNT(*) AS cnt FROM sol_orders WHERE product_name IS NOT NULL GROUP BY product_name ORDER BY cnt DESC LIMIT 5`),
    ]);

    res.json({
      success: true,
      stats: {
        orders_today: parseInt(ordersToday.rows[0].count),
        orders_week: parseInt(ordersWeek.rows[0].count),
        orders_month: parseInt(ordersMonth.rows[0].count),
        revenue_week: parseFloat(revenueWeek.rows[0].rev).toFixed(2),
        revenue_month: parseFloat(revenueMonth.rows[0].rev).toFixed(2),
        subscriber_count: parseInt(subscriberCount.rows[0].count)
      },
      recent_orders: recentOrders.rows,
      top_products: topProducts.rows
    });
  } catch (err) {
    console.error('[api/admin/analytics]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Newsletter Subscribers (sol_subscribers + waitlist combined)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/subscribers', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { limit = 500, offset = 0, search } = req.query;
    const searchFilter = search ? `%${search}%` : null;

    // Try sol_subscribers first (preferred), fall back to waitlist
    try {
      const [rows, countRes] = await Promise.all([
        pool.query(
          `SELECT id, email, source, subscribed_at AS created_at, discount_code_used
           FROM sol_subscribers
           ${searchFilter ? 'WHERE email ILIKE $1' : ''}
           ORDER BY subscribed_at DESC
           LIMIT $${searchFilter ? 2 : 1} OFFSET $${searchFilter ? 3 : 2}`,
          searchFilter
            ? [searchFilter, parseInt(limit) || 500, parseInt(offset) || 0]
            : [parseInt(limit) || 500, parseInt(offset) || 0]
        ),
        pool.query(
          `SELECT COUNT(*) FROM sol_subscribers ${searchFilter ? 'WHERE email ILIKE $1' : ''}`,
          searchFilter ? [searchFilter] : []
        ),
      ]);
      return res.json({ success: true, subscribers: rows.rows, total: parseInt(countRes.rows[0].count), source: 'sol_subscribers' });
    } catch (e) {
      // Fallback to waitlist if sol_subscribers doesn't exist yet
      const params = [];
      let where = 'WHERE 1=1';
      if (searchFilter) { params.push(searchFilter); where += ` AND email ILIKE $${params.length}`; }
      params.push(parseInt(limit) || 500);
      params.push(parseInt(offset) || 0);
      const [rows, countRes] = await Promise.all([
        pool.query(`SELECT id, email, source, created_at FROM waitlist ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params),
        pool.query(`SELECT COUNT(*) FROM waitlist ${where}`, params.slice(0, -2)),
      ]);
      return res.json({ success: true, subscribers: rows.rows, total: parseInt(countRes.rows[0].count), source: 'waitlist' });
    }
  } catch (err) {
    console.error('[api/admin/subscribers]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Email Sequence Stats + Recent Queue
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/email-sequences', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const [statsRes, nextBatchRes, recentRes] = await Promise.all([
      // Step completion rates
      pool.query(`
        SELECT
          sequence_step,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'sent') AS sent,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed,
          COUNT(*) AS total
        FROM sol_email_sequence
        GROUP BY sequence_step
        ORDER BY sequence_step
      `).catch(() => ({ rows: [] })),
      // Next emails due
      pool.query(`
        SELECT scheduled_for
        FROM sol_email_sequence
        WHERE status = 'pending'
        ORDER BY scheduled_for ASC
        LIMIT 1
      `).catch(() => ({ rows: [] })),
      // Recent sends (last 20)
      pool.query(`
        SELECT subscriber_email, sequence_step, status, sent_at, scheduled_for, created_at
        FROM sol_email_sequence
        ORDER BY created_at DESC
        LIMIT 20
      `).catch(() => ({ rows: [] })),
    ]);

    const totalInSequence = statsRes.rows.reduce((sum, r) => sum + parseInt(r.total), 0);
    const totalSent = statsRes.rows.reduce((sum, r) => sum + parseInt(r.sent), 0);
    const nextScheduled = nextBatchRes.rows[0] ? nextBatchRes.rows[0].scheduled_for : null;

    res.json({
      success: true,
      stats: {
        total_in_sequence: totalInSequence,
        total_sent: totalSent,
        next_scheduled: nextScheduled,
        by_step: statsRes.rows,
      },
      recent: recentRes.rows,
    });
  } catch (err) {
    console.error('[api/admin/email-sequences]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Workshop Inquiries
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/workshop-inquiries', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { limit = 200, offset = 0, status, search } = req.query;
    const VALID_STATUSES = ['new', 'contacted', 'confirmed', 'cancelled'];
    let where = '';
    const params = [];
    if (status && VALID_STATUSES.includes(status)) {
      where += ` WHERE status = $${params.length + 1}`;
      params.push(status);
    }
    if (search) {
      params.push(`%${search}%`);
      where += where ? ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})` : ` WHERE (name ILIKE $${params.length} OR email ILIKE $${params.length})`;
    }
    params.push(parseInt(limit) || 200);
    params.push(parseInt(offset) || 0);
    const [rows, countRes] = await Promise.all([
      pool.query(`SELECT * FROM sol_workshop_inquiries ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params),
      pool.query(`SELECT COUNT(*) FROM sol_workshop_inquiries ${where}`, params.slice(0, -2)),
    ]);

    // Count by status for sidebar badge
    const newCountRes = await pool.query(`SELECT COUNT(*) FROM sol_workshop_inquiries WHERE status = 'new'`);

    res.json({
      success: true,
      inquiries: rows.rows,
      total: parseInt(countRes.rows[0].count),
      newCount: parseInt(newCountRes.rows[0].count),
    });
  } catch (err) {
    console.error('[api/admin/workshop-inquiries GET]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/workshop-inquiries/:id/status', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    const { status } = req.body;
    const VALID_STATUSES = ['new', 'contacted', 'confirmed', 'cancelled'];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Must be one of: new, contacted, confirmed, cancelled.' });
    }
    const result = await pool.query(
      `UPDATE sol_workshop_inquiries SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: 'Inquiry not found.' });
    }
    console.log(`[workshop-inquiry] #${id} status updated to ${status}`);
    res.json({ success: true, inquiry: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/workshop-inquiries PUT]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Customers (from sol_orders)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/customers', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { limit = 200, offset = 0, search } = req.query;
    let where = `WHERE customer_email IS NOT NULL`;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (customer_name ILIKE $${params.length} OR customer_email ILIKE $${params.length})`;
    }
    params.push(parseInt(limit) || 200);
    params.push(parseInt(offset) || 0);

    const [customers, countRes] = await Promise.all([
      pool.query(`
        SELECT customer_email, customer_name, customer_phone,
               COUNT(*) AS order_count,
               SUM(total_price) AS total_spent,
               MAX(created_at) AS last_order_at,
               MIN(created_at) AS first_order_at
        FROM sol_orders
        ${where}
        GROUP BY customer_email, customer_name, customer_phone
        ORDER BY last_order_at DESC
        LIMIT $${params.length-1} OFFSET $${params.length}
      `, params),
      pool.query(`SELECT COUNT(DISTINCT customer_email) FROM sol_orders ${where}`, params.slice(0, -2))
    ]);

    res.json({ success: true, customers: customers.rows, total: parseInt(countRes.rows[0].count) });
  } catch (err) {
    console.error('[api/admin/customers]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Customer order history
app.get('/api/admin/customers/:email/orders', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT * FROM sol_orders WHERE customer_email = $1 ORDER BY created_at DESC`,
      [req.params.email]
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: SOL Products CRUD
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/sol-products', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { category, search } = req.query;
    let where = `WHERE 1=1`;
    const params = [];
    if (category && category !== 'all') {
      params.push(category);
      where += ` AND sol_category = $${params.length}`;
    }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (name ILIKE $${params.length} OR description ILIKE $${params.length})`;
    }
    const result = await pool.query(
      `SELECT * FROM sol_products ${where} ORDER BY sort_order ASC, name ASC`,
      params
    );
    res.json({ success: true, products: result.rows });
  } catch (err) {
    console.error('[api/admin/sol-products GET]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/sol-products', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { name, slug, sol_category, subcategory, description, short_description, price, price_label, images, availability, stock_status, inventory_count, season_tags, type_tags, is_featured, is_active, sort_order, categories } = req.body;
    if (!name || !slug) return res.status(400).json({ success: false, message: 'name and slug required' });
    const resolvedCategories = Array.isArray(categories) && categories.length > 0
      ? categories : (sol_category ? [sol_category] : ['flower-shop']);
    const primaryCategory = resolvedCategories[0] || 'flower-shop';
    const result = await pool.query(
      `INSERT INTO sol_products (name, slug, sol_category, subcategory, description, short_description, price, price_label, images, availability, stock_status, inventory_count, season_tags, type_tags, is_featured, is_active, sort_order, categories)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [name, slug, primaryCategory, subcategory || null, description || null, short_description || null,
       price || null, price_label || null, JSON.stringify(images || []), availability || 'in_stock',
       stock_status || 'in_stock', inventory_count || null, season_tags || [], type_tags || [],
       is_featured || false, is_active !== false, sort_order || 0, JSON.stringify(resolvedCategories)]
    );
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/sol-products POST]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/sol-products/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    const fields = ['name', 'slug', 'sol_category', 'subcategory', 'description', 'short_description', 'price', 'price_label', 'images', 'availability', 'stock_status', 'inventory_count', 'season_tags', 'type_tags', 'is_featured', 'is_active', 'sort_order', 'categories', 'requires_floral_checkout'];
    const sets = [];
    const params = [];
    for (const f of fields) {
      if (req.body[f] !== undefined) {
        const needsJson = f === 'images' || f === 'categories';
        params.push(needsJson ? JSON.stringify(req.body[f]) : req.body[f]);
        sets.push(`${f} = $${params.length}`);
      }
    }
    // Auto-sync sol_category from categories array if categories were updated
    if (req.body.categories && Array.isArray(req.body.categories) && req.body.categories.length > 0 && req.body.sol_category === undefined) {
      params.push(req.body.categories[0]);
      sets.push(`sol_category = $${params.length}`);
    }
    if (!sets.length) return res.status(400).json({ success: false, message: 'No fields to update' });
    params.push(id);
    const result = await pool.query(
      `UPDATE sol_products SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/sol-products PUT]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/sol-products/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    await pool.query(`DELETE FROM sol_products WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Inventory Management
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/inventory', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(
      `SELECT id, name, slug, sol_category, price, price_label, availability,
              stock_quantity, track_inventory, low_stock_threshold, is_active
       FROM sol_products ORDER BY sol_category ASC, name ASC`
    );
    res.json({ success: true, products: result.rows });
  } catch (err) {
    console.error('[api/admin/inventory GET]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/inventory/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    const { stock_quantity, track_inventory, low_stock_threshold } = req.body;
    const fields = [];
    const params = [];

    if (track_inventory !== undefined) {
      params.push(track_inventory);
      fields.push(`track_inventory = $${params.length}`);
    }
    if (stock_quantity !== undefined) {
      const sq = (stock_quantity === '' || stock_quantity === null) ? null : parseInt(stock_quantity, 10);
      params.push(sq);
      fields.push(`stock_quantity = $${params.length}`);
      // Auto-sync availability
      if (sq === 0) {
        // Only mark out-of-stock if tracking enabled (check current or incoming track_inventory)
        const ti = track_inventory !== undefined ? track_inventory : null;
        if (ti === true || ti === null) {
          // Will be resolved at update time — use CASE
          params.push('out_of_stock');
          fields.push(`availability = CASE WHEN (track_inventory = true OR $${params.length - 1 /* reuse sq param */} IS NOT NULL) THEN $${params.length} ELSE availability END`);
        }
      } else if (sq !== null && sq > 0) {
        params.push('in_stock');
        fields.push(`availability = CASE WHEN availability = 'out_of_stock' THEN $${params.length} ELSE availability END`);
      }
    }
    if (low_stock_threshold !== undefined) {
      params.push(parseInt(low_stock_threshold, 10) || 5);
      fields.push(`low_stock_threshold = $${params.length}`);
    }
    if (fields.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

    fields.push(`updated_at = NOW()`);
    params.push(id);
    const result = await pool.query(
      `UPDATE sol_products SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/inventory PUT]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/inventory/bulk', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ success: false, message: 'updates array required' });
    }
    const results = [];
    for (const u of updates) {
      if (!u.id) continue;
      const fields = [];
      const params = [];
      if (u.track_inventory !== undefined) {
        params.push(u.track_inventory);
        fields.push(`track_inventory = $${params.length}`);
      }
      if (u.stock_quantity !== undefined) {
        const sq = (u.stock_quantity === '' || u.stock_quantity === null) ? null : parseInt(u.stock_quantity, 10);
        params.push(sq);
        fields.push(`stock_quantity = $${params.length}`);
        if (sq === 0) {
          params.push('out_of_stock');
          fields.push(`availability = CASE WHEN track_inventory = true THEN $${params.length} ELSE availability END`);
        } else if (sq !== null && sq > 0) {
          params.push('in_stock');
          fields.push(`availability = CASE WHEN availability = 'out_of_stock' THEN $${params.length} ELSE availability END`);
        }
      }
      if (u.low_stock_threshold !== undefined) {
        params.push(parseInt(u.low_stock_threshold, 10) || 5);
        fields.push(`low_stock_threshold = $${params.length}`);
      }
      if (fields.length === 0) continue;
      fields.push(`updated_at = NOW()`);
      params.push(u.id);
      try {
        const r = await pool.query(
          `UPDATE sol_products SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING id, name, stock_quantity, availability`,
          params
        );
        if (r.rows.length > 0) results.push(r.rows[0]);
      } catch (e) {
        console.error(`[inventory bulk] id=${u.id}:`, e.message);
      }
    }
    res.json({ success: true, updated: results.length, results });
  } catch (err) {
    console.error('[api/admin/inventory bulk]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Blog Posts CRUD
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/blog', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const result = await pool.query(`SELECT * FROM blog_posts ORDER BY created_at DESC`);
    res.json({ success: true, posts: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/admin/blog', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { title, slug, excerpt, content, image_url, author, tags, category, meta_description, is_published } = req.body;
    if (!title || !slug) return res.status(400).json({ success: false, message: 'title and slug required' });
    const result = await pool.query(
      `INSERT INTO blog_posts (title, slug, excerpt, content, image_url, author, tags, category, meta_description, is_published, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${is_published ? 'NOW()' : 'NULL'}) RETURNING *`,
      [title, slug, excerpt || null, content || null, image_url || null, author || 'Sugar Oak Lane', tags || [], category || 'farm-stories', meta_description || null, !!is_published]
    );
    res.json({ success: true, post: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/blog POST]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.put('/api/admin/blog/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    const { id } = req.params;
    const { title, slug, excerpt, content, image_url, author, tags, category, meta_description, is_published } = req.body;
    // Handle published_at when toggling publish status
    let publishedAtExpr = '';
    if (is_published !== undefined) {
      publishedAtExpr = `, published_at = ${is_published ? 'COALESCE(published_at, NOW())' : 'NULL'}`;
    }
    const result = await pool.query(
      `UPDATE blog_posts SET
         title = COALESCE($1, title),
         slug = COALESCE($2, slug),
         excerpt = COALESCE($3, excerpt),
         content = COALESCE($4, content),
         image_url = COALESCE($5, image_url),
         author = COALESCE($6, author),
         tags = COALESCE($7, tags),
         category = COALESCE($8, category),
         meta_description = COALESCE($9, meta_description),
         is_published = COALESCE($10, is_published)
         ${publishedAtExpr},
         updated_at = NOW()
       WHERE id = $11 RETURNING *`,
      [title, slug, excerpt, content, image_url, author, tags, category, meta_description, is_published, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, message: 'Post not found' });
    res.json({ success: true, post: result.rows[0] });
  } catch (err) {
    console.error('[api/admin/blog PUT]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.delete('/api/admin/blog/:id', async (req, res) => {
  if (!checkAdminKey(req, res)) return;
  try {
    await pool.query(`DELETE FROM blog_posts WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin API: Image Upload & Media Library
// ─────────────────────────────────────────────────────────────────────────────

const _multerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed (jpeg, png, webp, gif, svg)'));
  },
});

// R2 circuit breaker — trips after first 404 (proxy route not provisioned).
// Resets on server restart so it'll retry if the platform fixes the route.
let _r2CircuitOpen = false;
let _r2CircuitReason = null;

function uploadToR2(buffer, r2Key, mimeType) {
  if (_r2CircuitOpen) {
    return Promise.reject(new Error(`R2 skipped (circuit open: ${_r2CircuitReason})`));
  }
  return new Promise((resolve, reject) => {
    const r2BaseUrl = process.env.POLSIA_R2_BASE_URL || 'https://polsia.com';
    const apiKey = process.env.POLSIA_API_KEY || process.env.OPENAI_API_KEY;
    const uploadUrl = `${r2BaseUrl}/r2/${r2Key}`;
    const urlObj = new URL(uploadUrl);
    const proto = urlObj.protocol === 'https:' ? https : http;
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': mimeType,
        'Content-Length': buffer.length,
        'x-polsia-company': 'sugaroakos',
      },
    };
    const req2 = proto.request(options, (res2) => {
      let body = '';
      res2.on('data', d => body += d);
      res2.on('end', () => {
        if (res2.statusCode >= 200 && res2.statusCode < 300) {
          resolve(`${r2BaseUrl}/r2/${r2Key}`);
        } else {
          // Trip the circuit breaker on 404 — proxy route isn't provisioned.
          // This avoids repeated failed round-trips on every subsequent upload.
          if (res2.statusCode === 404) {
            _r2CircuitOpen = true;
            _r2CircuitReason = `HTTP 404 on first attempt — R2 proxy route not provisioned`;
            console.warn(`[R2] Circuit breaker tripped (404). Falling back to DB storage for all uploads until next restart.`);
          }
          reject(new Error(`R2 upload failed: HTTP ${res2.statusCode} — ${body}`));
        }
      });
    });
    req2.on('error', reject);
    req2.write(buffer);
    req2.end();
  });
}

app.post('/api/admin/upload', (req, res, next) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  next();
}, _multerUpload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file provided' });
    const file = req.file;
    const ext = (file.originalname.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const safeName = file.originalname.replace(/[^a-z0-9._-]/gi, '-').toLowerCase();
    const uniqueName = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safeName}`;
    const r2Key = `sugaroakos/media/${uniqueName}`;

    // Convert to base64 for DB storage
    const dataBase64 = file.buffer.toString('base64');

    let publicUrl;
    let insertedId;
    try {
      // Try R2 first (circuit breaker will short-circuit if already known to be down)
      publicUrl = await uploadToR2(file.buffer, r2Key, file.mimetype);
      console.log(`[admin/upload] R2 upload OK: ${publicUrl}`);
    } catch (r2Err) {
      // Only log the first failure loudly; subsequent circuit-open skips are silent
      if (!_r2CircuitOpen || r2Err.message.indexOf('circuit open') === -1) {
        console.warn(`[admin/upload] R2 failed (${r2Err.message}), using DB-backed storage`);
      }
      publicUrl = null; // Will be set after DB insert with the row ID
    }

    // Persist to media_uploads table with base64 data for reliable serving
    try {
      const insertResult = await pool.query(
        `INSERT INTO media_uploads (filename, original_name, url, mime_type, file_size, data_base64) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [uniqueName, file.originalname, publicUrl || '__pending__', file.mimetype, file.size, dataBase64]
      );
      insertedId = insertResult.rows[0].id;
      // If R2 failed, use DB-backed serving URL
      if (!publicUrl) {
        publicUrl = `/api/media/${insertedId}`;
        await pool.query(`UPDATE media_uploads SET url = $1 WHERE id = $2`, [publicUrl, insertedId]);
      }
    } catch (dbErr) {
      console.error('[admin/upload] media_uploads insert failed:', dbErr.message);
      // No local file fallback — ephemeral filesystem is wiped on every deploy.
      // If both R2 and DB failed, return a clear error so the admin can retry.
      if (!publicUrl) {
        return res.status(500).json({ success: false, error: 'Upload failed: could not store image. Please try again.' });
      }
    }

    res.json({ success: true, url: publicUrl, filename: uniqueName, size: file.size, type: file.mimetype });
  } catch (err) {
    console.error('[api/admin/upload]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/images', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { limit = 100, offset = 0 } = req.query;
    const result = await pool.query(
      `SELECT id, filename, original_name, url, mime_type, file_size, data_base64 IS NOT NULL AS has_data, created_at
       FROM media_uploads ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit, 10) || 100, parseInt(offset, 10) || 0]
    );
    const countRes = await pool.query('SELECT COUNT(*) FROM media_uploads');
    // Normalize URLs: always use /api/media/:id for DB-served images.
    // External URLs (https://) are kept as-is; broken local /uploads/ paths are replaced.
    const images = result.rows.map(img => ({
      ...img,
      url: (img.url && img.url.startsWith('http')) ? img.url : `/api/media/${img.id}`,
    }));
    res.json({ success: true, images, total: parseInt(countRes.rows[0].count, 10) });
  } catch (err) {
    console.error('[api/admin/images]', err.message);
    // Table may not exist — return empty list gracefully
    res.json({ success: true, images: [], total: 0 });
  }
});

app.delete('/api/admin/images/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const r = await pool.query(`DELETE FROM media_uploads WHERE id = $1 RETURNING url`, [req.params.id]);
    res.json({ success: true, deleted: r.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DB-Backed Image Serving ────────────────────────────────────────────────
// Serves images stored in media_uploads.data_base64 for reliable persistence
app.get('/api/media/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT data_base64, mime_type, original_name FROM media_uploads WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      // Row doesn't exist at all — return placeholder
      const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#f3f4f6" width="400" height="300"/><text x="200" y="150" text-anchor="middle" fill="#9ca3af" font-family="sans-serif" font-size="14">Image not found</text></svg>`;
      return res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' }).send(placeholder);
    }
    const { data_base64, mime_type, original_name } = result.rows[0];
    if (!data_base64) {
      // Row exists but base64 data is NULL (e.g. was saved to ephemeral local storage).
      // Return a styled placeholder so the page doesn't show broken icons.
      const name = original_name || 'image';
      const placeholder = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300"><rect fill="#f0fdf4" width="400" height="300"/><rect x="160" y="90" width="80" height="80" rx="8" fill="#bbf7d0"/><text x="200" y="210" text-anchor="middle" fill="#15803d" font-family="sans-serif" font-size="12">${name.replace(/[<>&"]/g, '')}</text><text x="200" y="230" text-anchor="middle" fill="#86efac" font-family="sans-serif" font-size="10">Re-upload to restore</text></svg>`;
      return res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' }).send(placeholder);
    }
    const buffer = Buffer.from(data_base64, 'base64');
    res.set({
      'Content-Type': mime_type || 'image/jpeg',
      'Content-Length': buffer.length,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Disposition': `inline; filename="${original_name || 'image'}"`,
    });
    res.send(buffer);
  } catch (err) {
    console.error('[api/media/:id]', err.message);
    res.status(500).send('Error serving image');
  }
});

// ─── Catch-all for broken /uploads/* paths ──────────────────────────────────
// On Render's ephemeral filesystem, local files are wiped on each deploy.
// First checks media_uploads DB for the file; serves from DB if data exists.
// Falls back to a placeholder SVG if no data is available.
app.get('/uploads/*', async (req, res) => {
  const filename = req.params[0]; // e.g. "1775570407829-axw1e-white-nite-sunflower.png"
  try {
    const result = await pool.query(
      `SELECT id, data_base64, mime_type, original_name FROM media_uploads WHERE filename = $1 LIMIT 1`,
      [filename]
    );
    if (result.rows.length) {
      const row = result.rows[0];
      if (row.data_base64) {
        // Serve actual image data from DB
        const buffer = Buffer.from(row.data_base64, 'base64');
        res.set({
          'Content-Type': row.mime_type || 'image/jpeg',
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        return res.send(buffer);
      }
      // Row exists but no binary data (lost on ephemeral disk) — return 404 to
      // trigger onerror fallback on <img> tags so storefront shows a nice flower photo
      return res.status(404).end();
    }
  } catch (err) {
    console.warn('[uploads/*] DB lookup error:', err.message);
  }
  // No DB match — 404 so img onerror fires
  res.status(404).end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Public Page Renderer — /pages/:slug
// Renders a published page by stacking its blocks in order
// ─────────────────────────────────────────────────────────────────────────────

function renderBlock(block) {
  const c = block.config || {};
  const safeHtml = s => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  switch (block.block_type) {

    case 'hero': {
      const bg = c.bg_image_url
        ? `background-image:url('${c.bg_image_url}');background-size:cover;background-position:center;`
        : `background:${c.bg_color || 'linear-gradient(135deg,#14532d,#15803d)'};`;
      const overlay = c.bg_image_url
        ? `<div style="position:absolute;inset:0;background:rgba(0,0,0,${c.overlay_opacity||0.45});"></div>` : '';
      const cta = c.cta_text
        ? `<a href="${c.cta_url || '#'}" style="display:inline-block;margin-top:1.5rem;background:#15803d;color:#fff;padding:0.75rem 2rem;border-radius:9999px;font-weight:600;font-size:1rem;text-decoration:none;">${safeHtml(c.cta_text)}</a>` : '';
      return `<section style="position:relative;${bg}padding:5rem 1.5rem;text-align:center;color:#fff;overflow:hidden;">
  ${overlay}
  <div style="position:relative;z-index:1;max-width:720px;margin:0 auto;">
    <h1 style="font-size:clamp(2rem,5vw,3.5rem);font-weight:800;line-height:1.15;margin:0;">${safeHtml(c.headline || '')}</h1>
    ${c.subtitle ? `<p style="font-size:1.2rem;margin-top:1rem;opacity:0.9;">${safeHtml(c.subtitle)}</p>` : ''}
    ${cta}
  </div>
</section>`;
    }

    case 'text_image': {
      const imgSide = c.image_side === 'right' ? 'row' : 'row-reverse';
      const img = c.image_url
        ? `<div style="flex:0 0 45%;"><img src="${c.image_url}" alt="${safeHtml(c.image_alt||'')}" style="width:100%;border-radius:12px;object-fit:cover;max-height:380px;"></div>` : '';
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:1100px;margin:0 auto;display:flex;flex-direction:${imgSide};gap:3rem;align-items:center;flex-wrap:wrap;">
    ${img}
    <div style="flex:1;min-width:260px;">
      ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1rem;">${safeHtml(c.heading)}</h2>` : ''}
      <div style="font-size:1rem;color:#374151;line-height:1.7;">${c.body || ''}</div>
    </div>
  </div>
</section>`;
    }

    case 'gallery_grid': {
      const cols = Math.min(Math.max(parseInt(c.columns, 10) || 3, 2), 4);
      const images = Array.isArray(c.images) ? c.images : [];
      const cells = images.map(img =>
        `<div style="border-radius:10px;overflow:hidden;aspect-ratio:1;background:#f3f4f6;">
  <img src="${img.url || ''}" alt="${safeHtml(img.alt||'')}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">
</div>`
      ).join('\n');
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:1100px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1.5rem;text-align:center;">${safeHtml(c.heading)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:1rem;">${cells}</div>
  </div>
</section>`;
    }

    case 'cta_banner': {
      const bg = c.bg_color || '#15803d';
      const fg = c.text_color || '#ffffff';
      return `<section style="background:${bg};padding:4rem 1.5rem;text-align:center;">
  <div style="max-width:720px;margin:0 auto;">
    <h2 style="font-size:2rem;font-weight:800;color:${fg};margin:0;">${safeHtml(c.heading || '')}</h2>
    ${c.subtext ? `<p style="color:${fg};opacity:0.9;font-size:1.1rem;margin-top:0.75rem;">${safeHtml(c.subtext)}</p>` : ''}
    ${c.button_text ? `<a href="${c.button_url||'#'}" style="display:inline-block;margin-top:1.5rem;background:#fff;color:${bg};padding:0.75rem 2rem;border-radius:9999px;font-weight:700;font-size:1rem;text-decoration:none;">${safeHtml(c.button_text)}</a>` : ''}
  </div>
</section>`;
    }

    case 'card_grid': {
      const cols = Math.min(Math.max(parseInt(c.columns, 10) || 3, 2), 4);
      const cards = Array.isArray(c.cards) ? c.cards : [];
      const cardHtml = cards.map(card => `
<div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,0.08);overflow:hidden;border:1px solid #f3f4f6;">
  ${card.image_url ? `<img src="${card.image_url}" alt="${safeHtml(card.title||'')}" style="width:100%;height:200px;object-fit:cover;">` : ''}
  <div style="padding:1.25rem;">
    <h3 style="font-size:1.1rem;font-weight:700;color:#111827;margin:0 0 0.5rem;">${safeHtml(card.title||'')}</h3>
    ${card.description ? `<p style="font-size:0.875rem;color:#6b7280;margin:0 0 0.75rem;">${safeHtml(card.description)}</p>` : ''}
    ${card.link ? `<a href="${card.link}" style="font-size:0.875rem;color:#15803d;font-weight:600;text-decoration:none;">Learn more →</a>` : ''}
  </div>
</div>`).join('\n');
      return `<section style="padding:4rem 1.5rem;background:#f9fafb;">
  <div style="max-width:1100px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1.5rem;text-align:center;">${safeHtml(c.heading)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:1.5rem;flex-wrap:wrap;">${cardHtml}</div>
  </div>
</section>`;
    }

    case 'testimonial': {
      const bg = c.bg_color || '#f0fdf4';
      return `<section style="background:${bg};padding:4rem 1.5rem;text-align:center;">
  <div style="max-width:640px;margin:0 auto;">
    <div style="font-size:3rem;color:#15803d;line-height:1;margin-bottom:1rem;">"</div>
    <blockquote style="font-size:1.25rem;font-style:italic;color:#111827;line-height:1.6;margin:0;">${c.quote || ''}</blockquote>
    <div style="margin-top:1.5rem;">
      ${c.avatar_url ? `<img src="${c.avatar_url}" alt="${safeHtml(c.author||'')}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;margin:0 auto 0.5rem;display:block;">` : ''}
      <div style="font-weight:700;color:#111827;">${safeHtml(c.author||'')}</div>
      ${c.title ? `<div style="font-size:0.875rem;color:#6b7280;">${safeHtml(c.title)}</div>` : ''}
    </div>
  </div>
</section>`;
    }

    case 'feature_icons': {
      const features = Array.isArray(c.features) ? c.features : [];
      const featureHtml = features.map(f => `
<div style="text-align:center;padding:1.5rem;">
  <div style="font-size:2rem;margin-bottom:0.75rem;">${f.icon || '🌿'}</div>
  <h3 style="font-size:1.05rem;font-weight:700;color:#111827;margin:0 0 0.4rem;">${safeHtml(f.title||'')}</h3>
  <p style="font-size:0.875rem;color:#6b7280;margin:0;">${safeHtml(f.description||'')}</p>
</div>`).join('\n');
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:1100px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1.5rem;text-align:center;">${safeHtml(c.heading)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;">${featureHtml}</div>
  </div>
</section>`;
    }

    case 'rich_text': {
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:760px;margin:0 auto;font-size:1rem;line-height:1.8;color:#374151;">
    ${c.content || ''}
  </div>
</section>`;
    }

    case 'contact_form': {
      return `<section style="padding:4rem 1.5rem;background:#f9fafb;">
  <div style="max-width:560px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 0.5rem;text-align:center;">${safeHtml(c.heading)}</h2>` : ''}
    ${c.subtext ? `<p style="text-align:center;color:#6b7280;margin:0 0 1.5rem;">${safeHtml(c.subtext)}</p>` : ''}
    <form action="${c.form_action||'/contact'}" method="POST" style="background:#fff;border-radius:12px;padding:2rem;box-shadow:0 1px 4px rgba(0,0,0,0.08);border:1px solid #e5e7eb;">
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.875rem;font-weight:600;color:#374151;margin-bottom:0.4rem;">Name</label>
        <input type="text" name="name" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:0.625rem 0.875rem;font-size:0.875rem;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:1rem;">
        <label style="display:block;font-size:0.875rem;font-weight:600;color:#374151;margin-bottom:0.4rem;">Email</label>
        <input type="email" name="email" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:0.625rem 0.875rem;font-size:0.875rem;box-sizing:border-box;">
      </div>
      <div style="margin-bottom:1.5rem;">
        <label style="display:block;font-size:0.875rem;font-weight:600;color:#374151;margin-bottom:0.4rem;">Message</label>
        <textarea name="message" rows="4" style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:0.625rem 0.875rem;font-size:0.875rem;box-sizing:border-box;resize:vertical;"></textarea>
      </div>
      <button type="submit" style="width:100%;background:#15803d;color:#fff;border:none;border-radius:8px;padding:0.75rem;font-size:1rem;font-weight:600;cursor:pointer;">Send Message</button>
    </form>
  </div>
</section>`;
    }

    case 'listing': {
      const items = Array.isArray(c.items) ? c.items : [];
      const listHtml = items.map(item => `
<div style="background:#fff;border-radius:12px;padding:1.5rem;border:1px solid #e5e7eb;display:flex;gap:1.5rem;align-items:flex-start;flex-wrap:wrap;">
  <div style="flex:1;min-width:200px;">
    <h3 style="font-size:1.1rem;font-weight:700;color:#111827;margin:0 0 0.4rem;">${safeHtml(item.title||'')}</h3>
    ${item.description ? `<p style="font-size:0.875rem;color:#6b7280;margin:0;">${safeHtml(item.description)}</p>` : ''}
  </div>
  <div style="text-align:right;flex-shrink:0;">
    ${item.date ? `<div style="font-size:0.8rem;color:#9ca3af;margin-bottom:0.25rem;">${safeHtml(item.date)}</div>` : ''}
    ${item.price ? `<div style="font-size:1.1rem;font-weight:700;color:#15803d;">${safeHtml(item.price)}</div>` : ''}
    ${item.link ? `<a href="${item.link}" style="display:inline-block;margin-top:0.5rem;font-size:0.875rem;background:#15803d;color:#fff;padding:0.375rem 0.875rem;border-radius:6px;text-decoration:none;font-weight:600;">Book →</a>` : ''}
  </div>
</div>`).join('\n');
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:760px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1.5rem;">${safeHtml(c.heading)}</h2>` : ''}
    <div style="display:flex;flex-direction:column;gap:1rem;">${listHtml}</div>
  </div>
</section>`;
    }

    case 'pricing_table': {
      const plans = Array.isArray(c.plans) ? c.plans : [];
      const planHtml = plans.map(plan => `
<div style="background:#fff;border-radius:16px;padding:2rem;border:${plan.is_featured?'2px solid #15803d':'1px solid #e5e7eb'};text-align:center;position:relative;box-shadow:${plan.is_featured?'0 4px 16px rgba(21,128,61,0.15)':'0 1px 4px rgba(0,0,0,0.06)'};">
  ${plan.is_featured ? '<div style="position:absolute;top:-13px;left:50%;transform:translateX(-50%);background:#15803d;color:#fff;font-size:0.75rem;font-weight:700;padding:0.25rem 0.875rem;border-radius:9999px;">Most Popular</div>' : ''}
  <h3 style="font-size:1.2rem;font-weight:700;color:#111827;margin:0 0 0.5rem;">${safeHtml(plan.name||'')}</h3>
  <div style="font-size:2.5rem;font-weight:800;color:#15803d;margin:0.5rem 0;">${safeHtml(plan.price||'')}</div>
  <ul style="list-style:none;padding:0;margin:1rem 0;text-align:left;">
    ${(Array.isArray(plan.features) ? plan.features : []).map(f => `<li style="padding:0.375rem 0;font-size:0.875rem;color:#374151;border-bottom:1px solid #f3f4f6;">✓ ${safeHtml(f)}</li>`).join('')}
  </ul>
  ${plan.cta_text ? `<a href="${plan.cta_url||'#'}" style="display:block;background:${plan.is_featured?'#15803d':'#f3f4f6'};color:${plan.is_featured?'#fff':'#374151'};padding:0.75rem;border-radius:8px;text-decoration:none;font-weight:600;font-size:0.875rem;">${safeHtml(plan.cta_text)}</a>` : ''}
</div>`).join('\n');
      return `<section style="padding:4rem 1.5rem;background:#f9fafb;">
  <div style="max-width:1100px;margin:0 auto;">
    ${c.heading ? `<h2 style="font-size:2rem;font-weight:700;color:#111827;margin:0 0 1.5rem;text-align:center;">${safeHtml(c.heading)}</h2>` : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.5rem;">${planHtml}</div>
  </div>
</section>`;
    }

    case 'sidebar_content': {
      const sidePos = c.sidebar_position === 'right' ? 'row' : 'row-reverse';
      return `<section style="padding:4rem 1.5rem;">
  <div style="max-width:1100px;margin:0 auto;display:flex;flex-direction:${sidePos};gap:2.5rem;flex-wrap:wrap;">
    <aside style="flex:0 0 280px;min-width:220px;">${c.sidebar_content || ''}</aside>
    <div style="flex:1;min-width:260px;font-size:1rem;line-height:1.8;color:#374151;">${c.main_content || ''}</div>
  </div>
</section>`;
    }

    default:
      return `<!-- unknown block type: ${block.block_type} -->`;
  }
}

function buildPageHtml(page, blocksHtml) {
  const siteTitle = page.seo_title || page.title;
  const siteDesc = page.seo_desc || page.description || '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${siteTitle} — Sugar Oak Lane</title>
<meta name="description" content="${siteDesc}">
<meta property="og:title" content="${siteTitle}">
<meta property="og:description" content="${siteDesc}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Inter',sans-serif;color:#111827;background:#fff;}
img{max-width:100%;}
@media(max-width:700px){
  section div[style*="grid-template-columns:repeat(3"]{grid-template-columns:repeat(2,1fr)!important;}
  section div[style*="grid-template-columns:repeat(4"]{grid-template-columns:repeat(2,1fr)!important;}
  section div[style*="flex-direction:row"]{flex-direction:column!important;}
  section div[style*="flex-direction:row-reverse"]{flex-direction:column!important;}
}
</style>
</head>
<body>
<!-- Nav -->
<nav style="background:#fff;border-bottom:1px solid #f3f4f6;padding:0.875rem 1.5rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
  <a href="/" style="display:flex;align-items:center;gap:0.5rem;text-decoration:none;">
    <span style="font-size:1.2rem;">🌿</span>
    <span style="font-weight:800;color:#166534;font-size:1rem;">Sugar Oak Lane</span>
  </a>
  <div style="display:flex;gap:1.25rem;align-items:center;">
    <a href="/shop" style="font-size:0.875rem;font-weight:600;color:#374151;text-decoration:none;">Shop</a>
    <a href="/weddings" style="font-size:0.875rem;font-weight:600;color:#374151;text-decoration:none;">Weddings</a>
    <a href="/workshops" style="font-size:0.875rem;font-weight:600;color:#374151;text-decoration:none;">Workshops</a>
    <a href="/shop" style="background:#15803d;color:#fff;padding:0.5rem 1.1rem;border-radius:9999px;font-size:0.875rem;font-weight:600;text-decoration:none;">Order Now</a>
  </div>
</nav>
<!-- Page Blocks -->
${blocksHtml}
<!-- Footer -->
<footer style="background:#0f1319;color:#9ca3af;padding:3rem 1.5rem;text-align:center;font-size:0.875rem;margin-top:2rem;">
  <div style="max-width:1100px;margin:0 auto;">
    <div style="margin-bottom:1rem;">
      <span style="font-size:1.2rem;">🌿</span>
      <span style="font-weight:700;color:#fff;margin-left:0.5rem;">Sugar Oak Lane</span>
    </div>
    <div>Loganville, GA · same-day farm-to-door delivery · <a href="mailto:hello@sugaroaklane.com" style="color:#4ade80;text-decoration:none;">hello@sugaroaklane.com</a></div>
    <div style="margin-top:0.75rem;font-size:0.75rem;color:#4b5563;">© ${new Date().getFullYear()} Sugar Oak Lane, LLC</div>
  </div>
</footer>
</body>
</html>`;
}

// Public page renderer
app.get('/pages/:slug', async (req, res) => {
  try {
    // Try is_live first (versioned pages), fall back to is_published (non-versioned)
    let pr = await pool.query(
      `SELECT * FROM pages WHERE (route_slug = $1 OR slug = $1) AND is_live = true LIMIT 1`,
      [req.params.slug]
    );
    if (!pr.rows.length) {
      pr = await pool.query(
        `SELECT * FROM pages WHERE (route_slug = $1 OR slug = $1) AND is_published = true LIMIT 1`,
        [req.params.slug]
      );
    }
    if (!pr.rows.length) {
      const html404 = path.join(__dirname, 'public', 'sol-coming-soon.html');
      return fs.existsSync(html404)
        ? res.set('Cache-Control', 'no-cache').type('html').sendFile(html404)
        : res.status(404).send('Page not found');
    }
    const page = pr.rows[0];
    const br = await pool.query(
      `SELECT * FROM page_blocks WHERE page_id = $1 AND is_visible = true ORDER BY display_order ASC`,
      [page.id]
    );
    const blocksHtml = br.rows.map(b => renderBlock(b)).join('\n');
    const html = buildPageHtml(page, blocksHtml);
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  } catch (err) {
    console.error('[pages/:slug]', err.message);
    res.status(500).send('Error rendering page');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Romance Book Club — standalone digital library category page
// ─────────────────────────────────────────────────────────────────────────────
app.get('/romance-book-club', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'romance-book-club', 'index.html');
  res.set('Cache-Control', 'no-cache').type('html').sendFile(htmlPath);
});

app.get('/romance-book-club/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'romance-book-club', 'index.html');
  res.set('Cache-Control', 'no-cache').type('html').sendFile(htmlPath);
});

// ─────────────────────────────────────────────────────────────────────────────
// Analytics — Product View Tracking (public, no auth needed)
// ─────────────────────────────────────────────────────────────────────────────
app.post('/api/track/product-view', async (req, res) => {
  try {
    const { product_id } = req.body;
    if (!product_id || isNaN(parseInt(product_id))) return res.json({ ok: true });
    const cookies = parseCookies(req.headers.cookie);
    const sid = cookies.sol_session || null;
    await pool.query(
      `INSERT INTO sol_product_views (product_id, session_id) VALUES ($1, $2)`,
      [parseInt(product_id), sid]
    );
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true }); // silent fail — never break the storefront
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Analytics — Traffic Analytics Admin API (requires admin auth)
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/admin/analytics/traffic', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const now = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const weekStart  = new Date(now); weekStart.setDate(now.getDate() - 6); weekStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    // Common filter: exclude infrastructure noise from all analytics queries
    const NOISE_PATHS = ['/health', '/favicon.ico', '/robots.txt', '/sitemap.xml'];

    const [pvToday, pvWeek, pvMonth, uvToday, uvWeek, uvMonth, topPages, topProducts, referrers, dailyTrend, utmSources] = await Promise.all([
      // Page views counts (noise-filtered)
      pool.query(`SELECT COUNT(*) AS n FROM sol_page_views WHERE created_at >= $1 AND path != ALL($2::text[])`, [todayStart, NOISE_PATHS]),
      pool.query(`SELECT COUNT(*) AS n FROM sol_page_views WHERE created_at >= $1 AND path != ALL($2::text[])`, [weekStart, NOISE_PATHS]),
      pool.query(`SELECT COUNT(*) AS n FROM sol_page_views WHERE created_at >= $1 AND path != ALL($2::text[])`, [monthStart, NOISE_PATHS]),
      // Unique visitors (by session_id, noise-filtered)
      pool.query(`SELECT COUNT(DISTINCT session_id) AS n FROM sol_page_views WHERE created_at >= $1 AND session_id IS NOT NULL AND path != ALL($2::text[])`, [todayStart, NOISE_PATHS]),
      pool.query(`SELECT COUNT(DISTINCT session_id) AS n FROM sol_page_views WHERE created_at >= $1 AND session_id IS NOT NULL AND path != ALL($2::text[])`, [weekStart, NOISE_PATHS]),
      pool.query(`SELECT COUNT(DISTINCT session_id) AS n FROM sol_page_views WHERE created_at >= $1 AND session_id IS NOT NULL AND path != ALL($2::text[])`, [monthStart, NOISE_PATHS]),
      // Top 10 pages this month (noise-filtered)
      pool.query(`SELECT path, COUNT(*) AS views FROM sol_page_views WHERE created_at >= $1 AND path != ALL($2::text[]) GROUP BY path ORDER BY views DESC LIMIT 10`, [monthStart, NOISE_PATHS]),
      // Top 10 products this month
      pool.query(`
        SELECT pv.product_id, p.name, p.slug, COUNT(*) AS views
        FROM sol_product_views pv
        LEFT JOIN sol_products p ON p.id = pv.product_id
        WHERE pv.created_at >= $1
        GROUP BY pv.product_id, p.name, p.slug
        ORDER BY views DESC LIMIT 10`, [monthStart]),
      // Referrer breakdown this month (top 10, exclude direct/empty, noise-filtered)
      pool.query(`
        SELECT referrer, COUNT(*) AS views
        FROM sol_page_views
        WHERE created_at >= $1 AND referrer IS NOT NULL AND referrer != '' AND path != ALL($2::text[])
        GROUP BY referrer ORDER BY views DESC LIMIT 10`, [monthStart, NOISE_PATHS]),
      // Daily page views for last 30 days (noise-filtered)
      pool.query(`
        SELECT DATE(created_at) AS day, COUNT(*) AS views, COUNT(DISTINCT session_id) AS visitors
        FROM sol_page_views
        WHERE created_at >= NOW() - INTERVAL '30 days' AND path != ALL($1::text[])
        GROUP BY day ORDER BY day ASC`, [NOISE_PATHS]),
      // UTM traffic sources this month
      pool.query(`
        SELECT
          COALESCE(utm_source, 'direct') AS source,
          COALESCE(utm_medium, CASE WHEN referrer IS NOT NULL AND referrer != '' THEN 'referral' ELSE 'direct' END) AS medium,
          COUNT(*) AS views,
          COUNT(DISTINCT session_id) AS visitors
        FROM sol_page_views
        WHERE created_at >= $1 AND path != ALL($2::text[])
        GROUP BY 1, 2
        ORDER BY views DESC LIMIT 20`, [monthStart, NOISE_PATHS]),
    ]);

    // Order metrics
    let orderMetrics = { total_orders: 0, total_revenue: 0, revenue_week: 0, avg_order_value: 0, orders_today: 0, orders_week: 0, orders_month: 0 };
    try {
      const om = await pool.query(`
        SELECT
          COUNT(*) AS total_orders,
          COALESCE(SUM(total_price), 0) AS total_revenue,
          COALESCE(AVG(total_price), 0) AS avg_order_value,
          COALESCE(SUM(total_price) FILTER (WHERE created_at >= $2), 0) AS revenue_week,
          COUNT(*) FILTER (WHERE created_at >= $1) AS orders_today,
          COUNT(*) FILTER (WHERE created_at >= $2) AS orders_week,
          COUNT(*) FILTER (WHERE created_at >= $3) AS orders_month
        FROM sol_orders`, [todayStart, weekStart, monthStart]);
      const row = om.rows[0];
      orderMetrics = {
        total_orders:    parseInt(row.total_orders),
        total_revenue:   parseFloat(row.total_revenue),
        revenue_week:    parseFloat(row.revenue_week),
        avg_order_value: parseFloat(row.avg_order_value),
        orders_today:    parseInt(row.orders_today),
        orders_week:     parseInt(row.orders_week),
        orders_month:    parseInt(row.orders_month),
      };
    } catch { /* orders table shape may differ */ }

    res.json({
      success: true,
      pageViews: {
        today: parseInt(pvToday.rows[0].n),
        week:  parseInt(pvWeek.rows[0].n),
        month: parseInt(pvMonth.rows[0].n),
      },
      uniqueVisitors: {
        today: parseInt(uvToday.rows[0].n),
        week:  parseInt(uvWeek.rows[0].n),
        month: parseInt(uvMonth.rows[0].n),
      },
      topPages:    topPages.rows,
      topProducts: topProducts.rows,
      referrers:   referrers.rows,
      dailyTrend:  dailyTrend.rows,
      utmSources:  utmSources.rows,
      orders:      orderMetrics,
    });
  } catch (err) {
    console.error('[admin/analytics]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Reviews API — POST /api/sol/reviews  |  GET /api/sol/products/:id/reviews
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/sol/products/:id/reviews
app.get('/api/sol/products/:id/reviews', async (req, res) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) return res.status(400).json({ success: false, message: 'Invalid product ID' });

    const [reviewsRes, aggRes] = await Promise.all([
      pool.query(
        `SELECT id, customer_name, rating, review_text, verified_purchase, created_at
         FROM sol_reviews
         WHERE product_id = $1 AND status = 'approved'
         ORDER BY created_at DESC`,
        [productId]
      ),
      pool.query(
        `SELECT COUNT(*) AS review_count, ROUND(AVG(rating)::numeric, 1) AS avg_rating
         FROM sol_reviews
         WHERE product_id = $1 AND status = 'approved'`,
        [productId]
      )
    ]);

    const agg = aggRes.rows[0];
    res.json({
      success: true,
      reviews: reviewsRes.rows,
      review_count: parseInt(agg.review_count),
      avg_rating: agg.avg_rating ? parseFloat(agg.avg_rating) : null
    });
  } catch (err) {
    console.error('[GET /api/sol/products/:id/reviews]', err.message);
    res.status(500).json({ success: false, message: 'Failed to load reviews' });
  }
});

// POST /api/sol/reviews
app.post('/api/sol/reviews', async (req, res) => {
  try {
    const { product_id, customer_name, customer_email, rating, review_text } = req.body || {};

    if (!product_id || !customer_name || !customer_email || !rating) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    if (!String(customer_email).includes('@')) {
      return res.status(400).json({ success: false, message: 'Invalid email address' });
    }
    const ratingNum = parseInt(rating);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5' });
    }

    // Check product exists
    const prodCheck = await pool.query(
      `SELECT id FROM sol_products WHERE id = $1 AND is_active = TRUE`,
      [product_id]
    );
    if (!prodCheck.rows.length) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const cleanEmail = customer_email.trim().toLowerCase();

    // One review per email+product
    const dupeCheck = await pool.query(
      `SELECT id FROM sol_reviews WHERE customer_email = $1 AND product_id = $2`,
      [cleanEmail, product_id]
    );
    if (dupeCheck.rows.length) {
      return res.status(409).json({ success: false, message: 'You\'ve already submitted a review for this product' });
    }

    // Verified purchase check
    let verifiedPurchase = false;
    try {
      const vpCheck = await pool.query(
        `SELECT 1 FROM sol_orders
         WHERE LOWER(customer_email) = $1
           AND status IN ('confirmed','fulfilled','ready','completed')
           AND EXISTS (
             SELECT 1 FROM jsonb_array_elements(COALESCE(items,'[]'::jsonb)) AS item
             WHERE (item->>'id')::text = $2::text
           )
         LIMIT 1`,
        [cleanEmail, String(product_id)]
      );
      verifiedPurchase = vpCheck.rows.length > 0;
    } catch (_) { /* non-fatal */ }

    const insertRes = await pool.query(
      `INSERT INTO sol_reviews (product_id, customer_name, customer_email, rating, review_text, verified_purchase, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'approved')
       RETURNING id, created_at`,
      [product_id, customer_name.trim(), cleanEmail, ratingNum, (review_text || '').trim() || null, verifiedPurchase]
    );

    res.json({ success: true, review: insertRes.rows[0], verified_purchase: verifiedPurchase });
  } catch (err) {
    console.error('[POST /api/sol/reviews]', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit review' });
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// Hero System — sol_heroes table (public read + admin CRUD)
// ─────────────────────────────────────────────────────────────────────────────

// Auto-create sol_heroes table (idempotent safety net)
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_heroes (
    id          SERIAL PRIMARY KEY,
    page_key    VARCHAR(100)  NOT NULL,
    image_url   TEXT          NOT NULL,
    headline    TEXT,
    subtext     TEXT,
    cta_text    VARCHAR(200),
    cta_link    VARCHAR(500),
    sort_order  INTEGER       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] sol_heroes auto-create warning:', e.message));

// Public: fetch heroes for a page
app.get('/api/heroes/:pageKey', async (req, res) => {
  try {
    const { pageKey } = req.params;
    const result = await pool.query(
      `SELECT id, page_key, image_url, headline, subtext, cta_text, cta_link, sort_order
       FROM sol_heroes
       WHERE page_key = $1
       ORDER BY sort_order ASC, id ASC`,
      [pageKey]
    );
    res.json({ success: true, heroes: result.rows });
  } catch (err) {
    console.error('[GET /api/heroes/:pageKey]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: fetch heroes for a page
app.get('/api/admin/heroes/:pageKey', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { pageKey } = req.params;
    const result = await pool.query(
      `SELECT id, page_key, image_url, headline, subtext, cta_text, cta_link, sort_order, created_at, updated_at
       FROM sol_heroes
       WHERE page_key = $1
       ORDER BY sort_order ASC, id ASC`,
      [pageKey]
    );
    res.json({ success: true, heroes: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/heroes/:pageKey]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: create hero
app.post('/api/admin/heroes', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { page_key, image_url, headline, subtext, cta_text, cta_link, sort_order } = req.body;
    if (!page_key) return res.status(400).json({ success: false, error: 'page_key is required' });
    if (!image_url) return res.status(400).json({ success: false, error: 'image_url is required' });
    // Default sort_order to max + 1 for this page
    let order = sort_order;
    if (order === undefined || order === null) {
      const maxRes = await pool.query(
        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM sol_heroes WHERE page_key = $1`,
        [page_key]
      );
      order = maxRes.rows[0].next_order;
    }
    const result = await pool.query(
      `INSERT INTO sol_heroes (page_key, image_url, headline, subtext, cta_text, cta_link, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [page_key, image_url, headline || null, subtext || null, cta_text || null, cta_link || null, order]
    );
    res.json({ success: true, hero: result.rows[0] });
  } catch (err) {
    console.error('[POST /api/admin/heroes]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Admin: update hero
app.put('/api/admin/heroes/reorder', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { order } = req.body; // array of { id, sort_order }
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order array required' });
    for (const item of order) {
      await pool.query(
        `UPDATE sol_heroes SET sort_order = $1, updated_at = NOW() WHERE id = $2`,
        [item.sort_order, item.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[PUT /api/admin/heroes/reorder]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/heroes/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    const { image_url, headline, subtext, cta_text, cta_link, sort_order } = req.body;
    const result = await pool.query(
      `UPDATE sol_heroes
       SET image_url   = COALESCE($1, image_url),
           headline    = $2,
           subtext     = $3,
           cta_text    = $4,
           cta_link    = $5,
           sort_order  = COALESCE($6, sort_order),
           updated_at  = NOW()
       WHERE id = $7
       RETURNING *`,
      [image_url || null, headline || null, subtext || null, cta_text || null, cta_link || null, sort_order ?? null, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Hero not found' });
    res.json({ success: true, hero: result.rows[0] });
  } catch (err) {
    console.error('[PUT /api/admin/heroes/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/admin/heroes/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    await pool.query(`DELETE FROM sol_heroes WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[DELETE /api/admin/heroes/:id]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WHOLESALE SYSTEM — Customer Auth + API + Admin API
// ─────────────────────────────────────────────────────────────────────────────

// Auto-create wholesale tables (idempotent safety net — migration handles real creation)
pool.query(`
  CREATE TABLE IF NOT EXISTS sol_wholesale_customers (
    id SERIAL PRIMARY KEY, business_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, phone VARCHAR(60), notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] ws customers auto-create:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS sol_wholesale_products (
    id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, image_url TEXT, description TEXT,
    unit_type VARCHAR(30) NOT NULL DEFAULT 'bunch', price_per_unit DECIMAL(10,2) NOT NULL,
    variety_options JSONB DEFAULT '[]', available_now BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE, sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] ws products auto-create:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS sol_wholesale_harvest_weeks (
    id SERIAL PRIMARY KEY, week_start_date DATE NOT NULL, week_end_date DATE NOT NULL,
    label VARCHAR(120) NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] ws harvest weeks auto-create:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS sol_wholesale_orders (
    id SERIAL PRIMARY KEY, customer_id INT NOT NULL REFERENCES sol_wholesale_customers(id) ON DELETE CASCADE,
    status VARCHAR(30) NOT NULL DEFAULT 'submitted', subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
    notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] ws orders auto-create:', e.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS sol_wholesale_order_items (
    id SERIAL PRIMARY KEY, order_id INT NOT NULL REFERENCES sol_wholesale_orders(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES sol_wholesale_products(id) ON DELETE RESTRICT,
    variety VARCHAR(120), quantity INT NOT NULL DEFAULT 1, unit_type VARCHAR(30) NOT NULL,
    price_per_unit DECIMAL(10,2) NOT NULL,
    harvest_week_id INT REFERENCES sol_wholesale_harvest_weeks(id) ON DELETE SET NULL,
    delivery_date DATE, created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('[startup] ws order items auto-create:', e.message));

// ── Wholesale Customer Auth ────────────────────────────────────────────────
app.post('/api/wholesale/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.json({ success: false, error: 'Email and password are required.' });
    const result = await pool.query(
      `SELECT id, contact_name, business_name, password_hash, active FROM sol_wholesale_customers WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );
    const customer = result.rows[0];
    if (!customer || !customer.active) return res.json({ success: false, error: 'Invalid email or password.' });
    if (!verifyWsPassword(password, customer.password_hash)) return res.json({ success: false, error: 'Invalid email or password.' });
    const cookieVal = signWsCookie(customer.id);
    const maxAge = 7 * 24 * 60 * 60;
    res.setHeader('Set-Cookie', `ws_session=${encodeURIComponent(cookieVal)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`);
    res.json({ success: true, customer: { id: customer.id, contact_name: customer.contact_name, business_name: customer.business_name } });
  } catch (err) {
    console.error('[POST /api/wholesale/login]', err.message);
    res.status(500).json({ success: false, error: 'Login failed.' });
  }
});

app.post('/api/wholesale/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'ws_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  res.json({ success: true });
});

// ── Wholesale Customer: Who am I ───────────────────────────────────────────
app.get('/api/wholesale/me', async (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  try {
    const result = await pool.query(
      `SELECT id, business_name, contact_name, email, phone FROM sol_wholesale_customers WHERE id = $1 AND active = TRUE`,
      [customerId]
    );
    if (!result.rows.length) return res.status(401).json({ success: false, error: 'Account not found.' });
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    console.error('[GET /api/wholesale/me]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Wholesale Products (customer-facing) ──────────────────────────────────
app.get('/api/wholesale/products', async (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  try {
    const result = await pool.query(
      `SELECT id, name, image_url, description, unit_type, price_per_unit, variety_options, available_now, active, sort_order
       FROM sol_wholesale_products WHERE active = TRUE ORDER BY sort_order ASC, id ASC`
    );
    res.json({ success: true, products: result.rows });
  } catch (err) {
    console.error('[GET /api/wholesale/products]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Harvest Weeks (customer-facing) ───────────────────────────────────────
app.get('/api/wholesale/harvest-weeks', async (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  try {
    const result = await pool.query(
      `SELECT id, label, week_start_date, week_end_date, active, sort_order
       FROM sol_wholesale_harvest_weeks WHERE active = TRUE ORDER BY week_start_date ASC, sort_order ASC`
    );
    res.json({ success: true, weeks: result.rows });
  } catch (err) {
    console.error('[GET /api/wholesale/harvest-weeks]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Submit Order ───────────────────────────────────────────────────────────
app.post('/api/wholesale/orders', async (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  const client = await pool.connect();
  try {
    const { notes, subtotal, items } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ success: false, error: 'Order must have at least one item.' });
    await client.query('BEGIN');
    const orderRes = await client.query(
      `INSERT INTO sol_wholesale_orders (customer_id, status, subtotal, notes) VALUES ($1, 'submitted', $2, $3) RETURNING id`,
      [customerId, parseFloat(subtotal) || 0, notes || null]
    );
    const orderId = orderRes.rows[0].id;
    for (const item of items) {
      await client.query(
        `INSERT INTO sol_wholesale_order_items (order_id, product_id, variety, quantity, unit_type, price_per_unit, harvest_week_id, delivery_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [orderId, item.product_id, item.variety || null, item.quantity, item.unit_type, item.price_per_unit, item.harvest_week_id || null, item.delivery_date || null]
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, order_id: orderId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /api/wholesale/orders]', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ── Customer: My Orders ────────────────────────────────────────────────────
app.get('/api/wholesale/orders', async (req, res) => {
  const customerId = getWsCustomerId(req);
  if (!customerId) return res.status(401).json({ success: false, error: 'Not authenticated.' });
  try {
    const result = await pool.query(
      `SELECT o.id, o.status, o.subtotal, o.notes, o.created_at,
              json_agg(json_build_object(
                'id', i.id, 'product_id', i.product_id, 'variety', i.variety,
                'quantity', i.quantity, 'unit_type', i.unit_type, 'price_per_unit', i.price_per_unit,
                'harvest_week_id', i.harvest_week_id, 'delivery_date', i.delivery_date,
                'product_name', p.name
              ) ORDER BY i.id) AS items
       FROM sol_wholesale_orders o
       JOIN sol_wholesale_order_items i ON i.order_id = o.id
       JOIN sol_wholesale_products p ON p.id = i.product_id
       WHERE o.customer_id = $1
       GROUP BY o.id ORDER BY o.created_at DESC`,
      [customerId]
    );
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error('[GET /api/wholesale/orders]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── ADMIN: Wholesale Products ──────────────────────────────────────────────
app.get('/api/admin/wholesale/products', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const result = await pool.query(`SELECT * FROM sol_wholesale_products ORDER BY sort_order ASC, id ASC`);
    res.json({ success: true, products: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/wholesale/products', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { name, image_url, description, unit_type, price_per_unit, variety_options, available_now, active, sort_order } = req.body || {};
    if (!name || !price_per_unit) return res.status(400).json({ success: false, error: 'name and price_per_unit are required.' });
    const result = await pool.query(
      `INSERT INTO sol_wholesale_products (name, image_url, description, unit_type, price_per_unit, variety_options, available_now, active, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, image_url||null, description||null, unit_type||'bunch', parseFloat(price_per_unit),
       JSON.stringify(variety_options||[]), available_now===true||available_now==='true', active!==false&&active!=='false', parseInt(sort_order)||0]
    );
    res.json({ success: true, product: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/admin/wholesale/products/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    const { name, image_url, description, unit_type, price_per_unit, variety_options, available_now, active, sort_order } = req.body || {};
    const result = await pool.query(
      `UPDATE sol_wholesale_products SET name=COALESCE($1,name), image_url=$2, description=$3,
       unit_type=COALESCE($4,unit_type), price_per_unit=COALESCE($5,price_per_unit),
       variety_options=COALESCE($6,variety_options), available_now=COALESCE($7,available_now),
       active=COALESCE($8,active), sort_order=COALESCE($9,sort_order), updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [name||null, image_url!==undefined?image_url:undefined, description!==undefined?description:undefined,
       unit_type||null, price_per_unit?parseFloat(price_per_unit):null,
       variety_options!==undefined?JSON.stringify(variety_options):null,
       available_now!==undefined?(available_now===true||available_now==='true'):null,
       active!==undefined?(active!==false&&active!=='false'):null,
       sort_order!==undefined?parseInt(sort_order)||0:null, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, product: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/wholesale/products/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    await pool.query(`UPDATE sol_wholesale_products SET active=FALSE, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ADMIN: Harvest Weeks ───────────────────────────────────────────────────
app.get('/api/admin/wholesale/harvest-weeks', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const result = await pool.query(`SELECT * FROM sol_wholesale_harvest_weeks ORDER BY week_start_date ASC, sort_order ASC`);
    res.json({ success: true, weeks: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/wholesale/harvest-weeks', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { week_start_date, week_end_date, label, active, sort_order } = req.body || {};
    if (!week_start_date || !week_end_date || !label) return res.status(400).json({ success: false, error: 'week_start_date, week_end_date, and label are required.' });
    const result = await pool.query(
      `INSERT INTO sol_wholesale_harvest_weeks (week_start_date, week_end_date, label, active, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [week_start_date, week_end_date, label, active!==false&&active!=='false', parseInt(sort_order)||0]
    );
    res.json({ success: true, week: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.put('/api/admin/wholesale/harvest-weeks/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    const { week_start_date, week_end_date, label, active, sort_order } = req.body || {};
    const result = await pool.query(
      `UPDATE sol_wholesale_harvest_weeks SET
       week_start_date=COALESCE($1,week_start_date), week_end_date=COALESCE($2,week_end_date),
       label=COALESCE($3,label), active=COALESCE($4,active), sort_order=COALESCE($5,sort_order), updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [week_start_date||null, week_end_date||null, label||null,
       active!==undefined?(active!==false&&active!=='false'):null,
       sort_order!==undefined?parseInt(sort_order)||0:null, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, week: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete('/api/admin/wholesale/harvest-weeks/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    await pool.query(`DELETE FROM sol_wholesale_harvest_weeks WHERE id=$1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ADMIN: Wholesale Customers ─────────────────────────────────────────────
app.get('/api/admin/wholesale/customers', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const result = await pool.query(
      `SELECT c.id, c.business_name, c.contact_name, c.email, c.phone, c.notes, c.active, c.created_at,
              COUNT(o.id) AS order_count
       FROM sol_wholesale_customers c
       LEFT JOIN sol_wholesale_orders o ON o.customer_id = c.id
       GROUP BY c.id ORDER BY c.created_at DESC`
    );
    res.json({ success: true, customers: result.rows });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post('/api/admin/wholesale/customers', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { business_name, contact_name, email, password, phone, notes, active } = req.body || {};
    if (!business_name || !contact_name || !email || !password) {
      return res.status(400).json({ success: false, error: 'business_name, contact_name, email, and password are required.' });
    }
    const password_hash = hashWsPassword(password);
    const result = await pool.query(
      `INSERT INTO sol_wholesale_customers (business_name, contact_name, email, password_hash, phone, notes, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, business_name, contact_name, email, phone, notes, active, created_at`,
      [business_name, contact_name, email.toLowerCase().trim(), password_hash, phone||null, notes||null, active!==false&&active!=='false']
    );
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ success: false, error: 'A customer with this email already exists.' });
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/wholesale/customers/:id', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    const { business_name, contact_name, email, password, phone, notes, active } = req.body || {};
    let passwordUpdate = '';
    const params = [business_name||null, contact_name||null, email?email.toLowerCase().trim():null,
                    phone!==undefined?phone:undefined, notes!==undefined?notes:undefined,
                    active!==undefined?(active!==false&&active!=='false'):null, id];
    const result = await pool.query(
      `UPDATE sol_wholesale_customers SET
       business_name=COALESCE($1,business_name), contact_name=COALESCE($2,contact_name),
       email=COALESCE($3,email), phone=COALESCE($4,phone), notes=COALESCE($5,notes),
       active=COALESCE($6,active), updated_at=NOW()
       WHERE id=$7 RETURNING id, business_name, contact_name, email, phone, notes, active`,
      params
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    // Update password separately if provided
    if (password) {
      await pool.query(`UPDATE sol_wholesale_customers SET password_hash=$1, updated_at=NOW() WHERE id=$2`, [hashWsPassword(password), id]);
    }
    res.json({ success: true, customer: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ADMIN: Wholesale Orders ────────────────────────────────────────────────
app.get('/api/admin/wholesale/orders', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const result = await pool.query(`
      SELECT o.id, o.status, o.subtotal, o.notes, o.created_at, o.updated_at,
             c.business_name, c.contact_name, c.email AS customer_email,
             json_agg(json_build_object(
               'id', i.id, 'product_name', p.name, 'variety', i.variety,
               'quantity', i.quantity, 'unit_type', i.unit_type, 'price_per_unit', i.price_per_unit,
               'harvest_week_label', hw.label, 'delivery_date', i.delivery_date,
               'line_total', (i.quantity * i.price_per_unit)
             ) ORDER BY i.id) AS items
      FROM sol_wholesale_orders o
      JOIN sol_wholesale_customers c ON c.id = o.customer_id
      JOIN sol_wholesale_order_items i ON i.order_id = o.id
      JOIN sol_wholesale_products p ON p.id = i.product_id
      LEFT JOIN sol_wholesale_harvest_weeks hw ON hw.id = i.harvest_week_id
      GROUP BY o.id, c.id ORDER BY o.created_at DESC
    `);
    res.json({ success: true, orders: result.rows });
  } catch (err) {
    console.error('[GET /api/admin/wholesale/orders]', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/admin/wholesale/orders/:id/status', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: 'Not authenticated' });
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    const allowed = ['submitted', 'confirmed', 'fulfilled', 'cancelled'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, error: `Status must be one of: ${allowed.join(', ')}` });
    const result = await pool.query(
      `UPDATE sol_wholesale_orders SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Order not found' });
    res.json({ success: true, order: result.rows[0] });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEMPORARY: One-time secure project export endpoint
// Remove after owner confirms download (Task #1275028)
// ─────────────────────────────────────────────────────────────────────────────
const EXPORT_TOKEN = '1e1c176c2e0b530ff88c0a676b2900cdd4b68f21d1d61a79b4e7569aab4249b2';
let exportTokenUsed = false;

async function generateDatabaseDump() {
  const client = await pool.connect();
  try {
    let dump = `-- Sugar Oak Lane Full Database Export\n-- Generated: ${new Date().toISOString()}\n--\n\nSET client_encoding = 'UTF8';\nSET standard_conforming_strings = on;\n\n`;

    const tablesResult = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
    );
    const tables = tablesResult.rows.map(r => r.tablename);

    for (const table of tables) {
      const colsResult = await client.query(`
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default, udt_name
        FROM information_schema.columns
        WHERE table_name = $1 AND table_schema = 'public'
        ORDER BY ordinal_position
      `, [table]);

      const colDefs = colsResult.rows.map(col => {
        let type = col.data_type;
        if (type === 'character varying') {
          type = col.character_maximum_length ? `VARCHAR(${col.character_maximum_length})` : 'VARCHAR';
        } else if (type === 'USER-DEFINED') {
          type = col.udt_name;
        } else if (type === 'timestamp with time zone') {
          type = 'TIMESTAMPTZ';
        } else if (type === 'timestamp without time zone') {
          type = 'TIMESTAMP';
        } else if (type === 'double precision') {
          type = 'DOUBLE PRECISION';
        } else {
          type = type.toUpperCase();
        }
        let def = `  "${col.column_name}" ${type}`;
        if (col.column_default && !col.column_default.includes('nextval')) {
          def += ` DEFAULT ${col.column_default}`;
        }
        if (col.is_nullable === 'NO') def += ' NOT NULL';
        return def;
      });

      dump += `\n-- ===== Table: ${table} =====\n`;
      dump += `CREATE TABLE IF NOT EXISTS "${table}" (\n${colDefs.join(',\n')}\n);\n\n`;

      const dataResult = await client.query(`SELECT * FROM "${table}"`);
      if (dataResult.rows.length > 0) {
        const cols = dataResult.fields.map(f => `"${f.name}"`).join(', ');
        dump += `-- Data: ${dataResult.rows.length} rows\n`;
        for (const row of dataResult.rows) {
          const vals = dataResult.fields.map(f => {
            const v = row[f.name];
            if (v === null || v === undefined) return 'NULL';
            if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
            if (typeof v === 'number') return String(v);
            if (v instanceof Date) return `'${v.toISOString()}'`;
            if (typeof v === 'object') return `'${JSON.stringify(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
            return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
          });
          dump += `INSERT INTO "${table}" (${cols}) VALUES (${vals.join(', ')});\n`;
        }
        dump += '\n';
      }
    }

    // Sequences — reset to current values so auto-increments continue correctly
    const seqResult = await client.query(
      `SELECT sequence_name, last_value FROM pg_sequences WHERE schemaname = 'public'`
    );
    if (seqResult.rows.length > 0) {
      dump += '\n-- ===== Sequences =====\n';
      for (const seq of seqResult.rows) {
        dump += `SELECT setval('${seq.sequence_name}', ${seq.last_value || 1});\n`;
      }
    }

    return dump;
  } finally {
    client.release();
  }
}

app.get('/admin/export-download', async (req, res) => {
  const { token } = req.query;

  // Constant-time token comparison
  if (!token || token.length !== EXPORT_TOKEN.length) {
    return res.status(401).send('Invalid token');
  }
  try {
    if (!crypto.timingSafeEqual(Buffer.from(token), Buffer.from(EXPORT_TOKEN))) {
      return res.status(401).send('Invalid token');
    }
  } catch { return res.status(401).send('Invalid token'); }

  if (exportTokenUsed) {
    return res.status(410).send('This download link has already been used.');
  }

  // Mark used immediately to prevent concurrent downloads
  exportTokenUsed = true;

  try {
    const archiver = require('archiver');
    const archive = archiver('zip', { zlib: { level: 6 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="sugaroaklane-full-export.zip"');
    archive.pipe(res);

    // ── A. Source files ────────────────────────────────────────────────────
    const rootFiles = [
      'server.js', 'package.json', 'package-lock.json', 'migrate.js',
      'render.yaml', 'ARCHITECTURE.md', 'MODULARIZATION.md', 'README.md', 'policy-limits.json'
    ];
    for (const file of rootFiles) {
      const fp = path.join(__dirname, file);
      if (fs.existsSync(fp)) archive.file(fp, { name: file });
    }

    // ── Directories ────────────────────────────────────────────────────────
    for (const dir of ['migrations', 'public', 'scripts']) {
      const dp = path.join(__dirname, dir);
      if (fs.existsSync(dp)) archive.directory(dp, dir);
    }

    // ── B. Database export ─────────────────────────────────────────────────
    const dbDump = await generateDatabaseDump();
    archive.append(dbDump, { name: 'schema.sql' });

    // ── C. .env.example ────────────────────────────────────────────────────
    archive.append([
      '# Sugar Oak Lane — Environment Variables',
      '# Copy to .env and fill in your values',
      '',
      '# REQUIRED: PostgreSQL connection string',
      'DATABASE_URL=postgres://user:password@localhost:5432/sugaroaklane',
      '',
      '# App URL (your production domain)',
      'APP_URL=https://your-domain.com',
      'BASE_URL=https://your-domain.com',
      '',
      '# Admin panel password (for /admin)',
      'ADMIN_PASSWORD=your-secure-admin-password                  # REPLACE',
      '',
      '# API key (admin API access)',
      'POLSIA_API_KEY=your-api-key                                # REPLACE',
      'ADMIN_API_KEY=your-admin-api-key                           # REPLACE',
      '',
      '# OpenAI (AI features)',
      'OPENAI_API_KEY=sk-your-openai-key                          # REPLACE',
      '',
      '# Analytics (optional)',
      'ANALYTICS_SALT=your-random-salt',
      'POLSIA_ANALYTICS_SLUG=your-company-slug',
      '',
      '# Email service endpoint',
      'POLSIA_EMAIL_API_URL=https://polsia.com/api/company-email/send',
      '',
      '# File storage (R2)',
      'POLSIA_R2_BASE_URL=https://polsia.com',
      '',
      '# Port (default: 3000)',
      'PORT=3000',
    ].join('\n'), { name: '.env.example' });

    // ── D. Export README ───────────────────────────────────────────────────
    archive.append([
      '# Sugar Oak Lane — Full Project Export',
      `Exported: ${new Date().toISOString()}`,
      '',
      '## Stack',
      '- Node.js + Express.js (server.js)',
      '- PostgreSQL (Neon) database',
      '- Render deployment (render.yaml)',
      '',
      '## Contents',
      '```',
      'server.js          — Main application (~6,370 lines)',
      'migrate.js         — Migration runner',
      'package.json       — Dependencies + scripts',
      'render.yaml        — Render deployment config',
      'migrations/        — 42 database migration files',
      'public/            — 106 static asset files (HTML, CSS, JS, images)',
      'scripts/           — Utility scripts',
      'schema.sql         — Full DB schema + all data as INSERT statements',
      '.env.example       — All required environment variables',
      '```',
      '',
      '## Setup',
      '',
      '### 1. Install',
      '```bash',
      'npm install',
      '```',
      '',
      '### 2. Configure',
      '```bash',
      'cp .env.example .env',
      '# Edit .env — DATABASE_URL is required at minimum',
      '```',
      '',
      '### 3. Import database',
      '```bash',
      'psql "$DATABASE_URL" < schema.sql',
      '```',
      '',
      '### 4. Start',
      '```bash',
      'npm start',
      '# Server runs on PORT (default 3000)',
      '```',
      '',
      '## Admin',
      'Visit /admin — login with ADMIN_PASSWORD from your .env',
      '',
      '## Assets',
      'Product images are stored externally (Polsia R2 / Cloudflare R2).',
      'Image URLs are included in the schema.sql data export.',
      'To host locally: update the R2 upload routes in server.js to use local disk.',
      '',
      '## Node Version',
      'Node.js 18+ required (see engines field in package.json).',
    ].join('\n'), { name: 'EXPORT-README.md' });

    archive.on('error', err => {
      console.error('[export] Archive error:', err.message);
    });

    await archive.finalize();
    console.log('[export] Download completed successfully');
  } catch (err) {
    console.error('[export] Failed:', err.message);
    // Reset so owner can retry if it was a server error
    exportTokenUsed = false;
    if (!res.headersSent) res.status(500).send('Export failed: ' + err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Catch-all: serve Coming Soon for unmatched Sugar Oak Lane routes
// ─────────────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'sol-coming-soon.html');
  if (fs.existsSync(htmlPath)) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate').type('html').sendFile(htmlPath);
  } else {
    res.redirect('/');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
