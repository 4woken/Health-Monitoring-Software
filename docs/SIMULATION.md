# Mission simulation

**Simulation** in the top bar plays one day of a destination, minute by minute, for the person shown: what they do, how their body responds, what Pulsar notices in the values and how their list for the day changes. It shows the monitoring at work. The days and the body model are invented for the demonstration; the figures that matter for an alert (the CO2 limit, the dose rates, the spacewalk effort) are the app's sourced ones.

## The four days

| Destination    | Day                            | What happens                                                                                                                                                                                                                                               |
| -------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbit          | A day on the station           | The CO2 scrubber stops at 09:24. Cabin CO2 passes the 3 mmHg limit, then 4 mmHg: a headache check, then a thinking test once the air is clean. The crew is behind on water by noon. On the treadmill in weightlessness, the core passes 38 °C.             |
| Moon           | A moonwalk at the south pole   | The climb to a ridge pushes the heart rate to about 90% of its maximum. Later the suit's CO2 rises and the walk ends 50 minutes early.                                                                                                                     |
| Cruise to Mars | Solar storm on the way to Mars | A flare at 09:40 sends the crew to the storm shelter for six hours. In the shelter the dose rate reaches five times the usual; outside it would be twenty times or more. The cycling session and the tasks that fell during the storm move to the evening. |
| Mars           | A sol at Gale crater           | A drive to a layered outcrop is cut short by a dust storm forecast; the hurried return raises the heart rate. Then exercise in Mars gravity.                                                                                                               |

The days follow the routine of a station day: wake at 06:00, a planning conference with the ground in the morning and the evening, about two and a half hours of exercise (NASA MEDB 5.2), lights out at 21:30 for eight and a half hours of sleep.

## How to use it

- Pick a day. The one of the dashboard's destination comes first, with the person's mission day.
- **Play** and **Pause**, at 2, 5 or 15 simulated minutes per second. A whole day lasts about three minutes at 5 min/s.
- **Next event** jumps to the next thing that happens. The bar of the day can be clicked or dragged to any minute; each block names its activity on hover, and its height is the planned effort.
- **Open the visor** shows the same moment in the AR view: the simulated readings in the helmet (heart rate, blood oxygen, blood pressure, the next drink, temperature, blood sugar, sleep) and the newest warning under the menu. During a spacewalk the button says so.
- A task with a self-test offers **Try the real test**, which leaves the simulation for that test.

## What changes during the day

- **Readings.** Heart rate with its trace and its curve since waking, blood oxygen, blood pressure, breathing, core temperature, blood sugar and the water drunk. Cabin CO2 (the suit's CO2 on a spacewalk) and the radiation dose rate, each with its limit or usual level. A value out of range takes its warning colour and an icon.
- **Events.** What happens in the mission (a scrubber fault, a flare, a dust storm) and what Pulsar reads in the values: a limit crossed, the peak of a session, a recovery, a core temperature, a water deficit.
- **To do today.** The person's own check-up for that day (the routine checks, the exams due, NASA's tasks of the day and the follow-ups of their signals), laid out at sensible times, beside the mission plan. Tasks tick themselves when they get done. When a value goes out of range, a rule adds a task, marked as added by Pulsar: "Drink 500 ml now", "Thinking test, now the air is clean", "Head back to the airlock", "Stay in the shelter until the all-clear". A storm moves the tasks that fell during it.

## The model

Everything is computed once, ahead, in `src/simulation/engine.ts`, so the day can be played back and forth; the scenarios are in `src/simulation/scenarios.ts`.

- **Effort** comes from the activity, in METs (1 is sitting still): about 1.6 for desk work, 4 to 7 on a spacewalk, 8 on the treadmill. Resistance exercise comes in sets, runs warm up and cool down, a spacewalk varies from task to task.
- **Heart rate** moves towards a target between the person's resting rate and a maximum of 181 bpm, faster on the way up than on the way down. Profiles have no age, so the maximum is the one of a 38-year-old, 208 − 0.7 × age. It is a few beats under the resting rate in sleep, and stress adds a few beats.
- **Blood pressure.** The top number rises with the heart rate and the bottom one barely; both rise more during weights and dip at night.
- **Core temperature** follows the effort with a lag of about twenty minutes, and the body clock: warmest in the late afternoon, coolest before dawn. In weightlessness it rises faster during exercise, as measured on the station.
- **Blood sugar** rises after meals, most about forty minutes after, and falls with sustained effort.
- **Water** counts the planned drinks, a sip from the suit's drink bag every half hour outside, and the drinks that the rules ask for.
- **Air and radiation.** Cabin CO2 follows the day's story; on a spacewalk the suit's CO2 rises with the effort. The dose rate is the destination's usual one from the app's sources (0.73 mSv a day in orbit, 1.37 on the Moon, 1.8 on the way to Mars, 0.67 on Mars), with the South Atlantic Anomaly in orbit and the storm on the way to Mars. The shelter lets through a fifth of the storm's extra dose and the rest of the ship 85%: our assumptions.

## The rules

| Rule             | When                                                                                 | Adds                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Cabin CO2        | Above the app's 3 mmHg limit; above 4 mmHg for ten minutes; back under 3 mmHg        | A headache check, then a thinking test twenty minutes after the air is clean, as NASA tests thinking after high CO2 (MEDB 7.4) |
| Heart rate       | Over 80% of the maximum for three minutes, outside exercise                          | "Slow down for three minutes"                                                                                                  |
| Exercise         | The peak of each session; the heart rate ten minutes after the last session of a row | "Rest and drink 250 ml" if it is still more than 25 bpm above rest                                                             |
| Core temperature | 38 °C or more, once per warming                                                      | "Lower the pace and drink 250 ml", or rest                                                                                     |
| Water            | Every half hour from three hours after waking, 450 ml or more behind the day's plan  | "Drink 500 ml now"                                                                                                             |
| Suit CO2         | 4.5 mmHg or more on a spacewalk                                                      | "Head back to the airlock"                                                                                                     |
| Radiation        | Five times the usual dose rate where the person is                                   | "Stay in the shelter until the all-clear"                                                                                      |
| Sleep            | Under six hours a night over the week                                                | A reaction test in the morning checks                                                                                          |

Apart from the app's CO2 limit, these thresholds are our assumptions for the demonstration, not flight rules. The engine and every rule have tests in `src/simulation/engine.test.ts`.

## Sources

- Stahn AC, Werner A, Opatz O, et al. Increased core body temperature in astronauts during long-duration space missions. Scientific Reports 2017;7:16180.
- Tanaka H, Monahan KD, Seals DR. Age-predicted maximal heart rate revisited. Journal of the American College of Cardiology 2001;37:153–156.
- The dose rates, the CO2 limit and the spacewalk effort come from `src/health/sources.ts` and [the research notes](RESEARCH.md); MEDB 5.2 and 7.4 from [the NASA reference](NASA_REFERENCE.md).
