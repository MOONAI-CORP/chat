/**
 * Limited Armor Chat Widget — iMessage Dark Theme
 * Direct port of chat-widget-v2.html reference
 * Bot replies powered by real API backend
 */
(function() {

/* ══════════════════════════════════════════════════════════════════
   CONFIG
   ══════════════════════════════════════════════════════════════════ */
var HOST = (window.__cozyChatConfig && window.__cozyChatConfig.host) || '';
var STORE_URL = (window.__cozyChatConfig && window.__cozyChatConfig.storeUrl) || 'https://limitedarmor.com';

var IMSG = {
  agentName:   (window.__cozyChatConfig && window.__cozyChatConfig.storeName) || 'Limited Armor',
  brandName:   (window.__cozyChatConfig && window.__cozyChatConfig.storeName) || 'Limited Armor',
  brandColor:  '#007aff',
  accentColor: '#0a84ff',
  greeting:    "Hey! 👋 Welcome to " + ((window.__cozyChatConfig && window.__cozyChatConfig.storeName) || 'Limited Armor') + ". I'm here to help with cases, bands & accessories. What can I help you with?",
  quickReplies: ['Track my order 📦', 'Return policy', 'Product info', 'Talk to a human 💬'],
  featuredProduct: null
};

var imsgIsOpen = false;
var imsgMsgCount = 0;
var imsgPendingImg = null;
var imsgConversationId = sessionStorage.getItem('cozy_convo_id') || null;
var imsgVisitorId = null;
var imsgHadInteraction = sessionStorage.getItem('cozy_chat_interacted') === '1';
var imsgGreetingShown = sessionStorage.getItem('cozy_greeting_shown') === '1';
var imsgTypingLock = false;

/* ── VISITOR ID ──────────────────────────────────────────────── */
function getVisitorId() {
  var id = localStorage.getItem('cozy_visitor_id');
  if (!id) {
    id = 'v_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
    localStorage.setItem('cozy_visitor_id', id);
  }
  imsgVisitorId = id;
  return id;
}

/* ── INJECT HTML ─────────────────────────────────────────────── */
function createWidget() {
  var storeName = IMSG.brandName;
  var initials = getInitials(storeName);
  var div = document.createElement('div');
  div.id = 'cozy-chat-widget';

  div.innerHTML =
    '<!-- Greeting Tooltip -->' +
    '<div id="cozy-chat-greeting">' +
      '<button class="cc-greeting-close" aria-label="Close">&times;</button>' +
      '<span id="cozy-chat-greeting-text"></span>' +
    '</div>' +

    '<!-- Launcher -->' +
    '<button id="imsg-launcher" aria-label="Open chat">' +
      '<div id="imsg-launcher-inner">' +
        '<img id="imsg-launcher-logo" src="" alt="" />' +
        '<svg id="imsg-launcher-icon" width="30" height="30" viewBox="0 0 28 28" fill="none">' +
          '<path d="M14 2C7.373 2 2 6.925 2 13c0 2.21.72 4.26 1.95 5.96L2.5 22.5l4.04-1.3A12.07 12.07 0 0014 24c6.627 0 12-4.925 12-11S20.627 2 14 2z" fill="white"/>' +
        '</svg>' +
        '<svg id="imsg-launcher-close" width="22" height="22" viewBox="0 0 24 24" fill="none">' +
          '<path d="M18 6L6 18M6 6l12 12" stroke="white" stroke-width="2.5" stroke-linecap="round"/>' +
        '</svg>' +
      '</div>' +
      '<span id="imsg-badge">1</span>' +
    '</button>' +

    '<!-- Chat Window -->' +
    '<div id="imsg-window" role="dialog" aria-label="Chat support">' +

      '<!-- Upload Panel -->' +
      '<div id="imsg-upload-panel">' +
        '<div class="imsg-panel-title">Customize Widget</div>' +
        '<div class="imsg-panel-subtitle">Upload your agent photo and brand logo.<br/>Images are saved in your browser.</div>' +
        '<div class="imsg-upload-row">' +
          '<div class="imsg-upload-label">Agent Profile Photo</div>' +
          '<div class="imsg-dropzone" id="imsg-dz-avatar">' +
            '<input type="file" id="imsg-avatar-file" accept="image/*" />' +
            '<img class="imsg-dz-preview" id="imsg-dz-avatar-preview" src="" alt="Preview" />' +
            '<div class="imsg-dropzone-icon" id="imsg-dz-avatar-icon">🧑‍💼</div>' +
            '<div class="imsg-dropzone-text"><strong>Click to upload</strong> or drag & drop</div>' +
          '</div>' +
        '</div>' +
        '<div class="imsg-upload-row">' +
          '<div class="imsg-upload-label">Brand Logo (Header Banner)</div>' +
          '<div class="imsg-dropzone" id="imsg-dz-logo">' +
            '<input type="file" id="imsg-logo-file" accept="image/*" />' +
            '<img class="imsg-dz-preview-banner" id="imsg-dz-logo-preview" src="" alt="Preview" />' +
            '<div class="imsg-dropzone-icon" id="imsg-dz-logo-icon">🏷️</div>' +
            '<div class="imsg-dropzone-text"><strong>Click to upload</strong> or drag & drop</div>' +
          '</div>' +
        '</div>' +
        '<button class="imsg-panel-close" id="imsg-panel-close-btn">Done</button>' +
      '</div>' +

      '<!-- Header -->' +
      '<div class="imsg-header">' +
        '<div class="imsg-brand-banner">' +
          '<div class="imsg-brand-banner-bg"></div>' +
          '<img id="imsg-brand-logo-img" src="" alt="Brand Logo" />' +
          '<span id="imsg-brand-logo-text">' + storeName + '</span>' +
          '<button class="imsg-banner-upload-btn" id="imsg-customize-btn" title="Upload brand logo & agent photo">⚙ Customize</button>' +
        '</div>' +
        '<div class="imsg-agent-row">' +
          '<div class="imsg-avatar-wrap">' +
            '<div class="imsg-avatar" id="imsg-avatar">' +
              '<img class="imsg-avatar-photo" id="imsg-avatar-photo" src="" alt="" />' +
              '<span class="imsg-avatar-initials" id="imsg-avatar-initials">' + initials + '</span>' +
              '<div class="imsg-avatar-overlay"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg></div>' +
            '</div>' +
            '<div class="imsg-online-dot"></div>' +
          '</div>' +
          '<div class="imsg-header-info">' +
            '<div class="imsg-header-name" id="imsg-agent-name">' + IMSG.agentName + '</div>' +
            '<div class="imsg-header-status">Active now</div>' +
          '</div>' +
          '<div class="imsg-header-actions">' +
            '<button class="imsg-hbtn" id="imsg-minimize-btn" title="Minimize">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<!-- Messages -->' +
      '<div class="imsg-messages" id="imsg-msgs"></div>' +

      '<!-- Image preview strip -->' +
      '<div class="imsg-img-preview-strip" id="imsg-img-strip">' +
        '<img class="imsg-img-preview-thumb" id="imsg-img-thumb" src="" alt="" />' +
        '<button class="imsg-img-preview-remove" id="imsg-img-remove">✕</button>' +
      '</div>' +

      '<!-- Quick replies -->' +
      '<div class="imsg-qr-bar" id="imsg-qr-bar"></div>' +

      '<!-- Input bar -->' +
      '<div class="imsg-input-bar">' +
        '<div class="imsg-input-wrap">' +
          '<button class="imsg-img-btn" id="imsg-img-btn" title="Send image">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>' +
          '</button>' +
          '<input type="file" id="imsg-msg-img-input" accept="image/*" style="display:none" />' +
          '<textarea id="imsg-textarea" class="imsg-textarea" placeholder="iMessage" rows="1"></textarea>' +
        '</div>' +
        '<button class="imsg-send-btn" id="imsg-send-btn" disabled>' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>' +
        '</button>' +
      '</div>' +

    '</div>';

  document.body.appendChild(div);
}

/* ── INIT ─────────────────────────────────────────────────────── */
function init() {
  getVisitorId();
  createWidget();
  applyBrandColor(IMSG.brandColor, IMSG.accentColor);
  setQRs(IMSG.quickReplies);

  // Restore saved images
  var savedAvatar = localStorage.getItem('imsg_avatar');
  var savedLogo = localStorage.getItem('imsg_logo');
  if (savedAvatar) applyAvatar(savedAvatar);
  if (savedLogo) applyLogo(savedLogo);

  bindEvents();
  restoreState();
}

/* ── BIND EVENTS ──────────────────────────────────────────────── */
function bindEvents() {
  // Launcher
  document.getElementById('imsg-launcher').addEventListener('click', imsgToggle);
  document.getElementById('imsg-minimize-btn').addEventListener('click', imsgToggle);

  // Send
  document.getElementById('imsg-send-btn').addEventListener('click', imsgSend);

  // Textarea
  var textarea = document.getElementById('imsg-textarea');
  textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); imsgSend(); }
  });
  textarea.addEventListener('input', function() {
    imsgAutoResize(textarea);
    imsgToggleSend();
  });

  // Image button
  document.getElementById('imsg-img-btn').addEventListener('click', function() {
    document.getElementById('imsg-msg-img-input').click();
  });
  document.getElementById('imsg-msg-img-input').addEventListener('change', imsgMsgImgSelected);
  document.getElementById('imsg-img-remove').addEventListener('click', imsgClearImgPreview);

  // Customize panel
  document.getElementById('imsg-customize-btn').addEventListener('click', imsgOpenPanel);
  document.getElementById('imsg-avatar').addEventListener('click', imsgOpenPanel);
  document.getElementById('imsg-panel-close-btn').addEventListener('click', imsgClosePanel);

  // File uploads
  document.getElementById('imsg-avatar-file').addEventListener('change', function(e) { imsgFileChange(e, 'avatar'); });
  document.getElementById('imsg-logo-file').addEventListener('change', function(e) { imsgFileChange(e, 'logo'); });

  // Drag and drop
  ['imsg-dz-avatar', 'imsg-dz-logo'].forEach(function(id) {
    var el = document.getElementById(id);
    el.addEventListener('dragover', function(e) { e.preventDefault(); el.classList.add('drag-over'); });
    el.addEventListener('dragleave', function() { el.classList.remove('drag-over'); });
    el.addEventListener('drop', function(e) {
      e.preventDefault(); el.classList.remove('drag-over');
      var type = id.includes('avatar') ? 'avatar' : 'logo';
      var file = e.dataTransfer.files[0];
      if (!file || !file.type.startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function(ev) { processUpload(ev.target.result, type); };
      reader.readAsDataURL(file);
    });
  });

  // Greeting tooltip
  var greeting = document.getElementById('cozy-chat-greeting');
  greeting.addEventListener('click', function(e) {
    if (!e.target.classList.contains('cc-greeting-close')) {
      hideGreeting();
      if (!imsgIsOpen) imsgToggle();
    }
  });
  greeting.querySelector('.cc-greeting-close').addEventListener('click', function(e) {
    e.stopPropagation();
    hideGreeting();
  });

  // Behavioral triggers
  window.addEventListener('cozy-chat-trigger', function(e) {
    if (!imsgIsOpen && !imsgGreetingShown) {
      showGreeting(e.detail);
    }
  });
}

