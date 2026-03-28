/**
 * Cozy Cloud Chat — Behavioral AI Engine
 * Detects user behavior and triggers chat engagement at the optimal moment.
 * Mirrors Rep.ai's behavioral triggers: exit-intent, scroll depth, inactivity, time-on-page.
 */
(function () {
  'use strict';

  const CONFIG = {
    // Time-on-page trigger (ms) — engage after this duration
    timeOnPageThreshold: 30000,
    // Inactivity trigger (ms) — engage after no interaction
    inactivityThreshold: 45000,
    // Scroll depth trigger (%) — engage when user scrolls this far
    scrollDepthThreshold: 60,
    // Exit intent sensitivity (px from top of viewport)
    exitIntentSensitivity: 10,
    // Minimum time before any trigger fires (ms) — avoid instant popups
    minimumDelay: 5000,
    // Cooldown between triggers (ms)
    triggerCooldown: 120000,
    // Max triggers per session
    maxTriggersPerSession: 3,
    // Event reporting interval (ms)
    eventReportInterval: 5000,
  };

  const state = {
    pageLoadTime: Date.now(),
    lastActivity: Date.now(),
    maxScrollDepth: 0,
    triggersFired: 0,
    lastTriggerTime: 0,
    triggered: false,
    chatOpened: false,
    visitorId: null,
    eventQueue: [],
    mouseMoveCount: 0,
    pageViews: [],
  };

  // ── Visitor ID Management ──

  function getVisitorId() {
    let id = localStorage.getItem('cozy_visitor_id');
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      localStorage.setItem('cozy_visitor_id', id);
    }
    state.visitorId = id;
    return id;
  }

  // ── Event Tracking ──

  function trackEvent(eventType, metadata = {}) {
    state.eventQueue.push({
      visitorId: state.visitorId,
      eventType,
      pageUrl: window.location.pathname,
      metadata,
      timestamp: Date.now(),
    });
  }

  function flushEvents() {
    if (state.eventQueue.length === 0) return;
    const host = window.__cozyChatConfig?.host || '';
    const events = [...state.eventQueue];
    state.eventQueue = [];

    // Send events in batch
    for (const event of events) {
      fetch(`${host}/api/events/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
      }).catch(() => {});
    }
  }

  // ── Trigger System ──

  function canTrigger() {
    const now = Date.now();
    const elapsed = now - state.pageLoadTime;
    const sinceLastTrigger = now - state.lastTriggerTime;

    return (
      !state.triggered &&
      !state.chatOpened &&
      elapsed > CONFIG.minimumDelay &&
      sinceLastTrigger > CONFIG.triggerCooldown &&
      state.triggersFired < CONFIG.maxTriggersPerSession
    );
  }

  function fireTrigger(type) {
    if (!canTrigger()) return;

    state.triggered = true;
    state.triggersFired++;
    state.lastTriggerTime = Date.now();

    trackEvent('trigger_fired', { type });

    // Dispatch custom event for the widget to listen to
    window.dispatchEvent(new CustomEvent('cozy-chat-trigger', {
      detail: {
        type,
        sourcePage: window.location.pathname,
        scrollDepth: state.maxScrollDepth,
        timeOnPage: Date.now() - state.pageLoadTime,
      },
    }));
  }

  // ── Exit Intent Detection ──

  function handleMouseLeave(e) {
    if (e.clientY <= CONFIG.exitIntentSensitivity && e.relatedTarget === null) {
      fireTrigger('exit-intent');
    }
  }

  // ── Scroll Depth Tracking ──

  function handleScroll() {
    state.lastActivity = Date.now();

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const winHeight = window.innerHeight;
    const scrollPercent = Math.round((scrollTop / (docHeight - winHeight)) * 100);

    if (scrollPercent > state.maxScrollDepth) {
      state.maxScrollDepth = scrollPercent;

      // Track scroll milestones
      if (scrollPercent >= 25 && scrollPercent < 50) {
        trackEvent('scroll_depth', { depth: 25 });
      } else if (scrollPercent >= 50 && scrollPercent < 75) {
        trackEvent('scroll_depth', { depth: 50 });
      } else if (scrollPercent >= 75) {
        trackEvent('scroll_depth', { depth: 75 });
      }

      // Trigger chat if scroll threshold reached
      if (scrollPercent >= CONFIG.scrollDepthThreshold) {
        fireTrigger('scroll-depth');
      }
    }
  }

  // ── Inactivity Detection ──

  function handleActivity() {
    state.lastActivity = Date.now();
    state.mouseMoveCount++;
  }

  function checkInactivity() {
    const inactive = Date.now() - state.lastActivity;
    if (inactive >= CONFIG.inactivityThreshold) {
      fireTrigger('inactivity');
    }
  }

  // ── Time on Page ──

  function checkTimeOnPage() {
    const elapsed = Date.now() - state.pageLoadTime;
    if (elapsed >= CONFIG.timeOnPageThreshold) {
      fireTrigger('time-on-page');
    }
  }

  // ── Product Page Detection ──

  function detectProductPage() {
    const path = window.location.pathname;
    if (path.includes('/products/')) {
      trackEvent('product_view', {
        handle: path.split('/products/')[1]?.split('?')[0],
      });
    } else if (path.includes('/collections/')) {
      trackEvent('collection_view', {
        handle: path.split('/collections/')[1]?.split('?')[0],
      });
    } else if (path === '/cart') {
      trackEvent('cart_view', {});
      // Cart page — high intent, trigger quickly
      setTimeout(() => {
        if (canTrigger()) fireTrigger('cart-page');
      }, 10000);
    }
  }

  // ── Cart Abandonment Detection ──

  function detectCartAbandonment() {
    // Listen for Shopify cart changes
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/cart/add')) {
        trackEvent('add_to_cart', {});
      }
      if (url.includes('/cart/change') || url.includes('/cart/update')) {
        trackEvent('cart_update', {});
      }
      return originalFetch.apply(this, args);
    };

    // Also intercept XMLHttpRequest
    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url && url.includes('/cart/add')) {
        trackEvent('add_to_cart', {});
      }
      return origOpen.apply(this, arguments);
    };
  }

  // ── Initialize ──

  function init() {
    getVisitorId();
    trackEvent('page_view', { referrer: document.referrer });
    detectProductPage();
    detectCartAbandonment();

    // Event listeners
    document.addEventListener('mouseleave', handleMouseLeave);
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousemove', handleActivity, { passive: true });
    document.addEventListener('click', handleActivity, { passive: true });
    document.addEventListener('keydown', handleActivity, { passive: true });
    document.addEventListener('touchstart', handleActivity, { passive: true });

    // Periodic checks
    setInterval(checkInactivity, 5000);
    setInterval(checkTimeOnPage, 5000);
    setInterval(flushEvents, CONFIG.eventReportInterval);

    // Flush events before page unload
    window.addEventListener('beforeunload', () => {
      trackEvent('page_exit', {
        timeOnPage: Date.now() - state.pageLoadTime,
        maxScroll: state.maxScrollDepth,
      });
      flushEvents();
    });

    // Listen for chat open (reset trigger state)
    window.addEventListener('cozy-chat-opened', () => {
      state.chatOpened = true;
      trackEvent('chat_opened', {});
    });

    // Allow retrigger if chat closed without interaction
    window.addEventListener('cozy-chat-closed', (e) => {
      if (!e.detail?.hadInteraction) {
        state.triggered = false;
        state.chatOpened = false;
      }
    });

    // Expose API for widget
    window.__cozyChatBehavioral = {
      getVisitorId: () => state.visitorId,
      getState: () => ({ ...state }),
      trackEvent,
      resetTrigger: () => { state.triggered = false; state.chatOpened = false; },
    };
  }

  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
