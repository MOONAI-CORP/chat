const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../db/schema');
const shopify = require('./shopify');
const brand = require('../../config/brand.json');
const { v4: uuidv4 } = require('uuid');

class ChatService {
  constructor() {
    this.client = null;
    this.model = 'claude-sonnet-4-6';
  }

  getClient() {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  buildSystemPrompt(products = []) {
    const productCatalog = products.length > 0
      ? products.map(p => {
          const v = p.variants ? JSON.parse(p.variants)[0] : {};
          return `- ${p.title} | $${p.price_min} | ${p.available ? 'In Stock' : 'Out of Stock'} | ${brand.storeUrl}/products/${p.handle}`;
        }).join('\n')
      : 'Product catalog is loading...';

    return `You are the AI Shopping Concierge for ${brand.storeName} (${brand.storeUrl}).

## YOUR ROLE
You are a confident, trendy tech accessories expert. You help shoppers find the perfect phone case, Apple Watch band, MagSafe wallet, or keychain — answering product questions, handling order inquiries, and guiding them to purchase while embodying the Limited Armor brand.

## BRAND VOICE
- Tone: ${brand.brandVoice.tone}
- Personality: ${brand.brandVoice.personality}
- DO: ${brand.brandVoice.do.join('; ')}
- DO NOT: ${brand.brandVoice.doNot.join('; ')}

## CURRENT PROMOTION
${brand.currentPromotion.active ? `${brand.currentPromotion.name}: ${brand.currentPromotion.discount}. ${brand.currentPromotion.freeShipping ? 'Free shipping included.' : ''}` : 'No active promotion.'}

## STORE POLICIES
- Shipping: ${brand.policies.shipping}
- Returns: ${brand.policies.returns}
- Guarantee: ${brand.policies.guarantee}
- Exchanges: ${brand.policies.exchanges}

## PRODUCT CATALOG
${productCatalog}

## COLLECTIONS
${brand.collections.map(c => `- ${c.name}: ${brand.storeUrl}${c.url}`).join('\n')}

## CAPABILITIES (Tool Use)
You can include these special tags in your response. The system will process them:

1. **Recommend products** — ONLY when the customer has told you what they want (device model, product type, style):
   [PRODUCT_CARD:exact_product_handle]
   CRITICAL: The handle must EXACTLY match one from the catalog above. Copy it character-for-character. Do NOT guess handles. Do NOT invent handles. If you're unsure of the exact handle, use a [LINK] to the collection page instead.
   Only show 1-3 cards max per response. Only show cards when the user specifically asks to see products or you have enough info to make a targeted recommendation.

2. **Order lookup** — when customer asks about an order:
   [ORDER_LOOKUP:order_number_or_email]

3. **Email capture** — ONLY after 3+ messages when the customer seems interested but hesitant:
   [EMAIL_CAPTURE]

4. **Link to page** — to direct customers to collections or pages:
   [LINK:url|link_text]

## CONVERSATION FLOW

1. **First message**: Greet briefly. Ask what they're looking for (device? product type?).
2. **Discover needs**: Ask their phone model or watch size BEFORE recommending anything. Don't show products until you know what device they have.
3. **Recommend**: Once you know the device, recommend 1-3 specific products using [PRODUCT_CARD:handle]. Explain briefly why each fits.
4. **Mention the deal**: Casually mention "Buy 2 Get 1 Free" promo when relevant — it's a strong closer.
5. **Support**: For order/shipping/return questions, be helpful and direct. Get order # first.
6. **Close**: End with a clear next step.

## RESPONSE FORMAT
- Keep responses SHORT — 2-3 sentences max.
- Be conversational, not robotic. Sound like a knowledgeable friend.
- Never use markdown headers (#) or bullet lists — just natural sentences.
- Max 1 emoji per message, only when it feels natural.
- Do NOT show product cards in your first response — ask what they need first.

## RULES
- You are the ${brand.storeName} shopping assistant. Never mention AI, Claude, or chatbot.
- ONLY reference products that exist in the catalog above. Never invent products.
- If a handle isn't in the catalog, use [LINK:/collections/iphone-cases|Browse iPhone Cases] instead.
- Never discuss competitors.
- If unsure, direct to ${brand.supportEmail}.`;
  }

  async chat(conversationId, visitorId, userMessage, sourcePage = '/') {
    const db = getDb();

    // Get or create conversation
    let conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
    if (!conversation) {
      conversationId = conversationId || uuidv4();
      db.prepare(`
        INSERT INTO conversations (id, visitor_id, source_page, status)
        VALUES (?, ?, ?, 'active')
      `).run(conversationId, visitorId, sourcePage);
      conversation = { id: conversationId, message_count: 0 };
    }

    // Save user message
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content)
      VALUES (?, 'user', ?)
    `).run(conversationId, userMessage);

    // Get conversation history
    const history = db.prepare(`
      SELECT role, content FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT 50
    `).all(conversationId);

    // Get product catalog — search relevant products based on user's message
    const keywords = userMessage.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let products;
    if (keywords.length > 0) {
      // Search for products matching what the user is asking about
      const likeConditions = keywords.map(() => 'LOWER(title) LIKE ?').join(' OR ');
      const likeValues = keywords.map(k => `%${k}%`);
      products = db.prepare(`SELECT * FROM products WHERE available = 1 AND (${likeConditions}) LIMIT 30`).all(...likeValues);
      // If no matches, fall back to a broad set
      if (products.length === 0) {
        products = db.prepare('SELECT * FROM products WHERE available = 1 ORDER BY RANDOM() LIMIT 50').all();
      }
    } else {
      products = db.prepare('SELECT * FROM products WHERE available = 1 ORDER BY RANDOM() LIMIT 50').all();
    }

    // Build messages for Claude
    const messages = history.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    // Call Claude Sonnet
    const response = await this.getClient().messages.create({
      model: this.model,
      max_tokens: 500,
      system: this.buildSystemPrompt(products),
      messages,
    });

    const assistantMessage = response.content[0].text;

    // Process special tags in the response
    const processed = await this.processSpecialTags(assistantMessage);

    // Save assistant message
    db.prepare(`
      INSERT INTO messages (conversation_id, role, content, product_cards)
      VALUES (?, 'assistant', ?, ?)
    `).run(conversationId, assistantMessage, JSON.stringify(processed.productCards));

    // Update conversation
    db.prepare(`
      UPDATE conversations
      SET message_count = message_count + 2
      WHERE id = ?
    `).run(conversationId);

    return {
      conversationId,
      message: processed.cleanMessage,
      productCards: processed.productCards,
      showEmailCapture: processed.showEmailCapture,
      links: processed.links,
      orderData: processed.orderData,
    };
  }

  async processSpecialTags(message) {
    let cleanMessage = message;
    const productCards = [];
    const links = [];
    let showEmailCapture = false;
    let orderData = null;

    // Process [PRODUCT_CARD:handle]
    const productMatches = message.matchAll(/\[PRODUCT_CARD:([^\]]+)\]/g);
    for (const match of productMatches) {
      const handle = match[1].trim();
      try {
        const db = getDb();
        const product = db.prepare('SELECT * FROM products WHERE handle = ?').get(handle);
        if (product) {
          productCards.push({
            title: product.title,
            handle: product.handle,
            url: `${brand.storeUrl}/products/${product.handle}`,
            price: product.price_min,
            compareAtPrice: product.compare_at_price,
            image: product.images ? JSON.parse(product.images)[0] : null,
            available: !!product.available,
          });
        }
      } catch (e) {
        console.error('Error loading product card:', e.message);
      }
      cleanMessage = cleanMessage.replace(match[0], '');
    }

    // Process [ORDER_LOOKUP:identifier]
    const orderMatch = message.match(/\[ORDER_LOOKUP:([^\]]+)\]/);
    if (orderMatch) {
      const identifier = orderMatch[1].trim();
      try {
        if (identifier.includes('@')) {
          const orders = await shopify.getOrderByEmail(identifier);
          orderData = orders.map(o => ({
            number: o.name,
            status: o.financial_status,
            fulfillment: o.fulfillment_status || 'unfulfilled',
            total: o.total_price,
            createdAt: o.created_at,
          }));
        } else {
          const orderNum = identifier.replace('#', '');
          const order = await shopify.getOrderByNumber(orderNum);
          if (order) {
            const fulfillments = await shopify.getOrderFulfillments(order.id);
            orderData = {
              number: order.name,
              status: order.financial_status,
              fulfillment: order.fulfillment_status || 'unfulfilled',
              total: order.total_price,
              createdAt: order.created_at,
              trackingUrl: fulfillments[0]?.tracking_url || null,
              trackingNumber: fulfillments[0]?.tracking_number || null,
              items: order.line_items.map(li => ({
                title: li.title,
                quantity: li.quantity,
                price: li.price,
              })),
            };
          }
        }
      } catch (e) {
        console.error('Error looking up order:', e.message);
      }
      cleanMessage = cleanMessage.replace(orderMatch[0], '');
    }

    // Process [EMAIL_CAPTURE]
    if (message.includes('[EMAIL_CAPTURE]')) {
      showEmailCapture = true;
      cleanMessage = cleanMessage.replace(/\[EMAIL_CAPTURE\]/g, '');
    }

    // Process [LINK:url|text]
    const linkMatches = message.matchAll(/\[LINK:([^|]+)\|([^\]]+)\]/g);
    for (const match of linkMatches) {
      links.push({ url: match[1].trim(), text: match[2].trim() });
      cleanMessage = cleanMessage.replace(match[0], '');
    }

    cleanMessage = cleanMessage.trim();

    return { cleanMessage, productCards, showEmailCapture, links, orderData };
  }

  async generateGreeting(sourcePage, triggerType, context = {}) {
    // For simple cases, use fast static greetings
    // For rich context, use AI-generated greetings
    const hasRichContext = context.productsViewed?.length > 0
      || context.isReturnVisitor
      || context.addToCartCount > 0
      || context.sessionPages?.length > 2;

    if (hasRichContext) {
      return this.generateAIGreeting(sourcePage, triggerType, context);
    }

    // Static greetings for simple triggers
    if (sourcePage.includes('/products/')) {
      const handle = sourcePage.split('/products/')[1]?.split('?')[0];
      const db = getDb();
      const product = db.prepare('SELECT title, price_min FROM products WHERE handle = ?').get(handle);
      if (product) {
        return `Checking out the ${product.title}? Great choice — want me to tell you more about it or help you find a matching band or accessory?`;
      }
      return "Nice pick! Want me to tell you more about this or help find matching accessories?";
    }
    if (sourcePage.includes('/collections/')) {
      const handle = sourcePage.split('/collections/')[1]?.split('?')[0];
      const collectionNames = {
        'iphone-cases': 'iPhone cases',
        'samsung-cases': 'Samsung cases',
        'pixel-cases': 'Pixel cases',
        'watch-bands': 'watch bands',
        'keychains': 'keychains',
        'magsafe-wallets': 'MagSafe wallets',
        'puffer-cases': 'puffer cases',
      };
      const name = collectionNames[handle] || 'products';
      return `Browsing ${name}? Tell me your device model and I'll find the perfect match for you 🔥`;
    }
    if (sourcePage === '/cart') {
      return "Almost there! Got any questions before checkout? I can also suggest a matching accessory to complete the look 👊";
    }

