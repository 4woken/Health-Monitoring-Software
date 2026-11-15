"""Fit MakeHuman hm08 hairstyles and everyday crew wear to Pulsar's reference bodies.

python scripts/realism/fit-crew-appearance.py /path/to/human-skin-sources /path/to/extracted-system-assets-cc0
Uses the skin builder's dependencies plus trimesh 4.x.
"""

import argparse
import json
from pathlib import Path
import re
import runpy

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
import trimesh
from scipy.spatial import cKDTree


ROOT = Path(__file__).resolve().parents[2]
SKINS = runpy.run_path(str(ROOT / "scripts/build-human-skins.py"))
STYLES = {"male": "short04", "female": "long01"}
UNIFORMS = {"male": "male_casualsuit06", "female": "female_casualsuit01"}


def read_proxy(path, target):
    """Evaluate each proxy vertex's three hm08 anchors and its per-axis fitted offset."""
    scales = np.zeros(3)
    rows = []
    proxy, _, hidden = path.read_text().partition("delete_verts")
    for line in proxy.splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] in {"x_scale", "y_scale", "z_scale"}:
            axis = "xyz".index(fields[0][0])
            a, b = map(int, fields[1:3])
            scales[axis] = abs(target[a, axis] - target[b, axis]) / float(fields[3])
        elif fields[0].isdigit():
            rows.append([float(field) for field in fields])
    table = np.array(rows)
    if table.shape[1] != 9 or np.any(scales <= 0):
        raise ValueError(f"Unsupported hm08 proxy: {path}")
    anchors = target[table[:, :3].astype(int)]
    weights = table[:, 3:6]
    xyz = (anchors * weights[:, :, None]).sum(axis=1) + table[:, 6:9] * scales
    covered = []
    for a, b in re.findall(r"(\d+)(?:\s*-\s*(\d+))?", hidden):
        covered.extend(range(int(a), int(b or a) + 1))
    return xyz, table[:, :3].astype(int), weights, covered


def clear_shoulders_and_back(xyz, skin_faces, height):
    # The long proxy was authored against a different shoulder pose. Refit its
    # hanging cards to the closed skin surface, keeping the scalp anchors intact.
    hanging = xyz[:, 1] < 0.89 * height
    points = xyz[hanging]
    low, high = points[:, 1].min() - 0.1, points[:, 1].max() + 0.1
    faces = skin_faces[
        (skin_faces[:, :, 1].max(1) > low) & (skin_faces[:, :, 1].min(1) < high)
    ]
    candidates = cKDTree(faces.mean(1)).query(points, k=24)[1]
    triangles = faces[candidates].reshape(-1, 3, 3)
    closest = trimesh.triangles.closest_point(triangles, np.repeat(points, 24, axis=0))
    delta = points[:, None, :] - closest.reshape(-1, 24, 3)
    nearest = np.linalg.norm(delta, axis=2).argmin(axis=1)
    rows = np.arange(len(points))
    hit = faces[candidates[rows, nearest]]
    normal = np.cross(hit[:, 1] - hit[:, 0], hit[:, 2] - hit[:, 0])
    normal /= np.linalg.norm(normal, axis=1, keepdims=True).clip(min=1e-10)
    distance = np.sum(delta[rows, nearest] * normal, axis=1)
    xyz[hanging] += np.maximum(0, 0.004 - distance)[:, None] * normal


def topology(path):
    uv, faces = [], []
    for line in path.read_text().splitlines():
        fields = line.split()
        if not fields:
            continue
        if fields[0] == "vt":
            uv.append(tuple(map(float, fields[1:3])))
        elif fields[0] == "f":
            polygon = [tuple(int(n) - 1 for n in t.split("/")[:2]) for t in fields[1:]]
            for j in range(1, len(polygon) - 1):
                faces.append((polygon[0], polygon[j], polygon[j + 1]))
    return np.asarray(uv), np.asarray(faces)


def mesh_from_proxy(xyz, uv, faces, material, arm_weights=None):
    corners, indices = np.unique(faces.reshape(-1, 2), axis=0, return_inverse=True)
    # Keep smooth normals across UV seams while splitting vertices for the texture.
    normals = SKINS["unit_normals"](xyz, faces[:, :, 0])
    return trimesh.Trimesh(
        vertices=xyz[corners[:, 0]],
        vertex_normals=normals[corners[:, 0]],
        faces=indices.reshape(-1, 3),
        visual=trimesh.visual.TextureVisuals(uv=uv[corners[:, 1]], material=material),
        vertex_attributes=(
            {}
            if arm_weights is None
            else {"_EXERCISEARMS": arm_weights[corners[:, 0]].astype("f4")}
        ),
        process=False,
    )