/* ── BRAND COLOR ──────────────────────────────────────────────── */
function applyBrandColor(color, accent) {
  var launcher = document.getElementById('imsg-launcher');
  launcher.style.background = 'linear-gradient(145deg,' + color + ',' + accent + ')';
  launcher.style.boxShadow = '0 4px 28px ' + color + '88, 0 2px 8px rgba(0,0,0,0.3)';
  var sendBtn = document.getElementById('imsg-send-btn');
  sendBtn.style.background = color;
  sendBtn.style.boxShadow = '0 2px 12px ' + color + '66';
  var avatar = document.getElementById('imsg-avatar');
  avatar.style.background = 'linear-gradient(135deg,' + color + ',' + accent + ')';
}

function getInitials(name) {
  return name.split(' ').map(function(w) { return w[0]; }).join('').slice(0, 2).toUpperCase();
}

/* ── TOGGLE OPEN/CLOSE ───────────────────────────────────────── */
function imsgToggle() {
  var win = document.getElementById('imsg-window');
  var badge = document.getElementById('imsg-badge');
  var icon = document.getElementById('imsg-launcher-icon');
  var close = document.getElementById('imsg-launcher-close');

  imsgIsOpen = !imsgIsOpen;
  win.classList.toggle('open', imsgIsOpen);
  icon.classList.toggle('hide', imsgIsOpen);
  close.classList.toggle('show', imsgIsOpen);

  if (imsgIsOpen) {
    badge.style.display = 'none';
    hideGreeting();
    if (imsgMsgCount === 0) setTimeout(imsgWelcome, 320);
    setTimeout(function() { document.getElementById('imsg-textarea').focus(); }, 420);
    window.dispatchEvent(new CustomEvent('cozy-chat-opened'));
  } else {
    window.dispatchEvent(new CustomEvent('cozy-chat-closed', {
      detail: { hadInteraction: imsgHadInteraction }
    }));
  }
  saveState();
}

