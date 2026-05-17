# ml_service/ingestion/value_extractor.py
import pandas as pd
import re
from typing import Optional, Tuple

class ValueExtractor:
    SENTIMENT_MAP = {
        'positive': 'Positive', 'pos': 'Positive', 'good': 'Positive',
        'excellent': 'Positive', 'great': 'Positive', 'amazing': 'Positive',
        'love': 'Positive', 'perfect': 'Positive', 'awesome': 'Positive',
        'negative': 'Negative', 'neg': 'Negative', 'bad': 'Negative',
        'poor': 'Negative', 'terrible': 'Negative', 'hate': 'Negative',
        'awful': 'Negative', 'horrible': 'Negative', 'worst': 'Negative',
        'neutral': 'Neutral', 'neu': 'Neutral', 'okay': 'Neutral',
        'average': 'Neutral', 'fine': 'Neutral', 'normal': 'Neutral'
    }
    
    @classmethod
    def extract_sentiment(cls, value) -> Tuple[Optional[str], float]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None, 0.0
        
        val_str = str(value).lower().strip()
        
        if val_str in cls.SENTIMENT_MAP:
            return cls.SENTIMENT_MAP[val_str], 0.95
        
        if any(w in val_str for w in ['positive', 'good', 'excellent', 'great', 'amazing', 'love']):
            return 'Positive', 0.8
        if any(w in val_str for w in ['negative', 'bad', 'poor', 'terrible', 'hate', 'awful']):
            return 'Negative', 0.8
        if any(w in val_str for w in ['neutral', 'okay', 'average', 'fine']):
            return 'Neutral', 0.7
        
        return None, 0.0
    
    @classmethod
    def extract_rating(cls, value) -> Tuple[Optional[float], float]:
        if value is None or (isinstance(value, float) and pd.isna(value)):
            return None, 0.0
        
        val_str = str(value).strip()
        
        try:
            num = float(val_str)
            if 1 <= num <= 5:
                return num, 0.95
            if 1 <= num <= 10:
                return num / 2, 0.8
        except:
            pass
        
        match = re.search(r'(\d+\.?\d*)\s*/\s*(\d+)', val_str)
        if match:
            num, denom = float(match.group(1)), float(match.group(2))
            rating = (num / denom) * 5
            if 1 <= rating <= 5:
                return rating, 0.85
        
        match = re.search(r'(\d+\.?\d*)', val_str)
        if match:
            num = float(match.group(1))
            if 1 <= num <= 5:
                return num, 0.7
            if 1 <= num <= 10:
                return num / 2, 0.6
        
        star_count = val_str.count('★') + val_str.count('*')
        if star_count > 0:
            return float(min(star_count, 5)), 0.85
        
        return None, 0.0