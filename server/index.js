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
    res.setHeader('Cache-Control', 'public, max-age=3600');
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

// Widget loader endpoint — returns the JS snippet
app.get('/loader.js', (req, res) => {
  const widgetHost = process.env.WIDGET_HOST || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.send(`
    (function() {
      if (window.__cozyChatLoaded) return;
      window.__cozyChatLoaded = true;
      window.__cozyChatConfig = { host: "${widgetHost}" };
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '${widgetHost}/widget/css/widget.css';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = '${widgetHost}/widget/js/behavioral.js';
      script.onload = function() {
        var main = document.createElement('script');
        main.src = '${widgetHost}/widget/js/widget.js';
        document.body.appendChild(main);
      };
      document.body.appendChild(script);
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
