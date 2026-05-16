from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import re
import logging
from datetime import datetime
import io
import warnings
warnings.filterwarnings('ignore')

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ============ AGGRESSIVE OPTIMIZATION ============
MAX_ROWS = 5000  # Reduced from 10000 to 5000
SAMPLE_SIZE = 150  # Only analyze 150 negative reviews
USE_RATINGS_ONLY = True  # Skip NLP entirely, use ratings column

app = FastAPI(title="ReviewMind ML Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
@app.get("/health")
async def root():
    return {"status": "running", "timestamp": datetime.now().isoformat()}

# ============ COLUMN DETECTION ============
RATING_COLS = ['rating', 'ratings', 'score', 'stars', 'Rate', 'Score', 'Rating']
REVIEW_COLS = ['review', 'reviews', 'text', 'comment', 'Reviews', 'Text']

def detect_column(headers, candidates):
    for i, h in enumerate(headers):
        h_clean = h.strip().lower()
        for c in candidates:
            if h_clean == c.lower():
                return i, headers[i]
    return None, None

# ============ MAIN ANALYSIS (ULTRA FAST) ============
@app.post("/analyze/dashboard-data")
async def analyze_dashboard(file: UploadFile = File(...)):
    try:
        if not file.filename.endswith('.csv'):
            return {"success": False, "error": "Only CSV files are supported"}
        
        # Read only first 5000 rows for speed
        content = await file.read()
        try:
            df = pd.read_csv(io.BytesIO(content), encoding='utf-8', nrows=MAX_ROWS)
        except:
            df = pd.read_csv(io.BytesIO(content), encoding='latin1', nrows=MAX_ROWS)
        
        if df.empty:
            return {"success": False, "error": "CSV file is empty"}
        
        logger.info(f"Processing {len(df)} rows")
        
        # Detect columns
        rating_idx, rating_name = detect_column(df.columns, RATING_COLS)
        review_idx, review_name = detect_column(df.columns, REVIEW_COLS)
        
        # Initialize counters
        positive, neutral, negative = 0, 0, 0
        negative_reviews = []
        
        # FAST PROCESSING: Use rating column if available
        if rating_idx is not None:
            logger.info(f"Using rating column: {rating_name}")
            
            for val in df.iloc[:, rating_idx]:
                try:
                    rating = float(val)
                    if 1 <= rating <= 5:
                        if rating >= 4:
                            positive += 1
                        elif rating >= 2.5:
                            neutral += 1
                        else:
                            negative += 1
                except (ValueError, TypeError):
                    neutral += 1
        
        # If no rating column, use review text (slower but necessary)
        elif review_idx is not None:
            logger.info(f"Using review column: {review_name}")
            
            # Simple keyword sentiment (very fast)
            pos_words = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'awesome']
            neg_words = ['bad', 'poor', 'terrible', 'hate', 'awful', 'worst', 'broken', 'defective']
            
            for text in df.iloc[:, review_idx]:
                if pd.isna(text):
                    neutral += 1
                    continue
                
                text_lower = str(text).lower()
                pos_count = sum(1 for w in pos_words if w in text_lower)
                neg_count = sum(1 for w in neg_words if w in text_lower)
                
                if pos_count > neg_count:
                    positive += 1
                elif neg_count > pos_count:
                    negative += 1
                    if len(negative_reviews) < SAMPLE_SIZE:
                        negative_reviews.append(text_lower[:200])
                else:
                    neutral += 1
        else:
            return {"success": False, "error": "No rating or review column found"}
        
        total = positive + neutral + negative
        
        if total == 0:
            return {"success": False, "error": "No valid data extracted"}
        
        # Calculate metrics
        avg_rating = (positive * 5 + neutral * 3 + negative * 1) / total
        positive_pct = round(positive / total * 100, 1)
        negative_pct = round(negative / total * 100, 1)
        sentiment_score = round(((positive - negative) / total * 50 + 50), 1)
        
        # Risk level
        if negative_pct > 40:
            risk_level = "CRITICAL"
            risk_score = 85
        elif negative_pct > 25:
            risk_level = "HIGH"
            risk_score = 65
        elif negative_pct > 15:
            risk_level = "MEDIUM"
            risk_score = 45
        else:
            risk_level = "LOW"
            risk_score = 25
        
        # Simple complaint extraction from negative reviews
        complaints = []
        if negative_reviews:
            complaint_keywords = {
                "Product Quality": ["quality", "broken", "defective", "damaged", "cheap", "poor"],
                "Shipping & Delivery": ["shipping", "delivery", "late", "slow", "package"],
                "Customer Service": ["service", "support", "rude", "refund", "return"],
                "Price & Value": ["price", "expensive", "cost", "value", "money"],
                "Packaging": ["packaging", "box", "wrap", "packed"]
            }
            
            counts = {}
            for text in negative_reviews:
                for cat, keywords in complaint_keywords.items():
                    if any(k in text for k in keywords):
                        counts[cat] = counts.get(cat, 0) + 1
                        break
            
            total_complaints = sum(counts.values())
            for cat, count in counts.items():
                complaints.append({
                    "category": cat,
                    "count": count,
                    "percentage": round(count / total_complaints * 100, 1) if total_complaints > 0 else 0
                })
            complaints.sort(key=lambda x: x["count"], reverse=True)
        
        logger.info(f"Results: P={positive}, Neu={neutral}, Neg={negative}, Total={total}")
        
        return {
            "success": True,
            "pieData": [
                {"name": "Positive", "value": positive},
                {"name": "Neutral", "value": neutral},
                {"name": "Negative", "value": negative}
            ],
            "metrics": {
                "total_reviews": total,
                "avg_rating": round(avg_rating, 2),
                "positive_pct": positive_pct,
                "neutral_pct": round(neutral / total * 100, 1),
                "negative_pct": negative_pct,
                "sentiment_score": sentiment_score,
                "risk_score": risk_score,
                "risk_level": risk_level,
                "detected_column": rating_name or review_name
            },
            "complaintCategories": complaints,
            "analysisMetadata": {
                "fast_mode": True,
                "rows_processed": total,
                "analysisTime": datetime.now().isoformat()
            }
        }
        
    except Exception as e:
        logger.error(f"Error: {str(e)}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*50)
    print("🚀 ReviewMind ML Engine - ULTRA FAST")
    print("="*50)
    print(f"📍 http://0.0.0.0:8000")
    print(f"📊 Max Rows: {MAX_ROWS}")
    print(f"⚡ Ratings Only Mode: {USE_RATINGS_ONLY}")
    print("="*50 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)