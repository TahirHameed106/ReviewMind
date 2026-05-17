
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import uvicorn
from datetime import datetime

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": str(datetime.now())}

@app.post("/analyze/dashboard-data")
async def analyze(file: UploadFile = File(...)):
    contents = await file.read()
    
    try:
        df = pd.read_csv(io.StringIO(contents.decode('utf-8')))
    except:
        df = pd.read_csv(io.StringIO(contents.decode('latin-1')))
    
    total_reviews = len(df)
    
    # Sample data - will be replaced by real analysis later
    return {
        "success": True,
        "data": {
            "pieData": [
                {"name": "Positive", "value": int(total_reviews * 0.55)},
                {"name": "Negative", "value": int(total_reviews * 0.25)},
                {"name": "Neutral", "value": int(total_reviews * 0.20)}
            ],
            "metrics": {
                "total_reviews": total_reviews,
                "avg_rating": 4.2,
                "positive_pct": 55.0,
                "negative_pct": 25.0,
                "neutral_pct": 20.0,
                "risk_level": "medium"
            },
            "complaintCategories": [],
            "ratingDistribution": [],
            "analysisMetadata": {
                "totalReviewsAnalyzed": total_reviews,
                "analysisTime": str(datetime.now()),
                "version": "1.0.0"
            }
        }
    }

@app.get("/")
async def root():
    return {"message": "ReviewMind ML Service is running"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