/* ── WELCOME FLOW ─────────────────────────────────────────────── */
function imsgWelcome() {
  clearMsgs();
  addDateSep('Today');

  // Check for existing conversation
  var savedId = sessionStorage.getItem('cozy_convo_id');
  if (savedId) {
    imsgConversationId = savedId;
    loadHistory(savedId);
  } else {
    showTyping(function() {
      addMsg(IMSG.greeting, 'recv');
    }, 1200);
  }
}

/* ── LOAD HISTORY FROM API ────────────────────────────────────── */
function loadHistory(conversationId) {
  fetch(HOST + '/api/chat/history/' + conversationId)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (data.messages && data.messages.length > 0) {
        data.messages.forEach(function(msg) {
          if (msg.role === 'user') {
            addMsg(msg.content, 'sent');
          } else {
            addMsg(msg.content, 'recv');
            if (msg.product_cards) {
              try {
                var cards = JSON.parse(msg.product_cards);
                cards.forEach(function(c) { addProductCard(c); });
              } catch(e) {}
            }
          }
        });
      } else {
        addMsg(IMSG.greeting, 'recv');
      }
    })
    .catch(function() {
      addMsg(IMSG.greeting, 'recv');
    });
}

/* ── MESSAGES ─────────────────────────────────────────────────── */
function clearMsgs() {
  document.getElementById('imsg-msgs').innerHTML = '';
  imsgMsgCount = 0;
}

