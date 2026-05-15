const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const csv = require('csvtojson');
const fs = require('fs');
const path = require('path');
const reportGenerator = require('../utils/reportGenerator');
const conversationManager = require('../utils/conversationManager');
const blockchain = require('../utils/blockchain');

const extractRatingSeries = (reviews, ratingColumn) => {
  if (!Array.isArray(reviews) || reviews.length === 0 || !ratingColumn) {
    return [];
  }

  return reviews
    .map((review) => Number(review?.[ratingColumn]))
    .filter((value) => Number.isFinite(value));
};

const buildTimeSeriesData = async (reviews, ratingColumn) => {
  const ratings = extractRatingSeries(reviews, ratingColumn);

  if (ratings.length === 0) {
    return [];
  }

  const observedSeries = ratings.map((rating, index) => {
    const cumulativeAverage = ratings
      .slice(0, index + 1)
      .reduce((sum, value) => sum + value, 0) / (index + 1);

    return {
      month: `Review ${index + 1}`,
      reviews: index + 1,
      satisfaction: Number(cumulativeAverage.toFixed(2)),
      type: 'observed'
    };
  });

  try {
    const forecastResponse = await axios.post('http://127.0.0.1:8000/analyze/forecast',
      ratings.map((rating) => ({ rating })));

    const forecastValues = Array.isArray(forecastResponse.data?.forecast)
      ? forecastResponse.data.forecast
      : [];

    const forecastSeries = forecastValues.map((value, index) => ({
      month: `Forecast ${index + 1}`,
      reviews: ratings.length + index + 1,
      satisfaction: Number(Number(value).toFixed(2)),
      type: 'forecast'
    }));

    return [...observedSeries, ...forecastSeries];
  } catch (error) {
    return observedSeries;
  }
};

const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 100 * 1024 * 1024,
    fieldSize: 25 * 1024 * 1024,
    fields: 20,
    files: 1
  }
});

/**
 * BLOCKCHAIN VERIFICATION ROUTES
 */

