FROM python:3.11-slim AS base

WORKDIR /app

# Install system dependencies (curl for Node.js setup)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (lightweight — no PyTorch/MONAI)
COPY neuropredict_ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY neuropredict_ai/core/ core/
COPY neuropredict_ai/main.py .

# Build frontend
COPY neuropredict_ai/frontend/package.json neuropredict_ai/frontend/package-lock.json frontend/
RUN cd frontend && npm ci --production=false

COPY neuropredict_ai/frontend/ frontend/
RUN cd frontend && npm run build

# Clean up Node.js build artifacts to reduce image size
RUN rm -rf frontend/node_modules frontend/src frontend/package*.json \
    frontend/vite.config.js frontend/eslint.config.js frontend/README.md

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
