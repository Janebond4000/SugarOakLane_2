const fs = require('fs');
const filePath = '/opt/polsia/workspaces/company-52536/agent-30/exec-1171561/sugaroakos/public/admin.html';

let html = fs.readFileSync(filePath, 'utf8');
const originalLen = html.length;

// ============================================================
// CHANGE 1: Replace product edit modal HTML
// ============================================================

const oldModal = `<!-- ==================== PRODUCT EDIT MODAL ==================== -->
<div id="product-edit-modal" class="modal-overlay" onclick="closeProductModalOutside(event)">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-screen overflow-y-auto" onclick="event.stopPropagation()">
    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
      <h3 id="prod-modal-title" class="font-bold text-gray-800 text-lg">Add Product</h3>
      <button onclick="closeProductModal()" class="text-gray-400 hover:text-gray-600 p-1"><i class="fa-solid fa-times"></i></button>
    </div>
    <div class="px-6 py-5 space-y-4">
      <input type="hidden" id="prod-edit-id" value="">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name *</label>
          <input type="text" id="prod-name" placeholder="Product name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Slug *</label>
          <input type="text" id="prod-slug" placeholder="product-url-slug" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Category</label>
          <select id="prod-category" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
            <option value="flower-shop">Flower Shop</option>
            <option value="seeds-bulbs">Seeds &amp; Bulbs</option>
            <option value="plant-nursery">Plants &amp; Plugs</option>
            <option value="farm-goods">Farm Goods</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Availability</label>
          <select id="prod-availability" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
            <option value="in_stock">In Stock</option>
            <option value="out_of_stock">Out of Stock</option>
            <option value="pre_order">Pre-Order</option>
            <option value="seasonal">Seasonal</option>
          </select>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Price ($)</label>
          <input type="number" id="prod-price" placeholder="24.99" step="0.01" min="0" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Price Label (if no fixed price)</label>
          <input type="text" id="prod-price-label" placeholder="from $12 / stem" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Image URL</label>
        <input type="text" id="prod-image-url" placeholder="https://images.unsplash.com/…" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label>
        <textarea id="prod-description" rows="3" placeholder="Product description…" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300"></textarea>
      </div>
      <label class="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" id="prod-featured" class="w-4 h-4 rounded accent-green-700">
        <span class="text-sm text-gray-700">Featured on homepage</span>
      </label>
    </div>
    <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
      <button onclick="closeProductModal()" class="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium hover:bg-white">Cancel</button>
      <button onclick="saveProduct()" class="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800"><i class="fa-solid fa-save mr-1.5"></i>Save Product</button>
    </div>
  </div>
</div>`;

