const axios = require('axios');

// This function acts as the bridge to your FastAPI service
exports.getAIAnalysis = async (req, res) => {
    try {
        const { reviews } = req.body; // Getting the reviews you just uploaded

        // 1. Call Python ML Service (K-Means/ARIMA) [cite: 659, 1192]
        const mlResponse = await axios.post('http://127.0.0.1:8000/analyze/dashboard-data', reviews);
        
        // 2. Pass ML results to Gemini for the "Niche Recommendation" [cite: 32, 46, 156, 268]
        // (We will add the Gemini call here in the next step)
        
        res.json({
            success: true,
            visuals: mlResponse.data, // This goes to your React Pie Chart
            recommendation: "Switching to a secondary courier is advised." // Placeholder
        });
    } catch (error) {
        res.status(500).json({ error: "Bridge to ML Service failed: " + error.message });
    }
};