"""Extract sex-specific human reference anatomy into the local atlas.

Run after add-bodyparts3d.mjs and fit-female-body.mjs with Blender's Python, which supplies numpy and mathutils:
blender -b --factory-startup --python-exit-code 1 --python scripts/realism/extract-female-pelvis.py -- /path/to/3d-vh-f-united.glb /path/to/3d-vh-m-lung.glb /path/to/3d-vh-m-spleen.glb /path/to/3d-vh-m-spinal-cord.glb
Source: https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.10/assets/3d-vh-f-united.glb
"""

from pathlib import Path
import hashlib
import json
import struct
import sys

import numpy as np
from mathutils import Matrix, Quaternion, Vector

ROOT = Path(__file__).resolve().parents[2]


class Source:
    def __init__(self, filename, digest):
        self.blob = Path(filename).read_bytes()
        if hashlib.sha256(self.blob).hexdigest() != digest:
            raise ValueError(f"Unexpected HRA source version in {filename}")
        length = struct.unpack_from("<I", self.blob, 12)[0]
        self.doc = json.loads(self.blob[20 : 20 + length])
        self.base = 28 + length
        self.nodes = self.doc["nodes"]
        self.parents = {
            child: i
            for i, node in enumerate(self.nodes)
            for child in node.get("children", [])
        }

    def transform(self, i):
        node = self.nodes[i]
        if "matrix" in node:
            local = Matrix(np.reshape(node["matrix"], (4, 4)).T.tolist())
        else:
            x, y, z, w = node.get("rotation", [0, 0, 0, 1])
            local = Matrix.LocRotScale(
                Vector(node.get("translation", [0, 0, 0])),
                Quaternion((w, x, y, z)),
                Vector(node.get("scale", [1, 1, 1])),
            )
        return self.transform(self.parents[i]) @ local if i in self.parents else local

    def array(self, i):
        acc = self.doc["accessors"][i]
        view = self.doc["bufferViews"][acc["bufferView"]]
        size = {"VEC3": 3, "SCALAR": 1}[acc["type"]]
        dtype = np.dtype({5123: "<u2", 5125: "<u4", 5126: "<f4"}[acc["componentType"]])
        return np.ndarray(
            (acc["count"], size),
            dtype,
            buffer=self.blob,
            offset=self.base + view.get("byteOffset", 0) + acc.get("byteOffset", 0),
            strides=(view.get("byteStride", dtype.itemsize * size), dtype.itemsize),
        )

    def mesh(self, name):
        i = next(i for i, n in enumerate(self.nodes) if n["name"] == name)
        (prim,) = self.doc["meshes"][self.nodes[i]["mesh"]]["primitives"]
        matrix = np.array(self.transform(i))
        pos = (
            self.array(prim["attributes"]["POSITION"]) @ matrix[:3, :3].T
            + matrix[:3, 3]
        )
        return pos, self.array(prim["indices"]).reshape(-1, 3)


female_file, lung_file, spleen_file, cord_file = sys.argv[sys.argv.index("--") + 1 :]
female = Source(
    female_file, "95f0c3d2f918582608692ca1139e8bdb18c147a16470e9ee9af8b276bd77c422"
)
lung = Source(
    lung_file, "bba95516fa993ac45c3b1c53f32b58d97232ffd78ae56397e5a2589c6ce4903d"
)
spleen = Source(
    spleen_file, "826012b9dc6b69064b76c3aabbce32a2baa32d1f97fde3e88a015f399c9040b8"
)

cord = Source(
    cord_file, "b8a2c2a288a8f7af84d5b93900b3c506a7996aa28518e9fb8a3ab9b6db6e6827"
)

atlas = json.loads((ROOT / "public/anatomy/anatomy.json").read_text())["bodies"][
    "female"
]
skin = atlas["skin"]
ref = np.fromfile(
    ROOT / "public/anatomy/anatomy.bin",
    "<f4",
    count=skin["verts"] * 3,
    offset=skin["pos"],
).reshape(-1, 3)
full, _ = female.mesh("VH_F_skin")
# The source skin and atlas reference are the same scan at different mesh resolutions.
# Align their bounding-box centres; preserve the metric scale of the bones.
offset = (ref.min(0) + ref.max(0) - full.min(0) - full.max(0)) / 2
assert np.max(np.abs(np.ptp(full, axis=0) - np.ptp(ref, axis=0))) < 0.006
retina, _ = female.mesh("VH_F_retina_R")
eye = next(o for o in atlas["organs"] if o["name"] == "right eyeball")["center"]
assert np.linalg.norm((retina.min(0) + retina.max(0)) / 2 + offset - eye) < 0.016


