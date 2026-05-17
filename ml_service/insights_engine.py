"""
Smart Insights Layer - Google-style reasoning engine
No hardcoded rules - all insights derived from data patterns
"""

import pandas as pd
import numpy as np
from typing import List, Dict, Any
from sklearn.feature_extraction.text import TfidfVectorizer
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

def detect_root_causes(df: pd.DataFrame) -> List[Dict]:
    """
    Finds which clusters contribute most to negative sentiment
    Returns data-driven root causes, not hardcoded rules
    """
    if "cluster" not in df.columns or len(df) == 0:
        return []
    
    total_reviews = len(df)
    cluster_stats = []
    
    for cluster_id in df["cluster"].unique():
        cluster_df = df[df["cluster"] == cluster_id]
        cluster_size = len(cluster_df)
        negative_count = (cluster_df["sentiment"] == "Negative").sum()
        negative_pct = (negative_count / cluster_size) * 100 if cluster_size > 0 else 0
        
        # Calculate impact score (how much this cluster affects overall negativity)
        impact_score = (negative_count / total_reviews) * 100 if total_reviews > 0 else 0
        
        # Get representative words for this cluster
        topic_name = df[df["cluster"] == cluster_id].get("topic_name", [f"Topic {cluster_id}"])
        topic = topic_name.iloc[0] if len(topic_name) > 0 else f"Cluster {cluster_id}"
        
        cluster_stats.append({
            "cluster_id": int(cluster_id),
            "topic": str(topic),
            "total_reviews": int(cluster_size),
            "negative_count": int(negative_count),
            "negative_percentage": round(negative_pct, 1),
            "impact_score": round(impact_score, 1),
            "severity": "critical" if impact_score > 20 else "high" if impact_score > 10 else "medium" if impact_score > 5 else "low"
        })
    
    # Sort by impact score (most problematic first)
    return sorted(cluster_stats, key=lambda x: x["impact_score"], reverse=True)[:10]

def detect_trends(df: pd.DataFrame, date_col: str = None) -> List[Dict]:
    """
    Detect sentiment changes over time
    Automatically finds date column if not specified
    """
    if date_col is None:
        # Auto-detect date column
        date_keywords = ['date', 'timestamp', 'created', 'time', 'datetime', 'review_date']
        for col in df.columns:
            col_lower = col.lower()
            for keyword in date_keywords:
                if keyword in col_lower:
                    date_col = col
                    break
            if date_col:
                break
    
    if date_col is None or date_col not in df.columns:
        return []
    
    try:
        df_copy = df.copy()
        df_copy[date_col] = pd.to_datetime(df_copy[date_col], errors='coerce')
        df_copy = df_copy.dropna(subset=[date_col])
        
        if len(df_copy) == 0:
            return []
        
        # Group by month
        df_copy["month"] = df_copy[date_col].dt.to_period("M").astype(str)
        
        trend_data = []
        for month in sorted(df_copy["month"].unique()):
            month_df = df_copy[df_copy["month"] == month]
            total = len(month_df)
            
            if total == 0:
                continue
            
            positive = (month_df["sentiment"] == "Positive").sum()
            negative = (month_df["sentiment"] == "Negative").sum()
            neutral = (month_df["sentiment"] == "Neutral").sum()
            
            trend_data.append({
                "month": month,
                "total": int(total),
                "positive": int(positive),
                "negative": int(negative),
                "neutral": int(neutral),
                "positive_pct": round((positive / total) * 100, 1),
                "negative_pct": round((negative / total) * 100, 1),
                "neutral_pct": round((neutral / total) * 100, 1)
            })
        
        # Calculate trend direction
        if len(trend_data) >= 2:
            first_month = trend_data[0]["negative_pct"]
            last_month = trend_data[-1]["negative_pct"]
            trend_direction = "improving" if last_month < first_month else "worsening" if last_month > first_month else "stable"
            
            for item in trend_data:
                item["trend"] = trend_direction
        
        return trend_data
    except Exception as e:
        print(f"Trend detection error: {e}")
        return []

def detect_anomalies(df: pd.DataFrame) -> List[Dict]:
    """
    Detect sudden spikes in negative sentiment or complaints
    Uses statistical methods (mean + standard deviation)
    """
    anomalies = []
    
    # Check for cluster anomalies
    if "cluster" in df.columns:
        cluster_negatives = df.groupby("cluster").apply(
            lambda x: (x["sentiment"] == "Negative").sum()
        ).values
        
        if len(cluster_negatives) > 2:
            mean = np.mean(cluster_negatives)
            std = np.std(cluster_negatives)
            threshold = mean + (1.5 * std)
            
            for cluster_id in df["cluster"].unique():
                cluster_df = df[df["cluster"] == cluster_id]
                negative_count = (cluster_df["sentiment"] == "Negative").sum()
                
                if negative_count > threshold:
                    topic = cluster_df.get("topic_name", [f"Topic {cluster_id}"]).iloc[0] if len(cluster_df) > 0 else f"Cluster {cluster_id}"
                    anomalies.append({
                        "type": "cluster_spike",
                        "cluster_id": int(cluster_id),
                        "topic": str(topic),
                        "negative_count": int(negative_count),
                        "expected_max": round(threshold, 1),
                        "severity": "high"
                    })
    
    return anomalies

