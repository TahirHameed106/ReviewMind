// backend/middleware/validation.js
const { z } = require('zod');

// Chat message validation schema
const chatMessageSchema = z.object({
  conversationId: z.string().min(5, 'Invalid conversation ID'),
  message: z.string().min(1, 'Message cannot be empty').max(2000, 'Message too long')
});

// Session validation schema
const sessionSchema = z.object({
  sessionId: z.string().min(10, 'Invalid session ID')
});

// Report generation schema
const reportSchema = z.object({
  sessionId: z.string().min(10, 'Invalid session ID')
});

function validateChat(req, res, next) {
  const result = chatMessageSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid request',
      details: result.error.errors
    });
  }
  next();
}

function validateSession(req, res, next) {
  const result = sessionSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      success: false,
      error: 'Invalid session ID'
    });
  }
  next();
}

module.exports = {
  validateChat,
  validateSession,
  chatMessageSchema,
  sessionSchema,
  reportSchema
};