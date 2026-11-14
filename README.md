# Pulsar

Pulsar shows each crew member's body in space, in the place they live. What they should do today points at the body, a click on any part says what it shows, and everything else opens over the same screen: the check-up of the day, the camera tools, what the mission does to the body, and NASA's own medical requirements for astronauts.

A pulsar is a star whose beam sweeps past at a perfectly regular rhythm, the most regular pulse in the sky. The name fits an app built around a heartbeat.

Built for the NASA Space Apps Challenge 2026, challenge "Create Health Monitoring Software for Astronauts on Space Missions". It is not affiliated with NASA.

> The mission dashboard uses simulated health records. Camera tools estimate pulse and breathing locally from the person in front of the camera. This is an educational prototype, not a medical device. Do not use it to make health decisions.

[Pulsar logo proposal](public/brand/pulsar-proposal.png) · [Compact symbol](public/brand/pulsar-mark.svg)

## Try it

You need **Node.js 24** or newer.

```sh
npm ci
npm run dev
```

Open <http://localhost:5173>. Pulsar opens on the body of the last person shown, Lucas the first time. The small menu with their name at the top left switches to **Enzo**, **Nassim** or **Youssef**. Nobody signs in and every profile is open to everyone.

Choose **Add a crew member** in that menu to set up a profile. You can enter a call sign, specialty, completed spaceflights and total days in space before the current mission. Leave unknown values blank. You can create a member directly or add a face with the camera.

Enter height, weight, chest circumference and waist circumference during creation, or later with **Edit body dimensions** in the same menu. Each value is optional. Height sets the model’s scale. Weight approximates overall width, while the two circumferences adjust the torso. Measurements stay in the session unless you choose to remember them on this device.

