"""Bake the atlas organs into each MakeHuman body, in metres (Y up, +Z anterior).
Requires numpy, scipy. Inputs are the checked-in atlas, female HRA pelvis and fitted skins.
Output consists of separate, compressed-position meshes for each body.
"""

from pathlib import Path
import json
import numpy as np
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from collections import defaultdict
from scipy.spatial import ConvexHull, cKDTree

ROOT = Path(__file__).resolve().parents[2]
ATLAS = ROOT / "public/anatomy"
HUMAN = ROOT / "public/human"
SPACING = 0.0025


def read_mesh(blob, mesh, index_type="<u4"):
    p = np.frombuffer(blob, "<f4", mesh["verts"] * 3, mesh["pos"]).reshape(-1, 3)
    t = np.frombuffer(blob, index_type, mesh["tris"] * 3, mesh["idx"]).reshape(-1, 3)
    return p.astype(float), t


class Sections:
    """Sample distinct arm, leg and trunk cross-sections in atlas coordinates."""

    def __init__(self, p, tri, height, build):
        self.build = build
        self.height = height
        self.levels = np.linspace(0.013, 0.986, 64)
        self.slices = []
        self.dividers = []
        faces = p[tri]
        for level in self.levels:
            y = level * height
            cut = faces[(faces[:, :, 1].min(1) <= y) & (faces[:, :, 1].max(1) > y)]
            points = []
            for i in range(3):
                a, b = cut[:, i], cut[:, (i + 1) % 3]
                crosses = (a[:, 1] > y) != (b[:, 1] > y)
                a, b = a[crosses], b[crosses]
                points.extend(
                    a + (b - a) * ((y - a[:, 1]) / (b[:, 1] - a[:, 1]))[:, None]
                )
            cloud = np.asarray(points)
            # The largest gap outside the hip separates a hand or arm from
            # the torso even when the forearm almost touches the chest.
            xy = np.sort(np.abs(cloud[:, 0]))
            eligible = np.flatnonzero(
                (xy[:-1] > 0.098) & (xy[:-1] < 0.235) & (xy[1:] - xy[:-1] > 0.010)
            )
            threshold = 0.17
            if 0.38 < level < 0.77 and len(eligible):
                idx = eligible[np.argmax(np.diff(xy)[eligible])]
                threshold = (xy[idx] + xy[idx + 1]) / 2
            # Near the finger tips a slice can miss the hand entirely. Interpolate
            # the arm/hip separator through those slices rather than using hip skin.
            if build == "female" and 0.40 < level < 0.59:
                threshold = np.interp(
                    level,
                    [0.40, 0.46, 0.50, 0.54, 0.59],
                    [0.325, 0.32, 0.29, 0.26, 0.222],
                )
            if build == "male" and 0.39 < level < 0.56:
                threshold = np.interp(
                    level, [0.39, 0.43, 0.48, 0.56], [0.205, 0.203, 0.198, 0.186]
                )
            self.dividers.append(threshold)
            self.slices.append(cloud)

    def section(self, level, region):
        i = np.abs(self.levels - level).argmin()
        cloud = self.slices[i]
        x = cloud[:, 0]
        divider = self.dividers[i]
        if region == "core":
            if 0.40 < level < 0.78:
                cloud = cloud[np.abs(x) < divider]
        elif region.startswith("leg"):
            side = 1 if region.endswith("+") else -1
            cloud = cloud[
                (side * x > 0) & ((np.abs(x) < divider) if level > 0.40 else True)
            ]
        else:
            side = 1 if region.endswith("+") else -1
            cloud = cloud[side * x > divider]
        if len(cloud) < 8:
            return None
        lo, hi = np.percentile(cloud[:, [0, 2]], [1, 99], axis=0)
        c = (lo + hi) / 2
        y = self.levels[i] * self.height
        return np.array(
            [
                [c[0], y, c[1]],
                [lo[0], y, c[1]],
                [hi[0], y, c[1]],
                [c[0], y, lo[1]],
                [c[0], y, hi[1]],
            ]
        )

    def arm_weight(self, p):
        levels = p[:, 1] / self.height
        d = np.interp(levels, self.levels, self.dividers)
        return (
            np.clip((np.abs(p[:, 0]) - d + 0.02) / 0.04, 0, 1)
            * np.clip((levels - 0.39) / 0.04, 0, 1)
            * np.clip((0.85 - levels) / 0.07, 0, 1)
        )


