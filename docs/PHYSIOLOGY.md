# Physiology model

The physiology engine estimates four well-documented effects of spaceflight from four inputs. The code is `src/mission/physiology.ts`, its tests are in `src/mission/physiology.test.ts`, and every parameter points to an entry in `src/health/sources.ts`.

In the app, the **Physiology simulator** panel under the body shows the four results day by day, with their charts and sources; its **How the model works** section lists the equations and parameters. The **Mission effects** button next to the depth control shows the results on the 3D body: the fluid moved toward the head, hip and spine bone, and calf muscle, next to the heart rate.

It is an educational model: it shows trends and orders of magnitude so a crew can see why exercise and shielding matter. It does not predict what will happen to a particular person.

## Inputs

| Input            | Meaning                                                  | Range    |
| ---------------- | -------------------------------------------------------- | -------- |
| `gravity`        | Share of Earth gravity: 0 in orbit, 0.17 Moon, 0.38 Mars | 0 to 1   |
| `day`            | Days since launch                                        | 0 and up |
| `exercise`       | Share of the resistance-exercise programme actually done | 0 to 1   |
| `doseRateMSvDay` | Radiation dose equivalent per day, mSv                   | 0 and up |

By default the inputs follow the chosen destination and the selected crew member's exercise log (sessions in the last 7 days divided by the 5 planned). Moving a slider in the panel switches to what-if values until **Reset**.

## Outputs and equations

### Fluid shift toward the head

```
V(t) = 2.0 L × f(g) × (1 − e^(−t / 0.5 day))
```

- **2.0 L**: NASA states that about 2 litres of fluid move from the lower to the upper body on entering weightlessness (`FLUID_SHIFT`).
- **0.5 day**: leg volume measured in flight fell 12.7 % (2.2 L), mostly on mission day one. The half-day time constant is our fit to that statement (`FLUID_SHIFT_TIME`, demo parameter).
- **f(g)**, the share of the weightless shift left at a given gravity: in parabolic flights the neck vein measured 12 mm² seated at 1 g, 68 mm² at a quarter of Earth gravity and 103 mm² lying flat (`GRAVITY_PARTIAL`). Taking lying flat as the stand-in for weightlessness gives 1 at 0 g, 0.62 at 0.25 g and 0 at 1 g. We join these points with straight lines, which gives 0.74 on the Moon and 0.51 on Mars (`GRAVITY_DEMO`, demo assumption: no long stay in partial gravity has been measured).

### Hip and spine bone density

```
BMD(t) = BMD₀ × e^(−k_b × t)
k_b = −ln(1 − 1.25 % × (1 − 0.5 × e)) / 30.44 days × (1 − g)
```

- **1.25 % per month**: the middle of the 1 to 1.5 % a month lost at the hip and spine on 4 to 6 month missions before modern resistance devices (`BONE_LOSS`, NASA Human Research Program).
- **0.5 × e**: a full exercise programme halves the rate. Resistance exercise on the ISS gives partial protection (Sibonga et al. 2019); the size of the effect is our choice (`BONE_EXERCISE`, demo parameter).
- **(1 − g)**: loss scales with the missing gravity (`GRAVITY_DEMO`, demo assumption).

### Calf muscle volume

```
Vol(t) = Vol₀ × e^(−k_m × t)
k_ex = −ln(1 − 13 %) / 180 days
k_m  = (k_ex × 29/15 + (k_ex − k_ex × 29/15) × e) × (1 − g)
```

- **13 % in 180 days**: MRI of nine crew members after six months on the ISS, with their exercise programme (`MUSCLE_ISS`, Trappe et al. 2009).
- **29/15**: in 90 days of bed rest, calf volume fell 29 % without exercise and about 15 % with it (`MUSCLE_BEDREST`, Alkner and Tesch 2004). We use the ratio to estimate the loss without exercise.
- **(1 − g)**: as for bone.

### Radiation dose

```
D(t) = doseRate × t        career limit: 600 mSv
```

Measured dose rates used by the destinations: Orbit, 0.73 mSv a day measured on the ISS (`RAD_ISS`); Moon, 1.37 on the lunar surface (`RAD_MOON`, Chang'E-4); Cruise to Mars, 1.8 (`RAD_RATE`, Curiosity RAD); Mars, 0.67 on the Martian surface (`RAD_MARS_SURFACE`, Curiosity RAD). The 600 mSv career limit is NASA's (`RAD_LIMIT`). Solar storms are not modelled.

## Mission profiles

A profile is a list of phases, each with its own gravity and dose rate. The engine steps one day at a time: the fluid shift relaxes toward the level of the current gravity, and bone and muscle lose that day's share. With a single phase it gives exactly the same numbers as the formulas above (tested).

The panel offers three profiles:

- **This setting** (the default): the current destination for its configured number of Earth days. It opens on the day selected in the top bar. Changing the projection day previews a different day inside the simulator. Reset returns to the current mission day. Orbit covers 180 days, the lunar surface 3, Mars cruise 203 and Mars surface 500. The last scenario is a design study. Each starts with its own baseline.
- **ISS 6 months**: 180 days at 0 g and 0.73 mSv a day.
- **Mars mission**, a conjunction mission: 180 days of cruise (0 g, 1.8 mSv a day), 500 days on the surface (0.38 g, 0.67 mSv a day), 180 days of cruise home. The gravity and dose-rate controls show the phase of the selected day. Threshold dates on this profile and the ISS profile come from their daily trajectories.

## Check against a published figure

For the Mars profile the engine adds up 983 mSv. Using Curiosity's measurements, the RAD team estimated about 1.01 Sv for the same 180 + 500 + 180 day mission (`MARS_MISSION_DOSE`). The difference is under 3 %, and the test suite fails if it grows beyond 5 %.

## Limits

- Bone and muscle are modelled as a steady first-order loss. Real losses vary between people and are not linear over very long missions.
- Recovery after landing is not modelled.
- Partial gravity is an interpolation; nobody has lived for months on the Moon or Mars.
- The avatar uses small illustrative changes in cheek and calf shape. A projected volume in litres represents a redistribution across the body. It does not predict a particular person’s facial dimensions.
