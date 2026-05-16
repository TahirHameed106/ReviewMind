// backend/controllers/mlController.js
// Real data flow - no hardcoded values

const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const Groq = require('groq-sdk');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

// ─── In-memory store (replace with DB if needed) ──────────────────
const analysisStore = new Map();

// ─── File Upload Config ───────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/csv');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
}).single('file');

// ─── Upload & Analyze ─────────────────────────────────────────────
exports.uploadAndAnalyze = (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const filePath = req.file.path;

    try {
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), {
        filename: req.file.originalname,
        contentType: 'text/csv',
      });

      const mlResponse = await axios.post(
        `${ML_SERVICE_URL}/analyze/dashboard-data`,
        form,
        {
          headers: form.getHeaders(),
          timeout: 300000, // 5 minutes timeout
        }
      );

      const analysisData = mlResponse.data;

      if (!analysisData.success) {
        throw new Error(analysisData.detail || 'ML analysis failed');
      }

      const sessionId = `session_${Date.now()}`;
      analysisStore.set(sessionId, {
        ...analysisData.data,
        filename: req.file.originalname,
        analyzedAt: new Date().toISOString(),
      });

      fs.unlink(filePath, () => {});

      return res.json({
        success: true,
        sessionId,
        data: analysisData.data,
      });

    } catch (error) {
      fs.unlink(filePath, () => {});
      console.error('Analysis error:', error.message);

      if (error.code === 'ECONNREFUSED') {
        return res.status(503).json({
          success: false,
          error: 'Python ML service is not running. Start it with: cd ml_service && python main.py'
        });
      }

      if (error.code === 'ETIMEDOUT') {
        return res.status(504).json({
          success: false,
          error: 'Analysis timeout. Please try with a smaller CSV file.'
        });
      }

      return res.status(500).json({
        success: false,
        error: error.response?.data?.error || error.message || 'Analysis failed'
      });
    }
  });
};

// ─── Get Stored Analysis ──────────────────────────────────────────
exports.getAnalysis = (req, res) => {
  const { sessionId } = req.params;
  const data = analysisStore.get(sessionId);
  if (!data) {
    return res.status(404).json({ success: false, error: 'Session not found or expired' });
  }
  res.json({ success: true, data });
};

// ─── AI Insights (uses real data + Groq) ─────────────────────────
exports.getInsights = async (req, res) => {
  const { sessionId, analysisData } = req.body;

  let data = analysisData;
  if (sessionId && analysisStore.has(sessionId)) {
    data = analysisStore.get(sessionId);
  }

  if (!data || !data.metrics) {
    return res.status(400).json({ success: false, error: 'No analysis data provided' });
  }

  try {
    const insights = await generateInsightsWithGroq(data);
    res.json({ success: true, insights });
  } catch (error) {
    const insights = generateLocalInsights(data);
    res.json({ success: true, insights, source: 'local' });
  }
};

// ─── Chat Message ─────────────────────────────────────────────────
exports.chatMessage = async (req, res) => {
  const { message, sessionId, conversationHistory = [] } = req.body;

  if (!message) {
    return res.status(400).json({ success: false, error: 'Message is required' });
  }

  let analysisData = null;
  if (sessionId && analysisStore.has(sessionId)) {
    analysisData = analysisStore.get(sessionId);
  }

  if (!analysisData) {
    return res.status(400).json({
      success: false,
      error: 'No analysis data found. Please upload and analyze a CSV first.'
    });
  }

  try {
    const reply = await chatWithGroq(message, analysisData, conversationHistory);
    res.json({ success: true, reply, source: 'groq' });
  } catch (error) {
    console.error('Groq chat error:', error.message);
    const reply = generateLocalChatReply(message, analysisData);
    res.json({ success: true, reply, source: 'local_fallback' });
  }
};

// ─── Groq Chat (REAL data context) ───────────────────────────────
async function chatWithGroq(message, data, history) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const { metrics, complaintCategories, ratingDistribution, filename } = data;

  const topComplaints = (complaintCategories || [])
    .slice(0, 3)
    .map(c => `${c.category} (${c.count} mentions, ${c.percentage}%)`)
    .join(', ') || 'No specific complaints detected';

  const ratingBreakdown = (ratingDistribution || [])
    .map(r => `${r.rating} stars: ${r.count}`)
    .join(', ') || 'Not available';

  const systemPrompt = `You are ReviewMind, an AI analyst. Answer ONLY based on the real data below.
DO NOT make up numbers. If unsure, say so.

=== REAL ANALYSIS DATA ===
File: ${filename || 'uploaded CSV'}
Total Reviews: ${metrics.total_reviews}
Average Rating: ${metrics.avg_rating}/5
Positive: ${metrics.positive_count || metrics.positive_pct}% 
Neutral: ${metrics.neutral_count || metrics.neutral_pct}%
Negative: ${metrics.negative_count || metrics.negative_pct}%
Sentiment Score: ${metrics.sentiment_score || 0}/100
Risk Level: ${metrics.risk_level || 'Unknown'}
Top Complaints: ${topComplaints}
Rating Distribution: ${ratingBreakdown}
=========================

Give concise, data-driven answers. Cite the actual numbers above.`;

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-6),
    { role: 'user', content: message }
  ];

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    max_tokens: 500,
    temperature: 0.4,
  });

  return response.choices[0].message.content;
}