function addDateSep(t) {
  var el = document.getElementById('imsg-msgs');
  var d = document.createElement('div');
  d.className = 'imsg-date-sep';
  d.textContent = t;
  el.appendChild(d);
}

function addMsg(text, type) {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row ' + type;
  imsgMsgCount++;

  var bub = document.createElement('div');
  bub.className = 'imsg-bubble';
  bub.textContent = text;
  row.appendChild(bub);

  var ts = document.createElement('div');
  ts.className = 'imsg-ts';
  ts.textContent = imsgTime();
  row.appendChild(ts);

  if (type === 'sent') {
    var rec = document.createElement('div');
    rec.className = 'imsg-receipt';
    rec.textContent = 'Delivered';
    row.appendChild(rec);
    setTimeout(function() { rec.textContent = 'Read'; }, 2200);
  }

  el.appendChild(row);
  scrollBottom();
}

function addImgMsg(src, type) {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row ' + type;
  imsgMsgCount++;

  var wrap = document.createElement('div');
  wrap.className = 'imsg-bubble-img';
  var img = document.createElement('img');
  img.src = src;
  img.style.maxWidth = '200px';
  img.style.borderRadius = '14px';
  wrap.appendChild(img);
  row.appendChild(wrap);

  var ts = document.createElement('div');
  ts.className = 'imsg-ts';
  ts.textContent = imsgTime();
  row.appendChild(ts);

  if (type === 'sent') {
    var rec = document.createElement('div');
    rec.className = 'imsg-receipt';
    rec.textContent = 'Delivered';
    row.appendChild(rec);
    setTimeout(function() { rec.textContent = 'Read'; }, 2200);
  }

  el.appendChild(row);
  scrollBottom();
}

