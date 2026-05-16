FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download TextBlob corpora
RUN python -m textblob.download_corpora

# Copy application code
COPY . .

EXPOSE 8000

CMD ["python", "main.py"]