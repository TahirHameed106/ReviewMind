const axios = require('axios');

class ConversationManager {
  constructor() {
    this.conversations = new Map();
  }

  createConversation(analysisContext) {
    const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.conversations.set(conversationId, {
      id: conversationId,
      createdAt: new Date(),
      context: analysisContext || {},
      messages: [],
      systemPrompt: this.buildSystemPrompt(analysisContext)
    });
    return conversationId;
  }

  buildSystemPrompt(analysisContext) {
    const sentimentData = analysisContext?.sentimentData || [];
    const negative = sentimentData.find(item => item.name === 'Negative')?.value || 0;
    const neutral = sentimentData.find(item => item.name === 'Neutral')?.value || 0;
    const positive = sentimentData.find(item => item.name === 'Positive')?.value || 0;
    const total = negative + neutral + positive;
    return `You are ReviewMind AI. Data: ${total} total reviews. Positive: ${positive}, Neutral: ${neutral}, Negative: ${negative}. Answer questions based ONLY on this data.`;
  }

  async addMessage(conversationId, userMessage) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('Conversation not found');
    conversation.messages.push({ role: 'user', content: userMessage });
    const response = await this.getAIResponse(conversation);
    conversation.messages.push({ role: 'assistant', content: response });
    return { conversationId, assistantResponse: response };
  }

  async getAIResponse(conversation) {
    const sentimentData = conversation.context?.sentimentData || [];
    const negative = sentimentData.find(item => item.name === 'Negative')?.value || 0;
    const neutral = sentimentData.find(item => item.name === 'Neutral')?.value || 0;
    const positive = sentimentData.find(item => item.name === 'Positive')?.value || 0;
    const total = negative + neutral + positive;

    const messages = [
      { role: 'system', content: conversation.systemPrompt },
      ...conversation.messages
    ];

    if (process.env.GROQ_API_KEY) {
      try {
        const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: "llama-3.3-70b-versatile",
          messages: messages,
          temperature: 0.7,
          max_tokens: 500
        }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 15000 });
        return response.data.choices[0].message.content;
      } catch (e) { console.log('Groq error:', e.message); }
    }

    return `Based on your ${total} reviews: ${positive} positive, ${neutral} neutral, ${negative} negative (${((negative/total)*100).toFixed(1)}% negative). Ask for specific recommendations.`;
  }

  getConversationHistory(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('Conversation not found');
    return { id: conversationId, createdAt: conversation.createdAt, messages: conversation.messages };
  }

  deleteConversation(conversationId) {
    return this.conversations.delete(conversationId);
  }

  getAllConversations() {
    return Array.from(this.conversations.values()).map(c => ({ id: c.id, createdAt: c.createdAt, messageCount: c.messages.length }));
  }
}

module.exports = new ConversationManager();