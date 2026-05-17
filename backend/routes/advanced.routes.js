// backend/routes/advanced.routes.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const conversationManager = require('../utils/conversationManager');
const reportGenerator = require('../services/pdfGenerator');

const ML_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';

// Session store
const sessionStore = new Map();
setInterval(() => {
    const cutoff = Date.now() - 3600000;
    for (const [id, s] of sessionStore)
        if (new Date(s.analyzedAt).getTime() < cutoff) sessionStore.delete(id);
}, 600000).unref();

const upload = multer({
    dest: path.join(__dirname, '../uploads/'),
    limits: { fileSize: 200 * 1024 * 1024 },
});

// ML Upload & Analyze
router.post('/ml/upload-analyze', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'CSV file required' });
    const filePath = req.file.path;
    
    try {
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath), {
            filename: req.file.originalname || 'reviews.csv',
            contentType: 'text/csv',
        });

        console.log(`[ML] → Python: ${req.file.originalname}`);
        const mlRes = await axios.post(`${ML_URL}/analyze/dashboard-data`, form, {
            headers: form.getHeaders(),
            timeout: 300000,
        });

        if (!mlRes.data?.success) {
            throw new Error(mlRes.data?.detail || mlRes.data?.error || 'Python analysis failed');
        }

        const realData = mlRes.data.data;
        const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

        // Store COMPLETE data including complaints
        sessionStore.set(sessionId, {
            pieData: realData.pieData || [],
            metrics: realData.metrics || {},
            complaintCategories: realData.complaintCategories || [],
            filename: req.file.originalname,
            analyzedAt: new Date().toISOString(),
        });

        console.log(`[ML] Done. Session: ${sessionId} | Total: ${realData.metrics?.total_reviews || 0} | Complaints: ${realData.complaintCategories?.length || 0}`);

        return res.json({
            success: true,
            sessionId,
            data: realData,
            analysisMetadata: {
                totalReviewsAnalyzed: realData.metrics?.total_reviews || 0,
                analysisTime: new Date().toISOString(),
                pythonServiceStatus: 'Connected',
            },
        });

    } catch (err) {
        console.error('[ML] Error:', err.message);
        if (err.code === 'ECONNREFUSED') {
            return res.status(503).json({ success: false, error: 'Python ML service not running on port 8000' });
        }
        return res.status(500).json({ success: false, error: err.response?.data?.detail || err.message });
    } finally {
        try { fs.unlinkSync(filePath); } catch (_) {}
    }
});

// ML Health
router.get('/ml/health', async (req, res) => {
    try {
        const r = await axios.get(`${ML_URL}/health`, { timeout: 5000 });
        res.json({ success: true, ml_service: r.data });
    } catch {
        res.status(503).json({ success: false, error: 'Python ML service offline' });
    }
});

// Chat Conversation - FIXED to pass complaints correctly
router.post('/chat/conversation', async (req, res) => {
    try {
        const { sessionId, analysisContext } = req.body;
        let context = null;

        // Prefer server-side session (has full data)
        if (sessionId && sessionStore.has(sessionId)) {
            const s = sessionStore.get(sessionId);
            context = {
                pieData: s.pieData || [],
                metrics: s.metrics || {},
                complaintCategories: s.complaintCategories || [],
                complaints: s.complaintCategories || [],
                filename: s.filename || 'uploaded CSV',
            };
        } else if (analysisContext) {
            // Frontend-sent context
            context = analysisContext;
        }

        if (!context) {
            return res.status(400).json({ success: false, error: 'Provide sessionId or analysisContext' });
        }

        const conversationId = conversationManager.createConversation(context);
        res.json({ success: true, conversationId });
    } catch (e) {
        console.error('[Chat] Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Chat Message
router.post('/chat/message', async (req, res) => {
    try {
        const { conversationId, message } = req.body;
        if (!conversationId || !message) {
            return res.status(400).json({ success: false, error: 'conversationId and message required' });
        }
        const result = await conversationManager.addMessage(conversationId, message);
        res.json({ success: true, ...result });
    } catch (e) {
        console.error('[Chat] Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Generate Report
router.post('/reports/generate', async (req, res) => {
    try {
        const { sessionId, analysisData } = req.body;
        let data = null;

        if (sessionId && sessionStore.has(sessionId)) {
            data = sessionStore.get(sessionId);
        } else if (analysisData) {
            data = analysisData;
        }

        if (!data) {
            return res.status(400).json({ success: false, error: 'Provide sessionId or analysisData' });
        }

        const report = await reportGenerator.generateReport(data);
        res.json({ success: true, report });
    } catch (e) {
        console.error('[Report] Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Download Report
router.get('/reports/download/:reportId', (req, res) => {
    try {
        const dir = path.join(__dirname, '../uploads/reports');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const files = fs.readdirSync(dir);
        const file = files.find(f => f.includes(req.params.reportId));
        if (!file) return res.status(404).json({ error: 'Report not found' });
        res.download(path.join(dir, file), file);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Blockchain Stats
router.get('/blockchain/stats', (req, res) => {
    res.json({
        success: true,
        statistics: {
            totalReviews: 0,
            totalBlocks: 0,
            chainValid: true,
            lastVerified: new Date().toISOString(),
        },
    });
});

module.exports = router;