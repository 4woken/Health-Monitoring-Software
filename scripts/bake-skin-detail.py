"""Bake in atlas coordinates, metres, Y up. From the repository root:
blender -b --factory-startup --python-exit-code 1 --python scripts/bake-skin-detail.py
Optionally pass -- --human to bake the registered CC0 render meshes in public/human.
"""

import json
import math
import struct
import sys
from pathlib import Path

import numpy as np
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[1]
ATLASES = ROOT / "public/anatomy"
HEADS = json.loads((ROOT / "src/body/portrait/referenceHeads.json").read_text())

# Digit tip landmarks picked from the extrema of the individual atlas hands and
# feet. The positive and negative sides of HRA are distinctly asymmetric.
HANDS = {
    "male": [
        [0.225, 0.765, 0.096],
        [0.253, 0.751, 0.108],
        [0.283, 0.739, 0.110],
        [0.316, 0.750, 0.104],
        [0.333, 0.808, 0.084],
    ],
    "female+": [
        [0.381, 0.752, 0.060],
        [0.412, 0.731, 0.067],
        [0.445, 0.742, 0.073],
        [0.468, 0.777, 0.073],
        [0.453, 0.856, 0.09],
    ],
    "female-": [
        [0.395, 0.750, 0.060],
        [0.429, 0.731, 0.067],
        [0.455, 0.742, 0.075],
        [0.481, 0.776, 0.074],
        [0.467, 0.855, 0.09],
    ],
}
TOES = {
    "male": [
        [0.118, 0.013, 0.154],
        [0.144, 0.011, 0.145],
        [0.158, 0.011, 0.134],
        [0.168, 0.009, 0.118],
        [0.176, 0.008, 0.101],
    ],
    "female+": [
        [0.122, 0.024, 0.175],
        [0.141, 0.028, 0.17],
        [0.154, 0.028, 0.163],
        [0.166, 0.024, 0.153],
        [0.176, 0.021, 0.140],
    ],
    "female-": [
        [0.141, 0.024, 0.178],
        [0.160, 0.027, 0.173],
        [0.175, 0.026, 0.166],
        [0.188, 0.024, 0.154],
        [0.198, 0.021, 0.139],
    ],
}


def unit(v):
    return v / max(np.linalg.norm(v), 1e-10)


def read_mesh(meta, buf, index_dtype):
    def attr(name, dtype, count):
        return np.frombuffer(buf, dtype, count=count, offset=meta[name]).reshape(-1, 3)

    p = attr("pos", "<f4", meta["verts"] * 3).astype(float)
    f = attr("idx", index_dtype, meta["tris"] * 3)
    n = (
        attr("nrm", "<f4", meta["verts"] * 3).astype(float)
        if "nrm" in meta
        else mesh_normals(p, f)
    )
    return p, f, n


def mesh_normals(p, f):
    cross = np.cross(p[f[:, 1]] - p[f[:, 0]], p[f[:, 2]] - p[f[:, 0]])
    sums = np.zeros_like(p)
    for col in f.T:
        np.add.at(sums, col, cross)
    return sums / np.maximum(np.linalg.norm(sums, axis=1, keepdims=True), 1e-12)


def surface(tree, point, direction):
    hit = tree.ray_cast(tuple(point), tuple(direction))[0]
    return np.array(hit) if hit is not None else None


def bell(p, center, radii):
    return np.exp(-0.5 * np.sum(((p - center) / radii) ** 2, axis=1))


