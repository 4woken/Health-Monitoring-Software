// Every self-test and exercise: what it measures, how it is done, what NASA does on the same
// question and how this version differs, the signal its result goes to, and how a result is read.
// The NASA codes are those of the ISS Medical Requirements Integration Documents (JSC 28913), the
// same as in health/exams.ts.

import type { SignalId } from '../health/signals'
import { judgeBalance, TOTAL_SECONDS } from './balance/balance'
import type { ExerciseId, SelfTestId, TestId } from './ids'
import { detail, judgeScore, type Judgement, type RunValues } from './judge'
import { baselineOf, type TestResult } from './results'
import { snellen } from './vision/acuity'
import { ruffierBand } from './heart/ruffier'

export type Use =
  | 'keyboard'
  | 'camera'
  | 'face'
  | 'body'
  | 'hand'
  | 'headphones'
  | 'chair'
  | 'card'
  | 'space'
  | 'strap'
  | 'phone'

export const USE_LABEL: Record<Use, string> = {
  keyboard: 'Keyboard or touch',
  camera: 'Camera',
  face: 'Camera on your face',
  body: 'Camera on your whole body',
  hand: 'Camera on one hand',
  headphones: 'Headphones',
  chair: 'A sturdy chair',
  card: 'A bank card, the first time',
  space: '2 to 3 m of free floor',
  strap: 'A heart-rate strap, if you have one',
  phone: 'Or your phone on your chest',
}

/** A 3D demonstration of the movement, played by the coach. */
export type Move =
  'squat' | 'pacedSquat' | 'heelRaise' | 'sitToStand' | 'together' | 'tandem' | 'leftLeg' | 'rightLeg' | 'nod'

export interface Source {
  title: string
  url?: string
}

export interface SelfTest {
  id: SelfTestId
  family: 'test' | 'exercise'
  title: string
  /** The button that opens it from elsewhere. */
  action: string
  /** One line, for cards. */
  summary: string
  /** About how long it takes, minutes. */
  minutes: number
  uses: Use[]
  /** What it measures, in plain words. */
  measures: string
  /** How it goes, step by step. */
  steps: string[]
  /** Said before the start of anything physical. */
  safety?: string
  /** The signal its result goes to, on the body. */
  signal?: SignalId
  /**
   * NASA's own practice: the requirement codes on the same question, what NASA does, and the
   * requirements whose flight days make this test due (`due`).
   */
  nasa: { codes: string[]; says: string; due?: string[] }
  /** How this version differs from what NASA does. */
  adaptation: string
  sources: Source[]
  score: { label: string; unit: string; better: 'lower' | 'higher'; format: (value: number) => string }
  judge: (run: RunValues, earlier: TestResult[]) => Judgement
  /** One short line about a result, for the signal it goes to. */
  describe: (r: TestResult) => string
  coach?: Move
}

const MRID: Source = {
  title: 'NASA Johnson Space Center, Medical Requirements Integration Documents (MRIDs), JSC 28913',
}
const ms = (v: number) => `${Math.round(v)} ms`
const sec = (v: number) => `${v.toFixed(1)} s`

