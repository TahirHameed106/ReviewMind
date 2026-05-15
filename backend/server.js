require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { poolPromise } = require('./db/connection');

console.log('🔑 Environment Check:', {
  GROQ: process.env.GROQ_API_KEY ? '✅ Loaded' : '❌ Missing',
  GEMINI: process.env.GEMINI_API_KEY ? '✅ Loaded' : '❌ Missing',
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
  res.json({ status: 'ReviewMind API is running', version: '1.0.0' });
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
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

// Chat storage
const chatSessions = new Map();

// ============ COMPLAINT EXTRACTION WITH URDU & ENGLISH ============
function extractComplaintsFromTexts(texts) {
  const complaintKeywords = {
    'Product Quality': [
      'quality', 'broken', 'defective', 'damaged', 'cheap', 'poor', 'bad', 'waste', 
      'useless', 'defect', 'cracked', 'not working', 'faulty',
      'معیار', 'خراب', 'ٹوٹا ہوا', 'ناقص', 'گھٹیا', 'برا'
    ],
    'Price & Value': [
      'price', 'expensive', 'overpriced', 'value', 'worth', 'cost', 'money', 
      'waste of money', 'not worth',
      'قیمت', 'مہنگا', 'قیمتی', 'مول', 'قدر', 'لاگت', 'پیسے', 'پیسوں کا ضیاع', 'ناکارہ'
    ],
    'Shipping & Delivery': [
      'shipping', 'delivery', 'late', 'delayed', 'slow', 'package', 'arrived', 
      'dispatch', 'courier', 'ship', 'shipped',
      'ترسیل', 'ڈلیوری', 'دیر', 'تاخیر', 'سست', 'پیکیج', 'پہنچا', 'بھیجا', 'کوریئر', 'جہاز'
    ],
    'Packaging': [
      'packaging', 'box', 'wrapping', 'seal', 'open', 'torn', 'packed', 'package damaged',
      'پیکنگ', 'بکس', 'لپیٹ', 'مہر', 'کھلا', 'پھٹا', 'بھرا', 'پیکیج خراب'
    ],
    'Wrong Item': [
      'wrong', 'incorrect', 'different', 'not as described', 'mismatch', 'size', 'color different',
      'غلط', 'غلط شے', 'مختلف', 'جیسا بیان کیا تھا ویسا نہیں', 'سائز', 'رنگ مختلف'
    ]
  };
  
  const counts = {};
  let totalMatched = 0;
  
  for (const text of texts) {
    if (!text) continue;
    const lowerText = text.toLowerCase();
    
    let matchedCategory = null;
    for (const [category, keywords] of Object.entries(complaintKeywords)) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        matchedCategory = category;
        break;
      }
    }
    
    if (matchedCategory) {
      counts[matchedCategory] = (counts[matchedCategory] || 0) + 1;
      totalMatched++;
    }
  }
  
  const complaints = [];
  for (const [category, count] of Object.entries(counts)) {
    complaints.push({
      category: category,
      count: count,
      percentage: totalMatched > 0 ? Math.round((count / totalMatched) * 100) : 0
    });
  }
  
  return complaints.sort((a, b) => b.count - a.count);
}

// Rating column names
const RATING_COLUMNS = ['rating', 'ratings', 'score', 'stars', 'rate', 'review_rating', 'product_rating', 'star_rating', 'overall', 'point', 'points', 'Score', 'Rating'];
const REVIEW_COLUMNS = ['review', 'reviews', 'review_text', 'text', 'comment', 'comments', 'feedback', 'content', 'body', 'description', 'summary', 'Review', 'Reviews'];
const SENTIMENT_COLUMNS = ['sentiment', 'sentiments', 'label', 'class', 'category', 'Sentiment', 'Sentiments'];

function findColumn(headers, columnLists) {
  for (let i = 0; i < headers.length; i++) {
    const colLower = headers[i].toLowerCase().trim();
    for (const pattern of columnLists) {
      if (colLower === pattern.toLowerCase() || colLower.includes(pattern.toLowerCase())) {
        return { index: i, name: headers[i] };
      }
    }
  }
  return null;
}

function extractRating(value) {
  if (!value) return null;
  const num = parseFloat(String(value).trim());
  if (!isNaN(num) && num >= 0 && num <= 5) return num;
  const match = String(value).match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const n = parseFloat(match[1]);
    if (n >= 1 && n <= 10) return n > 5 ? n / 2 : n;
  }
  const starCount = (String(value).match(/★/g) || []).length;
  if (starCount > 0) return starCount;
  return null;
}

