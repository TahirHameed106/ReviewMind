const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { poolPromise } = require('./db/connection');
require('dotenv').config();

// 1. Import Routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Middleware
app.use(helmet()); 
app.use(cors()); 
app.use(express.json()); 
app.use('/api/reviews', require('./routes/review.routes'));
// 3. Routes
app.use('/api/auth', authRoutes); 
app.use('/api/user', userRoutes); 

// 4. Health Check Route
app.get('/api/status', async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query('SELECT 1 as db_status');
        res.json({
            status: "Online",
            database: "Connected",
            developer: "Tahir Hameed 106",
            timestamp: new Date()
        });
    } catch (err) {
        res.status(500).json({ status: "Database Error", error: err.message });
    }
});

// 5. Start Server
app.listen(PORT, async () => {
    console.log(`🚀 ReviewMind Gateway running on http://localhost:${PORT}`);
    try {
        await poolPromise;
        console.log("✅ Azure SQL Connection Pool Created");
    } catch (err) {
        console.error("❌ Database Connection Failed:", err.message);
    }
});