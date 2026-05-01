/**
 * Loganville Flowers Conversion Tracking
 * Captures UTM params and fires funnel events to /api/events
 *
 * Events:
 *   page_view       — every page load (auto-fired)
 *   product_view    — product detail page after product loads
 *   add_to_cart     — user opens the order modal
 *   checkout_start  — user submits order form
 *   order_complete  — order confirmed (order-success.html OR inline success)
 */
(function () {
  'use strict';

  var SESSION_KEY = '_lf_sid';
  var UTM_KEY     = '_lf_utm';
  var UTM_PARAMS  = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  // ── Session ID ──────────────────────────────────────────
  function getSessionId() {
    try {
      var sid = sessionStorage.getItem(SESSION_KEY);
      if (!sid) {
        sid = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
        sessionStorage.setItem(SESSION_KEY, sid);
      }
      return sid;
    } catch (e) {
      return 'sid_' + Date.now();
    }
  }

  // ── UTM Capture ─────────────────────────────────────────
  function captureUtm() {
    try {
      var params = new URLSearchParams(window.location.search);
      var utm = {};
      var hasUtm = false;
      UTM_PARAMS.forEach(function (k) {
        var v = params.get(k);
        if (v) { utm[k] = v; hasUtm = true; }
      });
      if (hasUtm) {
        sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
      }
    } catch (e) {}
  }

  function getUtm() {
    try {
      return JSON.parse(sessionStorage.getItem(UTM_KEY) || '{}');
    } catch (e) {
      return {};
    }
  }

  // ── Event Sender ─────────────────────────────────────────
  function sendEvent(payload) {
    try {
      var body = JSON.stringify(payload);
      if (typeof navigator.sendBeacon === 'function') {
        var blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/events', blob);
      } else {
        fetch('/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: body,
          keepalive: true
        });
      }
    } catch (e) {}
  }

  // ── Public API ───────────────────────────────────────────
  window.trackEvent = function (eventType, extras) {
    try {
      var payload = {
        event_type:  eventType,
        utm_params:  getUtm(),
        session_id:  getSessionId(),
        timestamp:   new Date().toISOString()
      };
      if (extras) {
        if (extras.product_id)   payload.product_id   = extras.product_id;
        if (extras.product_slug) payload.product_slug = extras.product_slug;
      }
      sendEvent(payload);
    } catch (e) {
      // Tracking must never crash the page
    }
  };

  // ── Auto: capture UTM on every load ─────────────────────
  captureUtm();

  // ── Auto: fire page_view ─────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      window.trackEvent('page_view');
    });
  } else {
    window.trackEvent('page_view');
  }

})();