    const defaults = {
      'exit-intent': "Wait — before you go! Need help finding the right case? I know every product in our catalog.",
      'inactivity': "Need a hand? Tell me your phone model and I'll find the best case for you.",
      'scroll-depth': "You've been browsing — want me to narrow it down? What device are you shopping for?",
      'time-on-page': "Hey! Looking for something specific? I can help you find the perfect case, band, or accessory.",
      'default': "Hey! Welcome to Limited Armor 🛡️ What device are you shopping for?",
    };

    return defaults[triggerType] || defaults['default'];
  }

  async generateAIGreeting(sourcePage, triggerType, context) {
    try {
      const db = getDb();

      // Get names of recently viewed products
      let viewedNames = [];
      if (context.productsViewed?.length > 0) {
        const placeholders = context.productsViewed.map(() => '?').join(',');
        viewedNames = db.prepare(
          `SELECT title, handle, price_min FROM products WHERE handle IN (${placeholders}) LIMIT 5`
        ).all(...context.productsViewed).map(p => p.title);
      }

      // Get current product if on product page
      let currentProduct = null;
      if (sourcePage.includes('/products/')) {
        const handle = sourcePage.split('/products/')[1]?.split('?')[0];
        currentProduct = db.prepare('SELECT title, price_min FROM products WHERE handle = ?').get(handle);
      }

      const prompt = `Generate a short, proactive chat greeting (1-2 sentences max) for a visitor on ${brand.storeName}.

CONTEXT:
- Trigger: ${triggerType}
- Current page: ${sourcePage}
${currentProduct ? `- Currently viewing: ${currentProduct.title} ($${currentProduct.price_min})` : ''}
${viewedNames.length > 0 ? `- Products browsed this session: ${viewedNames.join(', ')}` : ''}
- Return visitor: ${context.isReturnVisitor ? `Yes (visit #${context.visitCount})` : 'No, first visit'}
${context.addToCartCount > 0 ? `- Added ${context.addToCartCount} item(s) to cart` : ''}
${context.sessionPages?.length > 2 ? `- Browsed ${context.sessionPages.length} pages this session` : ''}

RULES:
- Be specific to what they're doing — reference the actual product or behavior
- Sound like a knowledgeable friend, not a salesperson
- Don't say "I noticed" or "I see you" — just naturally offer help
- Max 1 emoji
- If they're comparing products, help them decide
- If they added to cart but haven't checked out, gently nudge
- If return visitor, acknowledge familiarity without being creepy
- Keep it under 25 words`;

      const response = await this.getClient().messages.create({
        model: this.model,
        max_tokens: 100,
        messages: [{ role: 'user', content: prompt }],
      });

      return response.content[0].text.trim().replace(/^["']|["']$/g, '');
    } catch (e) {
      console.error('AI greeting error:', e.message);
      return "Hey! Need help finding something? I know every product in our catalog 🛡️";
    }
  }

  getConversationHistory(conversationId) {
    const db = getDb();
    return db.prepare(`
      SELECT role, content, product_cards, created_at
      FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
    `).all(conversationId);
  }

  endConversation(conversationId) {
    const db = getDb();
    db.prepare(`
      UPDATE conversations
      SET status = 'ended', ended_at = datetime('now')
      WHERE id = ?
    `).run(conversationId);
  }

  saveEmailCapture(conversationId, email, sourcePage) {
    const db = getDb();
    db.prepare(`
      INSERT INTO email_captures (conversation_id, email, discount_code, source_page)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, email, brand.emailCapture.discountCode, sourcePage);

    db.prepare(`
      UPDATE conversations SET email = ? WHERE id = ?
    `).run(email, conversationId);

    return { discountCode: brand.emailCapture.discountCode };
  }
}

module.exports = new ChatService();
