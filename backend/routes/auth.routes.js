// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

const makeToken = (user) =>
    jwt.sign({ id: user.user_id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

const authMiddleware = (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'No token provided' });
    try { req.user = jwt.verify(t, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Invalid or expired token' }); }
};
module.exports.authMiddleware = authMiddleware;

// ============================================================
// REGISTER
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const exists = await query('SELECT user_id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await query(
            'INSERT INTO users (email, password_hash, name) OUTPUT INSERTED.user_id VALUES (@email, @hash, @name)',
            { email: email.toLowerCase(), hash, name: name || email.split('@')[0] }
        );

        const userId = result.recordset[0].user_id;
        const user = { user_id: userId, email: email.toLowerCase(), name: name || email.split('@')[0] };

        res.status(201).json({
            success: true,
            token: makeToken(user),
            user: { id: userId, email: user.email, name: user.name }
        });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// LOGIN - FIXED
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const result = await query(
            'SELECT user_id, email, password_hash, name, mfa_enabled, mfa_secret FROM users WHERE email = @email',
            { email: email.toLowerCase() }
        );
        
        if (!result.recordset.length) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // No MFA check - just return token
        const tokenUser = { user_id: user.user_id, email: user.email, name: user.name };
        const token = makeToken(tokenUser);

        return res.json({
            success: true,
            token: token,
            user: { id: user.user_id, email: user.email, name: user.name },
            mfaRequired: false
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// GET CURRENT USER
// ============================================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await query('SELECT user_id as id, email, name, mfa_enabled FROM users WHERE email = @e',
            { e: req.user.email });
        
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const u = result.recordset[0];
        res.json({ success: true, user: { id: u.id, email: u.email, name: u.name, mfaEnabled: !!u.mfa_enabled } });
    } catch (e) {
        console.error('Me error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

const makeToken = (user) =>
    jwt.sign({ id: user.user_id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

const authMiddleware = (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'No token provided' });
    try { req.user = jwt.verify(t, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Invalid or expired token' }); }
};
module.exports.authMiddleware = authMiddleware;

// ============================================================
// REGISTER
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const exists = await query('SELECT user_id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await query(
            'INSERT INTO users (email, password_hash, name) OUTPUT INSERTED.user_id VALUES (@email, @hash, @name)',
            { email: email.toLowerCase(), hash, name: name || email.split('@')[0] }
        );

        const userId = result.recordset[0].user_id;
        const user = { user_id: userId, email: email.toLowerCase(), name: name || email.split('@')[0] };

        res.status(201).json({
            success: true,
            token: makeToken(user),
            user: { id: userId, email: user.email, name: user.name }
        });
    } catch (e) {
        console.error('Register error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// LOGIN - FIXED
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const result = await query(
            'SELECT user_id, email, password_hash, name, mfa_enabled, mfa_secret FROM users WHERE email = @email',
            { email: email.toLowerCase() }
        );
        
        if (!result.recordset.length) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        // No MFA check - just return token
        const tokenUser = { user_id: user.user_id, email: user.email, name: user.name };
        const token = makeToken(tokenUser);

        return res.json({
            success: true,
            token: token,
            user: { id: user.user_id, email: user.email, name: user.name },
            mfaRequired: false
        });
    } catch (e) {
        console.error('Login error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// GET CURRENT USER
// ============================================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await query('SELECT user_id as id, email, name, mfa_enabled FROM users WHERE email = @e',
            { e: req.user.email });
        
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const u = result.recordset[0];
        res.json({ success: true, user: { id: u.id, email: u.email, name: u.name, mfaEnabled: !!u.mfa_enabled } });
    } catch (e) {
        console.error('Me error:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;