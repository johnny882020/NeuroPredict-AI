# NeuroPredict AI

**Medical AI platform for intracranial aneurysm rupture risk prediction and treatment simulation.**

Powered by the **RSNA 2025 Intracranial Aneurysm Detection 1st place solution** (AUC 0.916) for real CTA scan analysis.

---

## Features

- **AI CTA Analysis** — RSNA 2025 three-stage nnU-Net pipeline: vessel segmentation → ROI classification → 13-location aneurysm probability
- **Risk Prediction** — UIATS scoring + ML rupture probability incorporating RSNA AI result
- **MARTA Assessment** — MARTA-EVT / MARTA-NT complication risk for endovascular vs neurosurgical treatment
- **3D Visualization** — Interactive mesh rendering of vessel anatomy via VTK.js
- **Hemodynamic Simulation** — WSS, OSI analysis with post-treatment flow modeling
- **Upload Formats** — `.zip` (DICOM series) or `.nii.gz` / `.nii` (NIfTI volume)

---

## Quick Start (CPU / Render)

```bash
git clone --recurse-submodules https://github.com/<your-repo>/neuropredict-ai.git
cd neuropredict-ai/neuropredict_ai

pip install fastapi uvicorn[standard] python-multipart pydantic numpy nibabel pydicom scikit-image trimesh scipy polars httpx

# Build frontend
cd frontend && npm install && npm run build && cd ..

# Run
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000`. The RSNA pipeline runs in fallback mode (returns 0.1 probability) without GPU weights.

---

## GPU Inference (Full AUC 0.916)

### 1. Requirements

- NVIDIA GPU (T4 or better)
- CUDA 12.1 + cuDNN 8
- Python 3.11, `dcm2niix` system binary

### 2. Install full dependencies

```bash
pip install -r neuropredict_ai/requirements.txt
```

### 3. Download pretrained weights

```bash
pip install kaggle
# Place ~/.kaggle/kaggle.json with your API credentials
python scripts/download_weights.py
```

Expected weight directory layout:
```
neuropredict_ai/model_weights/
  nnUNet_results/
    Dataset001_VesselSegmentation/
      RSNA2025Trainer_moreDAv6_1_SkeletonRecallTverskyBeta07__nnUNetResEncUNetMPlans__3d_fullres/
        fold_0/ ... fold_4/
    Dataset003_VesselGrouping/
      RSNA2025Trainer_moreDAv7__nnUNetResEncUNetMPlans__3d_fullres/
  roi_classifier/
    251013-seg_tf-v4-nnunet_truncate1_preV6_1-ex_dav6w3-m32g64-e25-w01_005_1-s128_256_256/
      fold0/checkpoints/last.ckpt ... fold4/
```

### 4. Configure environment

Copy `.env.example` to `.env` and set paths:

```bash
cp .env.example .env
# Edit VESSEL_NNUNET_MODEL_DIR, ROI_EXPERIMENTS etc.
```

### 5. Run with GPU

```bash
cd neuropredict_ai
uvicorn main:app --host 0.0.0.0 --port 8000
```

---

## Docker

### GPU deployment (RunPod / Modal.com)

```bash
docker build -t neuropredict-ai .
docker run --gpus all \
  -v /local/model_weights:/weights \
  -p 8000:8000 \
  neuropredict-ai
```

### CPU deployment (Render free tier)

```bash
docker build -f Dockerfile.render -t neuropredict-ai-render .
docker run -p 8000:8000 neuropredict-ai-render
```

### Modal.com (serverless GPU, pay-per-second)

```bash
pip install modal
modal deploy deploy/modal_app.py
# Upload weights:
modal volume put neuropredict-weights ./neuropredict_ai/model_weights /
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health + pipeline status |
| `POST` | `/analyze_and_mesh` | Full CTA analysis (upload `.zip` or `.nii.gz`) |
| `POST` | `/predict_risk` | UIATS + ML rupture risk |
| `POST` | `/marta_assessment` | MARTA-EVT / MARTA-NT complication risk |
| `POST` | `/simulate_treatment` | Post-treatment hemodynamic simulation |

### Example: Analyze a scan

```bash
curl -X POST http://localhost:8000/analyze_and_mesh \
  -F "file=@scan.zip" | python -m json.tool
```

Response includes:
```json
{
  "aneurysm_probability": 0.87,
  "aneurysm_detected": true,
  "location_probabilities": {"Left Middle Cerebral Artery": 0.82, ...},
  "top_location": "Left Middle Cerebral Artery",
  "pipeline": "rsna_2025",
  "morphology": {...},
  "mesh": {...},
  "baseline_hemodynamics": {...}
}
```

---

## Architecture

```
neuropredict_ai/
  main.py                   # FastAPI app, all endpoints
  core/
    rsna_pipeline.py        # RSNA 2025 adapter singleton (AUC 0.916)
    data_loader.py          # DICOM ZIP + NIfTI loader
    segmentation.py         # Thin shim → rsna_pipeline
    extract_features.py     # Morphological feature extraction
    hemodynamics.py         # 3D mesh + CFD simulation
    risk_model.py           # UIATS score + ML predictor
    marta_score.py          # MARTA-EVT / MARTA-NT models
  vendor/rsna2025/          # Git submodule: RSNA 2025 1st place repo
  frontend/                 # React 19 + Vite + VTK.js

Dockerfile                  # GPU build (nvidia/cuda:12.1.1)
Dockerfile.render           # CPU build (python:3.11-slim, for Render)
render.yaml                 # Render deployment config
deploy/modal_app.py         # Modal.com serverless deployment
scripts/download_weights.py # Kaggle weight downloader
.env.example                # All RSNA environment variables documented
```

---

## Development

```bash
# Backend tests
cd neuropredict_ai && pytest

# Frontend tests
cd neuropredict_ai/frontend && npx vitest run

# Lint
ruff check neuropredict_ai/
```

---

## Credits

- **RSNA 2025 Pipeline**: [uchiyama33/rsna2025_1st_place](https://github.com/uchiyama33/rsna2025_1st_place) — AUC 0.916 intracranial aneurysm detection
- **MARTA Score**: Based on published odds ratios from PMC6439725
- **UIATS**: Unruptured Intracranial Aneurysm Treatment Score
