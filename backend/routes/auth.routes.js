const jwt = require('jsonwebtoken');
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');

const { poolPromise, sql } = require('../db/connection');

// ==========================================
// In-memory reset token store
// ==========================================
const passwordResetTokens = new Map();

// ==========================================
// HELPERS
// ==========================================
const buildResetLink = (resetToken) => {
    const frontendBase = process.env.FRONTEND_URL || 'http://localhost:5173';

    return `${frontendBase}/?resetToken=${encodeURIComponent(resetToken)}`;
};

const createPasswordResetToken = (email) => {
    const jti = crypto.randomBytes(16).toString('hex');

    const resetToken = jwt.sign(
        {
            email,
            purpose: 'password_reset',
            jti
        },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
    );

    passwordResetTokens.set(jti, {
        email,
        used: false,
        expiresAt: Date.now() + (15 * 60 * 1000)
    });

    return {
        resetToken,
        resetLink: buildResetLink(resetToken)
    };
};

const consumePasswordResetToken = (token) => {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.purpose !== 'password_reset') {
        throw new Error('Invalid token purpose');
    }

    const stored = passwordResetTokens.get(payload.jti);

    if (!stored || stored.used) {
        throw new Error('Token already used or invalid');
    }

    if (stored.expiresAt < Date.now()) {
        passwordResetTokens.delete(payload.jti);
        throw new Error('Token expired');
    }

    stored.used = true;
    passwordResetTokens.set(payload.jti, stored);

    return payload.email;
};

// ==========================================
// 1. REGISTER
// ==========================================
router.post('/register', async (req, res) => {
    const { email, password, subscriptionPlan } = req.body;

    const userIP =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '127.0.0.1';

    const selectedPlan = ['basic', 'business', 'enterprise'].includes(subscriptionPlan)
        ? subscriptionPlan
        : 'basic';

    try {
        const pool = await poolPromise;

        // Check if user already exists
        const existingUser = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT user_id FROM users WHERE email = @email');

        if (existingUser.recordset.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Email already exists'
            });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Generate MFA secret
        const secret = speakeasy.generateSecret({
            name: `ReviewMind (${email})`
        });

        // Insert user
        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('pass', sql.NVarChar, hashedPassword)
            .input('mfa', sql.NVarChar, secret.base32)
            .input('ip', sql.NVarChar, userIP)
            .input('tier', sql.NVarChar, selectedPlan)
            .query(`
                INSERT INTO users
                (
                    email,
                    password_hash,
                    mfa_secret,
                    last_known_ip,
                    subscription_tier
                )
                VALUES
                (
                    @email,
                    @pass,
                    @mfa,
                    @ip,
                    @tier
                )
            `);

        // Generate QR code
        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);

        res.status(201).json({
            success: true,
            message: 'Registration successful',
            qrCode: qrCodeUrl,
            subscriptionPlan: selectedPlan
        });

    } catch (err) {
        console.error('Register Error:', err);

        res.status(500).json({
            success: false,
            error: 'Registration failed'
        });
    }
});

// ==========================================
// 2. LOGIN
// ==========================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT
                    password_hash,
                    subscription_tier
                FROM users
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const user = result.recordset[0];

        // Verify password
        const isMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!isMatch) {
            return res.status(400).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        res.json({
            success: true,
            mfaRequired: true,
            email,
            subscriptionPlan: user.subscription_tier || 'basic'
        });

    } catch (err) {
        console.error('Login Error:', err);

        res.status(500).json({
            success: false,
            error: 'Login failed'
        });
    }
});

// ==========================================
// 3. VERIFY MFA
// ==========================================
router.post('/verify-mfa', async (req, res) => {
    const { email, token } = req.body;

    const currentIP =
        req.headers['x-forwarded-for'] ||
        req.socket.remoteAddress ||
        '127.0.0.1';

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT
                    user_id,
                    email,
                    mfa_secret,
                    last_known_ip,
                    subscription_tier
                FROM users
                WHERE email = @email
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const user = result.recordset[0];

        // Verify MFA token
        const isTokenValid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token,
            window: 1
        });

        if (!isTokenValid) {
            return res.status(400).json({
                success: false,
                error: 'Invalid MFA token'
            });
        }

        // Contextual IP check
        const isIpTrusted = user.last_known_ip === currentIP;

        const plan = user.subscription_tier || 'basic';

        // Generate JWT
        const accessToken = jwt.sign(
            {
                userId: user.user_id,
                email: user.email,
                subscriptionPlan: plan
            },
            process.env.JWT_SECRET,
            {
                expiresIn: '24h'
            }
        );

        res.json({
            success: true,
            token: accessToken,
            subscriptionPlan: plan,
            message: 'Authentication successful',
            mfa_report: {
                factor_1: 'Password Verified',
                factor_2: 'TOTP Token Valid',
                factor_3: isIpTrusted
                    ? 'Trusted Location'
                    : 'New Location Flagged'
            }
        });

    } catch (err) {
        console.error('MFA Error:', err);

        res.status(500).json({
            success: false,
            error: 'Verification failed'
        });
    }
});

// ==========================================
// 4. FORGOT PASSWORD
// ==========================================
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({
            success: false,
            error: 'Email is required'
        });
    }

    try {
        const pool = await poolPromise;

        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query(`
                SELECT user_id
                FROM users
                WHERE email = @email
            `);

        // Always return same response
        if (result.recordset.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'If account exists, reset link generated'
            });
        }

        const { resetToken, resetLink } =
            createPasswordResetToken(email);

        res.status(200).json({
            success: true,
            message: 'Password reset link generated',
            resetToken,
            resetLink,
            expiresInMinutes: 15
        });

    } catch (err) {
        console.error('Forgot Password Error:', err);

        res.status(500).json({
            success: false,
            error: 'Forgot password failed'
        });
    }
});

// ==========================================
// 5. RESET PASSWORD
// ==========================================
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;

    if (!token || !password) {
        return res.status(400).json({
            success: false,
            error: 'Token and password are required'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 8 characters'
        });
    }

    try {
        // Verify reset token
        const email = consumePasswordResetToken(token);

        const pool = await poolPromise;

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Update password
        const updateResult = await pool.request()
            .input('email', sql.NVarChar, email)
            .input('pass', sql.NVarChar, hashedPassword)
            .query(`
                UPDATE users
                SET password_hash = @pass
                WHERE email = @email
            `);

        if (updateResult.rowsAffected[0] === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (err) {
        console.error('Reset Password Error:', err);

        res.status(400).json({
            success: false,
            error: err.message || 'Reset failed'
        });
    }
});

module.exports = router;