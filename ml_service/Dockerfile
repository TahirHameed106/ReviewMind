FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml_service.py .
RUN mkdir -p data

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "ml_service:app", "--host", "0.0.0.0", "--port", "8000"]