def auto_label_topics(df: pd.DataFrame, text_col: str) -> Dict[int, str]:
    """
    Automatically generate human-readable topic names using TF-IDF
    This replaces hardcoded complaint categories
    """
    if "cluster" not in df.columns or text_col not in df.columns:
        return {}
    
    topic_names = {}
    vectorizer = TfidfVectorizer(stop_words='english', max_features=100, ngram_range=(1, 2))
    
    for cluster_id in df["cluster"].unique():
        cluster_texts = df[df["cluster"] == cluster_id][text_col].dropna().astype(str)
        
        if len(cluster_texts) == 0:
            topic_names[cluster_id] = f"Topic {cluster_id}"
            continue
        
        try:
            # Get top keywords
            tfidf_matrix = vectorizer.fit_transform(cluster_texts)
            feature_names = vectorizer.get_feature_names_out()
            
            # Get average TF-IDF score per word
            avg_scores = tfidf_matrix.mean(axis=0).A1
            top_indices = avg_scores.argsort()[-3:][::-1]
            top_words = [feature_names[i] for i in top_indices if avg_scores[i] > 0]
            
            if top_words:
                # Create readable topic name
                topic_name = " ".join(top_words[:3]).title()
            else:
                # Fallback: most common words
                all_words = " ".join(cluster_texts).split()
                from collections import Counter
                common = Counter(all_words).most_common(3)
                topic_name = " ".join([word for word, _ in common]).title() if common else f"Topic {cluster_id}"
            
            topic_names[cluster_id] = topic_name[:50]  # Limit length
        except:
            topic_names[cluster_id] = f"Topic {cluster_id}"
    
    return topic_names

def generate_executive_summary(df: pd.DataFrame, root_causes: List[Dict], trends: List[Dict], anomalies: List[Dict]) -> str:
    """
    Generate human-readable executive summary
    This is data-driven, not templated
    """
    total = len(df)
    if total == 0:
        return "No data available for analysis."
    
    positive = (df["sentiment"] == "Positive").sum()
    negative = (df["sentiment"] == "Negative").sum()
    neutral = (df["sentiment"] == "Neutral").sum()
    
    positive_pct = (positive / total) * 100
    negative_pct = (negative / total) * 100
    
    # Determine overall health
    if positive_pct > 60:
        health = "Excellent"
        health_color = "🟢"
    elif positive_pct > 45:
        health = "Good"
        health_color = "🟡"
    elif positive_pct > 30:
        health = "Fair"
        health_color = "🟠"
    else:
        health = "Critical"
        health_color = "🔴"
    
    summary = f"""{health_color} **Overall Health: {health}**

📊 **Key Metrics:**
- Total Reviews: {total:,}
- Positive Sentiment: {positive_pct:.1f}% ({positive:,} reviews)
- Negative Sentiment: {negative_pct:.1f}% ({negative:,} reviews)
- Neutral Sentiment: {(neutral/total)*100:.1f}% ({neutral:,} reviews)

"""
    
    # Add root cause insights
    if root_causes:
        summary += f"""🔍 **Main Issues Identified:**
The top issues driving negative sentiment are:

"""
        for i, cause in enumerate(root_causes[:3], 1):
            summary += f"{i}. **{cause['topic']}** - {cause['negative_percentage']:.0f}% negative rate (impacting {cause['impact_score']:.0f}% of all reviews)\n"
        summary += "\n"
    
    # Add trend insights
    if trends and len(trends) >= 2:
        first = trends[0]["negative_pct"]
        last = trends[-1]["negative_pct"]
        change = last - first
        
        if change < -5:
            summary += f"📈 **Improving Trend:** Negative sentiment decreased by {abs(change):.1f}% over the analysis period.\n\n"
        elif change > 5:
            summary += f"⚠️ **Worsening Trend:** Negative sentiment increased by {change:.1f}%. Immediate attention recommended.\n\n"
        else:
            summary += f"📊 **Stable Trend:** Sentiment remained relatively stable over the analysis period.\n\n"
    
    # Add anomaly insights
    if anomalies:
        summary += f"🚨 **Anomaly Detected:** {len(anomalies)} unusual patterns found in the data.\n\n"
    
    # Add recommendation
    if negative_pct > 30:
        summary += "💡 **Recommendation:** Prioritize addressing the top issue clusters identified above to improve customer satisfaction.\n"
    elif positive_pct > 60:
        summary += "💡 **Recommendation:** Leverage positive feedback in marketing and identify what's working well.\n"
    else:
        summary += "💡 **Recommendation:** Continue monitoring trends and address emerging issues proactively.\n"
    
    return summary

def calculate_sentiment_shift(df: pd.DataFrame, date_col: str = None) -> Dict:
    """
    Calculate sentiment shift between time periods
    """
    if date_col is None:
        date_keywords = ['date', 'timestamp', 'created', 'time', 'datetime']
        for col in df.columns:
            if any(kw in col.lower() for kw in date_keywords):
                date_col = col
                break
    
    if date_col is None or date_col not in df.columns:
        return {"shift_detected": False}
    
    try:
        df_copy = df.copy()
        df_copy[date_col] = pd.to_datetime(df_copy[date_col], errors='coerce')
        df_copy = df_copy.dropna(subset=[date_col])
        
        if len(df_copy) < 2:
            return {"shift_detected": False}
        
        # Split into two halves
        sorted_df = df_copy.sort_values(date_col)
        mid_point = len(sorted_df) // 2
        
        first_half = sorted_df.iloc[:mid_point]
        second_half = sorted_df.iloc[mid_point:]
        
        first_negative_pct = (first_half["sentiment"] == "Negative").sum() / len(first_half) * 100
        second_negative_pct = (second_half["sentiment"] == "Negative").sum() / len(second_half) * 100
        
        shift = second_negative_pct - first_negative_pct
        
        return {
            "shift_detected": True,
            "first_period_negative_pct": round(first_negative_pct, 1),
            "second_period_negative_pct": round(second_negative_pct, 1),
            "shift_percentage": round(shift, 1),
            "direction": "worsening" if shift > 0 else "improving" if shift < 0 else "stable"
        }
    except:
        return {"shift_detected": False}