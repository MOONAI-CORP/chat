const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// Track behavioral events
router.post('/track', (req, res) => {
  try {
    const { visitorId, eventType, pageUrl, metadata } = req.body;
    if (!visitorId || !eventType) {
      return res.status(400).json({ error: 'visitorId and eventType required' });
    }

    const db = getDb();
    db.prepare(`
      INSERT INTO events (visitor_id, event_type, page_url, metadata)
      VALUES (?, ?, ?, ?)
    `).run(visitorId, eventType, pageUrl || '/', JSON.stringify(metadata || {}));

    res.json({ success: true });
  } catch (err) {
    console.error('Event tracking error:', err);
    res.status(500).json({ error: 'Failed to track event' });
  }
});

// Get visitor event history (for behavioral scoring)
router.get('/visitor/:visitorId', (req, res) => {
  try {
    const db = getDb();
    const events = db.prepare(`
      SELECT event_type, page_url, metadata, created_at
      FROM events
      WHERE visitor_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `).all(req.params.visitorId);

    // Calculate engagement score
    const score = calculateEngagementScore(events);

    res.json({ events, engagementScore: score });
  } catch (err) {
    console.error('Visitor events error:', err);
    res.status(500).json({ error: 'Failed to load events' });
  }
});

function calculateEngagementScore(events) {
  let score = 0;
  const weights = {
    'page_view': 1,
    'scroll_depth': 2,
    'product_view': 3,
    'add_to_cart': 5,
    'collection_view': 2,
    'time_on_page': 1,
    'mouse_movement': 0.5,
    'exit_intent': -2,
    'chat_opened': 4,
    'chat_message': 3,
  };

  for (const event of events) {
    score += weights[event.event_type] || 0;
    // Bonus for scroll depth
    if (event.event_type === 'scroll_depth') {
      const meta = JSON.parse(event.metadata || '{}');
      if (meta.depth > 75) score += 2;
    }
  }

  return Math.min(Math.max(score, 0), 100);
}

module.exports = router;