const reaction: SelfTest = {
  id: 'reaction',
  family: 'test',
  title: 'Reaction test',
  action: 'Take the reaction test',
  summary: 'Three minutes of pressing as soon as a counter starts. Shows how alert you are.',
  minutes: 3,
  uses: ['keyboard'],
  measures:
    'Alertness: how fast you react, and how often your attention slips (a response of 355 ms or more is a lapse).',
  steps: [
    'Sit comfortably, a finger resting on Space, or on the screen on a phone.',
    'When the counter starts, press as fast as you can. It stops and shows your time.',
    'Do not press before it starts. The test lasts 3 minutes.',
  ],
  signal: 'sleep',
  nasa: {
    codes: ['Reaction Self Test'],
    says: 'ISS crews take the Reaction Self Test, a 3-minute version of the psychomotor vigilance test, to see how short sleep and fatigue affect their alertness. Researchers had crews take it every four days in flight.',
  },
  adaptation:
    'The same 3-minute design (PVT-B): random waits of 1 to 4 seconds, and lapses from 355 ms. A browser and a screen add their own delay, so compare only with your own results on this device.',
  sources: [
    {
      title:
        'Basner, Mollicone and Dinges, a brief psychomotor vigilance test (PVT-B), Acta Astronautica 2011',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3197786',
    },
    {
      title: 'NASA, validation of the Reaction Self Test (NTRS 20090029851)',
      url: 'https://ntrs.nasa.gov/citations/20090029851',
    },
    {
      title:
        'Jones et al., sleep deficiency and neurobehavioural function on six-month ISS missions, Sleep 2022',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC8919197',
    },
  ],
  score: { label: 'Median response time', unit: 'ms', better: 'lower', format: ms },
  judge: (run, earlier) => {
    const base = judgeScore({
      score: run.score,
      earlier,
      better: 'lower',
      worse: { ratio: 0.1 },
      format: ms,
      limit: {
        flag: () => detail(run, 'lapses') >= 5,
        note: 'Five lapses or more in 3 minutes: a sign of fatigue.',
      },
    })
    if (base.level !== 'ok' || base.usual === undefined) return base
    const usualLapses = baselineOf(earlier, (r) => detail(r, 'lapses')).usual ?? 0
    return detail(run, 'lapses') >= usualLapses + 3
      ? {
          ...base,
          level: 'watch',
          note: `More lapses than usual (${detail(run, 'lapses')} against ${usualLapses}). Repeat it within 24 hours.`,
        }
      : base
  },
  describe: (r) =>
    `reaction test ${ms(r.score)}, ${detail(r, 'lapses')} lapse${detail(r, 'lapses') === 1 ? '' : 's'}`,
}

const cognition: SelfTest = {
  id: 'cognition',
  family: 'test',
  title: 'Thinking test',
  action: 'Take the thinking test',
  summary: 'Match symbols to digits for 90 seconds, then a short memory task.',
  minutes: 4,
  uses: ['keyboard'],
  measures:
    'Processing speed (symbols matched in 90 seconds) and working memory (spotting a letter seen two places before).',
  steps: [
    'Symbols: a key pairs nine symbols with the digits 1 to 9. Type the digit of each symbol shown, as fast as you can, for 90 seconds.',
    'Letters: letters come one at a time. Press when a letter is the same as the one two letters before.',
    'Each part starts with a short practice.',
  ],
  signal: 'sleep',
  nasa: {
    codes: ['MEDB 7.4'],
    due: ['MEDB 7.4'],
    says: 'Every month in flight, and after a head injury, high CO2, toxic fumes, a lack of oxygen or a decompression, crews take a cognitive test (WinSCAT). They may also take it before a spacewalk or a docking. A red result is repeated within 24 hours.',
  },
  adaptation:
    "Two of the ten tests of NASA's newer Cognition battery (Digit Symbol Substitution and a 2-back), not WinSCAT itself. The key changes at each run, as in Cognition.",
  sources: [
    MRID,
    {
      title: 'University of Pennsylvania, the Cognition test battery for spaceflight',
      url: 'https://www.med.upenn.edu/uep/cognition.html',
    },
  ],
  score: {
    label: 'Symbols matched in 90 s',
    unit: 'symbols',
    better: 'higher',
    format: (v) => `${Math.round(v)} symbols`,
  },
  judge: (run, earlier) => {
    const base = judgeScore({
      score: run.score,
      earlier,
      better: 'higher',
      worse: { ratio: 0.15 },
      format: (v) => `${Math.round(v)} symbols`,
    })
    if (base.level !== 'ok' || base.usual === undefined) return base
    const usual = baselineOf(earlier, (r) => detail(r, 'nBack')).usual
    return usual !== undefined && detail(run, 'nBack') <= usual - 15
      ? {
          ...base,
          level: 'watch',
          note: `Memory task below your usual (${detail(run, 'nBack')}% against ${usual}%). Repeat it within 24 hours.`,
        }
      : base
  },
  describe: (r) => `thinking test ${Math.round(r.score)} symbols, memory ${detail(r, 'nBack')}%`,
}

