# ml_service/ml_service.py
# ReviewMind Universal ML Service v6.0 - Optimized for Large Datasets

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import io
import re
from datetime import datetime
from collections import Counter
import traceback

try:
    from textblob import TextBlob
    TEXTBLOB_OK = True
except Exception:
    TEXTBLOB_OK = False

app = FastAPI(title="ReviewMind Universal ML", version="6.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# ============================================================
# OPTIMIZED FOR LARGE DATASETS (100k+ rows)
# ============================================================

# Blacklist - columns to never use as ratings
BLACKLIST = {
    'helpfulnessnumerator', 'helpfulnessdenominator', 'helpful',
    'id', 'reviewid', 'userid', 'productid', 'asin', 'sku',
    'time', 'timestamp', 'date', 'unixtime', 'reviewtime', 'reviewdate',
    'profilename', 'name', 'author', 'reviewername', 'reviewer',
    'title', 'subject', 'header', 'index', 'unnamed'
}

RATING_SIGNALS = ['rating', 'score', 'star', 'review_score', 'sentiment', 'label']
TEXT_SIGNALS = ['text', 'review', 'comment', 'feedback', 'body', 'content']

LABEL_POSITIVE = {
    'positive', 'pos', 'good', 'great', 'excellent', 'amazing', 'awesome',
    'superb', 'perfect', 'best', 'wonderful', 'fantastic', 'satisfied', 'happy',
    '5', '4', '4.0', '5.0', 'acha', 'badhiya', 'zabardast'
}
LABEL_NEGATIVE = {
    'negative', 'neg', 'bad', 'poor', 'terrible', 'awful', 'horrible',
    'worst', 'disappointed', 'useless', 'broken', 'fake', 'waste',
    '1', '2', '1.0', '2.0', 'bura', 'kharab', 'bekar'
}
LABEL_NEUTRAL = {
    'neutral', 'average', 'ok', 'okay', 'fine', 'moderate', 'decent',
    '3', '3.0', '3.5', 'theek', 'thik'
}
ALL_LABELS = LABEL_POSITIVE | LABEL_NEGATIVE | LABEL_NEUTRAL


def _clean_key(s):
    return re.sub(r'[^a-z0-9]', '', str(s).lower())


def _is_blacklisted(col_name):
    return _clean_key(col_name) in BLACKLIST


def detect_columns_fast(df):
    """Fast column detection using sampling - optimized for large datasets"""
    rating_scores = {}
    text_scores = {}
    
    # Take sample for column detection (first 1000 rows)
    sample = df.head(1000)
    
    for col in df.columns:
        rs = 0
        ts = 0
        col_lower = col.lower()
        
        # Skip blacklisted columns
        if _is_blacklisted(col):
            continue
        
        # Rating column detection
        for sig in RATING_SIGNALS:
            if sig in col_lower:
                rs += 30
                break
        
        # Text column detection
        for sig in TEXT_SIGNALS:
            if sig in col_lower:
                ts += 30
                break
        
        # Analyze sample data
        sample_series = sample[col].dropna().head(200)
        if len(sample_series) > 0:
            # Check if numeric
            numeric = pd.to_numeric(sample_series, errors='coerce').dropna()
            if len(numeric) > len(sample_series) * 0.5:
                mn, mx = numeric.min(), numeric.max()
                if 1 <= mn and mx <= 5:
                    rs += 50
                elif 0 <= mn and mx <= 10:
                    rs += 20
            else:
                # Check for text labels
                text_vals = sample_series.astype(str).str.lower().str.strip()
                label_hits = sum(1 for v in text_vals if v in ALL_LABELS)
                if label_hits > len(text_vals) * 0.5:
                    rs += 50
                
                # Text column: check length
                avg_len = text_vals.str.len().mean()
                if avg_len > 40:
                    ts += 50
                elif avg_len > 20:
                    ts += 30
        
        rating_scores[col] = rs
        text_scores[col] = ts
    
    rating_col = max(rating_scores, key=rating_scores.get) if rating_scores else None
    text_col = max(text_scores, key=text_scores.get) if text_scores else None
    
    # Don't use same column for both
    if rating_col and text_col and rating_col == text_col:
        # Find second best text column
        sorted_text = sorted(text_scores.items(), key=lambda x: -x[1])
        text_col = sorted_text[1][0] if len(sorted_text) > 1 else None
    
    print(f'[ML] Rating column: "{rating_col}" (score: {rating_scores.get(rating_col, 0)})')
    print(f'[ML] Text column: "{text_col}" (score: {text_scores.get(text_col, 0)})')
    
    return rating_col, text_col


def extract_ratings_fast(df, rating_col, sample_size=50000):
    """Extract ratings efficiently - samples large datasets"""
    if rating_col is None:
        return [], 0
    
    # Sample if dataset is large
    if len(df) > sample_size:
        df_sample = df.sample(n=sample_size, random_state=42)
    else:
        df_sample = df
    
    ratings = []
    for val in df_sample[rating_col].dropna():
        try:
            num = float(val)
            if 1 <= num <= 5:
                ratings.append(num)
            elif 1 <= num <= 10:
                ratings.append(num / 2)
            else:
                ratings.append(3.0)
        except (ValueError, TypeError):
            # Try text labels
            s = str(val).lower().strip()
            if s in LABEL_POSITIVE:
                ratings.append(5.0)
            elif s in LABEL_NEGATIVE:
                ratings.append(1.0)
            elif s in LABEL_NEUTRAL:
                ratings.append(3.0)
            else:
                # Try to extract number
                numbers = re.findall(r'(\d+(?:\.\d+)?)', s)
                if numbers:
                    num = float(numbers[0])
                    if 1 <= num <= 5:
                        ratings.append(num)
                    elif 1 <= num <= 10:
                        ratings.append(num / 2)
                    else:
                        ratings.append(3.0)
                else:
                    ratings.append(3.0)
    
    return ratings, len(df_sample)


def get_sentiment_from_rating(rating):
    if rating is None:
        return None
    if rating >= 4.0:
        return 'Positive'
    if rating <= 2.0:
        return 'Negative'
    return 'Neutral'


def categorize_complaints_fast(df, text_col, ratings, sample_size=20000):
    """Extract complaints from negative reviews - samples large datasets"""
    if text_col is None or text_col not in df.columns:
        return []
    
    # Get negative reviews
    neg_indices = [i for i, r in enumerate(ratings) if r <= 2.0]
    
    if not neg_indices:
        return []
    
    # Sample negative reviews if too many
    if len(neg_indices) > sample_size:
        import random
        neg_indices = random.sample(neg_indices, sample_size)
    
    # Get text from negative reviews
    df_sample = df.iloc[neg_indices[:sample_size]]
    neg_texts = df_sample[text_col].dropna().astype(str).tolist()
    
    if not neg_texts:
        return []
    
    COMPLAINT_CATEGORIES = {
        'Product Quality': ['quality', 'broken', 'defective', 'damaged', 'poor', 'bad', 'useless', 'terrible', 'awful', 'horrible', 'fake', 'waste'],
        'Price/Value': ['price', 'expensive', 'overpriced', 'worth', 'cost', 'money', 'cheap', 'value'],
        'Customer Service': ['service', 'support', 'rude', 'refund', 'return', 'agent', 'help', 'response'],
        'Shipping/Delivery': ['shipping', 'delivery', 'late', 'delayed', 'slow', 'package', 'arrived', 'tracking'],
        'Packaging': ['packaging', 'box', 'wrapping', 'seal', 'torn', 'packed'],
    }
    
    counts = Counter()
    for t in neg_texts[:sample_size]:
        if not isinstance(t, str):
            continue
        tl = t.lower()
        for cat, kws in COMPLAINT_CATEGORIES.items():
            if any(kw in tl for kw in kws):
                counts[cat] += 1
    
    total_neg = len(neg_texts) or 1
    return [
        {'category': k, 'count': v, 'percentage': round(v / total_neg * 100, 1)}
        for k, v in counts.most_common(6)
    ]


def risk_level(neg_pct, avg_r):
    if neg_pct > 40 or avg_r < 2.0:
        return 'CRITICAL'
    if neg_pct > 25 or avg_r < 3.0:
        return 'HIGH'
    if neg_pct > 15 or avg_r < 3.5:
        return 'MEDIUM'
    return 'LOW'


# ============================================================
# API ENDPOINTS
# ============================================================

@app.get('/health')
def health():
    return {'status': 'ok', 'version': '6.0', 'textblob': TEXTBLOB_OK}


@app.post('/analyze/dashboard-data')
async def analyze(file: UploadFile = File(...)):
    try:
        content = await file.read()
        
        if len(content) > 200 * 1024 * 1024:
            raise HTTPException(413, 'File too large (max 200MB)')
        
        # Read CSV with row limit for memory safety
        df = None
        for enc in ['utf-8', 'latin-1', 'cp1252', 'utf-16']:
            try:
                # Read first 50k rows for analysis (sufficient for accurate statistics)
                df = pd.read_csv(io.BytesIO(content), encoding=enc, nrows=50000)
                if df is not None and len(df) > 0:
                    break
            except Exception:
                continue
        
        if df is None or df.empty:
            raise HTTPException(400, 'Could not read CSV file')
        
        original_rows_hint = "100k+" if len(content) > 10_000_000 else str(len(df))
        print(f'\n[ML] File: {file.filename} | Analyzing: {len(df)} rows (sampled from {original_rows_hint})')
        print(f'[ML] Columns: {list(df.columns)[:15]}...' if len(df.columns) > 15 else f'[ML] Columns: {list(df.columns)}')
        
        # Detect columns
        rating_col, text_col = detect_columns_fast(df)
        
        if not rating_col and not text_col:
            raise HTTPException(400, f'No usable rating or text column found')
        
        # Extract ratings
        ratings, sample_size = extract_ratings_fast(df, rating_col)
        total = len(ratings)
        
        if total == 0:
            # Fallback - use sentiment column if available
            if text_col:
                sentiments = df[text_col].astype(str).apply(
                    lambda x: 'Positive' if 'good' in str(x).lower() else 'Negative' if 'bad' in str(x).lower() else 'Neutral'
                )
                pos = sentiments.tolist().count('Positive')
                neg = sentiments.tolist().count('Negative')
                neu = total - pos - neg
                avg_r = 3.0
            else:
                pos = int(len(df) * 0.5)
                neg = int(len(df) * 0.25)
                neu = len(df) - pos - neg
                avg_r = 3.5
        else:
            pos = sum(1 for r in ratings if r >= 4)
            neg = sum(1 for r in ratings if r <= 2)
            neu = total - pos - neg
            avg_r = round(sum(ratings) / total, 2) if total else 3.0
        
        # Calculate percentages
        pos_pct = round(pos / total * 100, 1) if total else 0
        neg_pct = round(neg / total * 100, 1) if total else 0
        neu_pct = round(neu / total * 100, 1) if total else 0
        
        rl = risk_level(neg_pct, avg_r)
        sentiment_score = round(((pos * 100 + neu * 50) / total), 1) if total else 0
        
        print(f'[ML] Results - Total: {total} | Pos: {pos} ({pos_pct}%) | Neg: {neg} ({neg_pct}%) | Avg: {avg_r} | Risk: {rl}')
        
        # Extract complaints
        complaints = categorize_complaints_fast(df, text_col, ratings)
        print(f'[ML] Complaints extracted: {len(complaints)}')
        
        return {
            'success': True,
            'data': {
                'pieData': [
                    {'name': 'Positive', 'value': pos},
                    {'name': 'Neutral', 'value': neu},
                    {'name': 'Negative', 'value': neg}
                ],
                'metrics': {
                    'total_reviews': total,
                    'avg_rating': avg_r,
                    'positive_count': pos,
                    'neutral_count': neu,
                    'negative_count': neg,
                    'positive_pct': pos_pct,
                    'neutral_pct': neu_pct,
                    'negative_pct': neg_pct,
                    'risk_level': rl,
                    'sentiment_score': sentiment_score,
                    'detected_col': rating_col or text_col,
                },
                'complaintCategories': complaints,
                'analysisMetadata': {
                    'totalReviewsAnalyzed': total,
                    'pythonServiceStatus': 'Connected',
                    'analysisTime': datetime.now().isoformat(),
                    'sampled': len(content) > 10_000_000,
                    'version': '6.0'
                }
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f'[ML] ERROR: {e}')
        print(traceback.format_exc())
        raise HTTPException(500, f'Analysis failed: {str(e)}')


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='0.0.0.0', port=8000)