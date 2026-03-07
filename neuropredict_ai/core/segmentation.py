"""
Segmentation module — delegates to the RSNA 2025 1st place pipeline.

Replaces the previous MONAI U-Net placeholder with the real uchiyama33 model
(AUC 0.916) via the RSNAPipeline adapter singleton.

The predict() interface accepts a DICOM series directory path (str) and returns
a structured dict compatible with the /analyze_and_mesh response schema.
"""

from __future__ import annotations

from core.rsna_pipeline import RSNAPipeline, rsna_pipeline


class AneurysmSegmentationModel:
    """
    Thin shim that delegates prediction to RSNAPipeline.

    This class preserves the module-level singleton pattern used throughout
    NeuroPredict (imported as `from core.segmentation import segmentation_model`)
    while the actual inference is handled by the RSNA pipeline.
    """

    def predict(self, series_path: str) -> dict:
        """
        Run the full RSNA 2025 three-stage pipeline on a DICOM series directory.

        Args:
            series_path: Path to a directory containing .dcm files for one CTA series,
                         OR a directory containing a scan_0000.nii.gz file (NIfTI path).

        Returns:
            {
                "aneurysm_probability": float,
                "aneurysm_detected": bool,
                "location_probabilities": dict[str, float],  # 13 anatomical locations
                "top_location": str,
                "pipeline": str,  # "rsna_2025", "unavailable", or "error"
            }
        """
        return rsna_pipeline.predict_from_dicom_dir(series_path)

    @property
    def is_available(self) -> bool:
        return rsna_pipeline.is_available


# Module-level singleton — keeps backward-compatible import pattern
segmentation_model = AneurysmSegmentationModel()
