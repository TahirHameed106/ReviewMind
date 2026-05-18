// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

// Test endpoint first
router.get('/test', (req, res) => {
    res.json({ message: 'Auth route working' });
});

// REGISTER - Working version
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        // Check if user exists
        const exists = await query('SELECT user_id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // Hash password and create user
        const hash = await bcrypt.hash(password, 10);
        const result = await query(
            'INSERT INTO users (email, password_hash, name) OUTPUT INSERTED.user_id VALUES (@email, @hash, @name)',
            { email: email.toLowerCase(), hash, name: name || email.split('@')[0] }
        );

        const userId = result.recordset[0].user_id;
        
        // Create token
        const token = jwt.sign(
            { id: userId, email: email.toLowerCase(), name: name || email.split('@')[0] },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: { id: userId, email: email.toLowerCase(), name: name || email.split('@')[0] }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: error.message });
    }
});

// LOGIN - Working version
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await query(
            'SELECT user_id, email, password_hash, name FROM users WHERE email = @email',
            { email: email.toLowerCase() }
        );
        
        if (!result.recordset.length) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.user_id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: { id: user.user_id, email: user.email, name: user.name }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get current user
router.get('/me', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const result = await query('SELECT user_id, email, name FROM users WHERE user_id = @id', { id: decoded.id });
        
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.recordset[0];
        res.json({ success: true, user: { id: user.user_id, email: user.email, name: user.name } });
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;