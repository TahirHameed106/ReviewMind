const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { poolPromise } = require('./db/connection');

require('dotenv').config();

const mlController = require('./controllers/mlController');

console.log('🔑 Environment Check:', {
  GROQ: process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing',
  GEMINI: process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing',
});

const app = express();
const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ============ ROOT ENDPOINT (FIXES 404) ============
app.get('/', (req, res) => {
  res.json({
    status: 'ReviewMind API is running',
    version: '1.0.0',
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

// ============ FILE UPLOAD CONFIG ============
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

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ============ ML ROUTES ============
app.post('/api/ml/upload-analyze', upload.single('file'), mlController.handleCSVUpload);
app.post('/api/ml/insights', mlController.getReviewInsights);
app.get('/api/ml/health', mlController.healthCheck);

// ============ CHAT ROUTES ============
app.post('/api/advanced/chat/conversation', mlController.createChatConversation);
app.post('/api/advanced/chat/message', mlController.sendChatMessage);
app.get('/api/advanced/chat/history/:conversationId', mlController.getChatHistory);
app.get('/api/advanced/chat/conversations', mlController.getAllConversations);
app.delete('/api/advanced/chat/conversation/:conversationId', mlController.deleteConversation);

// ============ REPORT ROUTES ============
app.post('/api/advanced/reports/generate', async (req, res) => {
  console.log('[PDF] Generating report...');
  
  try {
   const ReportGenerator = require('./services/pdfGenerator');
    const { analysisData } = req.body;
    
    if (!analysisData) {
      console.error('[PDF] Missing analysisData');
      return res.status(400).json({ error: 'analysisData required' });
    }
    
    const report = await ReportGenerator.generateReport(analysisData);
    console.log('[PDF] Report generated:', report.filename);
    res.json({ success: true, report });
  } catch (error) {
    console.error('[PDF] Error:', error.message);
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
app.get('/api/advanced/blockchain/stats', async (req, res) => {
  res.json({
    statistics: {
      totalReviews: 0,
      totalBlocks: 0,
      chainValid: true,
      lastVerified: new Date().toISOString()
    }
  });
});

// ============ AUTH ROUTES ============
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const reviewRoutes = require('./routes/review.routes');

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/reviews', reviewRoutes);

// ============ HEALTH CHECKS ============
app.get('/api/status', async (req, res) => {
  try {
    const pool = await poolPromise;
    await pool.request().query('SELECT 1');
    res.json({ status: "Online", database: "Connected" });
  } catch (err) {
    res.status(500).json({ status: "Database Error", error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ============ START SERVER ============
app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📡 ML API: http://localhost:${PORT}/api/ml/health`);
  console.log(`💬 Chat API: http://localhost:${PORT}/api/advanced/chat/conversation`);
  console.log(`📄 Report API: http://localhost:${PORT}/api/advanced/reports/generate`);
  
  try {
    await poolPromise;
    console.log("✅ Database Connected");
  } catch (err) {
    console.error("❌ Database Error:", err.message);
  }
});