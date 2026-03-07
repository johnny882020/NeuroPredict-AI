# NeuroPredict AI

> **Precision Prediction. Dynamic Intervention.**
> A clinical decision support platform for intracranial aneurysm rupture risk assessment and treatment planning.

[![Python](https://img.shields.io/badge/Python-3.11-blue)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-19-61dafb)](https://react.dev)
[![RSNA 2025](https://img.shields.io/badge/RSNA%202025-AUC%200.916-orange)](#rsna-2025-pipeline)
[![Tests](https://img.shields.io/badge/Tests-72%20backend%20%7C%2024%20frontend-brightgreen)](#testing)

---

> **For research and clinical decision support only. Not validated as a standalone diagnostic tool. Physician judgment supersedes all system outputs.**

---

## Overview

NeuroPredict AI integrates a real-time CTA analysis pipeline with validated clinical scoring algorithms, giving neurosurgeons and interventional neuroradiologists a structured, evidence-graded view of aneurysm rupture risk and treatment options in a single clinical workstation UI.

| Capability | Technology | Evidence Level |
|------------|-----------|---------------|
| CTA scan analysis — 13-location aneurysm detection | RSNA 2025 1st place nnU-Net pipeline | AUC 0.916 |
| 5-year rupture risk (PHASES score) | Greving et al., *Lancet Neurol* 2014 | A |
| Treatment decision score (UIATS) | Etminan et al., *Lancet* 2015 | B |
| Procedural risk (MARTA score) | Logistic model, PMC6439725 | B |
| Multi-planar DICOM viewer | Cornerstone.js (Axial/Sagittal/Coronal) | — |
| 3D vessel morphology + hemodynamics | Marching cubes + WSS/OSI proxy | Computational |
| Doctor-in-the-loop workflow | Accept / Modify / Override + audit trail | — |

---

## Clinical Workflow

```
Upload CTA scan (.zip DICOM or .nii.gz NIfTI)
        |
        v
  RSNA 2025 Pipeline ─────────── Aneurysm probability (AUC 0.916)
  (3-stage nnU-Net)               13-location classification
        |
        v
  Morphology + Hemodynamics ─── Diameter, AR, SR, WSS, OSI
        |
        v
  Clinical Form Input ─────────── Age, history, aneurysm profile
        |
        v
  +─────────────────────────────────────────+
  |  PHASES Score  (Evidence A)             |  5-year absolute rupture risk %
  |  UIATS Score   (Evidence B)             |  Treatment vs conservative points
  |  MARTA Score   (Evidence B)             |  EVT/NT complication probability
  |  AI Probability (RSNA 2025, AUC 0.916) |  Neural network detection score
  +─────────────────────────────────────────+
        |
        v
  Synthesis Recommendation ────── Strong / Moderate / Weak
  + Preferred Modality             EVT vs NT (MARTA-guided)
        |
        v
  Physician Decision ────────────── Accept / Modify / Override
  (audit trail)                     Clinical reason required for override
```

---

## Quick Start

### Local Development (CPU, fallback mode)

```bash
git clone --recurse-submodules https://github.com/johnny882020/NeuroPredict-AI.git
cd NeuroPredict-AI

# Backend
pip install -r requirements.txt

# Frontend (built once, served by FastAPI)
cd neuropredict_ai/frontend
npm install && npm run build
cd ..

# Start server
cd neuropredict_ai
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Open [http://localhost:8000](http://localhost:8000).

> Without GPU weights the RSNA pipeline runs in **fallback mode** (placeholder 0.1 probability). PHASES, UIATS, MARTA, hemodynamics, and the DICOM viewer all work fully without weights.

### Docker — CPU (Render free tier)

```bash
docker build -f Dockerfile.render -t neuropredict-ai .
docker run -p 8000:8000 neuropredict-ai
```

### Docker — GPU (RunPod / Lambda Labs)

```bash
docker build -t neuropredict-ai-gpu .
docker run --gpus all -v /your/model_weights:/weights -p 8000:8000 neuropredict-ai-gpu
```

### Modal.com (Serverless GPU)

```bash
pip install modal
modal deploy deploy/modal_app.py
modal volume put neuropredict-weights ./neuropredict_ai/model_weights /
```

---

## GPU Inference Setup (Full AUC 0.916)

### Requirements

- NVIDIA GPU (T4 or better), CUDA 12.1
- Python 3.11, `dcm2niix` system binary

### 1. Download Weights

```bash
pip install kaggle
# Place ~/.kaggle/kaggle.json with your credentials
python scripts/download_weights.py
```

Expected layout:
```
neuropredict_ai/model_weights/
  nnUNet_results/
    Dataset001_VesselSegmentation/       # Stage 1: coarse vessel localization
    Dataset003_VesselGrouping/           # Stage 2: fine vessel segmentation (13 locations)
  roi_classifier/
    251013-seg_tf-v4-.../fold0-fold4/   # Stage 3: Location-Aware Transformer (4-fold)
```

### 2. Configure Environment

```bash
cp .env.example .env
# Set VESSEL_NNUNET_MODEL_DIR, ROI_EXPERIMENTS, ROI_FOLDS, nnUNet_results
```

---

## API Reference

### `GET /health`

```json
{"status": "healthy", "rsna_pipeline": "ready | weights_required"}
```

### `POST /analyze_and_mesh`

Upload `.zip` (DICOM series) or `.nii.gz` / `.nii` (NIfTI).

```bash
curl -X POST http://localhost:8000/analyze_and_mesh -F "file=@brain_cta.zip"
```

Response:
```json
{
  "aneurysm_detected": true,
  "aneurysm_probability": 0.87,
  "location_probabilities": {"Left Middle Cerebral Artery": 0.82, "Right ICA": 0.11},
  "top_location": "Left Middle Cerebral Artery",
  "pipeline": "rsna_2025",
  "morphology": {
    "maximum_3d_diameter_mm": 8.5,
    "aspect_ratio_AR": 1.7,
    "size_ratio_SR": 2.1,
    "is_irregular": true
  },
  "mesh": {"vertices": [...], "faces": [...], "surface_area_mm2": 142.3, "volume_mm3": 89.6},
  "baseline_hemodynamics": {"mean_wss_pa": 3.2, "mean_osi": 0.18, "flow_status": "turbulent"}
}
```

### `POST /predict_risk`

Body (`clinical` + `morph`) + optional query params `rsna_probability`, `marta_evt_pct`, `marta_nt_pct`.

```json
{
  "clinical": {
    "age": 65, "smoking": false, "hypertension": true,
    "previous_sah": false, "familial_sah": false,
    "population": "other",
    "earlier_sah_different_aneurysm": false,
    "aneurysm_site": "MCA",
    "aneurysm_size_mm": 8.5,
    "multiple_aneurysms": false,
    "high_risk_location": false
  },
  "morph": {
    "maximum_3d_diameter_mm": 8.5,
    "aspect_ratio_AR": 1.7,
    "size_ratio_SR": 2.0,
    "is_irregular": true
  }
}
```

Response:
```json
{
  "phases": {
    "phases_score": 6,
    "five_year_rupture_risk_pct": 1.7,
    "risk_tier": "Moderate",
    "evidence_level": "A",
    "citation": "Greving et al., Lancet Neurol 2014"
  },
  "uiats": {
    "treatment_score": 6, "conservative_score": 1, "net_score": 5,
    "recommendation": "Treatment recommended",
    "breakdown": {"Size 7-11mm": 2, "Aspect ratio >1.6": 2, "Irregular morphology": 2, "Age 61-70 (conservative)": -1},
    "evidence_level": "B",
    "citation": "Etminan et al., Lancet 2015"
  },
  "synthesis": {
    "recommendation": "Consider treatment — Endovascular (EVT) if pursued",
    "strength": "Moderate",
    "rationale": [
      "PHASES 5-year rupture risk: 1.7% (Moderate) [Score 6]",
      "UIATS net score: +5 — Treatment recommended [Treatment 6 pts vs Conservative 1 pts]"
    ],
    "preferred_modality": "Endovascular (EVT)",
    "disclaimer": "For clinical decision support only. Physician judgment supersedes all system recommendations."
  },
  "ai_rupture_probability": 0.57,
  "probability_source": "heuristic"
}
```

### `POST /marta_assessment`

```json
{
  "patient": {
    "age": 65, "sex": "F", "smoking": false, "hypertension": true,
    "dyslipidemia": false, "cerebrovascular_disease": false,
    "family_history_sah": false, "baseline_mrs": 0
  },
  "aneurysm": {
    "location": "MCA", "size": "MEDIUM", "morphology": "REGULAR_SACCULAR",
    "neck_geometry": "SIDEWALL", "neck_surface": "LESS_THAN_HALF",
    "sac_wall_calcification": false, "intraluminal_thrombus": false,
    "dissecting_etiology": false, "parent_artery_focal_stenosis": false,
    "collateral_branch_from_sac": false, "collateral_branch_from_neck": false,
    "evt_approach": "COILING_BAC"
  }
}
```

### `POST /simulate_treatment`

```bash
curl -X POST "http://localhost:8000/simulate_treatment?treatment_type=flow_diverter&baseline_wss_pa=3.5&baseline_osi=0.22"
```

---

## Architecture

```
neuropredict_ai/
├── main.py                      # FastAPI app: 5 endpoints + static serving
├── core/
│   ├── rsna_pipeline.py         # RSNA 2025 adapter (3-stage nnU-Net, AUC 0.916)
│   ├── data_loader.py           # DICOM ZIP + NIfTI ingestion + HU windowing
│   ├── segmentation.py          # Thin shim wrapping rsna_pipeline singleton
│   ├── extract_features.py      # 3D morphology via trimesh (diameter, AR, SR)
│   ├── hemodynamics.py          # Marching cubes mesh + WSS/OSI + flow direction
│   ├── risk_model.py            # PHASES (Ev.A) + UIATS (Ev.B) + synthesis engine
│   └── marta_score.py           # MARTA-EVT/NT logistic models, 4 EVT approaches
├── vendor/rsna2025/             # Git submodule: uchiyama33/rsna2025_1st_place
├── tests/
│   ├── test_api.py              # 9 API endpoint integration tests
│   ├── test_risk_model.py       # 34 PHASES/UIATS/synthesis unit tests
│   ├── test_marta_score.py      # 36 MARTA model tests
│   ├── test_hemodynamics.py     # 6 mesh + hemodynamic tests
│   └── test_data_loader.py      # 1 HU thresholding test
└── frontend/
    ├── src/
    │   ├── App.jsx              # 5-tab dashboard, all state + handlers
    │   ├── api.js               # Axios API layer (uploadScan, predictRisk, ...)
    │   └── components/
    │       ├── DicomViewer.jsx      # Cornerstone.js 3-plane MPR (lazy-loaded)
    │       ├── ClinicalForm.jsx     # PHASES + UIATS input form
    │       ├── ClinicalDecision.jsx # Accept/Modify/Override decision workflow
    │       ├── MARTAForm.jsx        # MARTA procedural risk input form
    │       └── Viewer3D.jsx         # VTK.js 3D mesh + per-vertex WSS heat map
    └── vite.config.js           # Manual chunks: vtk | cornerstone | cornerstone-loader

Dockerfile                       # GPU build (nvidia/cuda:12.1.1-cudnn8-devel)
Dockerfile.render                # CPU build (python:3.11-slim, Render free tier)
render.yaml                      # Render.com deployment config
deploy/modal_app.py              # Modal.com serverless GPU deployment
scripts/download_weights.py      # Kaggle weight downloader
.env.example                     # All RSNA environment variables documented
```

### RSNA Pipeline — Stage Detail

```
POST /analyze_and_mesh
        |
        +─ .zip  → extract_dicom_zip() → DICOM series directory
        +─ .nii  → load_nifti_volume() → NumPy float32 array
        |
        v
  Stage 1: nnU-Net coarse segmentation   (1.0mm isotropic, vessel localization)
  Stage 2: nnU-Net fine segmentation     (0.45mm, 13 named locations)
  Stage 3: Location-Aware Transformer    (4-fold ensemble, 128x256x256 input)
        |
        v
  extract_morphology()   → max diameter, AR, SR, neck diameter, irregularity
  generate_mesh()        → marching cubes (VTK.js-compatible vertex/face arrays)
  simulate_baseline()    → vertex WSS, mean/max OSI, flow direction (PCA)
```

### Frontend Bundle Splitting

| Chunk | Gzip Size | Loaded When |
|-------|-----------|-------------|
| `index.js` | ~86 KB | Always (initial page load) |
| `vtk.js` | ~102 KB | First visit to CTA Analysis tab |
| `cornerstone.js` | ~859 KB | First visit to DICOM View tab |
| `cornerstone-loader.js` | ~73 KB | First visit to DICOM View tab |

---

## Clinical Scoring Reference

### PHASES Score (Evidence Level A)

*Greving JP et al., Lancet Neurology 2014;13:59–66*

| Factor | Points |
|--------|--------|
| **P** — Finnish or Japanese population | +3 |
| **H** — Hypertension | +1 |
| **A** — Age >= 70 | +1 |
| **S** — Aneurysm < 7 mm | 0 |
| **S** — Aneurysm 7–9 mm | +3 |
| **S** — Aneurysm 10–19 mm | +6 |
| **S** — Aneurysm >= 20 mm | +10 |
| **E** — Earlier SAH from different aneurysm | +1 |
| **S** — ICA site | 0 |
| **S** — MCA site | +2 |
| **S** — ACA / AComm / PCoA / Posterior | +4 |

| Score | 5-Year Rupture Risk | Tier |
|-------|--------------------|----|
| 0–2 | 0.4% | Low |
| 3–4 | 0.7–0.9% | Low |
| 5–6 | 1.3–1.7% | Moderate |
| 7–8 | 2.4–3.2% | Moderate |
| 9–10 | 4.3–5.3% | High |
| 11 | 7.2% | High |
| >= 12 | 17.8% | Very High |

### UIATS — Two-Column System (Evidence Level B)

*Etminan N et al., Lancet 2015;385:2231–2240. Net score >= 2 = treatment recommended.*

**Treatment-Favoring Points:**

| Factor | Points |
|--------|--------|
| Earlier SAH from different aneurysm | +2 |
| Familial SAH or intracranial aneurysm | +2 |
| Previous SAH | +2 |
| High-risk location (ACoA, BA tip, PICA) | +2 |
| Aneurysm diameter 7–11 mm | +2 |
| Aneurysm diameter >= 12 mm | +4 |
| Aspect ratio > 1.6 | +2 |
| Irregular morphology | +2 |
| Multiple aneurysms | +1 |
| Smoking | +1 |
| Age < 40 | +2 |

**Conservative-Favoring Points:**

| Factor | Points |
|--------|--------|
| Age 61–70 | +1 |
| Age 71–80 | +2 |
| Age > 80 | +3 |

### MARTA Score (Evidence Level B)

Four EVT approaches ranked by procedural risk (lowest first):
1. Coiling / Balloon-Assisted Coiling (BAC)
2. Intrasaccular Device
3. Flow Diverter
4. Stent-Assisted Coiling

Risk categories: **Low** (< 5%) | **Moderate** (5–15%) | **High** (>= 15%)

---

## Testing

```bash
# Full backend suite (72 tests)
cd neuropredict_ai
pytest tests/ -v

# Full frontend suite (24 tests)
cd neuropredict_ai/frontend
npx vitest run

# Targeted suites
pytest tests/test_risk_model.py -v      # PHASES/UIATS/synthesis (34 tests)
pytest tests/test_api.py -v             # API endpoints (9 tests)
pytest tests/test_marta_score.py -v     # MARTA models (36 tests)
npx vitest run src/components/ClinicalDecision.test.jsx   # 9 tests
npx vitest run src/components/ClinicalForm.test.jsx        # 7 tests
```

**Coverage:**
- **PHASES**: all 6 variable branches, all size tiers (boundary values), score capping at 12, citation/evidence fields
- **UIATS**: all age/size/morphology buckets, net score thresholds, breakdown dict, evidence fields
- **Synthesis**: signal combinations, MARTA modality selection (EVT vs NT), disclaimer always present, RSNA rationale inclusion
- **API**: full schema validation, `rsna_probability` query param, MARTA query params in synthesis rationale, 422 on bad input, exact score/risk value assertions
- **Frontend**: all 5 tabs navigable, ClinicalDecision 3-state machine (pending/override-input/decided), ClinicalForm scan-data pre-fill, MARTA tab renders form, treatment tab shows gating message without scan

---

## Deployment

### Render (Auto-deploy on `git push`)

Push to `master` branch. Render reads `render.yaml` and builds with `Dockerfile.render`.

```yaml
services:
  - type: web
    name: neuropredict-ai
    runtime: docker
    plan: free
    healthCheckPath: /health
```

Health check: `GET /health` returns `{"status": "healthy", "rsna_pipeline": "weights_required"}` in CPU mode.

### RunPod / Lambda Labs (GPU)

Use `Dockerfile`. Mount weights volume at `/weights`, set env vars from `.env.example`.

### Modal.com (Serverless GPU)

```bash
pip install modal && modal deploy deploy/modal_app.py
```

---

## Development Setup

```bash
# Backend dev server
cd neuropredict_ai
uvicorn main:app --reload --port 8000

# Frontend dev (Vite HMR)
cd neuropredict_ai/frontend
npm run dev       # localhost:5173 proxies API calls to :8000

# Lint
ruff check neuropredict_ai/ && ruff format neuropredict_ai/
cd neuropredict_ai/frontend && npm run lint
```

**Initialize submodule (RSNA pipeline code):**
```bash
git submodule update --init --recursive
```

**Stack:** Python 3.11 · FastAPI 0.110+ · Pydantic v2 · NumPy · trimesh · scikit-image · React 19 · Vite 7 · VTK.js · Cornerstone.js 3 · JSZip · Vitest 4

---

## Roadmap

- [ ] DICOM crosshair synchronization across 3 planes
- [ ] PDF export — physician decision + evidence rationale report
- [ ] Multi-aneurysm session (track multiple lesions per patient encounter)
- [ ] WADO-RS / DICOMweb integration for direct PACS connectivity
- [ ] Backend persistence layer for decision audit trail
- [ ] Validated CFD integration (OpenFOAM / SimVascular)

---

## Credits

| Component | Reference |
|-----------|-----------|
| RSNA 2025 nnU-Net Pipeline | [uchiyama33/rsna2025_1st_place](https://github.com/uchiyama33/rsna2025_1st_place) |
| PHASES Score | Greving JP et al., *Lancet Neurol* 2014;13:59–66 |
| UIATS | Etminan N et al., *Lancet* 2015;385:2231–2240 |
| MARTA-EVT/NT | Toxopeus ELA et al., *Stroke* 2019, PMC6439725 |
| Cornerstone.js | [cornerstonejs.org](https://www.cornerstonejs.org/) |
| VTK.js | [kitware.github.io/vtk-js](https://kitware.github.io/vtk-js/) |

---

## Disclaimer

NeuroPredict AI is a **research and clinical decision support tool**. It is not a medical device and has not been cleared by the FDA, CE Mark, or any other regulatory authority. All platform outputs — including rupture risk scores, treatment recommendations, and procedural risk estimates — are intended solely for informational support of qualified medical professionals and do not constitute medical advice. Clinical decisions must be made by licensed physicians exercising independent medical judgment.

The RSNA 2025 detection model (AUC 0.916) was evaluated on the RSNA 2025 competition dataset and has not been independently validated on external clinical cohorts.
