"""Bake the two CC0 MakeHuman skins in atlas coordinates. See public/human/SOURCES.md."""

import argparse
from collections import defaultdict
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parents[1]
ORIGINALS = ROOT / "public/anatomy"
OUT = ROOT / "public/human"
# Joint centres in the two reference atlases, in metres, on the anatomical left.
# Her reference forearm lies farther away from the hip.
ANCHORS = {
    "male": {
        "shoulder": [0.174, 1.422, -0.039],
        "elbow": [0.231, 1.155, -0.055],
        "hand": [0.255, 0.932, 0.003],
        "finger-3-4": [0.290, 0.744, 0.098],
        "upper-leg": [0.090, 0.940, -0.024],
        "knee": [0.081, 0.497, -0.002],
        "ankle": [0.080, 0.078, -0.024],
        "toe-1-3": [0.061, 0.022, 0.139],
    },
    "female": {
        "shoulder": [0.167, 1.350, -0.035],
        "elbow": [0.249, 1.093, -0.012],
        "hand": [0.357, 0.907, 0.037],
        "finger-3-4": [0.439, 0.749, 0.066],
        "upper-leg": [0.107, 0.903, -0.013],
        "knee": [0.118, 0.482, -0.006],
        "ankle": [0.125, 0.070, -0.024],
        "toe-1-3": [0.105, 0.019, 0.132],
    },
}


def obj(path):
    xyz, uv, faces, group = [], [], [], ""
    for line in path.read_text().splitlines():
        parts = line.split()
        if not parts:
            continue
        if parts[0] == "v":
            xyz.append(tuple(map(float, parts[1:4])))
        elif parts[0] == "vt":
            uv.append(tuple(map(float, parts[1:3])))
        elif parts[0] == "g":
            group = parts[1]
        elif parts[0] == "f" and group == "body":
            poly = [tuple(int(v) - 1 for v in s.split("/")[:2]) for s in parts[1:]]
            for j in range(1, len(poly) - 1):
                faces.append((poly[0], poly[j], poly[j + 1]))
    return np.array(xyz), np.array(uv), np.array(faces)


def align_bone(points, a, b, new_a, new_b):
    axis, new_axis = b - a, new_b - new_a
    length, new_length = np.linalg.norm(axis), np.linalg.norm(new_axis)
    axis, new_axis = axis / length, new_axis / new_length
    cross = np.cross(axis, new_axis)
    sine = np.linalg.norm(cross)
    rotation = Rotation.from_rotvec(
        cross * (np.arctan2(sine, axis @ new_axis) / max(sine, 1e-15))
    )
    offset = points - a
    # Stretch only along the bone so differences in limb length preserve girth.
    offset += ((new_length / length - 1) * (offset @ axis))[:, None] * axis
    return rotation.apply(offset) + new_a


def bake_shape(sex, atlas, sources, base, skin_indices, groups, weights):
    deltas = np.zeros_like(base)
    for shape in ("asian", "african", "caucasian"):
        table = np.loadtxt(sources / f"{shape}-{sex}-young.target.gz")
        deltas[table[:, 0].astype(int)] += table[:, 1:] / 3
    q = base + deltas
    q[:, 1] -= q[skin_indices, 1].min()
    q *= atlas["height"] / q[skin_indices, 1].max()

    def verts(name):
        return [i for start, end in groups[name] for i in range(start, end + 1)]

    def landmark(name):
        return q[verts(name)].mean(axis=0)

    source_eyes = [landmark("joint-" + s + "-eye") for s in ("r", "l")]
    old_eyes = [
        next(o["center"] for o in atlas["organs"] if o["name"] == side + " eyeball")
        for side in ("right", "left")
    ]
    displacement = np.mean(old_eyes, axis=0) - np.mean(source_eyes, axis=0)
    # Position the face relative to the atlas while keeping soles on the ground.
    fractions = np.clip(q[:, 1] / atlas["height"], 0, 1)
    body = q.copy()
    body[:, 0] += displacement[0]
    body[:, 1] += displacement[1] * np.interp(
        fractions, [0, 0.8, 0.88, 0.96, 1], [0, 0, 1, 1, 0]
    )
    body[:, 2] += np.interp(
        fractions,
        [0, 0.55, 0.82, 0.90, 1],
        [-0.04, -0.018, -0.041, displacement[2], displacement[2]],
    )

    targets, skinning = {}, {}
    for side in ("l", "r"):
        targets[side] = {
            k: np.array(v) * np.array([1 if side == "l" else -1, 1, 1])
            for k, v in ANCHORS[sex].items()
        }
        for name, start, end in [
            ("upperarm", "shoulder", "elbow"),
            ("lowerarm", "elbow", "hand"),
            ("hand", "hand", "finger-3-4"),
            ("thigh", "upper-leg", "knee"),
            ("calf", "knee", "ankle"),
            ("foot", "ankle", "toe-1-3"),
        ]:
            a, b = (landmark("joint-" + side + "-" + k) for k in (start, end))
            skinning[name + "_" + side] = align_bone(
                q, a, b, targets[side][start], targets[side][end]
            )
    result = body.copy()
    for bone, entries in weights.items():
        if not entries:
            continue
        side = bone[-1]
        driven = bone
        if bone.startswith(("thumb_", "index_", "middle_", "ring_", "pinky_")):
            driven = "hand_" + side
        if bone.startswith("ball_"):
            driven = "foot_" + side
        if driven not in skinning:
            continue
        ids, w = np.array(entries).T
        ids = ids.astype(int)
        result[ids] += (skinning[driven][ids] - body[ids]) * w[:, None]
    eyes = []
    for side, name in [("r", "right eyeball"), ("l", "left eyeball")]:
        cage = verts("helper-" + side + "-eye")
        centre = body[verts("joint-" + side + "-eye")].mean(axis=0)
        eyes.append(
            {
                "name": name,
                "center": np.round(centre, 7).tolist(),
                "radius": round(
                    float(np.median(np.linalg.norm(body[cage] - centre, axis=1))), 7
                ),
            }
        )
    return result, eyes


