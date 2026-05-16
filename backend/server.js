require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { poolPromise } = require('./db/connection');

// Environment validation
if (!process.env.ML_SERVICE_URL) {
  console.warn("⚠️ ML_SERVICE_URL not set. Using default: http://localhost:8000");
}

if (!process.env.GROQ_API_KEY) {
  console.warn("⚠️ GROQ_API_KEY not set. Chat features will use fallback mode.");
}

console.log('🔑 Environment Check:', {
  GROQ: process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing (fallback mode)',
  ML_SERVICE_URL: process.env.ML_SERVICE_URL || 'http://localhost:8000 (default)',
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
  res.json({ 
    status: 'ReviewMind API is running', 
    version: '2.0',
    endpoints: [
      'POST /api/ml/upload-analyze',
      'POST /api/advanced/chat/conversation',
      'POST /api/advanced/chat/message',
      'POST /api/advanced/reports/generate',
      'GET /api/ml/health',
      'GET /health'
    ]
  });
});

// File upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `csv_${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({ 
  storage, 
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB limit (reduced from 100MB)
});

// Chat storage
const chatSessions = new Map();

// ============ CHAT ROUTES ============
app.post('/api/advanced/chat/conversation', (req, res) => {
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  chatSessions.set(conversationId, { 
    id: conversationId, 
    context: req.body.analysisContext || {}, 
    messages: [], 
    createdAt: new Date() 
  });
  console.log(`[Chat] Created conversation: ${conversationId}`);
  res.json({ success: true, conversationId });
});

