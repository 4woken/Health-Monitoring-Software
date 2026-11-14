// NASA's medical requirements for astronauts, as the reference behind the app's checks.
//
// Most entries come from the Medical Requirements Integration Documents (MRIDs, JSC 28913) of the
// International Space Station: what is examined before, during and after a long-duration flight,
// and when. The last group is the yearly exam of former astronauts, the Medical Examination
// Requirements (MER) behind the Lifetime Surveillance of Astronaut Health (LSAH). Its data is not
// public; only the list of exams is. Each requirement is tied to the signals of this app that answer
// the same question.

import type { SignalId } from './signals'

/** When the requirement applies: during the flight, around it (before and after), or for life. */
export type Phase = 'flight' | 'ground' | 'career'

export type Part =
  | 'eyes'
  | 'brain'
  | 'ears'
  | 'mouth'
  | 'heart'
  | 'lungs'
  | 'veins'
  | 'blood'
  | 'kidneys'
  | 'stomach'
  | 'bones'
  | 'muscles'
  | 'skin'
  | 'mind'
  | 'body'
  | 'cabin'

export interface Requirement {
  /** NASA's number for it: an MEDB section of the medical evaluations document, or an MR or MER number. */
  code: string
  name: string
  /** What it looks at, in plain words. */
  what: string
  /** When it is done, in plain words. */
  when: string
  phase: Phase
  part: Part
  /** Signals of this app on the same question. */
  signals: SignalId[]
  /** For a task the crew does on a set day: its name in the check-up. */
  task?: string
  /** Flight days on which the task is due. */
  days?: number[]
  /** Then every so many days, from `from` (default: `every`). */
  every?: number
  from?: number
}

export const NASA_SOURCES = {
  mrid: {
    title: 'NASA Johnson Space Center, Medical Requirements Integration Documents (MRIDs), JSC 28913',
    detail:
      'ISS long-duration medical requirements, 2012 to 2021 revisions. They give each exam, what it measures and its schedule.',
  },
  mer: {
    title: 'NASA, Medical Examination Requirements (MER) for former astronauts',
    url: 'https://www.nasa.gov/general/medical-examination-requirements-mer-for-former-astronauts/',
  },
  lsah: {
    title: 'NASA, Lifetime Surveillance of Astronaut Health (LSAH)',
    url: 'https://nlsp.nasa.gov/resources/lsah',
  },
}

