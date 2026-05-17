FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml_service.py .

RUN mkdir -p data

EXPOSE $PORT

CMD ["sh", "-c", "uvicorn ml_service:app --host 0.0.0.0 --port $PORT"]