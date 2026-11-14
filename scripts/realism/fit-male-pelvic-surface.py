"""Register the external pelvic skin of BodyParts3D FJ2810 onto the male MakeHuman skin.

blender -b --factory-startup --python-exit-code 1 --python scripts/realism/fit-male-pelvic-surface.py -- /path/to/FJ2810.obj
"""

import hashlib
import json
from pathlib import Path
import sys

import numpy as np
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

ROOT = Path(__file__).resolve().parents[2] / "public"
HUMAN = ROOT / "human"
SOURCE_SHA256 = "50fb17d0b3559b8b6c5481dbe7f877d25726e576564da615c45b2dd7654e315d"


def array(data, spec, key, width, dtype, count):
    return np.frombuffer(data, dtype, count * width, spec[key]).reshape(-1, width)


def source_patch(path):
    contents = path.read_bytes()
    if hashlib.sha256(contents).hexdigest() != SOURCE_SHA256:
        raise ValueError("Expected the original BodyParts3D 4.0 skin FJ2810.obj")
    vertices, normals, triangles = [], [], []
    for line in contents.decode().splitlines():
        if line.startswith("v "):
            vertices.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("vn "):
            normals.append(tuple(map(float, line.split()[1:4])))
        elif line.startswith("f "):
            triangles.append(
                [int(token.split("/")[0]) - 1 for token in line.split()[1:]]
            )
    axes = np.array([1, 1, -1])
    xyz = np.array(vertices)[:, [0, 2, 1]] * axes
    normals = np.array(normals)[:, [0, 2, 1]] * axes
    faces = np.array(triangles)
    # Same registration of skin bounds as scripts/add-bodyparts3d.mjs.
    atlas = ROOT / "anatomy"
    shell = json.loads((atlas / "anatomy.json").read_text())["bodies"]["male"]["skin"]
    target = array(
        (atlas / "anatomy.bin").read_bytes(), shell, "pos", 3, "<f4", shell["verts"]
    )
    scale = np.ptp(target[:, 1]) / np.ptp(xyz[:, 1])
    offset = (target.min(0) + target.max(0) - scale * (xyz.min(0) + xyz.max(0))) / 2
    xyz = xyz * scale + offset
    radius = np.hypot(xyz[:, 0] / 0.053, (xyz[:, 1] - 0.836) / 0.074)
    mask = (radius < 1) & (xyz[:, 2] > 0.016)
    faces = faces[mask[faces].all(1)]
    # The source contains sheets for both faces of the skin. Follow connectivity
    # from the frontmost point on the outer surface so the inner lining is omitted.
    neighbors = {}
    for a, b, c in faces:
        for u, v, w in ((a, b, c), (b, c, a), (c, a, b)):
            neighbors.setdefault(u, set()).update((v, w))
    seed = max(neighbors, key=lambda i: xyz[i, 2])
    stack, visited = [seed], {seed}
    while stack:
        new = neighbors[stack.pop()] - visited
        visited.update(new)
        stack.extend(new)
    faces = faces[np.isin(faces[:, 0], list(visited))]
    ids, inverse = np.unique(faces.flatten(), return_inverse=True)
    surface = BVHTree.FromPolygons(
        xyz.tolist(), np.array(triangles).tolist(), all_triangles=True
    )
    top = surface.ray_cast((0, 0.895, 0.5), (0, 0, -1))[0]
    return xyz[ids], normals[ids], inverse.reshape(-1, 3), radius[ids], top.z


