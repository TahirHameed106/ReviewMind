// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

const authMiddleware = (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'No token provided' });
    try { req.user = jwt.verify(t, JWT_SECRET); next(); }
    catch { res.status(401).json({ error: 'Invalid or expired token' }); }
};
module.exports.authMiddleware = authMiddleware;

const makeToken = (user) =>
    jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

// ============================================================
// REGISTER - Returns QR code
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, subscriptionPlan } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const exists = await query('SELECT id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 10);
        const secret = speakeasy.generateSecret({ name: `ReviewMind (${email})` });

        await query(
            `INSERT INTO users (email, password_hash, name, mfa_secret, mfa_enabled, subscription_plan)
             VALUES (@email, @hash, @name, @mfaSecret, 0, @plan)`,
            {
                email: email.toLowerCase(),
                hash: hash,
                name: email.split('@')[0],
                mfaSecret: secret.base32,
                plan: subscriptionPlan || 'basic',
            }
        );

        const qrCode = await new Promise((resolve, reject) =>
            qrcode.toDataURL(secret.otpauth_url, (err, url) => err ? reject(err) : resolve(url))
        );

        res.status(201).json({
            success: true,
            qrCode: qrCode,
            message: 'Account created. Scan QR code with authenticator app.',
        });
    } catch (e) {
        console.error('[Register]', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================
// LOGIN - Returns token or mfaRequired
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

        // If MFA secret exists, require MFA
        if (user.mfa_secret) {
            return res.json({
                success: true,
                mfaRequired: true,
                email: user.email,
                subscriptionPlan: user.subscription_plan || 'basic',
            });
        }

        // No MFA - direct login
        res.json({
            success: true,
            mfaRequired: false,
            token: makeToken({ id: user.id, email: user.email, name: user.name }),
            subscriptionPlan: user.subscription_plan || 'basic',
            user: { email: user.email, name: user.name },
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
        if (!user.mfa_secret) {
            return res.status(400).json({ success: false, error: 'MFA not configured' });
        }

        const valid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: String(mfaCode).trim(),
            window: 2,
        });

        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid MFA code' });
        }

        // Enable MFA on first successful verification
        if (!user.mfa_enabled) {
            await query('UPDATE users SET mfa_enabled = 1 WHERE email = @email', { email: user.email });
        }

        res.json({
            success: true,
            token: makeToken({ id: user.id, email: user.email, name: user.name }),
            subscriptionPlan: user.subscription_plan || 'basic',
            user: { email: user.email, name: user.name },
        });
    } catch (e) {
        console.error('[Verify MFA]', e.message);
        res.status(500).json({ success: false, error: e.message });
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

// ============================================================
// GET ME
// ============================================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await query('SELECT id, email, name, mfa_enabled, subscription_plan FROM users WHERE email = @email', { email: req.user.email });
        if (!result.recordset.length) return res.status(404).json({ error: 'User not found' });
        const u = result.recordset[0];
        res.json({
            success: true,
            user: {
                id: u.id,
                email: u.email,
                name: u.name,
                mfaEnabled: !!u.mfa_enabled,
                subscriptionPlan: u.subscription_plan || 'basic',
            },
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;