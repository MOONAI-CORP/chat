/**
 * Cozy Cloud Chat Widget — Main UI
 * Full-featured chat widget with product cards, email capture, order tracking.
 * iMessage dark theme with imsg- prefix structure.
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
    const initials = storeName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    container.innerHTML = `
      <!-- Greeting Tooltip -->
      <div id="cozy-chat-greeting">
        <button class="imsg-greeting-close" aria-label="Close">&times;</button>
        <span id="cozy-chat-greeting-text"></span>
      </div>

      <!-- Launcher -->
      <button id="imsg-launcher" aria-label="Open chat">
        <div id="imsg-launcher-inner">
          <img id="imsg-launcher-logo" src="" alt="" />
          <svg id="imsg-launcher-icon" width="30" height="30" viewBox="0 0 28 28" fill="none">
            <path d="M14 2C7.373 2 2 6.925 2 13c0 2.21.72 4.26 1.95 5.96L2.5 22.5l4.04-1.3A12.07 12.07 0 0014 24c6.627 0 12-4.925 12-11S20.627 2 14 2z" fill="white"/>
          </svg>
          <svg id="imsg-launcher-close" width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <span id="imsg-badge">1</span>
      </button>

      <!-- Chat Window -->
      <div id="imsg-window" role="dialog" aria-label="Chat support">

        <!-- Header -->
        <div class="imsg-header">
          <!-- Brand banner -->
          <div class="imsg-brand-banner">
            <div class="imsg-brand-banner-bg"></div>
            <img id="imsg-brand-logo-img" src="" alt="Brand Logo" />
            <span id="imsg-brand-logo-text">${storeName}</span>
          </div>

          <!-- Agent row -->
          <div class="imsg-agent-row">
            <div class="imsg-avatar-wrap">
              <div class="imsg-avatar" id="imsg-avatar">
                <img class="imsg-avatar-photo" id="imsg-avatar-photo" src="" alt="" />
                <span class="imsg-avatar-initials" id="imsg-avatar-initials">${initials}</span>
              </div>
              <div class="imsg-online-dot"></div>
            </div>
            <div class="imsg-header-info">
              <div class="imsg-header-name" id="imsg-agent-name">${storeName}</div>
              <div class="imsg-header-status">Active now</div>
            </div>
            <div class="imsg-header-actions">
              <button class="imsg-hbtn" id="imsg-minimize-btn" title="Minimize">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <path d="M5 12h14"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Messages area -->
        <div class="imsg-messages" id="imsg-msgs">
          <div class="imsg-typing" id="imsg-typing-indicator">
            <span></span><span></span><span></span>
          </div>
        </div>

        <!-- Quick replies -->
        <div class="imsg-qr-bar" id="imsg-qr-bar"></div>

        <!-- Input bar -->
        <div class="imsg-input-bar">
          <div class="imsg-input-wrap">
            <button class="imsg-img-btn" id="imsg-img-btn" title="Send image">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </button>
            <textarea
              id="imsg-textarea"
              class="imsg-textarea"
              placeholder="Message"
              rows="1"
            ></textarea>
          </div>
          <button class="imsg-send-btn" id="imsg-send-btn" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7"/>
            </svg>
          </button>
        </div>

      </div>
    `;

    document.body.appendChild(container);

    // Apply avatar from config if it's a URL
    const avatarConfig = window.__cozyChatConfig?.avatar;
    if (avatarConfig && (avatarConfig.startsWith('http') || avatarConfig.startsWith('/'))) {
      const photoEl = container.querySelector('#imsg-avatar-photo');
      photoEl.src = avatarConfig;
      photoEl.onload = () => photoEl.classList.add('loaded');
      // Also set on launcher
      const launcherLogo = container.querySelector('#imsg-launcher-logo');
      launcherLogo.src = avatarConfig;
      launcherLogo.onload = () => {
        launcherLogo.classList.add('loaded');
        container.querySelector('#imsg-launcher-icon').style.opacity = '0';
      };
      container.querySelector('#imsg-avatar-initials').style.opacity = '0';
    }

    bindEvents();
  }

  // ── Event Bindings ──

  function bindEvents() {
    const launcher = document.getElementById('imsg-launcher');
    const minimizeBtn = document.getElementById('imsg-minimize-btn');
    const sendBtn = document.getElementById('imsg-send-btn');
    const input = document.getElementById('imsg-textarea');
    const greeting = document.getElementById('cozy-chat-greeting');
    const greetingClose = greeting.querySelector('.imsg-greeting-close');

    launcher.addEventListener('click', toggleChat);
    minimizeBtn.addEventListener('click', toggleChat);
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
      document.getElementById('imsg-send-btn').disabled = !input.value.trim();
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

    const win = document.getElementById('imsg-window');
    const badge = document.getElementById('imsg-badge');
    const icon = document.getElementById('imsg-launcher-icon');
    const close = document.getElementById('imsg-launcher-close');

    win.classList.add('open');
    badge.style.display = 'none';
    icon.classList.add('hide');
    close.classList.add('show');

    window.dispatchEvent(new CustomEvent('cozy-chat-opened'));
    saveState();

    // Load session or start new
    loadSession();

    // Focus input
    setTimeout(() => {
      document.getElementById('imsg-textarea').focus();
    }, 420);
  }

  function closeChat() {
    state.isOpen = false;

    const win = document.getElementById('imsg-window');
    const icon = document.getElementById('imsg-launcher-icon');
    const close = document.getElementById('imsg-launcher-close');

    win.classList.remove('open');
    icon.classList.remove('hide');
    close.classList.remove('show');

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
      greetingEl.classList.add('imsg-show');

      // Show badge
      document.getElementById('imsg-badge').style.display = 'flex';

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
    greetingEl.classList.remove('imsg-show');
  }

  // ── Session Management ──

  function clearMessages() {
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');
    messagesEl.innerHTML = '';
    messagesEl.appendChild(typing);
  }

  function addDateSep(text) {
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');
    const d = document.createElement('div');
    d.className = 'imsg-date-sep';
    d.textContent = text;
    messagesEl.insertBefore(d, typing);
  }

  function loadSession() {
    state.visitorId = window.__cozyChatBehavioral?.getVisitorId() || getVisitorId();

    // Always clear first to prevent duplicates
    clearMessages();

    const savedConvoId = sessionStorage.getItem('cozy_convo_id');
    addDateSep('Today');
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
      addDateSep('Today');

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
    const input = document.getElementById('imsg-textarea');
    const message = input.value.trim();
    if (!message) return;

    state.hadInteraction = true;
    saveState();
    input.value = '';
    input.style.height = 'auto';
    document.getElementById('imsg-send-btn').disabled = true;

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
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    const row = document.createElement('div');
    row.className = 'imsg-row sent';

    const bub = document.createElement('div');
    bub.className = 'imsg-bubble';
    bub.textContent = text;
    row.appendChild(bub);

    const ts = document.createElement('div');
    ts.className = 'imsg-ts';
    ts.textContent = currentTimeStr();
    row.appendChild(ts);

    const rec = document.createElement('div');
    rec.className = 'imsg-receipt';
    rec.textContent = 'Delivered';
    row.appendChild(rec);

    // Change to "Read" after a delay
    setTimeout(() => { rec.textContent = 'Read'; }, 2200);

    messagesEl.insertBefore(row, typing);
    updateBubbleGrouping(messagesEl);
    scrollToBottom();
  }

  function addAssistantMessage(text) {
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    const row = document.createElement('div');
    row.className = 'imsg-row recv';

    const bub = document.createElement('div');
    bub.className = 'imsg-bubble';
    bub.innerHTML = formatMessage(text);
    row.appendChild(bub);

    const ts = document.createElement('div');
    ts.className = 'imsg-ts';
    ts.textContent = currentTimeStr();
    row.appendChild(ts);

    messagesEl.insertBefore(row, typing);
    updateBubbleGrouping(messagesEl);
    scrollToBottom();
  }

  // Group bubbles — apply top/mid/bottom classes for consecutive same-sender messages
  function updateBubbleGrouping(container) {
    const rows = container.querySelectorAll('.imsg-row');
    rows.forEach((row) => {
      const bubble = row.querySelector('.imsg-bubble');
      if (!bubble) return;
      bubble.classList.remove('top', 'mid', 'bottom');
    });

    const rowArr = Array.from(rows);
    for (let i = 0; i < rowArr.length; i++) {
      const row = rowArr[i];
      const bubble = row.querySelector('.imsg-bubble');
      if (!bubble) continue;

      const isSent = row.classList.contains('sent');
      const prev = rowArr[i - 1];
      const next = rowArr[i + 1];
      const prevSame = prev && prev.classList.contains(isSent ? 'sent' : 'recv') && prev.querySelector('.imsg-bubble');
      const nextSame = next && next.classList.contains(isSent ? 'sent' : 'recv') && next.querySelector('.imsg-bubble');

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
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    const row = document.createElement('div');
    row.className = 'imsg-row recv';

    const card = document.createElement('a');
    card.className = 'imsg-product-card';
    card.href = product.url || '#';
    card.target = '_blank';

    const priceHtml = product.compareAtPrice && parseFloat(product.compareAtPrice) > parseFloat(product.price)
      ? `<span style="font-weight:700;font-size:14px;color:#34c759;">$${parseFloat(product.price).toFixed(2)}</span>
         <span style="font-size:11px;color:rgba(255,255,255,0.35);text-decoration:line-through;">$${parseFloat(product.compareAtPrice).toFixed(2)}</span>
         ${product.discount ? `<span style="background:rgba(255,243,205,0.15);color:#fbbf24;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;">${product.discount}</span>` : ''}`
      : `<span style="font-weight:700;font-size:14px;color:#34c759;">$${parseFloat(product.price).toFixed(2)}</span>`;

    card.innerHTML = `
      <div class="imsg-product-thumb">
        ${product.image ? `<img src="${product.image}" alt="${product.title}" loading="lazy">` : '📦'}
      </div>
      <div class="imsg-product-body">
        <div class="imsg-product-name">${product.title}</div>
        <div class="imsg-product-price">${priceHtml}</div>
        <span class="imsg-product-cta">View Product →</span>
      </div>
    `;

    row.appendChild(card);
    messagesEl.insertBefore(row, typing);
    scrollToBottom();
  }

  // ── Email Capture ──

  function renderEmailCapture() {
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    const capture = document.createElement('div');
    capture.className = 'imsg-email-capture';
    capture.innerHTML = `
      <div class="imsg-email-capture-title">Get 10% Off Your First Order! 💌</div>
      <div class="imsg-email-capture-subtitle">Drop your email and we'll send your exclusive discount code.</div>
      <div class="imsg-email-capture-form">
        <input type="email" class="imsg-email-capture-input" placeholder="your@email.com">
        <button class="imsg-email-capture-submit">Get Code</button>
      </div>
    `;

    const submitBtn = capture.querySelector('.imsg-email-capture-submit');
    const emailInput = capture.querySelector('.imsg-email-capture-input');

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

        capture.querySelector('.imsg-email-capture-form').innerHTML = `
          <div class="imsg-email-capture-success">
            🎉 Your code: <strong>${data.discountCode}</strong><br>
            <small>Applied at checkout automatically!</small>
          </div>
        `;
      } catch (e) {
        capture.querySelector('.imsg-email-capture-form').innerHTML = `
          <div class="imsg-email-capture-success" style="color: rgba(255,255,255,0.4);">
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
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    // Handle single order or array
    const orders = Array.isArray(orderData) ? orderData : [orderData];

    for (const order of orders) {
      const card = document.createElement('div');
      card.className = 'imsg-order-card';

      const statusClass = order.fulfillment === 'fulfilled' ? 'imsg-fulfilled'
        : order.fulfillment === 'cancelled' ? 'imsg-cancelled'
        : 'imsg-unfulfilled';

      const statusLabel = order.fulfillment === 'fulfilled' ? 'Shipped'
        : order.fulfillment === 'unfulfilled' ? 'Processing'
        : order.fulfillment;

      let itemsHtml = '';
      if (order.items) {
        itemsHtml = order.items.map(i =>
          `<div class="imsg-order-card-row"><span>${i.title} x${i.quantity}</span><strong>$${i.price}</strong></div>`
        ).join('');
      }

      card.innerHTML = `
        <div class="imsg-order-card-header">Order ${order.number}</div>
        <div class="imsg-order-card-row">
          <span>Status</span>
          <span class="imsg-order-card-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="imsg-order-card-row">
          <span>Total</span>
          <strong>$${order.total}</strong>
        </div>
        <div class="imsg-order-card-row">
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
    const messagesEl = document.getElementById('imsg-msgs');
    const typing = document.getElementById('imsg-typing-indicator');

    const linksContainer = document.createElement('div');
    linksContainer.style.cssText = 'align-self: flex-start; display: flex; flex-wrap: wrap; gap: 7px; padding: 4px 0;';

    for (const link of links) {
      const a = document.createElement('a');
      a.href = link.url.startsWith('/') ? STORE_URL + link.url : link.url;
      a.target = '_blank';
      a.className = 'imsg-qr-chip';
      a.textContent = link.text;
      linksContainer.appendChild(a);
    }

    messagesEl.insertBefore(linksContainer, typing);
    scrollToBottom();
  }

  // ── Typing Indicator ──

  function showTyping() {
    state.isTyping = true;
    document.getElementById('imsg-typing-indicator').classList.add('imsg-show');
    scrollToBottom();
  }

  function hideTyping() {
    state.isTyping = false;
    document.getElementById('imsg-typing-indicator').classList.remove('imsg-show');
  }

  // ── Scroll ──

  function scrollToBottom() {
    const messagesEl = document.getElementById('imsg-msgs');
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
