// Health signals: each rule reads one part of the day's readings and says how it looks in space.
// Pure functions, no interface code. Every limit names a source id from sources.ts; "demo" marks
// a value we chose because no published one exists.

/** ok: nothing to do. watch: look again soon. act: do something today. */
export type Level = 'ok' | 'watch' | 'act'
export type VeinFlow = 'forward' | 'stagnant' | 'retrograde'

/** One person's values before launch. */
export interface Baseline {
  /** Hematocrit: share of the blood made of red cells, %. */
  redCellsPct: number
  /** Lab reference range for hematocrit (it differs between bodies). */
  redCellsRange: [number, number]
  /** Optic nerve sheath diameter by ultrasound, mm. */
  opticNerveMm: number
  /** White blood cells and lymphocytes, thousands per microlitre. */
  whiteCellsK: number
  lymphocytesK: number
  /** 25-hydroxyvitamin D, ng/mL. */
  vitaminDNgMl: number
  bodyMassKg: number
}

/** What is known about one person on one mission day. */
export interface Readings {
  redCellsPct: number
  opticNerveMm: number
  visionChange: boolean
  neckVeinFlow: VeinFlow
  neckVeinClot: boolean
  headache: boolean
  /** Average over the last 7 nights, hours. */
  sleepHours: number
  spo2Pct: number
  restingPulseBpm: number
  /** Urine passed in the last 24 hours, litres. */
  urineLitres: number
  /** Resistance exercise sessions in the last 7 days. */
  resistanceSessions: number
  /** Self-rated mood, 1 (very low) to 5 (very good), 7-day average. */
  mood: number
  temperatureC: number
  systolic: number
  diastolic: number
  glucoseMgDl: number
  whiteCellsK: number
  lymphocytesK: number
  vitaminDNgMl: number
  bodyMassKg: number
}

/** The air and radiation around the crew on one day. */
export interface Cabin {
  day: number
  /** Daily average CO2 partial pressure, mmHg. */
  co2MmHg: number
  /** Dose equivalent since launch, mSv. */
  doseMSv: number
  /** Expected dose per day where the crew is, mSv. */
  doseRateMSvDay: number
  /** Completes "expected ...", for example "on the way to Mars". */
  where: string
  /** Source id for the dose rate. */
  doseSourceId: string
}

export interface Signal {
  id: SignalId
  title: string
  level: Level
  /** The measured values, written out. */
  value: string
  /** What the values mean for this person, here. */
  meaning: string
  /** What to do about it. */
  advice: string
  sources: string[]
}

/** What one of the person's own self-tests says (camera, keyboard or headphones). */
export interface SelfTestNote {
  level: Level
  /** The result in a few words, for example "reaction test 287 ms, 1 lapse". */
  text: string
  ageDays: number
}

/**
 * The person's own self-tests as of one day, grouped by the signal they go to. They are real
 * measurements, unlike the simulated readings, and are named as such in the interface.
 */
export interface SelfTestFacts {
  /** Reaction and thinking tests, for sleep and alertness. */
  alertness: SelfTestNote[]
  /** Vision test, for the eyes; `changed` when it found a change. */
  vision: (SelfTestNote & { changed: boolean }) | null
  /** Balance and hand dexterity tests. */
  balance: SelfTestNote[]
  /** Sit-to-stand test, for the legs. */
  legs: SelfTestNote[]
  /** Pulse recovery, camera pulse and breathing rate. */
  heart: SelfTestNote[]
  /** Breathing breaks, for mood. */
  calm: SelfTestNote[]
  /** Pulse measured at rest with the camera on this day, bpm. */
  measuredPulseBpm: number | null
  /** Days, in the last 7, with a resistance set counted by the camera. */
  exerciseDays: number
  /** Two flagged runs of the same test in a row: what NASA hands to the flight surgeon. */
  repeatedFlag: boolean
}

export const NO_SELF_TESTS: SelfTestFacts = {
  alertness: [],
  vision: null,
  balance: [],
  legs: [],
  heart: [],
  calm: [],
  measuredPulseBpm: null,
  exerciseDays: 0,
  repeatedFlag: false,
}

const testLevel = (notes: SelfTestNote[]): Level =>
  notes.some((n) => n.level === 'act') ? 'act' : notes.some((n) => n.level === 'watch') ? 'watch' : 'ok'
