# Comparing VRM face movement

The avatar lab uses one model, camera, framing and light setup. The direct solver uses MediaPipe's facial transformation matrix and expression scores. KalidoKit derives head rotation, eyelid opening and vowel shapes from a copy of the same landmarks. Hybrid is selected on entry. It takes the two eyelid weights from KalidoKit and the mouth weights and head rotation from MediaPipe. On a frame without iris landmarks, it uses the MediaPipe blink scores. You can compare all three modes on a frozen sample or while the webcam is active. The yaw readout follows the selected solver. The medical body and its three-angle portrait fitting run independently.

The three labeled sample images are synthetic views from `public/face/multiview/`. Each one runs through the local Face Landmarker. The live camera is optional. The sample VRM is bundled for offline use and loaded only when this view opens. KalidoKit 1.1.5 is deprecated upstream and isolated in this experiment.

## Quick browser check

On the bundled front, left-cheek and right-cheek samples, the rendered head turned in the direction of the input image. The direct solver reported −1°, +25° and −27°. KalidoKit reported −1°, +28° and −30°. These are angles from the selected solver on synthetic source images. This test did not assess real-person likeness, timing of live blinks or expression tracking on a physical webcam.

## Sources

- [pixiv three-vrm](https://github.com/pixiv/three-vrm), MIT.
- [KalidoKit](https://github.com/yeemachine/kalidokit), MIT.
- [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js).
- [Reference VRM](https://github.com/vrm-c/vrm-specification/tree/master/samples/VRM1_Constraint_Twist_Sample), © 2022 pixiv Inc., v1.0.1 under the [VRM Public License](https://vrm.dev/licenses/1.0/). The embedded metadata allows redistribution and use by everyone. The original bytes are preserved in `public/avatar-lab/sample.vrm` with SHA-256 `12c2b97e95e700783a6a550dc0eee2d7880aeedccef9ae67bc4c5a2f0f2631a2`.
