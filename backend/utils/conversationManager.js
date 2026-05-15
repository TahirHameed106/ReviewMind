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
    const complaints = analysisContext?.complaints || [];
    const metrics = analysisContext?.metrics || {};
    
    const negative = sentimentData.find(item => item.name === 'Negative')?.value || 0;
    const neutral = sentimentData.find(item => item.name === 'Neutral')?.value || 0;
    const positive = sentimentData.find(item => item.name === 'Positive')?.value || 0;
    const total = negative + neutral + positive;
    const negativePct = total > 0 ? ((negative / total) * 100).toFixed(1) : 0;

    let complaintText = "No specific complaint data available.";
    if (complaints && complaints.length > 0) {
      complaintText = complaints.slice(0, 3).map(c => 
        `- ${c.category}: ${c.count} mentions (${c.percentage}% of negatives)`
      ).join('\n');
    }

    return `You are ReviewMind's SME Intelligence Assistant. Use ONLY this REAL data:

REVIEW DATA:
- Total Reviews: ${total}
- Positive: ${positive} (${((positive/total)*100).toFixed(1)}%)
- Neutral: ${neutral}
- Negative: ${negative} (${negativePct}%)
- Average Rating: ${metrics.avg_rating || 'N/A'}/5
- Risk Level: ${metrics.risk_level || 'Unknown'}

TOP COMPLAINT CATEGORIES (from actual review text):
${complaintText}

Answer questions based ONLY on this data. Be specific and cite the actual numbers above.`;
  }

  async addMessage(conversationId, userMessage) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('Conversation not found');

    conversation.messages.push({ role: 'user', content: userMessage, timestamp: new Date() });
    const response = await this.getAIResponse(conversation);
    conversation.messages.push({ role: 'assistant', content: response, timestamp: new Date() });

    return { conversationId, userMessage, assistantResponse: response, messageCount: conversation.messages.length };
  }

  async getAIResponse(conversation) {
    const sentimentData = conversation.context?.sentimentData || [];
    const metrics = conversation.context?.metrics || {};
    const complaints = conversation.context?.complaints || [];
    
    const negative = sentimentData.find(item => item.name === 'Negative')?.value || 0;
    const neutral = sentimentData.find(item => item.name === 'Neutral')?.value || 0;
    const positive = sentimentData.find(item => item.name === 'Positive')?.value || 0;
    const total = negative + neutral + positive;
    const negativePct = total > 0 ? ((negative / total) * 100).toFixed(1) : 0;

    const messages = [
      { role: 'system', content: conversation.systemPrompt },
      ...conversation.messages.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    // Try Groq first
    if (process.env.GROQ_API_KEY) {
      try {
        console.log('[Chat] Calling Groq...');
        const response = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: "llama-3.3-70b-versatile",
            messages: messages,
            temperature: 0.7,
            max_tokens: 500
          },
          {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            timeout: 15000
          }
        );
        console.log('[Chat] Groq success');
        return response.data.choices[0].message.content;
      } catch (e) {
        console.error('[Chat] Groq error:', e.message);
      }
    }

    // Smart fallback based on REAL data
    return this.smartFallback(negative, neutral, positive, total, negativePct, metrics, complaints);
  }

  smartFallback(negative, neutral, positive, total, negativePct, metrics, complaints) {
    // Build response based on actual data
    let response = `📊 **Based on YOUR ${total.toLocaleString()} reviews:**\n\n`;
    response += `• Positive: ${positive.toLocaleString()} (${((positive/total)*100).toFixed(1)}%)\n`;
    response += `• Neutral: ${neutral.toLocaleString()}\n`;
    response += `• Negative: ${negative.toLocaleString()} (${negativePct}%)\n`;
    response += `• Average Rating: ${metrics.avg_rating || 'N/A'}/5\n`;
    response += `• Risk Level: ${metrics.risk_level || 'Unknown'}\n\n`;
    
    if (complaints && complaints.length > 0) {
      response += `**Top Complaints:**\n`;
      complaints.slice(0, 3).forEach(c => {
        response += `• ${c.category}: ${c.count} reviews (${c.percentage}%)\n`;
      });
    }
    
    if (negativePct > 25) {
      response += `\n⚠️ **CRITICAL:** ${negativePct}% negative rate. Focus on fixing "${complaints[0]?.category || 'top complaints'}" immediately.`;
    } else if (negativePct > 15) {
      response += `\n📊 **MODERATE:** ${negativePct}% negative rate. Targeted improvements needed.`;
    } else {
      response += `\n✅ **GOOD:** Only ${negativePct}% negative feedback. Maintain quality.`;
    }
    
    return response;
  }

  getConversationHistory(conversationId) {
    const conversation = this.conversations.get(conversationId);
    if (!conversation) throw new Error('Conversation not found');
    return { id: conversationId, createdAt: conversation.createdAt, messageCount: conversation.messages.length, messages: conversation.messages };
  }

  deleteConversation(conversationId) {
    return this.conversations.delete(conversationId);
  }

  getAllConversations() {
    return Array.from(this.conversations.values()).map(conv => ({ id: conv.id, createdAt: conv.createdAt, messageCount: conv.messages.length }));
  }
}

module.exports = new ConversationManager();