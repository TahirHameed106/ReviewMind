// backend/utils/conversationManager.js
const axios = require('axios');

class ConversationManager {
    constructor() {
        this.conversations = new Map();
    }

    createConversation(rawContext = {}) {
        const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // NORMALIZE CONTEXT - Handles BOTH shapes from frontend AND backend
        const pieData = rawContext.pieData || rawContext.sentimentData || [];
        const metrics = rawContext.metrics || {};
        const complaints = rawContext.complaintCategories || rawContext.complaints || [];
        
        // Get counts from pieData OR metrics
        let pos = 0, neu = 0, neg = 0;
        
        if (pieData.length > 0) {
            pos = Number(pieData.find(d => d.name === 'Positive')?.value) || 0;
            neu = Number(pieData.find(d => d.name === 'Neutral')?.value) || 0;
            neg = Number(pieData.find(d => d.name === 'Negative')?.value) || 0;
        } else {
            pos = metrics.positive_count || 0;
            neu = metrics.neutral_count || 0;
            neg = metrics.negative_count || 0;
        }
        
        const total = pos + neu + neg || metrics.total_reviews || 1;
        const avgRating = metrics.avg_rating || 0;
        const risk = metrics.risk_level || 'Unknown';
        
        // Calculate percentages
        const posPct = ((pos / total) * 100).toFixed(1);
        const negPct = ((neg / total) * 100).toFixed(1);
        const neuPct = ((neu / total) * 100).toFixed(1);
        const sentimentScore = metrics.sentiment_score || Math.round((pos / total) * 100);
        
        const ctx = {
            total, pos, neu, neg,
            posPct, negPct, neuPct,
            avgRating, risk, sentimentScore,
            filename: rawContext.filename || 'uploaded CSV',
            complaints: Array.isArray(complaints) ? complaints : []
        };
        
        this.conversations.set(id, {
            id, ctx,
            messages: [],
            createdAt: new Date().toISOString(),
        });
        
        console.log(`[Chat] Created: ${id} | Total: ${total} | Pos: ${posPct}% | Neg: ${negPct}% | Complaints: ${complaints.length}`);
        return id;
    }

    async addMessage(conversationId, userMessage) {
        const conv = this.conversations.get(conversationId);
        if (!conv) throw new Error(`Conversation not found: ${conversationId}`);

        conv.messages.push({ role: 'user', content: userMessage, timestamp: new Date().toISOString() });
        
        let reply;
        if (process.env.GROQ_API_KEY) {
            try {
                reply = await this._groqReply(conv.ctx, conv.messages);
            } catch (e) {
                console.error('[Chat] Groq failed:', e.message);
                reply = this._localReply(conv.ctx, userMessage);
            }
        } else {
            reply = this._localReply(conv.ctx, userMessage);
        }
        
        conv.messages.push({ role: 'assistant', content: reply, timestamp: new Date().toISOString() });
        return { conversationId, assistantResponse: reply, messageCount: conv.messages.length };
    }

