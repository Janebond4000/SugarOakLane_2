'use strict';
const fs = require('fs');

const BASE = '/opt/polsia/workspaces/company-52536/agent-30/exec-1008292/sugaroakos/public';

const FILTER_CSS = [
  '',
  '    /* Shop filter sidebar */',
  '    .shop-with-filters { display: grid; grid-template-columns: 220px 1fr; gap: 40px; margin-top: 0; }',
  '    .filter-sidebar { }',
  '    .filter-group { margin-bottom: 28px; }',
  '    .filter-group-title { font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text); margin-bottom: 12px; }',
  '    .filter-option { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; cursor: pointer; }',
  '    .filter-option input { accent-color: var(--green); cursor: pointer; }',
  '    .filter-option label { font-size: 13px; color: var(--text-md); cursor: pointer; }',
  '    .filter-option label:hover { color: var(--text); }',
  '    .filter-clear-btn { background: none; border: 1.5px solid var(--border); padding: 8px 16px; font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-md); cursor: pointer; width: 100%; transition: all 0.2s; }',
  '    .filter-clear-btn:hover { border-color: var(--green); color: var(--green); }',
  '    .filter-product-area { min-width: 0; }',
  '    @media (max-width: 900px) { .shop-with-filters { grid-template-columns: 1fr; } .filter-sidebar { display: none !important; } }'
].join('\n');

const NEW_GRID_HTML = [
  '    <div class="shop-with-filters">',
  '      <aside class="filter-sidebar" id="filter-sidebar" style="display:none">',
  '        <div class="filter-group" id="filter-availability-group">',
  '          <div class="filter-group-title">Availability</div>',
  '          <div id="filter-availability"></div>',
  '        </div>',
  '        <div class="filter-group" id="filter-season-group">',
  '          <div class="filter-group-title">Season</div>',
  '          <div id="filter-season"></div>',
  '        </div>',
  '        <div class="filter-group" id="filter-type-group">',
  '          <div class="filter-group-title">Type</div>',
  '          <div id="filter-type"></div>',
  '        </div>',
  '        <button class="filter-clear-btn" id="filter-clear-btn" onclick="clearFilters()" style="display:none">Clear Filters</button>',
  '      </aside>',
  '      <div class="filter-product-area">',
  '        <div class="product-card-row" id="product-grid">',
  '          <div style="grid-column:1/-1;text-align:center;padding:48px 0;color:var(--text-lt)">Loading products\u2026</div>',
  '        </div>',
  '      </div>',
  '    </div>'
].join('\n');