const vision: SelfTest = {
  id: 'vision',
  family: 'test',
  title: 'Vision test',
  action: 'Test my vision',
  summary: 'Sharpness up close with each eye, then the Amsler grid.',
  minutes: 6,
  uses: ['face', 'keyboard', 'card'],
  measures:
    'How sharp each eye sees up close (logMAR: 0 is 20/20, higher is blurrier), and any wavy, blurred or missing part of the Amsler grid.',
  steps: [
    'The first time, match a bank card on the screen, so letter sizes are true.',
    'The camera measures how far your eyes are from the screen. Move until it reads the distance asked.',
    'Cover one eye with your palm. Say which way each E points, with the arrow keys or the buttons, until the letters are too small.',
    'Look at the dot in the middle of the grid with each eye and mark any line that looks wavy, blurred or missing.',
  ],
  signal: 'opticNerve',
  nasa: {
    codes: ['MEDB 1.10'],
    due: ['MEDB 1.10'],
    says: 'On flight days 30 and 90, and 30 days before landing, crews test the sharpness of their sight near and far, look at the Amsler grid and answer a vision questionnaire, to catch the eye syndrome of spaceflight (SANS).',
  },
  adaptation:
    'Sharpness is tested at 40 cm, or farther on a screen too coarse for small letters there. The camera gauges distance from the size of your iris (about 11.7 mm), assuming a typical laptop camera, and checks which eye is covered. A screen is not a clinical chart: compare only with your own results.',
  sources: [
    MRID,
    {
      title: 'Google Research, MediaPipe Iris: real-time iris tracking and depth estimation',
      url: 'https://research.google/blog/mediapipe-iris-real-time-iris-tracking-depth-estimation/',
    },
  ],
  score: {
    label: 'Sharpness of the weaker eye',
    unit: 'logMAR',
    better: 'lower',
    format: (v) => `${v.toFixed(2)} logMAR (${snellen(v)})`,
  },
  judge: (run, earlier) => {
    const amsler = detail(run, 'amslerMarks')
    const complaint = run.details.complaint === true
    const { usual } = baselineOf(earlier)
    const usualMarks = baselineOf(earlier, (r) => detail(r, 'amslerMarks')).usual ?? 0
    const reasons: string[] = []
    if (usual !== undefined ? run.score >= usual + 0.2 : run.score > 0.3)
      reasons.push(
        usual !== undefined
          ? `sharpness two lines below your usual ${usual.toFixed(2)}`
          : 'sharpness worse than 20/40',
      )
    if (amsler > (usual !== undefined ? usualMarks : 0)) reasons.push('new marks on the Amsler grid')
    if (complaint) reasons.push('a change you noticed yourself')
    if (reasons.length)
      return {
        level: 'watch',
        note: `Vision change: ${reasons.join(', ')}. Tell the flight surgeon; NASA would repeat the eye exam.`,
        usual,
      }
    return judgeScore({
      score: run.score,
      earlier,
      better: 'lower',
      worse: { by: 0.2 },
      format: (v) => v.toFixed(2),
    })
  },
  describe: (r) =>
    `vision test ${r.score.toFixed(2)} logMAR${detail(r, 'amslerMarks') > 0 ? `, ${detail(r, 'amslerMarks')} Amsler marks` : ''}`,
}

