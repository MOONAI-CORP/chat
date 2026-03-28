/**
 * Cozy Cloud Chat — Behavioral AI Engine v2
 * Proactive engagement based on real behavioral cues.
 * Detects: browse patterns, product comparison, hesitation, cart state,
 * return visits, rapid scrolling, and contextual page intent.
 */
(function () {
  'use strict';

  const CONFIG = {
    // Time-on-page triggers (ms)
    timeOnPageProduct: 12000,   // Product page — shorter, they're evaluating
    timeOnPageCollection: 20000, // Collection — browsing, give them time
    timeOnPageGeneral: 30000,    // Homepage/other — standard
    // Inactivity trigger (ms) — they stopped, maybe stuck
    inactivityThreshold: 20000,
    // Scroll depth trigger (%)
    scrollDepthThreshold: 55,
    // Exit intent sensitivity (px)
    exitIntentSensitivity: 10,
    // Minimum time before any trigger (ms)
    minimumDelay: 4000,
    // Cooldown between triggers (ms)
    triggerCooldown: 90000,
    // Max triggers per session
    maxTriggersPerSession: 3,
    // Event reporting interval (ms)
    eventReportInterval: 5000,
    // Rapid page switching detection (pages within this ms = comparing)
    rapidSwitchWindow: 30000,
    rapidSwitchThreshold: 3,
    // Hesitation: back-and-forth scroll on product page
    hesitationScrollReversals: 4,
    // Cart idle time before nudge (ms)
    cartIdleThreshold: 60000,
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
    // v2 additions
    scrollDirection: null,
    scrollReversals: 0,
    lastScrollY: 0,
    productsViewed: [],
    cartDetected: false,
    cartDetectedAt: 0,
    sessionPageViews: [],
    isReturnVisitor: false,
    visitCount: 0,
    addToCartCount: 0,
  };

  // ── Visitor ID & Return Detection ──

  function getVisitorId() {
    let id = localStorage.getItem('cozy_visitor_id');
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      localStorage.setItem('cozy_visitor_id', id);
    }
    state.visitorId = id;

    // Track visit count for return visitor detection
    const visits = parseInt(localStorage.getItem('cozy_visit_count') || '0', 10) + 1;
    localStorage.setItem('cozy_visit_count', visits);
    state.visitCount = visits;
    state.isReturnVisitor = visits > 1;

    // Track products viewed across sessions
    try {
      state.productsViewed = JSON.parse(localStorage.getItem('cozy_products_viewed') || '[]');
    } catch (e) { state.productsViewed = []; }

    // Track session page views for comparison detection
    try {
      const saved = JSON.parse(sessionStorage.getItem('cozy_session_pages') || '[]');
      state.sessionPageViews = saved;
    } catch (e) { state.sessionPageViews = []; }

    return id;
  }

  function saveProductView(handle) {
    if (!state.productsViewed.includes(handle)) {
      state.productsViewed.push(handle);
      // Keep last 20
      if (state.productsViewed.length > 20) state.productsViewed.shift();
      localStorage.setItem('cozy_products_viewed', JSON.stringify(state.productsViewed));
    }
  }

  function saveSessionPage(path) {
    state.sessionPageViews.push({ path, time: Date.now() });
    sessionStorage.setItem('cozy_session_pages', JSON.stringify(state.sessionPageViews));
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

    // Build rich context for AI-powered greeting
    const context = {
      type,
      sourcePage: window.location.pathname,
      scrollDepth: state.maxScrollDepth,
      timeOnPage: Date.now() - state.pageLoadTime,
      isReturnVisitor: state.isReturnVisitor,
      visitCount: state.visitCount,
      productsViewed: state.productsViewed.slice(-5),
      sessionPages: state.sessionPageViews.map(p => p.path).slice(-5),
      addToCartCount: state.addToCartCount,
      cartDetected: state.cartDetected,
    };

    window.dispatchEvent(new CustomEvent('cozy-chat-trigger', { detail: context }));
  }

  // ── Exit Intent Detection ──

  function handleMouseLeave(e) {
    if (e.clientY <= CONFIG.exitIntentSensitivity && e.relatedTarget === null) {
      fireTrigger('exit-intent');
    }
  }

  // ── Scroll Depth + Hesitation Tracking ──

  function handleScroll() {
    state.lastActivity = Date.now();

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const docHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const winHeight = window.innerHeight;
    const scrollPercent = Math.round((scrollTop / (docHeight - winHeight)) * 100);

    // Detect scroll direction reversals (hesitation signal)
    const newDirection = scrollTop > state.lastScrollY ? 'down' : 'up';
    if (state.scrollDirection && newDirection !== state.scrollDirection) {
      state.scrollReversals++;
      // Hesitation on a product page = strong buying signal
      if (state.scrollReversals >= CONFIG.hesitationScrollReversals
          && window.location.pathname.includes('/products/')) {
        fireTrigger('product-hesitation');
      }
    }
    state.scrollDirection = newDirection;
    state.lastScrollY = scrollTop;

    if (scrollPercent > state.maxScrollDepth) {
      state.maxScrollDepth = scrollPercent;

      if (scrollPercent >= 25 && scrollPercent < 50) {
        trackEvent('scroll_depth', { depth: 25 });
      } else if (scrollPercent >= 50 && scrollPercent < 75) {
        trackEvent('scroll_depth', { depth: 50 });
      } else if (scrollPercent >= 75) {
        trackEvent('scroll_depth', { depth: 75 });
      }

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

  // ── Time on Page (page-type aware) ──

  function checkTimeOnPage() {
    const elapsed = Date.now() - state.pageLoadTime;
    const path = window.location.pathname;

    let threshold = CONFIG.timeOnPageGeneral;
    if (path.includes('/products/')) threshold = CONFIG.timeOnPageProduct;
    else if (path.includes('/collections/')) threshold = CONFIG.timeOnPageCollection;

    if (elapsed >= threshold) {
      fireTrigger('time-on-page');
    }
  }

  // ── Comparison Shopping Detection ──

  function checkComparisonShopping() {
    const now = Date.now();
    const recentProductPages = state.sessionPageViews.filter(
      p => p.path.includes('/products/') && (now - p.time) < CONFIG.rapidSwitchWindow
    );
    if (recentProductPages.length >= CONFIG.rapidSwitchThreshold) {
      fireTrigger('comparison-shopping');
    }
  }

  // ── Cart Idle Detection ──

  function checkCartIdle() {
    if (state.cartDetected && !state.chatOpened) {
      const idle = Date.now() - state.cartDetectedAt;
      if (idle >= CONFIG.cartIdleThreshold) {
        fireTrigger('cart-idle');
        state.cartDetected = false; // Only fire once
      }
    }
  }

  // ── Page Context Detection ──

  function detectPageContext() {
    const path = window.location.pathname;
    saveSessionPage(path);

    if (path.includes('/products/')) {
      const handle = path.split('/products/')[1]?.split('?')[0];
      trackEvent('product_view', { handle });
      saveProductView(handle);

      // Return visitor viewing a product they've seen before = high intent
      if (state.isReturnVisitor && state.productsViewed.filter(h => h === handle).length > 1) {
        setTimeout(() => fireTrigger('return-product-revisit'), 6000);
      }
    } else if (path.includes('/collections/')) {
      trackEvent('collection_view', {
        handle: path.split('/collections/')[1]?.split('?')[0],
      });
    } else if (path === '/cart') {
      trackEvent('cart_view', {});
      state.cartDetected = true;
      state.cartDetectedAt = Date.now();
      // Cart page — high intent, trigger faster
      setTimeout(() => {
        if (canTrigger()) fireTrigger('cart-page');
      }, 8000);
    } else if (path === '/' && state.isReturnVisitor) {
      // Return visitor on homepage
      setTimeout(() => fireTrigger('return-visitor'), 8000);
    }
  }

  // ── Cart & Add-to-Cart Detection ──

  function detectCartActivity() {
    const originalFetch = window.fetch;
    window.fetch = function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/cart/add')) {
        state.addToCartCount++;
        state.cartDetected = true;
        state.cartDetectedAt = Date.now();
        trackEvent('add_to_cart', { count: state.addToCartCount });

        // After add-to-cart, if they keep browsing instead of checking out
        setTimeout(() => {
          if (canTrigger() && !window.location.pathname.includes('/checkout')) {
            fireTrigger('post-add-to-cart');
          }
        }, 45000);
      }
      if (url.includes('/cart/change') || url.includes('/cart/update')) {
        trackEvent('cart_update', {});
      }
      return originalFetch.apply(this, args);
    };

    const origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (url && url.includes('/cart/add')) {
        state.addToCartCount++;
        state.cartDetected = true;
        state.cartDetectedAt = Date.now();
        trackEvent('add_to_cart', { count: state.addToCartCount });
      }
      return origOpen.apply(this, arguments);
    };
  }

  // ── Initialize ──

  function init() {
    getVisitorId();
    trackEvent('page_view', {
      referrer: document.referrer,
      isReturn: state.isReturnVisitor,
      visitCount: state.visitCount,
    });
    detectPageContext();
    detectCartActivity();

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
    setInterval(checkComparisonShopping, 10000);
    setInterval(checkCartIdle, 10000);
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