function buildDynamicJs(category) {
  const lines = [
    '',
    '// -- Dynamic SOL product loading --',
    "const SOL_CATEGORY = '" + category + "';",
    '',
    'let _allProducts = [];',
    'let _activeFilters = { availability: new Set(), season: new Set(), type: new Set() };',
    '',
    'async function loadSolProducts() {',
    '  try {',
    '    const res = await fetch(`/api/sol/products?category=${SOL_CATEGORY}&limit=50`);',
    '    const data = await res.json();',
    "    if (!data.success) throw new Error(data.message);",
    '    _allProducts = data.products || [];',
    '    buildFilters();',
    '    renderProducts(_allProducts);',
    "    if (_allProducts.length > 0) document.getElementById('filter-sidebar').style.display = 'block';",
    '  } catch(e) {',
    "    document.getElementById('product-grid').innerHTML = `<div style=\"grid-column:1/-1;text-align:center;padding:48px 0;color:var(--text-md)\">Could not load products. <a href=\"/contact\" style=\"color:var(--green)\">Contact us</a> to order.</div>`;",
    '  }',
    '}',
    '',
    'function buildFilters() {',
    '  const availSet = new Set(), seasonSet = new Set(), typeSet = new Set();',
    '  _allProducts.forEach(p => {',
    '    availSet.add(p.availability);',
    '    (p.season_tags || []).forEach(t => seasonSet.add(t));',
    '    (p.type_tags || []).forEach(t => typeSet.add(t));',
    '  });',
    '',
    "  const AVAIL_LABELS = {'in_stock':'In Stock','seasonal':'Seasonal','pre_order':'Pre-Order','out_of_stock':'Sold Out'};",
    '',
    '  function buildGroup(containerId, groupId, items, filterKey, labelMap) {',
    "    const el = document.getElementById(containerId);",
    "    const groupEl = document.getElementById(groupId);",
    "    if (!items.size) { if(groupEl) groupEl.style.display='none'; return; }",
    "    el.innerHTML = [...items].map(v => `",
    '      <div class="filter-option">',
    '        <input type="checkbox" id="f-${filterKey}-${v}" value="${v}" onchange="toggleFilter(\'${filterKey}\', \'${v}\', this.checked)" />',
    '        <label for="f-${filterKey}-${v}">${(labelMap&&labelMap[v])||v.replace(/_/g,\' \').replace(/\\b\\w/g,c=>c.toUpperCase())}</label>',
    '      </div>`).join(\'\');',
    '  }',
    "  buildGroup('filter-availability', 'filter-availability-group', availSet, 'availability', AVAIL_LABELS);",
    "  buildGroup('filter-season', 'filter-season-group', seasonSet, 'season', null);",
    "  buildGroup('filter-type', 'filter-type-group', typeSet, 'type', null);",
    '}',
    '',
    'function toggleFilter(key, value, checked) {',
    '  if (checked) _activeFilters[key].add(value);',
    '  else _activeFilters[key].delete(value);',
    '  const hasFilters = Object.values(_activeFilters).some(s => s.size > 0);',
    "  document.getElementById('filter-clear-btn').style.display = hasFilters ? 'block' : 'none';",
    '  applyFilters();',
    '}',
    '',
    'function clearFilters() {',
    '  _activeFilters = { availability: new Set(), season: new Set(), type: new Set() };',
    "  document.querySelectorAll('.filter-option input').forEach(cb => cb.checked = false);",
    "  document.getElementById('filter-clear-btn').style.display = 'none';",
    '  renderProducts(_allProducts);',
    '}',
    '',
    'function applyFilters() {',
    '  let filtered = _allProducts;',
    '  if (_activeFilters.availability.size) filtered = filtered.filter(p => _activeFilters.availability.has(p.availability));',
    "  if (_activeFilters.season.size) filtered = filtered.filter(p => (p.season_tags||[]).some(t => _activeFilters.season.has(t)));",
    "  if (_activeFilters.type.size) filtered = filtered.filter(p => (p.type_tags||[]).some(t => _activeFilters.type.has(t)));",
    '  renderProducts(filtered);',
    '}',
    '',
    "const AVAIL_COLORS = {'in_stock':'#2d6a2d','seasonal':'#8a5a2a','out_of_stock':'#9a9490','pre_order':'#8a5a2a'};",
    '',
    'function renderProducts(products) {',
    "  const grid = document.getElementById('product-grid');",
    '  if (!products.length) {',
    "    grid.innerHTML = `<div style=\"grid-column:1/-1;text-align:center;padding:48px 0;color:var(--text-md)\">No products match your filters. <button onclick=\"clearFilters()\" style=\"color:var(--green);background:none;border:none;cursor:pointer;font-weight:600;font-family:inherit\">Clear filters</button></div>`;",
    '    return;',
    '  }',
    '  grid.innerHTML = products.map(p => {',
    '    const imgs = Array.isArray(p.images) ? p.images : (typeof p.images===\'string\' ? JSON.parse(p.images||\'[]\') : []);',
    '    const imgHtml = imgs[0]',
    '      ? `<img src="${imgs[0]}" alt="${p.name}" style="width:100%;height:100%;object-fit:cover" loading="lazy" />`',
    '      : `<div style="width:100%;height:100%;background:var(--linen-dk)"></div>`;',
    "    const avail = p.availability || 'in_stock';",
    "    const isOos = avail === 'out_of_stock';",
    '    return `',
    '      <div class="product-card">',
    '        <a href="/shop/product/${p.slug}" style="display:block;text-decoration:none;color:inherit">',
    '          <div class="product-card-img">${imgHtml}</div>',
    '        </a>',
    '        <div class="product-card-body">',
    '          <span class="product-card-tag" style="color:${AVAIL_COLORS[avail]||\'#3A5A40\'}">${avail.replace(/_/g,\' \').replace(/\\b\\w/g,c=>c.toUpperCase())}</span>',
    '          <a href="/shop/product/${p.slug}" style="text-decoration:none;color:inherit">',
    '            <div class="product-card-title">${p.name}</div>',
    '          </a>',
    '          <p class="product-card-desc">${p.short_description||\'\'}</p>',
    '          <div class="product-card-price">${p.price_label||(\'$\'+parseFloat(p.price).toFixed(2))}</div>',
    "          <a href=\"/shop/product/${p.slug}\" class=\"product-card-btn\">${isOos ? 'Sold Out' : 'View Product \u2192'}</a>",
    '        </div>',
    '      </div>`;',
    '  }).join(\'\');',
    '}',
    '',
    'loadSolProducts();'
  ];
  return lines.join('\n');
}

function replaceGridDiv(html, gridClass) {
  const styleEnd = html.lastIndexOf('</style>');
  const searchFrom = styleEnd !== -1 ? styleEnd : 0;
  const pattern = '<div class="' + gridClass;
  const pos = html.indexOf(pattern, searchFrom);
  if (pos === -1) return { html, replaced: false };
  let depth = 0;
  let i = pos;
  let gridEnd = -1;
  while (i < html.length) {
    if (html.slice(i, i + 4) === '<div') {
      depth++;
      i += 4;
    } else if (html.slice(i, i + 6) === '</div>') {
      depth--;
      if (depth === 0) {
        gridEnd = i + 6;
        break;
      }
      i += 6;
    } else {
      i++;
    }
  }
  if (gridEnd === -1) return { html, replaced: false };
  return { html: html.slice(0, pos) + NEW_GRID_HTML + html.slice(gridEnd), replaced: true };
}

