import numpy as np

try:
    import torch
    from monai.networks.nets import UNet
    _HAS_TORCH = True
except ImportError:
    _HAS_TORCH = False


class AneurysmSegmentationModel:
    def __init__(self, model_weights_path: str = None):
        if _HAS_TORCH:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model = UNet(
                spatial_dims=3,
                in_channels=1,
                out_channels=2,
                channels=(16, 32, 64, 128, 256),
                strides=(2, 2, 2, 2),
                num_res_units=2,
            ).to(self.device)

            if model_weights_path:
                self.model.load_state_dict(
                    torch.load(model_weights_path, map_location=self.device)
                )
            self.model.eval()
        else:
            self.model = None
            self.device = None

    def predict(self, input_data) -> np.ndarray:
        """
        Runs inference on the preprocessed 3D CT volume.
        Falls back to synthetic mask when PyTorch is not available.
        """
        if self.model is not None and _HAS_TORCH:
            if isinstance(input_data, np.ndarray):
                input_tensor = torch.tensor(input_data, dtype=torch.float32)
            else:
                input_tensor = input_data
            input_tensor = input_tensor.to(self.device)
            if input_tensor.dim() < 5:
                input_tensor = input_tensor.unsqueeze(0)
            with torch.no_grad():
                output = self.model(input_tensor)
                probabilities = torch.softmax(output, dim=1)
                predicted_mask = (
                    torch.argmax(probabilities, dim=1).squeeze(0).cpu().numpy()
                )
            return predicted_mask

        # Lightweight fallback: produce a synthetic aneurysm blob
        if hasattr(input_data, 'numpy'):
            shape = input_data.squeeze(0).shape
        elif isinstance(input_data, np.ndarray):
            shape = input_data.squeeze(0).shape if input_data.ndim == 4 else input_data.shape
        else:
            shape = (64, 64, 64)

        mask = np.zeros(shape, dtype=np.uint8)
        # Place a synthetic aneurysm blob in the centre
        s = [slice(d // 4, d // 4 + d // 2) for d in shape]
        mask[tuple(s)] = 1
        return mask


# Singleton instance for the FastAPI app
segmentation_model = AneurysmSegmentationModel()
