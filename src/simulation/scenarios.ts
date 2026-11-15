// One day of each mission, minute by minute: what the crew member does, where, and what happens.
// The days follow NASA's published routine on the station (wake at 06:00 GMT, planning conferences
// with the ground morning and evening, about two and a half hours of exercise, lights out at 21:30)
// and real hazards of each destination: a failed CO2 scrubber on the station, a moonwalk cut short,
// a solar particle storm in deep space, a dust storm on Mars. The events are invented; the figures
// they move (CO2 limit, dose rates, spacewalk effort) are the app's sourced ones. See
// docs/SIMULATION.md.

import type { Level } from '../health/signals'
import type { MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'

export type Activity =
  | 'sleep'
  | 'rest'
  | 'meal'
  | 'hygiene'
  | 'work'
  | 'meeting'
  | 'check'
  | 'maintenance'
  | 'resistance'
  | 'cycle'
  | 'run'
  | 'eva'
  | 'suit'
  | 'shelter'

export interface Block {
  /** Minutes since midnight. */
  from: number
  to: number
  activity: Activity
  title: string
  place: string
  /** Effort in METs, when it differs from the usual for the activity. */
  met?: number
}

export interface ScriptedEvent {
  at: number
  level: Level
  title: string
  detail: string
}

export interface ScenarioTask {
  id: string
  /** When it is due. */
  at: number
  title: string
  detail: string
  /** When it is done; by default fifteen minutes after it is due. */
  doneAt?: number
  /** Shown from this minute; from the start of the day by default. */
  shownFrom?: number
  /** Moved to another time by an event. */
  move?: { at: number; to: number; reason: string }
  test?: SelfTestId
}

export interface Scenario {
  id: string
  mission: MissionId
  title: string
  summary: string
  place: string
  /** How the clock is read there. */
  clock: string
  start: number
  end: number
  blocks: Block[]
  /** Minutes of the meals. */
  meals: number[]
  drinks: { at: number; ml: number }[]
  /** Water planned for the day, ml. */
  waterGoalMl: number
  events: ScriptedEvent[]
  tasks: ScenarioTask[]
  /** Free times, in order, for the person's own check-up tasks. */
  slots: number[]
  /** Cabin CO2, mmHg, as the points of a line. */
  co2: [number, number][]
  /** CO2 added in the suit on a spacewalk, mmHg. */
  suitCo2?: [number, number][]
  /** Dose rate outside the shelter, as a multiple of the usual rate there. */
  radiation?: [number, number][]
  /** Heart rate added by stress, bpm. */
  stress?: [number, number][]
}

/** "09:20" as minutes since midnight. */
export const at = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** Back-to-back blocks from a list of start times; the last one ends the day. */
function day(end: string, list: [string, Activity, string, string, number?][]): Block[] {
  return list.map(([from, activity, title, place, met], i) => ({
    from: at(from),
    to: i + 1 < list.length ? at(list[i + 1][0]) : at(end),
    activity,
    title,
    place,
    ...(met === undefined ? {} : { met }),
  }))
}

/** Passes through the South Atlantic Anomaly: the dose rate rises about fourfold for a dozen minutes. */
function anomaly(...starts: string[]): [number, number][] {
  return starts.flatMap((s) => {
    const t = at(s)
    return [
      [t - 1, 1],
      [t + 3, 4],
      [t + 9, 4],
      [t + 13, 1],
    ] as [number, number][]
  })
}

const ORBIT: Scenario = {
  id: 'orbit-scrubber',
  mission: 'orbit',
  title: 'A day on the station',
  summary: 'Science, two exercise sessions, and a CO2 scrubber that stops in the morning.',
  place: 'International Space Station',
  clock: 'Station time (GMT)',
  start: at('06:00'),
  end: at('22:30'),
  blocks: day('22:30', [
    ['06:00', 'hygiene', 'Wake up and wash', 'Crew quarters, Node 2'],
    ['06:30', 'meal', 'Breakfast', 'Galley, Node 1'],
    ['07:05', 'check', 'Morning health checks', 'Node 2'],
    ['07:30', 'meeting', 'Planning conference with Houston', 'Destiny lab'],
    ['07:50', 'work', 'Science: neck vein ultrasound', 'Columbus'],
    ['09:20', 'work', 'Science: plant growth chamber', 'Kibo'],
    ['10:40', 'maintenance', 'Swap the CO2 scrubber bed', 'Node 3', 2.6],
    ['11:30', 'work', 'Inventory and stowage', 'Permanent module'],
    ['12:30', 'meal', 'Lunch', 'Galley, Node 1'],
    ['13:30', 'resistance', 'Resistance exercise (ARED)', 'Node 3'],
    ['14:30', 'run', 'Treadmill run (T2), intervals', 'Node 3', 8.2],
    ['15:15', 'hygiene', 'Wipe down and change', 'Node 3'],
    ['15:35', 'work', 'Robotic arm training', 'Cupola'],
    ['17:00', 'work', 'Science: cognition study', 'Destiny lab'],
    ['18:30', 'meal', 'Dinner', 'Galley, Node 1'],
    ['19:05', 'meeting', 'Evening planning conference', 'Destiny lab'],
    ['19:20', 'rest', 'Personal time: Earth photography, call home', 'Cupola'],
    ['21:30', 'sleep', 'Sleep', 'Crew quarters, Node 2'],
  ]),
  meals: [at('06:35'), at('12:35'), at('18:35')],
  drinks: [
    { at: at('06:40'), ml: 300 },
    { at: at('09:00'), ml: 200 },
    { at: at('12:40'), ml: 400 },
    { at: at('15:20'), ml: 300 },
    { at: at('18:40'), ml: 400 },
    { at: at('20:30'), ml: 200 },
  ],
  waterGoalMl: 2500,
  events: [
    {
      at: at('08:09'),
      level: 'ok',
      title: 'Through the South Atlantic Anomaly',
      detail:
        'A dip in the Earth’s magnetic field over the South Atlantic: the dose rate rises for about ten minutes, several times a day.',
    },
    {
      at: at('09:24'),
      level: 'watch',
      title: 'CO2 scrubber stopped',
      detail:
        'The Carbon Dioxide Removal Assembly in Node 3 shut down on a valve fault. CO2 builds up from the crew’s breath until a scrubber runs again.',
    },
    {
      at: at('10:45'),
      level: 'ok',
      title: 'Backup scrubber running',
      detail:
        'The Russian scrubber is on, and the crew is swapping the faulty bed. CO2 will fall over the next hour.',
    },
  ],
  tasks: [
    {
      id: 'iss:ultrasound',
      at: at('07:50'),
      doneAt: at('08:40'),
      title: 'Neck vein ultrasound, guided by Houston',
      detail: 'Fluid moves toward the head without gravity; the scan checks the jugular veins.',
    },
    {
      id: 'iss:scrubber',
      at: at('10:40'),
      doneAt: at('11:25'),
      shownFrom: at('09:30'),
      title: 'Swap the CO2 scrubber bed',
      detail: 'Added after the scrubber fault: about 45 minutes of work in Node 3.',
    },
    {
      id: 'iss:ared',
      at: at('13:30'),
      doneAt: at('14:30'),
      title: 'Resistance exercise: squats, deadlifts, heel raises',
      detail: 'The advanced resistive exercise device loads the bones that weightlessness unloads.',
    },
    {
      id: 'iss:t2',
      at: at('14:30'),
      doneAt: at('15:15'),
      title: 'Treadmill, 45 minutes with intervals',
      detail: 'Held down by a harness, at a pace planned by the station’s exercise specialists.',
    },
    {
      id: 'iss:photo',
      at: at('19:40'),
      doneAt: at('20:15'),
      title: 'Earth photography: glaciers of Patagonia',
      detail: 'A crew observation target requested by scientists on the ground.',
    },
    {
      id: 'iss:sleep',
      at: at('21:30'),
      doneAt: at('21:30'),
      title: 'Lights out',
      detail: 'About eight and a half hours of sleep are planned on the station.',
    },
  ],
  slots: [
    at('08:45'),
    at('09:30'),
    at('11:40'),
    at('16:00'),
    at('16:30'),
    at('17:15'),
    at('17:45'),
    at('18:10'),
  ],
  co2: [
    [at('06:00'), 2.3],
    [at('09:25'), 2.4],
    [at('10:35'), 5.0],
    [at('10:50'), 5.2],
    [at('11:40'), 3.4],
    [at('12:15'), 2.6],
    [at('13:00'), 2.4],
  ],
  radiation: anomaly('08:09', '09:42', '11:15', '12:48'),
}

const MOON: Scenario = {
  id: 'moon-moonwalk',
  mission: 'moon',
  title: 'A moonwalk at the south pole',
  summary: 'Six hours outside, a climb to a crater ridge, and a suit CO2 warning that ends the walk early.',
  place: 'Lunar south pole, Artemis base camp',
  clock: 'Mission time (GMT)',
  start: at('06:00'),
  end: at('22:30'),
  blocks: day('22:30', [
    ['06:00', 'hygiene', 'Wake up and wash', 'Lander cabin'],
    ['06:30', 'meal', 'Breakfast', 'Lander cabin'],
    ['07:00', 'check', 'Fit-for-moonwalk health checks', 'Lander cabin'],
    ['07:25', 'meeting', 'Moonwalk plan review with Houston', 'Lander cabin'],
    ['07:45', 'suit', 'Suit up and leak checks', 'Airlock'],
    ['08:45', 'eva', 'Moonwalk: walk to the crater rim', 'Shackleton rim, 1.2 km out', 4.3],
    ['09:45', 'eva', 'Moonwalk: drill a core sample', 'Shackleton rim', 4.8],
    ['10:40', 'eva', 'Moonwalk: climb to the ridge', 'Connecting ridge', 7.2],
    ['11:20', 'eva', 'Moonwalk: samples in the shadowed crater', 'Permanently shadowed crater', 3.8],
    ['12:50', 'eva', 'Moonwalk: back to the lander, early', 'Traverse back', 4.8],
    ['13:40', 'suit', 'Airlock, suit off, dust clean-up', 'Airlock', 2.4],
    ['14:15', 'meal', 'Late lunch', 'Lander cabin'],
    ['14:50', 'work', 'Log the samples and photographs', 'Lander cabin'],
    ['16:30', 'resistance', 'Resistance exercise, short session', 'Lander cabin', 4.5],
    ['17:10', 'work', 'Suit maintenance and glove inspection', 'Airlock', 1.8],
    ['18:30', 'meal', 'Dinner', 'Lander cabin'],
    ['19:00', 'meeting', 'Evening conference', 'Lander cabin'],
    ['19:15', 'rest', 'Personal time', 'Lander cabin'],
    ['21:30', 'sleep', 'Sleep', 'Lander cabin'],
  ]),
  meals: [at('06:35'), at('10:45'), at('14:20'), at('18:35')],
  drinks: [
    { at: at('06:40'), ml: 300 },
    { at: at('07:40'), ml: 300 },
    { at: at('14:00'), ml: 500 },
    { at: at('14:30'), ml: 300 },
    { at: at('18:40'), ml: 300 },
    { at: at('20:00'), ml: 200 },
  ],
  waterGoalMl: 3000,
  events: [
    {
      at: at('08:45'),
      level: 'ok',
      title: 'Moonwalk started',
      detail:
        'Hatch open. The suit’s drink bag holds about a litre for the walk, with a sip every half hour.',
    },
    {
      at: at('12:48'),
      level: 'ok',
      title: 'Walk cut short',
      detail:
        'Houston agrees to end the moonwalk 50 minutes early. The CO2 cartridge will be checked in the airlock.',
    },
    {
      at: at('13:40'),
      level: 'ok',
      title: 'Back in the airlock',
      detail:
        '4 hours 55 minutes outside. Lunar dust clings to everything and is vacuumed before entering the cabin.',
    },
  ],
  tasks: [
    {
      id: 'moon:suit',
      at: at('07:45'),
      doneAt: at('08:40'),
      title: 'Suit up and leak checks',
      detail: 'The suit is checked for leaks at pressure before the hatch opens.',
    },
    {
      id: 'moon:core',
      at: at('09:45'),
      doneAt: at('10:40'),
      title: 'Drill a core sample at the crater rim',
      detail: 'A core of the regolith, to look for ice brought by comets.',
    },
    {
      id: 'moon:crater',
      at: at('11:20'),
      doneAt: at('12:45'),
      title: 'Collect samples in the shadowed crater',
      detail: 'Never lit by the Sun, far below −150 °C: the suit heaters work hard.',
    },
    {
      id: 'moon:dust',
      at: at('13:40'),
      doneAt: at('14:10'),
      title: 'Vacuum the lunar dust off the suits',
      detail: 'The dust is sharp and irritates the eyes and the lungs.',
    },
    {
      id: 'moon:gloves',
      at: at('17:10'),
      doneAt: at('17:40'),
      title: 'Inspect gloves and fingertips',
      detail: 'Long walks bruise fingertips and can lift nails; the gloves are checked for wear.',
    },
    {
      id: 'moon:sleep',
      at: at('21:30'),
      doneAt: at('21:30'),
      title: 'Lights out',
      detail: 'A full night before the next walk.',
    },
  ],
  slots: [
    at('07:05'),
    at('07:15'),
    at('14:55'),
    at('15:25'),
    at('15:55'),
    at('16:15'),
    at('17:45'),
    at('18:10'),
  ],
  co2: [[at('06:00'), 2.2]],
  suitCo2: [
    [at('12:05'), 0],
    [at('12:40'), 2.7],
    [at('13:40'), 2.9],
    [at('13:41'), 0],
  ],
  stress: [
    [at('12:40'), 0],
    [at('12:45'), 7],
    [at('13:40'), 4],
    [at('14:00'), 0],
  ],
}

const CRUISE: Scenario = {
  id: 'cruise-storm',
  mission: 'cruise',
  title: 'Solar storm on the way to Mars',
  summary: 'A solar flare sends the crew to the storm shelter for six hours; exercise moves to the evening.',
  place: 'Transit spacecraft, deep space',
  clock: 'Mission time (GMT)',
  start: at('06:00'),
  end: at('22:30'),
  blocks: day('22:30', [
    ['06:00', 'hygiene', 'Wake up and wash', 'Crew quarters'],
    ['06:30', 'meal', 'Breakfast', 'Galley'],
    ['07:00', 'check', 'Morning health checks', 'Medical bay'],
    ['07:25', 'meeting', 'Messages from Earth, minutes old', 'Flight deck'],
    ['07:45', 'work', 'Navigation fix and system checks', 'Flight deck'],
    ['09:40', 'work', 'Secure the cabin, move to the shelter', 'Habitat', 2.2],
    ['10:10', 'shelter', 'Sheltering behind the water tanks', 'Storm shelter'],
    ['16:20', 'work', 'All clear: back to the cabin', 'Habitat', 1.8],
    ['16:40', 'cycle', 'Cycling, moved from 13:00', 'Exercise bay'],
    ['17:25', 'resistance', 'Resistance exercise', 'Exercise bay'],
    ['18:10', 'hygiene', 'Wipe down and change', 'Hygiene bay'],
    ['18:30', 'meal', 'Dinner', 'Galley'],
    ['19:05', 'rest', 'Personal time, recorded call home', 'Crew quarters'],
    ['21:30', 'sleep', 'Sleep', 'Crew quarters'],
  ]),
  meals: [at('06:35'), at('12:30'), at('18:35')],
  drinks: [
    { at: at('06:40'), ml: 300 },
    { at: at('09:00'), ml: 250 },
    { at: at('11:30'), ml: 300 },
    { at: at('13:00'), ml: 300 },
    { at: at('15:00'), ml: 250 },
    { at: at('17:30'), ml: 300 },
    { at: at('18:40'), ml: 400 },
    { at: at('20:30'), ml: 200 },
  ],
  waterGoalMl: 2500,
  events: [
    {
      at: at('09:40'),
      level: 'act',
      title: 'Solar flare: protons on the way',
      detail:
        'A large flare erupted on the side of the Sun facing the ship. Energetic protons are expected within the hour: everyone goes to the storm shelter.',
    },
    {
      at: at('10:10'),
      level: 'ok',
      title: 'Crew in the storm shelter',
      detail: 'Behind the water tanks and the food stores, the most shielded corner of the ship.',
    },
    {
      at: at('16:20'),
      level: 'ok',
      title: 'All clear',
      detail: 'Proton levels are falling. The crew leaves the shelter; the cycling session moves to 16:40.',
    },
  ],
  tasks: [
    {
      id: 'cruise:nav',
      at: at('07:45'),
      doneAt: at('09:30'),
      title: 'Navigation fix and system checks',
      detail: 'Star sightings and the daily review of life support.',
    },
    {
      id: 'cruise:shelter',
      at: at('10:10'),
      doneAt: at('10:10'),
      shownFrom: at('09:40'),
      title: 'Go to the storm shelter',
      detail: 'Added after the flare warning: take water, food and the medical kit.',
    },
    {
      id: 'cruise:vest',
      at: at('10:15'),
      doneAt: at('10:25'),
      shownFrom: at('09:40'),
      title: 'Put on the radiation vest',
      detail: 'A wearable shield for the torso and its blood-forming organs.',
    },
    {
      id: 'cruise:cycle',
      at: at('13:00'),
      doneAt: at('17:25'),
      title: 'Cycling, 45 minutes',
      detail: 'Keeps the heart and lungs fit for the landing on Mars.',
      move: { at: at('09:40'), to: at('16:40'), reason: 'Moved: solar storm' },
    },
    {
      id: 'cruise:mood',
      at: at('15:00'),
      doneAt: at('15:05'),
      shownFrom: at('10:10'),
      title: 'Six hours in a tight space: rate your mood',
      detail: 'Confinement and stress add up; a quick rating helps the crew surgeon on Earth.',
    },
    {
      id: 'cruise:resist',
      at: at('17:25'),
      doneAt: at('18:10'),
      title: 'Resistance exercise',
      detail: 'Squats and deadlifts, for the bones that will carry the body on Mars.',
    },
    {
      id: 'cruise:sleep',
      at: at('21:30'),
      doneAt: at('21:30'),
      title: 'Lights out',
      detail: 'Sleep in the crew quarters, which have their own water-wall shielding.',
    },
  ],
  slots: [
    at('08:10'),
    at('08:40'),
    at('09:10'),
    at('10:40'),
    at('11:10'),
    at('13:30'),
    at('14:00'),
    at('14:30'),
    at('19:30'),
  ],
  co2: [[at('06:00'), 2.4]],
  radiation: [
    [at('06:00'), 1],
    [at('10:00'), 1],
    [at('10:40'), 8],
    [at('11:30'), 30],
    [at('12:30'), 36],
    [at('14:00'), 22],
    [at('16:00'), 5],
    [at('16:20'), 3.5],
    [at('18:00'), 1.8],
    [at('22:30'), 1.2],
  ],
  stress: [
    [at('09:40'), 0],
    [at('09:45'), 9],
    [at('10:40'), 6],
    [at('13:00'), 3],
    [at('16:20'), 0],
  ],
}

const MARS: Scenario = {
  id: 'mars-dust',
  mission: 'mars',
  title: 'A sol at Gale crater',
  summary: 'A drive to a layered outcrop, cut short by a dust storm, then exercise in Mars gravity.',
  place: 'Gale crater, surface habitat',
  clock: 'Local solar time',
  start: at('06:00'),
  end: at('22:30'),
  blocks: day('22:30', [
    ['06:00', 'hygiene', 'Wake up and wash', 'Habitat'],
    ['06:30', 'meal', 'Breakfast', 'Habitat galley'],
    ['07:00', 'check', 'Morning health checks', 'Habitat medical corner'],
    ['07:20', 'meeting', 'Plan of the sol: Earth’s messages are 12 minutes old', 'Habitat'],
    ['07:40', 'suit', 'Suit up', 'Suit port'],
    ['08:30', 'eva', 'Drive to the layered outcrop', 'Pressurised rover', 2],
    ['09:30', 'eva', 'Sample the layered outcrop', 'Mount Sharp foothills', 4.2],
    ['11:00', 'eva', 'Pack up in a hurry and drive back before the storm', 'Rover traverse', 6.2],
    ['11:40', 'suit', 'Dust off and back inside', 'Suit port', 2.4],
    ['12:20', 'meal', 'Lunch', 'Habitat galley'],
    ['13:00', 'work', 'Analyse the samples', 'Habitat lab'],
    ['15:00', 'run', 'Treadmill in Mars gravity', 'Habitat gym', 7.2],
    ['15:45', 'resistance', 'Resistance exercise', 'Habitat gym'],
    ['16:45', 'hygiene', 'Wipe down and change', 'Habitat'],
    ['17:00', 'maintenance', 'Change the dust filters', 'Air system', 2.2],
    ['18:30', 'meal', 'Dinner', 'Habitat galley'],
    ['19:00', 'rest', 'Personal time', 'Habitat'],
    ['21:30', 'sleep', 'Sleep', 'Habitat'],
  ]),
  meals: [at('06:35'), at('12:25'), at('18:35')],
  drinks: [
    { at: at('06:40'), ml: 300 },
    { at: at('07:35'), ml: 300 },
    { at: at('12:05'), ml: 400 },
    { at: at('12:30'), ml: 300 },
    { at: at('15:50'), ml: 400 },
    { at: at('18:40'), ml: 400 },
    { at: at('20:30'), ml: 200 },
  ],
  waterGoalMl: 2800,
  events: [
    {
      at: at('08:30'),
      level: 'ok',
      title: 'Out on the surface',
      detail: 'Minus 60 °C in the shade this morning. The suit keeps the body warm; the drink bag is full.',
    },
    {
      at: at('10:55'),
      level: 'watch',
      title: 'Dust storm forecast',
      detail:
        'Orbiter images show a regional dust storm moving in. Visibility and solar power will drop this afternoon: the crew drives back now.',
    },
    {
      at: at('12:00'),
      level: 'ok',
      title: 'Back inside',
      detail: 'The suits stay docked outside, so their dust stays out of the habitat.',
    },
  ],
  tasks: [
    {
      id: 'mars:suit',
      at: at('07:40'),
      doneAt: at('08:25'),
      title: 'Suit up',
      detail: 'Through the suit port: the suit stays outside, docked to the habitat wall.',
    },
    {
      id: 'mars:outcrop',
      at: at('09:30'),
      doneAt: at('10:55'),
      title: 'Sample the layered outcrop',
      detail: 'Rock layers laid down in water billions of years ago.',
    },
    {
      id: 'mars:back',
      at: at('11:00'),
      doneAt: at('11:40'),
      shownFrom: at('10:55'),
      title: 'Drive back before the storm',
      detail: 'Added after the dust storm forecast.',
    },
    {
      id: 'mars:run',
      at: at('15:00'),
      doneAt: at('15:45'),
      title: 'Treadmill, 45 minutes in Mars gravity',
      detail: 'A third of the body weight loads the bones; the pace is set for the heart.',
    },
    {
      id: 'mars:resist',
      at: at('15:45'),
      doneAt: at('16:45'),
      title: 'Resistance exercise',
      detail: 'Still needed on Mars: its gravity alone does not keep muscle and bone.',
    },
    {
      id: 'mars:filters',
      at: at('17:00'),
      doneAt: at('17:40'),
      title: 'Change the dust filters',
      detail: 'Fine dust gets into the air system after every walk.',
    },
    {
      id: 'mars:sleep',
      at: at('21:30'),
      doneAt: at('21:30'),
      title: 'Lights out',
      detail: 'A sol is 39 minutes longer than an Earth day, so the clock shifts a little every night.',
    },
  ],
  slots: [
    at('07:05'),
    at('07:12'),
    at('13:10'),
    at('13:40'),
    at('14:10'),
    at('14:40'),
    at('17:45'),
    at('18:10'),
  ],
  co2: [[at('06:00'), 2.5]],
  stress: [
    [at('10:55'), 0],
    [at('11:00'), 12],
    [at('11:40'), 4],
    [at('12:10'), 0],
  ],
}

export const SCENARIOS: Record<MissionId, Scenario> = {
  orbit: ORBIT,
  moon: MOON,
  cruise: CRUISE,
  mars: MARS,
}