function addProductCard(p) {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row recv';

  var card = document.createElement('a');
  card.className = 'imsg-product-card';
  card.href = p.url || '#';
  card.target = '_blank';

  var thumbHtml = p.image
    ? '<div class="imsg-product-thumb"><img src="' + p.image + '" /></div>'
    : '<div class="imsg-product-thumb">' + (p.emoji || '📱') + '</div>';

  var priceHtml = p.compareAtPrice && parseFloat(p.compareAtPrice) > parseFloat(p.price)
    ? '<span style="color:#34c759;font-weight:700;">$' + parseFloat(p.price).toFixed(2) + '</span> <span style="text-decoration:line-through;color:rgba(255,255,255,0.3);font-size:12px;">$' + parseFloat(p.compareAtPrice).toFixed(2) + '</span>'
    : '<span style="color:#34c759;font-weight:700;">$' + parseFloat(p.price || 0).toFixed(2) + '</span>';

  card.innerHTML =
    thumbHtml +
    '<div class="imsg-product-body">' +
      '<div class="imsg-product-name">' + (p.title || p.name) + '</div>' +
      '<div class="imsg-product-price">' + priceHtml + '</div>' +
      '<span class="imsg-product-cta" style="background:' + IMSG.brandColor + '">View Product →</span>' +
    '</div>';
  row.appendChild(card);
  el.appendChild(row);
  scrollBottom();
}

function addLinkButtons(links) {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row recv';
  row.style.display = 'flex';
  row.style.flexWrap = 'wrap';
  row.style.gap = '6px';
  links.forEach(function(link) {
    var chip = document.createElement('button');
    chip.className = 'imsg-qr-chip';
    chip.textContent = link.text;
    chip.addEventListener('click', function() {
      window.open(link.url.startsWith('/') ? STORE_URL + link.url : link.url, '_blank');
    });
    row.appendChild(chip);
  });
  el.appendChild(row);
  scrollBottom();
}

function showTyping(cb, delay) {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row recv';
  row.id = 'imsg-typing-row';
  var ind = document.createElement('div');
  ind.className = 'imsg-typing';
  ind.innerHTML = '<span></span><span></span><span></span>';
  row.appendChild(ind);
  el.appendChild(row);
  scrollBottom();
  if (cb) {
    setTimeout(function() {
      var tr = document.getElementById('imsg-typing-row');
      if (tr) tr.remove();
      cb();
    }, delay || 1400);
  }
}

function hideTyping() {
  var tr = document.getElementById('imsg-typing-row');
  if (tr) tr.remove();
}

/* ── SEND — REAL API ──────────────────────────────────────────── */
function imsgSend() {
  var inp = document.getElementById('imsg-textarea');
  var text = inp.value.trim();
  var hasImg = !!imsgPendingImg;

  if ((!text && !hasImg) || imsgTypingLock) return;

  imsgHadInteraction = true;

  if (hasImg) {
    addImgMsg(imsgPendingImg, 'sent');
    imsgClearImgPreview();
  }
  if (text) {
    addMsg(text, 'sent');
    inp.value = '';
    imsgAutoResize(inp);
    imsgToggleSend();

    // Show typing
    imsgTypingLock = true;
    showTyping(null); // persistent typing — no auto-remove

    // Call API
    fetch(HOST + '/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId: imsgConversationId,
        visitorId: imsgVisitorId,
        message: text,
        sourcePage: window.location.pathname
      })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      hideTyping();
      imsgTypingLock = false;

      imsgConversationId = data.conversationId;
      sessionStorage.setItem('cozy_convo_id', data.conversationId);

      if (data.message) addMsg(data.message, 'recv');
      if (data.productCards && data.productCards.length > 0) {
        data.productCards.forEach(function(c) { addProductCard(c); });
      }
      if (data.links && data.links.length > 0) {
        addLinkButtons(data.links);
      }
      if (data.showEmailCapture) renderEmailCapture();
    })
    .catch(function(err) {
      hideTyping();
      imsgTypingLock = false;
      console.error('Chat error:', err);
      addMsg("Sorry, I'm having a moment! Please try again or email us at " + ((window.__cozyChatConfig && window.__cozyChatConfig.supportEmail) || 'support@limitedarmor.com') + " 💙", 'recv');
    });
  } else if (hasImg) {
    showTyping(function() {
      addMsg("Got it! That's helpful — let me look into that for you. 🔍", 'recv');
    }, 1200);
  }

  saveState();
}

