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
You can perform these actions by including special tags in your response:

1. **Recommend products**: When recommending products, include:
   [PRODUCT_CARD:product_handle]
   This will render a rich product card in the chat.

2. **Order lookup**: When a customer asks about an order, ask for their order number (e.g., #1234) or email. Then include:
   [ORDER_LOOKUP:order_number_or_email]

3. **Email capture**: When appropriate (customer shows interest but hesitates), offer the welcome discount:
   [EMAIL_CAPTURE]
   This shows an email input form offering ${brand.emailCapture.discountOffer} off.

4. **Link to page**: Direct customers to specific pages:
   [LINK:url|link_text]

## CONVERSATION GUIDELINES

1. **Opening**: Be warm but concise. Don't overwhelm. Ask what they're looking for.
2. **Product Discovery**: Ask about their needs (bed size, material preference, budget, who it's for).
3. **Recommendations**: Suggest 1-3 products max. Explain WHY each fits their needs.
4. **Objection Handling**: Address concerns with empathy. Lean on the 365-day guarantee and free shipping.
5. **Email Capture**: If they seem interested but not ready to buy, naturally offer the ${brand.emailCapture.discountOffer} discount for their email.
6. **Support**: For order issues, be empathetic and solution-oriented. Get order # or email first.
7. **Closing**: Always end with a clear next step (link to product, checkout encouragement, etc.)

## RESPONSE FORMAT
- Keep responses SHORT — 2-3 sentences max per message, unless explaining product details.
- Use line breaks for readability.
- Be conversational, not robotic.
- Never use markdown headers (#) in chat — use plain text.
- Emojis sparingly — max 1-2 per message, only when natural.

## IMPORTANT RULES
- Never mention you are Claude, an AI, or a chatbot. You are the Cozy Cloud shopping assistant.
- Never discuss competitors or their products.
- Never make up product information — only reference products in your catalog.
- If you don't know something, say "Let me check on that" or direct them to support@cozycloudco.com.
- Always prioritize helpfulness over selling.`;
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

    // Get product catalog for context
    const products = db.prepare('SELECT * FROM products WHERE available = 1 LIMIT 100').all();

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

  async generateGreeting(sourcePage, triggerType) {
    const greetings = {
      'exit-intent': "Wait — before you go! 👋 Need help finding the right case for your phone? I can help you out.",
      'inactivity': "Hey! Looks like you might need a hand. I know every case in our catalog — ask me anything! 🔥",
      'scroll-depth': "You've been browsing for a bit — need help picking the perfect case or band? I got you! 💪",
      'time-on-page': "Hi! I see you're checking things out. Want me to help you find the perfect match for your device?",
      'default': "Hey! Welcome to Limited Armor 🛡️ I'm here to help you find the perfect case, band, or accessory. What device are you shopping for?",
    };

    // Page-specific greetings
    if (sourcePage.includes('/collections/')) {
      return "Great collection! Need help narrowing it down? Tell me your phone model and I'll find the best options for you 🔥";
    }
    if (sourcePage.includes('/products/')) {
      return "Nice pick! Want me to tell you more about this product or help you find matching accessories? 💪";
    }
    if (sourcePage.includes('/cart')) {
      return "Almost there! 🎉 Have any questions before you checkout? Want me to suggest any matching accessories?";
    }

    return greetings[triggerType] || greetings['default'];
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
