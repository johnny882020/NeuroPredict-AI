# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroPredict AI is a medical AI platform for intracranial aneurysm rupture risk prediction and treatment simulation. It combines a Python/FastAPI backend with a React frontend. The core analysis pipeline is powered by the **RSNA 2025 1st place solution** (AUC 0.916) for CTA scan analysis.

## Commands

### Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Run the backend API (from neuropredict_ai/)
cd neuropredict_ai
python main.py
# or
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Run all tests
cd neuropredict_ai
pytest

# Run a single test file
pytest tests/test_marta_score.py

# Run a single test
pytest tests/test_api.py::test_health_check

# Lint (ruff)
ruff check .
ruff format .
```

### Frontend

```bash
cd neuropredict_ai/frontend

npm install
npm run dev        # Dev server (Vite)
npm run build      # Build to dist/
npm run lint       # ESLint
npx vitest         # Run tests
npx vitest run src/App.test.jsx  # Run single test file
```

### Docker

```bash
# GPU deployment (RunPod / Modal.com) — nvidia/cuda base
docker build -t neuropredict-ai .
docker run --gpus all -v /local/model_weights:/weights -p 8000:8000 neuropredict-ai

# CPU-only deployment (Render free tier)
docker build -f Dockerfile.render -t neuropredict-ai-render .
docker run -p 8000:8000 neuropredict-ai-render
```

### Download RSNA Weights (requires Kaggle account)

```bash
pip install kaggle
# Place ~/.kaggle/kaggle.json with your API credentials
python scripts/download_weights.py
```

### GPU Cloud Deployment (Modal.com)

```bash
pip install modal
modal deploy deploy/modal_app.py
```

## Architecture

### Backend (`neuropredict_ai/`)

The FastAPI app in `main.py` runs as a single process serving both the API and the built frontend static files. All core modules use singleton instances exported at module level.

**Pipeline flow for `POST /analyze_and_mesh`:**
1. `core/data_loader.py` — detects format (.zip DICOM or .nii.gz NIfTI) and extracts/loads scan
2. `core/segmentation.py` — thin shim delegating to `core/rsna_pipeline.py`
3. `core/rsna_pipeline.py` — **RSNA 2025 1st place adapter** (AUC 0.916): 3-stage pipeline
   - Stage 1: Coarse vessel localization (nnU-Net, 1.0mm isotropic, DBSCAN ROI crop)
   - Stage 2: Fine vessel segmentation (nnU-Net ResEncUNet, 0.45mm, 13 locations)
   - Stage 3: ROI classification (128×256×256 input, Location-Aware Transformer, 4-fold ensemble)
4. `core/extract_features.py` — extracts morphological features from vessel mask
5. `core/hemodynamics.py` — generates 3D mesh (marching cubes) and simulates hemodynamics (WSS, OSI)

**Other endpoints:**
- `POST /predict_risk` — `core/risk_model.py`: UIATS score + heuristic ML; accepts optional `?rsna_probability=` query param to incorporate RSNA result
- `POST /marta_assessment` — `core/marta_score.py`: MARTA-EVT and MARTA-NT logistic models
- `POST /simulate_treatment` — `core/hemodynamics.py`: post-treatment hemodynamic simulation (types: `flow_diverter`, `surgical_clip`)

**Key design decisions:**
- RSNA pipeline falls back gracefully when `VESSEL_NNUNET_MODEL_DIR` is unset (returns 0.1 probability, `pipeline: "unavailable"`). All other endpoints continue working.
- Upload formats: `.zip` (DICOM series) or `.nii.gz` / `.nii` (NIfTI volume)
- All core classes are module-level singletons: `uiats_calc`, `ml_predictor`, `marta_calc`, `hemodynamics_sim`, `segmentation_model`, `rsna_pipeline`
- Version: `2.0.0`

**RSNA pipeline environment variables** (set to enable GPU inference):
```
VESSEL_NNUNET_MODEL_DIR=./model_weights/nnUNet_results/Dataset001_VesselSegmentation/...
VESSEL_NNUNET_SPARSE_MODEL_DIR=./model_weights/nnUNet_results/Dataset003_VesselGrouping/...
ROI_EXPERIMENTS=251013-seg_tf-v4-nnunet_truncate1_preV6_1-ex_dav6w3-m32g64-e25-w01_005_1-s128_256_256
ROI_FOLDS=0,1,3,4
ROI_TTA=2
ROI_CKPT=last
nnUNet_results=./model_weights/nnUNet_results
```
See `.env.example` for the full list.

### Frontend (`neuropredict_ai/frontend/`)

React 19 + Vite app. No state management library — uses `useState` hooks in `App.jsx`.

- `src/api.js` — all API calls via axios; uses `VITE_API_URL` env var (defaults to same-origin)
- `src/components/Viewer3D.jsx` — 3D mesh rendering with VTK.js (`@kitware/vtk.js`)
- `src/components/ClinicalForm.jsx` — clinical data input for UIATS/ML risk
- `src/components/MARTAForm.jsx` — full MARTA assessment form

The frontend is built and served as static files by FastAPI from `frontend/dist/`. API routes in `main.py` must be declared before the catch-all frontend route.

**New UI features (v2.0.0):**
- AI Detection Banner: shows `aneurysm_probability` as %, color-coded bar, top-5 location probabilities
- File input accepts `.zip`, `.nii`, `.nii.gz` only
- RSNA probability fed into risk prediction automatically

### Vendor Submodule (`neuropredict_ai/vendor/rsna2025/`)

The RSNA 2025 1st place repository (github.com/uchiyama33/rsna2025_1st_place) is included as a git submodule. Key files:
- `scripts/rsna_submission_roi.py` — `predict(series_path)` entry point
- `src/data/components/aneurysm_vessel_seg_dataset.py` — `ANEURYSM_CLASSES` (13 locations + "Aneurysm Present")

Initialize with: `git submodule update --init --recursive`

### Deployment

| Target | Dockerfile | Notes |
|--------|-----------|-------|
| Render (free) | `Dockerfile.render` | CPU-only, RSNA pipeline disabled |
| RunPod / Modal | `Dockerfile` | CUDA 12.1, GPU required, mount weights at `/weights` |

Health check: `GET /health` → `{"status": "healthy", "rsna_pipeline": "ready"|"weights_required"}`

## Frontend Design System

The UI follows a **dark medical workstation** aesthetic (PACS-style, inspired by professional AI radiology platforms like Aidoc and Viz.ai).

### Color Tokens (`src/App.jsx` — `T` object)

| Token | Value | Usage |
|-------|-------|-------|
| `T.bg` | `#080c14` | Page background |
| `T.surface` | `#0e1420` | Input backgrounds, nested surfaces |
| `T.panel` | `#141b2d` | Card/panel backgrounds |
| `T.border` | `#1e2d48` | Panel borders |
| `T.textPri` | `#e8edf5` | Primary text |
| `T.textSec` | `#5d7a9e` | Secondary/label text |
| `T.cyan` | `#06b6d4` | Section titles, interactive accents |
| `T.orange` | `#f97316` | Critical findings, high probability alerts |
| `T.green` | `#10b981` | Normal/negative findings |
| `T.red` | `#ef4444` | High-risk indicators |
| `T.purple` | `#a855f7` | Treatment/EVT device highlights |
| `T.blue` | `#3b82f6` | Location probability bars |