/* ── EMAIL CAPTURE ────────────────────────────────────────────── */
function renderEmailCapture() {
  var el = document.getElementById('imsg-msgs');
  var row = document.createElement('div');
  row.className = 'imsg-row recv';
  var card = document.createElement('div');
  card.style.cssText = 'background:#1c1c1e;border-radius:18px;padding:14px;max-width:230px;border:0.5px solid rgba(255,255,255,0.09);';
  card.innerHTML =
    '<div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:3px;">Get 10% Off 💌</div>' +
    '<div style="font-size:11px;color:rgba(255,255,255,0.5);margin-bottom:10px;">Drop your email for an exclusive discount code.</div>' +
    '<div style="display:flex;gap:6px;">' +
      '<input type="email" placeholder="your@email.com" style="flex:1;padding:7px 10px;background:#2c2c2e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;font-size:12px;outline:none;font-family:inherit;" />' +
      '<button style="padding:7px 12px;background:#007aff;color:#fff;border:none;border-radius:10px;font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap;">Get Code</button>' +
    '</div>';
  row.appendChild(card);
  el.appendChild(row);

  var submitBtn = card.querySelector('button');
  var emailInput = card.querySelector('input');
  submitBtn.addEventListener('click', function() {
    var email = emailInput.value.trim();
    if (!email || !email.includes('@')) return;
    fetch(HOST + '/api/chat/capture-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: imsgConversationId, email: email, sourcePage: window.location.pathname })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      card.querySelector('div:last-child').innerHTML = '<div style="text-align:center;color:#34c759;font-weight:600;font-size:13px;">🎉 Your code: <strong>' + data.discountCode + '</strong></div>';
    })
    .catch(function() {
      card.querySelector('div:last-child').innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.5);font-size:12px;">Something went wrong. Email us!</div>';
    });
  });
  emailInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') submitBtn.click(); });
  scrollBottom();
}

/* ── QUICK REPLIES ────────────────────────────────────────────── */
function setQRs(replies) {
  var el = document.getElementById('imsg-qr-bar');
  el.innerHTML = '';
  replies.forEach(function(r) {
    var btn = document.createElement('button');
    btn.className = 'imsg-qr-chip';
    btn.textContent = r;
    btn.addEventListener('click', function() { imsgQR(btn); });
    el.appendChild(btn);
  });
}

function imsgQR(el) {
  var text = el.textContent;
  // Treat as a real message through the API
  document.getElementById('imsg-textarea').value = text;
  imsgSend();
}

/* ── IMAGE HANDLING ───────────────────────────────────────────── */
function imsgMsgImgSelected(e) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    imsgPendingImg = ev.target.result;
    document.getElementById('imsg-img-thumb').src = imsgPendingImg;
    document.getElementById('imsg-img-strip').classList.add('visible');
    document.getElementById('imsg-send-btn').disabled = false;
  };
  reader.readAsDataURL(file);
  e.target.value = '';
}

function imsgClearImgPreview() {
  imsgPendingImg = null;
  document.getElementById('imsg-img-strip').classList.remove('visible');
  document.getElementById('imsg-img-thumb').src = '';
  imsgToggleSend();
}

/* ── UPLOAD PANEL ─────────────────────────────────────────────── */
function imsgOpenPanel() { document.getElementById('imsg-upload-panel').classList.add('open'); }
function imsgClosePanel() { document.getElementById('imsg-upload-panel').classList.remove('open'); }

