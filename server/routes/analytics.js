const express = require('express');
const router = express.Router();
const { getDb } = require('../db/schema');

// Dashboard overview
router.get('/overview', (req, res) => {
  try {
    const db = getDb();
    const { days = 30 } = req.query;

    const overview = db.prepare(`
      SELECT
        COUNT(*) as total_conversations,
        SUM(message_count) as total_messages,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as conversions,
        SUM(conversion_value) as total_revenue,
        AVG(message_count) as avg_messages
      FROM conversations
      WHERE started_at >= datetime('now', '-${parseInt(days)} days')
    `).get();

    const emails = db.prepare(`
      SELECT COUNT(*) as count
      FROM email_captures
      WHERE created_at >= datetime('now', '-${parseInt(days)} days')
    `).get();

    const conversionRate = overview.total_conversations > 0
      ? ((overview.conversions / overview.total_conversations) * 100).toFixed(1)
      : 0;

    res.json({
      totalConversations: overview.total_conversations || 0,
      totalMessages: overview.total_messages || 0,
      uniqueVisitors: overview.unique_visitors || 0,
      emailsCaptured: emails.count || 0,
      conversions: overview.conversions || 0,
      totalRevenue: overview.total_revenue || 0,
      conversionRate: parseFloat(conversionRate),
      avgMessagesPerConvo: Math.round(overview.avg_messages || 0),
    });
  } catch (err) {
    console.error('Analytics overview error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Daily breakdown
router.get('/daily', (req, res) => {
  try {
    const db = getDb();
    const { days = 30 } = req.query;

    const daily = db.prepare(`
      SELECT
        date(started_at) as date,
        COUNT(*) as conversations,
        SUM(message_count) as messages,
        COUNT(DISTINCT visitor_id) as visitors,
        SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END) as conversions
      FROM conversations
      WHERE started_at >= datetime('now', '-${parseInt(days)} days')
      GROUP BY date(started_at)
      ORDER BY date DESC
    `).all();

    res.json({ daily });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load daily analytics' });
  }
});

// Recent conversations
router.get('/conversations', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 20, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = 'SELECT * FROM conversations';
    const params = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY started_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    const conversations = db.prepare(query).all(...params);

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM conversations ${status ? 'WHERE status = ?' : ''}`
    ).get(...(status ? [status] : []));

    res.json({
      conversations,
      total: total.count,
      page: parseInt(page),
      pages: Math.ceil(total.count / parseInt(limit)),
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// Single conversation with messages
router.get('/conversations/:id', (req, res) => {
  try {
    const db = getDb();
    const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(req.params.id);
    if (!conversation) return res.status(404).json({ error: 'Conversation not found' });

    const messages = db.prepare(`
      SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC
    `).all(req.params.id);

    res.json({ conversation, messages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load conversation' });
  }
});

// Top triggers
router.get('/triggers', (req, res) => {
  try {
    const db = getDb();
    const triggers = db.prepare(`
      SELECT trigger_type, COUNT(*) as count
      FROM conversations
      WHERE trigger_type IS NOT NULL
        AND started_at >= datetime('now', '-30 days')
      GROUP BY trigger_type
      ORDER BY count DESC
    `).all();

    res.json({ triggers });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load triggers' });
  }
});

// Top pages
router.get('/pages', (req, res) => {
  try {
    const db = getDb();
    const pages = db.prepare(`
      SELECT source_page, COUNT(*) as count
      FROM conversations
      WHERE started_at >= datetime('now', '-30 days')
      GROUP BY source_page
      ORDER BY count DESC
      LIMIT 20
    `).all();

    res.json({ pages });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load page analytics' });
  }
});

// Email captures list
router.get('/emails', (req, res) => {
  try {
    const db = getDb();
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const emails = db.prepare(`
      SELECT * FROM email_captures ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(parseInt(limit), offset);

    const total = db.prepare('SELECT COUNT(*) as count FROM email_captures').get();

    res.json({ emails, total: total.count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load emails' });
  }
});

module.exports = router;
