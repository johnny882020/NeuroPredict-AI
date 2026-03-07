"""
Data loader for NeuroPredict AI.

Accepts two upload formats:
  - .zip  — a ZIP archive containing a DICOM series directory (.dcm files)
  - .nii / .nii.gz — a pre-converted NIfTI volume

Returns (mode, data) where:
  mode="dicom_dir" → data is a str path to the extracted DICOM series directory
                     (passed directly to the RSNA pipeline which runs dcm2niix internally)
  mode="nifti"     → data is a numpy float32 array of the volume
                     (written to a temp NIfTI file then passed to the RSNA pipeline)
"""

from __future__ import annotations

import io
import logging
import tempfile
import zipfile
from pathlib import Path
from typing import Union

import numpy as np

log = logging.getLogger(__name__)

try:
    import nibabel as nib
    _HAS_NIBABEL = True
except ImportError:
    nib = None
    _HAS_NIBABEL = False
    log.warning("nibabel not installed — NIfTI upload support disabled.")


def extract_dicom_zip(file_bytes: bytes, out_dir: Path) -> Path:
    """
    Extract a ZIP archive containing DICOM files to out_dir.
    Returns the deepest directory that contains .dcm files.
    """
    with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
        zf.extractall(out_dir)

    # Find the directory containing .dcm files (may be nested)
    for dcm_file in sorted(out_dir.rglob("*.dcm")):
        return dcm_file.parent

    # Also accept .DCM (case-insensitive) on case-sensitive file systems
    for dcm_file in sorted(out_dir.rglob("*.DCM")):
        return dcm_file.parent

    raise ValueError(
        "No .dcm files found in the uploaded ZIP. "
        "Please ZIP a DICOM series directory containing *.dcm files."
    )


def load_nifti_volume(file_bytes: bytes) -> np.ndarray:
    """Load a NIfTI file from raw bytes into a 3D float32 numpy array."""
    if not _HAS_NIBABEL:
        raise RuntimeError(
            "nibabel is required for NIfTI uploads. "
            "Install it with: pip install nibabel"
        )
    with tempfile.NamedTemporaryFile(suffix=".nii.gz", delete=False) as f:
        f.write(file_bytes)
        tmp_path = f.name

    img = nib.load(tmp_path)
    volume: np.ndarray = img.get_fdata().astype(np.float32)
    return volume


def apply_hu_threshold(volume: np.ndarray, min_hu: int = 150, max_hu: int = 600) -> np.ndarray:
    """
    Clip a CT volume to a Hounsfield Unit window and normalise to [0, 1].

    Used for lightweight vessel mask extraction on NIfTI uploads (the RSNA
    pipeline performs its own z-score normalisation internally).
    150–600 HU isolates cerebral arterial vessels from surrounding tissue.
    """
    clipped = np.clip(volume, min_hu, max_hu)
    return (clipped - min_hu) / (max_hu - min_hu)


def write_nifti_for_pipeline(volume: np.ndarray, out_dir: Path) -> str:
    """
    Write a numpy volume as scan_0000.nii.gz in out_dir (naming convention
    expected by the RSNA pipeline for NIfTI-format input).
    Returns the directory path as a string (the "series dir" for the pipeline).
    """
    if not _HAS_NIBABEL:
        raise RuntimeError("nibabel required to write NIfTI files.")
    nii_path = out_dir / "scan_0000.nii.gz"
    img = nib.Nifti1Image(volume, affine=np.eye(4))
    nib.save(img, str(nii_path))
    log.info("Written NIfTI to: %s", nii_path)
    return str(out_dir)


def process_scan(
    file_bytes: bytes,
    filename: str,
) -> tuple[str, Union[str, np.ndarray]]:
    """
    Detect upload format from filename and route to the appropriate loader.

    Returns:
        ("dicom_dir", series_dir_path: str)   for ZIP uploads
        ("nifti",     volume: np.ndarray)      for NIfTI uploads

    The tmp directory for DICOM is created with tempfile.mkdtemp(); the caller
    must clean it up after the RSNA pipeline finishes.
    """
    name_lower = filename.lower()

    if name_lower.endswith(".zip"):
        tmp_dir = Path(tempfile.mkdtemp(prefix="neuropredict_dcm_"))
        series_dir = extract_dicom_zip(file_bytes, tmp_dir)
        log.info("Extracted DICOM series to: %s", series_dir)
        return "dicom_dir", str(series_dir)

    elif name_lower.endswith(".nii.gz") or name_lower.endswith(".nii"):
        volume = load_nifti_volume(file_bytes)
        log.info("Loaded NIfTI volume: shape=%s dtype=%s", volume.shape, volume.dtype)
        return "nifti", volume

    else:
        raise ValueError(
            f"Unsupported file format: '{filename}'. "
            "Upload a .zip (DICOM series) or .nii.gz (NIfTI volume)."
        )