const hearing: SelfTest = {
  id: 'hearing',
  family: 'test',
  title: 'Hearing test',
  action: 'Test my hearing',
  summary: 'Three digits in noise, 24 times, with headphones.',
  minutes: 4,
  uses: ['headphones', 'keyboard'],
  measures:
    'How quietly this device can play a voice in noise while you still recognise the digits. A lower relative level means you recognised quieter speech.',
  steps: [
    'Put on headphones and set a comfortable volume with the sample. Then leave the volume alone.',
    'A voice says three digits in a steady noise. Type the three digits you heard, guessing if you must.',
    'The voice gets quieter after each right answer and louder after each wrong one, 24 times.',
  ],
  nasa: {
    codes: ['MEDB 1.8'],
    due: ['MEDB 1.8'],
    says: 'Crews test their hearing on a station laptop with headphones by flight day 21, then about mid-mission, and within 24 hours of noise measurements. The station is loud, so hearing protection is part of the plan.',
  },
  adaptation:
    'NASA measures the softest tone each ear hears. Pulsar reports the browser’s voice level relative to its starting setting, in dB. The sound at your ears depends on the device, voice, headphones and volume. Keep those the same to compare runs.',
  sources: [
    MRID,
    {
      title:
        'Smits, Kapteyn and Houtgast, an automatic speech-in-noise screening test by telephone, Int J Audiol 2004',
      url: 'https://pubmed.ncbi.nlm.nih.gov/14974624/',
    },
  ],
  score: {
    label: 'Relative voice level',
    unit: 'dB',
    better: 'lower',
    format: (v) => `${v.toFixed(1)} dB`,
  },
  judge: (run, earlier) => {
    const same = earlier.filter((r) => r.details.voice === run.details.voice)
    return judgeScore({
      score: run.score,
      earlier: same,
      better: 'lower',
      worse: { by: 3 },
      format: (v) => `${v.toFixed(1)} dB`,
    })
  },
  describe: (r) => `hearing test ${r.score.toFixed(1)} dB`,
}

const balance: SelfTest = {
  id: 'balance',
  family: 'test',
  title: 'Balance test',
  action: 'Test my balance',
  summary: 'Six stances of 15 to 20 seconds: feet together, eyes closed, heel to toe, on one leg.',
  minutes: 4,
  uses: ['body', 'space', 'phone'],
  measures: 'How long you hold each stance, up to its target, and how much your shoulders sway.',
  steps: [
    'Put the computer at waist height and step back 2 to 3 m, until your whole body is in view.',
    'For each stance the voice says what to do. Get into it: the timer starts when the camera sees it.',
    'Hold still. When you lose a stance, just step out of it: the next one follows.',
  ],
  safety:
    'Stand next to a wall or a sturdy chair you can grab. Stop if you feel dizzy. Do not take this test alone if you have balance problems.',
  signal: 'balance',
  nasa: {
    codes: ['MEDB 1.5', 'MEDB 5.1', 'Field Test'],
    says: 'Before flight and after landing, NASA tests standing balance with the eyes open, then closed, then closed with head movements (MEDB 1.5). The fitness tests include standing on one leg for 15 seconds (MEDB 5.1), and the Field Test right after landing a heel-to-toe walk with the eyes closed.',
  },
  adaptation:
    'No moving platform: the camera follows your shoulders, hips and feet, and checks that your eyes are closed when they should be. Heel to toe is done standing here, not walking. With the phone held on your chest, its motion sensor measures the sway instead.',
  sources: [
    MRID,
    {
      title: 'NASA Spaceflight Standard Measures, the tandem walk (NTRS 20180002943)',
      url: 'https://ntrs.nasa.gov/api/citations/20180002943/downloads/20180002943.pdf',
    },
    {
      title: 'NASA Human Research Program, risk of altered sensorimotor and vestibular function',
      url: 'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
    },
  ],
  score: {
    label: 'Seconds held',
    unit: 's',
    better: 'higher',
    format: (v) => `${Math.round(v)} of ${TOTAL_SECONDS} s`,
  },
  judge: (run, earlier) => judgeBalance(run.score, run.details, earlier),
  describe: (r) =>
    `balance test ${Math.round(r.score)} of ${TOTAL_SECONDS} s held${typeof r.details.sway === 'number' && r.details.mode === 'camera' ? `, sway ${r.details.sway} cm` : ''}`,
  coach: 'together',
}

