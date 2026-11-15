# Pulsar

Pulsar shows each crew member's body in space, in the place they live. What they should do today points at the body, a click on any part says what it shows, and everything else opens over the same screen: the check-up of the day, the self-tests a crew member takes with the camera, the keyboard or headphones, what the mission does to the body, NASA's own medical requirements for astronauts, and a simulated AR view of the helmet visor.

A pulsar is a star whose beam sweeps past at a perfectly regular rhythm, the most regular pulse in the sky. The name fits an app built around a heartbeat.

Built for the NASA Space Apps Challenge 2026, challenge "Create Health Monitoring Software for Astronauts on Space Missions". It is not affiliated with NASA.

> The mission dashboard uses simulated health records. The self-tests measure the person in front of the computer, locally, with the camera, the keyboard or headphones. This is an educational prototype, not a medical device. Do not use it to make health decisions.

[Pulsar logo proposal](public/brand/pulsar-proposal.png) · [Compact symbol](public/brand/pulsar-mark.svg)

## Try it

You need **Node.js 24** or newer.

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Select an existing crew member in **Who's on board?** to open their dashboard directly. When adding a member, **Create profile** opens the dashboard and **Continue to face setup** lets you personalise the 3D head first. You can also open avatar setup from the crew menu. **Connect webcam** fits the portrait locally and stops the camera after capture. **Next** saves the fitted face to that profile and opens the dashboard. The next time you open the same site in this browser, the avatar loads with the camera off.

New profiles can include a call sign, specialty, flight history, chest and waist measurements. Beside the dashboard avatar, **Avatar dimensions** updates height and weight. The crew menu also opens the full measurement editor. Height scales the model, weight approximates overall width, and chest and waist refine the torso. Measurements stay in the session unless you choose to remember them on this device.

