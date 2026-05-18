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
// LOGIN
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

// ============================================================
// VERIFY MFA
// ============================================================
router.post('/verify-mfa', async (req, res) => {
    try {
        const { email, token } = req.body;
        
        if (!email || !token) {
            return res.status(400).json({ success: false, error: 'Email and MFA code required' });
        }

        const result = await query('SELECT user_id, email, name, mfa_secret FROM users WHERE email = @email',
            { email: email.toLowerCase() });
        
        if (!result.recordset.length) {
            return res.status(401).json({ error: 'User not found' });
        }

        const user = result.recordset[0];
        const speakeasy = require('speakeasy');
        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: String(token),
            window: 2
        });

        if (!valid) {
            return res.status(401).json({ error: 'Invalid MFA code' });
        }

        const tokenUser = { user_id: user.user_id, email: user.email, name: user.name };
        const authToken = makeToken(tokenUser);

        res.json({
            success: true,
            token: authToken,
            user: { id: user.user_id, email: user.email, name: user.name }
        });
    } catch (e) {
        console.error('MFA verify error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// SETUP MFA
// ============================================================
router.post('/setup-mfa', authMiddleware, async (req, res) => {
    try {
        const speakeasy = require('speakeasy');
        const qrcode = require('qrcode');
        const secret = speakeasy.generateSecret({ name: `ReviewMind (${req.user.email})` });
        
        await query('UPDATE users SET mfa_secret = @s WHERE email = @e',
            { s: secret.base32, e: req.user.email });
        
        qrcode.toDataURL(secret.otpauth_url, (err, qr) => {
            if (err) return res.status(500).json({ error: 'QR error' });
            res.json({ success: true, secret: secret.base32, qrCode: qr });
        });
    } catch (e) {
        console.error('Setup MFA error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// ENABLE MFA
// ============================================================
router.post('/enable-mfa', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        const result = await query('SELECT mfa_secret FROM users WHERE email = @e', { e: req.user.email });
        const user = result.recordset[0];
        
        if (!user?.mfa_secret) {
            return res.status(400).json({ error: 'Setup MFA first' });
        }

        const speakeasy = require('speakeasy');
        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: String(code),
            window: 2
        });

        if (!valid) {
            return res.status(401).json({ error: 'Invalid code' });
        }

        await query('UPDATE users SET mfa_enabled = 1 WHERE email = @e', { e: req.user.email });
        res.json({ success: true, message: 'MFA enabled' });
    } catch (e) {
        console.error('Enable MFA error:', e);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================
// FORGOT PASSWORD
// ============================================================
router.post('/forgot-password', (req, res) => {
    const resetToken = jwt.sign({ email: (req.body.email || '').toLowerCase(), reset: true }, JWT_SECRET, { expiresIn: '15m' });
    res.json({ success: true, resetToken, message: 'Use resetToken with /reset-password' });
});

// ============================================================
// RESET PASSWORD
// ============================================================
router.post('/reset-password', async (req, res) => {
    try {
        const { resetToken, newPassword } = req.body;
        if (!resetToken || !newPassword) {
            return res.status(400).json({ error: 'resetToken and newPassword required' });
        }

        const payload = jwt.verify(resetToken, JWT_SECRET);
        if (!payload.reset) {
            return res.status(400).json({ error: 'Invalid token' });
        }

        const hash = await bcrypt.hash(newPassword, 10);
        await query('UPDATE users SET password_hash = @h WHERE email = @e',
            { h: hash, e: payload.email });
        
        res.json({ success: true, message: 'Password reset successfully' });
    } catch (e) {
        console.error('Reset password error:', e);
        res.status(400).json({ error: 'Invalid or expired token' });
    }
});

module.exports = router;