def textured_hair(directory, target, skin_faces, height):
    style = directory.name
    xyz, _, _, _ = read_proxy(directory / f"{style}.mhclo", target)
    if style == STYLES["female"]:
        clear_shoulders_and_back(xyz, target[skin_faces], height)
    uv, faces = topology(directory / f"{style}.obj")
    texture = Image.open(directory / f"{style}_diffuse.png").convert("RGBA")
    texture.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
    material = trimesh.visual.material.PBRMaterial(
        name=style,
        baseColorTexture=texture,
        metallicFactor=0,
        roughnessFactor=0.80,
        alphaMode="MASK",
        alphaCutoff=0.30,
        doubleSided=True,
    )
    mesh = mesh_from_proxy(xyz, uv, faces, material)
    mesh.metadata["name"] = style
    return mesh


def add_patch(texture, xyz, uv, faces, height):
    # Project the mission emblem in body space, so each profile's differently
    # rotated UV islands still show the same upright design on the left chest.
    badge = Image.open(Path(__file__).with_name("nasa-insignia.png")).convert("RGBA")

    tri = xyz[faces[:, :, 0]]
    center = np.array([0.04, 0.785]) * height
    diameter = 0.078
    xy = tri[:, :, :2] - center
    facing = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])[:, 2]
    bounds = (xy.min(1) <= diameter / 2) & (xy.max(1) >= -diameter / 2)
    selected = np.flatnonzero(bounds.all(1) & (facing > 0) & (tri.mean(1)[:, 2] > 0))
    for i in selected:
        texels = (uv[faces[i, :, 1]] * [1, -1] + [0, 1]) * texture.size
        lo = np.floor(texels.min(0)).astype(int)
        hi = np.ceil(texels.max(0)).astype(int) + 1
        local = texels - lo
        pixel = (xy[i] * [1, -1] / diameter + 0.5) * badge.size
        transform = np.linalg.solve(np.c_[local, np.ones(3)], pixel).T
        patch = badge.transform(
            tuple(hi - lo),
            Image.Transform.AFFINE,
            transform.flatten(),
            Image.Resampling.BICUBIC,
        )
        triangle = Image.new("L", patch.size)
        ImageDraw.Draw(triangle).polygon(list(map(tuple, local)), fill=255)
        alpha = ImageChops.multiply(triangle, patch.getchannel("A"))
        texture.paste(patch, tuple(lo), alpha)


def component_ids(triangles, count):
    edges = np.concatenate([triangles[:, pair] for pair in ([0, 1], [1, 2], [2, 0])])
    return trimesh.graph.connected_component_labels(edges, node_count=count)


def ankle_socks(xyz, faces, height):
    # The stock trainers include separate calf-length socks. Bring only their
    # upper loops in under the pant cuff, preserving the laces, tongues and heel.
    groups = component_ids(faces[:, :, 0], len(xyz))
    ankle = 0.045 * height
    for group in np.unique(groups[xyz[:, 1] > 0.10 * height]):
        leg = xyz[groups == group]
        center = leg[np.argsort(abs(leg[:, 1] - ankle))[:12]].mean(0)
        top = (groups == group) & (xyz[:, 1] > ankle)
        lengths = xyz[top, 1] - ankle
        taper = (0.30 * np.clip(lengths / 0.025, 0, 1))[:, None]
        xyz[np.ix_(top, [0, 2])] += (center[[0, 2]] - xyz[np.ix_(top, [0, 2])]) * taper
        xyz[top, 1] = ankle + 0.18 * lengths


