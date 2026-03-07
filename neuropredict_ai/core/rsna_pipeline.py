"""
RSNA 2025 1st Place Pipeline Adapter — AUC 0.916

Wraps the uchiyama33/rsna2025_1st_place predict() function as a NeuroPredict singleton.

Architecture (Location-Aware Aneurysm Detection via Vessel-ROI Masking):
  Stage 1: nnU-Net coarse vessel localization (1.0mm spacing, DBSCAN → 140×140×140mm ROI)
  Stage 2: nnU-Net fine segmentation × 2 models (0.80×0.45×0.44mm, SkeletonRecall loss)
  Stage 3: ROI classifier (128×256×256, pretrained nnU-Net backbone + Region-Masked Pooling
           + Location-Aware Transformer) → 13 location probabilities + Aneurysm Present

AUC 0.915 (Aneurysm Present) / 0.916 (13 locations) on RSNA 2025 test set.

Required env vars (set in .env or cloud deployment):
  VESSEL_NNUNET_MODEL_DIR   — path to fine segmentation nnU-Net models
  VESSEL_NNUNET_SPARSE_MODEL_DIR — path to coarse nnU-Net model (defaults to above)
  ROI_EXPERIMENTS           — Hydra experiment name for ROI classifier
  ROI_FOLDS                 — comma-separated fold indices, e.g. "0,1,3,4"
  ROI_TTA                   — test-time augmentation count (1/2/4/8), default 2
  ROI_CKPT                  — checkpoint mode "last" or "best"
  VESSEL_FOLDS              — segmentation fold ensemble ("all" or "0,1,2,3,4")
  VESSEL_REFINE_MARGIN_Z    — z-axis ROI margin in voxels (default 15)
  VESSEL_REFINE_MARGIN_XY   — xy-plane ROI margin in voxels (default 30)
"""

from __future__ import annotations

import os
import sys
import logging
from pathlib import Path
from typing import Optional

import numpy as np

log = logging.getLogger(__name__)

# Path to the vendored RSNA 2025 repository root
RSNA_ROOT = Path(__file__).parent.parent / "vendor" / "rsna2025"

# Exact label order from src/data/components/aneurysm_vessel_seg_dataset.py
ANEURYSM_LOCATION_LABELS = [
    "Left Infraclinoid Internal Carotid Artery",
    "Right Infraclinoid Internal Carotid Artery",
    "Left Supraclinoid Internal Carotid Artery",
    "Right Supraclinoid Internal Carotid Artery",
    "Left Middle Cerebral Artery",
    "Right Middle Cerebral Artery",
    "Anterior Communicating Artery",
    "Left Anterior Cerebral Artery",
    "Right Anterior Cerebral Artery",
    "Left Posterior Communicating Artery",
    "Right Posterior Communicating Artery",
    "Basilar Tip",
    "Other Posterior Circulation",
]
# Index 13 in ANEURYSM_CLASSES is "Aneurysm Present"
ANEURYSM_PRESENT_LABEL = "Aneurysm Present"

# Fail-safe: fallback probability returned when pipeline raises (= CV mean per class)
FALLBACK_PROBABILITY = 0.1


def _setup_rsna_path() -> bool:
    """Add RSNA vendor root to sys.path so src.* imports resolve."""
    rsna_str = str(RSNA_ROOT)
    if rsna_str not in sys.path:
        sys.path.insert(0, rsna_str)
    # rootutils requires a .project-root marker to configure PYTHONPATH
    project_root_marker = RSNA_ROOT / ".project-root"
    if not project_root_marker.exists():
        log.warning("RSNA vendor .project-root marker not found at %s", project_root_marker)
        return False
    return True


def _is_pipeline_available() -> bool:
    """Return True if all hard dependencies for the RSNA pipeline are importable."""
    try:
        import torch  # noqa: F401
        import nnunetv2  # noqa: F401
        import hydra  # noqa: F401
        import polars  # noqa: F401
        import rootutils  # noqa: F401
        return True
    except ImportError as e:
        log.warning("RSNA pipeline dependency missing: %s", e)
        return False


