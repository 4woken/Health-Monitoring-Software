# Face fitting

MediaPipe Face Landmarker is already part of this application. Its 468 surface landmarks are used for visual personalisation; the separate pulse experiment estimates an experimental camera pulse. Neither produces a personal medical scan.

The capture, the framing guidance and the tracking are in `src/camera/face/`. The fit on the reference head is in `src/body/portrait/` (`headFit.ts` and `skinPortrait.ts`).

## Registration

`src/body/portrait/referenceHeads.json` contains landmark templates for the two licensed anatomy reference heads. `scripts/reference-heads.html` renders each reference in an orthographic frontal view and runs the installed MediaPipe model locally. It includes the source mesh normals and orientation correction used by the main renderer, plus neutral pupils to make the eye locations detectable. The saved templates were generated on 14 November 2026 with `@mediapipe/tasks-vision` 1.2.3 and the project's local `face_landmarker.task`.

To reproduce them, start the local development server (`npm run dev`), open <http://localhost:5173/scripts/reference-heads.html>, and inspect the JSON result. Regenerate and review the templates if the reference geometry or face model changes. They are derived from the credited BodyParts3D and HuBMAP meshes; their original CC BY 4.0 attribution remains required.

The templates are registered on both eye centres before a portrait is applied. Barycentric correspondence retargets the source eyes, nose, lips and outline onto the same head used in the Body view. The estimated personal shape displaces the front of the reference skin, with a single-view limit of 12 mm per axis and a smaller allowed displacement near the face boundary. The neck, scalp and back remain the reference. The default shape blend is 65%; **Auto-fit face** restores the automatic registration. The reference eyeballs are hidden while the portrait owns those surfaces. The BodyParts3D head has open eyelids. Two curved supports carry the portrait behind those openings. The HuBMAP head already has skin across both eyes and takes the portrait directly. To regenerate the supports from the credited meshes, run `blender -b --factory-startup --python-exit-code 1 --python scripts/fit-portrait-eyes.py`. Blender casts rays against the skin and the eyeballs to locate each eyelid edge.

Long edges on the front of the reference face are split once before fitting the portrait, so the texture can follow the chin and cheeks between the original vertices. The portrait uses the atlas surface normals. As the face moves, neighbouring vertex displacements update the local lighting direction around each bound vertex. This keeps the jaw shading stable where triangles overlap in the source scan.

## Three-angle portrait

The optional three-angle scan uses a frontal observation and two oblique observations of the same still expression. Use even lighting and turn your head about 30° each way, keeping both eyes visible. Each observation is independently cropped: its pixels, normalized landmarks and crop dimensions travel together. A single frontal capture and live fitting still work without the side views.

For a three-angle capture, the eye anchors establish an approximate weak-perspective camera for each image. For each of 468 points we keep its frontal image position and fit depth to the two oblique lines of sight by weighted least squares. MediaPipe's relative depth helps estimate the camera axes and supplies the fallback where the side views disagree. Strongly inconsistent captures are rejected. The result displaces the existing head vertices; there is no second face shell. Corroborated depth can move up to 0.30 eye spacings in the face interior; movement diminishes toward the boundary so it meets the original head. This reconstructs estimated _relative_ relief, not real-world dimensions.

The oblique photos also supply cheek texture. A triangle gets more weight in a side image when its projected area increases after compensating for frame size and scale; triangles that fold or shrink are skipped. Eyes, nose centre and mouth centre keep the frontal photo. Skin colour and limited exposure compensation soften the transition. The same geometry and blend render in both the fitting studio and the body view, independent of the viewing angle.

### Other open-source routes evaluated

| Project                                                                                                                                            | Useful for                                                                          | Fit with this app                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Google GNM Head](https://github.com/google/GNM) and [Webcam Puppet](https://github.com/edualvarado/gnm-webcam-puppet)                             | A dense parametric head and an interactive webcam example with expression tracking. | A candidate for a separate animated head. Integrating it would require registering and joining it to both anatomy models. Neither the model nor the example is bundled here. |
| [AliceVision / Meshroom](https://github.com/alicevision/Meshroom)                                                                                  | Offline photogrammetry from a longer series of overlapping photographs.             | Better suited to a separate asset-production workflow, with a still subject and controlled light.                                                                            |
| [Blender glTF exporter](https://github.com/KhronosGroup/glTF-Blender-IO) and [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html) | Preparing a verified scan in Blender and delivering it as a web mesh.               | A route for a future full-head import. A file-format conversion alone does not estimate personal shape or attach the neck.                                                   |

## Frame consistency

Each video frame is copied to a canvas **before** inference. Landmarks, the canvas texture and the captured portrait all use these same frozen pixels. A constantly advancing `VideoTexture` must not be paired with landmarks from an earlier frame. The Pulse view of the Camera page also freezes and re-detects a frame when the user asks for a portrait with **Capture & check the fit**.

**Play sample motion** sends the fictional sample portrait through a moving, scaled canvas stream and the same video inference, fitting and capture path as the webcam. It requests no webcam permission. The sample remains explicitly labelled after capture and application. It is useful for checking registration while the face moves across the source image.

## Limits and privacy

Both capture paths use one ordinary camera. Frontal-only captures use monocular estimated shape; the three-angle option adds independent observations of the face. Hair, ears, scalp and the back of the head remain those of the reference. Lighting, changes of expression, glasses, occlusion and limited resolution still affect the result.

The browser keeps images and points in the current tab's memory. Reloading the page clears every applied portrait. The physical webcam still needs a test on the user's hardware; sample video testing cannot validate its permissions, focus or exposure.

Technical reference: [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web).