// ============ CHAT ROUTES ============
app.post('/api/advanced/chat/conversation', (req, res) => {
  const conversationId = `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  chatSessions.set(conversationId, { id: conversationId, context: req.body.analysisContext || {}, messages: [], createdAt: new Date() });
  res.json({ success: true, conversationId });
});

app.post('/api/advanced/chat/message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    const session = chatSessions.get(conversationId);
    if (!session) return res.status(404).json({ error: 'Conversation not found' });
    
    const sentimentData = session.context?.sentimentData || [];
    const positive = sentimentData.find(p => p.name === 'Positive')?.value || 0;
    const neutral = sentimentData.find(p => p.name === 'Neutral')?.value || 0;
    const negative = sentimentData.find(p => p.name === 'Negative')?.value || 0;
    const total = positive + neutral + negative;
    
    let reply = `📊 Based on YOUR ${total} reviews: ${positive} positive, ${negative} negative (${total > 0 ? ((negative/total)*100).toFixed(1) : 0}% negative).`;
    
    if (process.env.GROQ_API_KEY) {
      try {
        const groqResponse = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'system', content: `You are ReviewMind AI. Data: ${positive} positive, ${negative} negative out of ${total} reviews.` }, { role: 'user', content: message }],
          max_tokens: 300
        }, { headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }, timeout: 10000 });
        reply = groqResponse.data.choices[0].message.content;
      } catch(e) { console.log('Groq error:', e.message); }
    }
    
    session.messages.push({ role: 'user', content: message }, { role: 'assistant', content: reply });
    res.json({ success: true, assistantResponse: reply });
  } catch(error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ML UPLOAD ROUTE ============
app.post('/api/ml/upload-analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    
    console.log(`[ML] Processing: ${req.file.originalname}`);
    
    let csvData;
    try { csvData = fs.readFileSync(req.file.path, 'utf8'); } catch(e) { csvData = fs.readFileSync(req.file.path, 'latin1'); }
    
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    
    const ratingCol = findColumn(headers, RATING_COLUMNS);
    const reviewCol = findColumn(headers, REVIEW_COLUMNS);
    const sentimentCol = findColumn(headers, SENTIMENT_COLUMNS);
    
    console.log(`[ML] Rating: ${ratingCol?.name || 'none'}, Review: ${reviewCol?.name || 'none'}, Sentiment: ${sentimentCol?.name || 'none'}`);
    
    let positive = 0, neutral = 0, negative = 0;
    const reviewTexts = [];
    const sampleReviews = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let inQuote = false, current = '';
      const row = lines[i];
      
      for (let j = 0; j < row.length; j++) {
        const char = row[j];
        if (char === '"') inQuote = !inQuote;
        else if (char === ',' && !inQuote) { values.push(current); current = ''; }
        else current += char;
      }
      values.push(current);
      
      let sentiment = null;
      if (sentimentCol && values[sentimentCol.index]) {
        sentiment = values[sentimentCol.index].toLowerCase().trim();
      } else if (ratingCol && values[ratingCol.index]) {
        const rating = extractRating(values[ratingCol.index]);
        if (rating !== null) sentiment = rating >= 4 ? 'positive' : (rating <= 2 ? 'negative' : 'neutral');
      }
      
      if (sentiment === 'positive') positive++;
      else if (sentiment === 'negative') negative++;
      else if (sentiment === 'neutral') neutral++;
      
      let reviewText = '';
      if (reviewCol && values[reviewCol.index]) reviewText = values[reviewCol.index];
      if (reviewText && reviewText.trim()) {
        reviewTexts.push(reviewText);
        if (sampleReviews.length < 50) sampleReviews.push({ text: reviewText.substring(0, 500) });
      }
    }
    
    const total = positive + neutral + negative;
    
    if (total === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: `No valid data found. Columns: ${headers.join(', ')}` });
    }
    
    const avgRating = ((positive * 5 + neutral * 3 + negative * 1) / total).toFixed(1);
    const complaints = extractComplaintsFromTexts(reviewTexts);
    
    console.log(`[ML] Results: P=${positive}, Neu=${neutral}, Neg=${negative}, Total=${total}`);
    console.log(`[ML] Complaints: ${complaints.map(c => `${c.category}=${c.count}`).join(', ')}`);
    
    fs.unlinkSync(req.file.path);
    
    const sessionId = `session_${Date.now()}`;
    chatSessions.set(sessionId, {
      id: sessionId,
      context: {
        sentimentData: [{ name: 'Positive', value: positive }, { name: 'Neutral', value: neutral }, { name: 'Negative', value: negative }],
        metrics: { total_reviews: total, avg_rating: parseFloat(avgRating) },
        reviewTexts: reviewTexts.slice(0, 500)
      }
    });
    
    res.json({
      success: true,
      sessionId,
      data: {
        pieData: [{ name: 'Positive', value: positive }, { name: 'Neutral', value: neutral }, { name: 'Negative', value: negative }],
        metrics: { total_reviews: total, avg_rating: parseFloat(avgRating), detected_col: ratingCol?.name || sentimentCol?.name || 'auto' },
        sampleReviews,
        complaintCategories: complaints
      }
    });
    
  } catch (error) {
    console.error('[ML] Error:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ml/health', (req, res) => { res.json({ status: 'healthy' }); });
app.get('/api/user/subscription', (req, res) => { res.json({ subscriptionPlan: 'enterprise' }); });

// ============ REPORT ROUTES ============
app.post('/api/advanced/reports/generate', async (req, res) => {
  try {
    const ReportGenerator = require('./services/pdfGenerator');
    const report = await ReportGenerator.generateReport(req.body.analysisData);
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/advanced/reports/download/:reportId', async (req, res) => {
  try {
    const reportsDir = path.join(__dirname, 'uploads/reports');
    const files = fs.readdirSync(reportsDir);
    const reportFile = files.find(f => f.startsWith(req.params.reportId));
    if (!reportFile) return res.status(404).json({ error: 'Report not found' });
    res.download(path.join(reportsDir, reportFile));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/advanced/blockchain/stats', (req, res) => { res.json({ statistics: { totalReviews: 0, totalBlocks: 0, chainValid: true } }); });
app.post('/api/auth/login', (req, res) => { res.json({ token: 'mock_token', email: req.body.email, subscriptionPlan: 'enterprise' }); });
app.post('/api/auth/register', (req, res) => { res.json({ token: 'mock_token', email: req.body.email, subscriptionPlan: req.body.subscriptionPlan || 'basic' }); });
app.get('/api/status', (req, res) => { res.json({ status: "Online", database: "Connected" }); });
app.get('/health', (req, res) => { res.json({ status: 'OK' }); });

app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  const reportsDir = path.join(__dirname, 'uploads/reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  try { await poolPromise; console.log("✅ Database Connected"); } catch(err) { console.error("❌ Database Error:", err.message); }
});