# Checking the self-tests

## Movement counts

The reference is the number of completed movements visible in each video, or the published cycle annotations for RepCount-A. For a repeatable comparison, replay the same decoded frames in timestamp order through the bundled MediaPipe Pose Landmarker Lite. Keep the image aspect ratio, the image landmarks and the world landmarks. Pass both sets and the frame timestamp (milliseconds) to the tracker. The real-time checks play the original video into the camera input through the **Tests** screen in Chrome.

| Recording                                                                                                                  |                                        Reference | Fixed-frame replay |
| -------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------: | -----------------: |
| [FitnessScape, rear three-quarter view](https://commons.wikimedia.org/wiki/File:Squat_-_exercise_demonstration_video.webm) |                                         2 squats |                  2 |
| [US Marine Corps, front three-quarter view](https://www.dvidshub.net/video/517502/body-weight-squat)                       |                                         5 squats |                  5 |
| [Bodyweight squat, side view](https://commons.wikimedia.org/wiki/File:Bodyweight_Squats.gif)                               |                                          1 squat |                  1 |
| [Squat and frontal raise, side view](https://commons.wikimedia.org/wiki/File:Squat_and_Frontal_Raise.webm)                 | 6 squats and a separate bend to pick up a weight |                  6 |
| [Stanford Sit2Stand demonstration](https://sit2stand.ai/assess/)                                                           |                                    5 chair rises |                  5 |
| [OpenCap Monocular chair demonstration](https://utahmobl.github.io/OpenCap-monocular-project-page/)                        |                                    5 chair rises |                  5 |
| [Physitrack, standing heel raises](https://us.physitrack.com/home-exercise-video/heel-raises-version-2)                    |                                    4 heel raises |                  4 |

Two additional clips came from the held-out test split of RepCount-A. The barbell clip `stu6_68` returned all six annotated cycles. The portrait clip `stu8_71` labels four, including a descent already in progress when the film opens. Pulsar returned three of the four annotated cycles. It requires a standing reference and counted all three descents and returns fully observed after calibration. [RepCount-A](https://svip-lab.github.io/dataset/RepCount_dataset) · [Published test annotations](https://huggingface.co/datasets/lmms-lab-eval/repcount/blob/main/test.jsonl)

For the chair checks, the video rests on the initial seated frame while the app counts down, then plays at its original speed from **Go**. Both five-rise sequences also reached the result screen and released the camera in real time. Starting the movie before the countdown finishes can exclude the first rise. The Stanford replay took 13.8 seconds with reduced motion and 14.0 seconds with the animated coach. In a demonstration with a second person beside the chair and partly obscured legs, the camera did not establish a seated starting position. Frame only the participant. [CDC chair stand demonstration](https://commons.wikimedia.org/wiki/File:30-Second_Chair_Stand_Test.webm)

## Other tests

| Test                                | Reference used in the browser check                                                                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Balance                             | Six controlled poses held for 20, 20, 20, 20, 15 and 15 seconds produced 110 seconds. Dropped eye tracking and missing head movements are covered by regression tests.                                                                   |
| Dexterity                           | Eight controlled hand transfers placed all eight cells in their sockets with zero drops.                                                                                                                                                 |
| Thinking and reaction               | Four timed symbol matches and nine correct memory targets produced four symbols and 100% memory accuracy. An unanswered reaction session returned to the start without storing a time.                                                   |
| Vision and hearing                  | Known optotype responses, two marked grid cells and 24 completed digit triplets exercised scoring, replay and touch input.                                                                                                               |
| Resting pulse and pulse recovery    | Simulated Bluetooth readings of 70, 73 and 85 bpm set a personal resting reference of 73. A recovery sequence with 30 squats and readings of 70, 130 and 85 bpm gave a Ruffier index of 8.5. An incomplete set did not produce an index. |
| Breathing rate and guided breathing | A gap in the controlled rate readings cleared the partial sample. Six new readings yielded a median of 15 breaths/min. A one-minute guided session counted only active time across a pause.                                              |

These checks cover software behaviour on the recordings and inputs listed here. Physical accuracy for a particular webcam, lighting setup, headphones or sensor needs a simultaneous reference measurement. The pulse comparison protocol describes how to pair webcam estimates with a reference instrument. [Webcam pulse validation](VALIDATION.md)
