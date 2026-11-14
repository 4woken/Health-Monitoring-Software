# Lower limb veins

Both anatomies include a separately selectable group of 42 paired venous structures from the pelvis to the toes. It includes the femoral, popliteal, saphenous, tibial, fibular, plantar and dorsal foot vessels, simplified for the browser.

**Attribution and licence.** Z-Anatomy, Gauthier Kervyn and contributors, derived from BodyParts3D, © The Database Center for Life Science. The adapted leg vein meshes in the two atlases and registered bodies are distributed under CC BY-SA 4.0. [Original Z-Anatomy credits and licences](https://github.com/Z-Anatomy/Models-of-human-anatomy/blob/master/License.txt) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

**Reproduction.** Download `veins.glb` and `skin.glb` from the pinned browser export. The Blender script verifies their checksums, selects the named leg veins, uses transverse sections of both skins to fit the vessels, and adds them as an independent mesh to each atlas. Run it after rebuilding the atlas and before the final MakeHuman registration. [Pinned source files](https://github.com/SeemaBansal1/3d-human-body-anatomy/tree/28912432581accd7a1c62129d55f0e9758221d48/web/public/models).

```sh
blender -b --factory-startup --python-exit-code 1 --python scripts/realism/add-leg-veins.py -- /path/to/veins.glb /path/to/skin.glb
python3 scripts/realism/register-anatomy.py
```