const sitToStand: SelfTest = {
  id: 'sitToStand',
  family: 'test',
  title: 'Sit-to-stand test',
  action: 'Time my sit-to-stand',
  summary: 'Stand up from a chair five times, as fast as you safely can.',
  minutes: 2,
  uses: ['body', 'chair'],
  measures: 'Strength and control of the legs: the time to stand up fully five times.',
  steps: [
    'Put a steady chair against a wall and place the camera about 2 to 3 m to one side. Frame one person, with the hip, knee and foot visible.',
    'Sit with arms crossed and wait for the countdown to finish before the first stand.',
    'On go, stand fully and sit back down between rises. Timing ends when you stand for the fifth time.',
  ],
  safety: 'Use a chair that cannot slide. Stop if you feel dizzy or have pain.',
  signal: 'loading',
  nasa: {
    codes: ['Field Test', 'MEDB 5.1'],
    says: 'Right after landing, NASA times crews standing up from a seat, getting up from the floor and walking (the Field Test): the legs and balance need days to readapt. Leg strength is also tested before and after flight.',
  },
  adaptation:
    'The common five-times sit-to-stand test, timed by the camera. NASA’s Field Test uses its own seat and timing.',
  sources: [
    {
      title: 'NASA, the Field Test after Soyuz landings (NTRS 20150022287)',
      url: 'https://ntrs.nasa.gov/citations/20150022287',
    },
    {
      title: 'Clément et al., functional tasks after long-duration flight, Frontiers in Physiology 2022',
      url: 'https://doi.org/10.3389/fphys.2022.1029161',
    },
  ],
  score: { label: 'Time for five stands', unit: 's', better: 'lower', format: sec },
  judge: (run, earlier) =>
    judgeScore({
      score: run.score,
      earlier,
      better: 'lower',
      worse: { ratio: 0.2 },
      format: sec,
      limit: { flag: (s) => s > 15, note: 'Slower than 15 seconds.' },
    }),
  describe: (r) => `sit-to-stand ${sec(r.score)}`,
  coach: 'sitToStand',
}

const dexterity: SelfTest = {
  id: 'dexterity',
  family: 'test',
  title: 'Hand dexterity test',
  action: 'Test my hand control',
  summary: 'Pinch eight solar cells and drop each one in its socket, against the clock.',
  minutes: 2,
  uses: ['hand'],
  measures: 'Fine control of the hand: the time to move eight cells, and the cells dropped on the way.',
  steps: [
    'Sit facing the camera with one hand raised in view.',
    'Move your index finger over the cell, pinch it with your thumb, carry it to the dashed socket and open your fingers.',
    'The clock starts with the first pinch. Eight cells.',
  ],
  signal: 'balance',
  nasa: {
    codes: ['Fine Motor Skills'],
    says: 'In a NASA study on the ISS, crews pointed, dragged, traced and pinched on a tablet. Fine control dropped in the first week in orbit and in the first month after landing.',
  },
  adaptation:
    'Done in the air in front of the camera, without a touchscreen, with the same layout every time.',
  sources: [
    {
      title: 'Holden et al., fine motor skills before, during and after ISS missions (PubMed 35609944)',
      url: 'https://pubmed.ncbi.nlm.nih.gov/35609944/',
    },
  ],
  score: { label: 'Time for eight cells', unit: 's', better: 'lower', format: sec },
  judge: (run, earlier) =>
    judgeScore({ score: run.score, earlier, better: 'lower', worse: { ratio: 0.3 }, format: sec }),
  describe: (r) => `hand test ${sec(r.score)} for 8 cells`,
}

