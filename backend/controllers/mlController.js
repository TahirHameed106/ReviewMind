const axios = require('axios');
const csv = require('csvtojson');
const ConversationManager = require('../utils/conversationManager');
require('dotenv').config();

console.log('[ML Controller] API Keys:', {
  groq: process.env.GROQ_API_KEY ? '✅' : '❌',
  gemini: process.env.GEMINI_API_KEY ? '✅' : '❌'
});

function generateFallbackStrategy(miningResults, userQuestion) {
  let negativeCount = 0, positiveCount = 0, neutralCount = 0;
  if (miningResults && Array.isArray(miningResults)) {
    negativeCount = miningResults.find(d => d.name === 'Negative')?.value || 0;
    positiveCount = miningResults.find(d => d.name === 'Positive')?.value || 0;
    neutralCount = miningResults.find(d => d.name === 'Neutral')?.value || 0;
  }
  const total = negativeCount + positiveCount + neutralCount;
  const negativePct = total > 0 ? (negativeCount / total) * 100 : 0;
  const lowerQuestion = (userQuestion || '').toLowerCase();
  
  if (lowerQuestion.includes('reason') || lowerQuestion.includes('why')) {
    return `Negative reviews: ${negativeCount} (${negativePct.toFixed(1)}%). Common causes: Product quality, Shipping delays, Customer service.`;
  }
  if (lowerQuestion.includes('solution') || lowerQuestion.includes('fix')) {
    return `Fix top complaint category first. Export negative reviews and find most frequent issue.`;
  }
  return `Analysis complete. ${total} reviews analyzed.`;
}

const getStrategyReport = async (miningResults, userRequest) => {
  const prompt = `DATA: ${JSON.stringify(miningResults)}. USER: ${userRequest || 'Provide recommendations'}`;
  if (process.env.GROQ_API_KEY) {
    try {
      const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 500
      }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 10000 });
      return groqResponse.data.choices[0].message.content;
    } catch (e) { console.warn("Groq failed:", e.message); }
  }
  return generateFallbackStrategy(miningResults, userRequest);
};

exports.handleCSVUpload = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const jsonArray = await csv().fromFile(req.file.path);
    const mlResponse = await axios.post('http://127.0.0.1:8000/analyze/dashboard-data', jsonArray, { timeout: 30000 });
    if (!mlResponse.data.success) return res.status(400).json({ error: mlResponse.data.error || "Analysis failed" });
    res.status(200).json({ success: true, data: mlResponse.data });
  } catch (error) {
    res.status(500).json({ error: "Analysis failed: " + error.message });
  }
};

exports.getReviewInsights = async (req, res) => {
  try {
    const { reviews, userPrompt } = req.body;
    if (!reviews || reviews.length === 0) return res.status(400).json({ success: false, message: "No reviews provided" });
    const mlResponse = await axios.post('http://127.0.0.1:8000/analyze/dashboard-data', reviews, { timeout: 30000 });
    const strategy = await getStrategyReport(mlResponse.data.pieData, userPrompt);
    res.status(200).json({ success: true, visuals: mlResponse.data, strategy: strategy });
  } catch (error) {
    res.status(500).json({ success: false, message: "Analysis failed", error: error.message });
  }
};

exports.createChatConversation = async (req, res) => {
  try {
    const { analysisContext } = req.body;
    const conversationId = ConversationManager.createConversation(analysisContext || {});
    res.status(200).json({ success: true, conversationId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.sendChatMessage = async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const result = await ConversationManager.addMessage(conversationId, message);
    res.status(200).json({ success: true, assistantResponse: result.assistantResponse });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const history = ConversationManager.getConversationHistory(conversationId);
    res.status(200).json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllConversations = async (req, res) => {
  try {
    res.status(200).json({ conversations: ConversationManager.getAllConversations() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.deleteConversation = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const deleted = ConversationManager.deleteConversation(conversationId);
    res.status(200).json({ success: deleted });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.healthCheck = async (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
};