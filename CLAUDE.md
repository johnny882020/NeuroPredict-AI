# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NeuroPredict AI is a medical AI platform for intracranial aneurysm rupture risk prediction and treatment simulation. It combines a Python/FastAPI backend with a React frontend. The core analysis pipeline is powered by the **RSNA 2025 1st place solution** (AUC 0.916) for CTA scan analysis. The platform implements evidence-based clinical scoring (PHASES, UIATS) with a doctor-in-the-loop decision workflow.

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

# Run all tests (72 tests)
cd neuropredict_ai
pytest

# Run a single test file
pytest tests/test_risk_model.py
pytest tests/test_marta_score.py
pytest tests/test_api.py

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
npx vitest run     # Run all tests (24 tests)
npx vitest run src/App.test.jsx                        # App + tab navigation tests
npx vitest run src/components/ClinicalForm.test.jsx    # ClinicalForm component tests
npx vitest run src/components/ClinicalDecision.test.jsx # Decision workflow tests
```

### Docker

```bash
# CPU-only deployment (Render free tier) — lightweight multi-stage build
docker build -t neuropredict-ai .
docker run -p 8000:8000 neuropredict-ai

# GPU deployment (RunPod / Modal.com) — nvidia/cuda base
docker build -f Dockerfile.gpu -t neuropredict-ai-gpu .
docker run --gpus all -v /local/model_weights:/weights -p 8000:8000 neuropredict-ai-gpu
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

The FastAPI app in `main.py` runs as a single process serving both the API and the built frontend static files.

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
- `POST /predict_risk` — `core/risk_model.py`: PHASES + UIATS scoring + synthesis recommendation; accepts optional query params `rsna_probability`, `marta_evt_pct`, `marta_nt_pct`
- `POST /marta_assessment` — `core/marta_score.py`: MARTA-EVT and MARTA-NT logistic models
- `POST /simulate_treatment` — `core/hemodynamics.py`: post-treatment hemodynamic simulation (types: `flow_diverter`, `surgical_clip`)

**`POST /predict_risk` response schema:**
```json
{
  "phases": {
    "phases_score": 6,
    "five_year_rupture_risk_pct": 1.7,
    "risk_tier": "Intermediate",
    "evidence_level": "A",
    "citation": "Greving et al., Lancet Neurol 2014"
  },
  "uiats": {
    "net_score": 5,
    "treatment_score": 6,
    "conservative_score": 1,
    "recommendation": "Treatment recommended",
    "breakdown": {...},
    "evidence_level": "B"
  },
  "synthesis": {
    "recommendation": "Treatment — Endovascular (EVT)",
    "strength": "Strong",
    "rationale": ["PHASES 5-yr risk: 1.7% (Intermediate)", "UIATS net: +5 — Treatment recommended"],
    "preferred_modality": "EVT",
    "evidence_level": "B",
    "disclaimer": "For clinical decision support only. Physician judgment supersedes all recommendations."
  },
  "ai_rupture_probability": 0.42,
  "probability_source": "heuristic"
}
```

**`core/risk_model.py` — module-level functions (not class singletons):**
- `calculate_phases_score(clinical: dict) -> dict` — PHASES scoring (Evidence A, Greving 2014)
- `calculate_uiats_score(clinical: dict, morph: dict) -> dict` — UIATS two-column scoring (Evidence B, Etminan 2015)
- `synthesize_recommendation(phases, uiats, marta_evt_pct, marta_nt_pct, rsna_probability) -> dict`
- `heuristic_rupture_probability(clinical: dict, morph: dict) -> float`

**Key design decisions:**
- RSNA pipeline falls back gracefully when `VESSEL_NNUNET_MODEL_DIR` is unset (returns 0.1 probability, `pipeline: "unavailable"`). All other endpoints continue working.
- Upload formats: `.zip` (DICOM series) or `.nii.gz` / `.nii` (NIfTI volume)
- Version: `2.1.0`

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