export const NASA_REQUIREMENTS: Requirement[] = [
  // In flight: the body.
  {
    code: 'MEDB 1.10',
    name: 'Eye examinations',
    what: 'Sharpness of sight, an Amsler grid, the back of the eye, eye pressure, OCT imaging and an eye ultrasound, to catch swelling of the optic nerve.',
    when: 'Flight days 30 and 90, and 30 days before landing (also days 180 and 270 on one-year flights)',
    phase: 'flight',
    part: 'eyes',
    signals: ['opticNerve'],
    task: 'Eye examination',
    days: [30, 90],
  },
  {
    code: 'MEDB 1.12',
    name: 'Vein ultrasound',
    what: 'Both internal jugular veins of the neck, the veins under the collarbone and the deep veins of the legs, to catch slow flow or a clot.',
    when: 'Flight days 30 and 60, and 6 weeks before landing',
    phase: 'flight',
    part: 'veins',
    signals: ['neckVein'],
    task: 'Neck and leg vein ultrasound',
    days: [30, 60],
  },
  {
    code: 'MEDB 1.2',
    name: 'Health check by the crew medical officer',
    what: 'Vital signs and a physical exam by the crew member trained as medical officer. One-year crews also give blood and urine on day 180.',
    when: 'Flight days 14 to 21 and day 90, then 2 to 3 weeks before landing',
    phase: 'flight',
    part: 'heart',
    signals: ['bodyChecks', 'redCells', 'hydration'],
    task: 'Health check with the crew medical officer',
    days: [14, 90],
  },
  {
    code: 'MEDB 1.3',
    name: 'Private medical conference',
    what: 'A private call with the flight surgeon about health, sleep, workload and the habitat.',
    when: 'Every week; every day for the first and last five days, and around each spacewalk',
    phase: 'flight',
    part: 'body',
    signals: ['bodyChecks', 'headache', 'sleep'],
    task: 'Private call with the flight surgeon',
    days: [1, 2, 3, 4, 5],
    every: 7,
  },
  {
    code: 'MEDB 1.13',
    name: 'Body mass',
    what: 'Mass measured on a spring device, since scales do not work without weight.',
    when: 'In the first week, then every month',
    phase: 'flight',
    part: 'body',
    signals: ['bodyMass'],
    task: 'Body mass measurement',
    days: [7],
    every: 30,
  },
  {
    code: 'MEDB N3.06',
    name: 'Nutrition',
    what: 'A food questionnaire on what was eaten, with body mass. Nutrient stores are measured in the blood before and after flight.',
    when: 'The questionnaire every week; the blood tests before and after flight',
    phase: 'flight',
    part: 'stomach',
    signals: ['bodyMass', 'vitaminD'],
    task: 'Food questionnaire (10 minutes)',
    every: 7,
  },
  {
    code: 'MEDB 5.2',
    name: 'Daily exercise',
    what: 'Aerobic and resistance exercise, with the prescription and what was done logged and sent to the ground every week.',
    when: '2.5 hours every day, set-up included',
    phase: 'flight',
    part: 'muscles',
    signals: ['loading'],
  },
  {
    code: 'MEDB N3.07',
    name: 'Cycle ergometer fitness test',
    what: 'Heart rate and effort on the station bike, with the same protocol as before flight.',
    when: 'Flight days 14 and 75, and 14 days before landing',
    phase: 'flight',
    part: 'heart',
    signals: ['oxygen', 'loading'],
    task: 'Cycle ergometer fitness test',
    days: [14, 75],
  },
  {
    code: 'MR019L',
    name: 'Heart rate during exercise',
    what: 'Heart rate on the treadmill and the bike, to keep each session at the prescribed effort.',
    when: 'During exercise sessions',
    phase: 'flight',
    part: 'heart',
    signals: ['oxygen'],
  },
  {
    code: 'MEDB 5.4',
    name: 'Calf volume',
    what: 'The volume of the calf with a fitted stocking, to follow muscle loss. From the Russian medical plan.',
    when: 'Flight day 14, then every 2 weeks, after waking and before breakfast',
    phase: 'flight',
    part: 'muscles',
    signals: ['loading'],
    task: 'Calf volume, before breakfast',
    every: 14,
  },
  {
    code: 'MR081L',
    name: 'Hand grip strength',
    what: 'Grip and pinch strength and endurance, for crew members who do spacewalks.',
    when: 'Flight day 14, then every 30 days',
    phase: 'flight',
    part: 'muscles',
    signals: ['loading'],
  },
  {
    code: 'MEDB 1.8',
    name: 'Hearing test',
    what: 'A tone test of each ear on a station laptop, with hearing protection where noise is high.',
    when: 'By flight day 21, then around mid-mission',
    phase: 'flight',
    part: 'ears',
    signals: [],
    task: 'Hearing test',
    days: [21],
  },
  {
    code: 'MR084L',
    name: 'Noise exposure',
    what: 'Noise dosimeters worn by the crew and placed in the modules.',
    when: 'Before flight day 21, then every 60 days',
    phase: 'flight',
    part: 'ears',
    signals: [],
  },
  {
    code: 'MEDB 1.14',
    name: 'Skin photos',
    what: 'Photos of cuts, rashes and allergic reactions, so the flight surgeon can follow healing.',
    when: 'When there is a skin injury or reaction',
    phase: 'flight',
    part: 'skin',
    signals: [],
  },
  // In flight: the mind.
  {
    code: 'MEDB 7.2',
    name: 'Private psychological conference',
    what: 'A private call with a behavioural health specialist about mood, sleep, the crew and the ground.',
    when: 'Every 2 weeks, and at any time on request',
    phase: 'flight',
    part: 'mind',
    signals: ['mood', 'sleep'],
    task: 'Private call with behavioural health',
    every: 14,
  },
  {
    code: 'MR032L',
    name: 'Private family conference',
    what: 'A private video call with family and friends, which no one monitors.',
    when: 'Every week',
    phase: 'flight',
    part: 'mind',
    signals: ['mood'],
  },
  {
    code: 'MEDB 7.4',
    name: 'Cognitive test',
    what: 'A short computer test (WinSCAT) of attention, memory and speed, also after a head injury, high CO2 or a decompression.',
    when: 'Every month, and when needed',
    phase: 'flight',
    part: 'brain',
    signals: ['sleep', 'headache'],
    task: 'Cognitive test (WinSCAT, 30 minutes)',
    every: 30,
  },
  // In flight: spacewalks.
  {
    code: 'MEDB 6.1',
    name: 'Spacewalk medical checks',
    what: 'A health check before and after each spacewalk. During it, heart rate, ECG, effort, suit pressure, suit CO2 and radiation.',
    when: 'Within 48 hours before the suit goes on and 24 hours after it comes off',
    phase: 'flight',
    part: 'heart',
    signals: ['oxygen'],
  },
  {
    code: 'MR087L',
    name: 'Prebreathe exercise',
    what: 'Exercise while breathing pure oxygen before a spacewalk, to wash nitrogen out of the blood and prevent decompression sickness.',
    when: 'Before each spacewalk',
    phase: 'flight',
    part: 'blood',
    signals: ['oxygen'],
  },
  // In flight: the cabin.
  {
    code: 'MEDB 3.1',
    name: 'Personal dosimeter',
    what: 'A passive dosimeter each crew member keeps for the whole flight, read on the ground.',
    when: 'Worn through the whole flight; exchanged at mid-mission on flights past 180 days',
    phase: 'flight',
    part: 'body',
    signals: ['radiation'],
  },
  {
    code: 'MR004L, MR005L, MR092L, MR094L',
    name: 'Cabin radiation monitors',
    what: 'Dosimeters and active detectors in the modules, whose data the ground reads daily to weekly to warn of solar storms.',
    when: 'All the time',
    phase: 'flight',
    part: 'cabin',
    signals: ['radiation'],
  },
  {
    code: 'MR091L',
    name: 'Air quality monitor',
    what: 'Volatile organic compounds in the cabin air.',
    when: 'Automatic, every 73 hours',
    phase: 'flight',
    part: 'cabin',
    signals: ['cabinAir'],
  },
  {
    code: 'MR039L',
    name: 'Portable CO2 monitor',
    what: 'CO2 where it can build up and fixed sensors do not reach, such as sleeping quarters.',
    when: 'When CO2 may be high, for example after headaches',
    phase: 'flight',
    part: 'cabin',
    signals: ['headache', 'cabinAir'],
  },
  {
    code: 'MR036L, MR037L',
    name: 'Air samples',
    what: 'Formaldehyde badges and grab samples of the air, analysed on the ground.',
    when: 'Every 45 days in each main module',
    phase: 'flight',
    part: 'cabin',
    signals: ['cabinAir'],
    task: 'Air samples: formaldehyde badges and grab samples',
    every: 45,
  },
  {
    code: 'MR008L',
    name: 'Combustion products',
    what: 'Carbon monoxide and other gases after something overheats or burns.',
    when: 'After a suspected fire, until the air is clean',
    phase: 'flight',
    part: 'cabin',
    signals: ['cabinAir'],
  },
  {
    code: 'MR054L',
    name: 'Drinking water',
    what: 'Organic carbon and other chemicals in the drinking water.',
    when: 'Water samples every 90 days',
    phase: 'flight',
    part: 'cabin',
    signals: ['hydration'],
    task: 'Drinking water samples',
    every: 90,
  },
  {
    code: 'MR050L, MR051L, MR052L',
    name: 'Microbes in the air, the water and on surfaces',
    what: 'Bacteria and fungi grown from air, water and surface samples, read a few days later.',
    when: 'On a set schedule; air samples every 3 months',
    phase: 'flight',
    part: 'cabin',
    signals: ['immunity'],
  },
  // Before and after flight.
  {
    code: 'MEDB 1.1',
    name: 'Physical exam',
    what: 'Vital signs and a head-to-toe exam, nerves included.',
    when: 'Before flight and after landing',
    phase: 'ground',
    part: 'body',
    signals: ['bodyChecks'],
  },
  {
    code: 'MEDB 2.1',
    name: 'Blood and urine tests',
    what: 'Blood counts, blood chemistry and a urine test.',
    when: 'Before flight and after landing',
    phase: 'ground',
    part: 'blood',
    signals: ['redCells', 'immunity', 'vitaminD', 'hydration'],
  },
  {
    code: 'MEDB 1.6',
    name: 'Resting ECG',
    what: 'A 12-lead electrocardiogram, lying down for 15 minutes.',
    when: 'Before flight, and 0 to 3 days after landing',
    phase: 'ground',
    part: 'heart',
    signals: ['oxygen'],
  },
  {
    code: 'MEDB 1.7',
    name: '24-hour ECG',
    what: 'A day of heart rhythm on a portable recorder, to look for an irregular rhythm.',
    when: 'Before flight',
    phase: 'ground',
    part: 'heart',
    signals: ['oxygen'],
  },
  {
    code: 'MR029L',
    name: 'Lung function',
    what: 'Spirometry: how much and how fast the lungs move air.',
    when: 'Every year, and 3 days after landing',
    phase: 'ground',
    part: 'lungs',
    signals: ['oxygen'],
  },
  {
    code: 'MEDB 1.11',
    name: 'Bone density scan',
    what: 'A DXA scan of the hip and spine, to follow bone loss and recovery.',
    when: 'Before and after flight',
    phase: 'ground',
    part: 'bones',
    signals: ['loading'],
  },
  {
    code: 'MEDB 5.1, 5.3',
    name: 'Strength and fitness tests',
    what: 'Strength, endurance, flexibility, agility and balance, and the strength of leg and trunk muscles on a machine.',
    when: 'Before and after flight',
    phase: 'ground',
    part: 'muscles',
    signals: ['loading'],
  },
  {
    code: 'MEDB 1.15',
    name: 'Brain MRI',
    what: 'The brain and its blood vessels.',
    when: 'Before and after flight',
    phase: 'ground',
    part: 'brain',
    signals: ['opticNerve', 'headache'],
  },
  {
    code: 'MEDB 1.5',
    name: 'Balance test',
    what: 'Standing on a moving platform, to see how the balance system readapts to gravity.',
    when: 'Before flight and after landing',
    phase: 'ground',
    part: 'ears',
    signals: [],
  },
  {
    code: 'MEDB 1.9',
    name: 'Dental exam',
    what: 'A dental exam, with a full x-ray within two years of launch.',
    when: 'Before flight',
    phase: 'ground',
    part: 'mouth',
    signals: [],
  },
  {
    code: 'MEDB 2.2, 2.3, 2.4',
    name: 'Infection screening',
    what: 'Tuberculosis, the stomach bacterium H. pylori and resistant staphylococcus in the nose.',
    when: 'Before flight',
    phase: 'ground',
    part: 'blood',
    signals: ['immunity'],
  },
  {
    code: 'MEDB 3.2',
    name: 'Biological dose',
    what: 'Chromosome damage in blood cells, which tells the dose the body received.',
    when: 'Before and after flight',
    phase: 'ground',
    part: 'blood',
    signals: ['radiation'],
  },
  {
    code: 'MEDB 7.1',
    name: 'Psychological readiness',
    what: 'A behavioural medicine assessment of readiness for the flight.',
    when: '30 to 90 days before launch',
    phase: 'ground',
    part: 'mind',
    signals: ['mood'],
  },
  {
    code: 'MR026L',
    name: 'Reconditioning after landing',
    what: 'A supervised programme to rebuild strength, balance and fitness.',
    when: '2 hours each duty day for the first 45 days after landing',
    phase: 'ground',
    part: 'muscles',
    signals: ['loading'],
  },
  // For life.
  {
    code: 'MER1001, MER1002',
    name: 'Yearly blood tests',
    what: 'Blood counts, liver, kidney and thyroid function, blood sugar, cholesterol, inflammation and minerals.',
    when: 'Every year after the career',
    phase: 'career',
    part: 'blood',
    signals: ['redCells', 'immunity', 'bodyChecks', 'vitaminD'],
  },
  {
    code: 'MER2001',
    name: 'Bone density scan',
    what: 'A DXA scan with bone markers in the blood.',
    when: 'Every 3 years after the career',
    phase: 'career',
    part: 'bones',
    signals: ['loading'],
  },
  {
    code: 'MER3001',
    name: 'Skin cancer check',
    what: 'The whole skin, with photos.',
    when: 'Every year after the career',
    phase: 'career',
    part: 'skin',
    signals: ['radiation'],
  },
  {
    code: 'MER4001 to MER4004',
    name: 'Eye exam',
    what: 'Sight, refraction, eye pressure and imaging of the retina (OCT).',
    when: 'Every year after the career',
    phase: 'career',
    part: 'eyes',
    signals: ['opticNerve'],
  },
  {
    code: 'MER5001',
    name: 'Hearing test',
    what: 'A questionnaire and a tone test of each ear.',
    when: 'Every year after the career',
    phase: 'career',
    part: 'ears',
    signals: [],
  },
  {
    code: 'MER6001 to MER6003',
    name: 'Heart and arteries',
    what: 'Blood pressure, a resting ECG, the thickness of the carotid wall and a 10-year heart risk score.',
    when: 'Every year after the career',
    phase: 'career',
    part: 'heart',
    signals: ['bodyChecks', 'oxygen', 'neckVein'],
  },
]

const PHASE_ORDER: Record<Phase, number> = { flight: 0, ground: 1, career: 2 }

/**
 * NASA's requirements on the same question as a signal: in flight first, then around flight, then
 * for life. Within each, the ones made mainly for this signal come first.
 */
export const requirementsFor = (signal: SignalId) =>
  NASA_REQUIREMENTS.filter((r) => r.signals.includes(signal)).sort(
    (a, b) =>
      PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase] || a.signals.indexOf(signal) - b.signals.indexOf(signal),
  )

/** True when a crew task of this requirement falls on this flight day. */
export function isDue(r: Requirement, day: number): boolean {
  if (!r.task) return false
  if (r.days?.includes(day)) return true
  if (!r.every) return false
  const from = r.from ?? r.every
  return day >= from && (day - from) % r.every === 0
}

/** The NASA tasks the crew has on this flight day. */
export const dueOn = (day: number) => NASA_REQUIREMENTS.filter((r) => isDue(r, day))

/** The next flight day, from this one on, when a requirement's task is due; null when it has none. */
export function nextDue(r: Requirement, day: number, horizon = 400): number | null {
  if (!r.task) return null
  for (let d = Math.max(1, day); d <= day + horizon; d++) if (isDue(r, d)) return d
  return null
}
