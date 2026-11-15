"""Prepare a NASA suit for Pulsar with Blender in background mode.

Blender -b -P scripts/realism/prepare-spacesuit.py -- aces|emu source.glb destination.glb
The sources and their credits are listed in public/human/SOURCES.md.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

kind, source, destination = sys.argv[sys.argv.index("--") + 1:]
names = {"aces": "Advanced Crew Escape Suit", "emu": "Extravehicular Mobility Unit"}
name = names[kind]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(Path(source).resolve()))
suit, = (obj for obj in bpy.context.scene.objects if obj.type == "MESH")
mesh = suit.data
# Both imports face Blender +Y. Three.js views the body from +Z, which exports from Blender -Y.
mesh.transform(Matrix.Rotation(math.pi, 4, "Z") @ suit.matrix_world)
suit.matrix_world = Matrix.Identity(4)
bottom = min(v.co.z for v in mesh.vertices)
height = max(v.co.z for v in mesh.vertices) - bottom
# Centre on the boots so switching out of the suit does not move the user's feet.
sole = [v.co for v in mesh.vertices if v.co.z < bottom + 0.035 * height]
x, y = ((min(p[i] for p in sole) + max(p[i] for p in sole)) / 2 for i in (0, 1))
mesh.transform(Matrix.Scale(1 / height, 4) @ Matrix.Translation((-x, -y, -bottom)))
suit.name = name
mesh.name = name + " exterior"

for material in mesh.materials:
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    # These archival conversions assign full glass transmission to opaque fabric, boots and hardware.
    shader.inputs["Transmission Weight"].default_value = 0
    shader.inputs["Roughness"].default_value = 0.66
    shader.inputs["IOR"].default_value = 1.45
    shader.inputs["Specular IOR Level"].default_value = 0.28
    if kind == "aces" and ("blinn3SG" in material.name or "lambert3S" in material.name):
        shader.inputs["Base Color"].default_value = (0.88, 0.145, 0.016, 1)
    if kind == "aces" and "aceshelme.009" in material.name:
        shader.inputs["Base Color"].default_value = (0.014, 0.026, 0.045, 1)
        shader.inputs["Roughness"].default_value = 0.20
        shader.inputs["Metallic"].default_value = 0.36
    if kind == "emu" and ("blinn3SG" in material.name or "blinn1SG" in material.name):
        shader.inputs["Base Color"].default_value = (0.48, 0.26, 0.055, 1)
        shader.inputs["Roughness"].default_value = 0.24
        shader.inputs["Metallic"].default_value = 0.58

# Most of the source triangles belong to the helmet. Reduce smooth surfaces while preserving the UV seams.
bpy.context.view_layer.objects.active = suit
weld = suit.modifiers.new("Join source seams", "WELD")
weld.merge_threshold = 0.000002
bpy.ops.object.modifier_apply(modifier=weld.name)
reduce = suit.modifiers.new("Web mesh", "DECIMATE")
reduce.ratio = 0.25 if kind == "emu" else 0.55
bpy.ops.object.modifier_apply(modifier=reduce.name)
bpy.ops.object.select_all(action="DESELECT")
suit.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(Path(destination).resolve()), export_format="GLB", use_selection=True,
    export_yup=True, export_animations=False, export_extras=False,
)