const pulseRecovery: SelfTest = {
  id: 'pulseRecovery',
  family: 'test',
  title: 'Pulse recovery test',
  action: 'Test my pulse recovery',
  summary: 'Resting pulse, 30 squats in 45 seconds, then your pulse as you recover.',
  minutes: 4,
  uses: ['face', 'body', 'strap'],
  measures: 'How your heart answers a set effort and comes back down: the Ruffier index. Lower is better.',
  steps: [
    'Sit facing the camera: it reads your resting pulse for about 20 seconds.',
    'Stand back with your whole body and feet in view. Wait upright for the countdown, then do 30 squats in 45 seconds, one per beep.',
    'Sit straight back down facing the camera and keep still for 75 seconds while it reads your pulse.',
  ],
  safety: 'Stop if you feel chest pain, dizziness or unusual breathlessness. Not just after a meal.',
  signal: 'oxygen',
  nasa: {
    codes: ['MEDB N3.07', 'MR019L'],
    due: ['MEDB N3.07'],
    says: 'On flight days 14 and 75, crews ride a cycle test with their heart rate recorded, to set their exercise. A heart-rate monitor follows every session.',
  },
  adaptation:
    'The Ruffier test, a French squat test, stands in for the bike. The camera reads the first pulse after the effort about 15 to 30 seconds after you sit; a Bluetooth strap reads it at once.',
  sources: [
    MRID,
    {
      title: 'Sartor et al., a 45-second self-test of fitness (Ruffier), PLOS One 2016',
      url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5154562',
    },
  ],
  score: {
    label: 'Ruffier index',
    unit: '',
    better: 'lower',
    format: (v) => `${v.toFixed(1)} (${ruffierBand(v)})`,
  },
  judge: (run, earlier) =>
    judgeScore({
      score: run.score,
      earlier,
      better: 'lower',
      worse: { by: 3 },
      format: (v) => v.toFixed(1),
      limit: { flag: (s) => s > 15, note: 'Above 15, the weakest band of the Ruffier index.' },
    }),
  describe: (r) =>
    `pulse recovery ${r.score.toFixed(1)} (${detail(r, 'p0')}, ${detail(r, 'p1')}, ${detail(r, 'p2')} bpm)`,
  coach: 'pacedSquat',
}

const restingPulse: SelfTest = {
  id: 'restingPulse',
  family: 'test',
  title: 'Resting pulse',
  action: 'Measure my pulse',
  summary: 'A minute sitting still, facing the camera.',
  minutes: 1,
  uses: ['face', 'strap'],
  measures: 'Your pulse at rest, from small colour changes in the skin of your face.',
  steps: [
    'Sit facing the camera in even light, without a window behind you.',
    'Keep still and breathe normally. The reading takes about 45 seconds.',
  ],
  signal: 'oxygen',
  nasa: {
    codes: ['MR019L', 'MEDB 1.2'],
    due: ['MEDB 1.2'],
    says: 'Crews wear a heart-rate monitor during exercise, and take their vital signs in the crew medical officer’s health checks.',
  },
  adaptation: 'Estimated by the camera (POS method), not by a sensor on the skin. Not a medical measurement.',
  sources: [
    {
      title: 'Wang et al., algorithmic principles of remote PPG, IEEE Trans Biomed Eng 2017',
      url: 'https://doi.org/10.1109/TBME.2016.2609282',
    },
  ],
  score: { label: 'Resting pulse', unit: 'bpm', better: 'lower', format: (v) => `${Math.round(v)} bpm` },
  judge: (run, earlier) =>
    judgeScore({
      score: run.score,
      earlier,
      better: 'lower',
      worse: { by: 15 },
      format: (v) => `${Math.round(v)} bpm`,
      limit: { flag: (s) => s > 100, note: 'Above 100 bpm at rest (the usual clinical limit).' },
    }),
  describe: (r) => `camera pulse ${Math.round(r.score)} bpm`,
}

