from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import numpy as np
import re
import os
import logging
from datetime import datetime
from collections import Counter
import io
import warnings
warnings.filterwarnings('ignore')

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Environment variables
MAX_ROWS = int(os.getenv("MAX_ROWS", 50000))
MAX_FILE_SIZE_MB = int(os.getenv("MAX_FILE_SIZE_MB", 20))

# Set random seed for reproducibility
np.random.seed(42)

# ML Libraries
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from sklearn.decomposition import LatentDirichletAllocation
from textblob import TextBlob

# VADER for better sentiment analysis
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
    vader = SentimentIntensityAnalyzer()
    logger.info("VADER Sentiment Analyzer loaded")
except ImportError:
    VADER_AVAILABLE = False
    logger.warning("VADER not available. Install with: pip install vaderSentiment")
    logger.info("Using TextBlob fallback")

app = FastAPI(
    title="ReviewMind ML Intelligence Engine",
    version="3.0",
    description="""
    ## ReviewMind ML Microservice
    
    Provides AI-powered analytics for customer reviews including:
    - Sentiment Analysis (VADER/TextBlob)
    - KMeans Clustering
    - TF-IDF Complaint Extraction
    - LDA Topic Modeling
    - Temporal Trend Analysis
    - Dynamic Risk Scoring
    """,
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ HEALTH CHECK ENDPOINT ============
@app.get(
    "/",
    summary="Health check",
    description="Returns service status and version information"
)
@app.get(
    "/health",
    summary="Health check",
    description="Returns service status and version information"
)
async def root():
    return {
        "service": "ReviewMind ML Engine",
        "status": "running",
        "version": "3.0",
        "vader_available": VADER_AVAILABLE,
        "timestamp": datetime.now().isoformat(),
        "config": {
            "max_rows": MAX_ROWS,
            "max_file_size_mb": MAX_FILE_SIZE_MB
        }
    }

# ============ COLUMN DETECTION ============
RATING_COLS = ['rating', 'ratings', 'score', 'stars', 'Rate', 'Score', 'Rating', 'review_rating', 'product_rating']
REVIEW_COLS = ['review', 'reviews', 'text', 'comment', 'comments', 'feedback', 'Reviews', 'Text', 'review_text', 'review_body']
SENTIMENT_COLS = ['sentiment', 'sentiments', 'label', 'Sentiment', 'Sentiments', 'Label']
DATE_COLS = ['date', 'created_at', 'timestamp', 'review_date', 'Date', 'CreatedAt', 'published_at', 'datetime']

def detect_column(headers, candidates):
    for i, h in enumerate(headers):
        h_clean = h.strip().lower()
        for c in candidates:
            if h_clean == c.lower() or c.lower() in h_clean:
                return i, headers[i]
    return None, None

def clean_text(text):
    """Clean and prepare text for NLP processing"""
    if pd.isna(text) or not text:
        return ""
    text = str(text)
    text = text.lower()
    text = re.sub(r'http\S+|www\S+|https\S+', '', text)
    text = re.sub(r'[^a-zA-Z0-9\s\u0600-\u06FF]', '', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text

# ============ 1. SENTIMENT ANALYSIS ============
def analyze_sentiment(text):
    """Hybrid sentiment: VADER if available, else TextBlob"""
    if not text or pd.isna(text):
        return 0.0, "Neutral", 0.0
    
    cleaned = clean_text(text)
    if len(cleaned) < 3:
        return 0.0, "Neutral", 0.0
    
    if VADER_AVAILABLE:
        scores = vader.polarity_scores(cleaned)
        polarity = scores['compound']
        if polarity >= 0.05:
            label = "Positive"
        elif polarity <= -0.05:
            label = "Negative"
        else:
            label = "Neutral"
        subjectivity = abs(scores['pos'] - scores['neg'])
    else:
        blob = TextBlob(cleaned)
        polarity = blob.sentiment.polarity
        subjectivity = blob.sentiment.subjectivity
        if polarity > 0.15:
            label = "Positive"
        elif polarity < -0.15:
            label = "Negative"
        else:
            label = "Neutral"
    
    return polarity, label, subjectivity

# ============ 2. KMEANS CLUSTERING (Dynamic k) ============
def perform_kmeans_clustering(texts):
    """Group similar NEGATIVE reviews using KMeans with dynamic clusters"""
    cleaned_texts = [clean_text(t) for t in texts if clean_text(t)]
    
    if len(cleaned_texts) < 10:
        return []
    
    # Dynamic cluster count using sqrt heuristic
    n_clusters = min(5, max(2, int(np.sqrt(len(cleaned_texts) / 2))))
    
    try:
        vectorizer = TfidfVectorizer(max_features=100, stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(cleaned_texts)
        
        kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        clusters = kmeans.fit_predict(tfidf_matrix)
        
        feature_names = vectorizer.get_feature_names_out()
        
        cluster_topics = []
        for i in range(kmeans.n_clusters):
            center = kmeans.cluster_centers_[i]
            top_indices = center.argsort()[-5:][::-1]
            top_words = [feature_names[idx] for idx in top_indices]
            
            # Semantic labeling based on keywords
            if any(w in ['shipping', 'delivery', 'late', 'package', 'courier'] for w in top_words):
                semantic_label = "Shipping & Delivery Issues"
            elif any(w in ['quality', 'broken', 'defective', 'damaged', 'faulty'] for w in top_words):
                semantic_label = "Product Quality Issues"
            elif any(w in ['service', 'support', 'refund', 'return', 'exchange'] for w in top_words):
                semantic_label = "Customer Service Issues"
            elif any(w in ['price', 'expensive', 'cost', 'money', 'overpriced'] for w in top_words):
                semantic_label = "Price/Value Concerns"
            elif any(w in ['packaging', 'box', 'wrap', 'seal'] for w in top_words):
                semantic_label = "Packaging Issues"
            else:
                semantic_label = "Other Complaints"
            
            cluster_topics.append({
                "cluster_id": int(i),
                "label": semantic_label,
                "size": int(np.sum(clusters == i)),
                "topics": top_words,
                "percentage": round(np.sum(clusters == i) / len(cleaned_texts) * 100, 1)
            })
        
        return sorted(cluster_topics, key=lambda x: x["size"], reverse=True)
    except ValueError:
        return []

# ============ 3. TF-IDF COMPLAINT EXTRACTION ============
def extract_complaints_tfidf(texts, total_negative):
    """Extract complaints ONLY from negative reviews using TF-IDF"""
    if not texts:
        return [], []
    
    cleaned_texts = [clean_text(t) for t in texts if clean_text(t)]
    if not cleaned_texts:
        return [], []
    
    try:
        vectorizer = TfidfVectorizer(max_features=30, stop_words='english')
        tfidf_matrix = vectorizer.fit_transform(cleaned_texts)
        
        feature_names = vectorizer.get_feature_names_out()
        scores = tfidf_matrix.sum(axis=0).A1
        
        # Get top keywords for explainability
        top_keywords = sorted(
            [(word, float(score)) for word, score in zip(feature_names, scores)],
            key=lambda x: x[1],
            reverse=True
        )[:10]
        
        category_keywords = {
            "Product Quality": ["quality", "broken", "defective", "damaged", "cheap", "poor", "bad", "waste", "useless", "cracked", "faulty"],
            "Shipping & Delivery": ["shipping", "delivery", "late", "delay", "slow", "package", "arrived", "courier", "tracking"],
            "Customer Service": ["service", "support", "rude", "helpful", "response", "refund", "return", "exchange", "agent"],
            "Price & Value": ["price", "expensive", "cost", "value", "worth", "money", "overpriced"],
            "Packaging": ["packaging", "box", "wrap", "seal", "packed", "bubble"]
        }
        
        complaint_weights = {}
        for word, score in zip(feature_names, scores):
            for category, keywords in category_keywords.items():
                if word in keywords:
                    complaint_weights[category] = complaint_weights.get(category, 0.0) + float(score)
                    break
        
        total_weight = sum(complaint_weights.values())
        complaints = []
        for category, weight in complaint_weights.items():
            estimated_count = int((weight / total_weight) * total_negative) if total_weight > 0 else 0
            complaints.append({
                "category": category,
                "count": estimated_count,
                "weight": round(weight, 2),
                "percentage": round(weight / total_weight * 100, 1) if total_weight > 0 else 0
            })
        
        return sorted(complaints, key=lambda x: x["percentage"], reverse=True), top_keywords
    except ValueError:
        return [], []

# ============ 4. LDA TOPIC MODELING (Using CountVectorizer) ============
def perform_lda_topic_modeling(texts, n_topics=5):
    """Advanced topic modeling using Latent Dirichlet Allocation with CountVectorizer"""
    cleaned_texts = [clean_text(t) for t in texts if clean_text(t)]
    
    if len(cleaned_texts) < 20:
        return []
    
    try:
        # Use CountVectorizer for LDA (CORRECT approach)
        vectorizer = CountVectorizer(max_features=100, stop_words='english')
        dtm = vectorizer.fit_transform(cleaned_texts)
        
        n_components = min(n_topics, max(2, len(cleaned_texts) // 50))
        lda = LatentDirichletAllocation(n_components=n_components, random_state=42)
        lda.fit(dtm)
        
        feature_names = vectorizer.get_feature_names_out()
        topics = []
        
        for topic_idx, topic in enumerate(lda.components_):
            top_indices = topic.argsort()[-5:][::-1]
            top_words = [feature_names[idx] for idx in top_indices]
            topics.append({
                "topic_id": topic_idx,
                "keywords": top_words,
                "description": f"Topic {topic_idx + 1}: {', '.join(top_words[:3])}"
            })
        
        return topics
    except Exception:
        return []

# ============ 5. TEMPORAL TREND ANALYSIS ============
def analyze_temporal_trend(df, date_idx, review_idx):
    """Analyze sentiment trends over time if date column exists"""
    if date_idx is None:
        return {"has_date": False, "message": "No date column found for trend analysis"}
    
    try:
        df_copy = df.copy()
        df_copy['date'] = pd.to_datetime(df_copy.iloc[:, date_idx], errors='coerce')
        df_copy = df_copy.dropna(subset=['date'])
        df_copy = df_copy.reset_index(drop=True)
        
        if len(df_copy) == 0:
            return {"has_date": False, "message": "No valid dates found"}
        
        df_copy['month'] = df_copy['date'].dt.strftime('%Y-%m')
        monthly_counts = df_copy.groupby(['month', 'sentiment']).size().unstack(fill_value=0)
        
        monthly_scores = {}
        for month in monthly_counts.index:
            p = monthly_counts.loc[month].get('Positive', 0)
            n = monthly_counts.loc[month].get('Negative', 0)
            total = p + n + monthly_counts.loc[month].get('Neutral', 0)
            if total > 0:
                score = (p - n) / total * 50 + 50
                monthly_scores[month] = round(score, 1)
        
        months = list(monthly_scores.keys())
        if len(months) >= 2:
            first_score = monthly_scores[months[0]]
            last_score = monthly_scores[months[-1]]
            if last_score > first_score + 5:
                trend = "improving"
            elif last_score < first_score - 5:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "insufficient_data"
        
        return {
            "has_date": True,
            "date_column": df.columns[date_idx],
            "monthly_scores": monthly_scores,
            "trend": trend,
            "data_points": len(months),
            "period_start": months[0] if months else None,
            "period_end": months[-1] if months else None
        }
    except Exception as e:
        logger.error(f"Temporal trend analysis failed: {str(e)}")
        return {"has_date": False, "error": str(e)}

# ============ 6. RISK CALCULATION ============
def calculate_risk_metrics(negative_pct, avg_rating, unique_complaints, total_reviews, trend, has_date):
    """Dynamic risk scoring with trend consideration"""
    risk_score = 0
    
    # Negative percentage contribution (0-40 points)
    risk_score += min(40, negative_pct * 1.2)
    
    # Rating contribution (0-30 points)
    if avg_rating < 2:
        risk_score += 30
    elif avg_rating < 3:
        risk_score += 20
    elif avg_rating < 4:
        risk_score += 10
    
    # Complaint diversity contribution (0-20 points)
    complaint_ratio = unique_complaints / 10
    risk_score += min(20, complaint_ratio * 5)
    
    # Trend adjustment
    if has_date:
        if trend == "declining":
            risk_score += 10
        elif trend == "improving":
            risk_score -= 10
    
    risk_score = max(0, min(100, risk_score))
    
    if risk_score >= 70:
        level = "CRITICAL"
    elif risk_score >= 50:
        level = "HIGH"
    elif risk_score >= 30:
        level = "MEDIUM"
    else:
        level = "LOW"
    
    return {"score": int(risk_score), "level": level}

# ============ MAIN ANALYSIS ENDPOINT ============
@app.post(
    "/analyze/dashboard-data",
    summary="Analyze customer reviews dataset",
    description="Upload a CSV file containing customer reviews. Returns sentiment analysis, complaint categories, clusters, topics, and risk assessment."
)
async def analyze_dashboard(file: UploadFile = File(...)):
    try:
        # File validation
        if not file.filename.endswith('.csv'):
            return {"success": False, "error": "Only CSV files are supported"}
        
        # Check file size
        file_size = len(await file.read())
        await file.seek(0)
        if file_size > MAX_FILE_SIZE_MB * 1024 * 1024:
            return {"success": False, "error": f"File size exceeds {MAX_FILE_SIZE_MB}MB limit"}
        
        # Read CSV with encoding fallback
        content = await file.read()
        try:
            df = pd.read_csv(io.BytesIO(content), encoding='utf-8')
        except UnicodeDecodeError:
            df = pd.read_csv(io.BytesIO(content), encoding='latin1')
        
        if df.empty:
            return {"success": False, "error": "CSV file is empty"}
        
        # Dataset size protection
        original_rows = len(df)
        if len(df) > MAX_ROWS:
            df = df.head(MAX_ROWS)
            logger.info(f"Dataset truncated from {original_rows} to {MAX_ROWS} rows")
        
        total_rows = len(df)
        logger.info(f"Processing {total_rows} rows, Columns: {list(df.columns)}")
        
        # Detect columns
        rating_idx, rating_name = detect_column(df.columns, RATING_COLS)
        review_idx, review_name = detect_column(df.columns, REVIEW_COLS)
        sentiment_idx, sentiment_name = detect_column(df.columns, SENTIMENT_COLS)
        date_idx, date_name = detect_column(df.columns, DATE_COLS)
        
        # Check for required columns
        if review_idx is None and rating_idx is None and sentiment_idx is None:
            return {"success": False, "error": "No review text, rating, or sentiment column detected. Please ensure your CSV has a 'review', 'rating', or 'sentiment' column."}
        
        # Initialize
        positive, neutral, negative = 0, 0, 0
        review_texts = []
        negative_reviews = []
        actual_ratings = []
        top_keywords = []
        
        # Add sentiment column to dataframe
        df['calculated_sentiment'] = None
        
        # Process each row
        for idx, row in df.iterrows():
            sentiment_label = None
            
            # Priority 1: Use rating column
            if rating_idx is not None:
                try:
                    rating = float(row.iloc[rating_idx])
                    if 1 <= rating <= 5:
                        actual_ratings.append(rating)
                        if rating >= 4:
                            sentiment_label = "Positive"
                            positive += 1
                        elif rating >= 2.5:
                            sentiment_label = "Neutral"
                            neutral += 1
                        else:
                            sentiment_label = "Negative"
                            negative += 1
                except:
                    pass
            
            # Priority 2: Use sentiment column
            if sentiment_label is None and sentiment_idx is not None:
                val = str(row.iloc[sentiment_idx]).lower()
                if 'positive' in val:
                    sentiment_label = "Positive"
                    positive += 1
                elif 'negative' in val:
                    sentiment_label = "Negative"
                    negative += 1
                else:
                    sentiment_label = "Neutral"
                    neutral += 1
            
            # Priority 3: Use NLP on review text
            if sentiment_label is None and review_idx is not None and pd.notna(row.iloc[review_idx]):
                text = str(row.iloc[review_idx])
                polarity, label, _ = analyze_sentiment(text)
                sentiment_label = label
                if label == "Positive":
                    positive += 1
                elif label == "Negative":
                    negative += 1
                else:
                    neutral += 1
            
            df.at[idx, 'calculated_sentiment'] = sentiment_label
            
            if review_idx is not None and pd.notna(row.iloc[review_idx]):
                text = str(row.iloc[review_idx])
                review_texts.append(text)
                if sentiment_label == "Negative":
                    negative_reviews.append(text)
        
        total = positive + neutral + negative
        
        if total == 0:
            return {"success": False, "error": "No valid sentiment data could be extracted from the CSV"}
        
        # Calculate average rating
        if actual_ratings:
            avg_rating = sum(actual_ratings) / len(actual_ratings)
            rating_source = "actual"
            logger.info(f"Using REAL ratings from column: {rating_name} (n={len(actual_ratings)})")
        else:
            avg_rating = (positive * 5 + neutral * 3 + negative * 1) / total
            rating_source = "estimated"
            logger.info("Using ESTIMATED rating (no rating column found)")
        
        # ML Analytics
        logger.info(f"Negative reviews for analysis: {len(negative_reviews)}")
        
        # 1. KMeans Clustering
        clusters = perform_kmeans_clustering(negative_reviews[:2000]) if negative_reviews else []
        
        # 2. TF-IDF Complaint Extraction
        complaints, complaint_keywords = extract_complaints_tfidf(negative_reviews, negative) if negative_reviews else ([], [])
        top_keywords = complaint_keywords
        
        # 3. LDA Topic Modeling
        topics = perform_lda_topic_modeling(negative_reviews[:2000], 5) if negative_reviews else []
        
        # 4. Temporal Trend Analysis
        if date_idx is not None:
            trend_analysis = analyze_temporal_trend(df, date_idx, review_idx)
        else:
            trend_analysis = {"has_date": False, "message": "No date column found for trend analysis"}
        
        # 5. Risk Metrics
        risk = calculate_risk_metrics(
            negative/total*100,
            avg_rating,
            len(complaints),
            total,
            trend_analysis.get('trend', 'stable'),
            trend_analysis.get('has_date', False)
        )
        
        # 6. Sentiment Score
        sentiment_score = round(((positive - negative) / total * 50 + 50), 1)
        
        logger.info(f"Results: P={positive}, Neu={neutral}, Neg={negative}, Total={total}")
        logger.info(f"Risk: {risk['level']} ({risk['score']}), Trend: {trend_analysis.get('trend', 'N/A')}")
        
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
                "rating_source": rating_source,
                "positive_pct": round(positive/total*100, 1),
                "neutral_pct": round(neutral/total*100, 1),
                "negative_pct": round(negative/total*100, 1),
                "sentiment_score": sentiment_score,
                "risk_score": risk["score"],
                "risk_level": risk["level"],
                "detected_rating_column": rating_name,
                "detected_review_column": review_name,
                "detected_date_column": date_name,
                "vader_available": VADER_AVAILABLE,
                "negative_reviews_analyzed": len(negative_reviews)
            },
            "complaintCategories": complaints,
            "topKeywords": top_keywords,
            "clusters": clusters,
            "topics": topics,
            "trendAnalysis": trend_analysis,
            "analysisMetadata": {
                "pythonServiceStatus": "success",
                "analysisTime": datetime.now().isoformat(),
                "algorithmsUsed": [
                    "VADER/TextBlob Sentiment Analysis",
                    "KMeans Clustering (dynamic k = sqrt(n/2))",
                    "TF-IDF Complaint Extraction",
                    "Latent Dirichlet Allocation (LDA) with CountVectorizer",
                    "Temporal Sentiment Trend Analysis",
                    "Explainable AI: Top keyword extraction"
                ],
                "totalReviewsAnalyzed": total,
                "clustersGenerated": len(clusters),
                "complaintsExtracted": len(complaints),
                "topicsGenerated": len(topics),
                "negativeReviewsCount": len(negative_reviews),
                "randomSeed": 42
            }
        }
        
    except Exception as e:
        logger.error(f"Analysis failed: {str(e)}")
        import traceback
        traceback.print_exc()
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    print("\n" + "="*60)
    print("🚀 ReviewMind ML Intelligence Engine v3.0 - FINAL PRODUCTION")
    print("="*60)
    print(f"📍 API URL: http://0.0.0.0:8000")
    print(f"📍 Swagger UI: http://0.0.0.0:8000/docs")
    print(f"📍 ReDoc: http://0.0.0.0:8000/redoc")
    print(f"📍 Health Check: http://0.0.0.0:8000/health")
    print(f"📊 VADER Sentiment: {'✅ Available' if VADER_AVAILABLE else '❌ Using TextBlob'}")
    print(f"📊 Algorithms: KMeans (dynamic k), TF-IDF, LDA (CountVectorizer), Temporal Trends")
    print(f"📊 Max Rows: {MAX_ROWS}, Max File Size: {MAX_FILE_SIZE_MB}MB")
    print(f"🔬 Random Seed: 42 (for reproducibility)")
    print("="*60 + "\n")
    uvicorn.run(app, host="0.0.0.0", port=8000)