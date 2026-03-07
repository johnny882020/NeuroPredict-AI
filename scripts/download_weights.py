#!/usr/bin/env python3
"""
Download pretrained RSNA 2025 1st place model weights from Kaggle.

Prerequisites:
  pip install kaggle
  Place your Kaggle API credentials at ~/.kaggle/kaggle.json
  (Get from https://www.kaggle.com/settings → API → Create New Token)

Usage:
  python scripts/download_weights.py

After downloading, set these env vars (copy .env.example → .env and fill in paths):
  VESSEL_NNUNET_MODEL_DIR
  VESSEL_NNUNET_SPARSE_MODEL_DIR
  ROI_EXPERIMENTS
"""

import subprocess
import os
from pathlib import Path

# Weights dir relative to repo root
WEIGHTS_DIR = Path(__file__).parent.parent / "neuropredict_ai" / "model_weights"
WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)

# ── Instructions ──────────────────────────────────────────────────────────────
# To find the exact Kaggle dataset slugs for the trained weights:
# 1. Log into Kaggle and open: https://www.kaggle.com/code/tomoon33/rsna2025-submission-1st-place
# 2. Click "Input" tab on the left panel
# 3. Note the dataset names (e.g. "tomoon33/rsna2025-vessel-seg-weights")
# 4. Update DATASETS below with the correct slugs
# ─────────────────────────────────────────────────────────────────────────────

DATASETS = [
    # Replace these with the actual dataset slugs from the notebook's Input tab
    "tomoon33/rsna2025-vessel-seg-weights",
    "tomoon33/rsna2025-roi-classifier-weights",
]


def check_kaggle_credentials() -> bool:
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if not kaggle_json.exists():
        print(f"[ERROR] Kaggle credentials not found at {kaggle_json}")
        print("  1. Go to https://www.kaggle.com/settings → API → Create New Token")
        print(f"  2. Move the downloaded kaggle.json to {kaggle_json}")
        return False
    return True


def download_dataset(slug: str, out_dir: Path) -> bool:
    print(f"\n[INFO] Downloading dataset: {slug}")
    result = subprocess.run(
        ["kaggle", "datasets", "download", "-d", slug, "-p", str(out_dir), "--unzip"],
        capture_output=False,
    )
    if result.returncode != 0:
        print(f"[WARN] Failed to download {slug} — check the slug is correct and you have access.")
        return False
    print(f"[OK] Downloaded and extracted to {out_dir}")
    return True


def print_expected_layout():
    print("\n[INFO] Expected weight directory layout after download:")
    print(f"""
  {WEIGHTS_DIR}/
    nnUNet_results/
      Dataset001_VesselSegmentation/
        RSNA2025Trainer_moreDAv6_1_SkeletonRecallTverskyBeta07__nnUNetResEncUNetMPlans__3d_fullres/
          fold_0/ fold_1/ fold_2/ fold_3/ fold_4/
      Dataset003_VesselGrouping/
        RSNA2025Trainer_moreDAv7__nnUNetResEncUNetMPlans__3d_fullres/
          fold_0/ ... fold_4/
    roi_classifier/
      251013-seg_tf-v4-nnunet_truncate1_preV6_1-ex_dav6w3-m32g64-e25-w01_005_1-s128_256_256/
        fold0/checkpoints/last.ckpt
        fold1/checkpoints/last.ckpt
        fold3/checkpoints/last.ckpt
        fold4/checkpoints/last.ckpt
""")


if __name__ == "__main__":
    if not check_kaggle_credentials():
        exit(1)

    success_count = 0
    for ds in DATASETS:
        if download_dataset(ds, WEIGHTS_DIR):
            success_count += 1

    print_expected_layout()

    if success_count == len(DATASETS):
        print("\n[SUCCESS] All weights downloaded. Update your .env file with the correct paths.")
    else:
        print(f"\n[WARN] {success_count}/{len(DATASETS)} datasets downloaded.")
        print("  Check the dataset slugs — log into Kaggle and inspect the notebook Input tab.")
