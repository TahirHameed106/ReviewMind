# ml_service/ingestion/validation_engine.py
import pandas as pd
from typing import Dict, Any

class ValidationEngine:
    @staticmethod
    def validate(df: pd.DataFrame, detections: Dict[str, Any]) -> Dict[str, Any]:
        errors = []
        warnings = []
        suggestions = []
        
        has_sentiment = detections.get("sentiment_column") is not None
        has_rating = detections.get("rating_column") is not None
        has_text = detections.get("text_column") is not None
        
        if not has_sentiment and not has_rating and not has_text:
            errors.append("No analyzable columns found")
            suggestions.append("Ensure CSV has sentiment labels, ratings, or review text")
        
        if has_sentiment and detections["sentiment_column"]["confidence"] in ["low", "none"]:
            warnings.append(f"Sentiment column '{detections['sentiment_column']['name']}' detected with low confidence")
        
        if has_rating and detections["rating_column"]["confidence"] in ["low", "none"]:
            warnings.append(f"Rating column '{detections['rating_column']['name']}' detected with low confidence")
        
        if len(df) == 0:
            errors.append("Dataset is empty")
        
        if len(df) > 0 and len(df.columns) > 0:
            null_pct = df.isnull().sum().sum() / (len(df.columns) * len(df)) * 100
            if null_pct > 50:
                warnings.append(f"Dataset has {null_pct:.1f}% null values")
        
        return {
            "is_valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
            "suggestions": suggestions
        }