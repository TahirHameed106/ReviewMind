// backend/utils/sanitize.js
// Enhanced input sanitization for LLM prompts

function sanitizeText(text, maxLength = 1000) {
  if (!text) return '';
  
  let sanitized = String(text);
  
  // Normalize unicode (NFKC)
  sanitized = sanitized.normalize('NFKC');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ');
  
  // Remove HTML tags
  sanitized = sanitized.replace(/<[^>]*>/g, '');
  
  // Blocked patterns for prompt injection
  const blockedPatterns = [
    { pattern: /ignore.{0,20}previous.{0,20}instructions/gi, replacement: '[REDACTED]' },
    { pattern: /ignore.{0,20}all.{0,20}previous/gi, replacement: '[REDACTED]' },
    { pattern: /system.{0,10}prompt/gi, replacement: '[REDACTED]' },
    { pattern: /forget.{0,20}previous/gi, replacement: '[REDACTED]' },
    { pattern: /reveal.{0,20}(?:secret|key|token|password)/gi, replacement: '[REDACTED]' },
    { pattern: /api.{0,5}key/gi, replacement: '[REDACTED]' },
    { pattern: /expose.{0,20}(?:data|information)/gi, replacement: '[REDACTED]' },
    { pattern: /you.{0,5}are.{0,5}now/gi, replacement: '[REDACTED]' },
    { pattern: /act.{0,5}as.{0,5}(?:a|an)/gi, replacement: '[REDACTED]' },
    { pattern: /disregard.{0,20}instructions/gi, replacement: '[REDACTED]' }
  ];
  
  for (const { pattern, replacement } of blockedPatterns) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  // Remove any remaining special characters that could be dangerous
  sanitized = sanitized.replace(/[<>{}[\]\\]/g, '');
  
  // Trim and limit length
  sanitized = sanitized.trim().substring(0, maxLength);
  
  return sanitized;
}

function sanitizeReviewData(reviewData) {
  if (!reviewData) return reviewData;
  
  const sanitized = { ...reviewData };
  
  if (sanitized.sampleReviews) {
    sanitized.sampleReviews = sanitized.sampleReviews.map(review => ({
      ...review,
      text: sanitizeText(review.text, 500)
    }));
  }
  
  if (sanitized.complaintCategories) {
    sanitized.complaintCategories = sanitized.complaintCategories.map(cat => ({
      ...cat,
      category: sanitizeText(cat.category, 100)
    }));
  }
  
  return sanitized;
}

function validateChatInput(message) {
  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a string' };
  }
  
  if (message.length > 2000) {
    return { valid: false, error: 'Message too long (max 2000 characters)' };
  }
  
  if (message.length < 1) {
    return { valid: false, error: 'Message cannot be empty' };
  }
  
  return { valid: true, sanitized: sanitizeText(message, 2000) };
}

module.exports = {
  sanitizeText,
  sanitizeReviewData,
  validateChatInput
};