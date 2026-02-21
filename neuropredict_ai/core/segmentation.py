import numpy as np
import torch
from monai.networks.nets import UNet

class AneurysmSegmentationModel:
    def __init__(self, model_weights_path: str = None):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

        # Initialize a standard 3D U-Net from MONAI
        self.model = UNet(
            spatial_dims=3,
            in_channels=1,
            out_channels=2,  # Background vs. Aneurysm
            channels=(16, 32, 64, 128, 256),
            strides=(2, 2, 2, 2),
            num_res_units=2,
        ).to(self.device)

        if model_weights_path:
            self.model.load_state_dict(torch.load(model_weights_path, map_location=self.device))

        self.model.eval()

    def predict(self, input_tensor: torch.Tensor) -> np.ndarray:
        """
        Runs inference on the preprocessed 3D CT volume.
        """
        input_tensor = input_tensor.to(self.device)

        # Add batch dimension (B, C, D, H, W)
        input_tensor = input_tensor.unsqueeze(0)

        with torch.no_grad():
            output = self.model(input_tensor)
            # Apply softmax and get the predicted class (Aneurysm mask)
            probabilities = torch.softmax(output, dim=1)
            predicted_mask = torch.argmax(probabilities, dim=1).squeeze(0).cpu().numpy()

        return predicted_mask

# Singleton instance for the FastAPI app
segmentation_model = AneurysmSegmentationModel()
