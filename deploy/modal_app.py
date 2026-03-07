"""
NeuroPredict AI — Modal.com GPU Deployment
==========================================

Deploys the FastAPI app (with RSNA 2025 AUC 0.916 pipeline) as a
serverless GPU function on Modal.com.

Cost: ~$0.59/hr on T4 (pay-per-second, no idle charges when not serving).
Inference: ~18s per CTA scan on T4.

Prerequisites
-------------
1. Install Modal:
     pip install modal

2. Authenticate:
     modal token new

3. Upload model weights to a Modal Volume (one-time setup):
     # Create the volume
     modal volume create neuropredict-weights

     # Upload your downloaded weights directory
     modal volume put neuropredict-weights ./neuropredict_ai/model_weights/nnUNet_results \
         /nnUNet_results
     modal volume put neuropredict-weights ./neuropredict_ai/model_weights/roi_classifier \
         /roi_classifier

4. Deploy:
     modal deploy deploy/modal_app.py

5. The app URL is printed after deploy. Update VITE_API_URL in the frontend.

Environment variables are set below — update ROI_EXPERIMENTS and model paths
after inspecting your downloaded weight directory layout.
"""

from __future__ import annotations

import modal

# ── Volume: persists pretrained model weights across container restarts ────────
weights_volume = modal.Volume.from_name("neuropredict-weights", create_if_missing=True)

# ── Image: CUDA 12.1 + system deps + Python packages ─────────────────────────
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .apt_install(
        "dcm2niix",   # DICOM→NIfTI conversion (RSNA Stage 1)
        "gdcm",       # DICOM fallback (gdcmconv --raw)
        "git",
        "curl",
    )
    .pip_install(
        # Core FastAPI stack
        "fastapi==0.104.1",
        "uvicorn==0.24.0.post1",
        "python-multipart==0.0.6",
        # Scientific stack
        "numpy==1.26.2",
        "scipy>=1.11.0",
        "scikit-image==0.22.0",
        "trimesh==4.0.5",
        # Medical imaging
        "nibabel>=5.1.0",
        "pydicom>=2.4.3",
        "SimpleITK>=2.3.0",
        # ML / RSNA pipeline
        "torch>=2.1.0",
        "monai>=1.3.0",
        "nnunetv2>=2.4",
        "hydra-core>=1.3",
        "omegaconf>=2.3",
        "pytorch-lightning>=2.0",
        "polars>=0.20.0",
        "rootutils>=1.0.7",
        "scikit-learn>=1.3.0",
        "matplotlib>=3.7.0",
        # Misc
        "pydantic>=2.0",
    )
    .copy_local_dir(
        # Copy the backend source into /app
        local_path="neuropredict_ai",
        remote_path="/app",
    )
    .copy_local_dir(
        # Copy the RSNA vendor submodule into /app/vendor/rsna2025
        local_path="neuropredict_ai/vendor/rsna2025",
        remote_path="/app/vendor/rsna2025",
    )
    .env(
        {
            # nnU-Net internal directories (preprocessed data not needed at inference)
            "nnUNet_raw": "/workspace/nnUNet_raw",
            "nnUNet_preprocessed": "/workspace/nnUNet_preprocessed",
            # Weights are mounted at /weights from the Modal Volume
            "nnUNet_results": "/weights/nnUNet_results",
            # Python path: resolve both neuropredict_ai and RSNA vendor imports
            "PYTHONPATH": "/app:/app/vendor/rsna2025",
        }
    )
)

# ── App definition ─────────────────────────────────────────────────────────────
app = modal.App("neuropredict-ai", image=image)


@app.function(
    gpu="T4",           # T4 (16GB) is sufficient; use "A10G" for ~2× faster inference
    memory=32768,       # 32GB RAM (nnU-Net preprocessing is memory-heavy)
    volumes={"/weights": weights_volume},
    timeout=180,        # 3 min max per request (typical: ~18s)
    # RSNA pipeline env vars — update these paths after inspecting your weights layout
    secrets=[
        modal.Secret.from_dict({
            "VESSEL_NNUNET_MODEL_DIR": (
                "/weights/nnUNet_results/Dataset001_VesselSegmentation/"
                "RSNA2025Trainer_moreDAv6_1_SkeletonRecallTverskyBeta07"
                "__nnUNetResEncUNetMPlans__3d_fullres"
            ),
            "VESSEL_NNUNET_SPARSE_MODEL_DIR": (
                "/weights/nnUNet_results/Dataset003_VesselGrouping/"
                "RSNA2025Trainer_moreDAv7__nnUNetResEncUNetMPlans__3d_fullres"
            ),
            "VESSEL_FOLDS": "all",
            "VESSEL_REFINE_MARGIN_Z": "15",
            "VESSEL_REFINE_MARGIN_XY": "30",
            "ROI_EXPERIMENTS": (
                "251013-seg_tf-v4-nnunet_truncate1_preV6_1"
                "-ex_dav6w3-m32g64-e25-w01_005_1-s128_256_256"
            ),
            "ROI_FOLDS": "0,1,3,4",
            "ROI_TTA": "2",
            "ROI_CKPT": "last",
        })
    ],
)
@modal.asgi_app()
def fastapi_app():
    import sys
    sys.path.insert(0, "/app/vendor/rsna2025")

    import os
    os.chdir("/app")

    from main import app as _app  # noqa: PLC0415
    return _app