const withTests = (value: string, notes: SelfTestNote[]) =>
  notes.length ? `${value}; ${notes.map((n) => n.text).join('; ')}` : value
const higher = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b)

export const SIGNAL_IDS = [
  'opticNerve',
  'headache',
  'sleep',
  'mood',
  'balance',
  'neckVein',
  'oxygen',
  'bodyChecks',
  'redCells',
  'immunity',
  'hydration',
  'loading',
  'vitaminD',
  'bodyMass',
  'cabinAir',
  'radiation',
] as const
export type SignalId = (typeof SIGNAL_IDS)[number]

export const LIMITS = {
  redCellsRiseMaxPct: 20, // HCT_HIGH (demo). Published in-flight rise is about 10-12% (HCT_FLIGHT)
  opticNerveReferenceMm: 6.0, // ONSD_REVIEW
  opticNerveChangeMm: 0.5, // ONSD_CHANGE (demo)
  co2LimitMmHg: 3.0, // CO2_LIMIT
  co2HeadacheMmHg: 2.5, // CO2_HEADACHE
  radiationCareerMSv: 600, // RAD_LIMIT
  radiationWatchShare: 0.5, // RAD_WATCH (demo)
  sleepMinHours: 6, // SLEEP (demo)
  spo2Watch: 94, // VITALS (demo)
  spo2Act: 90, // VITALS (demo)
  restingPulseMax: 100, // VITALS (demo)
  urineMinLitres: 2.0, // URINE_TARGET
  resistanceMinSessions: 5, // EXERCISE_PLAN (demo)
  moodLow: 2.5, // MOOD (demo)
  feverC: 38.0, // BASICS (demo)
  systolicHigh: 140, // BASICS (demo)
  diastolicHigh: 90, // BASICS (demo)
  systolicLow: 90, // BASICS (demo)
  glucoseLow: 70, // BASICS (demo)
  glucoseHigh: 180, // BASICS (demo)
  whiteCellsRiseMaxPct: 40, // IMMUNE_DEMO (demo). The in-flight rise is published (IMMUNE_WBC), this limit is not
  lymphocytesDropMaxPct: 40, // IMMUNE_DEMO (demo)
  vitaminDLowNgMl: 30, // VITD_NASA
  massLossMaxPct: 5, // MASS (demo)
} as const

const L = LIMITS
const STEADY = 'Nothing to change. Carry on as usual.'
const pct = (n: number) => `${n.toFixed(1)}%`
const change = (now: number, before: number) => ((now - before) / before) * 100

function redCells(r: Readings, b: Baseline): Signal {
  const rise = change(r.redCellsPct, b.redCellsPct)
  const [low, high] = b.redCellsRange
  const base = {
    id: 'redCells' as const,
    title: 'Red cells in the blood',
    value: `${pct(r.redCellsPct)} (before launch ${pct(b.redCellsPct)}, lab range ${low}-${high}%)`,
  }
  if (rise > L.redCellsRiseMaxPct)
    return {
      ...base,
      level: 'watch',
      meaning: `Up ${rise.toFixed(0)}% on your value before launch. Flights usually bring 10 to 12%, so this is more than expected.`,
      advice: 'Drink more through the day, log your urine and repeat the blood test.',
      sources: ['HCT_FLIGHT', 'HCT_HIGH'],
    }
  if (r.redCellsPct < low)
    return {
      ...base,
      level: 'watch',
      meaning: 'Below the lab range. Red cells do not usually drop in flight, so it is worth a second look.',
      advice: 'Repeat the blood test.',
      sources: ['HCT_REF', 'HCT_FLIGHT'],
    }
  return {
    ...base,
    level: 'ok',
    meaning:
      rise > 3
        ? `Up ${rise.toFixed(0)}% since launch, which is normal: your body sheds plasma early in a flight, so red cells make up more of your blood.`
        : 'About where it was before launch.',
    advice: STEADY,
    sources: ['HCT_FLIGHT'],
  }
}

