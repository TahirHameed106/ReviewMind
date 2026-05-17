# ml_service/ingestion/dataset_profiler.py
import pandas as pd
from typing import Dict, Any

class DatasetProfiler:
    @staticmethod
    def profile(df: pd.DataFrame) -> Dict[str, Any]:
        profile = {
            "total_rows": len(df),
            "total_columns": len(df.columns),
            "columns": [],
            "null_percentage": 0,
            "memory_usage_mb": df.memory_usage(deep=True).sum() / (1024 * 1024)
        }
        
        total_nulls = 0
        for col in df.columns:
            col_profile = {
                "name": col,
                "dtype": str(df[col].dtype),
                "null_count": int(df[col].isnull().sum()),
                "null_percentage": round(df[col].isnull().sum() / len(df) * 100, 2) if len(df) > 0 else 0,
                "unique_values": int(df[col].nunique()),
                "sample_values": df[col].dropna().head(5).tolist()
            }
            total_nulls += col_profile["null_count"]
            profile["columns"].append(col_profile)
        
        if len(df) > 0 and len(df.columns) > 0:
            profile["null_percentage"] = round(total_nulls / (len(df.columns) * len(df)) * 100, 2)
        
        return profile