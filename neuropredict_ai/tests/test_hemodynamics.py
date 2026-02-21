import numpy as np
import pytest
from core.hemodynamics import HemodynamicsSimulator

def test_generate_mesh():
    sim = HemodynamicsSimulator()
    mask = np.zeros((20, 20, 20), dtype=np.uint8)
    mask[5:15, 5:15, 5:15] = 1

    mesh_data = sim.generate_mesh(mask)

    assert "vertices" in mesh_data
    assert "faces" in mesh_data
    assert mesh_data["surface_area_mm2"] > 0
    assert mesh_data["volume_mm3"] > 0

def test_generate_mesh_empty():
    sim = HemodynamicsSimulator()
    mask = np.zeros((20, 20, 20), dtype=np.uint8)

    with pytest.raises(ValueError):
        sim.generate_mesh(mask)

def test_compute_vertex_wss():
    sim = HemodynamicsSimulator()
    mask = np.zeros((20, 20, 20), dtype=np.uint8)
    mask[5:15, 5:15, 5:15] = 1
    mesh_data = sim.generate_mesh(mask)

    vertices = np.array(mesh_data["vertices"])
    faces = np.array(mesh_data["faces"])
    result = sim.compute_vertex_wss(vertices, faces)

    # WSS array length must match vertex count
    assert len(result["vertex_wss"]) == len(vertices)

    # Values must be in valid range
    wss_arr = np.array(result["vertex_wss"])
    assert np.all(wss_arr >= 0)
    assert np.all(wss_arr <= 200)

    # Summary stats present and sensible
    assert result["mean_wss_pa"] > 0
    assert result["max_wss_pa"] >= result["mean_wss_pa"]
    assert result["min_wss_pa"] <= result["mean_wss_pa"]
    assert result["wss_std_pa"] >= 0
    assert len(result["peak_wss_location"]) == 3

def test_compute_flow_direction():
    sim = HemodynamicsSimulator()
    mask = np.zeros((20, 20, 20), dtype=np.uint8)
    mask[5:15, 5:15, 5:15] = 1
    mesh_data = sim.generate_mesh(mask)

    vertices = np.array(mesh_data["vertices"])
    result = sim.compute_flow_direction(vertices)

    # Direction must be a unit vector
    direction = np.array(result["direction"])
    assert len(direction) == 3
    assert abs(np.linalg.norm(direction) - 1.0) < 1e-6

    # Elongation ratio must be positive
    assert result["elongation_ratio"] > 0

def test_simulate_baseline_with_vertex_data():
    sim = HemodynamicsSimulator()
    mask = np.zeros((20, 20, 20), dtype=np.uint8)
    mask[5:15, 5:15, 5:15] = 1
    mesh_data = sim.generate_mesh(mask)

    result = sim.simulate_baseline_flow(mesh_data["vertices"], mesh_data["faces"])

    # Must contain vertex_wss array matching vertex count
    assert "vertex_wss" in result
    assert len(result["vertex_wss"]) == len(mesh_data["vertices"])

    # Must contain flow direction
    assert "flow_direction" in result
    direction = np.array(result["flow_direction"])
    assert abs(np.linalg.norm(direction) - 1.0) < 1e-6

    # Must contain all hemodynamic fields
    assert "mean_wss_pa" in result
    assert "max_wss_pa" in result
    assert "min_wss_pa" in result
    assert "wss_std_pa" in result
    assert "peak_wss_location" in result
    assert "mean_osi" in result
    assert "elongation_ratio" in result
    assert "flow_status" in result

def test_simulate_treatments():
    sim = HemodynamicsSimulator()
    baseline = {"mean_wss_pa": 20.0, "max_wss_pa": 100.0, "mean_osi": 0.3}

    # Test Flow Diverter (Expect massive drop in WSS inside sac)
    fd_result = sim.simulate_treatment("flow_diverter", baseline)
    assert fd_result["mean_wss_pa"] < baseline["mean_wss_pa"]
    assert fd_result["mean_osi"] < baseline["mean_osi"]

    # Test Surgical Clip
    clip_result = sim.simulate_treatment("surgical_clip", baseline)
    assert clip_result["mean_osi"] == 0.05  # Restored laminar flow

    # Test unknown treatment
    with pytest.raises(ValueError):
        sim.simulate_treatment("unknown_device", baseline)