const breathingRate: SelfTest = {
  id: 'breathingRate',
  family: 'test',
  title: 'Breathing rate',
  action: 'Measure my breathing',
  summary: 'About 40 seconds sitting still, your face and chest in view.',
  minutes: 1,
  uses: ['face'],
  measures: 'Breaths a minute, from the rise and fall of your chest.',
  steps: [
    'Rest the computer on a table and sit facing it, your face and upper chest in view.',
    'Keep still and breathe normally for about 40 seconds.',
  ],
  signal: 'oxygen',
  nasa: {
    codes: ['MEDB 1.2'],
    says: 'Vital signs, breathing included, are part of the crew medical officer’s health checks in flight.',
  },
  adaptation:
    'An experimental estimate from the movement of the chest. Talking or swaying can look like breathing.',
  sources: [],
  score: {
    label: 'Breathing rate',
    unit: 'breaths/min',
    better: 'lower',
    format: (v) => `${Math.round(v)} breaths/min`,
  },
  judge: (run, earlier) => ({
    level: 'ok',
    note:
      baselineOf(earlier).usual !== undefined
        ? `Your usual is ${Math.round(baselineOf(earlier).usual!)} breaths a minute. This estimate is experimental and does not change any level.`
        : 'This estimate is experimental and does not change any level.',
    usual: baselineOf(earlier).usual,
  }),
  describe: (r) => `breathing ${Math.round(r.score)} a minute (camera)`,
}

/** Exercises are counted, not judged. Doing one is what matters. */
const done =
  (what: string): SelfTest['judge'] =>
  (run) => ({ level: 'ok', note: `${what} done: ${Math.round(run.score)}.` })

const squats: SelfTest = {
  id: 'squats',
  family: 'exercise',
  title: 'Squats',
  action: 'Do a set of squats',
  summary: 'Two sets of ten bodyweight squats, counted by the camera.',
  minutes: 3,
  uses: ['body', 'space'],
  measures: 'Completed repetitions and an estimate of knee bend.',
  steps: [
    'Face sideways or at a three-quarter angle, about 2 to 3 m from a steady camera. Keep just yourself and both feet in the picture.',
    'Stand upright for a moment so the camera can learn your starting height. Bend your knees, then return to that height. The count changes when you stand back up.',
    'Rest 30 seconds between the two sets.',
  ],
  safety: 'Keep your heels down and stop if your knees or back hurt.',
  signal: 'loading',
  nasa: {
    codes: ['MEDB 5.2'],
    says: 'Crews exercise 2.5 hours a day on the ISS. Squats are a staple of its resistance device (ARED), and Orion crews squat and row on a small flywheel for 30 minutes a day.',
  },
  adaptation:
    'Body weight only: NASA’s devices add loads to make up for the weight space takes away. A set done here counts as a resistance session.',
  sources: [
    MRID,
    {
      title: 'Canadian Space Agency, exercising with a flywheel aboard Orion',
      url: 'https://asc-csa.gc.ca/eng/multimedia/search/image/18771',
    },
  ],
  score: { label: 'Squats', unit: 'reps', better: 'higher', format: (v) => `${Math.round(v)} squats` },
  judge: done('Squats'),
  describe: (r) => `${Math.round(r.score)} squats`,
  coach: 'squat',
}

const heelRaises: SelfTest = {
  id: 'heelRaises',
  family: 'exercise',
  title: 'Heel raises',
  action: 'Do heel raises',
  summary: 'Rise on your toes 15 times, twice, for the calf muscles.',
  minutes: 2,
  uses: ['body'],
  measures: 'Repetitions, with straight knees.',
  steps: [
    'Stand side-on to the camera, your feet in view, a hand on a wall for balance.',
    'Rise up on your toes, then lower your heels slowly. The camera counts.',
    'Rest 30 seconds between the two sets.',
  ],
  signal: 'loading',
  nasa: {
    codes: ['MEDB 5.2'],
    says: 'Calf muscles shrink fast in weightlessness: NASA follows the calf every two weeks in flight, and heel raises are among the resistance exercises.',
  },
  adaptation: 'Body weight only. A set done here counts as a resistance session.',
  sources: [MRID],
  score: {
    label: 'Heel raises',
    unit: 'reps',
    better: 'higher',
    format: (v) => `${Math.round(v)} heel raises`,
  },
  judge: done('Heel raises'),
  describe: (r) => `${Math.round(r.score)} heel raises`,
  coach: 'heelRaise',
}

