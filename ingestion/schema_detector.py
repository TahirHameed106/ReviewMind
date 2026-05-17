# ml_service/ingestion/schema_detector.py
import pandas as pd
from typing import Dict, Any, List
from .value_extractor import ValueExtractor  # ✅ Relative import

class SchemaDetector:
    @staticmethod
    def analyze_value_patterns(values: List[str]) -> Dict[str, float]:
        patterns = {
            "numeric_ratio": 0,
            "sentiment_ratio": 0,
            "rating_ratio": 0,
            "avg_text_length": 0
        }
        
        if not values:
            return patterns
        
        numeric_count = 0
        sentiment_count = 0
        rating_count = 0
        total_length = 0
        
        for val in values:
            if not val:
                continue
            val_str = str(val).strip()
            
            try:
                num = float(val_str)
                numeric_count += 1
                if 1 <= num <= 10:
                    rating_count += 1
            except:
                pass
            
            val_lower = val_str.lower()
            if val_lower in ValueExtractor.SENTIMENT_MAP:
                sentiment_count += 1
            
            total_length += len(val_str)
        
        n = len(values)
        patterns["numeric_ratio"] = numeric_count / n if n > 0 else 0
        patterns["sentiment_ratio"] = sentiment_count / n if n > 0 else 0
        patterns["rating_ratio"] = rating_count / n if n > 0 else 0
        patterns["avg_text_length"] = total_length / n if n > 0 else 0
        
        return patterns
    
    @staticmethod
    def detect_column_type(col_name: str, sample_values: List[str]) -> Dict[str, Any]:
        col_clean = col_name.lower().strip()
        
        type_keywords = {
            "sentiment": ['sentiment', 'label', 'class', 'polarity', 'opinion', 'mood'],
            "rating": ['rating', 'score', 'stars', 'rate', 'points', 'value'],
            "text": ['review', 'text', 'comment', 'feedback', 'description', 'content', 'body']
        }
        
        scores = {"sentiment": 0, "rating": 0, "text": 0}
        
        for dtype, keywords in type_keywords.items():
            for keyword in keywords:
                if keyword in col_clean:
                    scores[dtype] += 0.4
                    break
        
        patterns = SchemaDetector.analyze_value_patterns(sample_values)
        
        scores["sentiment"] += patterns["sentiment_ratio"] * 0.6
        scores["rating"] += patterns["rating_ratio"] * 0.6
        scores["text"] += min(patterns["avg_text_length"] / 100, 1.0) * 0.6
        
        best_type = max(scores, key=scores.get)
        best_score = scores[best_type]
        
        if best_score >= 0.7:
            confidence = "high"
        elif best_score >= 0.5:
            confidence = "medium"
        elif best_score >= 0.3:
            confidence = "low"
        else:
            confidence = "none"
        
        return {
            "name": col_name,
            "detected_type": best_type,
            "confidence": confidence,
            "score": round(best_score, 2)
        }
    
    @staticmethod
    def detect_all_columns(df: pd.DataFrame) -> Dict[str, Any]:
        results = {
            "sentiment_column": None,
            "rating_column": None,
            "text_column": None,
            "all_columns": []
        }
        
        for col in df.columns:
            sample_values = df[col].dropna().head(20).astype(str).tolist()
            detection = SchemaDetector.detect_column_type(col, sample_values)
            
            results["all_columns"].append(detection)
            
            if detection["detected_type"] == "sentiment" and detection["confidence"] != "none":
                if not results["sentiment_column"] or detection["score"] > results["sentiment_column"]["score"]:
                    results["sentiment_column"] = detection
            
            elif detection["detected_type"] == "rating" and detection["confidence"] != "none":
                if not results["rating_column"] or detection["score"] > results["rating_column"]["score"]:
                    results["rating_column"] = detection
            
            elif detection["detected_type"] == "text" and detection["confidence"] != "none":
                if not results["text_column"] or detection["score"] > results["text_column"]["score"]:
                    results["text_column"] = detection
        
        return results