def warp(src, dst, eyes_a, eyes_b, interior=()):
    def fit(pairs):
        a, b = (np.concatenate(q) for q in zip(*pairs))
        fn = RBFInterpolator(a, b - a, kernel="thin_plate_spline", smoothing=0.001)

        def apply(p):
            return np.concatenate(
                [v + fn(v) for v in np.array_split(p, max(1, len(p) // 1500))]
            )

        return apply

    def pairs(region, levels):
        result = []
        for level in levels:
            a, b = src.section(level, region), dst.section(level, region)
            if a is not None and b is not None:
                result.append((a, b))
        return result

    core_pairs = pairs(
        "core",
        (
            0.48,
            0.51,
            0.55,
            0.60,
            0.65,
            0.71,
            0.75,
            0.79,
            0.83,
            0.86,
            0.89,
            0.92,
            0.95,
            0.98,
        ),
    )
    for side in ("+", "-"):
        core_pairs.extend(
            pairs(
                "leg" + side,
                (0.02, 0.06, 0.13, 0.20, 0.27, 0.35, 0.39, 0.43, 0.47, 0.50),
            )
        )
    for p in interior:
        level = p[1] / src.height
        a, b = src.section(level, "core"), dst.section(level, "core")
        if a is not None and b is not None:
            extent = np.maximum(np.ptp(a, axis=0), 0.01)
            target = b[0] + (p - a[0]) * (np.maximum(np.ptp(b, axis=0), 0.01) / extent)
            core_pairs.append((np.array([p]), np.array([target])))
    core_pairs.append((np.asarray(eyes_a), np.asarray(eyes_b)))
    core = fit(core_pairs)
    arms = [
        fit(
            pairs(
                "arm" + side,
                (0.45, 0.48, 0.51, 0.55, 0.59, 0.63, 0.67, 0.71, 0.75, 0.78, 0.80),
            )
            + pairs("core", (0.81, 0.84))
        )
        for side in ("-", "+")
    ]

    def apply(p, name=""):
        if name in ("arm bones", "leg bones"):
            weight = np.full(len(p), 1.0 if name == "arm bones" else 0.0)
        elif name in ("arteries", "veins", "blood vessels", "shoulder girdle"):
            weight = src.arm_weight(p)
        else:
            weight = np.zeros(len(p))
        result = core(p)
        for sign, arm in enumerate(arms):
            mask = (weight > 0) & ((p[:, 0] >= 0) == bool(sign))
            if mask.any():
                w = weight[mask, None]
                result[mask] = result[mask] * (1 - w) + arm(p[mask]) * w
        return result

    return apply


class Envelope:
    """Voxelise skin triangles along Z. Fill disjoint depth intervals separately
    so the space between an arm and the rib cage stays outside the body."""

    def __init__(self, p, tri, sections):
        step = SPACING
        self.lo = p.min(0) - 3 * step
        shape = np.ceil((p.max(0) - self.lo) / step).astype(int) + 4
        self.shape = shape
        bins = np.zeros(shape, dtype=np.bool_)
        grid = (p - self.lo) / step
        # Only front/back crossings that enclose a volume. Absolute orientation
        # works across UV seams. A half-open edge rule prevents double hits.
        for a, b, c in grid[tri]:
            u, v = b - a, c - a
            det = u[0] * v[1] - u[1] * v[0]
            if abs(det) < 1e-8:
                continue
            pts = np.array([a, b, c])
            lo = np.ceil(pts.min(0)[:2]).astype(int)
            hi = np.floor(pts.max(0)[:2]).astype(int)
            if np.any(lo > hi):
                continue
            xx, yy = np.mgrid[lo[0] : hi[0] + 1, lo[1] : hi[1] + 1]
            x = xx - a[0]
            y = yy - a[1]
            s = (x * v[1] - y * v[0]) / det
            t = (u[0] * y - u[1] * x) / det
            hit = (s >= 0) & (t >= 0) & (s + t < 1)
            z = np.ceil(a[2] + s[hit] * u[2] + t[hit] * v[2]).astype(int)
            bins[xx[hit], yy[hit], z] ^= True
        inside = np.logical_xor.accumulate(bins, axis=2)
        # Restrict parity runs touching the back of the grid (open eyes, mouth).
        end = np.maximum.accumulate(np.where(bins, np.arange(shape[2]), -1), axis=2)[
            :, :, -1
        ]
        inside &= np.arange(shape[2]) <= end[:, :, None]
        inside = ndimage.binary_fill_holes(ndimage.binary_closing(inside, iterations=2))
        safe = ndimage.binary_erosion(inside, iterations=2)
        self.safe = safe
        self.nearest = ndimage.distance_transform_edt(
            ~safe, return_distances=False, return_indices=True
        )

        # Find the surface of each permitted region only once. The small hand and
        # forearm must stay separate from the nearby hip even across empty voxels.
        x = self.lo[0] + np.arange(shape[0]) * step
        levels = (self.lo[1] + np.arange(shape[1]) * step) / sections.height
        boundary = np.interp(levels, sections.levels, sections.dividers)
        arm = (
            (
                np.abs(x[:, None])
                > np.maximum(
                    boundary,
                    np.where(
                        levels < 0.47, 0.28 if sections.build == "female" else 0.20, 0
                    ),
                )[None, :]
            )
            & (levels > 0.40)
            & (levels < 0.85)
        )
        joint = (levels > 0.74) & (levels < 0.85)
        core = (~arm | joint[None, :])[:, :, None] & safe
        arm = arm[:, :, None] & safe
        self.regions = {}
        for name, volume in [("arm", arm), ("core", core)]:
            boundary_voxels = np.argwhere(volume & ~ndimage.binary_erosion(volume))
            self.regions[name] = (volume, cKDTree(boundary_voxels))

    def contain(self, p, region=None):
        ijk = np.clip(np.rint((p - self.lo) / SPACING).astype(int), 0, self.shape - 1).T
        region_mask, tree = self.regions[region] if region else (self.safe, None)
        outside = ~region_mask[tuple(ijk)]
        out = p.copy()
        if np.any(outside):
            if tree:
                loc = (p[outside] - self.lo) / SPACING
                cells = tree.data[tree.query(loc)[1]]
            else:
                cells = self.nearest[(slice(None), *ijk[:, outside])].T
            local = np.clip(
                (p[outside] - self.lo) / SPACING - ijk[:, outside].T, -0.4, 0.4
            )
            out[outside] = self.lo + (cells + local) * SPACING
        return out, int(outside.sum())

    def fit_surface(self, original, fitted, triangles, region):
        """Keep neighbouring vertices on the same side of a narrow skin gap.
        A small finger or vessel can be equally close to two disconnected voxels.
        Prefer an adjacent triangle's displacement when it avoids a stretched edge.
        """
        points, count = self.contain(fitted, region)
        if not count:
            return points, count
        edges = np.unique(
            np.sort(
                np.concatenate(
                    [triangles[:, [0, 1]], triangles[:, [1, 2]], triangles[:, [2, 0]]]
                ),
                axis=1,
            ),
            axis=0,
        )
        a, b = edges.T
        rest = np.linalg.norm(original[a] - original[b], axis=1)
        limit = rest * 1.5 + 0.004
        adjacent = defaultdict(list)
        for x, y in edges:
            adjacent[x].append(y)
            adjacent[y].append(x)
        for _ in range(12):
            excess = np.linalg.norm(points[a] - points[b], axis=1) - limit
            bad = np.flatnonzero(excess > 0.002)
            if not len(bad):
                break
            changed = False
            for idx in bad[np.argsort(-excess[bad])]:
                for v in edges[idx]:
                    ns = adjacent[v]
                    delta = original[v] - original[ns]
                    options = points[ns] + delta
                    # Keep the raw proposal and a halfway step, both on the permitted skin.
                    candidates, _ = self.contain(
                        np.vstack([options, (options + points[v]) / 2]), region
                    )
                    candidates = np.vstack([points[v], candidates])
                    lengths = np.linalg.norm(
                        candidates[:, None, :] - points[ns][None, :, :], axis=2
                    )
                    stretch = np.maximum(
                        0, lengths - 1.5 * np.linalg.norm(delta, axis=1) - 0.004
                    )
                    energy = np.sum(stretch**2, axis=1) + 0.002 * np.sum(
                        (candidates - fitted[v]) ** 2, axis=1
                    )
                    best = np.argmin(energy)
                    if energy[best] < energy[0] - 1e-8:
                        points[v] = candidates[best]
                        changed = True
            if not changed:
                break
        return points, count


def torso_calibration(build, p, tri, height):
    """Intersect horizontal triangles and select the torso contour across the midline.
    Welding by position also stitches OBJ UV seams before separating the arm loops.
    """
    levels = (
        {"waist": 0.62, "chest": 0.68}
        if build == "male"
        else {"waist": 0.64, "chest": 0.70}
    )
    result = dict(levels)
    faces = p[tri]
    for name, level in levels.items():
        y = height * level
        cut = faces[(faces[:, :, 1].min(1) <= y) & (faces[:, :, 1].max(1) > y)]
        adjacency = defaultdict(set)
        for face in cut:
            hits = []
            for a, b in zip(face, np.roll(face, -1, axis=0)):
                if (a[1] > y) != (b[1] > y):
                    q = a + (b - a) * ((y - a[1]) / (b[1] - a[1]))
                    hits.append(tuple(np.round(q[[0, 2]], 6)))
            if len(hits) == 2:
                a, b = hits
                adjacency[a].add(b)
                adjacency[b].add(a)
        loops = []
        while adjacency:
            frontier = [next(iter(adjacency))]
            loop = []
            while frontier:
                head = frontier.pop()
                if head in adjacency:
                    loop.append(head)
                    frontier.extend(adjacency.pop(head))
            loops.append(np.array(loop))
        torso = max((q for q in loops if q[:, 0].min() < 0 < q[:, 0].max()), key=len)
        result[name + "Cm"] = round(ConvexHull(torso).area * 100, 4)
        if not 48 < result[name + "Cm"] < 150:
            raise ValueError(f"Unexpected {name} on {build}: {result}")
        print(
            build, name, result[name + "Cm"], "cm", "span", np.max(np.abs(torso[:, 0]))
        )
    return result


def write_body(build, sources, transform, envelope, eyes, anchors, calibration):
    organs = []
    output = bytearray()
    for name, (p, tri, center) in sources.items():
        if name.endswith("eyeball"):
            # The atlas globe is registered to the physical eye socket instead of
            # being pushed behind the eyelids by the skin containment step.
            eye = next(o for o in eyes if o["name"] == name)
            center = np.array(eye["center"])
            old = np.array(sources[name][2])
            radius = np.median(np.linalg.norm(p - old, axis=1))
            vec = p - old
            radii = np.linalg.norm(vec, axis=1)
            p = center + vec * np.minimum(1, radius * 1.12 / np.maximum(radii, 1e-8))[
                :, None
            ] * (eye["radius"] / radius)
            count = 0
        else:
            region = (
                "arm"
                if name == "arm bones"
                else (
                    None
                    if name in ("arteries", "veins", "blood vessels", "shoulder girdle")
                    else "core"
                )
            )
            p, count = envelope.fit_surface(p, transform(p, name), tri, region)
            center = envelope.contain(transform(np.array([center]), name), region)[0][0]
        lo = p.min(0)
        scale = np.maximum(np.ptp(p, axis=0) / 65535, 1e-10)
        packed = np.rint((p - lo) / scale).clip(0, 65535).astype("<u2")
        if not name.endswith("eyeball"):
            reconstructed = packed.astype(float) * scale + lo
            # Quantisation must preserve the eroded occupancy of every contained vertex.
            vox = np.clip(
                np.rint((reconstructed - envelope.lo) / SPACING).astype(int),
                0,
                envelope.shape - 1,
            )
            on_edge = ~envelope.safe[tuple(vox.T)]
            if on_edge.any():
                # Rounding can cross a voxel boundary by a few micrometres.
                corrected, _ = envelope.contain(reconstructed[on_edge])
                packed[on_edge] = (
                    np.rint((corrected - lo) / scale).clip(0, 65535).astype("<u2")
                )
            p = packed.astype(float) * scale + lo
            vox = np.clip(
                np.rint((p - envelope.lo) / SPACING).astype(int), 0, envelope.shape - 1
            )
            assert envelope.safe[
                tuple(vox.T)
            ].all(), f"{build}/{name}: vertex outside envelope"
        # Remove faces collapsed onto one voxel by the containment pass.
        valid = (
            np.linalg.norm(
                np.cross(p[tri[:, 1]] - p[tri[:, 0]], p[tri[:, 2]] - p[tri[:, 0]]),
                axis=1,
            )
            > 1e-12
        )
        tri = tri[valid]
        offset = len(output)
        output.extend(packed.tobytes())
        while len(output) % 4:
            output.append(0)
        idx = len(output)
        wide = len(p) > 65535
        output.extend(np.asarray(tri, dtype="<u4" if wide else "<u2").tobytes())
        while len(output) % 4:
            output.append(0)
        organs.append(
            dict(
                name=name,
                pos=offset,
                verts=len(p),
                idx=idx,
                tris=len(tri),
                wide=wide,
                offset=lo.tolist(),
                scale=scale.tolist(),
                center=center.tolist(),
            )
        )
        print(build, name, len(p), count, "vertices adjusted")
    paths = {k: transform(np.array([a]))[0].tolist() for k, a in anchors.items()}
    (HUMAN / f"{build}-organs.bin").write_bytes(output)
    (HUMAN / f"{build}-organs.json").write_text(
        json.dumps(
            dict(organs=organs, anchors=paths, torsoCalibration=calibration),
            separators=(",", ":"),
        )
        + "\n"
    )


def main():
    atlases = json.loads((ATLAS / "anatomy.json").read_text())["bodies"]
    buf = (ATLAS / "anatomy.bin").read_bytes()
    current = json.loads((ATLAS / "female-pelvis.json").read_text())
    pelvis = (
        *read_mesh((ATLAS / "female-pelvis.bin").read_bytes(), current),
        current["center"],
    )
    for build, atlas in atlases.items():
        meta = json.loads((HUMAN / f"{build}.json").read_text())
        targets, shell = read_mesh(
            (HUMAN / f"{build}.bin").read_bytes(), meta["skin"], "<u2"
        )
        source, source_tri = read_mesh(buf, atlas["skin"])
        atlas_sections = Sections(source, source_tri, atlas["height"], build)
        sources = {
            o["name"]: (*read_mesh(buf, o), o["center"]) for o in atlas["organs"]
        }
        if build == "female":
            sources["pelvis"] = pelvis
        eyes = meta["eyes"]
        interior = [
            np.asarray(sources[n][2])
            for n in (
                "brain",
                "heart",
                "liver",
                "left kidney",
                "right kidney",
                "urinary bladder",
            )
            if n in sources
        ]
        if "vertebral column" in sources:
            spine = sources["vertebral column"][0]
            for y in np.linspace(0.52, 0.85, 9) * atlas["height"]:
                strip = spine[np.abs(spine[:, 1] - y) < 0.012]
                if len(strip):
                    interior.append(np.median(strip, axis=0))
        skin_sections = Sections(targets, shell, atlas["height"], build)
        transform = warp(
            atlas_sections,
            skin_sections,
            [sources[o["name"]][2] for o in eyes],
            [o["center"] for o in eyes],
            interior,
        )
        envelope = Envelope(targets, shell, skin_sections)
        calibration = torso_calibration(build, targets, shell, atlas["height"])
        write_body(
            build, sources, transform, envelope, eyes, atlas["anchors"], calibration
        )


if __name__ == "__main__":
    main()
