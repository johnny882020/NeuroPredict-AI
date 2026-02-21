FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY neuropredict_ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY neuropredict_ai/core/ core/
COPY neuropredict_ai/main.py .

# Build frontend
COPY neuropredict_ai/frontend/package.json neuropredict_ai/frontend/package-lock.json frontend/
RUN cd frontend && npm ci

COPY neuropredict_ai/frontend/ frontend/
RUN cd frontend && npm run build

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
