const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const { poolPromise, sql } = require('../db/connection');
const verifyToken = require('../middleware/auth.middleware');

const upload = multer({ dest: 'uploads/' }); // Temporary folder for CSVs

// ==========================================
// 1. BULK JSON UPLOAD
// ==========================================
router.post('/bulk-json', verifyToken, async (req, res) => {
    const reviews = req.body; // Expecting an array of objects
    if (!Array.isArray(reviews)) return res.status(400).json({ error: "Format must be a JSON Array" });

    try {
        const pool = await poolPromise;
        const table = new sql.Table('bulk_reviews');
        table.create = false; // Table already exists

        // Map your JSON keys to Database Columns
        table.columns.add('user_id', sql.Int, { nullable: false });
        table.columns.add('source_platform', sql.NVarChar(50), { nullable: true });
        table.columns.add('product_name', sql.NVarChar(255), { nullable: true });
        table.columns.add('review_text', sql.NVarChar(sql.MAX), { nullable: true });
        table.columns.add('rating', sql.Int, { nullable: true });

        reviews.forEach(r => {
            table.rows.add(req.user.userId, r.source, r.product, r.text, r.rating);
        });

        const request = pool.request();
        await request.bulk(table); // HIGH SPEED INSERTION
        res.json({ success: true, message: `${reviews.length} reviews uploaded via JSON` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. BULK CSV UPLOAD
// ==========================================
router.post('/bulk-csv', verifyToken, upload.single('file'), async (req, res) => {
    const results = [];
    if (!req.file) return res.status(400).json({ error: "Please upload a CSV file" });

    fs.createReadStream(req.file.path)
        .pipe(csv())
        .on('data', (data) => results.push(data))
        .on('end', async () => {
            try {
                const pool = await poolPromise;
                const table = new sql.Table('bulk_reviews');
                table.columns.add('user_id', sql.Int, { nullable: false });
                table.columns.add('source_platform', sql.NVarChar(50), { nullable: true });
                table.columns.add('product_name', sql.NVarChar(255), { nullable: true });
                table.columns.add('review_text', sql.NVarChar(sql.MAX), { nullable: true });
                table.columns.add('rating', sql.Int, { nullable: true });

                results.forEach(r => {
                    table.rows.add(req.user.userId, r.source, r.product, r.text, parseInt(r.rating));
                });

                await pool.request().bulk(table);
                fs.unlinkSync(req.file.path); // Delete temp file
                res.json({ success: true, message: `${results.length} reviews uploaded via CSV` });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });
});

module.exports = router;