def unit_normals(points, indices):
    a, b, c = points[indices[:, 0]], points[indices[:, 1]], points[indices[:, 2]]
    n = np.cross(b - a, c - a)
    normals = np.zeros(points.shape)
    for corner in range(3):
        np.add.at(normals, indices[:, corner], n)
    return normals / np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-20)


ALBEDO_SHA256 = {
    "male": "5a53213f061bfa97ee0afd6b40650ffbc089a479c144e63f3c39acceca5853c0",
    "female": "8d8b7dac34f97ebdd8605b51d527ac6863685054b33e1004b3e309599542beaf",
}


def bake_arm_weights(weights, corners):
    """Bake shoulder and elbow influence shared by the two hm08 skin topologies."""
    result = np.zeros((int(corners.max()) + 1, 2))
    for bone, entries in weights.items():
        upper = bone.startswith("upperarm_")
        distal = bone.startswith(
            ("lowerarm_", "hand_", "index_", "middle_", "ring_", "pinky_", "thumb_")
        )
        if upper or distal:
            ids, w = np.asarray(entries).T
            keep = ids < len(result)
            ids = ids[keep].astype(int)
            result[ids, 0] += w[keep]
            if distal:
                result[ids, 1] += w[keep]
    return np.uint8(np.rint(255 * np.clip(result[corners], 0, 1)))


def bake(sources):
    OUT.mkdir(parents=True, exist_ok=True)
    for sex, digest in ALBEDO_SHA256.items():
        if (
            hashlib.sha256((sources / (sex + ".png")).read_bytes()).hexdigest()
            != digest
        ):
            raise ValueError(
                f"Unexpected {sex} skin image; see public/human/SOURCES.md"
            )
    base, uv, faces = obj(sources / "base.obj")
    groups = json.loads((sources / "groups.json").read_text())
    weights = json.loads((sources / "weights.json").read_text())["weights"]
    atlas = json.loads((ORIGINALS / "anatomy.json").read_text())["bodies"]
    skin_indices = np.unique(faces[:, :, 0])
    corners, inverse = np.unique(faces.reshape(-1, 2), axis=0, return_inverse=True)
    indices = inverse.reshape(-1, 3)
    (OUT / "arm-weights.bin").write_bytes(
        bake_arm_weights(weights, corners[:, 0]).tobytes()
    )
    uv = uv[corners[:, 1]]
    # Official UV masks identify each lip and nail polygon. Give all of its
    # rendered vertices, including seam duplicates, the same region membership.
    regions = defaultdict(set)
    for mask, name in [
        ("fingernails", "nails"),
        ("toenails", "nails"),
        ("lips", "lips"),
    ]:
        image = np.asarray(Image.open(sources / (mask + ".jpg")).convert("L"))
        xy = uv[indices].mean(axis=1)
        x = np.clip((xy[:, 0] * image.shape[1]).astype(int), 0, image.shape[1] - 1)
        y = np.clip(
            ((1 - xy[:, 1]) * image.shape[0]).astype(int), 0, image.shape[0] - 1
        )
        regions[name].update(indices[image[y, x] > 127].flatten().tolist())
    for sex in ("male", "female"):
        shape, eyes = bake_shape(
            sex, atlas[sex], sources, base, skin_indices, groups, weights
        )
        normals = unit_normals(shape, faces[:, :, 0])
        vertices = shape[corners[:, 0]]
        geom = {
            "name": "skin",
            "verts": len(corners),
            "tris": len(indices),
            "center": np.round(vertices.mean(0), 5).tolist(),
        }
        binary = bytearray()
        for key, arr, dtype in [
            ("pos", vertices, "<f4"),
            ("nrm", normals[corners[:, 0]], "<f4"),
            ("uv", uv, "<f4"),
            ("idx", indices, "<u2"),
        ]:
            geom[key] = len(binary)
            binary.extend(np.asarray(arr, dtype=dtype).tobytes())
        (OUT / (sex + ".bin")).write_bytes(binary)
        metadata = {
            "skin": geom,
            "height": atlas[sex]["height"],
            "albedo": "/human/" + sex + ".webp",
            "eyes": eyes,
            "regions": {k: sorted(v) for k, v in regions.items()},
        }
        (OUT / (sex + ".json")).write_text(
            json.dumps(metadata, separators=(",", ":")) + "\n"
        )
        image = Image.open(sources / (sex + ".png")).convert("RGB")
        image.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        image.save(OUT / (sex + ".webp"), format="WEBP", quality=90, method=6)
        print(sex, geom, f"eyes {eyes}", [(k, len(v)) for k, v in regions.items()])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path)
    bake(parser.parse_args().sources)