def fit(path):
    output = HUMAN / "male.bin"
    manifest = HUMAN / "male.json"
    metadata = json.loads(manifest.read_text())
    spec, data = metadata["skin"], output.read_bytes()
    base = metadata.get(
        "pelvicSurface", {"baseVerts": spec["verts"], "baseTris": spec["tris"]}
    )
    nv, nf = base["baseVerts"], base["baseTris"]
    v = array(data, spec, "pos", 3, "<f4", nv)
    normals = array(data, spec, "nrm", 3, "<f4", nv)
    uv = array(data, spec, "uv", 2, "<f4", nv)
    faces = array(data, spec, "idx", 3, "<u2", nf)
    receiver = BVHTree.FromPolygons(v.tolist(), faces.tolist(), all_triangles=True)
    patch, pn, pf, radius, reference_top = source_patch(path)
    # The suprapubic skin sits farther forward on the posed MakeHuman. Measure
    # that offset immediately above the source anatomy at the centre line.
    top = receiver.ray_cast((0, 0.895, 0.5), (0, 0, -1))[0]
    registration = top.z - reference_top
    patch[:, 2] += registration
    # Fade from every cut edge, including the deep, transverse cut between the
    # thighs. A purely frontal mask would leave this edge exposed from below.
    source_edges, counts = np.unique(
        np.sort(pf[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2), axis=1),
        axis=0,
        return_counts=True,
    )
    border_ids = np.unique(source_edges[counts == 1])
    border = KDTree(len(border_ids))
    for j in border_ids:
        border.insert(patch[j], int(j))
    border.balance()
    puv, signed = [], []
    for i, point in enumerate(patch):
        nearest, _, face, _ = receiver.find_nearest(point)
        ids = faces[face]
        a, b, c = v[ids]
        w = np.linalg.lstsq(
            np.stack([b - a, c - a]).T, np.array(nearest) - a, rcond=None
        )[0]
        weights = np.array([1 - w.sum(), *w])
        receiver_uv = weights @ uv[ids]
        normal = weights @ normals[ids]
        normal /= np.linalg.norm(normal)
        distance = (point - np.array(nearest)) @ normal
        # Bury the harvested perimeter in the receiving surface over a 12–16 mm
        # collar. Its normal converges to the receiving normal at the skin join.
        t = np.clip(
            max((radius[i] - 0.70) / 0.24, 1 - border.find(point)[2] / 0.012), 0, 1
        )
        fade = t * t * (3 - 2 * t)
        if distance > -0.006:
            patch[i] -= fade * (distance + 0.006) * normal
            distance -= fade * (distance + 0.006)
        blend = np.clip((0.005 - distance) / 0.008, 0, 1)
        pn[i] = (1 - blend) * pn[i] + blend * normal
        signed.append(distance)
        # The MakeHuman texture has a UV seam at the inner thighs. Transfer a
        # continuous swatch of the same model's adjacent suprapubic skin.
        tx = point[0] * 0.55
        ty = 0.907 + (point[1] - 0.835) * 0.29
        hit, _, tri, _ = receiver.ray_cast((tx, ty, 0.5), (0, 0, -1))
        ids = faces[tri]
        a, b, c = v[ids]
        w = np.linalg.lstsq(np.stack([b - a, c - a]).T, np.array(hit) - a, rcond=None)[
            0
        ]
        patch_uv = np.array([1 - w.sum(), *w]) @ uv[ids]
        # At the join, sample the very same texel and normal as the skin below.
        coverage = np.clip(distance / 0.015, 0, 1)
        coverage *= coverage * (3 - 2 * coverage)
        puv.append(receiver_uv + coverage * (patch_uv - receiver_uv))
    signed = np.array(signed)
    # Keep a narrow overlap under the seam. Hidden source facets elsewhere
    # would make a second skin layer when the inspection lens is active.
    pf = pf[signed[pf].max(1) > -0.003]
    ids, compact = np.unique(pf.flatten(), return_inverse=True)
    pf = compact.reshape(-1, 3)
    edges, counts = np.unique(
        np.sort(pf[:, [[0, 1], [1, 2], [2, 0]]].reshape(-1, 2), axis=1),
        axis=0,
        return_counts=True,
    )
    edge_depth = signed[ids[edges[counts == 1]]].max()
    if edge_depth > 0 or len(ids) < 250 or nv + len(ids) > 65535:
        raise ValueError(
            f"Invalid surface boundary ({edge_depth*1000:.2f} mm); vertices {len(ids)}"
        )
    pos = np.vstack((v, patch[ids]))
    nrm = np.vstack((normals, pn[ids] / np.linalg.norm(pn[ids], axis=1)[:, None]))
    tex = np.vstack((uv, np.asarray(puv)[ids]))
    tri = np.vstack((faces, pf + nv))
    front = BVHTree.FromPolygons(pos.tolist(), tri.tolist(), all_triangles=True)
    for y in (0.805, 0.825, 0.845):
        base_z = receiver.ray_cast((0, y, 0.5), (0, 0, -1))[0].z
        front_z = front.ray_cast((0, y, 0.5), (0, 0, -1))[0].z
        if front_z - base_z < 0.035:
            raise ValueError(f"Missing external anatomy at y={y:.3f} m")
    binary = bytearray()
    for key, values, dtype in (
        ("pos", pos, "<f4"),
        ("nrm", nrm, "<f4"),
        ("uv", tex, "<f4"),
        ("idx", tri, "<u2"),
    ):
        spec[key] = len(binary)
        binary.extend(values.astype(dtype).tobytes())
    spec.update(verts=len(pos), tris=len(tri), center=np.round(pos.mean(0), 5).tolist())
    metadata["pelvicSurface"] = base
    output.write_bytes(binary)
    manifest.write_text(json.dumps(metadata, separators=(",", ":")) + "\n")
    print(
        f"Registered male exterior: {len(ids)} vertices, {len(pf)} triangles; perimeter {edge_depth*1000:.2f} mm inside base"
    )


if __name__ == "__main__":
    fit(Path(sys.argv[sys.argv.index("--") + 1]))