def uniform_texture(directory, xyz, uv, faces, height):
    size = (2048, 2048)
    style = directory.name
    ao = (
        np.asarray(
            Image.open(directory / f"{style}_ao.png").convert("L").resize(size),
            dtype=float,
        )
        / 255
    )
    diffuse = np.asarray(
        Image.open(directory / f"{style}_diffuse.png").convert("L").resize(size),
        dtype=float,
    )
    # Separate shirt and trousers by mesh connectivity. A small atlas gutter
    # preserves the trouser colour when mipmaps blend across an island's edge.
    ids = faces[:, :, 0]
    groups = component_ids(ids, len(xyz))
    trousers = np.unique(groups[xyz[:, 1] < 0.4 * height])
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    for tri in faces[np.isin(groups[ids[:, 0]], trousers), :, 1]:
        texels = uv[tri] * [size[0], -size[1]] + [0, size[1]]
        draw.polygon(list(map(tuple, texels)), fill=255)
    pants = np.asarray(mask.filter(ImageFilter.MaxFilter(9))) > 0
    yy, xx = np.indices(ao.shape)
    weave = 1 + 0.014 * np.sin((xx + 2 * yy) * np.pi / 3)
    shirt_shade = (0.50 + 0.50 * ao) * weave
    pant_shade = (0.67 + 0.33 * ao) * (0.69 + 0.38 * np.minimum(diffuse / 94, 2.1))
    rgb = np.where(
        pants[:, :, None],
        pant_shade[:, :, None] * [39, 52, 68],
        shirt_shade[:, :, None] * [51, 96, 145],
    )
    texture = Image.fromarray(np.clip(rgb, 0, 255).astype("uint8"))
    add_patch(texture, xyz, uv, faces, height)
    return texture


def crew_wear(clothes, sex, target, height, arms, skin_lookup):
    scene = trimesh.Scene()
    hidden_ids = set()
    for node, name in [("uniform", UNIFORMS[sex]), ("trainers", "shoes05")]:
        directory = clothes / name
        xyz, anchors, weights, covered = read_proxy(directory / f"{name}.mhclo", target)
        hidden_ids.update(covered)
        uv, faces = topology(directory / f"{name}.obj")
        if node == "uniform":
            texture = uniform_texture(directory, xyz, uv, faces, height)
        else:
            ankle_socks(xyz, faces, height)
            texture = Image.open(directory / f"{name}_diffuse.png").convert("RGB")
            texture.thumbnail((512, 512), Image.Resampling.LANCZOS)
        material = trimesh.visual.material.PBRMaterial(
            name=node,
            baseColorTexture=texture,
            metallicFactor=0,
            roughnessFactor=0.86,
            doubleSided=True,
        )
        driven = (arms[anchors] * weights[:, :, None]).sum(axis=1).clip(0, 1)
        mesh = mesh_from_proxy(xyz, uv, faces, material, driven)
        scene.add_geometry(mesh, node_name=node, geom_name=node)

    info = json.loads((ROOT / "public/human" / f"{sex}.json").read_text())
    hidden = np.isin(skin_lookup, list(hidden_ids))
    # The registered male atlas patch is appended after the original UV vertices.
    hidden = np.r_[
        hidden, np.ones(info["skin"]["verts"] - len(skin_lookup), dtype=bool)
    ]
    cut = np.flatnonzero(np.diff(np.r_[False, hidden, False])).reshape(-1, 2)
    scene.metadata["coveredSkinVertices"] = (cut - [0, 1]).tolist()
    return scene


def bake(sources, assets):
    base, _, faces = SKINS["obj"](sources / "base.obj")
    groups = json.loads((sources / "groups.json").read_text())
    weights = json.loads((sources / "weights.json").read_text())["weights"]
    bodies = json.loads((ROOT / "public/anatomy/anatomy.json").read_text())["bodies"]
    human = ROOT / "public/human"
    for name in ("hair", "crew-wear"):
        (human / name).mkdir(exist_ok=True)
    arms = SKINS["bake_arm_weights"](weights, np.arange(len(base))).astype(float) / 255
    skin_lookup = np.unique(faces.reshape(-1, 2), axis=0)[:, 0]
    for sex, style in STYLES.items():
        target, _ = SKINS["bake_shape"](
            sex, bodies[sex], sources, base, np.unique(faces[:, :, 0]), groups, weights
        )
        height = bodies[sex]["height"]
        mesh = textured_hair(assets / "hair" / style, target, faces[:, :, 0], height)
        mesh.export(
            human / "hair" / f"{sex}.glb", include_normals=True, extension_webp=True
        )
        crew = crew_wear(assets / "clothes", sex, target, height, arms, skin_lookup)
        crew.export(
            human / "crew-wear" / f"{sex}.glb",
            include_normals=True,
            extension_webp=True,
        )
        print(
            f"{sex} {style}: {len(mesh.vertices)} vertices; bounds (m): {mesh.bounds.round(3)}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", type=Path)
    parser.add_argument("assets", type=Path)
    args = parser.parse_args()
    bake(args.sources, args.assets)
