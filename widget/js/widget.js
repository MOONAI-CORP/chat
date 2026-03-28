/**
 * Cozy Cloud Chat Widget — Main UI
 * Full-featured chat widget with product cards, email capture, order tracking.
 * iMessage dark theme.
 */
(function () {
  'use strict';

  const HOST = window.__cozyChatConfig?.host || '';
  const STORE_URL = window.__cozyChatConfig?.storeUrl || 'https://limitedarmor.com';

  const state = {
    isOpen: false,
    conversationId: null,
    visitorId: null,
    messages: [],
    isTyping: false,
    hadInteraction: false,
    greetingShown: false,
  };

  // ── Build DOM ──

  function createWidget() {
    const container = document.createElement('div');
    container.id = 'cozy-chat-widget';

    const storeName = window.__cozyChatConfig?.storeName || 'Limited Armor';
    const avatar = window.__cozyChatConfig?.avatar || '🛡️';
    const initials = storeName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    container.innerHTML = `
      <!-- Greeting Tooltip -->
      <div id="cozy-chat-greeting">
        <button class="cc-greeting-close" aria-label="Close">&times;</button>
        <span id="cozy-chat-greeting-text"></span>
      </div>

      <!-- Chat Launcher -->
      <button id="cozy-chat-bubble" aria-label="Open chat">
        <div class="cc-launcher-inner">
          <img class="cc-launcher-logo" src="" alt="" />
          <svg class="cc-launcher-icon" width="30" height="30" viewBox="0 0 28 28" fill="none">
            <path d="M14 2C7.373 2 2 6.925 2 13c0 2.21.72 4.26 1.95 5.96L2.5 22.5l4.04-1.3A12.07 12.07 0 0014 24c6.627 0 12-4.925 12-11S20.627 2 14 2z" fill="white"/>
          </svg>
          <svg class="cc-launcher-close" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <span id="cozy-chat-badge"></span>
      </button>

      <!-- Chat Panel -->
      <div id="cozy-chat-panel">
        <!-- Header -->
        <div class="cc-header">
          <!-- Brand banner -->
          <div class="cc-brand-banner">
            <div class="cc-brand-banner-bg"></div>
            <img class="cc-brand-logo-img" src="" alt="Brand Logo" />
            <span class="cc-brand-logo-text">${storeName}</span>
          </div>
          <!-- Agent row -->
          <div class="cc-agent-row">
            <div class="cc-avatar-wrap">
              <div class="cc-header-avatar">
                <img class="cc-avatar-photo" src="" alt="" />
                <span class="cc-avatar-initials">${initials}</span>
              </div>
              <div class="cc-online-dot"></div>
            </div>
            <div class="cc-header-info">
              <div class="cc-header-name">${storeName}</div>
              <div class="cc-header-status">Active now</div>
            </div>
            <div class="cc-header-actions">
              <button class="cc-header-close" aria-label="Minimize chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Messages area -->
        <div class="cc-messages" id="cozy-chat-messages">
          <div class="cc-typing" id="cozy-chat-typing">
            <div class="cc-typing-dot"></div>
            <div class="cc-typing-dot"></div>
            <div class="cc-typing-dot"></div>
          </div>
        </div>

        <!-- Quick reply bar (hidden by default) -->
        <div class="cc-qr-bar" id="cozy-chat-qr-bar"></div>

        <!-- Input bar -->
        <div class="cc-input-area">
          <div class="cc-input-row">
            <div class="cc-input-wrap">
              <button class="cc-img-btn" aria-label="Attach image" tabindex="-1">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
              </button>
              <textarea class="cc-input" id="cozy-chat-input" placeholder="Message" rows="1"></textarea>
            </div>
            <button class="cc-send-btn" id="cozy-chat-send" aria-label="Send message" disabled>
              <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7"/>
              </svg>
            </button>
          </div>
          <div class="cc-powered">Powered by <b>${storeName}</b></div>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // Apply avatar from config if it's a URL
    const avatarConfig = window.__cozyChatConfig?.avatar;
    if (avatarConfig && (avatarConfig.startsWith('http') || avatarConfig.startsWith('/'))) {
      const photoEl = container.querySelector('.cc-avatar-photo');
      photoEl.src = avatarConfig;
      photoEl.onload = () => photoEl.classList.add('loaded');
      // Also set on launcher
      const launcherLogo = container.querySelector('.cc-launcher-logo');
      launcherLogo.src = avatarConfig;
      launcherLogo.onload = () => {
        launcherLogo.classList.add('loaded');
        container.querySelector('.cc-launcher-icon').style.opacity = '0';
      };
      container.querySelector('.cc-avatar-initials').style.opacity = '0';
    }

    bindEvents();
  }

  // ── Event Bindings ──

  function bindEvents() {
    const bubble = document.getElementById('cozy-chat-bubble');
    const closeBtn = document.querySelector('.cc-header-close');
    const sendBtn = document.getElementById('cozy-chat-send');
    const input = document.getElementById('cozy-chat-input');
    const greeting = document.getElementById('cozy-chat-greeting');
    const greetingClose = greeting.querySelector('.cc-greeting-close');

    bubble.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', closeChat);
    sendBtn.addEventListener('click', sendMessage);
    greeting.addEventListener('click', (e) => {
      if (e.target !== greetingClose) openChat();
    });
    greetingClose.addEventListener('click', (e) => {
      e.stopPropagation();
      hideGreeting();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea + toggle send button
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
      const sendBtn = document.getElementById('cozy-chat-send');
      sendBtn.disabled = !input.value.trim();
    });

    // Listen for behavioral triggers
    window.addEventListener('cozy-chat-trigger', (e) => {
      if (!state.isOpen && !state.greetingShown) {
        showGreeting(e.detail);
      }
    });
  }

  // ── Chat Open / Close ──

  function toggleChat() {
    if (state.isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    state.isOpen = true;
    hideGreeting();

    const panel = document.getElementById('cozy-chat-panel');
    const bubble = document.getElementById('cozy-chat-bubble');
    const badge = document.getElementById('cozy-chat-badge');
    const launcherIcon = bubble.querySelector('.cc-launcher-icon');
    const launcherClose = bubble.querySelector('.cc-launcher-close');

    panel.classList.add('cc-open');
    badge.classList.remove('cc-show');

    // Toggle launcher icons
    if (launcherIcon) launcherIcon.classList.add('hide');
    if (launcherClose) launcherClose.classList.add('show');

    window.dispatchEvent(new CustomEvent('cozy-chat-opened'));
    saveState();

    // Load session or start new
    loadSession();

    // Focus input
    setTimeout(() => {
      document.getElementById('cozy-chat-input').focus();
    }, 420);
  }

  function closeChat() {
    state.isOpen = false;

    const panel = document.getElementById('cozy-chat-panel');
    const bubble = document.getElementById('cozy-chat-bubble');
    const launcherIcon = bubble.querySelector('.cc-launcher-icon');
    const launcherClose = bubble.querySelector('.cc-launcher-close');

    panel.classList.remove('cc-open');

    // Toggle launcher icons
    if (launcherIcon) launcherIcon.classList.remove('hide');
    if (launcherClose) launcherClose.classList.remove('show');

    saveState();

    window.dispatchEvent(new CustomEvent('cozy-chat-closed', {
      detail: { hadInteraction: state.hadInteraction }
    }));
  }

  // ── Greeting ──

  async function showGreeting(triggerDetail) {
    state.greetingShown = true;
    const triggerType = triggerDetail.type || 'default';
    const sourcePage = triggerDetail.sourcePage || window.location.pathname;

    try {
      const res = await fetch(`${HOST}/api/chat/greeting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourcePage,
          triggerType,
          isReturnVisitor: triggerDetail.isReturnVisitor,
          visitCount: triggerDetail.visitCount,
          productsViewed: triggerDetail.productsViewed,
          sessionPages: triggerDetail.sessionPages,
          addToCartCount: triggerDetail.addToCartCount,
          cartDetected: triggerDetail.cartDetected,
        }),
      });
      const data = await res.json();

      const greetingEl = document.getElementById('cozy-chat-greeting');
      const textEl = document.getElementById('cozy-chat-greeting-text');
      textEl.textContent = data.message;
      greetingEl.classList.add('cc-show');

      // Show badge
      document.getElementById('cozy-chat-badge').classList.add('cc-show');

      // Auto-hide after 15s
      setTimeout(() => {
        if (!state.isOpen) hideGreeting();
      }, 15000);
    } catch (e) {
      console.error('Greeting error:', e);
    }
  }

  function hideGreeting() {
    const greetingEl = document.getElementById('cozy-chat-greeting');
    greetingEl.classList.remove('cc-show');
  }

  // ── Session Management ──

  function clearMessages() {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');
    messagesEl.innerHTML = '';
    messagesEl.appendChild(typing);
  }

  function addTimestamp() {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');
    const ts = document.createElement('div');
    ts.className = 'cc-timestamp';
    const now = new Date();
    ts.textContent = 'Today ' + now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    messagesEl.insertBefore(ts, typing);
  }

  function loadSession() {
    state.visitorId = window.__cozyChatBehavioral?.getVisitorId() || getVisitorId();

    // Always clear first to prevent duplicates
    clearMessages();

    const savedConvoId = sessionStorage.getItem('cozy_convo_id');
    addTimestamp();
    if (savedConvoId) {
      state.conversationId = savedConvoId;
      loadHistory(savedConvoId);
    } else {
      addAssistantMessage(`Hey! Welcome to ${window.__cozyChatConfig?.storeName || 'Limited Armor'} ${window.__cozyChatConfig?.avatar || '🛡️'}\n\nWhat are you shopping for today? A new phone case, Apple Watch band, wallet, or something else?`);
    }
  }

  async function loadHistory(conversationId) {
    try {
      const res = await fetch(`${HOST}/api/chat/history/${conversationId}`);
      const data = await res.json();

      // Clear again in case of race condition
      clearMessages();
      addTimestamp();

      if (data.messages && data.messages.length > 0) {
        for (const msg of data.messages) {
          if (msg.role === 'user') {
            addUserMessageBubble(msg.content);
          } else {
            addAssistantMessage(msg.content);
            if (msg.product_cards) {
              try {
                const cards = JSON.parse(msg.product_cards);
                cards.forEach(card => renderProductCard(card));
              } catch (e) {}
            }
          }
        }
      } else {
        addAssistantMessage(`Hey! Welcome back to ${window.__cozyChatConfig?.storeName || 'Limited Armor'} ${window.__cozyChatConfig?.avatar || '🛡️'}\n\nHow can I help you today?`);
      }
    } catch (e) {
      addAssistantMessage(`Hey! Welcome to ${window.__cozyChatConfig?.storeName || 'Limited Armor'} ${window.__cozyChatConfig?.avatar || '🛡️'}\n\nI'm here to help — ask me anything!`);
    }
  }

  function getVisitorId() {
    let id = localStorage.getItem('cozy_visitor_id');
    if (!id) {
      id = 'v_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
      localStorage.setItem('cozy_visitor_id', id);
    }
    return id;
  }

  // ── Send Message ──

  async function sendMessage() {
    const input = document.getElementById('cozy-chat-input');
    const message = input.value.trim();
    if (!message) return;

    state.hadInteraction = true;
    saveState();
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('cozy-chat-send').disabled = true;

    // Add user message to UI
    addUserMessageBubble(message);

    // Show typing
    showTyping();

    try {
      const res = await fetch(`${HOST}/api/chat/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: state.conversationId,
          visitorId: state.visitorId,
          message,
          sourcePage: window.location.pathname,
        }),
      });

      const data = await res.json();

      hideTyping();

      // Save conversation ID
      state.conversationId = data.conversationId;
      sessionStorage.setItem('cozy_convo_id', data.conversationId);

      // Add assistant message
      if (data.message) {
        addAssistantMessage(data.message);
      }

      // Render product cards
      if (data.productCards && data.productCards.length > 0) {
        data.productCards.forEach(card => renderProductCard(card));
      }

      // Show email capture
      if (data.showEmailCapture) {
        renderEmailCapture();
      }

      // Render links
      if (data.links && data.links.length > 0) {
        renderLinks(data.links);
      }

      // Render order data
      if (data.orderData) {
        renderOrderCard(data.orderData);
      }
    } catch (err) {
      hideTyping();
      addAssistantMessage("Sorry, I'm having a moment! Please try again or email us at " + (window.__cozyChatConfig?.supportEmail || 'support@limitedarmor.com') + " 💙");
    }
  }

  // ── Render Messages ──

  function currentTimeStr() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function addUserMessageBubble(text) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    // Create row wrapper
    const row = document.createElement('div');
    row.className = 'cc-row sent';

    const bub = document.createElement('div');
    bub.className = 'cc-bubble';
    bub.textContent = text;
    row.appendChild(bub);

    const ts = document.createElement('div');
    ts.className = 'cc-ts';
    ts.textContent = currentTimeStr();
    row.appendChild(ts);

    const rec = document.createElement('div');
    rec.className = 'cc-receipt';
    rec.textContent = 'Delivered';
    row.appendChild(rec);

    // Change to "Read" after a delay
    setTimeout(() => { rec.textContent = 'Read'; }, 2200);

    messagesEl.insertBefore(row, typing);
    updateBubbleGrouping(messagesEl);
    scrollToBottom();
  }

  function addAssistantMessage(text) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const row = document.createElement('div');
    row.className = 'cc-row recv';

    const bub = document.createElement('div');
    bub.className = 'cc-bubble';
    bub.innerHTML = formatMessage(text);
    row.appendChild(bub);

    const ts = document.createElement('div');
    ts.className = 'cc-ts';
    ts.textContent = currentTimeStr();
    row.appendChild(ts);

    messagesEl.insertBefore(row, typing);
    updateBubbleGrouping(messagesEl);
    scrollToBottom();
  }

  // Group bubbles — apply top/mid/bottom classes for consecutive same-sender messages
  function updateBubbleGrouping(container) {
    const rows = container.querySelectorAll('.cc-row');
    rows.forEach((row) => {
      const bubble = row.querySelector('.cc-bubble');
      if (!bubble) return;
      bubble.classList.remove('top', 'mid', 'bottom');
    });

    const rowArr = Array.from(rows);
    for (let i = 0; i < rowArr.length; i++) {
      const row = rowArr[i];
      const bubble = row.querySelector('.cc-bubble');
      if (!bubble) continue;

      const isSent = row.classList.contains('sent');
      const prev = rowArr[i - 1];
      const next = rowArr[i + 1];
      const prevSame = prev && prev.classList.contains(isSent ? 'sent' : 'recv') && prev.querySelector('.cc-bubble');
      const nextSame = next && next.classList.contains(isSent ? 'sent' : 'recv') && next.querySelector('.cc-bubble');

      if (prevSame && nextSame) {
        bubble.classList.add('mid');
      } else if (!prevSame && nextSame) {
        bubble.classList.add('top');
      } else if (prevSame && !nextSame) {
        bubble.classList.add('bottom');
      }
      // If neither prevSame nor nextSame => standalone, no class needed (default full radius)
    }
  }

  function formatMessage(text) {
    // Convert line breaks
    let html = text.replace(/\n/g, '<br>');
    // Bold text **text**
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    return html;
  }

  // ── Product Card ──

  function renderProductCard(product) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const row = document.createElement('div');
    row.className = 'cc-row recv';

    const card = document.createElement('a');
    card.className = 'cc-product-card';
    card.href = product.url || '#';
    card.target = '_blank';

    const priceHtml = product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price)
      ? `<span class="cc-sale-price">$${parseFloat(product.price).toFixed(2)}</span>
         <span class="cc-original-price">$${parseFloat(product.compareAtPrice).toFixed(2)}</span>
         ${product.discount ? `<span class="cc-badge">${product.discount}</span>` : ''}`
      : `<span class="cc-sale-price">$${parseFloat(product.price).toFixed(2)}</span>`;

    card.innerHTML = `
      <div class="cc-product-thumb">
        ${product.image ? `<img src="${product.image}" alt="${product.title}" loading="lazy">` : '📦'}
      </div>
      <div class="cc-product-card-body">
        <div class="cc-product-card-title">${product.title}</div>
        <div class="cc-product-card-price">${priceHtml}</div>
        <span class="cc-product-card-btn">View Product →</span>
      </div>
    `;

    row.appendChild(card);
    messagesEl.insertBefore(row, typing);
    scrollToBottom();
  }

  // ── Email Capture ──

  function renderEmailCapture() {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const capture = document.createElement('div');
    capture.className = 'cc-email-capture';
    capture.innerHTML = `
      <div class="cc-email-capture-title">Get 10% Off Your First Order! 💌</div>
      <div class="cc-email-capture-subtitle">Drop your email and we'll send your exclusive discount code.</div>
      <div class="cc-email-capture-form">
        <input type="email" class="cc-email-capture-input" placeholder="your@email.com">
        <button class="cc-email-capture-submit">Get Code</button>
      </div>
    `;

    const submitBtn = capture.querySelector('.cc-email-capture-submit');
    const emailInput = capture.querySelector('.cc-email-capture-input');

    submitBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) return;

      try {
        const res = await fetch(`${HOST}/api/chat/capture-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: state.conversationId,
            email,
            sourcePage: window.location.pathname,
          }),
        });
        const data = await res.json();

        capture.querySelector('.cc-email-capture-form').innerHTML = `
          <div class="cc-email-capture-success">
            🎉 Your code: <strong>${data.discountCode}</strong><br>
            <small>Applied at checkout automatically!</small>
          </div>
        `;
      } catch (e) {
        capture.querySelector('.cc-email-capture-form').innerHTML = `
          <div class="cc-email-capture-success" style="color: rgba(255,255,255,0.4);">
            Something went wrong. Email ${window.__cozyChatConfig?.supportEmail || 'support@limitedarmor.com'} for your discount!
          </div>
        `;
      }
    });

    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitBtn.click();
    });

    messagesEl.insertBefore(capture, typing);
    scrollToBottom();
  }

  // ── Order Card ──

  function renderOrderCard(orderData) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    // Handle single order or array
    const orders = Array.isArray(orderData) ? orderData : [orderData];

    for (const order of orders) {
      const card = document.createElement('div');
      card.className = 'cc-order-card';

      const statusClass = order.fulfillment === 'fulfilled' ? 'cc-fulfilled'
        : order.fulfillment === 'cancelled' ? 'cc-cancelled'
        : 'cc-unfulfilled';

      const statusLabel = order.fulfillment === 'fulfilled' ? 'Shipped'
        : order.fulfillment === 'unfulfilled' ? 'Processing'
        : order.fulfillment;

      let itemsHtml = '';
      if (order.items) {
        itemsHtml = order.items.map(i =>
          `<div class="cc-order-card-row"><span>${i.title} x${i.quantity}</span><strong>$${i.price}</strong></div>`
        ).join('');
      }

      card.innerHTML = `
        <div class="cc-order-card-header">Order ${order.number}</div>
        <div class="cc-order-card-row">
          <span>Status</span>
          <span class="cc-order-card-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="cc-order-card-row">
          <span>Total</span>
          <strong>$${order.total}</strong>
        </div>
        <div class="cc-order-card-row">
          <span>Placed</span>
          <span>${new Date(order.createdAt).toLocaleDateString()}</span>
        </div>
        ${itemsHtml}
        ${order.trackingUrl ? `<a href="${order.trackingUrl}" target="_blank">Track Shipment →</a>` : ''}
      `;

      messagesEl.insertBefore(card, typing);
    }
    scrollToBottom();
  }

  // ── Links ──

  function renderLinks(links) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const linksContainer = document.createElement('div');
    linksContainer.style.cssText = 'align-self: flex-start; display: flex; flex-wrap: wrap; gap: 6px;';

    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.url.startsWith('/') ? STORE_URL + link.url : link.url;
      a.target = '_blank';
      a.className = 'cc-link-btn';
      a.textContent = link.text;
      linksContainer.appendChild(a);
    }

    messagesEl.insertBefore(linksContainer, typing);
    scrollToBottom();
  }

  // ── Typing Indicator ──

  function showTyping() {
    state.isTyping = true;
    document.getElementById('cozy-chat-typing').classList.add('cc-show');
    scrollToBottom();
  }

  function hideTyping() {
    state.isTyping = false;
    document.getElementById('cozy-chat-typing').classList.remove('cc-show');
  }

  // ── Scroll ──

  function scrollToBottom() {
    const messagesEl = document.getElementById('cozy-chat-messages');
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  // ── Persist State ──

  function saveState() {
    sessionStorage.setItem('cozy_chat_open', state.isOpen ? '1' : '0');
    sessionStorage.setItem('cozy_chat_interacted', state.hadInteraction ? '1' : '0');
    if (state.greetingShown) {
      sessionStorage.setItem('cozy_greeting_shown', '1');
    }
  }

  function restoreState() {
    state.hadInteraction = sessionStorage.getItem('cozy_chat_interacted') === '1';
    state.greetingShown = sessionStorage.getItem('cozy_greeting_shown') === '1';
    const wasOpen = sessionStorage.getItem('cozy_chat_open') === '1';

    if (wasOpen || state.hadInteraction) {
      // Re-open chat silently — restore the panel without animation delay
      openChat();
    }
  }

  // ── Initialize ──

  function init() {
    createWidget();
    restoreState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
