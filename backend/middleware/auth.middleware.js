const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // Look for the token in the "Authorization" header
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: "Access Denied: No Token Provided" });
    }

    try {
        // Verify the token using your secret key
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Add user data to the request object
        next(); // Move to the next function (the actual route)
    } catch (err) {
        res.status(403).json({ error: "Invalid or Expired Token" });
    }
};

module.exports = verifyToken;