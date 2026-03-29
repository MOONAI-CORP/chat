require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { WebSocketServer } = require('ws');

const chatRoutes = require('./routes/chat');
const eventRoutes = require('./routes/events');
const productRoutes = require('./routes/products');
const analyticsRoutes = require('./routes/analytics');
const { adminAuth } = require('./middleware/auth');
const { getDb } = require('./db/schema');

const app = express();
const PORT = process.env.PORT || 3456;

// ── Middleware ──

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: [
    process.env.CORS_ORIGIN,
    'https://cozycloudco.com',
    'https://www.cozycloudco.com',
    'https://iznqza-yx.myshopify.com',
    'https://limitedarmor.com',
    'https://www.limitedarmor.com',
    'http://localhost:3456',
  ],
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// Rate limiting for chat API
const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: { error: 'Too many requests, please slow down' },
});

const eventLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many events' },
});

// ── Static files ──

// Serve widget files
app.use('/widget', express.static(path.join(__dirname, '..', 'widget'), {
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300');
  },
}));

// Serve dashboard
app.use('/admin', adminAuth, express.static(path.join(__dirname, '..', 'dashboard')));

// ── API Routes ──

app.use('/api/chat', chatLimiter, chatRoutes);
app.use('/api/events', eventLimiter, eventRoutes);
app.use('/api/products', adminAuth, productRoutes);
app.use('/api/analytics', adminAuth, analyticsRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Widget HTML endpoint — serves the full widget as injectable HTML
app.get('/widget.html', (req, res) => {
  const fs = require('fs');
  const widgetPath = path.join(__dirname, '..', 'widget', 'chat-widget.html');
  let html = fs.readFileSync(widgetPath, 'utf8');

  // Replace config values
  const storeName = process.env.WIDGET_STORE_NAME || 'Limited Armor';
  const storeUrl = process.env.WIDGET_STORE_URL || 'https://limitedarmor.com';
  const supportEmail = process.env.WIDGET_SUPPORT_EMAIL || 'support@limitedarmor.com';
  const widgetHost = process.env.WIDGET_HOST || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;

  // Replace store name throughout
  html = html.replace(/Limited Armor/g, storeName);
  html = html.replace(/LA<\/span>/g, storeName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() + '</span>');

  // Inject API config and override the send function
  const apiOverride = `
<script>
var IMSG_API_HOST = "${widgetHost}";
var imsgConversationId = sessionStorage.getItem('cozy_convo_id') || null;
var imsgVisitorId = (function() {
  var id = localStorage.getItem('cozy_visitor_id');
  if (!id) { id = 'v_' + Math.random().toString(36).substr(2,12) + Date.now().toString(36); localStorage.setItem('cozy_visitor_id', id); }
  return id;
})();
var imsgTypingLock = false;

// Override imsgSend to use real API
var _origImsgSend = imsgSend;
imsgSend = function() {
  var inp = document.getElementById('imsg-textarea');
  var text = inp.value.trim();
  var hasImg = !!imsgPendingImg;
  if ((!text && !hasImg) || imsgTypingLock) return;

  if (hasImg) { addImgMsg(imsgPendingImg, 'sent'); imsgClearImgPreview(); }
  if (text) {
    addMsg(text, 'sent');
    inp.value = '';
    imsgAutoResize(inp);
    imsgToggleSend();
    imsgTypingLock = true;
    showTyping(null);

    fetch(IMSG_API_HOST + '/api/chat/message', {
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
      var tr = document.getElementById('imsg-typing-row');
      if (tr) tr.remove();
      imsgTypingLock = false;
      imsgConversationId = data.conversationId;
      sessionStorage.setItem('cozy_convo_id', data.conversationId);
      if (data.message) addMsg(data.message, 'recv');
      if (data.productCards && data.productCards.length > 0) {
        data.productCards.forEach(function(c) {
          addProductCard({ name: c.title, price: '$' + parseFloat(c.price).toFixed(2), emoji: '📱', url: c.url, image: c.image });
        });
      }
    })
    .catch(function(err) {
      var tr = document.getElementById('imsg-typing-row');
      if (tr) tr.remove();
      imsgTypingLock = false;
      console.error('Chat error:', err);
      addMsg("Sorry, having a moment! Email us at ${supportEmail} 💙", 'recv');
    });
  } else if (hasImg) {
    showTyping(function(){ addMsg("Got it! Let me look into that. 🔍", 'recv'); }, 1200);
  }
};

// Override imsgQR to use API too
imsgQR = function(el) {
  document.getElementById('imsg-textarea').value = el.textContent;
  imsgSend();
};
</script>`;

  // Remove the demo background div
  html = html.replace(/<div class="demo-bg">[\s\S]*?<\/div>\s*<\/div>/m, '');

  // Inject API override before </body>
  html = html.replace('</body>', apiOverride + '\n</body>');

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(html);
});

// Widget loader endpoint — fetches and injects the full widget HTML
app.get('/loader.js', (req, res) => {
  const widgetHost = process.env.WIDGET_HOST || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.send(`
    (function() {
      if (window.__cozyChatLoaded) return;
      window.__cozyChatLoaded = true;
      fetch("${widgetHost}/widget.html")
        .then(function(r) { return r.text(); })
        .then(function(html) {
          // Extract style and inject
          var styleMatch = html.match(/<style>([\\s\\S]*?)<\\/style>/);
          if (styleMatch) {
            var s = document.createElement('style');
            s.textContent = styleMatch[1];
            document.head.appendChild(s);
          }
          // Extract body content (between </style></head><body> and <script>)
          var bodyMatch = html.match(/<body>([\\s\\S]*?)<script>/);
          if (bodyMatch) {
            var d = document.createElement('div');
            d.innerHTML = bodyMatch[1];
            while (d.firstChild) document.body.appendChild(d.firstChild);
          }
          // Extract and run all scripts
          var scripts = html.match(/<script>([\\s\\S]*?)<\\/script>/g);
          if (scripts) {
            scripts.forEach(function(s) {
              var code = s.replace(/<\\/?script>/g, '');
              var el = document.createElement('script');
              el.textContent = code;
              document.body.appendChild(el);
            });
          }
        })
        .catch(function(e) { console.error('Widget load error:', e); });
    })();
  `);
});

// ── Initialize DB ──
getDb();

// ── Start Server ──

const server = app.listen(PORT, () => {
  console.log(`\n  ☁️  Cozy Cloud Chat Server`);
  console.log(`  ─────────────────────────`);
  console.log(`  Server:    http://localhost:${PORT}`);
  console.log(`  Dashboard: http://localhost:${PORT}/admin`);
  console.log(`  Widget:    http://localhost:${PORT}/widget`);
  console.log(`  Health:    http://localhost:${PORT}/health`);
  console.log(`  Loader:    http://localhost:${PORT}/loader.js`);
  console.log(`  ─────────────────────────\n`);
});

// ── WebSocket for real-time chat ──

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data);

      if (msg.type === 'chat_message') {
        const chatService = require('./services/chat');
        const result = await chatService.chat(
          msg.conversationId,
          msg.visitorId,
          msg.message,
          msg.sourcePage
        );
        ws.send(JSON.stringify({ type: 'chat_response', ...result }));
      }

      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    } catch (err) {
      console.error('WebSocket error:', err);
      ws.send(JSON.stringify({ type: 'error', message: 'Something went wrong' }));
    }
  });
});

// Heartbeat to clean up dead connections
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

module.exports = app;

// ── Keep-alive ping (prevents Render free tier sleep) ──
if (process.env.NODE_ENV === 'production') {
  const SELF_URL = process.env.WIDGET_HOST || process.env.RENDER_EXTERNAL_URL;
  if (SELF_URL) {
    setInterval(() => {
      fetch(SELF_URL + '/health').catch(() => {});
    }, 14 * 60 * 1000); // every 14 minutes
    console.log('  Keep-alive: pinging ' + SELF_URL + '/health every 14m');
  }
}