// Add review to blockchain
router.post('/blockchain/verify', async (req, res) => {
  try {
    const { reviewData } = req.body;
    
    if (!reviewData) {
      return res.status(400).json({ error: 'Review data required' });
    }

    const result = blockchain.addReview(reviewData);
    
    res.status(200).json({
      success: result.success,
      blockId: result.blockId,
      hash: result.hash,
      proof: result.proof,
      timestamp: new Date().toISOString(),
      status: 'VERIFIED_ON_CHAIN'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check review integrity
router.post('/blockchain/check', async (req, res) => {
  try {
    const { reviewData, blockId } = req.body;
    
    const status = blockchain.getReviewStatus(blockId);
    
    if (reviewData && status.hash) {
      const verification = blockchain.verifyReview(reviewData, status.hash);
      status.verification = verification;
    }

    res.status(200).json({
      success: true,
      status: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get blockchain statistics
router.get('/blockchain/stats', async (req, res) => {
  try {
    const stats = blockchain.getChainStats();
    const chainValid = blockchain.validateChain();
    
    res.status(200).json({
      success: true,
      statistics: stats,
      chainValidation: chainValid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * REPORT GENERATION ROUTES
 */

// Generate comprehensive PDF report
router.post('/reports/generate', async (req, res) => {
  try {
    const { analysisData } = req.body;
    
    if (!analysisData) {
      return res.status(400).json({ error: 'Analysis data required' });
    }

    const reportResult = await reportGenerator.generateReport(analysisData);
    
    res.status(200).json({
      success: true,
      report: reportResult
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Download report
router.get('/reports/download/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const fs = require('fs');
    const path = require('path');
    
    const reportsDir = path.join(__dirname, '../uploads/reports');
    const files = fs.readdirSync(reportsDir);
    const reportFile = files.find(f => f.startsWith(reportId));
    
    if (!reportFile) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const filepath = path.join(reportsDir, reportFile);
    res.download(filepath, reportFile);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * CONVERSATION/CHAT ROUTES
 */

// Create new conversation
router.post('/chat/conversation', async (req, res) => {
  try {
    const { analysisContext } = req.body;
    
    if (!analysisContext) {
      return res.status(400).json({ error: 'Analysis context required' });
    }

    const conversationId = conversationManager.createConversation(analysisContext);
    
    res.status(200).json({
      success: true,
      conversationId: conversationId,
      message: 'Conversation started. You can now ask questions about your review data.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send message in conversation
router.post('/chat/message', async (req, res) => {
  try {
    const { conversationId, message } = req.body;
    
    if (!conversationId || !message) {
      return res.status(400).json({ error: 'Conversation ID and message required' });
    }

    const result = await conversationManager.addMessage(conversationId, message);
    
    res.status(200).json({
      success: true,
      conversationId: result.conversationId,
      userMessage: result.userMessage,
      assistantResponse: result.assistantResponse,
      messageCount: result.messageCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get conversation history
router.get('/chat/history/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;
    
    const history = conversationManager.getConversationHistory(conversationId);
    
    res.status(200).json({
      success: true,
      history: history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all conversations
router.get('/chat/conversations', async (req, res) => {
  try {
    const conversations = conversationManager.getAllConversations();
    
    res.status(200).json({
      success: true,
      conversations: conversations,
      totalConversations: conversations.length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * ENHANCED ML ANALYSIS ROUTE
 */

// Get detailed analysis with real data
router.post('/ml/enhanced-analyze', async (req, res) => {
  try {
    const { reviews } = req.body;
    
    if (!reviews || reviews.length === 0) {
      return res.status(400).json({ error: 'Reviews data required' });
    }

    // Call Python ML service for real analysis
    console.log('[ML Pipeline] Calling Python service for analysis...');
    const mlResponse = await axios.post('http://127.0.0.1:8000/analyze/dashboard-data', reviews);
    
    console.log('[ML Pipeline] Python responded:', mlResponse.status);

    const timeSeriesData = await buildTimeSeriesData(reviews, mlResponse.data?.metrics?.detected_col);

    // Add blockchain verification
    const blockchainResult = blockchain.addReview(reviews);

    res.status(200).json({
      success: true,
      data: mlResponse.data,
      timeSeriesData,
      blockchainVerification: blockchainResult,
      analysisMetadata: {
        totalReviewsAnalyzed: reviews.length,
        analysisTime: new Date().toISOString(),
        pythonServiceStatus: 'Connected',
        blockchainStatus: 'Verified',
        pipelineStages: [
          { key: 'received', label: 'Request received', status: 'done' },
          { key: 'python', label: 'Python analysis complete', status: 'done' },
          { key: 'blockchain', label: 'Blockchain verification complete', status: 'done' },
          { key: 'dashboard', label: 'Dashboard data ready', status: 'done' }
        ]
      }
    });
  } catch (error) {
    console.error('[ML Pipeline] Error:', error.message);
    res.status(500).json({ 
      error: 'Analysis failed',
      details: error.message
    });
  }
});

// Upload CSV and analyze it in one server-side flow to avoid large browser JSON payloads.
router.post('/ml/upload-analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file required' });
    }

    let reviews = await csv().fromFile(req.file.path);

    if (!reviews.length) {
      return res.status(400).json({ error: 'No review rows found in the CSV file' });
    }

    // Clean data: remove NaN, null, and convert problematic values
    reviews = reviews.map(row => {
      const cleaned = {};
      for (const [key, value] of Object.entries(row)) {
        if (value === null || value === undefined || value === 'NaN' || Number.isNaN(value)) {
          cleaned[key] = '';
        } else {
          cleaned[key] = value;
        }
      }
      return cleaned;
    });

    console.log('[ML Pipeline] Calling Python service for analysis from uploaded CSV...');
    const mlResponse = await axios.post('http://127.0.0.1:8000/analyze/dashboard-data', reviews);

    // Check if Python service returned an error
    if (mlResponse.data?.error) {
      console.error('[ML Pipeline] Python service error:', mlResponse.data.error);
      return res.status(500).json({
        error: 'Python analysis failed',
        details: mlResponse.data.error
      });
    }

    const timeSeriesData = await buildTimeSeriesData(reviews, mlResponse.data?.metrics?.detected_col);

    const blockchainResult = blockchain.addReview(reviews);

    res.status(200).json({
      success: true,
      data: mlResponse.data,
      timeSeriesData,
      blockchainVerification: blockchainResult,
      analysisMetadata: {
        totalReviewsAnalyzed: reviews.length,
        analysisTime: new Date().toISOString(),
        pythonServiceStatus: 'Connected',
        blockchainStatus: 'Verified',
        pipelineStages: [
          { key: 'upload', label: 'CSV uploaded', status: 'done' },
          { key: 'parse', label: 'CSV parsed', status: 'done' },
          { key: 'python', label: 'Python analysis complete', status: 'done' },
          { key: 'blockchain', label: 'Blockchain verification complete', status: 'done' },
          { key: 'dashboard', label: 'Dashboard data ready', status: 'done' }
        ]
      }
    });
  } catch (error) {
    console.error('[ML Pipeline] CSV upload analysis error:', error.message);

    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        // Ignore cleanup failures.
      }
    }

    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'CSV file is too large. Please split the dataset into smaller files.'
      });
    }

    res.status(500).json({
      error: 'CSV upload analysis failed',
      details: error.message
    });
  } finally {
    if (req.file?.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (_) {
        // Ignore cleanup failures.
      }
    }
  }
});

module.exports = router;