class RSNAPipeline:
    """
    Singleton adapter around the RSNA 2025 predict() entry point.

    On first call to predict_from_dicom_dir(), the RSNA pipeline is lazy-initialised:
    - RSNA vendor root added to sys.path
    - rootutils sets up project paths inside the vendor dir
    - RSNA predict() is imported and the model weights are loaded (triggered on first call)

    Subsequent calls reuse the loaded models (singleton pattern in rsna_submission_roi).
    """

    _instance: Optional["RSNAPipeline"] = None
    _predict_fn = None
    _available: Optional[bool] = None

    def __new__(cls) -> "RSNAPipeline":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _lazy_init(self) -> bool:
        """Load the RSNA predict function on first use. Returns True if ready."""
        if self._predict_fn is not None:
            return True

        if self._available is False:
            return False

        if not _setup_rsna_path():
            self._available = False
            return False

        if not _is_pipeline_available():
            self._available = False
            return False

        # Validate that required env vars are set before importing (import triggers model load)
        missing = [v for v in ("VESSEL_NNUNET_MODEL_DIR", "ROI_EXPERIMENTS") if not os.getenv(v)]
        if missing:
            log.warning(
                "RSNA pipeline not initialised — missing env vars: %s. "
                "Set these in .env or your deployment environment.",
                ", ".join(missing),
            )
            self._available = False
            return False

        try:
            import rootutils
            rootutils.setup_root(RSNA_ROOT, indicator=".project-root", pythonpath=True)

            from scripts.rsna_submission_roi import predict as _rsna_predict  # noqa
            self._predict_fn = _rsna_predict
            self._available = True
            log.info("RSNA 2025 pipeline loaded successfully (AUC 0.916 model).")
            return True
        except Exception as exc:
            log.error("Failed to initialise RSNA pipeline: %s", exc, exc_info=True)
            self._available = False
            return False

    def predict_from_dicom_dir(self, series_dir: str) -> dict:
        """
        Run the full RSNA three-stage pipeline on a DICOM series directory.

        Args:
            series_dir: Path to a directory containing .dcm files for one CTA series.

        Returns:
            {
                "aneurysm_probability": float,          # Aneurysm Present probability (0–1)
                "aneurysm_detected": bool,              # True if probability > 0.5
                "location_probabilities": dict[str, float],  # 13 anatomical locations
                "top_location": str,                    # Highest-probability location name
                "pipeline": str,                        # "rsna_2025" or "unavailable"
            }
        """
        if not self._lazy_init():
            return self._fallback_result("unavailable")

        try:
            result_df = self._predict_fn(series_dir)
            # polars DataFrame: columns = ANEURYSM_CLASSES (13 locations + "Aneurysm Present")
            row = result_df.row(0)  # tuple of 14 float32 values
            location_probs: dict[str, float] = {
                label: float(row[i]) for i, label in enumerate(ANEURYSM_LOCATION_LABELS)
            }
            aneurysm_probability = float(row[13])  # "Aneurysm Present" is index 13
            top_location = max(location_probs, key=location_probs.get)

            return {
                "aneurysm_probability": aneurysm_probability,
                "aneurysm_detected": aneurysm_probability > 0.5,
                "location_probabilities": location_probs,
                "top_location": top_location,
                "pipeline": "rsna_2025",
            }
        except Exception as exc:
            log.error("RSNA predict() failed for %s: %s", series_dir, exc, exc_info=True)
            return self._fallback_result("error")

    @staticmethod
    def _fallback_result(reason: str) -> dict:
        """Return safe fallback probabilities when the pipeline is unavailable or errors."""
        location_probs = {label: FALLBACK_PROBABILITY for label in ANEURYSM_LOCATION_LABELS}
        return {
            "aneurysm_probability": FALLBACK_PROBABILITY,
            "aneurysm_detected": False,
            "location_probabilities": location_probs,
            "top_location": ANEURYSM_LOCATION_LABELS[0],
            "pipeline": reason,
        }

    @property
    def is_available(self) -> bool:
        """True if the RSNA pipeline has been or can be successfully initialised."""
        if self._available is None:
            return _is_pipeline_available() and bool(os.getenv("VESSEL_NNUNET_MODEL_DIR"))
        return self._available


# Module-level singleton — imported by segmentation.py and main.py
rsna_pipeline = RSNAPipeline()
