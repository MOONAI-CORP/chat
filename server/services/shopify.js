const https = require('https');

class ShopifyService {
  constructor() {
    this.storeUrl = process.env.SHOPIFY_STORE_URL;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    this.apiVersion = '2026-01';
  }

  async request(endpoint, method = 'GET', body = null) {
    const url = `https://${this.storeUrl}/admin/api/${this.apiVersion}/${endpoint}`;
    const options = {
      method,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(`Shopify API ${res.statusCode}: ${JSON.stringify(parsed.errors || parsed)}`));
            } else {
              resolve(parsed);
            }
          } catch (e) {
            reject(new Error(`Failed to parse Shopify response: ${data.substring(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // ── Product Catalog ──

  async getAllProducts() {
    const products = [];
    let url = 'products.json?limit=250&status=active';
    while (url) {
      const data = await this.request(url);
      products.push(...(data.products || []));
      // Handle pagination via Link header (simplified - fetch up to 250)
      url = null; // For stores with <250 products
      if (data.products && data.products.length === 250) {
        const lastId = data.products[data.products.length - 1].id;
        url = `products.json?limit=250&since_id=${lastId}&status=active`;
      }
    }
    return products;
  }

  async getProduct(productId) {
    const data = await this.request(`products/${productId}.json`);
    return data.product;
  }

  async searchProducts(query) {
    // Use the title search parameter
    const data = await this.request(`products.json?title=${encodeURIComponent(query)}&limit=10&status=active`);
    return data.products || [];
  }

  async getCollectionProducts(collectionHandle) {
    // First get collection by handle
    const collections = await this.request(`custom_collections.json?handle=${collectionHandle}`);
    if (collections.custom_collections && collections.custom_collections.length > 0) {
      const collectionId = collections.custom_collections[0].id;
      const products = await this.request(`collections/${collectionId}/products.json?limit=10`);
      return products.products || [];
    }
    // Try smart collections
    const smartCollections = await this.request(`smart_collections.json?handle=${collectionHandle}`);
    if (smartCollections.smart_collections && smartCollections.smart_collections.length > 0) {
      const collectionId = smartCollections.smart_collections[0].id;
      const products = await this.request(`collections/${collectionId}/products.json?limit=10`);
      return products.products || [];
    }
    return [];
  }

  // ── Orders ──

  async getOrderByNumber(orderNumber) {
    const data = await this.request(`orders.json?name=%23${orderNumber}&status=any&limit=1`);
    return data.orders && data.orders.length > 0 ? data.orders[0] : null;
  }

  async getOrderByEmail(email) {
    const data = await this.request(`orders.json?email=${encodeURIComponent(email)}&status=any&limit=5`);
    return data.orders || [];
  }

  async getOrder(orderId) {
    const data = await this.request(`orders/${orderId}.json`);
    return data.order;
  }

  async cancelOrder(orderId, reason = 'customer') {
    const data = await this.request(`orders/${orderId}/cancel.json`, 'POST', { reason });
    return data;
  }

  async updateOrderAddress(orderId, address) {
    const data = await this.request(`orders/${orderId}.json`, 'PUT', {
      order: { id: orderId, shipping_address: address }
    });
    return data.order;
  }

  async getOrderFulfillments(orderId) {
    const data = await this.request(`orders/${orderId}/fulfillments.json`);
    return data.fulfillments || [];
  }

  // ── Customers ──

  async getCustomerByEmail(email) {
    const data = await this.request(`customers/search.json?query=email:${encodeURIComponent(email)}`);
    return data.customers && data.customers.length > 0 ? data.customers[0] : null;
  }

  async getCustomerOrders(customerId) {
    const data = await this.request(`customers/${customerId}/orders.json?status=any&limit=10`);
    return data.orders || [];
  }

  // ── Inventory ──

  async checkVariantInventory(variantId) {
    const data = await this.request(`variants/${variantId}.json`);
    return {
      available: data.variant.inventory_quantity > 0,
      quantity: data.variant.inventory_quantity,
      price: data.variant.price,
      compareAtPrice: data.variant.compare_at_price,
    };
  }

  // ── Cart / Checkout helpers ──

  formatProductForChat(product) {
    const variant = product.variants[0];
    const image = product.images && product.images[0] ? product.images[0].src : null;
    const onSale = variant.compare_at_price && parseFloat(variant.compare_at_price) > parseFloat(variant.price);
    const discount = onSale
      ? Math.round((1 - parseFloat(variant.price) / parseFloat(variant.compare_at_price)) * 100)
      : 0;

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      url: `https://${this.storeUrl.replace('.myshopify.com', '.com')}/products/${product.handle}`,
      price: variant.price,
      compareAtPrice: variant.compare_at_price,
      onSale,
      discount: discount > 0 ? `${discount}% OFF` : null,
      image,
      available: variant.inventory_quantity > 0 || variant.inventory_policy === 'continue',
      variants: product.variants.map(v => ({
        id: v.id,
        title: v.title,
        price: v.price,
        available: v.inventory_quantity > 0 || v.inventory_policy === 'continue',
      })),
    };
  }
}

module.exports = new ShopifyService();
