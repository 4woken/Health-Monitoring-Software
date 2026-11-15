# NASA reference

Pulsar ties its checks to what NASA actually examines on its astronauts, and to what each destination does to the body. The requirements are in `src/health/exams.ts`; what each destination does is in `src/health/environment.ts`.

## Sources

- **ISS medical requirements.** NASA Johnson Space Center, _Medical Requirements Integration Documents_ (MRIDs), JSC 28913. There is one document per requirement, revised between 2012 and 2021. Each says what is measured, why, and when: before, during and after a long-duration flight of more than 30 days. Pulsar uses the long-duration documents (codes ending in L) and the medical evaluation sections (MEDB). The Shuttle documents (codes ending in S) repeat them for short flights and are left out.
- **After the career.** NASA's [Medical Examination Requirements (MER) for former astronauts](https://www.nasa.gov/general/medical-examination-requirements-mer-for-former-astronauts/), the yearly exam behind the [Lifetime Surveillance of Astronaut Health](https://nlsp.nasa.gov/resources/lsah) (LSAH). The LSAH data itself is not public: access goes through a request with a privacy review. Pulsar uses only the list of exams.

## What it holds

47 requirements. Each has NASA's code, a plain name, what it looks at, when it is done, and when it applies: in flight, before and after flight, or after the career. Each also names the part of the body and the Pulsar signals on the same question. The summaries are in plain words, not the official text. The code finds the original.

What the crew does on set flight days:

| Requirement                                          | Code           | Flight days                                       |
| ---------------------------------------------------- | -------------- | ------------------------------------------------- |
| Eye examinations (vision, retina, eye pressure, OCT) | MEDB 1.10      | 30 and 90, and 30 days before landing             |
| Vein ultrasound (neck, collarbone and legs)          | MEDB 1.12      | 30 and 60, and 6 weeks before landing             |
| Health check by the crew medical officer             | MEDB 1.2       | 14 to 21 and 90, then 2 to 3 weeks before landing |
| Private medical conference                           | MEDB 1.3       | Every week, and every day for the first five      |
| Body mass                                            | MEDB 1.13      | In the first week, then every month               |
| Food questionnaire                                   | MEDB N3.06     | Every week                                        |
| Cycle ergometer fitness test                         | MEDB N3.07     | 14 and 75, and 14 days before landing             |
| Calf volume                                          | MEDB 5.4       | 14, then every 2 weeks                            |
| Hearing test                                         | MEDB 1.8       | By day 21, then around mid-mission                |
| Private psychological conference                     | MEDB 7.2       | Every 2 weeks                                     |
| Cognitive test (WinSCAT)                             | MEDB 7.4       | Every month                                       |
| Air samples (formaldehyde, grab samples)             | MR036L, MR037L | Every 45 days                                     |
| Drinking water samples                               | MR054L         | Every 90 days                                     |

Exercise (MEDB 5.2) takes 2.5 hours every day. Other requirements run all the time: dosimeters, the air quality monitor every 73 hours. The rest happen when needed, such as around each spacewalk or after a skin injury.

## Where it shows

- **Pop-up on the body.** The first in-flight requirement on that signal's question, with its schedule.
- **Details of a signal.** Every requirement on the same question, in flight first, then before and after flight, then after the career.
- **Check-up.** The NASA tasks that fall on the mission day, under "Exams and NASA schedule", and their at-home versions under "Self-tests": the vision test on the days of MEDB 1.10, the thinking test on those of MEDB 7.4, the hearing test on day 21 (MEDB 1.8), the pulse recovery test on the cycle test days (MEDB N3.07) and the resting pulse on the health check days (MEDB 1.2).
- **Self-tests.** Each test says which NASA requirement it follows and how it differs. In the full list of requirements, **At-home version** opens the matching test.
- **NASA reference panel.** It opens from the body screen and from the details of a signal. It starts with five factors of the chosen destination: gravity, radiation, light and UV, the closed cabin, and the distance from Earth. For each, it says what the factor does to the body there and what NASA does about it, then lists the signals that follow it. Below come all 47 requirements.

## By destination

The factors follow NASA's hazards of human spaceflight: radiation, isolation and confinement, distance from Earth, gravity fields, and a hostile, closed environment. Light is added, since a sealed cabin gets no sunlight.

| Factor       | What changes between destinations                                                                                                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gravity      | None in orbit and in cruise, 0.17 g on the Moon, 0.38 g on Mars. In partial gravity, NASA's limits still come from weightless flights.                                                                                                     |
| Radiation    | The measured dose rate, and how soon NASA's 600 mSv career limit is reached: about 822 days in orbit, 438 on the Moon, 333 in cruise, 896 on Mars.                                                                                         |
| Light and UV | No sunlight in any cabin, so vitamin D matters everywhere. Outside, no ozone layer filters the Sun's UV, and Mars has almost none. The day length also changes: 16 sunrises a day in orbit, none in deep space, a 24 h 39 min day on Mars. |
| Closed cabin | The same everywhere: recycled air and water, CO2 in still air, vapours and microbes.                                                                                                                                                       |
| Distance     | Live calls from orbit, about 1.3 seconds each way from the Moon, minutes from Mars, so calls become recorded messages.                                                                                                                     |

## Limits

- The schedule is the ISS one, written for flights of about six months. Pulsar uses selected flight days from this reference across its scenarios. The dashboard duration varies from 3 to 500 Earth days by destination. One-year flights add eye exams and health checks on days 180 and 270.
- NASA has no medical requirements yet for long stays on the Moon or Mars. Pulsar applies the ISS ones there.
- This is an educational prototype, not a medical device.