function opticNerve(r: Readings, b: Baseline, f: SelfTestFacts): Signal {
  const grown = r.opticNerveMm - b.opticNerveMm
  const tested = f.vision?.changed === true
  const base = {
    id: 'opticNerve' as const,
    title: 'Optic nerve swelling',
    value: withTests(
      `${r.opticNerveMm.toFixed(2)} mm (before launch ${b.opticNerveMm.toFixed(2)} mm)${r.visionChange ? ', vision change reported' : ''}`,
      f.vision ? [f.vision] : [],
    ),
  }
  if (r.visionChange || grown >= L.opticNerveChangeMm)
    return {
      ...base,
      level: 'watch',
      meaning: tested
        ? 'Your vision test found a change. With this scan, that needs a closer look for SANS, the eye syndrome of spaceflight.'
        : r.visionChange
          ? 'A change in your vision, with this scan, needs a closer look for SANS, the eye syndrome of spaceflight.'
          : `Up ${grown.toFixed(2)} mm since launch. What counts is the change from your own value, more than the size itself.`,
      advice: tested
        ? 'Tell the flight surgeon and repeat the eye ultrasound.'
        : 'Take a vision test and repeat the eye ultrasound.',
      sources: tested ? ['ONSD_REVIEW', 'ONSD_CHANGE', 'SELF_TEST'] : ['ONSD_REVIEW', 'ONSD_CHANGE'],
    }
  return {
    ...base,
    level: 'ok',
    meaning:
      r.opticNerveMm > L.opticNerveReferenceMm
        ? 'Wider than the usual cut-off, as it is for more than half of astronauts before launch, but it has not changed and your vision is fine.'
        : 'No change since launch, and your vision is fine.',
    advice: STEADY,
    sources: ['ONSD_REVIEW'],
  }
}

function neckVein(r: Readings): Signal {
  const base = {
    id: 'neckVein' as const,
    title: 'Neck vein flow',
    value: r.neckVeinClot ? 'Possible clot seen on ultrasound' : `Flow ${r.neckVeinFlow}`,
  }
  if (r.neckVeinClot)
    return {
      ...base,
      level: 'act',
      meaning: 'Clots in this vein have happened in flight before, and they needed treatment.',
      advice: 'Stop and get medical advice now. Do not start any medicine on your own.',
      sources: ['IJV_STUDY', 'IJV_CASE'],
    }
  if (r.neckVeinFlow === 'forward')
    return {
      ...base,
      level: 'ok',
      meaning: 'Blood drains forward from your head, the way it should.',
      advice: STEADY,
      sources: ['IJV_STUDY'],
    }
  return {
    ...base,
    level: 'watch',
    meaning:
      'Slow or backward flow is common up here (6 of 11 station crew in one study), but one of those 11 developed a clot.',
    advice: 'Repeat the neck ultrasound and look for a clot.',
    sources: ['IJV_STUDY'],
  }
}

function headache(r: Readings, cabin: Cabin): Signal | null {
  if (!r.headache) return null
  const fromAir = cabin.co2MmHg >= L.co2HeadacheMmHg
  return {
    id: 'headache',
    title: 'Headache',
    level: 'watch',
    value: `Headache reported, cabin CO2 ${cabin.co2MmHg.toFixed(1)} mmHg`,
    meaning: fromAir
      ? `The cabin CO2 is above ${L.co2HeadacheMmHg} mmHg. On the station, every extra 1 mmHg doubled the odds of a headache, so the air is the likely culprit.`
      : 'The cabin CO2 is low, so the air is probably not the cause.',
    advice: fromAir
      ? 'Check the CO2 scrubber and the airflow where you sleep.'
      : 'Note when it comes back, and look at your sleep and how much you drink.',
    sources: ['CO2_HEADACHE', 'CO2_LIMIT'],
  }
}

function sleep(r: Readings, f: SelfTestFacts): Signal {
  const short = r.sleepHours < L.sleepMinHours
  const tests = testLevel(f.alertness)
  const slow = tests !== 'ok'
  return {
    id: 'sleep',
    title: 'Sleep and alertness',
    level: higher(short ? 'watch' : 'ok', tests),
    value: withTests(`${r.sleepHours.toFixed(1)} h a night over 7 nights`, f.alertness),
    meaning: slow
      ? `Your test is below your usual result${short ? ', after a week of short nights' : ''}. NASA uses this test to catch fatigue before it leads to mistakes.`
      : short
        ? 'A week of short nights. Your alertness drops, and so does your margin for error.'
        : f.alertness.length
          ? 'You are sleeping enough, and your alertness test is normal for you.'
          : 'You are sleeping enough this week.',
    advice: slow
      ? f.repeatedFlag
        ? 'Two tests in a row below your usual: tell the flight surgeon, and protect tonight’s sleep.'
        : 'Protect tonight’s sleep, then repeat the test within 24 hours.'
      : short
        ? 'Guard your sleep period: noise, light and the air in your quarters.'
        : STEADY,
    sources: slow ? ['SLEEP', 'SELF_TEST'] : ['SLEEP'],
  }
}

