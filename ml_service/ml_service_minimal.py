from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import uvicorn
from datetime import datetime
import re
from collections import Counter

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/analyze/dashboard-data")
async def analyze(file: UploadFile = File(...)):
    # Read the actual CSV
    contents = await file.read()
    df = pd.read_csv(io.StringIO(contents.decode('utf-8', errors='ignore')))
    
    # Find rating column (look for common names)
    rating_col = None
    for col in df.columns:
        if any(x in col.lower() for x in ['rating', 'score', 'stars', 'rate']):
            rating_col = col
            break
    
    if not rating_col:
        # Take first numeric column
        numeric_cols = df.select_dtypes(include=['number']).columns
        rating_col = numeric_cols[0] if len(numeric_cols) > 0 else None
    
    # Calculate REAL metrics
    total = len(df)
    
    if rating_col:
        ratings = pd.to_numeric(df[rating_col], errors='coerce')
        ratings = ratings.dropna()
        avg = round(ratings.mean(), 2)
        
        positive = len(ratings[ratings >= 4])
        negative = len(ratings[ratings <= 2])
        neutral = len(ratings[(ratings > 2) & (ratings < 4)])
        
        pos_pct = round(positive / total * 100, 1)
        neg_pct = round(negative / total * 100, 1)
        neu_pct = round(neutral / total * 100, 1)
    else:
        avg = 0
        positive = negative = neutral = 0
        pos_pct = neg_pct = neu_pct = 0
    
    # Find text column for complaints
    text_col = None
    for col in df.columns:
        if any(x in col.lower() for x in ['review', 'comment', 'feedback', 'text']):
            text_col = col
            break
    
    complaints = []
    if text_col and negative > 0:
        # Get negative reviews
        if rating_col:
            neg_reviews = df[pd.to_numeric(df[rating_col], errors='coerce') <= 2]
        else:
            neg_reviews = df
        
        # Extract common complaint words
        all_words = []
        stop = {'the','a','an','and','or','but','is','are','was','were','to','for','of','with','on','at','by','this','that','it','i','you','he','she','we','they','product','item'}
        
        for review in neg_reviews[text_col].dropna():
            words = str(review).lower().split()
            words = [re.sub(r'[^a-z]', '', w) for w in words if len(w) > 3]
            words = [w for w in words if w not in stop]
            all_words.extend(words)
        
        # Get top complaint words
        word_counts = Counter(all_words)
        
        # Group into categories
        cats = {
            "Quality": ['quality','defective','broken','damaged','poor','terrible','bad','cheap'],
            "Shipping": ['delivery','shipping','package','arrived','late','delay'],
            "Service": ['service','support','refund','return','help'],
            "Price": ['price','expensive','cost','money','worth']
        }
        
        cat_counts = {}
        for word, count in word_counts.most_common(20):
            for cat, keywords in cats.items():
                if word in keywords:
                    cat_counts[cat] = cat_counts.get(cat, 0) + count
                    break
        
        total_complaints = sum(cat_counts.values())
        for cat, count in cat_counts.items():
            complaints.append({
                "category": cat,
                "count": count,
                "percentage": round(count / total_complaints * 100, 1) if total_complaints > 0 else 0
            })
        
        complaints = sorted(complaints, key=lambda x: x['count'], reverse=True)[:5]
    
    # Return REAL data
    return {
        "success": True,
        "data": {
            "pieData": [
                {"name": "Positive", "value": int(positive)},
                {"name": "Negative", "value": int(negative)},
                {"name": "Neutral", "value": int(neutral)}
            ],
            "metrics": {
                "total_reviews": total,
                "avg_rating": avg,
                "detected_col": rating_col or "unknown",
                "positive_pct": pos_pct,
                "negative_pct": neg_pct,
                "neutral_pct": neu_pct,
                "risk_level": "High" if neg_pct > 30 else "Medium" if neg_pct > 15 else "Low"
            },
            "complaintCategories": complaints,
            "analysisMetadata": {
                "analysisTime": datetime.now().isoformat(),
                "pythonServiceStatus": "Connected",
                "totalReviewsAnalyzed": total
            }
        }
    }

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)