def digit_nails(build, p, n, tree):
    """Locate the dorsal surface of each distal phalanx. Toe masks face up;
    fingertip masks face the back of each hand, including its distal curvature."""
    out = np.zeros(len(p))
    counts = []
    for side in (-1, 1):
        key = "male" if build == "male" else "female" + ("+" if side > 0 else "-")
        for foot, tips in ((True, TOES[key]), (False, HANDS[key])):
            for digit, raw in enumerate(tips):
                if foot:
                    toward = unit(
                        np.array([side * (0.26 if build == "male" else 0.10), 0.0, 1.0])
                    )
                    outward = np.array([0.0, 1.0, 0.0])
                    width = [0.0085, 0.005, 0.0047, 0.0042, 0.0038][digit]
                    length = [0.008, 0.0055, 0.005, 0.0045, 0.004][digit]
                else:
                    toward = unit(
                        np.array(
                            [side * (0.20 if build == "male" else 0.47), -0.84, 0.49]
                        )
                    )
                    outward = unit(np.array([side * 0.20, -0.44, -0.87]))
                    if digit == 4:
                        outward = unit(np.array([side * 0.65, -0.32, -0.65]))
                    width = [0.0046, 0.0055, 0.0058, 0.0056, 0.007][digit]
                    length = [0.0056, 0.0066, 0.007, 0.0066, 0.007][digit]
                seed = np.array([side * raw[0], raw[1], raw[2]])
                tip = p[np.argmin(np.linalg.norm(p - seed, axis=1))]
                axial = tip - toward * (length + 0.001)
                hit = surface(tree, axial + outward * 0.020, -outward)
                if hit is None or np.linalg.norm(hit - axial) > 0.018:
                    # The seed can sit on the tip's side. Snap to a dorsal vertex
                    # of that same digit and never paint its opposite/palmar side.
                    near = np.where(
                        (np.linalg.norm(p - axial, axis=1) < 0.015)
                        & (n @ outward > 0.15)
                    )[0]
                    if len(near) == 0:
                        raise ValueError(
                            f"Missing dorsal surface: {build} {side} {foot} {digit}"
                        )
                    hit = p[near[np.argmin(np.linalg.norm(p[near] - axial, axis=1))]]
                along = unit(toward - outward * np.dot(toward, outward))
                across = unit(np.cross(along, outward))
                delta = p - hit
                radius = (delta @ across / width) ** 2 + (delta @ along / length) ** 2
                distance = np.abs(delta @ outward)
                # A narrow shoulder allows the vertex mask to be interpolated on coarse toes.
                mask = np.clip((1.65 - radius) / 0.92, 0, 1) * np.clip(
                    (0.008 - distance) / 0.004, 0, 1
                )
                # Stored normals on the coarse BodyParts3D fingertips often point
                # sideways on both sides. Compare against the first triangle
                # along a dorsal ray rather than trusting those normals.
                for vertex in np.flatnonzero(mask):
                    first = surface(tree, p[vertex] + outward * 0.010, -outward)
                    if first is None or np.dot(first - p[vertex], outward) > 0.0015:
                        mask[vertex] = 0
                if mask.max() < 0.5:
                    nearest = np.where(
                        (n @ outward > 0.12) & (np.linalg.norm(delta, axis=1) < 0.012)
                    )[0]
                    if len(nearest):
                        mask[
                            nearest[np.argmin(np.linalg.norm(delta[nearest], axis=1))]
                        ] = 1.0
                counts.append(int((mask > 0.25).sum()))
                np.maximum(out, mask, out=out)
    return out, counts


def navel(build, p, f, n, tree, h, human):
    """Compare the central surface to a surrounding ring in the sagittal plane.
    Subtract curvature of the abdomen implicitly by using opposite directions."""
    x0 = 0 if build == "male" else -0.006
    # The MakeHuman topology places the navel slightly higher than either atlas.
    relative_y = (
        (0.622 if build == "male" else 0.596)
        if human
        else (0.602 if build == "male" else 0.589)
    )
    y0 = relative_y * h

    def front(x, y):
        v = surface(tree, (x, y, 0.6), (0, 0, -1))
        if v is None:
            raise ValueError("Expected an abdominal surface")
        return v[2]

    best = (-1, None)
    for x in np.arange(x0 - 0.009, x0 + 0.01, 0.003):
        for y in np.arange(y0 - 0.012, y0 + 0.013, 0.003):
            z = front(x, y)
            depth = (
                np.mean(
                    [
                        front(x + 0.012 * math.cos(a), y + 0.014 * math.sin(a))
                        for a in np.arange(12) * math.tau / 12
                    ]
                )
                - z
            )
            if depth > best[0]:
                best = (depth, np.array([x, y, z]))
    depth, center = best
    mask = bell(p, center, [0.006, 0.009, 0.018])
    verts = np.empty(0, "i")
    removed = np.zeros(len(p))
    if depth < 0.001:
        removed = np.where(mask > 0.014, mask * (0.005 - depth), 0.0)
        moved = p.copy()
        moved[:, 2] -= removed
        verts = np.unique(f[(removed[f] > 0).any(axis=1)])
        # Transfer only the change, keeping normals from any other authored seam.
        updated = n[verts] + (mesh_normals(moved, f)[verts] - mesh_normals(p, f)[verts])
        n[verts] = updated / np.maximum(
            np.linalg.norm(updated, axis=1, keepdims=True), 1e-9
        )
    return mask, verts, removed, depth


