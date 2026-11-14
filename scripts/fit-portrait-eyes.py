"""Bake portrait eye supports from the reference atlases. Run from the repo root:
blender -b --factory-startup --python-exit-code 1 --python scripts/fit-portrait-eyes.py
"""

import json
import math
import re
from pathlib import Path

import numpy as np
from mathutils.bvhtree import BVHTree


ROOT = Path(__file__).resolve().parents[1]
ANATOMY = ROOT / "public/anatomy"
OUTPUT = ROOT / "src/body/portrait/portraitEyeOpenings.json"
DIRECTIONS = 48
OVERLAP = 0.0045  # The outer ring extends beneath the lids, in metres.
RECESS = 0.0020
RAY_LIMIT = 0.026


def surface(part, buffer):
    vertices = np.frombuffer(buffer, "<f4", offset=part["pos"], count=3 * part["verts"])
    indices = np.frombuffer(buffer, "<u4", offset=part["idx"], count=3 * part["tris"])
    return BVHTree.FromPolygons(
        vertices.reshape(-1, 3).tolist(), indices.reshape(-1, 3).tolist(), all_triangles=True
    )


def front_depth(tree, x, y):
    hit = tree.ray_cast((x, y, 1.0), (0, 0, -1))[0]
    return hit.z if hit else -math.inf


def match_opening(skin, globe, center):
    x, y, z = center
    # Some atlases already have a continuous skin surface across the eye.
    if front_depth(skin, x, y) > front_depth(globe, x, y):
        return None
    center_z = front_depth(globe, x, y) - RECESS
    rim = []
    for i in range(DIRECTIONS):
        angle = math.tau * i / DIRECTIONS
        dx, dy = math.cos(angle), math.sin(angle)

        def lid_depth(radius):
            return front_depth(skin, x + dx * radius, y + dy * radius)

        # The front ray passes through the opening to the back of the head until
        # the first lid is reached. March before bisection to find the first edge.
        step = 0.00025
        radius = step
        while radius < RAY_LIMIT and lid_depth(radius) < z - 0.012:
            radius += step
        if radius >= RAY_LIMIT:
            raise ValueError("Could not locate eyelid on the reference mesh")
        low, high = radius - step, radius
        for _ in range(8):
            middle = (low + high) / 2
            if lid_depth(middle) < z - 0.012:
                low = middle
            else:
                high = middle

        # Sample on both sides of the overlap for thin or sloping lid margins.
        # A lower rim keeps the fitted support inside the visible lid.
        lid_samples = [lid_depth(high + margin) for margin in np.linspace(0.00005, OVERLAP, 13)]
        # The mesh can fold back into the open socket under the eyelid.
        lid_samples = [depth for depth in lid_samples if depth >= z - 0.016]
        rim_z = min(lid_samples, default=lid_depth(high))
        if not math.isfinite(rim_z) or rim_z < z - 0.012:
            # Some narrow corners extend beyond the initial edge in this direction.
            rim_z = lid_depth(high + 0.00005)
        radius = high
        # A lid can rise above the optical apex. Bound the support to a curved
        # front using the globe radius measured at its centre.
        globe_radius = center_z + RECESS - z
        rim_z = min(rim_z, center_z + RECESS - radius ** 2 / (2 * globe_radius))
        rim.append([dx * radius, dy * radius, rim_z - RECESS - center_z])
    # Offsets use tenths of a millimetre, making the generated data compact.
    return {
        "center": [round(x, 5), round(y, 5), round(center_z, 5)],
        "rim": [[round(v * 10000) for v in point] for point in rim],
    }


def main():
    buffer = (ANATOMY / "anatomy.bin").read_bytes()
    bodies = json.loads((ANATOMY / "anatomy.json").read_text())["bodies"]
    patches = {}
    for name, body in bodies.items():
        skin = surface(body["skin"], buffer)
        eyes = {}
        for eye in body["organs"]:
            if eye["name"].endswith("eyeball"):
                fitted = match_opening(skin, surface(eye, buffer), eye["center"])
                if fitted:
                    eyes[eye["name"]] = fitted
        patches[name] = eyes
    # Keep each coordinate triplet on one line to match the project's JSON format.
    serialized = json.dumps(patches, indent=2)
    serialized = re.sub(r"\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]", r"[\1, \2, \3]", serialized)
    OUTPUT.write_text(serialized + "\n")


if __name__ == "__main__":
    main()
