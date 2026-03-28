const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'cozy-cloud-chat.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initSchema();
  }
  return db;
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      shopify_id TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      handle TEXT,
      vendor TEXT,
      product_type TEXT,
      tags TEXT,
      variants TEXT,
      images TEXT,
      price_min REAL,
      price_max REAL,
      compare_at_price REAL,
      available INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      source_page TEXT,
      trigger_type TEXT,
      email TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      converted INTEGER DEFAULT 0,
      conversion_value REAL DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      product_cards TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visitor_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      page_url TEXT,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS email_captures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT,
      email TEXT NOT NULL,
      discount_code TEXT,
      source_page TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
    );

    CREATE TABLE IF NOT EXISTS analytics_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      total_conversations INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      unique_visitors INTEGER DEFAULT 0,
      emails_captured INTEGER DEFAULT 0,
      conversions INTEGER DEFAULT 0,
      conversion_value REAL DEFAULT 0,
      avg_messages_per_convo REAL DEFAULT 0,
      top_trigger TEXT,
      top_pages TEXT,
      drop_off_reasons TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_visitor ON conversations(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(date);
  `);
}

module.exports = { getDb, DB_PATH };