// ─── Groq Insights (REAL data) ────────────────────────────────────
async function generateInsightsWithGroq(data) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set');

  const { metrics, complaintCategories } = data;
  const topComplaints = (complaintCategories || []).slice(0, 3)
    .map(c => `${c.category}: ${c.count} mentions`).join(', ');

  const groq = new Groq({ apiKey: GROQ_API_KEY });

  const prompt = `Based on this real review data, provide 3-4 specific business recommendations:
- Total: ${metrics.total_reviews} reviews
- Avg Rating: ${metrics.avg_rating}/5
- Positive: ${metrics.positive_pct}%, Neutral: ${metrics.neutral_pct}%, Negative: ${metrics.negative_pct}%
- Risk: ${metrics.risk_level}
- Top issues: ${topComplaints}

Be specific and actionable. Use the actual numbers.`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 600,
    temperature: 0.5,
  });

  return response.choices[0].message.content;
}

// ─── Local Fallback (uses REAL data, no LLM) ─────────────────────
function generateLocalInsights(data) {
  const { metrics, complaintCategories } = data;
  const lines = [];

  if (metrics.negative_pct > 30) {
    lines.push(`⚠️ High negative rate (${metrics.negative_pct}%) — immediate action needed.`);
  } else if (metrics.negative_pct > 15) {
    lines.push(`📉 Moderate negative rate (${metrics.negative_pct}%) — monitor trends.`);
  } else {
    lines.push(`✅ Healthy sentiment — only ${metrics.negative_pct}% negative reviews.`);
  }

  if (metrics.avg_rating < 3) {
    lines.push(`❌ Low average rating (${metrics.avg_rating}/5) — product quality issues likely.`);
  } else if (metrics.avg_rating < 4) {
    lines.push(`📊 Average rating of ${metrics.avg_rating}/5 — room for improvement.`);
  } else {
    lines.push(`🌟 Strong average rating of ${metrics.avg_rating}/5.`);
  }

  if (complaintCategories && complaintCategories.length > 0) {
    const top = complaintCategories[0];
    lines.push(`🔍 Top complaint category: "${top.category}" with ${top.count} mentions (${top.percentage}%).`);
  }

  lines.push(`📈 Risk Level: ${metrics.risk_level} based on ${metrics.total_reviews} reviews.`);
  return lines.join('\n');
}

function generateLocalChatReply(message, data) {
  const { metrics, complaintCategories } = data;
  const q = message.toLowerCase();

  if (q.includes('complaint') || q.includes('issue') || q.includes('problem')) {
    if (complaintCategories && complaintCategories.length > 0) {
      const list = complaintCategories.slice(0, 3)
        .map(c => `• ${c.category}: ${c.count} mentions (${c.percentage}%)`).join('\n');
      return `Top complaint categories from your ${metrics.total_reviews} reviews:\n${list}`;
    }
    return `${metrics.negative_count || 0} negative reviews (${metrics.negative_pct}%) found. Upload reviews with text for detailed complaint breakdown.`;
  }

  if (q.includes('sentiment') || q.includes('feeling') || q.includes('opinion')) {
    return `Sentiment breakdown:\n• Positive: ${metrics.positive_count || 0} (${metrics.positive_pct}%)\n• Neutral: ${metrics.neutral_count || 0} (${metrics.neutral_pct}%)\n• Negative: ${metrics.negative_count || 0} (${metrics.negative_pct}%)\n\nOverall score: ${metrics.sentiment_score || 0}/100`;
  }

  if (q.includes('rating') || q.includes('star') || q.includes('score')) {
    return `Average rating: ${metrics.avg_rating}/5 across ${metrics.total_reviews} reviews. Risk level: ${metrics.risk_level}.`;
  }

  if (q.includes('recommend') || q.includes('improve') || q.includes('suggestion')) {
    return generateLocalInsights(data);
  }

  if (q.includes('summary') || q.includes('overview')) {
    return `ReviewMind Analysis Summary:\n• Total: ${metrics.total_reviews} reviews\n• Avg Rating: ${metrics.avg_rating}/5\n• Positive: ${metrics.positive_pct}% | Neutral: ${metrics.neutral_pct}% | Negative: ${metrics.negative_pct}%\n• Risk: ${metrics.risk_level}`;
  }

  return `Based on your ${metrics.total_reviews} reviews — avg rating ${metrics.avg_rating}/5, ${metrics.positive_pct}% positive, ${metrics.negative_pct}% negative. Risk: ${metrics.risk_level}. Ask me about complaints, sentiment, or recommendations.`;
}

// ─── ML Health ────────────────────────────────────────────────────
exports.checkMLHealth = async (req, res) => {
  try {
    const response = await axios.get(`${ML_SERVICE_URL}/health`, { timeout: 3000 });
    res.json({ success: true, ml_service: response.data });
  } catch {
    res.status(503).json({ success: false, error: 'Python ML service is not running' });
  }
};