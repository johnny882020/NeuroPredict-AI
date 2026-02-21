import numpy as np
import nibabel as nib
import io

def load_nifti_from_bytes(file_bytes: bytes) -> np.ndarray:
    """
    Loads a NIfTI file from bytes (uploaded via FastAPI) and returns a numpy array.
    """
    # In a production environment, you might save this to a temporary file first
    # because nibabel prefers file paths or file-like objects.
    # For demonstration, we simulate loading a 3D numpy array.
    # Replace with actual nib.load(temp_path).get_fdata()

    # Mocking a 3D CT scan array for the sake of the skeleton:
    mock_volume = np.random.uniform(low=-1000, high=1000, size=(64, 64, 64))
    return mock_volume

def apply_hu_threshold(volume: np.ndarray, min_hu: int = 150, max_hu: int = 600) -> np.ndarray:
    """
    Applies a Hounsfield Unit (HU) threshold to isolate cerebral arterial vessels.
    Based on clinical protocols, 150-600 HU optimally segments MCA aneurysms
    from surrounding brain tissue and bone.
    """
    # Clip the values to the specified HU range
    windowed_volume = np.clip(volume, min_hu, max_hu)

    # Normalize between 0 and 1 for the neural network
    normalized_volume = (windowed_volume - min_hu) / (max_hu - min_hu)

    return normalized_volume

def process_scan(file_bytes: bytes) -> np.ndarray:
    """Full preprocessing pipeline for an incoming scan."""
    volume = load_nifti_from_bytes(file_bytes)
    processed_volume = apply_hu_threshold(volume)
    # Add channel dimension (C, D, H, W) for MONAI/PyTorch
    return np.expand_dims(processed_volume, axis=0)
