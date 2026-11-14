# Architecture

Pulsar runs entirely in the browser: no server, no account, no database. The code is organised by product area. Each folder keeps its logic (pure functions, with tests) and its components together.

```text
src/
  main.tsx    entry point: fonts, styles and motion settings
  app/        the shell: top bar and the panels over the body (check-up, camera, adding someone)
  crew/       the crew: the list (roster.ts), adding someone, the crew menu, shared state
  body/       the 3D body (BodyViewer) and the one screen around it (BodyScreen): pins, pop-ups, side panels
    anatomy/  loading the models, organs and depth layers, where each signal sits on the body
    portrait/ laying the face on the skin of the reference head
  health/     signals (signals.ts), simulated readings, how fresh each value is, recommendations (advice.ts),
              the NASA reference (exams.ts, environment.ts), metrics, sources, plain-language guide
    ui/       signal row, signal panel, NASA reference panel, charts, vital signs, live pulse
  mission/    destinations, habitats, the physiology engine and its panel
  checkup/    the daily check-up: planner and panel
  exercises/  personal check-in and mini-missions
  camera/     webcam features: face fitting (face/) and pulse measurement (pulse/)
  ui/         shared components
  styles/     global styles
```

## Data

The four demo profiles and their values are simulated. `crew/roster.ts` describes the four team members: role, reference body, values before launch and storylines (`stories`). `health/simulation.ts` produces each day's values from these storylines. `health/readings.ts` adds the measurement schedule (an eye and a neck ultrasound every 14 days, a blood test every 30 days, and so on) and how fresh each value is. `health/signals.ts` judges the values with one rule set, adapted to spaceflight. Each limit cites an entry in `health/sources.ts`, or says that it is our assumption.

The destination (`mission/missions.ts`) sets the gravity, the share of the weightless fluid shift and the radiation dose rate that the simulation uses. The habitat (`mission/habitats.ts`) is only the picture behind the body.

Someone added gets typical values for their reference body and no storyline. Their identity, role, optional call sign, speciality, flight history and choice of body stay in the browser. Height, weight and chest and waist circumferences adjust the mannequin (`crew/bodyDimensions.ts`, `crew/torsoFit.ts`). These measurements and the resting pulse before launch are optional and stay in memory, unless the person chooses to keep them on this device. The face is gone after a reload. Only a pulse measured live with a good enough signal is compared with the resting pulse before launch, separately from the simulated data.

## Daily check-up

`checkup/planner.ts` defines a planner: an object whose `plan` function receives a person's day (`DayReport`) and the destination, and returns a list of tasks. The planner provided follows simple rules: exams due or out of date, the NASA tasks that fall on the mission day (`dueOn` in `health/exams.ts`), a follow-up for each signal that needs one, and the daily routine. Another planner, for example one based on a language model, can replace it by following the same interface; the screen does not change. `checkup/useCheckup.ts` keeps the list for each person, destination and day in the browser, with the tasks ticked, removed or added by hand.

## Recommendations and the NASA reference

`health/advice.ts` turns each signal that needs attention into one short action with a kind (exercise, stretching, heart, fatigue, stress and so on), and adds the mission's own, such as stretching the back in the first three weeks of weightlessness. The body screen pins the three most urgent to the body. `health/exams.ts` holds NASA's medical requirements for astronauts with their schedule, and `health/environment.ts` what each destination does to the body and what NASA does about it. [NASA_REFERENCE.md](NASA_REFERENCE.md) gives the sources and the limits.

## Webcam

The camera starts only when someone asks for it, and never uses the microphone. Frames are used while they are analysed, then dropped.

- `camera/pulse/` measures the pulse (POS method, see [VALIDATION.md](VALIDATION.md)) in one session shared by the whole app, so the 3D heart keeps beating with the measured pulse. The session stops on request (the camera button in the top bar, **Stop camera** on the heart-rate card, **Stop the camera** on the Pulse view), on an error, and when the page is hidden. Its tracks and the MediaPipe model are released when it stops.
- `camera/face/` frames the face and prepares the portrait, which `body/portrait/` lays on the reference head ([FACE_FITTING.md](FACE_FITTING.md)). Its camera stops when the portrait is captured, when the face view closes and when the page is hidden.

The two never film at the same time: the face view stops the pulse session before it starts its own camera or the sample.

## Changing or adding a signal

1. Add the id to `SIGNAL_IDS` and the value to `Readings` in `health/signals.ts`, and its curve in `health/simulation.ts`.
2. Write the rule in `health/signals.ts`, with its sources in `health/sources.ts`.
3. Add its measurement schedule in `health/readings.ts`, the plain text in `health/guide.ts`, the metric in `health/metrics.ts`, and its place on the body in `body/anatomy/bodyShape.ts` (and in `body/anatomy/loadAnatomy.ts` when the marker belongs on an organ).
4. Test the limits in `health/signals.test.ts`.
5. Run `npm run format:check`, `npm test` and `npm run build`.

A value repeated between two exams must not be shown as a separate measurement, and a change in a percentage is given in percentage points.
