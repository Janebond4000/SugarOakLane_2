/**
 * Fix nav links, routes, and add Dahlias across all pages.
 * Addresses issues #1, #2, #3, #6 from the architecture audit.
 */
const fs = require('fs');
const path = require('path');

const HTML_FILES = [
  'public/refund-policy.html',
  'public/sol-about.html',
  'public/sol-blog-post.html',
  'public/sol-blog.html',
  'public/sol-cart.html',
  'public/sol-contact.html',
  'public/sol-delivery.html',
  'public/sol-events.html',
  'public/sol-faq.html',
  'public/sol-home.html',
  'public/sol-product.html',
  'public/sol-shop-flowers.html',
  'public/sol-shop-goods.html',
  'public/sol-shop-nursery.html',
  'public/sol-shop-seeds.html',
  'public/sol-weddings-diy.html',
  'public/sol-weddings.html',
  'public/sol-wholesale.html',
  'public/sol-workshops.html',
  'public/substitution-policy.html',
];

function fixHtml(content) {
  // ── Step 1: Fix href URLs (global, safe) ────────────────────────────────────
  content = content.replace(/href="\/shop\/seeds-bulbs"/g, 'href="/shop?cat=seeds-bulbs"');
  content = content.replace(/href="\/shop\/plant-nursery"/g, 'href="/shop?cat=plant-nursery"');
  content = content.replace(/href="\/shop\/farm-goods-merch"/g, 'href="/shop?cat=farm-goods"');
  content = content.replace(/href="\/shop\/farm-goods"/g, 'href="/shop?cat=farm-goods"');

  // ── Step 2: Fix visible link labels ─────────────────────────────────────────
  content = content.replace(/(href="\/shop\?cat=seeds-bulbs"[^>]*>)Seeds \+ Bulbs(<\/a>)/g, '$1Seeds &amp; Bulbs$2');
  content = content.replace(/(href="\/shop\?cat=seeds-bulbs"[^>]*>)Seeds(<\/a>)/g, '$1Seeds &amp; Bulbs$2');
  content = content.replace(/(href="\/shop\?cat=seeds-bulbs"[^>]*>)Beds &amp; Borders(<\/a>)/g, '$1Seeds &amp; Bulbs$2');
  content = content.replace(/(href="\/shop\?cat=plant-nursery"[^>]*>)Plant Nursery(<\/a>)/g, '$1Plants &amp; Plugs$2');
  content = content.replace(/(href="\/shop\?cat=plant-nursery"[^>]*>)Plants &amp; Nursery(<\/a>)/g, '$1Plants &amp; Plugs$2');
  content = content.replace(/(href="\/shop\?cat=farm-goods"[^>]*>)Farm Goods \+ Merch(<\/a>)/g, '$1Farm Goods + Gifts$2');

  // ── Step 3: Insert Dahlias (where plant-nursery directly precedes farm-goods) ─
  // Compact inline: </a><a href="/shop?cat=farm-goods">
  content = content.replace(
    /(href="\/shop\?cat=plant-nursery">[^<]*<\/a>)(<a href="\/shop\?cat=farm-goods")/g,
    '$1<a href="/shop?cat=dahlias">Dahlias</a>$2'
  );
  // Multi-line: </a>\n  <a href="/shop?cat=farm-goods">
  content = content.replace(
    /(href="\/shop\?cat=plant-nursery">[^<]*<\/a>)\n(\s+)(<a href="\/shop\?cat=farm-goods")/g,
    '$1\n$2<a href="/shop?cat=dahlias">Dahlias</a>\n$2$3'
  );

  // ── Step 4: Fix announcement bar (dahlias, not seeds) ───────────────────────
  content = content.replace(
    /href="\/shop\?cat=seeds-bulbs">shop seeds &amp; bulbs<\/a>/g,
    'href="/shop?cat=dahlias">shop dahlias</a>'
  );

  return content;
}

let totalChanged = 0;
for (const file of HTML_FILES) {
  const filepath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filepath)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }
  const orig = fs.readFileSync(filepath, 'utf8');
  const fixed = fixHtml(orig);
  if (fixed !== orig) {
    fs.writeFileSync(filepath, fixed, 'utf8');
    console.log(`FIXED: ${file}`);
    totalChanged++;
  } else {
    console.log(`  unchanged: ${file}`);
  }
}
console.log(`\nHTML done. ${totalChanged} files updated.`);

// ── Fix server.js ──────────────────────────────────────────────────────────────
const serverPath = path.join(__dirname, '..', 'server.js');
let server = fs.readFileSync(serverPath, 'utf8');
const serverOrig = server;

// 1. Change old shop routes from serveStaticPage to 301 redirects
server = server.replace(
  "app.get('/shop/seeds-bulbs', serveStaticPage('sol-shop-seeds'));",
  "app.get('/shop/seeds-bulbs', (req, res) => res.redirect(301, '/shop?cat=seeds-bulbs'));"
);
server = server.replace(
  "app.get('/shop/plant-nursery', serveStaticPage('sol-shop-nursery'));",
  "app.get('/shop/plant-nursery', (req, res) => res.redirect(301, '/shop?cat=plant-nursery'));"
);
server = server.replace(
  "app.get('/shop/farm-goods', serveStaticPage('sol-shop-goods'));",
  "app.get('/shop/farm-goods', (req, res) => res.redirect(301, '/shop?cat=farm-goods'));"
);
// Fix legacy redirect to also use unified ?cat= pattern
server = server.replace(
  "app.get('/shop/farm-goods-merch', (req, res) => res.redirect(301, '/shop/farm-goods')); // legacy",
  "app.get('/shop/farm-goods-merch', (req, res) => res.redirect(301, '/shop?cat=farm-goods')); // legacy"
);

// 2. Block /index.html direct access (before express.static)
server = server.replace(
  '// Block direct access to admin.html (must go before express.static)',
  '// Block direct access to index.html — redirect to proper homepage\napp.get(\'/index.html\', (req, res) => res.redirect(301, \'/\'));\n\n// Block direct access to admin.html (must go before express.static)'
);

// 3. Fix inline blog links in server.js dynamically generated HTML
server = server.replace(/href="\/shop\/seeds-bulbs"/g, 'href="/shop?cat=seeds-bulbs"');
server = server.replace(/href="\/shop\/plant-nursery"/g, 'href="/shop?cat=plant-nursery"');
server = server.replace(/href="\/shop\/farm-goods"/g, 'href="/shop?cat=farm-goods"');

if (server !== serverOrig) {
  fs.writeFileSync(serverPath, server, 'utf8');
  console.log('FIXED: server.js');
} else {
  console.log('  unchanged: server.js');
}

console.log('\nAll done.');
