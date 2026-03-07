# ── Stage 1: Build frontend ───────────────────────────────────────────────────
# Use the official Node image (has enough memory for VTK.js)
FROM node:20-slim AS frontend-build
WORKDIR /frontend

COPY neuropredict_ai/frontend/package.json neuropredict_ai/frontend/package-lock.json ./
RUN npm ci --production=false

COPY neuropredict_ai/frontend/ ./
RUN NODE_OPTIONS="--max-old-space-size=1536" npm run build

# ── Stage 2: Python runtime ───────────────────────────────────────────────────
# CPU-only, no CUDA. RSNA pipeline falls back gracefully (no GPU/weights).
FROM python:3.11-slim AS runtime

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Build tools required for scikit-image / scipy C extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Python dependencies (CPU-only subset — no torch/nnunet/cuda)
RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    python-multipart \
    pydantic \
    numpy \
    nibabel \
    pydicom \
    scikit-image \
    trimesh \
    scipy \
    polars \
    httpx \
    aiofiles

# Backend source
COPY neuropredict_ai/core/ core/
COPY neuropredict_ai/main.py .

# Copy only the built frontend dist (not node_modules)
COPY --from=frontend-build /frontend/dist ./frontend/dist

EXPOSE 8000

# RSNA pipeline disabled on Render (no GPU/weights).
# UIATS, MARTA, hemodynamics, and 3D mesh all work normally.
ENV VESSEL_NNUNET_MODEL_DIR=""

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