You can also enter your resting pulse measured before the mission. In the Lab of **Tests** (**Pulse camera**), a sufficiently clear live reading shows the difference from that personal reference in beats per minute. The reference is optional and is only saved across visits when you choose to remember it. NASA has used resting heart rate before flight as a reference for comparisons. [Biomedical Results of Apollo](https://ntrs.nasa.gov/api/citations/19760005580/downloads/19760005580.pdf).

NASA’s astronaut health surveillance tracks spaceflight exposure over time, including flight count and cumulative time in space. Pulsar uses the two self-reported figures as profile context. Chest and waist measurements are also documented in NASA’s handbook for human-system design. [LSAH portal](https://nlsp.nasa.gov/resources/lsah) · [Flight history in LSAH](https://ntrs.nasa.gov/api/citations/20180004918/downloads/20180004918.pdf) · [Human Integration Design Handbook, Table 1e](https://www.nasa.gov/wp-content/uploads/2023/03/human-integration-design-handbook-revision-1.pdf).

## Camera methods

- **Tests → Resting pulse** estimates the pulse with POS. In the Lab, **Pulse camera** shows the live estimate, and **Compare POS and CHROM** compares two estimates from the same skin samples.
- **Tests → Breathing rate** estimates breaths per minute from chest movement. Frame your face and upper chest and remain still for about 40 seconds. If tracking or the signal is lost, the rate clears. A recent estimate can animate the selected profile’s chest for one minute.
- **Tests → Lab → Face fitting studio** fits a portrait from front, left and right views. **Avatar comparison** uses a separate VRM character to compare direct MediaPipe animation with KalidoKit on the same images. [Avatar comparison](docs/AVATAR_LAB.md).
- The body tests use MediaPipe's pose, hand and face models in the browser: the stance, the joints and the eyes are read from landmarks, never from stored images.
- [Offline pulse models and WESAD stress-classification experiments](docs/WEBCAM_RESEARCH.md) report the evaluation conditions and results.

## What you can do

**One dashboard.** Select Skin, Vessels, Organs or Skeleton. Other tissues stay faint below the skin. Use **Explore anatomy** to select deeper structures or **Show lungs** to see both lungs. Wheel and pinch zoom follow the pointer or the midpoint of the gesture. The check-up, the self-tests, the AR view and every detail open over it and close back to it.

- **What to do today**, at the top left, lists the recommendations of the day: exercise, stretching in the first weeks of weightlessness, the heart, fatigue, stress, hydration, the eyes, the air, radiation, food and infection. The three most urgent also point at the body, red to act now and amber for today.
- Click a recommendation or a place on the body. The camera moves there and a pop-up shows the value, its trend over 30 days, what to do and why, and the exam NASA does in flight on the same question. **Details** opens everything about it beside the body.
- Markers on the body are white, amber or red. Point at the body to look under the skin.
- Choose **Skin**, **Vessels**, **Organs** or **Skeleton** to show that layer alone. Dragging the **Depth** slider blends adjacent layers. Vessels moves the camera to the heart and shows the blood pulsing through the vessels.
- Click an organ to see it on its own: what it does, what spaceflight changes, and the signals followed there.
- The details of a signal give the value, what it is, what it means here, how it is taken, what to do, its trend since launch, what NASA examines on the same question and the sources behind the rule. A vital sign along the bottom opens them directly. **Add to today's check-up** puts the follow-up on the person's list.
- **See all signals** lists the 15 signals, with **Trends** for every value since launch.
- The heart beats at the person's pulse. Start the camera and it beats at yours.

**NASA reference.** For the chosen destination, what gravity, radiation, light and UV, the closed cabin and the distance from Earth do to the body, and what NASA does about each on its flights. Below come the 47 requirements: what NASA examines on the ISS before, during and after a long-duration flight, with the in-flight schedule, and the yearly exam of former astronauts. The check-up adds the NASA tasks of the mission day. [How the reference is built](docs/NASA_REFERENCE.md).

**Mission effects.** Four known effects of spaceflight, computed day by day: fluid moving toward the head, loss of hip and spine bone, loss of calf muscle, and radiation dose. Choose **Mission effects** beside the body: the simulator opens in a panel and the body shows the result. Change the gravity, the share of the exercise programme done and the dose rate, or load six months in orbit or a full Mars mission. Every number has a source, and the [model description](docs/PHYSIOLOGY.md) explains each equation.

**Habitat exercise demos.** At the foot of the check-up, **Start avatar demo** plays a 30-second exercise on the avatar: a cycle on the station, rowing in the spacecraft, ankle work in the rover, stepping on the Moon, walking on Mars. Habitat and mission gravity determine the movement. Its illustrative heart and breathing rates stay separate from personal measurements.

**Self-tests.** **Tests** in the top bar opens short tests that a crew member takes on themselves, each one modelled on what NASA does with its crews, and exercises that keep them fit:

| Self-test                             | What NASA does                                                                                   | How Pulsar measures it                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaction test, 3 min                  | Reaction Self Test (PVT-B), for fatigue                                                          | Keyboard or touch: median response time and lapses of 355 ms or more                                                                                              |
| Thinking test, 4 min                  | Cognitive test every month and after high CO2 or a head injury (MEDB 7.4)                        | Two tests of NASA's Cognition battery: digit symbol substitution and a 2-back                                                                                     |
| Vision test, 6 min                    | Sharpness and Amsler grid on flight days 30 and 90 (MEDB 1.10)                                   | Tumbling E letters sized for a screen matched to a bank card, at a distance the camera reads from the iris; the hand that covers each eye is checked; Amsler grid |
| Hearing test, 4 min                   | Hearing test by flight day 21 (MEDB 1.8)                                                         | Digits in noise with headphones, a speech-in-noise threshold that needs no calibration                                                                            |
| Balance test, 4 min                   | Platform balance tests and one-leg stand (MEDB 1.5, 5.1), tandem walk after landing (Field Test) | Camera on the whole body (time held, feet, sway, eyes closed), or a phone's motion sensor held on the chest                                                       |
| Sit-to-stand test, 2 min              | Standing up from a seat right after landing (Field Test)                                         | Camera side-on: time for five stands                                                                                                                              |
| Hand dexterity test, 2 min            | Fine motor skills, which drop in the first week in orbit                                         | Camera on one hand: pinch, carry and drop eight cells against the clock                                                                                           |
| Pulse recovery test, 4 min            | Cycle test with heart rate on flight days 14 and 75 (MEDB N3.07)                                 | The Ruffier squat test: camera or Bluetooth heart-rate strap for the pulse, camera for the squats                                                                 |
| Resting pulse, Breathing rate         | Vital signs in the health checks (MEDB 1.2)                                                      | Camera: skin colour (POS) and chest movement                                                                                                                      |
| Squats, Heel raises, Guided breathing | Daily exercise (MEDB 5.2) and behavioural health                                                 | Camera counts the repetitions; a paced breathing break                                                                                                            |

Each test shows why it is due today, what NASA does and how this version differs, then runs in three steps: **Prepare**, the test itself, and the **Result**. A 3D figure shows the movement, and a voice from this device guides the tests done standing. The first three runs set the person's usual result; later runs are compared with it, and a run worse than usual is repeated within 24 hours, as NASA does after a red cognitive test. Results go back to the signals on the body: reaction and thinking to **Sleep and alertness**, the vision test to the optic nerve, balance and dexterity to the new **Balance and coordination** signal, sit-to-stand and camera-counted sets to **Bone and muscle loading** (and so to Mission effects), the pulse tests to **Oxygen and resting pulse**. Tests are due on NASA's flight days, when a signal calls for them (short sleep, high CO2, a headache, an optic nerve change, missed sessions) and in the first week after a change of gravity. The NASA reference links each requirement to its at-home version.

**Check-up.** **Check-up** in the top bar opens the tasks of the day beside the body: exams that are due or out of date and NASA's tasks of the mission day, the self-tests due today with a **Start** button, a follow-up for each signal that needs one, and the daily routine (blood pressure, urine volume, mood, exercise, pulse with the camera). A self-test done anywhere ticks its task. Tick the others, remove them, add your own. **See it on the body** points at the part a task is about. The plan comes from simple rules on the signals, so every task can be traced to a value; the planner is built so that an AI model can take its place later without changing the screen.

**Lab.** At the foot of **Tests**, the Lab keeps the camera tools behind the tests, all processed on your computer. **Face fitting studio** frames your face, shows it live on the 3D head and lays the captured portrait on the body ([how the fit works](docs/FACE_FITTING.md)). **Pulse camera** estimates your pulse from small colour changes in the skin of your face; you can download the numbers as a CSV file and compare them with a finger pulse oximeter, as in [the validation protocol](docs/VALIDATION.md). **Avatar comparison** is described above.

**AR view.** **AR view** in the top bar shows what a crew member could see inside the helmet visor on a spacewalk: the Earth from outside the station, deep space from Orion, the Moon or Mars, with only the health readings over it. The spacewalk readings (pulse, breathing, core temperature, effort, suit CO2) are a demonstration built from the person's resting pulse, at the levels NASA reports for suited work. **Hide info** clears the view, the mission buttons change the destination, and **Eye control** lets you press them by looking at them for a second, with a rough gaze from the webcam.

### Destination and habitat

The **destination** sets what the body lives with: gravity and radiation dose rate. **Orbit** (low Earth orbit), the **Moon** (lunar south pole), the **cruise to Mars** and **Mars** (Gale crater) each use measured dose rates with their sources. Each destination brings its usual **habitat**, the room behind the body, and you can choose another. The habitat sets the backdrop and helps select the exercise demo. The station and the spacecraft are credited NASA photographs (the Destiny laboratory aboard the ISS and an Orion cabin mock-up); the rover, the Moon base and the Mars base are generated illustrations based on NASA images, and the habitat menu says so. NASA has not reviewed or endorsed this software.

**Mission day** counts Earth days in the selected setting. Orbit covers 180 days (a typical ISS expedition of about six months). The lunar surface covers three complete days, using Apollo 17’s 75-hour stay as a reference. Cruise covers 203 days, based on the robotic Perseverance transit. The Mars surface scenario covers 500 days as a human mission design assumption. The selected day controls the dashboard history and the check-up. [ISS expeditions](https://www.nasa.gov/missions/station/faq-the-real-story-about-astronaut-health-care-in-space/) · [Apollo 17](https://www.nasa.gov/missions/apollo/apollo-17-mission-details/) · [Mars 2020 cruise](https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/mission/) · [NASA Mars reference mission](https://ntrs.nasa.gov/citations/19990026747).

## Privacy

- The camera starts only when you ask, never records sound, and stops when you leave the page or press stop. Frames stay in memory just long enough to be used, then are dropped.
- **Next** in avatar setup or **Use this face** in the face fitting studio saves the cropped portrait images, landmarks and fit settings for that crew member in this browser. Pulsar does not upload or sync portraits. To erase yours, choose **Remove portrait** in the studio, or **Use reference head** followed by **Next** in avatar setup. Deleting an added crew member also erases their portrait. Clearing the site's data erases all local portraits.
- People you add, the state of their check-up and their self-test results are kept in your browser only. **Clear** at the foot of **Tests** erases one person's results.
- The voice that guides the tests is one of this device's own: voices that would send the words to a server are not used.
- Nothing is sent to the internet. There is no server: the app runs entirely in your browser.

## What is real and what is simulated

- **Real:** measured radiation dose rates for orbit, the Moon, the cruise to Mars and the Martian surface; the career dose limit; published bone, muscle, fluid-shift and blood figures from spaceflight; NASA's risk pages for each signal; the NASA photographs.
- **Real:** your own self-test results, measured on this device.
- **Simulated:** mission health records, their charts, the four crew storylines, the pulse and breathing shown during an avatar exercise demo, and the spacewalk readings of the AR view.
- **Our own choices:** some warning levels and the behaviour in partial gravity, which nobody has measured over long stays. The interface marks them as our assumptions wherever they are used.

Sources are listed in each signal's detail, in [docs/RESEARCH.md](docs/RESEARCH.md) and in `src/health/sources.ts`.

## For developers

```sh
npm run format:check   # formatting
npm test               # unit tests: signals, check-up planner, self-tests, physiology, pulse processing, face fit
npm run build          # type check and production build
```

`npm run format` fixes formatting. On macOS, `start-mac.command` starts the app on port 5174.

```text
src/
  app/        the shell: top bar, the panels over the body and the AR view
  crew/       the people on board: roster, adding someone, crew menu
  body/       the 3D body and the one screen: anatomy loading, organs, pins, portrait on the skin
  health/     signals, simulated readings, recommendations, the NASA reference, metrics, sources
  mission/    destinations, habitats, the physiology engine and its simulator
  checkup/    the daily check-up: planner and panel
  selftests/  the self-tests: catalogue, results and usual result, what is due, camera and sensors, screens
  exercises/  the habitat exercise demo played by the avatar
  camera/     face fitting, VRM expressions, pulse and breathing estimates, the face studio
  ui/         shared interface components
scripts/      setup, the anatomy build (BodyParts3D bones and vessels), the fake webcam, pulse comparison
public/       anatomy models, habitat pictures and the face-tracking model, served locally
docs/         architecture, research notes, physiology model, face fitting, validation
```

Further reading: [architecture](docs/ARCHITECTURE.md), [NASA reference](docs/NASA_REFERENCE.md), [research and rule sources](docs/RESEARCH.md), [physiology model](docs/PHYSIOLOGY.md), [pulse validation](docs/VALIDATION.md), [third-party components and licences](docs/CREDITS.md).

## Credits

Made in France by the team: **Lucas Baurianne** (team owner), **Enzo Baurianne**, **Nassim Arifette** and **Youssef Mir**.

The two textured bodies use MakeHuman geometry and Margaret Toigo’s skin textures (CC0). Each loads independently and carries a calibrated portrait. [Human model sources](THIRD_PARTY_NOTICES.md).

Anatomy models: BodyParts3D (© The Database Center for Life Science) and the HuBMAP HRA 3D Reference Organs, both CC BY 4.0. Face tracking: Google MediaPipe (Apache 2.0). Typeface: Barlow (SIL Open Font License). Habitat and spacewalk pictures: NASA photographs used under the NASA Images and Media Usage Guidelines, and generated interiors based on NASA images (credits in `public/environments/README.md`). The 3D coach of the self-tests is the sample VRM of the avatar lab. Full list in [asset credits](docs/CREDITS.md).
