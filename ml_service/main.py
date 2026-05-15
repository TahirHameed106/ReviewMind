from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import re
import uvicorn

app = FastAPI(title="ReviewMind ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health():
    return {"status": "healthy"}

def detect_column_type(df):
    """Detect what type of data we have in the CSV"""
    columns = [c.lower() for c in df.columns]
    
    # Check for sentiment text column
    for col in df.columns:
        if col.lower() in ['sentiments', 'sentiment', 'label']:
            return 'sentiment_labels', col
    
    # Check for rating column
    for col in df.columns:
        if col.lower() in ['rating', 'ratings', 'score', 'stars', 'rate']:
            return 'ratings', col
    
    # Check for text column
    for col in df.columns:
        if col.lower() in ['review', 'reviews', 'text', 'comment', 'feedback', 'content']:
            return 'text', col
    
    # Fallback: first string column
    for col in df.columns:
        if df[col].dtype == 'object':
            return 'text', col
    
    return 'unknown', None

def count_sentiment_labels(series):
    """Count positive/negative/neutral from text labels"""
    counts = {'positive': 0, 'negative': 0, 'neutral': 0}
    for val in series:
        if pd.isna(val):
            counts['neutral'] += 1
            continue
        s = str(val).lower().strip()
        if s in ['positive', 'pos', 'good', 'excellent', 'great', 'amazing', 'love']:
            counts['positive'] += 1
        elif s in ['negative', 'neg', 'bad', 'poor', 'terrible', 'hate', 'awful']:
            counts['negative'] += 1
        else:
            counts['neutral'] += 1
    return counts

def extract_ratings(series):
    """Extract numeric ratings from various formats"""
    ratings = []
    for val in series:
        if pd.isna(val):
            ratings.append(3.0)
            continue
        
        s = str(val).strip()
        
        # Direct number
        try:
            num = float(s)
            if 1 <= num <= 5:
                ratings.append(num)
                continue
        except:
            pass
        
        # Extract from text like "5 stars"
        match = re.search(r'(\d+(?:\.\d+)?)', s)
        if match:
            num = float(match.group(1))
            if 1 <= num <= 5:
                ratings.append(num)
                continue
        
        # Count stars
        stars = s.count('★') + s.count('*')
        if stars > 0:
            ratings.append(min(stars, 5))
            continue
        
        # Default
        ratings.append(3.0)
    
    return ratings

def analyze_text_column(series):
    """Simple keyword-based sentiment for text"""
    sentiments = []
    for text in series:
        if pd.isna(text):
            sentiments.append('neutral')
            continue
        
        s = str(text).lower()
        pos_words = ['good', 'great', 'excellent', 'amazing', 'love', 'perfect', 'awesome', 'best', 'nice', 'happy']
        neg_words = ['bad', 'poor', 'terrible', 'hate', 'awful', 'worst', 'useless', 'waste', 'broken', 'defective']
        
        pos_count = sum(1 for w in pos_words if w in s)
        neg_count = sum(1 for w in neg_words if w in s)
        
        if pos_count > neg_count:
            sentiments.append('positive')
        elif neg_count > pos_count:
            sentiments.append('negative')
        else:
            sentiments.append('neutral')
    
    return sentiments

@app.post("/analyze/dashboard-data")
async def analyze_dashboard(file: UploadFile = File(...)):
    try:
        # Read CSV
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
        
        total_rows = len(df)
        print(f"[ML] File: {file.filename}, Rows: {total_rows}, Columns: {list(df.columns)}")
        
        # Detect what we're working with
        col_type, col_name = detect_column_type(df)
        print(f"[ML] Detected type: {col_type}, Column: {col_name}")
        
        if col_type == 'sentiment_labels':
            # CSV has sentiment labels like 'positive', 'negative', 'neutral'
            counts = count_sentiment_labels(df[col_name])
            positive = counts['positive']
            negative = counts['negative']
            neutral = counts['neutral']
            total = positive + negative + neutral
            
            # Calculate average rating (positive=5, neutral=3, negative=1)
            avg_rating = (positive * 5 + neutral * 3 + negative * 1) / total if total > 0 else 0
            
            print(f"[ML] Results: Positive={positive}, Neutral={neutral}, Negative={negative}")
            
        elif col_type == 'ratings':
            # CSV has numeric ratings
            ratings = extract_ratings(df[col_name])
            total = len(ratings)
            
            positive = sum(1 for r in ratings if r >= 4)
            neutral = sum(1 for r in ratings if 2.5 <= r < 4)
            negative = sum(1 for r in ratings if r < 2.5)
            avg_rating = sum(ratings) / total if total > 0 else 0
            
            print(f"[ML] Results: Positive={positive}, Neutral={neutral}, Negative={negative}")
            
        elif col_type == 'text':
            # CSV has review text - analyze sentiment
            sentiments = analyze_text_column(df[col_name])
            positive = sentiments.count('positive')
            negative = sentiments.count('negative')
            neutral = sentiments.count('neutral')
            total = positive + negative + neutral
            avg_rating = (positive * 5 + neutral * 3 + negative * 1) / total if total > 0 else 0
            
            print(f"[ML] Results: Positive={positive}, Neutral={neutral}, Negative={negative}")
            
        else:
            return {
                "success": False,
                "error": f"Could not detect sentiment/rating column. Found columns: {list(df.columns)}"
            }
        
        # Return the REAL data
        return {
            "success": True,
            "data": {
                "pieData": [
                    {"name": "Positive", "value": positive},
                    {"name": "Neutral", "value": neutral},
                    {"name": "Negative", "value": negative}
                ],
                "metrics": {
                    "total_reviews": total,
                    "avg_rating": round(avg_rating, 2),
                    "positive_count": positive,
                    "neutral_count": neutral,
                    "negative_count": negative,
                    "positive_pct": round(positive/total*100, 1) if total > 0 else 0,
                    "neutral_pct": round(neutral/total*100, 1) if total > 0 else 0,
                    "negative_pct": round(negative/total*100, 1) if total > 0 else 0,
                    "detected_column": col_name,
                    "detected_type": col_type
                }
            }
        }
        
    except Exception as e:
        print(f"[ML] Error: {str(e)}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    print("\n🚀 ReviewMind ML Service Starting...")
    print("📍 http://0.0.0.0:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)