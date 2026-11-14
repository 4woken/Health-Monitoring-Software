# Human surfaces

Both skins use the **MakeHuman Community hm08** base mesh, its UV map, adult macro targets, skinning weights, facial and nail masks. These upstream assets are dedicated to the public domain under CC0 1.0. The geometry and joint data in this directory have been fitted to the project's atlas coordinates. [Asset licence at the exact source commit](https://github.com/makehumancommunity/mpfb2/blob/9de0707fdc88438d7c53a1a2ac7937d9221e2431/LICENSE.md) · [CC0 legal text](https://creativecommons.org/publicdomain/zero/1.0/).

Both colour maps were created by **Margaret Toigo** and published under CC0. The male map is **Toigo Light Skin Male Bronze** from the [Skins 02 catalogue](https://static.makehumancommunity.org/assets/assetpacks/skins02.html). The female map is **Toigo Light Skin Female Freckles** from the [Skins 01 catalogue](https://static.makehumancommunity.org/assets/assetpacks/skins01.html). The browser loads local 2048 px WebP derivatives.

## Rebuild

The build uses Python 3 with NumPy, SciPy and Pillow (with WebP support). In a temporary source directory, obtain these files from the [pinned MPFB source](https://github.com/makehumancommunity/mpfb2/tree/9de0707fdc88438d7c53a1a2ac7937d9221e2431/src/mpfb/data). The second column gives the filenames expected locally.

| Source path inside the pinned data directory                                   | Local name                                    |
| ------------------------------------------------------------------------------ | --------------------------------------------- |
| `3dobjs/base.obj`                                                              | `base.obj`                                    |
| `mesh_metadata/basemesh_vertex_groups.json`                                    | `groups.json`                                 |
| `rigs/standard/weights.game_engine.json`                                       | `weights.json`                                |
| `targets/macrodetails/{african,asian,caucasian}-{female,male}-young.target.gz` | Keep the six original filenames.              |
| `textures/mpfb_{fingernails,toenails,lips}.jpg`                                | `fingernails.jpg`, `toenails.jpg`, `lips.jpg` |

Download the archives linked in the skin catalogues and extract these two original images. The build checks the PNG digests.

| Archive and path                                                                                           | Local name   |
| ---------------------------------------------------------------------------------------------------------- | ------------ |
| `skins02_cc0.zip`, `skins/toigo_light_skin_male_bronze/young_lightskinned_male_diffuse_Bronze.png`         | `male.png`   |
| `skins01_cc0.zip`, `skins/toigo_light_skin_female_freckles/young_lightskinned_female_diffuse_freckles.png` | `female.png` |

From the repository root run `python3 scripts/build-human-skins.py /path/to/sources`. The script keeps the mesh's body group, applies an equal mix of the three stock adult targets for each body, and poses the arms and legs using MakeHuman's joint centres and bone weights. Both models share UV topology and retain separate fingers, toes, lips and eyelids. Their shared `arm-weights.bin` records MakeHuman shoulder and elbow influences at each UV vertex, including the wrists and individual fingers. The eye centres and radii come from the corresponding MakeHuman helper geometry.

The active male surface includes the external pelvic skin of **BodyParts3D, © The Database Center for Life Science, licensed under CC Attribution 4.0 International**. From the BodyParts3D 4.0 `partof_BP3D_4.0_obj_99.zip` archive, use `FJ2810.obj` (Skin, FMA7163). After building the MakeHuman meshes, run `blender -b --factory-startup --python-exit-code 1 --python scripts/realism/fit-male-pelvic-surface.py -- /path/to/FJ2810.obj`, followed by the regional skin bake below. The script extracts the outer sheet, registers it to the surrounding MakeHuman skin and transfers a local swatch of its colour map. The geometry represents the atlas reference person. [BodyParts3D download](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html) · [Source licence](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/lic.html)

Each compact binary contains Float32 positions, smooth normals, Float32 UVs and Uint16 triangles. Offsets in the corresponding JSON are bytes. The original texture orientation follows OBJ conventions (v increases upwards).

## Internal anatomy

Run `python3 scripts/realism/register-anatomy.py` with NumPy and SciPy after building the skin meshes. It reads the committed atlas and female reference pelvis. A thin-plate spline registers organ centres, spine and limb landmarks to the new surface. The build checks the quantised internal vertices against an eroded 2.5 mm skin voxel grid. The eyeballs are fitted separately to the sockets. The output contains measured chest and waist circumferences for the sizing controls. Each body has its own package.

To rebuild the source atlas, import the BodyParts3D 4.0 part-of OBJ archive with `node scripts/add-bodyparts3d.mjs /path/to/objs`, then run `node scripts/fit-female-body.mjs`. These scripts keep separately named bones and costal cartilages and fit the supplemental bones, vessels and stomach to the female reference. [BodyParts3D archive and licence](https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html)

Next run the Blender command below with the four official GLBs. The extractor verifies their SHA-256 digests. The female reference supplies its pelvis, eight major leg bones, uterine vessels, spleen and pancreas. The male reference supplies both lung surfaces, spleen and spinal cord. The source organs are registered to each reference body. [United female v1.10](https://cdn.humanatlas.io/digital-objects/ref-organ/united-female/v1.10/assets/3d-vh-f-united.glb) · [Male lungs v1.4](https://cdn.humanatlas.io/digital-objects/ref-organ/lung-male/v1.4/assets/3d-vh-m-lung.glb) · [Male spleen v1.3](https://cdn.humanatlas.io/digital-objects/ref-organ/spleen-male/v1.3/assets/3d-vh-m-spleen.glb) · [Male spinal cord v1.1](https://cdn.humanatlas.io/digital-objects/ref-organ/spinal-cord-male/v1.1/assets/3d-vh-m-spinal-cord.glb)

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/realism/extract-female-pelvis.py -- 3d-vh-f-united.glb 3d-vh-m-lung.glb 3d-vh-m-spleen.glb 3d-vh-m-spinal-cord.glb
```

Apply the lower-limb vein supplement with `scripts/realism/add-leg-veins.py` before the final `register-anatomy.py` step. [Model credits](../../THIRD_PARTY_NOTICES.md)

Run `blender -b --factory-startup --python-exit-code 1 --python scripts/bake-skin-detail.py -- --human` to bake the regional appearance attributes and inspect navel relief.

## Portrait calibration

With the Vite development server running, open `/scripts/reference-heads.html` in a WebGL browser. It renders each textured head and its resting eyes, runs the packaged MediaPipe face landmarker locally, and fits 48 skin-edge samples around each eye. Save the two generated JSON files in this directory. Each records 468 reference landmarks, their eye-centred calibration, the orthographic projection and the measured eye openings. These references support webcam personalisation on the two meshes.