### Layout

- **Sticky dark header** — logo, tab navigation, pipeline status badge
- **Tab-based navigation** — CTA Analysis / Risk & Clinical / MARTA Assessment / Treatment Sim
- **Two-column grid** — left sidebar (controls/metrics) + right main panel (3D viewer, results)
- **Consistent panel style** — `panelStyle` object: `background: T.panel, border: 1px solid T.border, borderRadius: 8`

### Design Rules

- No white backgrounds anywhere — use `T.surface` or `T.panel` only
- Section titles use `T.cyan` with uppercase tracking (via `SectionHeader` component)
- Critical findings (aneurysm detected, high WSS) use `T.orange` with `T.orangeDim` background
- Probability bars: highest location uses `T.orange`, others use `T.blue`; relative width scaled to max
- Buttons: gradient fills (`T.cyan → T.blue`) for primary actions; transparent with border for secondary
- `Dot` component for status indicators with CSS `box-shadow` glow effect
- All metric values use `MetricPill` component with optional `accent` color override

## Coding Standards

- Type hints required on all Python function signatures
- Pydantic models for all API request/response schemas
- All FastAPI endpoints `async def` by default
- Absolute imports; group as stdlib / third-party / local
- API versioning: `/api/v1/...` (not yet applied — current routes are unversioned)
- Error format: `{"detail": "...", "code": "ERROR_CODE"}`

## Git Workflow

- Feature branches from `master` using worktrees: `claude --worktree <feature-name>`
- Branch naming: `feature-*`, `bugfix-*`, `refactor-*`, `docs-*`, `test-*`
