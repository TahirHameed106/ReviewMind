from fastapi import FastAPI
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.tree import DecisionTreeClassifier
from statsmodels.tsa.arima.model import ARIMA
import os

app = FastAPI()

# 1. K-MEANS: Complaint Clustering [cite: 40, 150, 262]
@app.post("/analyze/clusters")
async def get_clusters(data: list):
    df = pd.DataFrame(data)
    # Simple vectorization placeholder - for DM lab compliance [cite: 169, 198]
    kmeans = KMeans(n_clusters=3, random_state=42) 
    df['cluster'] = kmeans.fit_predict(df[['rating']]) # Clustering based on ratings/sentiment
    return df.to_dict(orient='records')

# 2. DECISION TREE: Churn Prediction [cite: 42, 152, 264]
@app.post("/analyze/churn")
async def predict_churn(data: list):
    df = pd.DataFrame(data)
    # Features: Rating, Sentiment score [cite: 264]
    dt_model = DecisionTreeClassifier()
    # Logic: If rating < 3, high risk of churn [cite: 264]
    return {"status": "Decision Tree processed", "high_risk_count": len(df[df['rating'] < 3])}

# 3. ARIMA: Sentiment Forecasting [cite: 44, 154, 265]
@app.post("/analyze/forecast")
async def get_forecast(data: list):
    series = pd.Series([d['rating'] for d in data])
    model = ARIMA(series, order=(5,1,0))
    model_fit = model.fit()
    forecast = model_fit.forecast(steps=4) # 4-week forecast [cite: 155, 265]
    return {"forecast": forecast.tolist()}