const newModal = `<!-- ==================== PRODUCT EDIT MODAL ==================== -->
<div id="product-edit-modal" class="modal-overlay" onclick="closeProductModalOutside(event)">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden" style="max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
    <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
      <h3 id="prod-modal-title" class="font-bold text-gray-800 text-lg">Add Product</h3>
      <button onclick="closeProductModal()" class="text-gray-400 hover:text-gray-600 p-1"><i class="fa-solid fa-times"></i></button>
    </div>
    <div class="px-6 py-5 space-y-5">
      <input type="hidden" id="prod-edit-id" value="">

      <!-- Name + Slug -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Name *</label>
          <input type="text" id="prod-name" placeholder="Product name" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Slug *</label>
          <input type="text" id="prod-slug" placeholder="product-url-slug" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
      </div>

      <!-- Categories (multi-select checkboxes) -->
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Categories <span class="text-gray-400 font-normal normal-case">(select all that apply)</span></label>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-green-50 hover:border-green-300 transition-colors">
            <input type="checkbox" class="prod-cat-check accent-green-700 w-4 h-4" value="flower-shop">
            <span class="text-sm text-gray-700">🌸 Flower Shop</span>
          </label>
          <label class="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-green-50 hover:border-green-300 transition-colors">
            <input type="checkbox" class="prod-cat-check accent-green-700 w-4 h-4" value="seeds-bulbs">
            <span class="text-sm text-gray-700">🌱 Seeds &amp; Bulbs</span>
          </label>
          <label class="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-green-50 hover:border-green-300 transition-colors">
            <input type="checkbox" class="prod-cat-check accent-green-700 w-4 h-4" value="plant-nursery">
            <span class="text-sm text-gray-700">🪴 Plants &amp; Plugs</span>
          </label>
          <label class="flex items-center gap-2 p-2.5 border border-gray-200 rounded-lg cursor-pointer hover:bg-green-50 hover:border-green-300 transition-colors">
            <input type="checkbox" class="prod-cat-check accent-green-700 w-4 h-4" value="farm-goods">
            <span class="text-sm text-gray-700">🏡 Farm Goods</span>
          </label>
        </div>
      </div>

      <!-- Stock Status (3-button toggle) -->
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Stock Status</label>
        <div class="flex gap-2" id="stock-status-group">
          <button type="button" class="stock-status-btn flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 border-green-500 bg-green-50 text-green-700 transition-colors" data-value="in_stock" onclick="selectStockStatus('in_stock')">
            <i class="fa-solid fa-circle-check mr-1.5"></i>In Stock
          </button>
          <button type="button" class="stock-status-btn flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 border-gray-200 bg-white text-gray-600 transition-colors" data-value="low_stock" onclick="selectStockStatus('low_stock')">
            <i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Low Stock
          </button>
          <button type="button" class="stock-status-btn flex-1 py-2 px-3 text-sm font-medium rounded-lg border-2 border-gray-200 bg-white text-gray-600 transition-colors" data-value="sold_out" onclick="selectStockStatus('sold_out')">
            <i class="fa-solid fa-ban mr-1.5"></i>Sold Out
          </button>
        </div>
        <input type="hidden" id="prod-stock-status" value="in_stock">
      </div>

      <!-- Price row -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Price ($)</label>
          <div class="relative">
            <span class="absolute left-3 top-2.5 text-gray-400 text-sm">$</span>
            <input type="number" id="prod-price" placeholder="24.99" step="0.01" min="0" class="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
          </div>
        </div>
        <div>
          <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Price Label</label>
          <input type="text" id="prod-price-label" placeholder="from $12 / stem" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300">
        </div>
      </div>

      <!-- Product Photos (up to 5) -->
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Product Photos <span class="text-gray-400 font-normal normal-case">(up to 5 image URLs)</span></label>
        <div class="space-y-2" id="prod-photos-list">
          <div class="prod-photo-row flex items-center gap-2">
            <span class="text-xs text-gray-400 w-5 flex-shrink-0 text-center">1</span>
            <input type="text" class="prod-photo-url flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300" placeholder="https://… (main photo)">
            <button type="button" onclick="removePhotoRow(this)" class="text-gray-300 hover:text-red-400 px-1 flex-shrink-0"><i class="fa-solid fa-times"></i></button>
          </div>
        </div>
        <button type="button" onclick="addPhotoRow()" id="prod-add-photo-btn" class="mt-2 text-xs text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-50 font-medium flex items-center gap-1.5">
          <i class="fa-solid fa-plus"></i> Add another photo
        </button>
      </div>

      <!-- Description -->
      <div>
        <label class="block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide">Description</label>
        <textarea id="prod-description" rows="3" placeholder="Product description…" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300"></textarea>
      </div>

      <!-- Featured + Visible row -->
      <div class="flex items-center gap-6">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="prod-featured" class="w-4 h-4 rounded accent-green-700">
          <span class="text-sm text-gray-700">Featured on homepage</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" id="prod-active" checked class="w-4 h-4 rounded accent-green-700">
          <span class="text-sm text-gray-700">Visible in shop</span>
        </label>
      </div>
    </div>
    <div class="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between sticky bottom-0">
      <button onclick="closeProductModal()" class="border border-gray-200 text-gray-600 px-5 py-2 rounded-lg text-sm font-medium hover:bg-white">Cancel</button>
      <button onclick="saveProduct()" class="bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-green-800"><i class="fa-solid fa-save mr-1.5"></i>Save Product</button>
    </div>
  </div>
</div>`;

const modal1Idx = html.indexOf(oldModal);
console.log('Change 1 (modal HTML): found at index', modal1Idx);
if (modal1Idx === -1) {
  const anchor = 'id="product-edit-modal" class="modal-overlay"';
  const anchorIdx = html.indexOf(anchor);
  console.error('  FAILED: Could not locate full old modal. Anchor "' + anchor + '" found at:', anchorIdx);
  process.exit(1);
}
html = html.replace(oldModal, newModal);
console.log('Change 1 applied.');

// ============================================================
// CHANGE 2a: Replace openProductModal (and add helper functions before it)
// ============================================================

const oldOpenModal = `function openProductModal(id) {
  const p = id ? _adminProducts.find(x => x.id === id) : null;
  const modal = document.getElementById('product-edit-modal');
  if (!modal) { alert('Product edit modal not found.'); return; }
  document.getElementById('prod-modal-title').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('prod-edit-id').value = p ? p.id : '';
  document.getElementById('prod-name').value = p ? p.name : '';
  document.getElementById('prod-slug').value = p ? p.slug : '';
  document.getElementById('prod-category').value = p ? p.sol_category : 'flower-shop';
  document.getElementById('prod-price').value = p ? (p.price||'') : '';
  document.getElementById('prod-price-label').value = p ? (p.price_label||'') : '';
  document.getElementById('prod-description').value = p ? (p.description||'') : '';
  document.getElementById('prod-image-url').value = p && Array.isArray(p.images) && p.images.length ? p.images[0] : '';
  document.getElementById('prod-availability').value = p ? (p.availability||'in_stock') : 'in_stock';
  document.getElementById('prod-featured').checked = p ? !!p.is_featured : false;
  modal.classList.add('open');
}`;