You can also enter your resting pulse measured before the mission. In **Camera → Pulse camera**, a sufficiently clear live reading shows the difference from that personal reference in beats per minute. The reference is optional and is only saved across visits when you choose to remember it. NASA has used resting heart rate before flight as a reference for comparisons. [Biomedical Results of Apollo](https://ntrs.nasa.gov/api/citations/19760005580/downloads/19760005580.pdf).

NASA’s astronaut health surveillance tracks spaceflight exposure over time, including flight count and cumulative time in space. Pulsar uses the two self-reported figures as profile context. Chest and waist measurements are also documented in NASA’s handbook for human-system design. [LSAH portal](https://nlsp.nasa.gov/resources/lsah) · [Flight history in LSAH](https://ntrs.nasa.gov/api/citations/20180004918/downloads/20180004918.pdf) · [Human Integration Design Handbook, Table 1e](https://www.nasa.gov/wp-content/uploads/2023/03/human-integration-design-handbook-revision-1.pdf).

## Camera experiments

- **Camera → Pulse camera** estimates pulse with POS. Select **Compare POS and CHROM** to compare two estimates from the same skin samples.
- **Camera → Breathing** estimates breaths per minute from chest movement. Frame your face and upper chest and remain still for at least 32 seconds. If tracking or the signal is lost, the rate clears. A recent estimate can animate the selected profile’s chest for one minute.
- **Camera → Face & body** fits a portrait from front, left and right views. **Avatar comparison** uses a separate VRM character to compare direct MediaPipe animation with KalidoKit on the same images. [Avatar comparison](docs/AVATAR_LAB.md).
- [Offline pulse models and WESAD stress-classification experiments](docs/WEBCAM_RESEARCH.md) report the evaluation conditions and results.

## What you can do

**One screen.** The body stays on screen. The check-up, the camera tools and every detail open over it and close back to it.

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

**Personal mini-missions.** Open **Check-up → Find a mini-mission**, or follow a hand, leg, sleep or mood link from the body: the panels of the arm and leg bones, and the pop-ups of sleep and mood. A personal check-in can suggest a camera-guided solar-panel assembly game, seated knee extensions on Earth, a five-signal reaction game or a one-minute breathing break when the person reports stress. An optional camera sample shows breaths per minute alongside the person's own answer. The video and breathing rate stay in memory. After the break, the person can say whether their stress feels lower, about the same or higher. Each suggestion explains its source and the reason it was offered. Completed activities and optional difficulty feedback are separate for each crew member. Result saving on this device is optional.

**Check-up.** **Check-up** in the top bar opens the tasks of the day beside the body: exams that are due or out of date and NASA's tasks of the mission day, a follow-up for each signal that needs one, and the daily routine (blood pressure, urine volume, mood, exercise, pulse with the camera). Tick them, remove them, add your own. **See it on the body** points at the part a task is about. The plan comes from simple rules on the signals, so every task can be traced to a value; the planner is built so that an AI model can take its place later without changing the screen.

**Camera.** **Camera** in the top bar opens the camera tools over the body, all processed on your computer. **Face & body** frames your face, shows it live on the 3D head and lays the captured portrait on the body ([how the fit works](docs/FACE_FITTING.md)). **Pulse camera** estimates your pulse from small colour changes in the skin of your face; you can download the numbers as a CSV file and compare them with a finger pulse oximeter, as in [the validation protocol](docs/VALIDATION.md). **Breathing** and **Avatar comparison** are described above. **Back to the body** closes them.

### Destination and habitat

The **destination** sets what the body lives with: gravity and radiation dose rate. **Orbit** (low Earth orbit), the **Moon** (lunar south pole), the **cruise to Mars** and **Mars** (Gale crater) each use measured dose rates with their sources. Each destination brings its usual **habitat**, the room behind the body, and you can choose another. The habitat never changes the body. The station and the spacecraft are credited NASA photographs (the Destiny laboratory aboard the ISS and an Orion cabin mock-up); the rover, the Moon base and the Mars base are generated illustrations based on NASA images, and the app says so under the picture. NASA has not reviewed or endorsed this software.

The **mission day** in the top bar moves the whole simulation through the 90 days of the mission.

## Privacy

- The camera starts only when you ask, never records sound, and stops when you leave the page or press stop. Frames stay in memory just long enough to be used, then are dropped.
- A captured face stays in memory for the session. It is never uploaded or saved, and a reload clears it.
- People you add and the state of their check-up are kept in your browser only.
- Nothing is sent to the internet. There is no server: the app runs entirely in your browser.

## What is real and what is simulated

- **Real:** measured radiation dose rates for orbit, the Moon, the cruise to Mars and the Martian surface; the career dose limit; published bone, muscle, fluid-shift and blood figures from spaceflight; NASA's risk pages for each signal; the NASA photographs.
- **Simulated:** every health value, its day-by-day curve and the storylines of the four profiles.
- **Our own choices:** some warning levels and the behaviour in partial gravity, which nobody has measured over long stays. The interface marks them as our assumptions wherever they are used.

Sources are listed in each signal's detail, in [docs/RESEARCH.md](docs/RESEARCH.md) and in `src/health/sources.ts`.

## For developers

```sh
npm run format:check   # formatting
npm test               # unit tests: signals, check-up planner, physiology, pulse processing, face fit
npm run build          # type check and production build
```

`npm run format` fixes formatting. On macOS, `start-mac.command` starts the app on port 5174.

```text
src/
  app/        the shell: top bar and the panels over the body
  crew/       the people on board: roster, adding someone, crew menu
  body/       the 3D body and the one screen: anatomy loading, organs, pins, portrait on the skin
  health/     signals, simulated readings, recommendations, the NASA reference, metrics, sources
  mission/    destinations, habitats, the physiology engine and its simulator
  checkup/    the daily check-up: planner and panel
  exercises/  personal check-in and mini-missions
  camera/     face fitting, VRM expressions, pulse and breathing estimates
  ui/         shared interface components
scripts/      setup, the anatomy build (BodyParts3D bones and vessels), the fake webcam, pulse comparison
public/       anatomy models, habitat pictures and the face-tracking model, served locally
docs/         architecture, research notes, physiology model, face fitting, validation
```

Further reading: [architecture](docs/ARCHITECTURE.md), [NASA reference](docs/NASA_REFERENCE.md), [research and rule sources](docs/RESEARCH.md), [physiology model](docs/PHYSIOLOGY.md), [pulse validation](docs/VALIDATION.md), [third-party components and licences](docs/CREDITS.md).

## Credits

Made in France by the team: **Lucas Baurianne** (team owner), **Enzo Baurianne**, **Nassim Arifette** and **Youssef Mir**.

The two textured bodies use MakeHuman geometry and Margaret Toigo’s skin textures (CC0). Each loads independently and carries a calibrated portrait. [Human model sources](THIRD_PARTY_NOTICES.md).

Anatomy models: BodyParts3D (© The Database Center for Life Science) and the HuBMAP HRA 3D Reference Organs, both CC BY 4.0. Face tracking: Google MediaPipe (Apache 2.0). Typeface: Barlow (SIL Open Font License). Habitat pictures: NASA photographs used under the NASA Images and Media Usage Guidelines, and generated interiors based on NASA images (credits in `public/environments/README.md`). Full list in [asset credits](docs/CREDITS.md).
