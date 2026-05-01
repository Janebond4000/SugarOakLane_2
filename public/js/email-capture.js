/**
 * email-capture.js — Sugar Oak Lane
 * Exit-intent popup + localStorage guard
 *
 * Desktop : fires when cursor moves toward browser top (exit intent)
 * Mobile  : fires after 30s on page OR on scroll-up gesture (>100px)
 * Guards  : once per session (sol_popup_shown) + never if subscribed (sol_subscribed)
 */
(function () {
  'use strict';

  var LS_SHOWN  = 'sol_popup_shown';
  var LS_SUBBED = 'sol_subscribed';
  var API_URL   = '/api/newsletter';

  // ── Guards ────────────────────────────────────────────────────────────────
  function shouldSuppress() {
    try {
      return localStorage.getItem(LS_SHOWN) === '1' ||
             localStorage.getItem(LS_SUBBED) === '1';
    } catch (e) { return false; }
  }

  function markShown() {
    try { localStorage.setItem(LS_SHOWN, '1'); } catch (e) {}
  }

  function markSubscribed() {
    try { localStorage.setItem(LS_SUBBED, '1'); } catch (e) {}
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('sol-ei-styles')) return;
    var css = [
      '#sol-ei-backdrop{position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,0.52);display:flex;align-items:center;justify-content:center;padding:20px;animation:solEiFadeIn 0.25s ease}',
      '#sol-ei-modal{position:relative;background:#fdf8f4;border-radius:18px;max-width:460px;width:100%;padding:52px 44px 42px;box-shadow:0 24px 64px rgba(0,0,0,0.18);text-align:center;animation:solEiSlideUp 0.3s ease;font-family:Georgia,"Times New Roman",serif}',
      '#sol-ei-close{position:absolute;top:14px;right:16px;background:none;border:none;cursor:pointer;font-size:20px;color:#999;line-height:1;padding:5px 9px;border-radius:50%;transition:background 0.15s,color 0.15s}',
      '#sol-ei-close:hover{color:#333;background:rgba(0,0,0,0.07)}',
      '.sol-ei-petal{font-size:38px;margin-bottom:10px;display:block}',
      '.sol-ei-eyebrow{font-family:"Helvetica Neue",Arial,sans-serif;font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#8a7560;margin-bottom:10px}',
      '.sol-ei-headline{font-size:30px;font-weight:400;color:#1a1a1a;line-height:1.22;margin-bottom:8px}',
      '.sol-ei-headline em{font-style:italic;font-weight:300;color:#3a5a40}',
      '.sol-ei-subtext{font-family:"Helvetica Neue",Arial,sans-serif;font-size:14px;color:#6a6260;line-height:1.6;margin-bottom:24px}',
      '.sol-ei-subtext strong{color:#1a1a1a}',
      '#sol-ei-form-wrap{display:flex;flex-direction:column;gap:0}',
      '#sol-ei-form{display:flex;flex-direction:column;gap:10px}',
      '#sol-ei-email{width:100%;padding:13px 16px;border:1.5px solid #ddd8cc;border-radius:8px;font-family:"Helvetica Neue",Arial,sans-serif;font-size:15px;color:#1a1a1a;background:#fff;outline:none;box-sizing:border-box;transition:border-color 0.2s}',
      '#sol-ei-email:focus{border-color:#3a5a40}',
      '#sol-ei-email::placeholder{color:#b0aba5}',
      '#sol-ei-submit{width:100%;padding:14px 24px;background:#3a5a40;color:#fff;border:none;border-radius:8px;cursor:pointer;font-family:"Helvetica Neue",Arial,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.03em;transition:background 0.2s,transform 0.1s}',
      '#sol-ei-submit:hover{background:#2c4730}',
      '#sol-ei-submit:active{transform:scale(0.98)}',
      '#sol-ei-submit:disabled{opacity:0.6;cursor:not-allowed;transform:none}',
      '.sol-ei-skip{font-family:"Helvetica Neue",Arial,sans-serif;font-size:12px;color:#b0aba5;margin-top:11px;cursor:pointer;background:none;border:none;text-decoration:underline;display:inline-block;transition:color 0.15s}',
      '.sol-ei-skip:hover{color:#6a6260}',
      '#sol-ei-success{display:none;padding:16px 0 4px}',
      '.sol-ei-success-icon{font-size:42px;margin-bottom:10px;display:block}',
      '.sol-ei-success-headline{font-size:22px;color:#1a1a1a;margin-bottom:6px}',
      '.sol-ei-success-code{font-family:"Helvetica Neue",Arial,sans-serif;font-size:26px;font-weight:700;color:#3a5a40;letter-spacing:0.1em;margin:8px 0 10px}',
      '.sol-ei-success-note{font-family:"Helvetica Neue",Arial,sans-serif;font-size:13px;color:#9a9490}',
      '@keyframes solEiFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes solEiSlideUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}',
      '@media(max-width:520px){#sol-ei-modal{padding:44px 24px 36px;border-radius:14px}.sol-ei-headline{font-size:25px}}'
    ].join('');
    var style = document.createElement('style');
    style.id = 'sol-ei-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ── Modal HTML ────────────────────────────────────────────────────────────
  function injectModal() {
    if (document.getElementById('sol-ei-backdrop')) return;
    var html =
      '<div id="sol-ei-backdrop" role="dialog" aria-modal="true" aria-labelledby="sol-ei-hl">' +
        '<div id="sol-ei-modal">' +
          '<button id="sol-ei-close" aria-label="Close">\u2715</button>' +
          '<span class="sol-ei-petal">\uD83C\uDF38</span>' +
          '<div class="sol-ei-eyebrow">For Garden Club Members</div>' +
          '<h2 class="sol-ei-headline" id="sol-ei-hl">Wait \u2014 take <em>10% off</em><br>your first order</h2>' +
          '<p class="sol-ei-subtext">Join our list for seasonal updates, exclusive offers,<br>and your <strong>WELCOME10</strong> discount code.</p>' +
          '<div id="sol-ei-form-wrap">' +
            '<form id="sol-ei-form" novalidate>' +
              '<input type="email" id="sol-ei-email" placeholder="Your email address" autocomplete="email" required />' +
              '<button type="submit" id="sol-ei-submit">Get My Discount</button>' +
            '</form>' +
            '<button class="sol-ei-skip" id="sol-ei-skip">No thanks, I\u2019ll pay full price</button>' +
          '</div>' +
          '<div id="sol-ei-success">' +
            '<span class="sol-ei-success-icon">\uD83C\uDF3F</span>' +
            '<div class="sol-ei-success-headline" id="sol-ei-success-hl">Welcome to the Garden Club!</div>' +
            '<div class="sol-ei-success-code">WELCOME10</div>' +
            '<div class="sol-ei-success-note">Check your inbox \u2014 your discount is on its way.</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.insertAdjacentHTML('beforeend', html);
  }

  // ── Close ─────────────────────────────────────────────────────────────────
  function closePopup() {
    var backdrop = document.getElementById('sol-ei-backdrop');
    if (!backdrop) return;
    backdrop.style.opacity = '0';
    backdrop.style.transition = 'opacity 0.2s ease';
    setTimeout(function () {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }, 200);
    document.removeEventListener('keydown', onKeyDown);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') closePopup();
  }

  // ── Show ──────────────────────────────────────────────────────────────────
  function showPopup() {
    if (shouldSuppress()) return;
    markShown();
    injectStyles();
    injectModal();
    bindEvents();
    // Focus email field after animation
    setTimeout(function () {
      var el = document.getElementById('sol-ei-email');
      if (el) el.focus();
    }, 350);
  }

  // ── Bind events ───────────────────────────────────────────────────────────
  function bindEvents() {
    document.addEventListener('keydown', onKeyDown);

    var backdrop = document.getElementById('sol-ei-backdrop');
    var modal    = document.getElementById('sol-ei-modal');
    var closeBtn = document.getElementById('sol-ei-close');
    var skipBtn  = document.getElementById('sol-ei-skip');
    var form     = document.getElementById('sol-ei-form');

    // Backdrop click (outside modal)
    backdrop.addEventListener('click', function (e) {
      if (modal && !modal.contains(e.target)) closePopup();
    });

    closeBtn.addEventListener('click', closePopup);
    skipBtn.addEventListener('click', closePopup);

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      var email = document.getElementById('sol-ei-email').value.trim();
      var btn   = document.getElementById('sol-ei-submit');
      if (!email || !email.includes('@')) return;
      btn.textContent = 'Joining\u2026';
      btn.disabled = true;
      try {
        var res  = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, source: 'exit-intent-popup' })
        });
        var data = await res.json();
        if (data.success) {
          markSubscribed();
          var wrap    = document.getElementById('sol-ei-form-wrap');
          var success = document.getElementById('sol-ei-success');
          var hl      = document.getElementById('sol-ei-success-hl');
          if (wrap)    wrap.style.display = 'none';
          if (hl)      hl.textContent = data.already_subscribed ? 'You\u2019re already in!' : 'Welcome to the Garden Club!';
          if (success) success.style.display = 'block';
          // Auto-close after 4s
          setTimeout(closePopup, 4000);
        } else {
          btn.textContent = 'Get My Discount';
          btn.disabled = false;
        }
      } catch (err) {
        btn.textContent = 'Get My Discount';
        btn.disabled = false;
      }
    });
  }

  // ── Exit-intent detection ─────────────────────────────────────────────────
  function init() {
    // Detect mobile by UA or viewport width
    var isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
                   window.innerWidth < 768;

    if (!isMobile) {
      // ── Desktop: cursor moves to top of browser (toward tab bar / close button)
      var triggered = false;
      var startDelay = 3000; // give 3s for page to settle

      var onMouseLeave = function (e) {
        if (triggered) return;
        // e.clientY <= 10 means cursor left the top of the viewport
        if (e.clientY <= 10) {
          triggered = true;
          document.removeEventListener('mouseleave', onMouseLeave);
          showPopup();
        }
      };

      setTimeout(function () {
        document.addEventListener('mouseleave', onMouseLeave);
      }, startDelay);

    } else {
      // ── Mobile: 30s timer OR scroll-up gesture
      var fired = false;
      var lastY = window.scrollY;
      var upStart = null;

      function fire() {
        if (fired) return;
        fired = true;
        window.removeEventListener('scroll', onScroll);
        showPopup();
      }

      // 30-second timer
      var timer = setTimeout(fire, 30000);

      function onScroll() {
        var y = window.scrollY;
        if (y < lastY && y > 300) {
          // Scrolling up and user has scrolled down at least 300px
          if (upStart === null) {
            upStart = lastY;
          } else if ((upStart - y) > 100) {
            // Scrolled up more than 100px — looks like abandonment
            clearTimeout(timer);
            fire();
          }
        } else {
          upStart = null;
        }
        lastY = y;
      }

      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
