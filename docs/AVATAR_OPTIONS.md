# Personal 3D face: options checked on 14 November 2026

## Visual direction

Reference given: https://www.metahuman.com/

The interface shows the body with opaque skin in front of a picture of the habitat, with dark, see-through panels over it. The body stays an anatomical reference; a portrait the person approves can be fitted to its head for the session. No MetaHuman portrait, logo or model was copied.

## Free options

| Option                                                                | What it offers                                                                                                    | Licence and limits                                                                                                                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [MediaPipe](https://github.com/google-ai-edge/mediapipe)              | Face landmarks, expressions and head pose from images or the webcam. Runs in the browser.                         | Apache-2.0 library. An approximate face surface does not rebuild the hair or the back of the head.                                                                                |
| [FaceMeshFaceGeometry](https://github.com/spite/FaceMeshFaceGeometry) | Three.js geometry from the MediaPipe landmarks, with texture coordinates to project the webcam image on the face. | MIT. A good example of integration with our stack; it is not a full head scan.                                                                                                    |
| [DECA](https://github.com/yfeng95/DECA)                               | Rebuilds a detailed 3D head from one photo, with OBJ export and animation.                                        | Its own licence, for research, education and non-commercial art projects. Needs Python, PyTorch and extra assets; not installed here.                                             |
| [KalidoKit](https://github.com/yeemachine/kalidokit)                  | Turns face and body tracking into the movements of VRM or Live2D avatars.                                         | MIT, but marked as deprecated by its author. It animates an existing avatar and does not create a 3D likeness of the person. Tried in the [VRM avatar comparison](AVATAR_LAB.md). |

Technical sources:

- MediaPipe for the web: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web
- FaceMeshFaceGeometry and the video texture: https://github.com/spite/FaceMeshFaceGeometry#texture-coordinates
- DECA licence: https://github.com/yfeng95/DECA/blob/master/LICENSE
- KalidoKit deprecation: https://github.com/yeemachine/kalidokit#readme

## What was built

The **Face & body** view of the camera tools opens the same Three.js body as the Body screen. MediaPipe's 468 surface landmarks align the portrait with the head and the eyes of the reference model, with soft edges and a skin colour blend. The live face shows on the body in the studio; the Body screen then gets the still portrait the person chose. The tracking never produces a health value.

1. Pick a crew member, open **Camera** and choose **Face & body**, then a frontal portrait or the guided three-angle fit. **Put my face on it** (or **Change the face**) on the Body screen opens the same view, and so does **Next: the face** when adding a crew member.
2. Click **Start my webcam** and allow the camera in the browser.
3. Look straight ahead in even light, and wait until the guidance says "Ready. Capture and check the fit." The checks of framing, head angle, light and stability are rules of thumb for the display.
4. Click **Capture & review** (or capture the three angles), then adjust **Face size**, **Left / right**, **Height**, **3D face fit** and **Skin colour blend**. Drag the body to turn it, and use **Head**, **Chest** or **Whole body** to check the join from another view.
5. Click **Use this face** to keep the still portrait. **Stop preview**, leaving the view or hiding the page also stops the camera.
6. Without a webcam, **Try a sample person** runs the detection on a generated portrait of a fictional person. The sample stays labelled as fictional once used (its button reads **Use the sample face**).

Once chosen, the portrait and its settings stay in the memory of the tab until the page reloads. No video or image is uploaded: there is no server. The projection follows the surface of the model instead of adding a floating mask. The body, the head and the organs stay generic; the hair and the back of the head are not rebuilt. The detection and the hand-over from the studio to the Body screen were checked with the fictional face; a capture with a physical camera still has to be tried by the user on their own hardware.

A more faithful full head would need a separate capture step, a dedicated reconstruction, a check of the model licences and an import of the result into the viewer. A webcam alone cannot reach the photorealism of the MetaHuman reference.

The **Pulse** view of the Camera page keeps the experimental pulse measurement and its CSV export. Its **Capture & check the fit** button (**Review a new portrait** when the person already has one) takes one still frame and opens the same fit step in **Face on the body**. Nothing reaches the body before **Use this face**.

The fit uses separate MediaPipe templates for the two reference heads. The outline, the eyes, the nose and the mouth place the portrait; a limited change of the skin shape follows the estimated face while keeping the join at the neck. **Auto-fit face** restores these settings. The pixels of each video frame are frozen before the landmarks are computed, so the live view and the capture use the same image. **Play sample motion** moves the fictional sample in front of the same live pipeline, to check this path without access to a webcam. Details, and how to rebuild the templates: [FACE_FITTING.md](FACE_FITTING.md).
