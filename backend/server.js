// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Create upload directories
['uploads', 'uploads/csv', 'uploads/reports'].forEach(d =>
    fs.mkdirSync(path.join(__dirname, d), { recursive: true })
);

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/user', require('./routes/user.routes'));
app.use('/api/advanced', require('./routes/advanced.routes'));

// Health
app.get('/', (_, res) => res.json({ status: 'ReviewMind API running', version: '2.0' }));
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
});

// Start server
const { initDB } = require('./db/connection');
initDB()
    .then(() => app.listen(PORT, () => {
        console.log(`\n✅ ReviewMind running on http://localhost:${PORT}`);
        console.log(`   POST /api/auth/register`);
        console.log(`   POST /api/auth/login`);
        console.log(`   POST /api/auth/verify-mfa`);
        console.log(`   POST /api/advanced/ml/upload-analyze`);
    }))
    .catch(err => {
        console.error('[DB] Init failed:', err.message);
        app.listen(PORT, () => console.log(`⚠️ ReviewMind on port ${PORT} (no DB)`));
    });

module.exports = app;