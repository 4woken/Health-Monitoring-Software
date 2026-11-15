# Eye control

In the AR view, the buttons can be pressed with the eyes: look at one for a second and it is pressed. It works with the computer's webcam, without an eye tracker.

## How to use it

1. Open **AR view**. Eye control starts with it, and the browser asks for the camera the first time.
2. Look at each of the nine dots until its ring closes, about 15 seconds in all. Move as you would naturally: the calibration learns how your head turns as well as your eyes. While the camera cannot see your face, the dot waits and a small mirror of the camera appears in the corner.
3. Look at **Hide info** or at a mission. A bright ring follows your gaze. Near a button, the ring shrinks onto it, the button lights up and a bar fills along its foot. After a second the button is pressed, with a short beep if the voice of the tests is on.
4. To press the same button again, look away and back. **Back** is never pressed by the eyes, so a glance cannot close the view.

If the ring wanders, sit facing the camera at about arm's length, with the light on your face rather than behind you, and choose **Recalibrate**, beside **Eye control on**. Each mouse click also tells the model where you were looking. **Eye control on** turns it off, and **Use the mouse instead** leaves the calibration. Closing the AR view stops the camera. The calibration is kept until the page is closed, so reopening the view does not ask for it again.

## How it works

- **Face model.** MediaPipe's face landmarker, the one the self-tests use, reads 478 points of the face including the irises, its expression scores and the pose of the head, about thirty times a second, from the camera image at 1280×720 when the camera offers it.
- **Features.** For each eye, where the iris sits between the corners and between the lids, measured along the line of the corners in eye widths, so that tilting the head changes nothing. Then the face model's own scores for looking in, out, up and down, the direction the head points, and its position in front of the camera.
- **Calibration.** The nine dots give about 180 frames whose target is known; the first half second on each dot, while the eyes arrive, and the frames farthest from the rest are left out. Ridge regression maps the features to the screen. The strength of the regularisation is chosen by leaving out each dot in turn and measuring how far its frames land from it. That distance is the typical error of the calibration.
- **Learning as you go.** As in WebGazer, the frames just before a mouse click become new samples, at the place of the click. The last twelve clicks are kept.
- **Blinks.** Frames with both eyes closed are dropped, and the cursor waits. Looking down lowers the lids too, so the bar for a blink is high.
- **Smoothing.** The 1€ filter smooths the cursor strongly while the gaze rests and little while it jumps, so it is calm on a button and still quick.
- **Buttons.** A webcam places a gaze to within a few centimetres, not millimetres. As with a bubble cursor, the gaze takes the button under it or the nearest one within reach, and keeps it until it is clearly on another, so it does not flicker between two. With eye control on, the buttons grow and spread apart.

The code is in `src/app/gaze.ts` (features, regression, filter, targets, with tests in `gaze.test.ts`) and `src/app/useGaze.ts` (camera, calibration and cursor). The camera session is `src/selftests/camera/session.ts`.

## What to expect

Webcam eye trackers land a few centimetres from the true point at a normal distance from the screen: around 100 to 150 pixels for WebGazer after calibration, and 7 to 12 cm in WebEyeTrack's comparison of itself with WebGazer. That is why the targets are large and few. Tracking is best with the face lit from the front, the camera at the top of the screen, and glasses without reflections. It shows what a hands-free interface could do in a helmet; it is not a clinical eye tracker.

## Privacy

The camera runs only while the AR view is open with eye control on. Frames are read in memory and dropped; nothing is recorded or sent. The calibration is a few thousand numbers kept in memory until the page is closed, and no image is kept.

## Why not a library

We compared the open-source webcam eye trackers and kept their method instead of their code:

| Project                                                     | Method                                                                                 | Why it is not used as is                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [WebGazer](https://github.com/brownhci/WebGazer)            | Eye images mapped to the screen by ridge regression, learning from clicks              | GPLv3, which would bind the whole app; updates are no longer guaranteed                           |
| [WebEyeTrack](https://github.com/RedForestAI/WebEyeTrack)   | Head pose and a small neural network (BlazeGaze), adapted to the person on nine points | Early version (0.0.2); loads MediaPipe from a CDN and the face model from Google, and adds 2.6 MB |
| [EyeGestures](https://github.com/NativeSensors/EyeGestures) | Face landmarks and regression, 20-point calibration                                    | GPLv3 for the main library; the browser version needs its logo shown and loads scripts from CDNs  |

Pulsar uses the face model it already ships, so everything stays on the device and under the app's own terms.

## Sources

- Papoutsaki A., Sangkloy P., Laskey J., Daskalova N., Huang J., Hays J. WebGazer: Scalable Webcam Eye Tracking Using User Interactions. IJCAI 2016.
- Davalos E., Zhang Y., Srivastava N. et al. WebEyeTrack: Scalable Eye-Tracking for the Browser via On-Device Few-Shot Personalization. arXiv:2508.19544, 2025.
- Casiez G., Roussel N., Vogel D. 1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems. CHI 2012.
- Grossman T., Balakrishnan R. The Bubble Cursor: Enhancing Target Acquisition by Dynamic Resizing of the Cursor's Activation Area. CHI 2005.
- Google AI Edge. [MediaPipe Face Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker): face mesh, blendshapes and facial transformation matrix.
