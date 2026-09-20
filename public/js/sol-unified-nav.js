(() => {
  'use strict';

  const arrow = '<svg class="nav-arrow" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function activeKey() {
    const p = location.pathname;
    if (p === '/flowers' || p.startsWith('/shop/flower-shop')) return 'flowers';
    if (p.startsWith('/shop')) return 'shop';
    if (p.startsWith('/wholesale')) return 'wholesale';
    if (p.startsWith('/weddings')) return 'weddings';
    if (p.startsWith('/workshops')) return 'workshops';
    if (p.startsWith('/subscriptions')) return 'subscriptions';
    if (p.startsWith('/blog')) return 'blog';
    if (p.startsWith('/about') || p.startsWith('/contact')) return 'about';
    return '';
  }

  function linkClass(key) {
    return 'nav-link' + (activeKey() === key ? ' active' : '');
  }

  function dropdown(mainHref, label, key, items) {
    return `
      <div class="nav-item">
        <a href="${mainHref}" class="${linkClass(key)}">${label} ${arrow}</a>
        <div class="nav-dropdown">
          ${items.map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}
        </div>
      </div>`;
  }

  function normalizeDesktopNav() {
    const nav = document.querySelector('.header-nav');
    if (!nav) return;

    nav.setAttribute('aria-label', 'Main navigation');
    nav.innerHTML = [
      dropdown('/shop/flower-shop', 'Flowers', 'flowers', [
        ['/shop/flower-shop', 'Shop Flowers'],
        ['/flowers', 'Farm Flowers'],
        ['/flowers#bouquets', 'Farm Bouquets'],
        ['/subscriptions', 'Flower Subscriptions'],
        ['/flowers#seasonal', 'Seasonal Flowers'],
        ['/flowers#farm', 'Our Flower Farm']
      ]),
      dropdown('/shop', 'Seeds+Plants', 'shop', [
        ['/shop', 'Shop All'],
        ['/shop?cat=seeds-bulbs', 'Seeds & Bulbs'],
        ['/shop?cat=dahlias', 'Dahlias'],
        ['/shop?cat=plant-nursery', 'Plants & Plugs'],
        ['/shop?cat=farm-goods', 'Farm Goods']
      ]),
      dropdown('/wholesale', 'Wholesale', 'wholesale', [
        ['/wholesale', 'Wholesale Overview'],
        ['/wholesale-portal', 'Current Availability'],
        ['/wholesale#availability', 'Bunches + Stems'],
        ['/wholesale#specialties', 'Specialties'],
        ['/wholesale#how-it-works', 'How It Works'],
        ['/wholesale#terms', 'Terms'],
        ['/wholesale#apply', 'Apply'],
        ['/wholesale-portal/login', 'Trade Login']
      ]),
      dropdown('/weddings', 'Weddings + Events', 'weddings', [
        ['/weddings', 'Weddings'],
        ['/weddings/diy', 'DIY Wedding Flowers'],
        ['/weddings/events', 'Banquets + Special Occasions']
      ]),
      `<a href="/workshops" class="${linkClass('workshops')}">Workshops</a>`,
      `<a href="/subscriptions" class="${linkClass('subscriptions')}">Subscriptions</a>`,
      `<a href="/blog" class="${linkClass('blog')}">Blog</a>`,
      dropdown('/about', 'About Us', 'about', [
        ['/about', 'Our Story'],
        ['/contact', 'Contact Us']
      ])
    ].join('');
  }

  function normalizeMobileDrawer() {
    const drawer = document.querySelector('#mobile-drawer .drawer-nav');
    if (!drawer) return;
    drawer.innerHTML = `
      <div class="drawer-section-label">Main Navigation</div>
      <a href="/shop/flower-shop">Flowers</a>
      <a href="/shop">Seeds+Plants</a>
      <a href="/wholesale">Wholesale</a>
      <a href="/weddings">Weddings + Events</a>
      <a href="/workshops">Workshops</a>
      <a href="/subscriptions">Subscriptions</a>
      <a href="/blog">Blog</a>
      <a href="/about">About Us</a>
      <div class="drawer-section-label">Quick Links</div>
      <a href="/shop/flower-shop">Shop Flowers</a>
      <a href="/shop?cat=seeds-bulbs">Seeds & Bulbs</a>
      <a href="/shop?cat=dahlias">Dahlias</a>
      <a href="/wholesale-portal/login">Wholesale Login</a>
      <a href="/contact">Contact Us</a>`;
  }

  function normalizeLogo() {
    document.querySelectorAll('.header-logo-wrap a').forEach(a => a.setAttribute('href', '/'));
  }

  function run() {
    normalizeDesktopNav();
    normalizeMobileDrawer();
    normalizeLogo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();