function oxygen(r: Readings, f: SelfTestFacts): Signal {
  const vitals: Level =
    r.spo2Pct < L.spo2Act
      ? 'act'
      : r.spo2Pct < L.spo2Watch || r.restingPulseBpm > L.restingPulseMax
        ? 'watch'
        : 'ok'
  const tests = testLevel(f.heart)
  const camera = f.measuredPulseBpm !== null ? ' (camera self-test today)' : ''
  return {
    id: 'oxygen',
    title: 'Oxygen and resting pulse',
    level: higher(vitals, tests),
    value: withTests(
      `Oxygen ${r.spo2Pct.toFixed(0)}%, pulse ${r.restingPulseBpm.toFixed(0)} bpm${camera}`,
      f.heart.filter((n) => !n.text.startsWith('camera pulse')),
    ),
    meaning:
      vitals !== 'ok'
        ? 'Outside the normal range.'
        : tests !== 'ok'
          ? 'Both normal, but your heart test came out below your usual result.'
          : 'Both normal.',
    advice:
      vitals === 'act'
        ? 'Sit down, check the sensor, and get medical advice now if it stays low.'
        : vitals === 'watch'
          ? 'Rest for 10 minutes, then measure again.'
          : tests !== 'ok'
            ? f.repeatedFlag
              ? 'Two tests in a row below your usual: tell the flight surgeon.'
              : 'Take it easy today, and repeat the test within 24 hours.'
            : STEADY,
    sources: tests !== 'ok' ? ['VITALS', 'SELF_TEST'] : ['VITALS'],
  }
}

function hydration(r: Readings): Signal {
  const low = r.urineLitres < L.urineMinLitres
  return {
    id: 'hydration',
    title: 'Hydration and kidney stones',
    level: low ? 'watch' : 'ok',
    value: `${r.urineLitres.toFixed(1)} L of urine in 24 h`,
    meaning: low
      ? `Below the ${L.urineMinLitres.toFixed(1)} L a day target. Up here your bones release calcium into the urine, and concentrated urine is how kidney stones start.`
      : `At or above the ${L.urineMinLitres.toFixed(1)} L a day target, which keeps the stone-forming salts diluted.`,
    advice: low ? 'Drink more through the day, and log your urine again tomorrow.' : STEADY,
    sources: ['URINE_TARGET', 'URINE_RISK'],
  }
}

function loading(r: Readings, f: SelfTestFacts): Signal {
  const low = r.resistanceSessions < L.resistanceMinSessions
  const legs = testLevel(f.legs)
  const camera = f.exerciseDays ? `, ${f.exerciseDays} of them counted by the camera` : ''
  return {
    id: 'loading',
    title: 'Bone and muscle loading',
    level: higher(low ? 'watch' : 'ok', legs),
    value: withTests(
      `${r.resistanceSessions} resistance session${r.resistanceSessions === 1 ? '' : 's'} in 7 days${camera}`,
      f.legs,
    ),
    meaning: low
      ? 'Not enough for weightlessness: unloaded hips and spine lose about 1 to 1.5% of their bone every month.'
      : legs !== 'ok'
        ? 'On plan, but your sit-to-stand test is slower than usual. Your legs may be losing strength.'
        : 'On plan. Resistance exercise is your main defence against bone and muscle loss.',
    advice: low
      ? 'Make up the missed sessions this week.'
      : legs !== 'ok'
        ? 'Keep up the resistance sessions and repeat the test within 24 hours.'
        : STEADY,
    sources: legs !== 'ok' ? ['BONE_LOSS', 'EXERCISE_PLAN', 'SELF_TEST'] : ['BONE_LOSS', 'EXERCISE_PLAN'],
  }
}

function mood(r: Readings, f: SelfTestFacts): Signal {
  const low = r.mood < L.moodLow
  return {
    id: 'mood',
    title: 'Mood',
    level: low ? 'watch' : 'ok',
    value: withTests(`${r.mood.toFixed(1)} out of 5 over 7 days`, f.calm),
    meaning: low
      ? 'A low week. Isolation and confinement wear on sleep, teamwork and safety.'
      : 'Steady this week.',
    advice: low ? 'Talk to a crewmate, and protect your sleep and your free time.' : STEADY,
    sources: ['HAZARDS', 'MOOD'],
  }
}

