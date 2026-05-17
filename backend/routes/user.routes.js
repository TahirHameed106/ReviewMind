// backend/routes/user.routes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { query } = require('../db/connection');  // ✅ FIXED PATH

const JWT_SECRET = process.env.JWT_SECRET || 'reviewmind_secret_2026';

const authMiddleware = (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'No token provided' });
    try {
        req.user = jwt.verify(t, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const VALID_PLANS = ['basic', 'business', 'enterprise'];

const makeToken = (user) =>
    jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '24h' });

// GET /api/user/subscription
router.get('/subscription', authMiddleware, async (req, res) => {
    try {
        const result = await query(
            'SELECT subscription_plan FROM users WHERE email = @email',
            { email: req.user.email }
        );
        if (!result.recordset.length) {
            return res.status(404).json({ error: 'User not found' });
        }
        const plan = result.recordset[0].subscription_plan || 'basic';
        res.json({ success: true, subscriptionPlan: plan });
    } catch (e) {
        console.error('[Subscription GET]', e.message);
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/user/subscription
router.patch('/subscription', authMiddleware, async (req, res) => {
    try {
        const planKey = req.body.subscriptionPlan || req.body.plan;
        if (!planKey || !VALID_PLANS.includes(planKey)) {
            return res.status(400).json({ error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}` });
        }

        await query(
            'UPDATE users SET subscription_plan = @plan WHERE email = @email',
            { plan: planKey, email: req.user.email }
        );

        const newToken = makeToken({ id: req.user.id, email: req.user.email, name: req.user.name });

        res.json({
            success: true,
            subscriptionPlan: planKey,
            token: newToken,
            message: `Plan updated to ${planKey}`,
        });
    } catch (e) {
        console.error('[Subscription PATCH]', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;