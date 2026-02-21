import numpy as np
from core.data_loader import apply_hu_threshold

def test_apply_hu_threshold():
    # Create a mock volume with values from -1000 to 1000
    mock_volume = np.array([-1000, 0, 150, 300, 600, 800, 1000])

    # Process
    processed = apply_hu_threshold(mock_volume, min_hu=150, max_hu=600)

    # Assert clipping worked correctly (values outside 150-600 are clipped)
    # Then normalized between 0 and 1.
    # 150 -> 0.0
    # 600 -> 1.0
    # 300 -> (300-150)/(600-150) = 150/450 = 0.333...

    assert processed[0] == 0.0   # -1000 clipped to 150 -> normalized to 0.0
    assert processed[2] == 0.0   # 150 -> 0.0
    assert np.isclose(processed[3], 0.3333, atol=1e-3)  # 300 -> 0.333
    assert processed[4] == 1.0   # 600 -> 1.0
    assert processed[6] == 1.0   # 1000 clipped to 600 -> normalized to 1.0
