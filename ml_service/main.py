from fastapi import FastAPI, Body
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import re
from datetime import datetime
from textblob import TextBlob
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer
from statsmodels.tsa.arima.model import ARIMA

app = FastAPI(title="ReviewMind AI ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "service": "ReviewMind ML Engine",
        "timestamp": datetime.now().isoformat()
    }

def clean_text(text):
    text = str(text).lower()
    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text

def find_text_column(df):
    possible = ['review', 'review_text', 'text', 'comment', 'feedback', 'description', 'content']
    for col in df.columns:
        if col.lower() in possible:
            return col
    for col in df.columns:
        if df[col].dtype == 'object':
            return col
    return None

def find_rating_column(df):
    possible = ['rating', 'ratings', 'score', 'stars', 'review_rating', 'product_rating']
    for col in df.columns:
        if col.lower() in possible:
            return col
    return None

def extract_rating(value):
    if pd.isna(value):
        return None
    s = str(value).strip().lower()
    try:
        num = float(s)
        if 0 <= num <= 5:
            return num
    except:
        pass
    match = re.search(r'(\d+(\.\d+)?)', s)
    if match:
        try:
            num = float(match.group(1))
            if 0 <= num <= 5:
                return num
        except:
            pass
    return None

def analyze_sentiment(text):
    text = clean_text(text)
    polarity = TextBlob(text).sentiment.polarity
    if polarity > 0.15:
        return "Positive"
    elif polarity < -0.15:
        return "Negative"
    return "Neutral"

def calculate_risk(negative_pct):
    if negative_pct >= 40:
        return "CRITICAL"
    elif negative_pct >= 25:
        return "HIGH"
    elif negative_pct >= 15:
        return "MEDIUM"
    return "LOW"

@app.post("/analyze/dashboard-data")
async def analyze_dashboard_data(data: list = Body(...)):
    try:
        print(f"[ML SERVICE] Rows received: {len(data)}")
        df = pd.DataFrame(data)
        
        text_col = find_text_column(df)
        rating_col = find_rating_column(df)
        
        sentiments = []
        
        if text_col:
            for text in df[text_col]:
                if pd.isna(text):
                    sentiments.append("Neutral")
                    continue
                sentiment = analyze_sentiment(str(text))
                sentiments.append(sentiment)
        elif rating_col:
            for value in df[rating_col]:
                rating = extract_rating(value)
                if rating is None:
                    sentiments.append("Neutral")
                elif rating >= 4:
                    sentiments.append("Positive")
                elif rating >= 2.5:
                    sentiments.append("Neutral")
                else:
                    sentiments.append("Negative")
        else:
            return {"success": False, "error": "No usable review or rating column found."}
        
        positive = sentiments.count("Positive")
        neutral = sentiments.count("Neutral")
        negative = sentiments.count("Negative")
        total = len(sentiments)
        
        positive_pct = round((positive / total) * 100, 1) if total > 0 else 0
        neutral_pct = round((neutral / total) * 100, 1) if total > 0 else 0
        negative_pct = round((negative / total) * 100, 1) if total > 0 else 0
        avg_rating = round(((positive * 5) + (neutral * 3) + (negative * 1)) / total, 2) if total > 0 else 0
        
        risk_level = calculate_risk(negative_pct)
        
        return {
            "success": True,
            "pieData": [
                {"name": "Positive", "value": positive},
                {"name": "Neutral", "value": neutral},
                {"name": "Negative", "value": negative}
            ],
            "metrics": {
                "total_reviews": total,
                "avg_rating": avg_rating,
                "positive_percentage": positive_pct,
                "neutral_percentage": neutral_pct,
                "negative_percentage": negative_pct,
                "risk_level": risk_level,
                "detected_text_column": text_col,
                "detected_rating_column": rating_col
            },
            "analysisMetadata": {
                "pythonServiceStatus": "success",
                "analysisTime": datetime.now().isoformat()
            }
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)