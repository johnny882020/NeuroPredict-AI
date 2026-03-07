import shutil
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import numpy as np

from core.data_loader import process_scan, write_nifti_for_pipeline
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
    version="2.0.0",
)

FRONTEND_DIR = Path(__file__).parent / "frontend" / "dist"

app.add_middleware(GZipMiddleware, minimum_size=1000)
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
async def health_check():
    return {
        "status": "healthy",
        "rsna_pipeline": "ready" if segmentation_model.is_available else "weights_required",
    }


@app.post("/analyze_and_mesh")
async def analyze_scan(file: UploadFile = File(...)):
    """
    Full CTA analysis using the RSNA 2025 1st place model (AUC 0.916).

    Accepts:
      - .zip      — ZIP archive of a DICOM series directory
      - .nii.gz   — pre-converted NIfTI volume

    Returns aneurysm probability, 13-location classification, morphology, mesh,
    and baseline hemodynamics.
    """
    file_bytes = await file.read()
    filename = file.filename or "upload.nii.gz"

    # 1. Detect format and load/extract
    try:
        mode, data = process_scan(file_bytes, filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    # 2. Resolve a series directory path for the RSNA pipeline
    series_dir: str
    tmp_nifti_dir: Optional[str] = None

    if mode == "dicom_dir":
        series_dir = data  # already an extracted DICOM directory
    else:
        # NIfTI mode: write volume to a temp dir as scan_0000.nii.gz
        tmp_nifti_dir = tempfile.mkdtemp(prefix="neuropredict_nii_")
        series_dir = write_nifti_for_pipeline(data, Path(tmp_nifti_dir))

    # 3. Run the RSNA three-stage pipeline
    try:
        rsna_result = segmentation_model.predict(series_dir)
    finally:
        # Clean up extracted DICOM temp directory
        if mode == "dicom_dir":
            parent = str(Path(series_dir).parent)
            if "neuropredict_dcm_" in parent:
                shutil.rmtree(parent, ignore_errors=True)
        if tmp_nifti_dir:
            shutil.rmtree(tmp_nifti_dir, ignore_errors=True)

    # 4. Morphology and mesh (available when a NIfTI volume was provided)
    morphology: dict = {}
    mesh_data: dict = {"vertices": [], "faces": [], "surface_area_mm2": 0.0, "volume_mm3": 0.0}
    baseline_cfd: dict = {}

    if mode == "nifti" and isinstance(data, np.ndarray):
        volume = data
        vessel_mask = (volume > 150).astype(np.uint8)
        if int(vessel_mask.sum()) > 100:
            morphology = extract_morphology(volume, vessel_mask)
            mesh_data = hemodynamics_sim.generate_mesh(vessel_mask)
            baseline_cfd = hemodynamics_sim.simulate_baseline_flow(
                mesh_data["vertices"], mesh_data["faces"]
            )

    return {
        "status": "success",
        # RSNA 2025 real predictions (AUC 0.916)
        "aneurysm_detected": rsna_result["aneurysm_detected"],
        "aneurysm_probability": rsna_result["aneurysm_probability"],
        "location_probabilities": rsna_result["location_probabilities"],
        "top_location": rsna_result["top_location"],
        "pipeline": rsna_result["pipeline"],
        # Morphology / mesh / hemodynamics
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
async def predict_risk(
    clinical: ClinicalData,
    morph: MorphologyData,
    rsna_probability: Optional[float] = None,
):
    """
    UIATS score + AI rupture probability.

    Pass rsna_probability from /analyze_and_mesh to use the real RSNA AUC 0.916
    probability instead of the heuristic estimate.
    """
    uiats_result = uiats_calc.calculate_score(clinical.dict(), morph.dict())
    ai_prob = (
        rsna_probability
        if rsna_probability is not None
        else ml_predictor.predict_risk(clinical.dict(), morph.dict())
    )

    return {
        "uiats_assessment": uiats_result,
        "ai_rupture_probability": ai_prob,
        "probability_source": "rsna_2025" if rsna_probability is not None else "heuristic",
    }


@app.post("/marta_assessment")
async def marta_assessment(data: MARTAInput):
    """MARTA Score: EVT and NT complication probabilities."""
    result = marta_calc.assess(data)
    return result.model_dump()


@app.post("/simulate_treatment")
async def simulate_treatment(treatment_type: str, baseline_wss_pa: float, baseline_osi: float):
    """Phase 3: Simulates device placement outcomes."""
    baseline_stats = {
        "mean_wss_pa": baseline_wss_pa,
        "max_wss_pa": baseline_wss_pa * 2.5,
        "mean_osi": baseline_osi,
    }
    return hemodynamics_sim.simulate_treatment(treatment_type, baseline_stats)


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