    async _groqReply(ctx, messages) {
        const systemPrompt = `You are ReviewMind AI Analyst. Answer ONLY using the real numbers below. Never say "no data available". Never say sentiment is neutral if the numbers show otherwise.

=== REAL DATA ===
Total Reviews: ${ctx.total.toLocaleString()}
Positive: ${ctx.pos.toLocaleString()} (${ctx.posPct}%)
Negative: ${ctx.neg.toLocaleString()} (${ctx.negPct}%)
Average Rating: ${ctx.avgRating}/5.0
Risk Level: ${ctx.risk}

Top Complaints:
${ctx.complaints.length ? ctx.complaints.slice(0,5).map(c => `- ${c.category}: ${c.count} mentions (${c.percentage}%)`).join('\n') : '- No specific complaints detected'}

Answer based on this data only.`;

        const response = await axios.post(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: systemPrompt },
                    ...messages.slice(-6).map(m => ({ role: m.role, content: m.content }))
                ],
                temperature: 0.3,
                max_tokens: 500
            },
            { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 15000 }
        );
        return response.data.choices[0].message.content;
    }

    _localReply(ctx, msg) {
        const q = msg.toLowerCase();
        
        // Detailed report
        if (q.includes('detailed') || q.includes('full') || q.includes('report')) {
            let r = `📊 **Detailed Report — ${ctx.filename}**\n\n`;
            r += `Total Reviews: ${ctx.total.toLocaleString()}\n`;
            r += `✅ Positive: ${ctx.pos.toLocaleString()} (${ctx.posPct}%)\n`;
            r += `❌ Negative: ${ctx.neg.toLocaleString()} (${ctx.negPct}%)\n`;
            r += `⭐ Average Rating: ${ctx.avgRating}/5.0\n`;
            r += `🎯 Risk Level: ${ctx.risk}\n`;
            r += `📈 Sentiment Score: ${ctx.sentimentScore}/100\n\n`;
            
            if (ctx.complaints.length > 0) {
                r += `🔍 **Top Complaints:**\n`;
                ctx.complaints.slice(0, 5).forEach((c, i) => {
                    r += `${i+1}. **${c.category}**: ${c.count} mentions (${c.percentage}% of negatives)\n`;
                });
            }
            return r;
        }
        
        // Complaints
        if (q.includes('complaint') || q.includes('issue')) {
            if (ctx.complaints.length === 0) {
                return `📝 No specific complaint categories detected. ${ctx.neg.toLocaleString()} negative reviews (${ctx.negPct}%) but no text column for breakdown.`;
            }
            let r = `🔍 **Top Issues:**\n\n`;
            ctx.complaints.slice(0, 5).forEach((c, i) => {
                r += `${i+1}. **${c.category}**: ${c.count} mentions (${c.percentage}%)\n`;
            });
            return r;
        }
        
        // Sentiment
        if (q.includes('sentiment')) {
            return `📊 **Sentiment:**\n✅ Positive: ${ctx.pos.toLocaleString()} (${ctx.posPct}%)\n❌ Negative: ${ctx.neg.toLocaleString()} (${ctx.negPct}%)\nScore: ${ctx.sentimentScore}/100`;
        }
        
        // Risk
        if (q.includes('risk')) {
            return `🎯 **Risk Level:** ${ctx.risk}\n\nBased on ${ctx.neg.toLocaleString()} negative reviews (${ctx.negPct}%) out of ${ctx.total.toLocaleString()} total.`;
        }
        
        // Main issue
        if (q.includes('main') || q.includes('primary')) {
            if (ctx.complaints.length > 0) {
                return `🔍 **Main Issue:** ${ctx.complaints[0].category} (${ctx.complaints[0].count} mentions, ${ctx.complaints[0].percentage}% of negatives)`;
            }
            return `❌ ${ctx.neg.toLocaleString()} negative reviews (${ctx.negPct}%) is the main concern.`;
        }
        
        // Default summary
        return `📊 **${ctx.filename}** — ${ctx.total.toLocaleString()} reviews\n✅ ${ctx.posPct}% positive (${ctx.pos.toLocaleString()})\n❌ ${ctx.negPct}% negative (${ctx.neg.toLocaleString()})\n⭐ Rating: ${ctx.avgRating}/5\n🎯 Risk: ${ctx.risk}\n\nAsk: "detailed report", "complaints", "sentiment", "risk", or "main issue"`;
    }

    getConversationHistory(id) {
        const c = this.conversations.get(id);
        if (!c) throw new Error(`Conversation not found: ${id}`);
        return { id: c.id, messages: c.messages, createdAt: c.createdAt };
    }

    getAllConversations() {
        return Array.from(this.conversations.values()).map(c => ({ id: c.id, createdAt: c.createdAt, messageCount: c.messages.length }));
    }

    deleteConversation(id) {
        return this.conversations.delete(id);
    }
}

module.exports = new ConversationManager();