const breathing: SelfTest = {
  id: 'breathing',
  family: 'exercise',
  title: 'Guided breathing',
  action: 'Take a breathing break',
  summary: 'Slow breathing, six breaths a minute, for 1, 3 or 5 minutes.',
  minutes: 3,
  uses: ['keyboard'],
  measures: 'Minutes of slow breathing, and how you feel after.',
  steps: [
    'Sit comfortably. Breathe in while the circle grows, out while it shrinks.',
    'Stop whenever you want. At the end, say how you feel, if you like.',
  ],
  signal: 'mood',
  nasa: {
    codes: [],
    says: 'Crews talk with a behavioural health specialist every two weeks (MEDB 7.2). NASA counts isolation and confinement among the five hazards of spaceflight.',
  },
  adaptation: 'A common relaxation exercise, not a NASA protocol.',
  sources: [
    {
      title: 'NHS, breathing exercises for stress',
      url: 'https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/',
    },
    {
      title: 'NASA Human Research Program, the five hazards of human spaceflight',
      url: 'https://www.nasa.gov/hrp/hazards/',
    },
  ],
  score: { label: 'Minutes', unit: 'min', better: 'higher', format: (v) => `${v.toFixed(1)} min` },
  judge: (run) => ({
    level: 'ok',
    note: `Breathing break done: ${run.score.toFixed(1)} minutes${typeof run.details.feeling === 'string' ? `, feeling ${run.details.feeling} afterwards` : ''}.`,
  }),
  describe: (r) =>
    `breathing break ${r.score.toFixed(1)} min${typeof r.details.feeling === 'string' ? `, ${r.details.feeling} after` : ''}`,
}

export const SELF_TESTS: Record<SelfTestId, SelfTest> = {
  reaction,
  cognition,
  vision,
  hearing,
  balance,
  sitToStand,
  dexterity,
  pulseRecovery,
  restingPulse,
  breathingRate,
  squats,
  heelRaises,
  breathing,
}

export const TESTS: TestId[] = [
  'reaction',
  'cognition',
  'vision',
  'hearing',
  'balance',
  'sitToStand',
  'dexterity',
  'pulseRecovery',
  'restingPulse',
  'breathingRate',
]
export const EXERCISES: ExerciseId[] = ['squats', 'heelRaises', 'breathing']

/** The self-tests whose result goes to a signal, first the one that answers it best. */
export function testsFor(signal: SignalId): SelfTestId[] {
  const extra: Partial<Record<SignalId, SelfTestId[]>> = {
    headache: ['cognition'],
    cabinAir: ['cognition'],
  }
  const own = (Object.values(SELF_TESTS) as SelfTest[]).filter((t) => t.signal === signal).map((t) => t.id)
  return [...own, ...(extra[signal] ?? [])]
}

const codesOf = (code: string) => code.split(',').map((c) => c.trim())

/** The self-tests on the same question as a NASA requirement: its at-home side. */
export const testsForCode = (code: string): SelfTestId[] =>
  (Object.values(SELF_TESTS) as SelfTest[])
    .filter((t) => t.nasa.codes.some((c) => codesOf(code).includes(c)))
    .map((t) => t.id)

/** The self-tests due on the flight days of a NASA requirement. */
export const testsScheduledBy = (code: string): SelfTestId[] =>
  (Object.values(SELF_TESTS) as SelfTest[])
    .filter((t) => t.nasa.due?.some((c) => codesOf(code).includes(c)))
    .map((t) => t.id)
