const jwt = require('jsonwebtoken'); 
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { poolPromise, sql } = require('../db/connection');

// ==========================================
// 1. REGISTER: Knowledge + Possession + Context
// ==========================================
router.post('/register', async (req, res) => {
    const { email, password } = req.body;
    const userIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    try {
        const pool = await poolPromise;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const secret = speakeasy.generateSecret({ name: `ReviewMind (${email})` });

        await pool.request()
            .input('email', sql.NVarChar, email)
            .input('pass', sql.NVarChar, hashedPassword)
            .input('mfa', sql.NVarChar, secret.base32)
            .input('ip', sql.NVarChar, userIP)
            .query('INSERT INTO users (email, password_hash, mfa_secret, last_known_ip) VALUES (@email, @pass, @mfa, @ip)');

        const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
        res.status(201).json({ 
            success: true,
            message: "User Registered!", 
            qrCode: qrCodeUrl 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Registration Error" });
    }
});

// ==========================================
// 2. LOGIN: Primary Authentication
// ==========================================
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT * FROM users WHERE email = @email');

        if (result.recordset.length === 0) return res.status(404).json({ error: "User not found" });

        const isMatch = await bcrypt.compare(password, result.recordset[0].password_hash);
        if (!isMatch) return res.status(400).json({ error: "Wrong password" });

        res.json({ mfaRequired: true, email });
    } catch (err) {
        res.status(500).json({ error: "Login Error" });
    }
});

// ==========================================
// 3. VERIFY: Issues JWT on 3-Factor Success
// ==========================================
router.post('/verify-mfa', async (req, res) => {
    const { email, token } = req.body;
    const currentIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.NVarChar, email)
            .query('SELECT user_id, email, mfa_secret, last_known_ip FROM users WHERE email = @email');

        const user = result.recordset[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        // Factor 2: TOTP Verification
        const isTokenValid = speakeasy.totp.verify({
            secret: user.mfa_secret,
            encoding: 'base32',
            token: token,
            window: 1
        });

        // Factor 3: IP Comparison
        const isIpTrusted = (user.last_known_ip === currentIP);

        if (isTokenValid) {
            // Generate the Access Key (JWT)
            const accessToken = jwt.sign(
                { userId: user.user_id, email: user.email }, 
                process.env.JWT_SECRET, 
                { expiresIn: '1h' }
            );

            res.json({ 
                success: true, 
                token: accessToken, 
                message: "MFA Verified! Token Issued.",
                mfa_report: {
                    factor_1: "Password Verified",
                    factor_2: "TOTP Valid",
                    factor_3: isIpTrusted ? "Trusted IP Match" : "New Location Flagged"
                }
            });
        } else {
            res.status(400).json({ success: false, message: "Invalid MFA Token" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Verification Error" });
    }
});

module.exports = router;