**Default `activeTab` is `'analysis'`** (CTA Analysis tab renders on load).

**5-tab navigation:**
1. `'dicom'` — DICOM View: Cornerstone.js multi-planar DICOM viewer
2. `'analysis'` — CTA Analysis: file upload, AI detection banner, morphology metrics, 3D viewer
3. `'risk'` — Risk & Clinical: `ClinicalForm` + `ClinicalDecision` panel
4. `'marta'` — MARTA Assessment: `MARTAForm` with EVT/NT risk output
5. `'treatment'` — Treatment Sim: hemodynamic simulation controls (gated: requires scanData)

**Key components:**
- `src/api.js` — all API calls via axios; uses `VITE_API_URL` env var (defaults to same-origin)
- `src/components/DicomViewer.jsx` — Cornerstone.js DICOM viewer (`React.lazy()`), multi-planar (axial/coronal/sagittal), windowing presets
- `src/components/Viewer3D.jsx` — 3D mesh rendering with VTK.js (`@kitware/vtk.js`)
- `src/components/ClinicalForm.jsx` — PHASES + UIATS input fields; pre-fills `aneurysm_size_mm` from `scanData.morphology.maximum_3d_diameter_mm`
- `src/components/ClinicalDecision.jsx` — Doctor-in-the-loop: Accept / Modify / Override with reason; returns `null` when `synthesis` prop is null
- `src/components/MARTAForm.jsx` — full MARTA assessment form

The frontend is built and served as static files by FastAPI from `frontend/dist/`. API routes in `main.py` must be declared before the catch-all frontend route.

**Bundle splitting (code splitting via dynamic import):**
| Chunk | Size (gzip) | Purpose |
|-------|------------|---------|
| vtk | ~102 KB | 3D mesh rendering |
| cornerstone-loader | ~73 KB | DICOM file loading |
| cornerstone | ~859 KB | DICOM viewing engine |

**Treatment Sim tab gating:** Without `scanData`, the tab shows "Analyze a CTA scan first to enable treatment simulation" instead of treatment buttons.

### Vendor Submodule (`neuropredict_ai/vendor/rsna2025/`)

The RSNA 2025 1st place repository (github.com/uchiyama33/rsna2025_1st_place) is included as a git submodule. Key files:
- `scripts/rsna_submission_roi.py` — `predict(series_path)` entry point
- `src/data/components/aneurysm_vessel_seg_dataset.py` — `ANEURYSM_CLASSES` (13 locations + "Aneurysm Present")

Initialize with: `git submodule update --init --recursive`

### Deployment

| Target | Dockerfile | Notes |
|--------|-----------|-------|
| Render (free) | `Dockerfile` | CPU-only, RSNA pipeline disabled |
| RunPod / Modal | `Dockerfile.gpu` | CUDA 12.1, GPU required, mount weights at `/weights` |

Health check: `GET /health` → `{"status": "healthy", "rsna_pipeline": "ready"|"weights_required"}`

## Test Suite

**Backend (72 tests):**
- `tests/test_risk_model.py` — 34 tests: PHASES scoring, UIATS scoring, synthesis, heuristic probability
- `tests/test_api.py` — 9 tests: all endpoints with schema validation and edge cases
- `tests/test_marta_score.py` — MARTA-EVT and MARTA-NT logistic model tests
- `tests/test_hemodynamics.py` — hemodynamic simulation and mesh generation tests

**Frontend (24 tests, Vitest + React Testing Library):**
- `src/App.test.jsx` — 8 tests: tab navigation, ClinicalForm display, treatment gating, DICOM placeholder
- `src/components/ClinicalDecision.test.jsx` — 9 tests: accept/override workflow, null synthesis
- `src/components/ClinicalForm.test.jsx` — 7 tests: field rendering, scanData pre-fill, submit

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
- **5-tab navigation** — DICOM View / CTA Analysis / Risk & Clinical / MARTA Assessment / Treatment Sim
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
