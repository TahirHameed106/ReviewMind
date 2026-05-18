// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { query } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
};
module.exports.authMiddleware = authMiddleware;

// ============================================================
// TEST ENDPOINT
// ============================================================
router.get('/test', (req, res) => {
    res.json({ message: 'Auth route working' });
});

// ============================================================
// REGISTER - Creates new user
// ============================================================
router.post('/register', async (req, res) => {
    try {
        const { email, password, name } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const exists = await query('SELECT user_id FROM users WHERE email = @email', { email: email.toLowerCase() });
        if (exists.recordset.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await query(
            'INSERT INTO users (email, password_hash, name, mfa_enabled) OUTPUT INSERTED.user_id VALUES (@email, @hash, @name, 0)',
            { email: email.toLowerCase(), hash, name: name || email.split('@')[0] }
        );

        const userId = result.recordset[0].user_id;
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

// ============================================================
// LOGIN - Returns token or MFA required
// ============================================================
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const result = await query(
            'SELECT user_id, email, password_hash, name, mfa_secret, mfa_enabled FROM users WHERE email = @email',
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

        // Check if MFA is enabled
        if (user.mfa_enabled === 1 && user.mfa_secret) {
            const partialToken = jwt.sign(
                { email: user.email, mfaPending: true },
                JWT_SECRET,
                { expiresIn: '5m' }
            );
            return res.json({
                success: true,
                mfaRequired: true,
                partialToken: partialToken,
                email: user.email
            });
        }

        // No MFA - return full token
        const token = jwt.sign(
            { id: user.user_id, email: user.email, name: user.name },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            token: token,
            user: { id: user.user_id, email: user.email, name: user.name },
            mfaRequired: false
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// SETUP MFA - Generates QR code
// ============================================================
router.post('/setup-mfa', authMiddleware, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({
            name: `ReviewMind (${req.user.email})`
        });

        await query(
            'UPDATE users SET mfa_secret = @secret WHERE email = @email',
            { secret: secret.base32, email: req.user.email }
        );

        qrcode.toDataURL(secret.otpauth_url, (err, qrCode) => {
            if (err) {
                return res.status(500).json({ error: 'QR generation failed' });
            }
            res.json({
                success: true,
                secret: secret.base32,
                qrCode: qrCode
            });
        });
    } catch (error) {
        console.error('Setup MFA error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// ENABLE MFA - Verifies code and activates MFA
// ============================================================
router.post('/enable-mfa', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'MFA code required' });
        }

        const result = await query(
            'SELECT mfa_secret FROM users WHERE email = @email',
            { email: req.user.email }
        );

        const user = result.recordset[0];
        
        if (!user || !user.mfa_secret) {
            return res.status(400).json({ error: 'MFA not setup. Call /setup-mfa first.' });
        }

        const verified = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!verified) {
            return res.status(401).json({ error: 'Invalid MFA code' });
        }

        await query(
            'UPDATE users SET mfa_enabled = 1 WHERE email = @email',
            { email: req.user.email }
        );

        res.json({
            success: true,
            message: 'MFA enabled successfully'
        });
    } catch (error) {
        console.error('Enable MFA error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// VERIFY MFA - Completes login after MFA code
// ============================================================
router.post('/verify-mfa', async (req, res) => {
    try {
        const { partialToken, code } = req.body;
        
        if (!partialToken || !code) {
            return res.status(400).json({ error: 'Partial token and MFA code required' });
        }

        let payload;
        try {
            payload = jwt.verify(partialToken, JWT_SECRET);
        } catch {
            return res.status(400).json({ error: 'Invalid or expired partial token' });
        }

        if (!payload.mfaPending) {
            return res.status(400).json({ error: 'Invalid token type' });
        }

        const result = await query(
            'SELECT user_id, email, name, mfa_secret FROM users WHERE email = @email',
            { email: payload.email }
        );

        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.recordset[0];

        const verified = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!verified) {
            return res.status(401).json({ error: 'Invalid MFA code' });
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
        console.error('Verify MFA error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// FORGOT PASSWORD
// ============================================================
router.post('/forgot-password', (req, res) => {
    const resetToken = jwt.sign(
        { email: (req.body.email || '').toLowerCase(), reset: true },
        JWT_SECRET,
        { expiresIn: '15m' }
    );
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
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(400).json({ error: 'Invalid or expired token' });
    }
});

// ============================================================
// GET CURRENT USER
// ============================================================
router.get('/me', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT user_id, email, name, mfa_enabled FROM users WHERE email = @email',
            { email: req.user.email }
        );
        
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        const user = result.recordset[0];
        res.json({
            success: true,
            user: {
                id: user.user_id,
                email: user.email,
                name: user.name,
                mfaEnabled: user.mfa_enabled === 1
            }
        });
    } catch (error) {
        console.error('Me error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// DISABLE MFA (Optional)
// ============================================================
router.post('/disable-mfa', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        
        if (!code) {
            return res.status(400).json({ error: 'MFA code required' });
        }

        const result = await query(
            'SELECT mfa_secret FROM users WHERE email = @email',
            { email: req.user.email }
        );

        const user = result.recordset[0];
        
        const verified = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: code,
            window: 2
        });

        if (!verified) {
            return res.status(401).json({ error: 'Invalid MFA code' });
        }

        await query(
            'UPDATE users SET mfa_enabled = 0, mfa_secret = NULL WHERE email = @email',
            { email: req.user.email }
        );

        res.json({
            success: true,
            message: 'MFA disabled successfully'
        });
    } catch (error) {
        console.error('Disable MFA error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;