const FILES = [
  {
    name: 'sol-shop-flowers.html',
    category: 'flower-shop',
    gridClass: 'product-card-row',
    oldSubtitle: 'Product availability changes with the seasons. The below reflects our standard offerings \u2014 contact us for current availability and custom requests.',
    newSubtitle: 'Farm-grown bouquets and arrangements. Click any product to view details and add to cart.',
  },
  {
    name: 'sol-shop-seeds.html',
    category: 'seeds-bulbs',
    gridClass: 'product-grid',
    oldSubtitle: 'Curated for the home cutting garden. All open-pollinated or heirloom varieties. These are the crops that fill our summer bouquets \u2014 now available for your own rows.',
    newSubtitle: 'Open-pollinated and heirloom seeds for your cutting garden. Click any product to view details and add to cart.',
  },
  {
    name: 'sol-shop-nursery.html',
    category: 'plant-nursery',
    gridClass: 'product-grid product-grid-4',
    oldSubtitle: 'Seasonal availability varies. Check with us before visiting for current stock. All plants are grown on-site in Loganville.',
    newSubtitle: 'Locally grown plants for your garden. Click any product to view details and add to cart.',
  },
  {
    name: 'sol-shop-goods.html',
    category: 'farm-goods',
    gridClass: 'product-grid',
    oldSubtitle: 'Seasonal goods made in small batches from farm-grown botanicals. Stock varies \u2014 inquire about availability for larger orders or gifts.',
    newSubtitle: 'Farm-made goods from our botanicals. Click any product to view details and add to cart.',
  },
];

const CART_OLD = '<button class="header-icon-btn" aria-label="Cart">';
const CART_NEW = '<button class="header-icon-btn" data-sol-cart-btn aria-label="Cart" style="position:relative">';
const STYLE_CLOSE = '  </style>';
const SCRIPT_CLOSE = '</script>';

for (const cfg of FILES) {
  console.log('\nProcessing ' + cfg.name + '...');
  const filepath = BASE + '/' + cfg.name;
  let html = fs.readFileSync(filepath, 'utf8');
  const origLen = html.length;

  // 1. Cart button
  if (html.includes(CART_OLD)) {
    html = html.replace(CART_OLD, CART_NEW);
    console.log('  [OK] Cart button updated');
  } else {
    console.log('  [SKIP] Cart button not found');
  }

  // 2. Filter CSS
  if (!html.includes('shop-with-filters')) {
    let idx = html.indexOf(STYLE_CLOSE);
    if (idx === -1) idx = html.indexOf('</style>');
    if (idx !== -1) {
      html = html.slice(0, idx) + FILTER_CSS + '\n' + STYLE_CLOSE + html.slice(idx + STYLE_CLOSE.length);
      console.log('  [OK] Filter CSS injected');
    } else {
      console.log('  [WARN] </style> not found');
    }
  } else {
    console.log('  [SKIP] Filter CSS already present');
  }

  // 3. sol-cart.js tag
  if (!html.includes('/js/sol-cart.js')) {
    // Find last bare <script> line
    let lastPos = -1;
    let searchIdx = 0;
    const target = '\n<script>';
    while (true) {
      const found = html.indexOf(target, searchIdx);
      if (found === -1) break;
      lastPos = found;
      searchIdx = found + 1;
    }
    if (lastPos !== -1) {
      html = html.slice(0, lastPos) + '\n<script src="/js/sol-cart.js"></script>' + html.slice(lastPos);
      console.log('  [OK] sol-cart.js script tag added');
    } else {
      console.log('  [WARN] bare <script> not found');
    }
  } else {
    console.log('  [SKIP] sol-cart.js already present');
  }

  // 4. Replace static product grid
  const result = replaceGridDiv(html, cfg.gridClass);
  html = result.html;
  if (result.replaced) {
    console.log('  [OK] Static product grid replaced');
  } else {
    console.log('  [WARN] Grid div not found for class: ' + cfg.gridClass);
  }

  // 5. Update subtitle
  if (html.includes(cfg.oldSubtitle)) {
    html = html.replace(cfg.oldSubtitle, cfg.newSubtitle);
    console.log('  [OK] Section subtitle updated');
  } else {
    console.log('  [SKIP] Old subtitle not found');
  }

  // 6. Dynamic JS
  if (!html.includes('loadSolProducts')) {
    const lastClose = html.lastIndexOf(SCRIPT_CLOSE);
    if (lastClose !== -1) {
      const dynJs = buildDynamicJs(cfg.category);
      html = html.slice(0, lastClose) + dynJs + '\n' + SCRIPT_CLOSE + html.slice(lastClose + SCRIPT_CLOSE.length);
      console.log('  [OK] Dynamic JS injected (category: ' + cfg.category + ')');
    } else {
      console.log('  [WARN] </script> not found');
    }
  } else {
    console.log('  [SKIP] Dynamic JS already present');
  }

  fs.writeFileSync(filepath, html, 'utf8');
  console.log('  [SAVED] ' + cfg.name + ' (' + origLen + ' -> ' + html.length + ' chars)');
}

console.log('\nAll done.');
