/**
 * Limited Armor Chat Widget — Main UI
 * Full-featured chat widget with product cards, email capture, order tracking.
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

    container.innerHTML = `
      <!-- Greeting Tooltip -->
      <div id="cozy-chat-greeting">
        <button class="cc-greeting-close" aria-label="Close">&times;</button>
        <span id="cozy-chat-greeting-text"></span>
      </div>

      <!-- Chat Bubble -->
      <button id="cozy-chat-bubble" aria-label="Open chat">
        <span id="cozy-chat-badge"></span>
        <svg class="cc-chat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <svg class="cc-close-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>

      <!-- Chat Panel -->
      <div id="cozy-chat-panel">
        <div class="cc-header">
          <div class="cc-header-left">
            <div class="cc-header-avatar">${window.__cozyChatConfig?.avatar || '🛡️'}</div>
            <div class="cc-header-info">
              <div class="cc-header-name">${window.__cozyChatConfig?.storeName || 'Limited Armor'}</div>
              <div class="cc-header-status"><span class="cc-status-dot"></span>Online now</div>
            </div>
          </div>
          <button class="cc-header-close" aria-label="Close chat">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div class="cc-messages" id="cozy-chat-messages">
          <div class="cc-typing" id="cozy-chat-typing">
            <div class="cc-typing-dot"></div>
            <div class="cc-typing-dot"></div>
            <div class="cc-typing-dot"></div>
          </div>
        </div>

        <div class="cc-input-area">
          <textarea class="cc-input" id="cozy-chat-input" placeholder="Message..." rows="1"></textarea>
          <button class="cc-send-btn" id="cozy-chat-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
          </button>
        </div>

        <div class="cc-powered">Powered by ${window.__cozyChatConfig?.storeName || 'Limited Armor'} AI</div>
      </div>
    `;

    document.body.appendChild(container);
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

    // Auto-resize textarea
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
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

    panel.classList.add('cc-open');
    bubble.classList.add('cc-open');
    badge.classList.remove('cc-show');

    window.dispatchEvent(new CustomEvent('cozy-chat-opened'));
    saveState();

    // Load session or start new
    loadSession();

    // Focus input
    setTimeout(() => {
      document.getElementById('cozy-chat-input').focus();
    }, 350);
  }

  function closeChat() {
    state.isOpen = false;

    const panel = document.getElementById('cozy-chat-panel');
    const bubble = document.getElementById('cozy-chat-bubble');

    panel.classList.remove('cc-open');
    bubble.classList.remove('cc-open');
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

  function loadSession() {
    state.visitorId = window.__cozyChatBehavioral?.getVisitorId() || getVisitorId();

    // Always clear first to prevent duplicates
    clearMessages();

    const savedConvoId = sessionStorage.getItem('cozy_convo_id');
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
      addAssistantMessage("Sorry, I'm having a moment! Please try again or email us at ${window.__cozyChatConfig?.supportEmail || 'support@limitedarmor.com'} 💙");
    }
  }

  // ── Render Messages ──

  function addUserMessageBubble(text) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const msgEl = document.createElement('div');
    msgEl.className = 'cc-message cc-user';
    msgEl.textContent = text;

    messagesEl.insertBefore(msgEl, typing);
    scrollToBottom();
  }

  function addAssistantMessage(text) {
    const messagesEl = document.getElementById('cozy-chat-messages');
    const typing = document.getElementById('cozy-chat-typing');

    const msgEl = document.createElement('div');
    msgEl.className = 'cc-message cc-assistant';
    msgEl.innerHTML = formatMessage(text);

    messagesEl.insertBefore(msgEl, typing);
    scrollToBottom();
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

    const card = document.createElement('div');
    card.className = 'cc-product-card';

    const priceHtml = product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price)
      ? `<span class="cc-sale-price">$${parseFloat(product.price).toFixed(2)}</span>
         <span class="cc-original-price">$${parseFloat(product.compareAtPrice).toFixed(2)}</span>
         ${product.discount ? `<span class="cc-badge">${product.discount}</span>` : ''}`
      : `<span class="cc-sale-price">$${parseFloat(product.price).toFixed(2)}</span>`;

    card.innerHTML = `
      ${product.image ? `<img src="${product.image}" alt="${product.title}" loading="lazy">` : ''}
      <div class="cc-product-card-body">
        <div class="cc-product-card-title">${product.title}</div>
        <div class="cc-product-card-price">${priceHtml}</div>
        <a href="${product.url}" target="_blank" class="cc-product-card-btn">View Product →</a>
      </div>
    `;

    messagesEl.insertBefore(card, typing);
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
          <div class="cc-email-capture-success" style="color: var(--cc-text-light);">
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
    setTimeout(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }, 50);
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