def extract(names, source=female, translation=offset):
    """Weld normal/UV seams independently for each labelled source surface."""
    verts, faces = [], []
    for name in names:
        positions, indices = source.mesh(
            ("VH_F_" if source is female else "VH_M_") + name
        )
        unique, remap = np.unique(
            np.round(positions + translation, 7), axis=0, return_inverse=True
        )
        faces.extend(remap[indices] + len(verts))
        verts.extend(unique)
    verts = np.asarray(verts, dtype="<f4")
    faces = np.asarray(faces, dtype="<u4").reshape(-1, 3)
    valid = (
        np.linalg.norm(
            np.cross(
                verts[faces[:, 1]] - verts[faces[:, 0]],
                verts[faces[:, 2]] - verts[faces[:, 0]],
            ),
            axis=1,
        )
        > 1e-12
    )
    return verts, faces[valid]


def lung_parts(positions, triangles):
    """Split by connected surface; side is assigned to the complete component."""
    parent = list(range(len(positions)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for a, b, c in triangles:
        r = root(a)
        parent[root(b)] = r
        parent[root(c)] = r
    components = np.array([root(v) for v in triangles[:, 0]])
    groups = np.unique(components)
    by_side = {}
    for g in groups:
        current = triangles[components == g]
        x = positions[np.unique(current), 0].mean()
        side = "right lung" if x < 0 else "left lung"
        by_side.setdefault(side, []).append(current)
    for side, parts in by_side.items():
        used, idx = np.unique(np.vstack(parts), return_inverse=True)
        yield side, positions[used], idx.reshape(-1, 3).astype("<u4")


def center(p):
    return np.round((p.max(0).astype(float) + p.min(0)) / 2, 6).tolist()


out = ROOT / "public/anatomy"
verts, triangles = extract(
    ("sacrum", "coccyx", "ilium_compact_bone_R", "ilium_compact_bone_L")
)
(out / "female-pelvis.bin").write_bytes(verts.tobytes() + triangles.tobytes())
meta = dict(
    name="pelvis",
    pos=0,
    verts=len(verts),
    idx=verts.nbytes,
    tris=len(triangles),
    center=center(verts),
)
(out / "female-pelvis.json").write_text(json.dumps(meta, indent=2) + "\n")

# The same HRA source has the eight major leg bones and four uterine vessels.
# Keep the same local frame as the pelvis, source geometry preserved end to end.
manifest = json.loads((out / "anatomy.json").read_text())
atlas_buffer = (out / "anatomy.bin").read_bytes()
output = bytearray()
source_bones = [
    f"{name}_{side}"
    for side in ("L", "R")
    for name in ("femur", "patella", "tibia", "fibula")
]
# Median translation between the corresponding centres of 12 segmental bronchi
# in Visible Human male and BodyParts3D 4.0, measured in the atlas frame.
# Keep the source organ volumes and their left/right relationship intact.
male_offset = np.array([0.00527655, 0.84769366, 0.00123521])
spleen_surfaces = [
    part + "_of_spleen"
    for part in (
        "gastric_surface",
        "diaphragmatic_surface",
        "colic_surface",
        "hilum",
        "renal_surface",
    )
]
replacements = {
    "female": {
        "spleen": extract(spleen_surfaces),
        "pancreas": extract(
            [part + "_of_pancreas" for part in ("tail", "body", "head", "neck")]
        ),
    },
    "male": {"spleen": extract(spleen_surfaces, spleen, male_offset)},
}
for side in ("right", "left"):
    # Source hierarchy: five lobes, each divided into solid segment surfaces.
    # Airway/cartilage nodes are a different branch of the GLB.
    segments = [
        n["name"].removeprefix("VH_M_")
        for n in lung.nodes
        if "mesh" in n and "bronchopulmonary" in n["name"] and side in n["name"]
    ]
    assert len(segments) == 10
    replacements["male"][side + " lung"] = extract(segments, lung, male_offset)

# Preserve segment cross-sections and cranio-caudal length; the two atlas
# donors have different spinal curvature. These mid-sagittal canal centres
# were measured between the vertebral bodies and neural arches in BodyParts3D.
cord_names = [
    n["name"].removeprefix("VH_M_")
    for n in cord.nodes
    if "mesh" in n and "segment" in n["name"]
]
assert len(cord_names) == 30
positions, faces = extract(cord_names, cord, np.zeros(3))
positions[:, 1] += 1.600 - positions[:, 1].max()
levels = np.linspace(positions[:, 1].min(), positions[:, 1].max(), 55)
centres = []
for level in levels:
    section = positions[np.abs(positions[:, 1] - level) < 0.006]
    centres.append((section.max(0) + section.min(0)) / 2)
centres = np.array(centres)
canal = np.array(
    [
        [1.130, -0.0275],
        [1.163, -0.0355],
        [1.196, -0.0455],
        [1.218, -0.0525],
        [1.251, -0.060],
        [1.284, -0.0645],
        [1.295, -0.069],
        [1.328, -0.071],
        [1.361, -0.0685],
        [1.394, -0.0615],
        [1.416, -0.056],
        [1.438, -0.0475],
        [1.46, -0.0395],
        [1.482, -0.030],
        [1.504, -0.027],
        [1.537, -0.030],
        [1.548, -0.0325],
        [1.570, -0.0355],
        [1.600, -0.043],
    ]
)
positions[:, 0] -= np.interp(positions[:, 1], levels, centres[:, 0])
positions[:, 2] += np.interp(positions[:, 1], canal[:, 0], canal[:, 1]) - np.interp(
    positions[:, 1], levels, centres[:, 2]
)
replacements["male"]["spinal cord"] = positions, faces


def append_mesh(body, name, pos, tri):
    spec = dict(
        name=name, verts=len(pos), tris=len(tri), center=center(pos), pos=len(output)
    )
    output.extend(pos.tobytes())
    spec["idx"] = len(output)
    output.extend(tri.tobytes())
    body["organs"].append(spec)


for build, body in manifest["bodies"].items():
    for mesh in [*body["organs"], body["skin"]]:
        pos = np.frombuffer(
            atlas_buffer, "<f4", mesh["verts"] * 3, mesh["pos"]
        ).reshape(-1, 3)
        tri = np.frombuffer(atlas_buffer, "<u4", mesh["tris"] * 3, mesh["idx"]).reshape(
            -1, 3
        )
        normals = (
            np.frombuffer(atlas_buffer, "<f4", mesh["verts"] * 3, mesh["nrm"])
            if "nrm" in mesh
            else None
        )
        name = mesh["name"]
        if build == "female" and name in ("leg bones", "arteries", "veins"):
            if name == "leg bones":
                start = mesh["footVertexStart"]
                stop = mesh.get("footVertexEnd", len(pos))
                # The BodyParts3D import writes the 52 named foot bones last.
                base_positions = pos[start:stop]
                indices = tri[(tri >= start).all(1) & (tri < stop).all(1)] - start
                supplement, faces = extract(source_bones)
                mesh["footVertexStart"], mesh["footVertexEnd"] = 0, len(base_positions)
            else:
                stop = mesh.setdefault("bodyPartsVertexCount", len(pos))
                base_positions, indices = pos[:stop], tri[(tri < stop).all(1)]
                noun = "artery" if name == "arteries" else "vein"
                supplement, faces = extract(
                    [f"{side}_uterine_{noun}" for side in ("left", "right")]
                )
            pos = np.vstack((base_positions, supplement)).astype("<f4")
            tri = np.vstack((indices, faces + len(base_positions))).astype("<u4")
            mesh.update(verts=len(pos), tris=len(tri), center=center(pos))
        if build == "female" and name == "pelvis":
            pos, tri = verts, triangles
            mesh.update(verts=len(pos), tris=len(tri), center=center(pos))
        if name in replacements[build]:
            body["organs"].remove(mesh)
        elif build == "female" and name == "lungs":
            body["organs"].remove(mesh)
            for side, verts_out, tris_out in lung_parts(pos, tri):
                append_mesh(body, side, verts_out, tris_out)
        else:
            mesh["pos"] = len(output)
            output.extend(pos.tobytes())
            mesh["idx"] = len(output)
            output.extend(tri.tobytes())
            if normals is not None:
                mesh["nrm"] = len(output)
                output.extend(normals.tobytes())
    for name, (positions, faces) in replacements[build].items():
        append_mesh(body, name, positions, faces)
(out / "anatomy.bin").write_bytes(output)
(out / "anatomy.json").write_text(json.dumps(manifest, separators=(",", ":")))
print("Baked sex-specific HRA anatomy into the atlas.")
