const express = require('express');
const router = express.Router();
const shopify = require('../services/shopify');
const { getDb } = require('../db/schema');

// Sync products from Shopify to local DB
router.post('/sync', async (req, res) => {
  try {
    const products = await shopify.getAllProducts();
    const db = getDb();

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO products
        (id, shopify_id, title, description, handle, vendor, product_type, tags, variants, images, price_min, price_max, compare_at_price, available, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    const syncMany = db.transaction((products) => {
      for (const p of products) {
        const variants = p.variants || [];
        const prices = variants.map(v => parseFloat(v.price));
        const compareAt = variants.map(v => parseFloat(v.compare_at_price || 0)).filter(p => p > 0);
        const images = (p.images || []).map(img => img.src);
        const available = variants.some(v => v.inventory_quantity > 0 || v.inventory_policy === 'continue');

        upsert.run(
          `prod_${p.id}`,
          String(p.id),
          p.title,
          p.body_html ? p.body_html.replace(/<[^>]*>/g, ' ').trim() : '',
          p.handle,
          p.vendor || '',
          p.product_type || '',
          (p.tags || '').toString(),
          JSON.stringify(variants.map(v => ({
            id: v.id,
            title: v.title,
            price: v.price,
            compare_at_price: v.compare_at_price,
            sku: v.sku,
            inventory_quantity: v.inventory_quantity,
            option1: v.option1,
            option2: v.option2,
            option3: v.option3,
          }))),
          JSON.stringify(images),
          Math.min(...prices),
          Math.max(...prices),
          compareAt.length > 0 ? Math.max(...compareAt) : null,
          available ? 1 : 0
        );
      }
    });

    syncMany(products);

    res.json({ success: true, count: products.length });
  } catch (err) {
    console.error('Product sync error:', err);
    res.status(500).json({ error: 'Failed to sync products: ' + err.message });
  }
});

// Get all products from local DB
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const products = db.prepare('SELECT * FROM products WHERE available = 1 ORDER BY title').all();
    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load products' });
  }
});

// Search products
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Search query required' });

    const db = getDb();
    const products = db.prepare(`
      SELECT * FROM products
      WHERE available = 1
        AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR product_type LIKE ?)
      ORDER BY title
      LIMIT 10
    `).all(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);

    res.json({ products });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search products' });
  }
});

module.exports = router;
