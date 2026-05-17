# ml_service/ingestion/normalizer.py
import pandas as pd
from typing import Dict, Any, List
from .value_extractor import ValueExtractor  # ✅ Relative import
from models.schemas import NormalizedReview, Sentiment  # ✅ Relative to package

class DataNormalizer:
    @staticmethod
    def normalize_row(row: Dict[str, Any], detections: Dict[str, Any]) -> NormalizedReview:
        review = NormalizedReview()
        confidences = []
        
        if detections.get("sentiment_column"):
            col = detections["sentiment_column"]["name"]
            val = row.get(col)
            sentiment, conf = ValueExtractor.extract_sentiment(val)
            if sentiment:
                review.sentiment = Sentiment(sentiment)
                confidences.append(conf)
        
        if detections.get("rating_column"):
            col = detections["rating_column"]["name"]
            val = row.get(col)
            rating, conf = ValueExtractor.extract_rating(val)
            if rating is not None:
                review.rating = rating
                confidences.append(conf)
                
                if not review.sentiment:
                    if rating >= 4:
                        review.sentiment = Sentiment.POSITIVE
                    elif rating >= 2.5:
                        review.sentiment = Sentiment.NEUTRAL
                    else:
                        review.sentiment = Sentiment.NEGATIVE
        
        if detections.get("text_column"):
            col = detections["text_column"]["name"]
            val = row.get(col)
            if val and isinstance(val, str):
                review.review_text = val[:1000]
        
        if confidences:
            review.confidence = sum(confidences) / len(confidences)
        
        return review
    
    @staticmethod
    def normalize_dataset(df: pd.DataFrame, detections: Dict[str, Any]) -> List[NormalizedReview]:
        normalized_reviews = []
        records = df.to_dict(orient='records')
        
        for record in records:
            review = DataNormalizer.normalize_row(record, detections)
            normalized_reviews.append(review)
        
        return normalized_reviews