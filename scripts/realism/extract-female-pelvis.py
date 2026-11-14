"""Extract the outer pelvic bones from the HRA united female v1.10 GLB.

Run with Blender's Python, which supplies numpy and mathutils:
blender -b --factory-startup --python-exit-code 1 --python scripts/realism/extract-female-pelvis.py -- /path/to/3d-vh-f-united.glb
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
SOURCE = Path(sys.argv[sys.argv.index("--") + 1])
blob = SOURCE.read_bytes()
length = struct.unpack_from("<I", blob, 12)[0]
doc = json.loads(blob[20 : 20 + length])
base = 28 + length
parents = {
    child: i
    for i, node in enumerate(doc["nodes"])
    for child in node.get("children", [])
}


def transform(i):
    node = doc["nodes"][i]
    if "matrix" in node:
        local = Matrix(np.reshape(node["matrix"], (4, 4)).T.tolist())
    else:
        x, y, z, w = node.get("rotation", [0, 0, 0, 1])
        local = Matrix.LocRotScale(
            Vector(node.get("translation", [0, 0, 0])),
            Quaternion((w, x, y, z)),
            Vector(node.get("scale", [1, 1, 1])),
        )
    return transform(parents[i]) @ local if i in parents else local


def array(i):
    acc = doc["accessors"][i]
    view = doc["bufferViews"][acc["bufferView"]]
    size = {"VEC3": 3, "SCALAR": 1}[acc["type"]]
    dtype = np.dtype({5123: "<u2", 5125: "<u4", 5126: "<f4"}[acc["componentType"]])
    return np.ndarray(
        (acc["count"], size),
        dtype,
        buffer=blob,
        offset=base + view.get("byteOffset", 0) + acc.get("byteOffset", 0),
        strides=(view.get("byteStride", dtype.itemsize * size), dtype.itemsize),
    )


def get_mesh(name):
    i = next(i for i, n in enumerate(doc["nodes"]) if n["name"] == name)
    (prim,) = doc["meshes"][doc["nodes"][i]["mesh"]]["primitives"]
    matrix = np.array(transform(i))
    pos = array(prim["attributes"]["POSITION"]) @ matrix[:3, :3].T + matrix[:3, 3]
    return pos, array(prim["indices"]).reshape(-1, 3)


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
full, _ = get_mesh("VH_F_skin")
# The source skin and atlas reference are the same scan at different mesh resolutions.
# Align their bounding-box centres; preserve the metric scale of the bones.
offset = (ref.min(0) + ref.max(0) - full.min(0) - full.max(0)) / 2
assert np.max(np.abs(np.ptp(full, axis=0) - np.ptp(ref, axis=0))) < 0.006
retina, _ = get_mesh("VH_F_retina_R")
eye = next(o for o in atlas["organs"] if o["name"] == "right eyeball")["center"]
assert np.linalg.norm((retina.min(0) + retina.max(0)) / 2 + offset - eye) < 0.016
verts, triangles = [], []
for name in ("sacrum", "coccyx", "ilium_compact_bone_R", "ilium_compact_bone_L"):
    positions, indices = get_mesh("VH_F_" + name)
    unique, remap = np.unique(
        np.round(positions + offset, 7), axis=0, return_inverse=True
    )
    triangles.extend(remap[indices] + len(verts))
    verts.extend(unique)
verts = np.asarray(verts, dtype="<f4")
triangles = np.asarray(triangles, dtype="<u4").reshape(-1, 3)
valid = (
    np.linalg.norm(
        np.cross(
            verts[triangles[:, 1]] - verts[triangles[:, 0]],
            verts[triangles[:, 2]] - verts[triangles[:, 0]],
        ),
        axis=1,
    )
    > 1e-12
)
triangles = triangles[valid]
out = ROOT / "public/anatomy"
(out / "female-pelvis.bin").write_bytes(verts.tobytes() + triangles.tobytes())
meta = dict(
    name="pelvis",
    pos=0,
    verts=len(verts),
    idx=verts.nbytes,
    tris=len(triangles),
    center=np.round((verts.max(0).astype(float) + verts.min(0)) / 2, 6).tolist(),
)
(out / "female-pelvis.json").write_text(json.dumps(meta, indent=2) + "\n")
print(
    "Atlas offset (m)",
    offset,
    "vertices",
    len(verts),
    "triangles",
    len(triangles),
    "source sha256",
    hashlib.sha256(blob).hexdigest(),
)
