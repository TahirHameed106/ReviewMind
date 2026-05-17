# ml_service/models/schemas.py
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from enum import Enum

class Sentiment(str, Enum):
    POSITIVE = "Positive"
    NEUTRAL = "Neutral"
    NEGATIVE = "Negative"

class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"

class ColumnDetection(BaseModel):
    name: str
    detected_type: str
    confidence: ConfidenceLevel
    score: float
    sample_values: List[str] = []

class DatasetProfile(BaseModel):
    total_rows: int
    total_columns: int
    columns: List[Dict[str, Any]]
    null_percentage: float
    memory_usage_mb: float

class ValidationResult(BaseModel):
    is_valid: bool
    errors: List[str]
    warnings: List[str]
    suggestions: List[str]

class NormalizedReview(BaseModel):
    review_text: Optional[str] = None
    rating: Optional[float] = None
    sentiment: Optional[Sentiment] = None
    date: Optional[str] = None
    confidence: float = 0.0

class AnalysisResult(BaseModel):
    success: bool
    pieData: List[Dict[str, Any]]
    metrics: Dict[str, Any]
    complaintCategories: List[Dict[str, Any]]
    validation: ValidationResult
    profile: DatasetProfile
    detections: Dict[str, Any]