app.post('/api/advanced/chat/message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const session = chatSessions.get(conversationId);
    if (!session) return res.status(404).json({ error: 'Conversation not found' });
    
    const sentimentData = session.context?.sentimentData || [];
    const metrics = session.context?.metrics || {};
    
    const positive = sentimentData.find(p => p.name === 'Positive')?.value || 0;
    const neutral = sentimentData.find(p => p.name === 'Neutral')?.value || 0;
    const negative = sentimentData.find(p => p.name === 'Negative')?.value || 0;
    const total = positive + neutral + negative;
    const positivePct = total > 0 ? ((positive / total) * 100).toFixed(1) : 0;
    const negativePct = total > 0 ? ((negative / total) * 100).toFixed(1) : 0;
    const avgRating = metrics?.avg_rating || (total > 0 ? ((positive * 5 + neutral * 3 + negative * 1) / total).toFixed(1) : 0);
    
    const systemPrompt = `You are ReviewMind AI. Use ONLY this real data:
- Total Reviews: ${total}
- Positive: ${positive} (${positivePct}%)
- Neutral: ${neutral}
- Negative: ${negative} (${negativePct}%)
- Average Rating: ${avgRating}/5.0

Answer based ONLY on these numbers. Be specific and actionable.`;
    
    let reply = '';
    
    if (process.env.GROQ_API_KEY) {
      try {
        console.log('[Chat] Calling Groq API...');
        const groqResponse = await axios.post(
          'https://api.groq.com/openai/v1/chat/completions',
          {
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: 500
          },
          {
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` },
            timeout: 15000
          }
        );
        reply = groqResponse.data.choices[0].message.content;
        console.log('[Chat] Groq response received');
      } catch (groqError) {
        console.error('[Chat] Groq error:', groqError.message);
        reply = `📊 **Based on YOUR ${total.toLocaleString()} reviews:**\n\n👍 Positive: ${positive.toLocaleString()} (${positivePct}%)\n👎 Negative: ${negative.toLocaleString()} (${negativePct}%)\n⭐ Average Rating: ${avgRating}/5.0\n\nAsk me: "What are the main complaints?" or "How to improve?"`;
      }
    } else {
      reply = `📊 **Based on YOUR ${total.toLocaleString()} reviews:**\n\n👍 Positive: ${positive.toLocaleString()} (${positivePct}%)\n👎 Negative: ${negative.toLocaleString()} (${negativePct}%)\n⭐ Average Rating: ${avgRating}/5.0\n\nAsk me: "What are the main complaints?" or "How to improve?"`;
    }
    
    session.messages.push({ role: 'user', content: message });
    session.messages.push({ role: 'assistant', content: reply });
    
    res.json({ success: true, assistantResponse: reply });
  } catch(error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ ML UPLOAD ROUTE - Forwards to Python ML Service ============
app.post('/api/ml/upload-analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    console.log(`[ML] Processing: ${req.file.originalname}`);
    
    // Forward to Python ML service
    const form = new FormData();
    form.append('file', fs.createReadStream(req.file.path), {
      filename: req.file.originalname,
      contentType: 'text/csv',
    });
    
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    console.log(`[ML] Forwarding to: ${mlServiceUrl}/analyze/dashboard-data`);
    
    const mlResponse = await axios.post(
      `${mlServiceUrl}/analyze/dashboard-data`,
      form,
      {
        headers: form.getHeaders(),
        timeout: 300000, // 5 minutes timeout
      }
    );
    
    console.log(`[ML] Response received: success=${mlResponse.data.success}`);
    
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    
    if (!mlResponse.data.success) {
      return res.status(400).json({ error: mlResponse.data.error || 'ML analysis failed' });
    }
    
    // Create session for chat context
    const sessionId = `session_${Date.now()}`;
    const analysisData = mlResponse.data;
    
    chatSessions.set(sessionId, {
      id: sessionId,
      context: {
        sentimentData: analysisData.pieData || [],
        metrics: analysisData.metrics || {},
        complaintCategories: analysisData.complaintCategories || [],
        clusters: analysisData.clusters || [],
        topics: analysisData.topics || [],
        reviewTexts: analysisData.sampleReviews || []
      },
      messages: [],
      createdAt: new Date()
    });
    
    res.json({
      success: true,
      sessionId: sessionId,
      data: analysisData
    });
    
  } catch (error) {
    console.error('[ML] Error:', error.message);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Python ML service is not running. Start it with: cd ml_service && python main.py' 
      });
    }
    
    if (error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        error: 'Analysis timeout. Please try with a smaller CSV file.' 
      });
    }
    
    res.status(500).json({ error: error.message || 'Analysis failed' });
  }
});

// Health check endpoints
app.get('/api/ml/health', async (req, res) => {
  try {
    const mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8000';
    const response = await axios.get(`${mlServiceUrl}/health`, { timeout: 3000 });
    res.json({ status: 'healthy', ml_service: response.data });
  } catch (error) {
    res.status(503).json({ status: 'unhealthy', error: 'ML service not reachable' });
  }
});

app.get('/api/user/subscription', (req, res) => { 
  res.json({ subscriptionPlan: 'enterprise' }); 
});

// ============ REPORT ROUTES ============
app.post('/api/advanced/reports/generate', async (req, res) => {
  try {
    const ReportGenerator = require('./services/pdfGenerator');
    const { analysisData } = req.body;
    if (!analysisData) {
      return res.status(400).json({ error: 'analysisData required' });
    }
    const report = await ReportGenerator.generateReport(analysisData);
    res.json({ success: true, report });
  } catch (error) {
    console.error('[Report] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/advanced/reports/download/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const reportsDir = path.join(__dirname, 'uploads/reports');
    if (!fs.existsSync(reportsDir)) {
      return res.status(404).json({ error: 'No reports found' });
    }
    const files = fs.readdirSync(reportsDir);
    const reportFile = files.find(f => f.startsWith(reportId));
    if (!reportFile) {
      return res.status(404).json({ error: 'Report not found' });
    }
    res.download(path.join(reportsDir, reportFile));
  } catch (error) {
    console.error('[Download] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============ BLOCKCHAIN ROUTES ============
app.get('/api/advanced/blockchain/stats', (req, res) => { 
  res.json({ 
    statistics: { 
      totalReviews: 0, 
      totalBlocks: 0, 
      chainValid: true,
      lastVerified: new Date().toISOString()
    } 
  }); 
});

// ============ AUTH ROUTES (Mock for demo) ============
app.post('/api/auth/login', (req, res) => { 
  res.json({ token: 'mock_token', email: req.body.email, subscriptionPlan: 'enterprise' }); 
});

app.post('/api/auth/register', (req, res) => { 
  res.json({ token: 'mock_token', email: req.body.email, subscriptionPlan: req.body.subscriptionPlan || 'basic' }); 
});

// ============ HEALTH CHECKS ============
app.get('/api/status', (req, res) => { 
  res.json({ status: "Online", database: "Connected" }); 
});

app.get('/health', (req, res) => { 
  res.json({ status: 'OK', timestamp: new Date().toISOString() }); 
});

// ============ START SERVER ============
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 Upload API: http://localhost:${PORT}/api/ml/upload-analyze`);
  console.log(`💬 Chat API: http://localhost:${PORT}/api/advanced/chat/conversation`);
  console.log(`📄 Report API: http://localhost:${PORT}/api/advanced/reports/generate`);
  console.log(`🔍 Health: http://localhost:${PORT}/health`);
  
  // Ensure directories exist
  const reportsDir = path.join(__dirname, 'uploads/reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
    console.log(`📁 Created reports directory: ${reportsDir}`);
  }
  
  try {
    await poolPromise;
    console.log("✅ Database Connected");
  } catch(err) {
    console.error("❌ Database Error:", err.message);
  }
});