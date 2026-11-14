# Local face files

`face_landmarker.task` is the official Google MediaPipe Face Landmarker float16 model, version 1.

Source: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

Documentation and model information: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker

The `wasm/` runtime is copied from the installed `@mediapipe/tasks-vision` package by `scripts/copy-face-runtime.mjs`, which runs after `npm install` or `npm ci`. Git ignores these generated files. The library uses Apache-2.0: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE

The model and the runtime load from the app's own origin. Both camera features use them: the face studio (`src/camera/face/`) and the pulse measurement (`src/camera/pulse/`). Neither uploads or stores webcam frames. The face studio is a visual feature, not a medical measurement or a complete head scan.

The face studio (**Face & body** in the camera tools) previews the video on the reference head, guides the framing, and offers a frontal portrait or a guided three-angle fit. Three-angle mode uses the webcam or three local photos of one face; it fits the visible surface and textures the cheeks. The local [three-view sample](multiview/README.md) exercises the same image detector without a camera. The photos, the landmarks, the reconstructed surface and the fit settings stay in memory, in this tab only. **Use this face** lays the portrait on the body and stops the camera. Reloading the page clears it.

`sample-portrait.png` shows a fictional person, labelled as such, for trying the same detection and fitting without camera permission. How it was made, with the exact prompt: [SAMPLE.md](SAMPLE.md).
