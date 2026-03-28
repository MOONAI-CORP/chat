const express = require('express');
const router = express.Router();
const chatService = require('../services/chat');
const { v4: uuidv4 } = require('uuid');

// Send a chat message
router.post('/message', async (req, res) => {
  try {
    const { conversationId, visitorId, message, sourcePage } = req.body;

    if (!message || !visitorId) {
      return res.status(400).json({ error: 'message and visitorId are required' });
    }

    const result = await chatService.chat(
      conversationId || uuidv4(),
      visitorId,
      message,
      sourcePage || '/'
    );

    res.json(result);
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Failed to process message' });
  }
});

// Get a greeting message
router.post('/greeting', async (req, res) => {
  try {
    const { sourcePage, triggerType, ...context } = req.body;
    const greeting = await chatService.generateGreeting(sourcePage || '/', triggerType || 'default', context);
    res.json({ message: greeting });
  } catch (err) {
    console.error('Greeting error:', err);
    res.status(500).json({ error: 'Failed to generate greeting' });
  }
});

// Get conversation history
router.get('/history/:conversationId', (req, res) => {
  try {
    const messages = chatService.getConversationHistory(req.params.conversationId);
    res.json({ messages });
  } catch (err) {
    console.error('History error:', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// End a conversation
router.post('/end', (req, res) => {
  try {
    const { conversationId } = req.body;
    if (!conversationId) return res.status(400).json({ error: 'conversationId required' });
    chatService.endConversation(conversationId);
    res.json({ success: true });
  } catch (err) {
    console.error('End conversation error:', err);
    res.status(500).json({ error: 'Failed to end conversation' });
  }
});

// Capture email
router.post('/capture-email', (req, res) => {
  try {
    const { conversationId, email, sourcePage } = req.body;
    if (!email) return res.status(400).json({ error: 'email required' });

    const result = chatService.saveEmailCapture(conversationId, email, sourcePage);
    res.json({ success: true, discountCode: result.discountCode });
  } catch (err) {
    console.error('Email capture error:', err);
    res.status(500).json({ error: 'Failed to capture email' });
  }
});

module.exports = router;
