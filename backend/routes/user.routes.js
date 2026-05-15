const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const verifyToken = require('../middleware/auth.middleware');
const { poolPromise, sql } = require('../db/connection');

// GET: Current Subscription from Database
router.get('/subscription', verifyToken, async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.NVarChar, req.user.email)
            .query('SELECT subscription_tier FROM users WHERE email = @email');

        const plan = result.recordset[0]?.subscription_tier || 'basic';

        res.json({
            success: true,
            subscriptionPlan: plan
        });
    } catch (error) {
        res.status(500).json({ error: 'Database fetch failed' });
    }
});

// PATCH: Upgrade Plan and Refresh JWT
router.patch('/subscription', verifyToken, async (req, res) => {
    const requestedPlan = req.body.plan || req.body.subscriptionPlan || req.body.subscription_tier;
    const validPlans = ['basic', 'business', 'enterprise'];
    const plan = typeof requestedPlan === 'string' ? requestedPlan.trim().toLowerCase() : '';

    if (!validPlans.includes(plan)) {
        return res.status(400).json({ error: "Invalid plan selection" });
    }

    try {
        const pool = await poolPromise;
        
        // 1. Update SQL Database
        await pool.request()
            .input('email', sql.NVarChar, req.user.email)
            .input('tier', sql.NVarChar, plan)
            .query('UPDATE users SET subscription_tier = @tier WHERE email = @email');

        // 2. Generate a NEW Token containing the NEW plan
        // This is crucial so the Frontend doesn't have to log out/in
        const newToken = jwt.sign(
            { 
                userId: req.user.userId, 
                email: req.user.email, 
                subscriptionPlan: plan 
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: '1h' }
        );

        res.json({
            success: true,
            subscriptionPlan: plan,
            token: newToken, // Send the refreshed token back
            message: `Plan upgraded to ${plan}`
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Subscription update failed' });
    }
});

module.exports = router;