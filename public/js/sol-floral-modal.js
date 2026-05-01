/**
 * sol-floral-modal.js — Floral Arrangement Checkout Extension v2
 *
 * Intercepts "Add to Cart" for floral products and opens a required
 * delivery details + structured add-ons modal before the item hits the cart.
 *
 * Usage:
 *   SolFloralModal.open(product, qty, onConfirm)
 *   - product: product object from API (includes floral_has_vase)
 *   - qty: quantity selected
 *   - onConfirm(item): called with complete cart item on submit
 *
 * Include AFTER sol-cart.js on product pages.
 */
(function () {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────────── */

  const LOCATION_TYPES = ['Home', 'Business', 'School', 'Hospital', 'Funeral Home'];

  const GROUP_META = {
    enhance:  { label: 'Enhance Your Gift',  icon: '🎀' },
    sweet:    { label: 'Sweet Additions',    icon: '🍬' },
    wellness: { label: 'Wellness',           icon: '✨' },
    vase:     { label: 'Vase Options',       icon: '🌸' },
  };

  /* ── CSS ─────────────────────────────────────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById('sol-floral-modal-css')) return;
    const style = document.createElement('style');
    style.id = 'sol-floral-modal-css';
    style.textContent = `
      /* ── Overlay ─────────────────────────────────────────────────── */
      #sol-floral-overlay {
        position:fixed;inset:0;z-index:10000;
        background:rgba(0,0,0,0.48);
        display:flex;align-items:flex-start;justify-content:center;
        padding:20px 16px 40px;overflow-y:auto;
        opacity:0;transition:opacity 0.22s ease;pointer-events:none;
      }
      #sol-floral-overlay.open{opacity:1;pointer-events:all;}

      /* ── Dialog ───────────────────────────────────────────────────── */
      #sol-floral-dialog{
        background:#fff;border-radius:4px;width:100%;max-width:600px;
        box-shadow:0 20px 60px rgba(0,0,0,0.18);
        transform:translateY(24px);transition:transform 0.22s ease;
        margin:auto 0;overflow:hidden;
      }
      #sol-floral-overlay.open #sol-floral-dialog{transform:translateY(0);}

      /* ── Header ───────────────────────────────────────────────────── */
      .sfm-header{
        padding:22px 28px 18px;
        background:linear-gradient(135deg,#fdf2f8 0%,#fef9f0 100%);
        border-bottom:1px solid #f3d8ea;
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
      }
      .sfm-eyebrow{font-size:10px;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;color:#c0789a;margin-bottom:4px;}
      .sfm-title{font-family:'Cormorant Garamond',serif;font-size:22px;font-weight:600;color:#2d1a1a;line-height:1.25;}
      .sfm-subtitle{font-size:12px;color:#888;margin-top:4px;line-height:1.5;}
      .sfm-close-btn{background:none;border:none;cursor:pointer;color:#999;padding:4px;line-height:1;flex-shrink:0;transition:color 0.15s;}
      .sfm-close-btn:hover{color:#333;}

      /* ── Body ─────────────────────────────────────────────────────── */
      .sfm-body{padding:24px 28px;}

      /* ── Section headings ─────────────────────────────────────────── */
      .sfm-section-label{
        font-size:10px;font-weight:700;letter-spacing:0.16em;
        text-transform:uppercase;color:#a08080;
        margin:24px 0 12px;padding-bottom:6px;
        border-bottom:1px solid #f0e8e8;
      }
      .sfm-section-label:first-child{margin-top:0;}

      /* ── Addon section headers ─────────────────────────────────────── */
      .sfm-addon-section{margin-bottom:4px;}
      .sfm-addon-section-heading{
        display:flex;align-items:center;gap:6px;
        font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;
        color:#8a6060;margin:20px 0 10px;
      }
      .sfm-addon-section-heading:first-of-type{margin-top:0;}

      /* ── Form fields ──────────────────────────────────────────────── */
      .sfm-field{margin-bottom:16px;}
      .sfm-label{display:block;font-size:11px;font-weight:600;color:#555;margin-bottom:5px;letter-spacing:0.04em;}
      .sfm-label .sfm-req{color:#c0789a;margin-left:2px;}
      .sfm-input,.sfm-select,.sfm-textarea{
        width:100%;padding:10px 13px;border:1.5px solid #e0d0d0;border-radius:3px;
        background:#fff;font-size:14px;font-family:inherit;color:#2d1a1a;
        transition:border-color 0.18s,box-shadow 0.18s;box-sizing:border-box;
      }
      .sfm-input:focus,.sfm-select:focus,.sfm-textarea:focus{
        outline:none;border-color:#c0789a;box-shadow:0 0 0 3px rgba(192,120,154,0.12);
      }
      .sfm-input.error,.sfm-select.error,.sfm-textarea.error{
        border-color:#e74c3c;box-shadow:0 0 0 3px rgba(231,76,60,0.10);
      }
      .sfm-error-msg{font-size:11px;color:#e74c3c;margin-top:4px;display:none;}
      .sfm-error-msg.show{display:block;}
      .sfm-textarea{resize:vertical;min-height:72px;}
      .sfm-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
      .sfm-grid-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
      .sfm-input[type="date"]::-webkit-calendar-picker-indicator{opacity:0.5;cursor:pointer;}

      /* ── Regular addon cards grid ────────────────────────────────── */
      .sfm-addons-grid{
        display:grid;grid-template-columns:repeat(auto-fill,minmax(128px,1fr));gap:10px;
      }
      .sfm-addon-card{
        border:1.5px solid #e8d8d8;border-radius:3px;padding:10px;
        cursor:pointer;transition:border-color 0.18s,background 0.18s;
        text-align:center;user-select:none;position:relative;
      }
      .sfm-addon-card:hover{border-color:#c0789a;background:#fdf2f8;}
      .sfm-addon-card.selected{border-color:#c0789a;background:#fdf2f8;}
      .sfm-addon-check{
        position:absolute;top:6px;right:6px;
        width:16px;height:16px;border-radius:50%;
        background:#c0789a;display:none;align-items:center;justify-content:center;
      }
      .sfm-addon-card.selected .sfm-addon-check{display:flex;}
      .sfm-addon-check svg{width:9px;height:9px;stroke:#fff;}
      .sfm-addon-name{font-size:12px;font-weight:600;color:#2d1a1a;line-height:1.3;margin-top:2px;}
      .sfm-addon-price{font-size:11px;color:#a08080;margin-top:2px;}

      /* ── Quantity row (balloons) ─────────────────────────────────── */
      .sfm-addon-qty-row{
        display:none;align-items:center;justify-content:center;
        gap:6px;margin-top:6px;
      }
      .sfm-addon-card.selected .sfm-addon-qty-row{display:flex;}
      .sfm-addon-qty-btn{
        background:#f5e8ee;border:none;border-radius:50%;
        width:22px;height:22px;cursor:pointer;font-size:14px;color:#c0789a;
        display:flex;align-items:center;justify-content:center;
        font-weight:700;line-height:1;transition:background 0.15s;
      }
      .sfm-addon-qty-btn:hover{background:#ecd0dc;}
      .sfm-addon-qty-val{font-size:13px;font-weight:700;color:#2d1a1a;min-width:16px;text-align:center;}

      /* ── Inline option select ─────────────────────────────────────── */
      .sfm-addon-option-row{
        display:none;margin-top:8px;
      }
      .sfm-addon-card.selected .sfm-addon-option-row{display:block;}
      .sfm-addon-option-select{
        width:100%;padding:5px 7px;
        border:1.5px solid #e0c8d8;border-radius:3px;
        font-size:11px;color:#2d1a1a;background:#fff;
        cursor:pointer;
      }
      .sfm-addon-option-select:focus{outline:none;border-color:#c0789a;}
      .sfm-addon-option-select.error{border-color:#e74c3c;}

      /* ── Radio-group rows (tiered sizes) ────────────────────────── */
      .sfm-radio-group{margin-bottom:14px;}
      .sfm-radio-group-label{
        font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
        color:#b08888;margin-bottom:7px;display:block;
      }
      .sfm-radio-pills{display:flex;gap:8px;flex-wrap:wrap;}
      .sfm-radio-pill{
        border:1.5px solid #e0d0d0;border-radius:3px;padding:8px 14px;
        cursor:pointer;transition:border-color 0.18s,background 0.18s,color 0.18s;
        user-select:none;text-align:center;
      }
      .sfm-radio-pill:hover{border-color:#c0789a;background:#fdf2f8;}
      .sfm-radio-pill.selected{border-color:#c0789a;background:#fdf2f8;color:#a05878;}
      .sfm-pill-name{font-size:12px;font-weight:600;color:inherit;}
      .sfm-pill-price{font-size:11px;color:#a08080;margin-top:1px;}
      .sfm-radio-pill.selected .sfm-pill-price{color:#c0789a;}

      /* ── Footer ───────────────────────────────────────────────────── */
      .sfm-footer{
        padding:16px 28px 22px;background:#fdf9f9;border-top:1px solid #f0e8e8;
        display:flex;flex-direction:column;gap:10px;
      }
      .sfm-footer-total{
        display:flex;align-items:center;justify-content:space-between;
        font-size:13px;color:#555;
      }
      .sfm-footer-total-label{font-weight:600;letter-spacing:0.04em;}
      .sfm-footer-total-val{
        font-family:'Cormorant Garamond',serif;
        font-size:20px;font-weight:700;color:#2d1a1a;
      }
      .sfm-footer-actions{display:flex;gap:12px;align-items:center;justify-content:flex-end;}
      .sfm-cancel-btn{
        background:none;border:1.5px solid #d0c0c0;padding:11px 22px;border-radius:3px;
        font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;
        color:#888;cursor:pointer;transition:border-color 0.18s,color 0.18s;
      }
      .sfm-cancel-btn:hover{border-color:#999;color:#555;}
      .sfm-submit-btn{
        background:#c0789a;border:none;color:#fff;
        padding:12px 28px;border-radius:3px;
        font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
        cursor:pointer;transition:background 0.2s;display:flex;align-items:center;gap:8px;
      }
      .sfm-submit-btn:hover:not(:disabled){background:#a85e84;}
      .sfm-submit-btn:disabled{background:#d0b0c0;cursor:not-allowed;}
      .sfm-submit-btn svg{width:15px;height:15px;stroke:#fff;fill:none;}
      .sfm-required-note{font-size:11px;color:#a08080;margin-right:auto;}

      /* ── Mobile ────────────────────────────────────────────────────── */
      @media(max-width:600px){
        #sol-floral-overlay{padding:0;align-items:flex-end;}
        #sol-floral-dialog{border-radius:12px 12px 0 0;max-height:94vh;overflow-y:auto;margin:0;}
        .sfm-grid-2,.sfm-grid-3{grid-template-columns:1fr;}
        .sfm-addons-grid{grid-template-columns:repeat(2,1fr);}
        .sfm-body{padding:20px 20px;}
        .sfm-header{padding:18px 20px 14px;}
        .sfm-footer{padding:14px 20px 16px;}
        .sfm-radio-pills{flex-wrap:wrap;}
      }
      @keyframes sfm-spin{to{transform:rotate(360deg);}}
    `;
    document.head.appendChild(style);
  }

  /* ── HTML Template ───────────────────────────────────────────────────────── */

  function buildHTML() {
    const locOptions = LOCATION_TYPES.map(l =>
      `<option value="${l}">${l}</option>`
    ).join('');

    return `
    <div id="sol-floral-overlay" role="dialog" aria-modal="true" aria-label="Floral delivery details">
      <div id="sol-floral-dialog">

        <!-- Header -->
        <div class="sfm-header">
          <div class="sfm-header-text">
            <div class="sfm-eyebrow">💐 Floral Arrangement</div>
            <div class="sfm-title">Delivery Details</div>
            <div class="sfm-subtitle">All required fields must be completed before adding to cart.</div>
          </div>
          <button class="sfm-close-btn" id="sfm-close-x" aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="sfm-body">

          <!-- Recipient -->
          <div class="sfm-section-label">Recipient Information</div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-recipient-name">Recipient Name <span class="sfm-req">*</span></label>
            <input class="sfm-input" id="sfm-recipient-name" type="text" placeholder="Full name of recipient" autocomplete="off" />
            <div class="sfm-error-msg" id="sfm-err-recipient-name">Please enter the recipient's name.</div>
          </div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-card-message">Card Message <span class="sfm-req">*</span></label>
            <textarea class="sfm-textarea" id="sfm-card-message" placeholder="Message to include on the card…"></textarea>
            <div class="sfm-error-msg" id="sfm-err-card-message">Please add a card message.</div>
          </div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-sender-name">Sender Name / Signature <span class="sfm-req">*</span></label>
            <input class="sfm-input" id="sfm-sender-name" type="text" placeholder="Your name (as it appears on the card)" autocomplete="off" />
            <div class="sfm-error-msg" id="sfm-err-sender-name">Please enter your name.</div>
          </div>

          <!-- Delivery -->
          <div class="sfm-section-label">Delivery Details</div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-delivery-date">Delivery Date <span class="sfm-req">*</span></label>
            <input class="sfm-input" id="sfm-delivery-date" type="date" />
            <div class="sfm-error-msg" id="sfm-err-delivery-date">Please select a delivery date.</div>
          </div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-delivery-address">Delivery Address <span class="sfm-req">*</span></label>
            <input class="sfm-input" id="sfm-delivery-address" type="text" placeholder="Street address" autocomplete="off" />
            <div class="sfm-error-msg" id="sfm-err-delivery-address">Please enter the delivery address.</div>
          </div>

          <div class="sfm-grid-3">
            <div class="sfm-field" style="margin-bottom:0">
              <label class="sfm-label" for="sfm-delivery-city">City</label>
              <input class="sfm-input" id="sfm-delivery-city" type="text" placeholder="City" autocomplete="off" />
            </div>
            <div class="sfm-field" style="margin-bottom:0">
              <label class="sfm-label" for="sfm-delivery-state">State</label>
              <input class="sfm-input" id="sfm-delivery-state" type="text" placeholder="GA" maxlength="2" autocomplete="off" />
            </div>
            <div class="sfm-field" style="margin-bottom:0">
              <label class="sfm-label" for="sfm-delivery-zip">Zip</label>
              <input class="sfm-input" id="sfm-delivery-zip" type="text" placeholder="30052" maxlength="10" autocomplete="off" />
            </div>
          </div>

          <div class="sfm-field" style="margin-top:14px">
            <label class="sfm-label" for="sfm-location-type">Location Type <span class="sfm-req">*</span></label>
            <select class="sfm-select" id="sfm-location-type">
              <option value="">— Select —</option>
              ${locOptions}
            </select>
            <div class="sfm-error-msg" id="sfm-err-location-type">Please select a location type.</div>
          </div>

          <div class="sfm-field">
            <label class="sfm-label" for="sfm-delivery-instructions">Delivery Instructions / Notes</label>
            <textarea class="sfm-textarea" id="sfm-delivery-instructions" placeholder="Gate code, leave at door, call on arrival, etc."></textarea>
          </div>

          <!-- Add-ons -->
          <div class="sfm-section-label">Add-Ons <span style="font-weight:400;color:#bbb;text-transform:none;letter-spacing:0">(optional)</span></div>
          <div id="sfm-addons-container">
            <div style="text-align:center;padding:16px;color:#bbb;font-size:13px" id="sfm-addons-loading">
              Loading add-ons…
            </div>
          </div>

        </div><!-- /sfm-body -->

        <!-- Footer -->
        <div class="sfm-footer">
          <div class="sfm-footer-total" id="sfm-total-row">
            <span class="sfm-footer-total-label">Arrangement Total</span>
            <span class="sfm-footer-total-val" id="sfm-total-display">$0.00</span>
          </div>
          <div class="sfm-footer-actions">
            <span class="sfm-required-note"><span style="color:#c0789a">*</span> Required fields</span>
            <button class="sfm-cancel-btn" id="sfm-cancel-btn">Cancel</button>
            <button class="sfm-submit-btn" id="sfm-submit-btn" disabled>
              <svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              Add to Cart
            </button>
          </div>
        </div>

      </div><!-- /dialog -->
    </div><!-- /overlay -->
    `;
  }

  /* ── State ───────────────────────────────────────────────────────────────── */

  let _product  = null;
  let _qty      = 1;
  let _onConfirm = null;
  let _addons   = [];   // full addon objects from API
  // _selected: { [addonId]: { qty: number, option: string|null } }
  let _selected = {};

  /* ── Helpers ─────────────────────────────────────────────────────────────── */

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function fmtPrice(p) {
    return '$' + parseFloat(p || 0).toFixed(2);
  }

  // Find addon id for vase_type
  function findAddonByVaseType(vt) {
    return _addons.find(a => a.vase_type === vt);
  }

  // Check if "Add a Vase" is currently selected
  function isAddVaseSelected() {
    const av = findAddonByVaseType('add');
    return av ? !!_selected[av.id] : false;
  }

  // Whether a given addon should be visible given current state + product
  function isAddonVisible(addon) {
    if (addon.vase_type === 'add') {
      // Only show for wrapped arrangements (no vase included)
      return !(_product && _product.floral_has_vase);
    }
    if (addon.vase_type === 'upgrade') {
      // Show if product already has a vase, OR after "Add a Vase" is selected
      return (_product && _product.floral_has_vase) || isAddVaseSelected();
    }
    return true;
  }

  // Compute addon total from _selected
  function computeAddonTotal() {
    let total = 0;
    for (const [idStr, sel] of Object.entries(_selected)) {
      const a = _addons.find(x => x.id === parseInt(idStr, 10));
      if (a && a.price) total += parseFloat(a.price) * (sel.qty || 1);
    }
    return total;
  }

  // Compute full running total (product + addons)
  function computeTotal() {
    const base = _product ? parseFloat(_product.price || 0) * (_qty || 1) : 0;
    return base + computeAddonTotal();
  }

  function updateTotalDisplay() {
    const el = document.getElementById('sfm-total-display');
    if (el) el.textContent = fmtPrice(computeTotal());
  }

  /* ── DOM Setup ───────────────────────────────────────────────────────────── */

  function ensureDom() {
    if (document.getElementById('sol-floral-overlay')) return;
    injectStyles();
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildHTML();
    document.body.appendChild(wrapper.firstElementChild);

    document.getElementById('sfm-close-x').addEventListener('click', close);
    document.getElementById('sfm-cancel-btn').addEventListener('click', close);
    document.getElementById('sol-floral-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('sol-floral-overlay')) close();
    });
    document.getElementById('sfm-submit-btn').addEventListener('click', handleSubmit);

    // Live validation on required form fields
    const requiredIds = ['sfm-recipient-name','sfm-card-message','sfm-sender-name',
                         'sfm-delivery-date','sfm-delivery-address','sfm-location-type'];
    requiredIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => { checkValidity(); updateTotalDisplay(); });
        el.addEventListener('change', () => { checkValidity(); updateTotalDisplay(); });
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && document.getElementById('sol-floral-overlay').classList.contains('open')) {
        close();
      }
    });
  }

  /* ── Addon Loading ───────────────────────────────────────────────────────── */

  async function loadAddons() {
    const container = document.getElementById('sfm-addons-container');
    if (!container) return;

    try {
      const res = await fetch('/api/sol/floral/addons');
      const data = await res.json();
      _addons = data.addons || [];
    } catch (e) {
      _addons = [];
    }

    renderAddons();
    updateTotalDisplay();
  }

  /* ── Addon Rendering ─────────────────────────────────────────────────────── */

  function renderAddons() {
    const container = document.getElementById('sfm-addons-container');
    if (!container) return;

    if (!_addons.length) {
      container.innerHTML = '<div style="text-align:center;padding:8px;color:#bbb;font-size:13px">No add-ons available</div>';
      return;
    }

    // Group addons by addon_group, maintaining sort order
    const groupOrder = ['enhance', 'sweet', 'wellness', 'vase'];
    const groups = {};
    for (const a of _addons) {
      const g = a.addon_group || 'other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(a);
    }

    let html = '';

    for (const groupKey of groupOrder) {
      const groupAddons = groups[groupKey];
      if (!groupAddons || !groupAddons.length) continue;

      const meta = GROUP_META[groupKey] || { label: groupKey, icon: '' };

      // Check visibility — for vase section, check if any vase addon is visible
      const visibleAddons = groupAddons.filter(isAddonVisible);
      if (groupKey === 'vase' && visibleAddons.length === 0) continue;

      html += `<div class="sfm-addon-section">`;
      html += `<div class="sfm-addon-section-heading">${meta.icon} ${escHtml(meta.label)}</div>`;

      if (groupKey === 'sweet') {
        // Render radio groups (chocolates, teddy) within sweet
        const radioGroups = {};
        for (const a of groupAddons) {
          const rg = a.radio_group || '__solo__';
          if (!radioGroups[rg]) radioGroups[rg] = [];
          radioGroups[rg].push(a);
        }

        for (const [rgKey, rgAddons] of Object.entries(radioGroups)) {
          if (rgKey === '__solo__') {
            // Normal cards for non-radio items
            html += renderAddonGrid(rgAddons);
          } else {
            // Radio pill row
            const groupDisplayName = extractGroupDisplayName(rgAddons[0].name);
            html += `<div class="sfm-radio-group">`;
            html += `<span class="sfm-radio-group-label">${escHtml(groupDisplayName)}</span>`;
            html += `<div class="sfm-radio-pills">`;
            for (const a of rgAddons) {
              const sel = !!_selected[a.id];
              const sizeName = extractSizeName(a.name);
              html += `
                <div class="sfm-radio-pill${sel ? ' selected' : ''}"
                     data-addon-id="${a.id}"
                     onclick="SolFloralModal._selectRadio('${rgKey}',${a.id})">
                  <div class="sfm-pill-name">${escHtml(sizeName)}</div>
                  <div class="sfm-pill-price">${fmtPrice(a.price)}</div>
                </div>`;
            }
            html += `</div></div>`;
          }
        }
      } else {
        // Regular card grid (filter visible for vase section)
        const toRender = groupKey === 'vase' ? visibleAddons : groupAddons;
        html += renderAddonGrid(toRender);
      }

      html += `</div>`;
    }

    container.innerHTML = html;
    updateTotalDisplay();
  }

  function renderAddonGrid(addons) {
    if (!addons.length) return '';
    let html = `<div class="sfm-addons-grid">`;
    for (const a of addons) {
      const selState = _selected[a.id];
      const sel = !!selState;
      const qty = selState ? selState.qty : 1;
      const option = selState ? selState.option : '';
      const maxQty = a.max_quantity || 10;
      const hasQtyControl = maxQty > 1;
      const hasOptions = Array.isArray(a.options) && a.options.length > 0;

      const checkSvg = `<svg viewBox="0 0 24 24" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><polyline points="20 6 9 17 4 12"/></svg>`;

      // Display name — for cards just show the base name (no size suffix)
      const displayName = a.radio_group ? extractSizeName(a.name) : a.name;

      let optionHtml = '';
      if (hasOptions) {
        const reqAttr = a.requires_option ? 'data-required="true"' : '';
        const errClass = (sel && a.requires_option && !option) ? ' error' : '';
        optionHtml = `
          <div class="sfm-addon-option-row">
            <select class="sfm-addon-option-select${errClass}"
                    data-addon-id="${a.id}"
                    ${reqAttr}
                    onchange="event.stopPropagation();SolFloralModal._setAddonOption(${a.id},this.value)"
                    onclick="event.stopPropagation()">
              <option value="">— Choose —</option>
              ${a.options.map(opt => `<option value="${escHtml(opt)}"${option === opt ? ' selected' : ''}>${escHtml(opt)}</option>`).join('')}
            </select>
          </div>`;
      }

      let qtyHtml = '';
      if (hasQtyControl) {
        qtyHtml = `
          <div class="sfm-addon-qty-row">
            <button class="sfm-addon-qty-btn"
                    onclick="event.stopPropagation();SolFloralModal._changeAddonQty(${a.id},-1,${maxQty})"
                    aria-label="Decrease">−</button>
            <span class="sfm-addon-qty-val">${qty}</span>
            <button class="sfm-addon-qty-btn"
                    onclick="event.stopPropagation();SolFloralModal._changeAddonQty(${a.id},1,${maxQty})"
                    aria-label="Increase">+</button>
          </div>`;
      }

      html += `
        <div class="sfm-addon-card${sel ? ' selected' : ''}"
             data-addon-id="${a.id}"
             onclick="SolFloralModal._toggleAddon(${a.id})">
          <div class="sfm-addon-check">${checkSvg}</div>
          <div class="sfm-addon-name">${escHtml(displayName)}</div>
          <div class="sfm-addon-price">${fmtPrice(a.price)}</div>
          ${qtyHtml}
          ${optionHtml}
        </div>`;
    }
    html += `</div>`;
    return html;
  }

  // "Chocolates – Small" → "Chocolates"
  function extractGroupDisplayName(name) {
    const idx = name.indexOf(' – ');
    return idx > -1 ? name.substring(0, idx) : name;
  }

  // "Chocolates – Small" → "Small"
  function extractSizeName(name) {
    const idx = name.indexOf(' – ');
    return idx > -1 ? name.substring(idx + 3) : name;
  }

  /* ── Validation ──────────────────────────────────────────────────────────── */

  const REQUIRED_FIELDS = [
    { id: 'sfm-recipient-name',   errId: 'sfm-err-recipient-name',   label: 'Recipient name' },
    { id: 'sfm-card-message',     errId: 'sfm-err-card-message',     label: 'Card message' },
    { id: 'sfm-sender-name',      errId: 'sfm-err-sender-name',      label: 'Sender name' },
    { id: 'sfm-delivery-date',    errId: 'sfm-err-delivery-date',    label: 'Delivery date' },
    { id: 'sfm-delivery-address', errId: 'sfm-err-delivery-address', label: 'Delivery address' },
    { id: 'sfm-location-type',    errId: 'sfm-err-location-type',    label: 'Location type' },
  ];

  function hasRequiredOptionErrors() {
    // Check that all selected addons with requires_option have an option picked
    for (const [idStr, sel] of Object.entries(_selected)) {
      const a = _addons.find(x => x.id === parseInt(idStr, 10));
      if (a && a.requires_option && (!sel.option || !sel.option.trim())) {
        return true;
      }
    }
    return false;
  }

  function checkValidity() {
    let valid = true;
    for (const f of REQUIRED_FIELDS) {
      const el = document.getElementById(f.id);
      if (!el || !el.value.trim()) { valid = false; break; }
    }
    if (valid && hasRequiredOptionErrors()) valid = false;

    const btn = document.getElementById('sfm-submit-btn');
    if (btn) btn.disabled = !valid;
    return valid;
  }

  function validateAndMark() {
    let valid = true;
    for (const f of REQUIRED_FIELDS) {
      const el = document.getElementById(f.id);
      const errEl = document.getElementById(f.errId);
      if (!el) continue;
      const isEmpty = !el.value.trim();
      el.classList.toggle('error', isEmpty);
      if (errEl) errEl.classList.toggle('show', isEmpty);
      if (isEmpty) valid = false;
    }
    // Mark option selects with errors
    if (valid) {
      for (const [idStr, sel] of Object.entries(_selected)) {
        const a = _addons.find(x => x.id === parseInt(idStr, 10));
        if (a && a.requires_option && (!sel.option || !sel.option.trim())) {
          valid = false;
          // Mark the select red
          const selEl = document.querySelector(`.sfm-addon-option-select[data-addon-id="${a.id}"]`);
          if (selEl) selEl.classList.add('error');
        }
      }
    }
    return valid;
  }

  /* ── Submit ──────────────────────────────────────────────────────────────── */

  async function handleSubmit() {
    if (!validateAndMark()) return;

    const btn = document.getElementById('sfm-submit-btn');
    btn.disabled = true;
    btn.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;stroke:#fff;fill:none;animation:sfm-spin 0.7s linear infinite"><path d="M21 12a9 9 0 11-18 0"/></svg> Adding…`;

    const floralDetails = {
      delivery_date:         document.getElementById('sfm-delivery-date').value,
      recipient_name:        document.getElementById('sfm-recipient-name').value.trim(),
      delivery_address:      document.getElementById('sfm-delivery-address').value.trim(),
      delivery_city:         document.getElementById('sfm-delivery-city').value.trim(),
      delivery_state:        document.getElementById('sfm-delivery-state').value.trim(),
      delivery_zip:          document.getElementById('sfm-delivery-zip').value.trim(),
      location_type:         document.getElementById('sfm-location-type').value,
      delivery_instructions: document.getElementById('sfm-delivery-instructions').value.trim(),
      card_message:          document.getElementById('sfm-card-message').value.trim(),
      sender_name:           document.getElementById('sfm-sender-name').value.trim(),
    };

    // Build selected add-ons
    const selectedAddons = Object.entries(_selected)
      .filter(([, s]) => s.qty > 0)
      .map(([idStr, s]) => {
        const a = _addons.find(x => x.id === parseInt(idStr, 10));
        return {
          addon_id:        parseInt(idStr, 10),
          quantity:        s.qty,
          option_selected: s.option || null,
          name:            a ? a.name : '',
          price:           a ? a.price : null,
        };
      });

    const cartItemId = `floral-${_product.id}-${Date.now()}`;

    // Save to DB (fire and forget)
    try {
      await fetch('/api/sol/floral/order-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart_item_id: cartItemId,
          ...floralDetails,
          addons: selectedAddons.map(a => ({
            addon_id: a.addon_id,
            quantity: a.quantity,
            option_selected: a.option_selected,
          })),
        }),
        keepalive: true,
      });
    } catch (e) {
      // Non-fatal
    }

    const cartItem = {
      id:              _product.id,
      slug:            _product.slug,
      name:            _product.name,
      price:           _product.price,
      price_label:     _product.price_label,
      image:           (_product.images || [])[0] || '',
      category:        _product.sol_category,
      fulfillment:     _product.fulfillment_type || 'pickup',
      notes:           floralDetails.delivery_instructions || '',
      qty:             _qty,
      floral:          true,
      floralCartItemId: cartItemId,
      floralDetails,
      floralAddons:    selectedAddons,
    };

    close();
    if (typeof _onConfirm === 'function') _onConfirm(cartItem);
  }

  /* ── Addon Interactions ─────────────────────────────────────────────────── */

  function toggleAddon(addonId) {
    const a = _addons.find(x => x.id === addonId);
    if (!a) return;

    if (_selected[addonId]) {
      delete _selected[addonId];

      // If "Add a Vase" deselected → also deselect "Upgrade Vase"
      if (a.vase_type === 'add') {
        const upgrade = findAddonByVaseType('upgrade');
        if (upgrade) delete _selected[upgrade.id];
      }
    } else {
      _selected[addonId] = { qty: 1, option: null };

      // Vase mutual exclusion
      if (a.vase_type === 'add') {
        // Deselect Upgrade if selected
        const upgrade = findAddonByVaseType('upgrade');
        if (upgrade) delete _selected[upgrade.id];
      }
      if (a.vase_type === 'upgrade') {
        // Deselect "Add a Vase" — Upgrade REPLACES it, no double charge
        const base = findAddonByVaseType('add');
        if (base) delete _selected[base.id];
      }
    }

    renderAddons();
    checkValidity();
  }

  function selectRadio(radioGroup, addonId) {
    // Deselect all in this radio group, then select the clicked one
    for (const a of _addons) {
      if (a.radio_group === radioGroup) {
        if (a.id === addonId) {
          // Toggle: clicking selected radio deselects it
          if (_selected[a.id]) {
            delete _selected[a.id];
          } else {
            _selected[a.id] = { qty: 1, option: null };
          }
        } else {
          delete _selected[a.id];
        }
      }
    }
    renderAddons();
    checkValidity();
  }

  function changeAddonQty(addonId, delta, maxQty) {
    const cur = _selected[addonId] ? _selected[addonId].qty : 0;
    const next = Math.max(0, Math.min(cur + delta, maxQty || 10));
    if (next === 0) {
      delete _selected[addonId];
    } else {
      _selected[addonId] = { qty: next, option: _selected[addonId] ? _selected[addonId].option : null };
    }
    renderAddons();
    checkValidity();
  }

  function setAddonOption(addonId, optionValue) {
    if (_selected[addonId]) {
      _selected[addonId].option = optionValue || null;
    }
    // Remove error class if option now selected
    const selEl = document.querySelector(`.sfm-addon-option-select[data-addon-id="${addonId}"]`);
    if (selEl) selEl.classList.remove('error');
    checkValidity();
    updateTotalDisplay();
  }

  /* ── Open / Close ─────────────────────────────────────────────────────────── */

  function open(product, qty, onConfirm) {
    _product   = product;
    _qty       = qty || 1;
    _onConfirm = onConfirm;
    _selected  = {};

    ensureDom();

    // Reset form
    ['sfm-recipient-name','sfm-card-message','sfm-sender-name',
     'sfm-delivery-date','sfm-delivery-address','sfm-delivery-city',
     'sfm-delivery-state','sfm-delivery-zip','sfm-delivery-instructions'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.classList.remove('error'); }
    });
    const loc = document.getElementById('sfm-location-type');
    if (loc) { loc.value = ''; loc.classList.remove('error'); }

    REQUIRED_FIELDS.forEach(f => {
      const errEl = document.getElementById(f.errId);
      if (errEl) errEl.classList.remove('show');
    });

    const submitBtn = document.getElementById('sfm-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" style="width:15px;height:15px;stroke:#fff"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg> Add to Cart`;
    }

    // Min delivery date = today
    const dateEl = document.getElementById('sfm-delivery-date');
    if (dateEl) {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2,'0');
      const dd = String(today.getDate()).padStart(2,'0');
      dateEl.min = `${yyyy}-${mm}-${dd}`;
    }

    // Reset addons container
    const container = document.getElementById('sfm-addons-container');
    if (container) {
      container.innerHTML = '<div style="text-align:center;padding:16px;color:#bbb;font-size:13px">Loading add-ons…</div>';
    }

    updateTotalDisplay();
    loadAddons();

    const overlay = document.getElementById('sol-floral-overlay');
    if (overlay) {
      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }
  }

  function close() {
    const overlay = document.getElementById('sol-floral-overlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ── Public API ───────────────────────────────────────────────────────────── */

  window.SolFloralModal = {
    open,
    close,
    _toggleAddon:  toggleAddon,
    _selectRadio:  selectRadio,
    _changeAddonQty: changeAddonQty,
    _setAddonOption: setAddonOption,
  };

})();
