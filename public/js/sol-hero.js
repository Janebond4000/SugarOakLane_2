/**
 * Sol Hero System — shared hero loader + slider
 * Usage: call initPageHero('homepage') or initPageHero('about') etc.
 *
 * For homepage: patches the existing #hero section.
 * For other pages: injects a .sol-page-hero section after the <header>.
 */

(function () {
  'use strict';

  // ── Slider state ───────────────────────────────────────────────────────────
  let _heroSlides = [];
  let _heroIdx    = 0;
  let _heroTimer  = null;
  const SLIDE_INTERVAL = 5500; // ms

  // ── Public entry point ─────────────────────────────────────────────────────
  window.initPageHero = function (pageKey) {
    fetch('/api/heroes/' + encodeURIComponent(pageKey))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.success || !d.heroes || !d.heroes.length) return;
        _heroSlides = d.heroes;

        if (pageKey === 'homepage') {
          applyHomepageHero(d.heroes);
        } else {
          injectPageHero(d.heroes);
        }
      })
      .catch(function () { /* silent — keep existing fallback content */ });
  };

  // ── Homepage hero (patches existing #hero section) ─────────────────────────
  function applyHomepageHero(slides) {
    var section = document.getElementById('hero');
    if (!section) return;

    if (slides.length === 1) {
      // Static — just apply the single slide's data
      applySingleSlide(slides[0]);
    } else {
      // Slider mode
      buildHomepageSlider(section, slides);
    }
  }

  function applySingleSlide(slide) {
    var img = document.getElementById('hero-bg-img');
    if (img && slide.image_url) {
      img.src      = slide.image_url;
      img.style.display = '';
    }
    if (slide.headline) {
      var h = document.getElementById('hero-headline');
      if (h) h.innerHTML = escH(slide.headline);
    }
    if (slide.subtext) {
      var s = document.getElementById('hero-subline');
      if (s) s.textContent = slide.subtext;
    }
    if (slide.cta_text) {
      var btn = document.getElementById('hero-cta-primary');
      if (btn) {
        btn.textContent = slide.cta_text;
        if (slide.cta_link) btn.href = slide.cta_link;
      }
    }
  }

  function buildHomepageSlider(section, slides) {
    // 1. Build slide background layers (absolutely positioned behind content)
    var bgContainer = document.createElement('div');
    bgContainer.className = 'hero-slides-bg';
    bgContainer.setAttribute('aria-hidden', 'true');

    slides.forEach(function (slide, i) {
      var layer = document.createElement('div');
      layer.className = 'hero-slide-layer' + (i === 0 ? ' active' : '');
      layer.dataset.idx = i;
      if (slide.image_url) {
        var img = document.createElement('img');
        img.src   = slide.image_url;
        img.alt   = '';
        img.className = 'hero-bg-img';
        if (i === 0) img.setAttribute('fetchpriority', 'high');
        else img.loading = 'lazy';
        layer.appendChild(img);
      }
      bgContainer.appendChild(layer);
    });

    // Replace existing hero-bg-img with the new container
    var oldImg = document.getElementById('hero-bg-img');
    if (oldImg) oldImg.parentNode.removeChild(oldImg);
    section.insertBefore(bgContainer, section.firstChild);

    // 2. Content overlay — update dynamically per slide
    applySlideContent(slides[0]);

    // 3. Dots navigation
    var dots = document.createElement('div');
    dots.className = 'hero-dots';
    dots.setAttribute('role', 'tablist');
    slides.forEach(function (slide, i) {
      var dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.dataset.idx = i;
      dot.addEventListener('click', function () {
        goToSlide(i, slides);
      });
      dots.appendChild(dot);
    });
    section.appendChild(dots);

    // 4. Prev/Next arrows
    var prevBtn = document.createElement('button');
    prevBtn.className = 'hero-arrow hero-arrow-prev';
    prevBtn.setAttribute('aria-label', 'Previous slide');
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    prevBtn.addEventListener('click', function () {
      var prev = (_heroIdx - 1 + slides.length) % slides.length;
      goToSlide(prev, slides);
    });

    var nextBtn = document.createElement('button');
    nextBtn.className = 'hero-arrow hero-arrow-next';
    nextBtn.setAttribute('aria-label', 'Next slide');
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    nextBtn.addEventListener('click', function () {
      var next = (_heroIdx + 1) % slides.length;
      goToSlide(next, slides);
    });

    section.appendChild(prevBtn);
    section.appendChild(nextBtn);

    // 5. Start auto-advance
    startAutoSlide(slides);
  }

  function goToSlide(idx, slides) {
    var bgContainer = document.querySelector('.hero-slides-bg');
    if (bgContainer) {
      bgContainer.querySelectorAll('.hero-slide-layer').forEach(function (el) {
        el.classList.remove('active');
      });
      var target = bgContainer.querySelector('[data-idx="' + idx + '"]');
      if (target) target.classList.add('active');
    }

    // Update dots
    document.querySelectorAll('.hero-dot').forEach(function (el, i) {
      el.classList.toggle('active', i === idx);
    });

    // Update content overlay
    applySlideContent(slides[idx]);

    _heroIdx = idx;
    // Reset timer
    clearInterval(_heroTimer);
    startAutoSlide(slides);
  }

  function applySlideContent(slide) {
    if (slide.headline) {
      var h = document.getElementById('hero-headline');
      if (h) h.innerHTML = escH(slide.headline);
    }
    if (slide.subtext) {
      var s = document.getElementById('hero-subline');
      if (s) s.textContent = slide.subtext;
    }
    if (slide.cta_text) {
      var btn = document.getElementById('hero-cta-primary');
      if (btn) {
        btn.textContent = slide.cta_text;
        if (slide.cta_link) btn.href = slide.cta_link;
      }
    }
  }

  function startAutoSlide(slides) {
    if (slides.length < 2) return;
    _heroTimer = setInterval(function () {
      var next = (_heroIdx + 1) % slides.length;
      goToSlide(next, slides);
    }, SLIDE_INTERVAL);
  }

  // ── Secondary page hero (replaces existing .page-hero or injects new) ──────
  function injectPageHero(slides) {
    // Don't inject twice
    if (document.getElementById('page-hero')) return;

    // Check for an existing hardcoded .page-hero section and replace it
    var existing = document.querySelector('.page-hero');
    var section;

    if (existing) {
      // Replace the hardcoded static hero with a proper image-backed hero
      section = document.createElement('section');
      section.id        = 'page-hero';
      section.className = 'sol-page-hero';
      section.setAttribute('aria-label', 'Page hero');
      existing.parentNode.replaceChild(section, existing);
    } else {
      // No existing hero — inject after header
      var header = document.getElementById('header');
      if (!header) return;
      section = document.createElement('section');
      section.id        = 'page-hero';
      section.className = 'sol-page-hero';
      section.setAttribute('aria-label', 'Page hero');
      header.insertAdjacentElement('afterend', section);
    }

    if (slides.length === 1) {
      // Static
      section.innerHTML = buildPageHeroHTML(slides[0]);
    } else {
      // Slider — build the same multi-slide structure
      section.innerHTML = buildPageHeroHTML(slides[0]);
      buildPageHeroSlider(section, slides);
    }
  }

  function buildPageHeroHTML(slide) {
    var imgHTML = slide.image_url
      ? '<img class="page-hero-bg-img" src="' + escAttr(slide.image_url) + '" alt="" fetchpriority="high" />'
      : '';
    var textHTML = '';
    if (slide.headline || slide.subtext || slide.cta_text) {
      textHTML = '<div class="page-hero-content">';
      if (slide.headline) textHTML += '<h2 class="page-hero-headline">' + escH(slide.headline) + '</h2>';
      if (slide.subtext)  textHTML += '<p class="page-hero-subtext">' + escH(slide.subtext) + '</p>';
      if (slide.cta_text) {
        var href = slide.cta_link ? escAttr(slide.cta_link) : '#';
        textHTML += '<a href="' + href + '" class="page-hero-cta">' + escH(slide.cta_text) + '</a>';
      }
      textHTML += '</div>';
    }
    return imgHTML + '<div class="page-hero-overlay"></div>' + textHTML;
  }

  function buildPageHeroSlider(section, slides) {
    // Build bg layers
    var bgContainer = document.createElement('div');
    bgContainer.className = 'hero-slides-bg';
    bgContainer.setAttribute('aria-hidden', 'true');
    slides.forEach(function (slide, i) {
      var layer = document.createElement('div');
      layer.className = 'hero-slide-layer' + (i === 0 ? ' active' : '');
      layer.dataset.idx = i;
      if (slide.image_url) {
        var img = document.createElement('img');
        img.src   = slide.image_url;
        img.alt   = '';
        img.className = 'page-hero-bg-img';
        if (i !== 0) img.loading = 'lazy';
        layer.appendChild(img);
      }
      bgContainer.appendChild(layer);
    });

    // Remove the static image that was in buildPageHeroHTML
    var staticImg = section.querySelector('.page-hero-bg-img');
    if (staticImg) staticImg.parentNode.removeChild(staticImg);
    section.insertBefore(bgContainer, section.firstChild);

    // Content div — use first slide's content (already rendered)
    // Build content container that we update dynamically
    var contentEl = section.querySelector('.page-hero-content');
    if (!contentEl) {
      contentEl = document.createElement('div');
      contentEl.className = 'page-hero-content';
      section.appendChild(contentEl);
    }

    // Store slides on section for the shared goToSlide function
    // For page heroes we need a local slider, so build one
    var pageIdx = 0;
    var pageTimer = null;

    function updateContent(slide) {
      var h  = contentEl.querySelector('.page-hero-headline');
      var s  = contentEl.querySelector('.page-hero-subtext');
      var c  = contentEl.querySelector('.page-hero-cta');
      if (h) h.innerHTML = slide.headline ? escH(slide.headline) : '';
      if (s) s.textContent = slide.subtext || '';
      if (c) { c.textContent = slide.cta_text || ''; if (slide.cta_link) c.href = slide.cta_link; }
    }

    function goPage(idx) {
      bgContainer.querySelectorAll('.hero-slide-layer').forEach(function (el) {
        el.classList.remove('active');
      });
      var t = bgContainer.querySelector('[data-idx="' + idx + '"]');
      if (t) t.classList.add('active');
      section.querySelectorAll('.hero-dot').forEach(function (el, i) {
        el.classList.toggle('active', i === idx);
      });
      updateContent(slides[idx]);
      pageIdx = idx;
      clearInterval(pageTimer);
      startPage();
    }

    function startPage() {
      pageTimer = setInterval(function () {
        goPage((pageIdx + 1) % slides.length);
      }, SLIDE_INTERVAL);
    }

    // Dots
    var dots = document.createElement('div');
    dots.className = 'hero-dots';
    slides.forEach(function (slide, i) {
      var dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.dataset.idx = i;
      dot.addEventListener('click', function () { goPage(i); });
      dots.appendChild(dot);
    });
    section.appendChild(dots);

    // Arrows
    var prev = document.createElement('button');
    prev.className = 'hero-arrow hero-arrow-prev';
    prev.setAttribute('aria-label', 'Previous slide');
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
    prev.addEventListener('click', function () { goPage((pageIdx - 1 + slides.length) % slides.length); });
    section.appendChild(prev);

    var next = document.createElement('button');
    next.className = 'hero-arrow hero-arrow-next';
    next.setAttribute('aria-label', 'Next slide');
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
    next.addEventListener('click', function () { goPage((pageIdx + 1) % slides.length); });
    section.appendChild(next);

    startPage();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function escH(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }

})();
