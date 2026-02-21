import numpy as np
import trimesh
from skimage.measure import marching_cubes


def extract_morphology(volume: np.ndarray, mask: np.ndarray) -> dict:
    """
    Extracts morphological features from the segmented aneurysm mask
    using real 3D geometry computed via trimesh.
    """
    binary_mask = (mask > 0.5).astype(np.uint8)
    aneurysm_voxels = int(np.sum(binary_mask == 1))

    if aneurysm_voxels == 0:
        return {
            "maximum_3d_diameter_mm": 0.0,
            "aspect_ratio_AR": 0.0,
            "size_ratio_SR": 0.0,
            "is_irregular": False,
            "aneurysm_voxel_count": 0,
            "surface_area_mm2": 0.0,
            "volume_mm3": 0.0,
            "neck_diameter_mm": 0.0,
            "irregularity_index": 0.0,
        }

    verts, faces, normals, _ = marching_cubes(binary_mask, level=0.5)
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, vertex_normals=normals)

    # Max 3D diameter from oriented bounding box extents
    try:
        obb_extents = mesh.bounding_box_oriented.extents
    except Exception:
        obb_extents = mesh.bounding_box.extents
    max_diameter = float(obb_extents.max())

    # PCA for primary axis
    vertices = np.array(mesh.vertices)
    centroid = vertices.mean(axis=0)
    centered = vertices - centroid
    cov = np.cov(centered.T)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)
    order = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[order]
    eigenvectors = eigenvectors[:, order]
    primary_axis = eigenvectors[:, 0]
    primary_axis = primary_axis / np.linalg.norm(primary_axis)

    # Project vertices onto primary axis for dome height
    projections = centered @ primary_axis
    dome_height = float(projections.max() - projections.min())

    # Neck diameter: spread of bottom 15% vertices perpendicular to primary axis
    p_min = projections.min()
    p_range = projections.max() - p_min
    threshold = p_min + 0.15 * p_range
    neck_mask = projections <= threshold
    if neck_mask.sum() > 1:
        neck_verts = centered[neck_mask]
        # Remove primary axis component to get perpendicular spread
        perp = neck_verts - np.outer(neck_verts @ primary_axis, primary_axis)
        perp_distances = np.linalg.norm(perp, axis=1)
        neck_diameter = float(2.0 * perp_distances.max())
    else:
        neck_diameter = max_diameter * 0.5

    # Aspect ratio: dome height / neck width
    aspect_ratio = dome_height / neck_diameter if neck_diameter > 0 else 1.0

    # Size ratio: max diameter / neck diameter (parent vessel proxy)
    size_ratio = max_diameter / neck_diameter if neck_diameter > 0 else 1.0

    # Irregularity index: std dev of vertex normal dot products with radial direction
    radial_dirs = centered / (np.linalg.norm(centered, axis=1, keepdims=True) + 1e-8)
    vertex_normals = np.array(mesh.vertex_normals)
    dot_products = np.sum(vertex_normals * radial_dirs, axis=1)
    irregularity_index = float(np.std(dot_products))

    is_irregular = irregularity_index > 0.3

    return {
        "maximum_3d_diameter_mm": round(max_diameter, 2),
        "aspect_ratio_AR": round(aspect_ratio, 2),
        "size_ratio_SR": round(size_ratio, 2),
        "is_irregular": is_irregular,
        "aneurysm_voxel_count": aneurysm_voxels,
        "surface_area_mm2": round(float(mesh.area), 2),
        "volume_mm3": round(abs(float(mesh.volume)), 2),
        "neck_diameter_mm": round(neck_diameter, 2),
        "irregularity_index": round(irregularity_index, 4),
    }
