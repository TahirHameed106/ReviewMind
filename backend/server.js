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

// MIDDLEWARE - THIS IS CRITICAL
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));  // ← MUST HAVE THIS
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/advanced', require('./routes/advanced.routes'));

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

app.get('/', (req, res) => {
    res.json({ message: 'ReviewMind API is running' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
    console.log(`✅ ReviewMind running on port ${PORT}`);
});

module.exports = app;