function balance(f: SelfTestFacts): Signal {
  const level = testLevel(f.balance)
  if (!f.balance.length)
    return {
      id: 'balance',
      title: 'Balance and coordination',
      level: 'ok',
      value: 'No self-test yet',
      meaning:
        'Every change of gravity throws off your balance and hand control for a few days. Only your own tests measure them.',
      advice: 'Take the balance test after each change of gravity, and the hand test in the first week.',
      sources: ['SENSORIMOTOR'],
    }
  return {
    id: 'balance',
    title: 'Balance and coordination',
    level,
    value: f.balance.map((n) => n.text.charAt(0).toUpperCase() + n.text.slice(1)).join('; '),
    meaning:
      level === 'ok'
        ? 'In line with your usual results.'
        : 'Below your usual result. After a change of gravity, balance and hand control take a few days to come back.',
    advice:
      level === 'ok'
        ? STEADY
        : f.repeatedFlag
          ? 'Two tests in a row below your usual: tell the flight surgeon, and move carefully.'
          : 'Move carefully, skip work at height, and repeat the test within 24 hours.',
    sources: level === 'ok' ? ['SENSORIMOTOR'] : ['SENSORIMOTOR', 'SELF_TEST'],
  }
}

function bodyChecks(r: Readings): Signal {
  const issues: string[] = []
  if (r.temperatureC >= L.feverC) issues.push('a temperature in the fever range')
  if (r.systolic >= L.systolicHigh || r.diastolic >= L.diastolicHigh) issues.push('high blood pressure')
  if (r.systolic < L.systolicLow) issues.push('low blood pressure')
  if (r.glucoseMgDl < L.glucoseLow) issues.push('low blood sugar')
  if (r.glucoseMgDl > L.glucoseHigh) issues.push('high blood sugar')
  return {
    id: 'bodyChecks',
    title: 'Blood pressure, temperature, sugar',
    level: issues.length ? 'watch' : 'ok',
    value: `${r.systolic.toFixed(0)}/${r.diastolic.toFixed(0)} mmHg, ${r.temperatureC.toFixed(1)} °C, ${r.glucoseMgDl.toFixed(0)} mg/dL`,
    meaning: issues.length
      ? `${issues.join(' and ').charAt(0).toUpperCase()}${issues.join(' and ').slice(1)}.`
      : 'All three are normal.',
    advice: issues.length ? 'Rest for 10 minutes, then measure again.' : STEADY,
    sources: ['BASICS'],
  }
}

function immunity(r: Readings, b: Baseline): Signal {
  const rise = change(r.whiteCellsK, b.whiteCellsK)
  const drop = -change(r.lymphocytesK, b.lymphocytesK)
  const base = {
    id: 'immunity' as const,
    title: 'Immune cells',
    value: `White cells ${r.whiteCellsK.toFixed(1)} (before launch ${b.whiteCellsK.toFixed(1)}), lymphocytes ${r.lymphocytesK.toFixed(1)} (before ${b.lymphocytesK.toFixed(1)}), thousand per µL`,
  }
  if (rise > L.whiteCellsRiseMaxPct || drop > L.lymphocytesDropMaxPct)
    return {
      ...base,
      level: 'watch',
      meaning:
        rise > L.whiteCellsRiseMaxPct
          ? `Your white cells are up ${rise.toFixed(0)}% since launch. A rise is common in flight, but this is more than usual.`
          : `Your lymphocytes are down ${drop.toFixed(0)}% since launch. Spaceflight can lower them.`,
      advice: 'Watch for fever, a rash or other signs of infection, and repeat the blood count.',
      sources: ['IMMUNE_WBC', 'IMMUNE_DEMO'],
    }
  return {
    ...base,
    level: 'ok',
    meaning:
      rise > 3
        ? `Your white cells are up ${rise.toFixed(0)}% since launch, as on most long station flights. That alone does not mean an infection.`
        : 'Close to your values before launch.',
    advice: STEADY,
    sources: ['IMMUNE_WBC'],
  }
}

