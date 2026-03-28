#!/usr/bin/env node
/**
 * Standalone script to sync products from Shopify to local DB.
 * Run: node server/scripts/sync-products.js
 */
require('dotenv').config();

const shopify = require('../services/shopify');
const { getDb } = require('../db/schema');

async function syncProducts() {
  console.log('Syncing products from Shopify...');

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

    console.log(`Synced ${products.length} products successfully.`);
    products.forEach(p => {
      console.log(`  - ${p.title} ($${p.variants[0]?.price})`);
    });

    process.exit(0);
  } catch (err) {
    console.error('Sync failed:', err.message);
    process.exit(1);
  }
}

syncProducts();