function imsgFileChange(e, type) {
  var file = e.target.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) { processUpload(ev.target.result, type); };
  reader.readAsDataURL(file);
}

function processUpload(src, type) {
  if (type === 'avatar') {
    applyAvatar(src);
    localStorage.setItem('imsg_avatar', src);
    var prev = document.getElementById('imsg-dz-avatar-preview');
    prev.src = src; prev.classList.add('visible');
    document.getElementById('imsg-dz-avatar-icon').style.display = 'none';
  } else {
    applyLogo(src);
    localStorage.setItem('imsg_logo', src);
    var prev2 = document.getElementById('imsg-dz-logo-preview');
    prev2.src = src; prev2.classList.add('visible');
    document.getElementById('imsg-dz-logo-icon').style.display = 'none';
  }
}

function applyAvatar(src) {
  var photo = document.getElementById('imsg-avatar-photo');
  photo.src = src; photo.classList.add('loaded');
  document.getElementById('imsg-avatar-initials').style.opacity = '0';
  var launcherLogo = document.getElementById('imsg-launcher-logo');
  launcherLogo.src = src; launcherLogo.classList.add('loaded');
  document.getElementById('imsg-launcher-icon').style.opacity = '0';
}

function applyLogo(src) {
  var logoImg = document.getElementById('imsg-brand-logo-img');
  var logoText = document.getElementById('imsg-brand-logo-text');
  logoImg.src = src; logoImg.classList.add('loaded');
  logoText.style.opacity = '0';
}

/* ── GREETING TOOLTIP ─────────────────────────────────────────── */
function showGreeting(triggerDetail) {
  imsgGreetingShown = true;
  sessionStorage.setItem('cozy_greeting_shown', '1');

  var triggerType = (triggerDetail && triggerDetail.type) || 'default';
  var sourcePage = (triggerDetail && triggerDetail.sourcePage) || window.location.pathname;

  fetch(HOST + '/api/chat/greeting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sourcePage: sourcePage,
      triggerType: triggerType,
      isReturnVisitor: triggerDetail && triggerDetail.isReturnVisitor,
      visitCount: triggerDetail && triggerDetail.visitCount,
      productsViewed: triggerDetail && triggerDetail.productsViewed,
      sessionPages: triggerDetail && triggerDetail.sessionPages,
      addToCartCount: triggerDetail && triggerDetail.addToCartCount
    })
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var greetingEl = document.getElementById('cozy-chat-greeting');
    document.getElementById('cozy-chat-greeting-text').textContent = data.message;
    greetingEl.classList.add('cc-show');
    var badge = document.getElementById('imsg-badge');
    badge.style.display = 'flex';
    setTimeout(function() {
      if (!imsgIsOpen) hideGreeting();
    }, 15000);
  })
  .catch(function(e) { console.error('Greeting error:', e); });
}

function hideGreeting() {
  document.getElementById('cozy-chat-greeting').classList.remove('cc-show');
}

/* ── STATE PERSISTENCE ────────────────────────────────────────── */
function saveState() {
  sessionStorage.setItem('cozy_chat_open', imsgIsOpen ? '1' : '0');
  sessionStorage.setItem('cozy_chat_interacted', imsgHadInteraction ? '1' : '0');
}

function restoreState() {
  var wasOpen = sessionStorage.getItem('cozy_chat_open') === '1';
  if (wasOpen || imsgHadInteraction) {
    imsgToggle();
  }
}

/* ── UTILITIES ────────────────────────────────────────────────── */
function scrollBottom() {
  var el = document.getElementById('imsg-msgs');
  requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
}
function imsgTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function imsgAutoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
}
function imsgToggleSend() {
  var hasText = !!document.getElementById('imsg-textarea').value.trim();
  var hasImg = !!imsgPendingImg;
  document.getElementById('imsg-send-btn').disabled = !(hasText || hasImg);
}

/* ── BEHAVIORAL API ───────────────────────────────────────────── */
window.__cozyChatBehavioral = window.__cozyChatBehavioral || {};
window.__cozyChatBehavioral.getVisitorId = function() { return imsgVisitorId; };

/* ── START ────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
