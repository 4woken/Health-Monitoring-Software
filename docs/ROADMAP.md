# Roadmap

## Realistic bodies

Owner: Youssef Mir.

The goal is for the 3D bodies to look like real people (skin detail, navel, nails, head hair, eyebrows and eyelashes, body hair on the male body) while the anatomy layers (vessels, organs, skeleton) stay aligned with the skin.

### Where things are today

- **Male body**: the BodyParts3D skin (41,258 vertices, with stored normals), its organs, and the full skeleton and vessels added by `scripts/add-bodyparts3d.mjs`.
- **Female body**: the HuBMAP HRA skin (43,086 vertices, normals computed at load) and organs. Her skeleton and vessels are the male ones, bent into her body by `scripts/fit-female-body.mjs`.
- **Skin material**: one `MeshPhysicalMaterial` created in `src/body/BodyViewer.tsx` and replaced by the portrait-aware material from `createPersonalFace` in `src/body/portrait/skinPortrait.ts`. Both go through `patch()` in `BodyViewer.tsx`, which adds the X-ray lens, breathing and the fluid shift. Any new skin shading has to stay compatible with that patch and with the portrait attributes (`portraitUv`, `portraitWeight`).
- **No textures and no UVs** on either skin mesh, and no hair.

### Step 1: procedural detail, no new assets

1. **Skin shading.** Vary the colour by region: warmer on the cheeks, ears, knees, elbows and palms. Compute these colours once into a vertex attribute in a build script, from the body regions. Add a fine pore pattern as normal noise in the fragment shader, a soft sheen, and less roughness on the lips and nails.
2. **Navel.** Check both skins. Where it is missing, press a small dimple into the mesh at the umbilicus (front midline, about 0.6 of the height) in a build script, then recompute the normals.
3. **Nails.** Find the finger and toe tips on the skin (the ends of the hand and foot pieces), mark their top faces with a vertex attribute, and shade them lighter and glossier.
4. **Hair.** Use fur shells for head hair, eyebrows and the male body hair (chest, forearms, legs): a stack of 16 to 32 copies of the skin faces of that region, pushed out along the normals, with alpha-tested strand noise in the shader. Shells only give short hair. Keep body hair sparse and short (2 to 4 mm).
5. **Cost.** Shells multiply the drawing work. Limit them to a few regions and hide them at every depth past Skin, where the skin fades out.

### Step 2: a realistic human model

1. **Base model.** Take a CC0 human, for example the MakeHuman base mesh and its CC0 assets (skin textures, eyebrows, eyelashes, hair, nails), in a male and a female shape.
2. **Fit the anatomy into it.** Use the thin-plate warp of `scripts/fit-female-body.mjs`, fitted on organ centres, the spine, and the centre lines and edges of the limbs. Then keep every vertex inside the new skin, as that script does with its voxel step.
3. **Face fitting.** Redo the reference head templates for the new heads (`scripts/reference-heads.html`, see `docs/FACE_FITTING.md`).
4. **Licences.** Update `docs/CREDITS.md` and the credit shown under the body.

### Known limits to fix along the way

- The female pelvis keeps the male shape, only widened. A female skeleton source would be better.
- `public/anatomy/anatomy.bin` is 18 MB with both bodies. Loading only the body on screen, or storing positions as 16-bit integers, would cut the first load.
