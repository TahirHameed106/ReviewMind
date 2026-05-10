const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/auth.middleware');

// This is a PROTECTED route
router.get('/dashboard', verifyToken, (req, res) => {
    res.json({
        message: "Welcome to the ReviewMind Dashboard!",
        user: req.user, // Shows the email/id extracted from the JWT
        status: "Authorized"
    });
});

module.exports = router;