function vitaminD(r: Readings, b: Baseline): Signal {
  const low = r.vitaminDNgMl < L.vitaminDLowNgMl
  return {
    id: 'vitaminD',
    title: 'Vitamin D',
    level: low ? 'watch' : 'ok',
    value: `${r.vitaminDNgMl.toFixed(0)} ng/mL (before launch ${b.vitaminDNgMl.toFixed(0)})`,
    meaning: low
      ? `Below ${L.vitaminDLowNgMl} ng/mL. With no sunlight, food is the only source, and station crews' levels dropped even with supplements.`
      : `At or above ${L.vitaminDLowNgMl} ng/mL. Levels tend to fall during a flight, so it is checked again later.`,
    advice: low ? 'Take your vitamin D supplement, and the vitamin D foods on your menu.' : STEADY,
    sources: ['VITD_NASA', 'VITD_FLIGHT'],
  }
}

function bodyMass(r: Readings, b: Baseline): Signal {
  const loss = -change(r.bodyMassKg, b.bodyMassKg)
  const low = loss > L.massLossMaxPct
  return {
    id: 'bodyMass',
    title: 'Body mass',
    level: low ? 'watch' : 'ok',
    value: `${r.bodyMassKg.toFixed(1)} kg (before launch ${b.bodyMassKg.toFixed(1)} kg${loss > 0.5 ? `, down ${loss.toFixed(1)}%` : ''})`,
    meaning: low
      ? `Down ${loss.toFixed(1)}% since launch. Up here the usual reason is simply eating too little.`
      : 'Steady since launch. Losing mass is often the first sign of eating too little.',
    advice: low ? 'Log what you eat for three days.' : STEADY,
    sources: ['MASS'],
  }
}

function cabinAir(cabin: Cabin): Signal {
  const high = cabin.co2MmHg > L.co2LimitMmHg
  return {
    id: 'cabinAir',
    title: 'Cabin air (CO2)',
    level: high ? 'watch' : 'ok',
    value: `${cabin.co2MmHg.toFixed(1)} mmHg, daily average`,
    meaning: high
      ? `Above the ${L.co2LimitMmHg} mmHg limit. In space, crews get headaches at lower CO2 than on Earth.`
      : `Under the ${L.co2LimitMmHg} mmHg limit.`,
    advice: high ? 'Check the CO2 scrubber and the airflow where the crew sleeps.' : STEADY,
    sources: ['CO2_LIMIT', 'CO2_HEADACHE'],
  }
}

function radiation(cabin: Cabin): Signal {
  const share = cabin.doseMSv / L.radiationCareerMSv
  return {
    id: 'radiation',
    title: 'Radiation dose',
    level: share >= 1 ? 'act' : share >= L.radiationWatchShare ? 'watch' : 'ok',
    value: `${cabin.doseMSv.toFixed(0)} mSv since launch (day ${cabin.day})`,
    meaning: `Simulated environmental dose equivalent, about ${cabin.doseRateMSvDay} mSv/day ${cabin.where}. The ${L.radiationCareerMSv} mSv NASA career limit is for personal effective dose, a different quantity. The app's 300/600 mSv flags are scenario thresholds, not a validated career or eye-dose assessment.`,
    advice: share >= L.radiationWatchShare ? 'Use the most shielded area during solar storms.' : STEADY,
    sources: [cabin.doseSourceId, 'RAD_LIMIT', 'RAD_WATCH'],
  }
}

/**
 * Every signal for one person on one day, most serious first. `tests` are the person's own
 * self-tests as of that day.
 */
export function assess(
  r: Readings,
  b: Baseline,
  cabin: Cabin,
  tests: SelfTestFacts = NO_SELF_TESTS,
): Signal[] {
  const list = [
    opticNerve(r, b, tests),
    headache(r, cabin),
    sleep(r, tests),
    mood(r, tests),
    balance(tests),
    neckVein(r),
    oxygen(r, tests),
    bodyChecks(r),
    redCells(r, b),
    immunity(r, b),
    hydration(r),
    loading(r, tests),
    vitaminD(r, b),
    bodyMass(r, b),
    cabinAir(cabin),
    radiation(cabin),
  ]
  return bySeverity(list.filter((s): s is Signal => s !== null))
}

export const RANK: Record<Level, number> = { act: 2, watch: 1, ok: 0 }

export const bySeverity = (list: Signal[]): Signal[] =>
  [...list].sort((a, b) => RANK[b.level] - RANK[a.level])

export const worstLevel = (list: Signal[]): Level =>
  list.reduce<Level>((worst, s) => (RANK[s.level] > RANK[worst] ? s.level : worst), 'ok')
