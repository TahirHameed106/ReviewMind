// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

const makeToken = (user) =>
    jwt.sign({ id: user.user_id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

// ============================================================
// REGISTER
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, subscriptionPlan } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        // Use user_id instead of id
        const exists = await query('SELECT user_id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ name: `ReviewMind (${email})` });

        const result = await query(
            `INSERT INTO users (email, password_hash, name, mfa_secret, mfa_enabled, subscription_plan)
             OUTPUT INSERTED.user_id VALUES (@email, @hash, @name, @mfaSecret, 0, @plan)`,
            {
                email: email.toLowerCase(),
                hash: hash,
                name: email.split('@')[0],
                mfaSecret: secret.base32,
                plan: subscriptionPlan || 'basic',
            }
        );

        const userId = result.recordset[0].user_id;

        const qrCode = await new Promise((resolve, reject) =>
            qrcode.toDataURL(secret.otpauth_url, (err, url) => err ? reject(err) : resolve(url))
        );

        const token = makeToken({ user_id: userId, email: email.toLowerCase(), name: email.split('@')[0] });

        res.status(201).json({
            success: true,
            token: token,
            qrCode: qrCode,
            user: { id: userId, email: email.toLowerCase(), name: email.split('@')[0] },
        });
    } catch (e) {
        console.error('[Register]', e.message);
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

        const result = await query('SELECT * FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (!result.recordset.length) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        const user = result.recordset[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid credentials' });
        }

        if (user.mfa_secret && user.mfa_enabled === 0) {
            return res.json({
                success: true,
                mfaRequired: true,
                email: user.email,
                subscriptionPlan: user.subscription_plan || 'basic',
            });
        }

        const token = makeToken({ user_id: user.user_id, email: user.email, name: user.name });
        res.json({
            success: true,
            token: token,
            subscriptionPlan: user.subscription_plan || 'basic',
            user: { id: user.user_id, email: user.email, name: user.name },
        });
    } catch (e) {
        console.error('[Login]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// VERIFY MFA
// ============================================================
router.post('/verify-mfa', async (req, res) => {
    try {
        const { email, token: mfaCode } = req.body;
        if (!email || !mfaCode) {
            return res.status(400).json({ success: false, error: 'Email and MFA code required' });
        }

        const result = await query('SELECT * FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (!result.recordset.length) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const user = result.recordset[0];
        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: String(mfaCode).trim(),
            window: 2,
        });

        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid MFA code' });
        }

        await query('UPDATE users SET mfa_enabled = 1 WHERE email = @email', { email: user.email });

        const token = makeToken({ user_id: user.user_id, email: user.email, name: user.name });
        res.json({
            success: true,
            token: token,
            subscriptionPlan: user.subscription_plan || 'basic',
            user: { id: user.user_id, email: user.email, name: user.name },
        });
    } catch (e) {
        console.error('[Verify MFA]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// GET ME
// ============================================================
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    
    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET);
        
        const result = await query('SELECT user_id, email, name, mfa_enabled, subscription_plan FROM users WHERE user_id = @id', 
            { id: decoded.id });
        if (!result.recordset.length) return res.status(404).json({ error: 'User not found' });
        
        const u = result.recordset[0];
        res.json({
            success: true,
            user: {
                id: u.user_id,
                email: u.email,
                name: u.name,
                mfaEnabled: !!u.mfa_enabled,
                subscriptionPlan: u.subscription_plan || 'basic',
            },
        });
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
});

// ============================================================
// FORGOT PASSWORD
// ============================================================
router.post('/forgot-password', (req, res) => {
    const email = (req.body.email || '').toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email required' });
    const resetToken = jwt.sign({ email, reset: true }, JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?resetToken=${resetToken}`;
    res.json({ success: true, resetToken, resetLink });
});

// ============================================================
// RESET PASSWORD
// ============================================================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        if (!token || !password) {
            return res.status(400).json({ error: 'token and password required' });
        }

        const payload = jwt.verify(token, JWT_SECRET);
        if (!payload.reset) return res.status(400).json({ error: 'Invalid reset token' });

        const hash = await bcrypt.hash(password, 10);
        await query('UPDATE users SET password_hash = @hash WHERE email = @email', { hash, email: payload.email });
        res.json({ success: true, message: 'Password reset successfully' });
    } catch {
        res.status(400).json({ error: 'Invalid or expired reset token' });
    }
});

module.exports = router;