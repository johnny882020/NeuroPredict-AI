from pathlib import Path

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import numpy as np

from core.data_loader import process_scan
from core.segmentation import segmentation_model
from core.extract_features import extract_morphology
from core.risk_model import uiats_calc, ml_predictor
from core.hemodynamics import hemodynamics_sim
from core.marta_score import (
    marta_calc,
    MARTAInput,
    MARTAPatientData,
    MARTAAneurysmData,
)
import uvicorn

app = FastAPI(
    title="NeuroPredict AI",
    description="Precision Prediction. Dynamic Intervention.",
    version="1.0.0"
)

FRONTEND_DIR = Path(__file__).parent / "frontend" / "dist"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ClinicalData(BaseModel):
    age: int
    smoking: bool
    hypertension: bool
    previous_sah: bool
    familial_sah: bool

class MorphologyData(BaseModel):
    maximum_3d_diameter_mm: float
    aspect_ratio_AR: float
    size_ratio_SR: float
    is_irregular: bool

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/analyze_and_mesh")
async def analyze_scan(file: UploadFile = File(...)):
    """
    Phase 1 & 3: Uploads CTA scan, segments aneurysm, extracts features, and generates 3D mesh.
    In dev mode the mock loader always produces data, so we force aneurysm_detected=True
    to avoid random U-Net outputs blocking the workflow.
    """
    file_bytes = await file.read()

    # 1. Preprocess
    preprocessed_volume = process_scan(file_bytes)

    # 2. Segment
    import torch
    input_tensor = torch.tensor(preprocessed_volume, dtype=torch.float32)
    mask = segmentation_model.predict(input_tensor)

    # Dev mode: if the untrained U-Net produces an empty mask,
    # inject a synthetic aneurysm blob so the rest of the pipeline works.
    if int((mask == 1).sum()) == 0:
        mask[20:40, 20:40, 20:40] = 1

    # 3. Extract Morphology
    morphology = extract_morphology(preprocessed_volume.squeeze(0), mask)

    # 4. Generate Mesh & Baseline Hemodynamics
    mesh_data = hemodynamics_sim.generate_mesh(mask)
    baseline_cfd = hemodynamics_sim.simulate_baseline_flow(
        mesh_data["vertices"], mesh_data["faces"]
    )

    return {
        "status": "success",
        "aneurysm_detected": True,
        "morphology": morphology,
        "mesh": {
            "vertices": mesh_data["vertices"],
            "faces": mesh_data["faces"],
            "surface_area_mm2": mesh_data["surface_area_mm2"],
            "volume_mm3": mesh_data["volume_mm3"],
        },
        "baseline_hemodynamics": baseline_cfd,
    }

@app.post("/predict_risk")
def predict_risk(clinical: ClinicalData, morph: MorphologyData):
    """
    Phase 2: Calculates UIATS score and ML Rupture Probability.
    """
    uiats_result = uiats_calc.calculate_score(clinical.dict(), morph.dict())
    ml_prob = ml_predictor.predict_risk(clinical.dict(), morph.dict())

    return {
        "uiats_assessment": uiats_result,
        "ai_rupture_probability": ml_prob
    }

@app.post("/marta_assessment")
def marta_assessment(data: MARTAInput):
    """
    MARTA Score: Calculates EVT and NT complication probabilities
    using the MARTA risk assessment model.
    """
    result = marta_calc.assess(data)
    return result.model_dump()

@app.post("/simulate_treatment")
def simulate_treatment(treatment_type: str, baseline_wss_pa: float, baseline_osi: float):
    """
    Phase 3: Simulates device placement outcomes.
    """
    baseline_stats = {
        "mean_wss_pa": baseline_wss_pa,
        "max_wss_pa": baseline_wss_pa * 2.5,  # mock max
        "mean_osi": baseline_osi
    }
    post_treatment = hemodynamics_sim.simulate_treatment(treatment_type, baseline_stats)
    return post_treatment

# Serve frontend static files (must be after API routes)
if FRONTEND_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = FRONTEND_DIR / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
