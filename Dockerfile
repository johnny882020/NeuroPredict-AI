# ── Base: CUDA 12.1 + cuDNN 8 (required for nnU-Net / PyTorch inference) ─────
FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04 AS base

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# System dependencies:
#   dcm2niix  — DICOM→NIfTI conversion (RSNA pipeline Stage 1)
#   gdcm      — DICOM fallback for dcm2niix (gdcmconv --raw)
#   curl      — Node.js installer
#   git       — for submodule clone at build time if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 python3.11-distutils python3-pip \
    dcm2niix \
    libgdcm-dev gdcm-doc \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Make python3.11 the default python
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1 \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1

# Install Node.js 20 for frontend build
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# ── Python dependencies ───────────────────────────────────────────────────────
COPY neuropredict_ai/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── RSNA 2025 vendor submodule ────────────────────────────────────────────────
# The vendor dir is checked in as a git submodule; copy it into the image.
# pip_packages inside the vendor dir are installed separately.
COPY neuropredict_ai/vendor/rsna2025 /app/vendor/rsna2025

# Install RSNA vendor pip_packages if present
RUN if [ -d /app/vendor/rsna2025/pip_packages ]; then \
    pip install --no-cache-dir /app/vendor/rsna2025/pip_packages/*.whl 2>/dev/null || true; \
    fi

# ── nnU-Net environment variables ─────────────────────────────────────────────
# These paths are used by nnU-Net internals for data/preprocessing/results dirs.
# Model weights are mounted at runtime via a volume at /weights.
ENV nnUNet_raw=/workspace/nnUNet_raw
ENV nnUNet_preprocessed=/workspace/nnUNet_preprocessed
ENV nnUNet_results=/weights/nnUNet_results

# PYTHONPATH: allow both the app root and RSNA vendor root to resolve imports
ENV PYTHONPATH=/app:/app/vendor/rsna2025

# ── Backend code ──────────────────────────────────────────────────────────────
COPY neuropredict_ai/core/ core/
COPY neuropredict_ai/main.py .

# ── Frontend build ────────────────────────────────────────────────────────────
COPY neuropredict_ai/frontend/package.json neuropredict_ai/frontend/package-lock.json frontend/
RUN cd frontend && npm ci --production=false

COPY neuropredict_ai/frontend/ frontend/
RUN cd frontend && npm run build

# Remove build artifacts to reduce image size
RUN rm -rf frontend/node_modules frontend/src frontend/package*.json \
    frontend/vite.config.js frontend/eslint.config.js frontend/README.md

EXPOSE 8000

# Weights volume: mount your pretrained checkpoints at /weights at runtime.
# Example: docker run --gpus all -v /local/model_weights:/weights -p 8000:8000 neuropredict-ai
VOLUME ["/weights"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
