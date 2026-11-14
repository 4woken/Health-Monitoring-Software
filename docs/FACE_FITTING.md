# Face fitting

MediaPipe Face Landmarker is already part of this application. Its 468 surface landmarks are used for visual personalisation; the separate pulse experiment estimates an experimental camera pulse. Neither produces a personal medical scan.

The capture, framing guidance and tracking are in `src/camera/face/`. The fit on the reference head is in `src/body/portrait/` (`headFit.ts` and `skinPortrait.ts`).

## Registration

The two displayed MakeHuman heads have separate calibrations in `public/human/male-head.json` and `female-head.json`. Start the development server with `npm run dev` and open `/scripts/reference-heads.html` to regenerate them with the local Face Landmarker. The calibration uses the same skin texture, eye positions and view orientation as the viewer. It records 468 facial surface landmarks and the eyelid openings for the projected portrait. The original BodyParts3D and HuBMAP head templates in `src/body/portrait/referenceHeads.json` are used by the atlas fallback. [Sources and licences](../THIRD_PARTY_NOTICES.md)

The templates are registered on both eye centres before a portrait is applied. Barycentric correspondence retargets the source eyes, nose, lips and outline onto the same head used in the Body view. The estimated personal shape displaces the front of the reference skin, with a single-view limit of 12 mm per axis and a smaller allowed displacement near the face boundary. The neck, scalp and back remain the reference. The default shape blend is 65%; **Auto-fit face** restores the automatic registration. The reference eyeballs are hidden while the portrait owns those surfaces. The fitted portrait uses curved supports under the eyelids of both MakeHuman heads. The original atlas uses its separately baked supports, which can be regenerated with `blender -b --factory-startup --python-exit-code 1 --python scripts/fit-portrait-eyes.py`.

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

Each video frame is copied to a canvas **before** inference. Landmarks, the canvas texture and the captured portrait all use these same frozen pixels. A constantly advancing `VideoTexture` must not be paired with landmarks from an earlier frame. The pulse page also freezes and re-detects a frame when the user requests a portrait.

**Play sample motion** sends the fictional sample portrait through a moving, scaled canvas stream and the same video inference, fitting and capture path as the webcam. It requests no webcam permission. The sample remains explicitly labelled after capture and application. It is useful for checking registration while the face moves across the source image.

## Limits and privacy

Both capture paths use one ordinary camera. Frontal-only captures use monocular estimated shape; the three-angle option adds independent observations of the face. Hair, ears, scalp and the back of the head remain those of the reference. Lighting, changes of expression, glasses, occlusion and limited resolution still affect the result.

Live frames and unconfirmed captures stay in memory. Confirming with **Next** in avatar setup or **Use this face** in the studio saves the cropped views, their landmarks and skin tone, and any fitted surface and calibration in this browser. Reopening the profile rebuilds the same fit from those data with the camera off. Pulsar never uploads the portrait. **Remove portrait** erases the saved fit for that member.

The physical webcam still needs a test on the user's hardware to verify its permissions, focus and exposure.

Technical reference: [MediaPipe Face Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web).
