"""Add Z-Anatomy's labelled lower-limb veins to each reference atlas, before register-anatomy.py.

Blender -b --factory-startup --python-exit-code 1 --python scripts/realism/add-leg-veins.py -- veins.glb skin.glb [atlas-directory]
Pinned input and licences: public/anatomy/LEG_VEINS.md. No source skin is redistributed.
"""
import hashlib
import json
import re
import sys
from pathlib import Path

import bpy
import numpy as np

args = sys.argv[sys.argv.index("--") + 1:]
vein_file, skin_file = map(Path, args[:2])
atlas = Path(args[2]) if len(args) > 2 else Path(__file__).resolve().parents[2] / "public/anatomy"
for path, checksum in [
    (vein_file, "9f72980fcaa074fb5d83eb6f9bbbff03216161e7c6afb4890e625a21422614bb"),
    (skin_file, "829dc9d782b66c0d0cf40b07c70070b31e82d446507b1f52410705b508e2a639"),
]:
    if hashlib.sha256(path.read_bytes()).hexdigest() != checksum:
        raise ValueError(f"Unexpected source file: {path}")

leg_names = re.compile(
    r"(?:great saphenous vein|small saphenous vein|(?:deep |lateral circumflex |medial circumflex )?femoral vein[s]?|"
    r"perforating veins|(?:anterior tibial|posterior tibial|fibular|genicular) veins|popliteal vein|"
    r"(?:medial |lateral |digital |metatarsal )?plantar veins|plantar (?:digital veins|metatarsal veins|venous arch)|"
    r"dorsal venous arch of foot|intercapitular veins of foot|dorsal metatarsal veins|dorsal digital veins of foot)\.[lr]\.001",
    re.I,
)


def geometry(path, pick):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path))
    vertices, triangles, names = [], [], []
    offset = 0
    for obj in sorted(bpy.context.scene.objects, key=lambda item: item.name):
        if obj.type != "MESH" or not pick(obj.name):
            continue
        mesh = obj.data
        points = np.empty(len(mesh.vertices) * 3, dtype=np.float32)
        mesh.vertices.foreach_get("co", points)
        world = np.array(obj.matrix_world)
        points = points.reshape(-1, 3) @ world[:3, :3].T + world[:3, 3]
        # Blender Z-up -> the viewer's Y-up, +Z forward coordinates.
        points = points[:, [0, 2, 1]]
        points[:, 2] *= -1
        mesh.calc_loop_triangles()
        faces = np.empty(3 * len(mesh.loop_triangles), dtype=np.int32)
        mesh.loop_triangles.foreach_get("vertices", faces)
        triangles.append(faces.reshape(-1, 3) + offset)
        vertices.append(points)
        names.append(obj.name)
        offset += len(points)
    return np.concatenate(vertices), np.concatenate(triangles), names


def leg_sections(points, faces, side, floor, height, levels):
    """Cross both skin triangles and a horizontal plane to locate the calf, thigh and foot."""
    tris = points[faces]
    bounds = []
    for fraction in levels:
        y = floor + fraction * height
        cloud = []
        for i in range(3):
            a, b = tris[:, i], tris[:, (i + 1) % 3]
            mask = (a[:, 1] > y) != (b[:, 1] > y)
            a, b = a[mask], b[mask]
            cloud.extend(a + (b - a) * ((y - a[:, 1]) / (b[:, 1] - a[:, 1]))[:, None])
        cloud = np.array(cloud)
        # Hands may cross the thigh plane proximally. Keep the medial component.
        region = cloud[(side * cloud[:, 0] > 0) & (abs(cloud[:, 0]) < height * 0.11)]
        lo, hi = np.quantile(region[:, [0, 2]], [0.015, 0.985], axis=0)
        bounds.append([*lo, *hi])
    return np.asarray(bounds)


source_skin, shell, _ = geometry(skin_file, lambda name: True)
veins, triangles, names = geometry(vein_file, leg_names.fullmatch)
if len(names) < 40 or not all(any(n.startswith(term) for n in names) for term in ["Femoral", "Popliteal", "Anterior tibial", "Great saphenous"]):
    raise ValueError(f"Incomplete lower limb: {names}")
levels = np.linspace(0.008, 0.51, 60)
floor = source_skin[:, 1].min()
height = np.ptp(source_skin[:, 1])
source_sections = {s: leg_sections(source_skin, shell, s, floor, height, levels) for s in (-1, 1)}
blob = (atlas / "anatomy.bin").read_bytes()
metadata = json.loads((atlas / "anatomy.json").read_text())
# This supplement is always appended. Strip a previous run only when it really is the tail.
existing = [p for b in metadata["bodies"].values() for p in b["organs"] if p["name"] == "leg veins"]
end_of_base = max(
    max(m["pos"] + m["verts"] * 12, m["idx"] + m["tris"] * 12, m.get("nrm", -len(blob)) + m["verts"] * 12)
    for b in metadata["bodies"].values() for m in [b["skin"], *b["organs"]] if m["name"] != "leg veins"
)
output = bytearray(blob[:end_of_base] if existing else blob)
for build, body in metadata["bodies"].items():
    skin = body["skin"]
    target = np.frombuffer(blob, "<f4", skin["verts"] * 3, skin["pos"]).reshape(-1, 3)
    indices = np.frombuffer(blob, "<u4", skin["tris"] * 3, skin["idx"]).reshape(-1, 3)
    base = target[:, 1].min()
    h = np.ptp(target[:, 1])
    fitted = veins.copy()
    fraction = (veins[:, 1] - floor) / height
    fitted[:, 1] = base + h * fraction
    for side in (-1, 1):
        mask = veins[:, 0] * side > 0
        dst = leg_sections(target, indices, side, base, h, levels)
        for axis, coord in enumerate([0, 2]):
            ref = source_sections[side]
            low, high, new_low, new_high = [
                np.interp(fraction[mask], levels, data[:, col])
                for data, col in [(ref, axis), (ref, axis+2), (dst, axis), (dst, axis+2)]
            ]
            fitted[mask, coord] = new_low + (veins[mask, coord] - low) / (high - low) * (new_high - new_low)
    body["organs"] = [o for o in body["organs"] if o["name"] != "leg veins"]
    spec = dict(name="leg veins", verts=len(fitted), tris=len(triangles), center=np.median(fitted, axis=0).round(6).tolist(), pos=len(output))
    output.extend(fitted.astype("<f4").tobytes())
    spec["idx"] = len(output)
    output.extend(triangles.astype("<u4").tobytes())
    body["organs"].append(spec)
    print(build, len(names), "anatomical parts", spec["verts"], "vertices", "range", fitted.min(0), fitted.max(0))
(atlas / "anatomy.bin").write_bytes(output)
(atlas / "anatomy.json").write_text(json.dumps(metadata, separators=(",", ":")))