const newOpenModal = `function selectStockStatus(val) {
  document.getElementById('prod-stock-status').value = val;
  document.querySelectorAll('.stock-status-btn').forEach(btn => {
    const active = btn.dataset.value === val;
    btn.classList.toggle('border-green-500', active);
    btn.classList.toggle('bg-green-50', active);
    btn.classList.toggle('text-green-700', active);
    btn.classList.toggle('border-gray-200', !active);
    btn.classList.toggle('bg-white', !active);
    btn.classList.toggle('text-gray-600', !active);
  });
}

function addPhotoRow() {
  const list = document.getElementById('prod-photos-list');
  const rows = list.querySelectorAll('.prod-photo-row');
  if (rows.length >= 5) return;
  const n = rows.length + 1;
  const div = document.createElement('div');
  div.className = 'prod-photo-row flex items-center gap-2';
  div.innerHTML = \`<span class="text-xs text-gray-400 w-5 flex-shrink-0 text-center">\${n}</span><input type="text" class="prod-photo-url flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300" placeholder="https://…"><button type="button" onclick="removePhotoRow(this)" class="text-gray-300 hover:text-red-400 px-1 flex-shrink-0"><i class="fa-solid fa-times"></i></button>\`;
  list.appendChild(div);
  // Hide add button if 5 rows
  if (list.querySelectorAll('.prod-photo-row').length >= 5) {
    document.getElementById('prod-add-photo-btn').style.display = 'none';
  }
}

function removePhotoRow(btn) {
  const list = document.getElementById('prod-photos-list');
  if (list.querySelectorAll('.prod-photo-row').length <= 1) return; // keep at least 1
  btn.closest('.prod-photo-row').remove();
  // Re-number
  list.querySelectorAll('.prod-photo-row').forEach((row, i) => {
    row.querySelector('span').textContent = i + 1;
  });
  document.getElementById('prod-add-photo-btn').style.display = '';
}

function openProductModal(id) {
  const p = id ? _adminProducts.find(x => x.id === id) : null;
  const modal = document.getElementById('product-edit-modal');
  if (!modal) { alert('Product edit modal not found.'); return; }
  document.getElementById('prod-modal-title').textContent = p ? 'Edit Product' : 'Add Product';
  document.getElementById('prod-edit-id').value = p ? p.id : '';
  document.getElementById('prod-name').value = p ? p.name : '';
  document.getElementById('prod-slug').value = p ? p.slug : '';
  document.getElementById('prod-price').value = p ? (p.price||'') : '';
  document.getElementById('prod-price-label').value = p ? (p.price_label||'') : '';
  document.getElementById('prod-description').value = p ? (p.description||'') : '';
  document.getElementById('prod-featured').checked = p ? !!p.is_featured : false;
  document.getElementById('prod-active').checked = p ? (p.is_active !== false) : true;

  // Multi-category checkboxes
  const cats = p && Array.isArray(p.categories) && p.categories.length ? p.categories
    : (p && p.sol_category ? [p.sol_category] : []);
  document.querySelectorAll('.prod-cat-check').forEach(cb => {
    cb.checked = cats.includes(cb.value);
  });

  // Stock status
  selectStockStatus(p ? (p.stock_status || 'in_stock') : 'in_stock');

  // Multi-photo (up to 5)
  const list = document.getElementById('prod-photos-list');
  const images = p && Array.isArray(p.images) ? p.images : [];
  // Clear and rebuild rows
  list.innerHTML = '';
  const numRows = Math.max(1, Math.min(5, images.length || 1));
  for (let i = 0; i < numRows; i++) {
    const div = document.createElement('div');
    div.className = 'prod-photo-row flex items-center gap-2';
    div.innerHTML = \`<span class="text-xs text-gray-400 w-5 flex-shrink-0 text-center">\${i+1}</span><input type="text" class="prod-photo-url flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-300" placeholder="https://… \${i===0?'(main photo)':''}"><button type="button" onclick="removePhotoRow(this)" class="text-gray-300 hover:text-red-400 px-1 flex-shrink-0"><i class="fa-solid fa-times"></i></button>\`;
    list.appendChild(div);
    list.querySelectorAll('.prod-photo-url')[i].value = images[i] || '';
  }
  document.getElementById('prod-add-photo-btn').style.display = numRows >= 5 ? 'none' : '';

  modal.classList.add('open');
}`;

