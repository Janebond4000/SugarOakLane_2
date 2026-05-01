/**
 * sol-cart.js — Sugar Oak Lane cart (localStorage, global, persistent)
 * Include this script on every SOL page to get cart badge + global cart state.
 */
(function () {
  'use strict';

  const CART_KEY = 'sol_cart';

  /* ── Core cart operations ─────────────────────────────────────────────── */

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch { return []; }
  }

  function saveCart(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    dispatchCartChange(items);
  }

  function dispatchCartChange(items) {
    window.dispatchEvent(new CustomEvent('sol:cart:change', { detail: { items } }));
  }

  /* ── Public API ───────────────────────────────────────────────────────── */

  window.SolCart = {
    getItems() { return loadCart(); },

    getCount() {
      return loadCart().reduce((n, i) => n + (i.qty || 1), 0);
    },

    getSubtotal() {
      return loadCart().reduce((s, i) => {
        let lineTotal = (parseFloat(i.price) || 0) * (i.qty || 1);
        // Include floral add-on costs
        if (i.floral && Array.isArray(i.floralAddons)) {
          for (const a of i.floralAddons) {
            lineTotal += (parseFloat(a.price) || 0) * (a.quantity || 1);
          }
        }
        return s + lineTotal;
      }, 0);
    },

    getItemTotal(item) {
      let lineTotal = (parseFloat(item.price) || 0) * (item.qty || 1);
      if (item.floral && Array.isArray(item.floralAddons)) {
        for (const a of item.floralAddons) {
          lineTotal += (parseFloat(a.price) || 0) * (a.quantity || 1);
        }
      }
      return lineTotal;
    },

    addItem(product) {
      // product: { id, slug, name, price, image, category, fulfillment }
      const items = loadCart();
      const existing = items.find(i => i.slug === product.slug);
      if (existing) {
        existing.qty = (existing.qty || 1) + (product.qty || 1);
      } else {
        items.push({ ...product, qty: product.qty || 1, addedAt: Date.now() });
      }
      saveCart(items);
    },

    updateQty(slug, qty) {
      const items = loadCart();
      const idx = items.findIndex(i => i.slug === slug);
      if (idx === -1) return;
      if (qty <= 0) { items.splice(idx, 1); }
      else { items[idx].qty = qty; }
      saveCart(items);
    },

    removeItem(slug) {
      saveCart(loadCart().filter(i => i.slug !== slug));
    },

    clear() { saveCart([]); },
  };

  /* ── Badge rendering ─────────────────────────────────────────────────── */

  function renderBadge() {
    const count = window.SolCart.getCount();
    document.querySelectorAll('[data-sol-cart-btn]').forEach(btn => {
      let badge = btn.querySelector('.sol-cart-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'sol-cart-badge';
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
      badge.textContent = count > 9 ? '9+' : count;
      badge.style.display = count > 0 ? 'flex' : 'none';
    });
  }

  /* ── Inject badge CSS ────────────────────────────────────────────────── */

  if (!document.getElementById('sol-cart-badge-css')) {
    const style = document.createElement('style');
    style.id = 'sol-cart-badge-css';
    style.textContent = `
      .sol-cart-badge {
        position: absolute;
        top: 0; right: 0;
        background: var(--green, #3A5A40);
        color: #fff;
        font-size: 9px;
        font-weight: 700;
        min-width: 16px;
        height: 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0 3px;
        line-height: 1;
        pointer-events: none;
        transform: translate(4px, -4px);
      }
    `;
    document.head.appendChild(style);
  }

  /* ── Wire up cart buttons ────────────────────────────────────────────── */

  function wireCartButtons() {
    document.querySelectorAll('[data-sol-cart-btn]').forEach(btn => {
      if (btn.dataset.solCartWired) return;
      btn.dataset.solCartWired = '1';
      btn.addEventListener('click', () => {
        window.location.href = '/shop/cart';
      });
    });
  }

  /* ── "Add to cart" toast ─────────────────────────────────────────────── */

  window.SolCart.showToast = function(message) {
    let toast = document.getElementById('sol-cart-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'sol-cart-toast';
      toast.style.cssText = `
        position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
        background: var(--green, #3A5A40); color: #fff;
        padding: 14px 28px; border-radius: 2px;
        font-size: 13px; font-weight: 600; letter-spacing: 0.04em;
        z-index: 9999; pointer-events: none; opacity: 0;
        transition: opacity 0.25s; box-shadow: 0 4px 20px rgba(0,0,0,0.15);
        display: flex; align-items: center; gap: 10px;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `
      <svg style="width:18px;height:18px;stroke:#fff;fill:none;stroke-width:2;stroke-linecap:round;flex-shrink:0" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
      ${message}
    `;
    toast.style.opacity = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 2600);
  };

  /* ── Init ────────────────────────────────────────────────────────────── */

  function init() {
    wireCartButtons();
    renderBadge();
    window.addEventListener('sol:cart:change', renderBadge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
