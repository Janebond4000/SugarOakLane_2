/* ─────────────────────────────────────────────────────────────────── */
/* SHARED COMPONENT LOGIC */
/* Reusable functions for navigation, modals, forms, etc. */
/* ─────────────────────────────────────────────────────────────────── */

/**
 * Initialize mobile navigation toggle
 */
function initMobileNav() {
  const hamburger = document.querySelector('.hamburger');
  const nav = document.querySelector('.nav');

  if (!hamburger || !nav) return;

  hamburger.addEventListener('click', () => {
    nav.classList.toggle('active');
  });

  // Close nav when link clicked
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('active');
    });
  });
}

/**
 * Initialize sticky header on scroll
 */
function initStickyHeader() {
  const header = document.querySelector('.header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

/**
 * Initialize sidebar filter toggle (mobile)
 */
function initSidebarToggle() {
  const toggle = document.querySelector('.sidebar-toggle');
  const sidebar = document.querySelector('.sidebar');

  if (!toggle || !sidebar) return;

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('visible');
  });
}

/**
 * Initialize filter listeners
 */
function initFilters() {
  const filterInputs = document.querySelectorAll('.filter-label input');
  filterInputs.forEach(input => {
    input.addEventListener('change', () => {
      // Trigger filter logic here
      // Can be customized per page
    });
  });
}

/**
 * Initialize range slider
 */
function initRangeSlider() {
  const rangeInputs = document.querySelectorAll('.range-input input[type="range"]');
  rangeInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      const values = document.querySelector(`[data-range-output="${e.target.name}"]`);
      if (values) {
        values.textContent = e.target.value;
      }
    });
  });
}

/**
 * Initialize modal behavior
 */
function initModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const closeBtn = modal.querySelector('.modal-close');
  const openBtns = document.querySelectorAll(`[data-modal="${modalId}"]`);

  openBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  });

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
  });

  // Close on outside click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
      document.body.style.overflow = 'auto';
    }
  });
}

/**
 * Format price for display
 */
function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price);
}

/**
 * Initialize price displays
 */
function initPrices() {
  document.querySelectorAll('[data-price]').forEach(el => {
    const price = parseFloat(el.dataset.price);
    el.textContent = formatPrice(price);
  });
}

/**
 * Initialize product cards
 */
function initProductCards() {
  document.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.classList.add('hovered');
    });
    card.addEventListener('mouseleave', () => {
      card.classList.remove('hovered');
    });
  });
}

/**
 * Initialize form submission
 */
function initForm(formId, onSuccess) {
  const form = document.getElementById(formId);
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData);

    try {
      const response = await fetch(form.action || form.getAttribute('data-endpoint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        const result = await response.json();
        if (onSuccess) onSuccess(result);
        form.reset();
      } else {
        console.error('Form submission failed');
      }
    } catch (error) {
      console.error('Form error:', error);
    }
  });
}

/**
 * Lazy load images
 */
function initLazyLoading() {
  if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) {
            img.src = img.dataset.src;
            img.removeAttribute('data-src');
            observer.unobserve(img);
          }
        }
      });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
      imageObserver.observe(img);
    });
  }
}

/**
 * Initialize scroll-to anchor links
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
}

/**
 * Initialize all common components
 */
function initAllComponents() {
  initMobileNav();
  initStickyHeader();
  initSidebarToggle();
  initFilters();
  initRangeSlider();
  initPrices();
  initProductCards();
  initLazyLoading();
  initSmoothScroll();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAllComponents);
} else {
  initAllComponents();
}