const open2Idx = html.indexOf(oldOpenModal);
console.log('Change 2a (openProductModal): found at index', open2Idx);
if (open2Idx === -1) {
  console.error('  FAILED: Could not locate openProductModal function');
  const debugIdx = html.indexOf('function openProductModal');
  console.error('  "function openProductModal" found at:', debugIdx);
  if (debugIdx !== -1) {
    console.error('  Context around it:\n', html.substring(debugIdx, debugIdx + 500));
  }
  process.exit(1);
}
html = html.replace(oldOpenModal, newOpenModal);
console.log('Change 2a applied.');

// ============================================================
// CHANGE 2b: Replace saveProduct function
// ============================================================

const oldSaveProduct = `async function saveProduct() {
  const apiKey = getApiKey();
  const id = document.getElementById('prod-edit-id').value;
  const imageUrl = document.getElementById('prod-image-url').value.trim();
  const body = {
    name: document.getElementById('prod-name').value.trim(),
    slug: document.getElementById('prod-slug').value.trim(),
    sol_category: document.getElementById('prod-category').value,
    price: document.getElementById('prod-price').value || null,
    price_label: document.getElementById('prod-price-label').value.trim() || null,
    description: document.getElementById('prod-description').value.trim() || null,
    images: imageUrl ? [imageUrl] : [],
    availability: document.getElementById('prod-availability').value,
    is_featured: document.getElementById('prod-featured').checked
  };
  if (!body.name || !body.slug) { alert('Name and slug are required.'); return; }
  try {
    const r = await fetch(id ? \`/api/admin/sol-products/\${id}\` : '/api/admin/sol-products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);
    closeProductModal();
    loadAdminProducts();
    showToast(id ? 'Product updated!' : 'Product added!', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}`;

const newSaveProduct = `async function saveProduct() {
  const apiKey = getApiKey();
  const id = document.getElementById('prod-edit-id').value;
  // Collect multi-category
  const categories = Array.from(document.querySelectorAll('.prod-cat-check:checked')).map(cb => cb.value);
  if (!categories.length) { showToast('Select at least one category', 'error'); return; }
  // Collect photos (up to 5, filter empty)
  const images = Array.from(document.querySelectorAll('.prod-photo-url'))
    .map(el => el.value.trim()).filter(Boolean).slice(0, 5);
  const body = {
    name: document.getElementById('prod-name').value.trim(),
    slug: document.getElementById('prod-slug').value.trim(),
    categories,
    sol_category: categories[0],
    price: document.getElementById('prod-price').value || null,
    price_label: document.getElementById('prod-price-label').value.trim() || null,
    description: document.getElementById('prod-description').value.trim() || null,
    images,
    stock_status: document.getElementById('prod-stock-status').value,
    availability: document.getElementById('prod-stock-status').value === 'sold_out' ? 'out_of_stock' : 'in_stock',
    is_featured: document.getElementById('prod-featured').checked,
    is_active: document.getElementById('prod-active').checked
  };
  if (!body.name || !body.slug) { showToast('Name and slug are required', 'error'); return; }
  try {
    const r = await fetch(id ? \`/api/admin/sol-products/\${id}\` : '/api/admin/sol-products', {
      method: id ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!d.success) throw new Error(d.message);
    closeProductModal();
    loadAdminProducts();
    showToast(id ? 'Product updated!' : 'Product added!', 'success');
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}`;

const save2Idx = html.indexOf(oldSaveProduct);
console.log('Change 2b (saveProduct): found at index', save2Idx);
if (save2Idx === -1) {
  console.error('  FAILED: Could not locate saveProduct function');
  const debugIdx = html.indexOf('async function saveProduct');
  console.error('  "async function saveProduct" found at:', debugIdx);
  if (debugIdx !== -1) {
    console.error('  Context around it:\n', html.substring(debugIdx, debugIdx + 500));
  }
  process.exit(1);
}
html = html.replace(oldSaveProduct, newSaveProduct);
console.log('Change 2b applied.');

// ============================================================
// Write and report
// ============================================================
fs.writeFileSync(filePath, html);

const newLen = html.length;
const lineCount = html.split('\n').length;
console.log('\n=== Summary ===');
console.log('Change 1 (modal HTML):          FOUND and replaced');
console.log('Change 2a (openProductModal):   FOUND and replaced');
console.log('Change 2b (saveProduct):        FOUND and replaced');
console.log('Original file size:', originalLen, 'chars');
console.log('New file size:     ', newLen, 'chars');
console.log('Characters changed:', newLen - originalLen, '(net delta)');
console.log('Final line count:  ', lineCount);