def bake(build, geom, height, source, out, groups=None, index_dtype="<u4"):
    p, f, n = read_mesh(geom, source, index_dtype)
    tree = BVHTree.FromPolygons(p.tolist(), f.tolist(), all_triangles=True)
    x, y, z = p.T
    male = build == "male"
    warmth = np.zeros(len(p))

    def warm(center, radius, weight):
        nonlocal warmth
        warmth = np.maximum(warmth, bell(p, center, radius) * weight)

    center_x = 0 if male else -0.006
    for side in (-1, 1):
        warm(
            [
                center_x + side * (0.043 if male else 0.048),
                height * (0.908 if male else 0.924),
                0.08 if male else 0.113,
            ],
            [0.029, 0.024, 0.037],
            0.9,
        )
        warm(
            [center_x + side * 0.072, height * 0.928, -0.011], [0.015, 0.028, 0.026], 1
        )
        warm(
            [side * (0.236 if male else 0.263), height * 0.67, -0.040],
            [0.052, 0.050, 0.044],
            0.83,
        )
        warm(
            [side * (0.104 if male else 0.136), height * 0.28, 0.039],
            [0.052, 0.049, 0.045],
            0.95,
        )
        warm(
            [
                side * (0.275 if male else 0.393),
                height * (0.49 if male else 0.515),
                0.065,
            ],
            [0.05, 0.054, 0.041],
            0.84,
        )
    face = HEADS[build]["points"]
    mouth_x = (face[61]["x"] + face[291]["x"]) * 0.5
    mouth_y = (face[0]["y"] + face[17]["y"]) * 0.5
    lip_width = abs(face[61]["x"] - face[291]["x"]) * 0.53
    lip_height = abs(face[0]["y"] - face[17]["y"]) * 0.58
    front = surface(tree, (mouth_x, mouth_y, 0.6), (0, 0, -1))[2]
    lips = np.clip(
        (1.4 - ((x - mouth_x) / lip_width) ** 2 - ((y - mouth_y) / lip_height) ** 2)
        / 0.65,
        0,
        1,
    ) * np.clip((z - front + 0.025) / 0.012, 0, 1)
    if groups and groups.get("lips"):
        lips[:] = 0
        lips[groups["lips"]] = 1
    if groups and groups.get("nails"):
        nails = np.zeros(len(p))
        nails[groups["nails"]] = 1
        counts = ["mesh group", len(groups["nails"])]
    else:
        nails, counts = digit_nails(build, p, n, tree)
    umbilicus, ids, removed, depth = navel(
        build, p, f, n, tree, height, groups is not None
    )
    weights = np.uint8(
        np.rint(np.stack([warmth, lips, nails, umbilicus], axis=1) * 255)
    )
    if (
        np.count_nonzero(nails) < 20
        or np.count_nonzero(lips) < 2
        or (all(isinstance(x, int) for x in counts) and min(counts) == 0)
    ):
        raise ValueError(f"Skin region calibration failed: {counts}")
    data = (
        bytearray(struct.pack("<4sII", b"SKD1", len(p), len(ids))) + weights.tobytes()
    )
    for v in ids:
        data.extend(struct.pack("<I4f", v, -removed[v], *n[v]))
    out.parent.mkdir(exist_ok=True, parents=True)
    out.write_bytes(data)
    print(
        f"{out.name}: {len(p)} vertices, {len(data)} bytes; original navel relief {depth*1000:.2f} mm, {len(ids)} displaced/adjacent vertices; nail vertices with coverage >25% per digit: {counts}"
    )


def main():
    if "--human" in sys.argv:
        root = ROOT / "public/human"
        for build in ("male", "female"):
            meta = json.loads((root / (build + ".json")).read_text())
            bake(
                build,
                meta["skin"],
                meta["height"],
                (root / (build + ".bin")).read_bytes(),
                root / (build + "-detail.bin"),
                meta["regions"],
                index_dtype="<u2",
            )
    else:
        bodies = json.loads((ATLASES / "anatomy.json").read_text())["bodies"]
        buf = (ATLASES / "anatomy.bin").read_bytes()
        for build, body in bodies.items():
            bake(
                build,
                body["skin"],
                body["height"],
                buf,
                ATLASES / (build + "-detail.bin"),
            )


if __name__ == "__main__":
    main()
