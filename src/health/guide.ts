// Plain words for each signal: what it is, and how it is measured, written to the crew member.
// Nobody on board is expected to be a doctor.

import type { SignalId } from './signals'

export interface Guide {
  /** What the signal is, and why space changes it. */
  what: string
  /** How the value is taken. */
  how: string
}

export const GUIDE: Record<SignalId, Guide> = {
  opticNerve: {
    what: 'The sleeve of fluid around the nerve at the back of your eye. Without gravity, fluid drifts toward your head and can press on the eye, and about 70% of station astronauts end up with some swelling there.',
    how: 'A small ultrasound probe on your closed eyelid, with a little gel. A crewmate can hold it for you.',
  },
  headache: {
    what: 'A headache you report. In a sealed cabin, the CO2 everyone breathes out can build up, and that is the usual cause.',
    how: 'You say so, on the day it happens.',
  },
  sleep: {
    what: 'How long you have slept, on average, over the past week. Noise, workload and sixteen sunrises a day on the station make good sleep hard.',
    how: 'Your wearable tracks it. Your reaction and thinking tests, in Tests, show how alert you are.',
  },
  mood: {
    what: 'How you rate your mood, averaged over the week. Months in a small space far from home wear on anyone.',
    how: 'A score from 1 (very low) to 5 (very good), once a day.',
  },
  balance: {
    what: 'Your balance and the fine control of your hands. Your inner ear senses gravity, so every change of gravity throws them off for a few days.',
    how: 'Your own tests, in Tests: balance with the camera (or a phone held on your chest) and the hand dexterity test.',
  },
  neckVein: {
    what: 'How blood drains from your head through the large vein in your neck. With no gravity pulling it down, the flow can slow down or even stall.',
    how: 'An ultrasound probe on the left side of your neck.',
  },
  oxygen: {
    what: 'The oxygen in your blood and your pulse at rest. Space changes the heart and the blood vessels, so the trend tells you more than any one reading.',
    how: 'Your wearable, while you rest. You can also read your pulse with the camera, in Tests.',
  },
  bodyChecks: {
    what: 'Blood pressure, temperature and blood sugar: the first things a doctor checks. There is no doctor down the corridor up here, so you check them yourself.',
    how: 'An arm cuff, a thermometer and a finger-prick meter.',
  },
  redCells: {
    what: 'How much of your blood is red cells, the hematocrit. In weightlessness your body sheds plasma, so that share goes up.',
    how: 'A drop of blood in the onboard analyser.',
  },
  immunity: {
    what: 'White blood cells fight infection, and lymphocytes are one of the main kinds. Radiation, stress, short nights and packed food all change the immune system in flight.',
    how: 'The same drop of blood as for the red cells, in the analyser.',
  },
  hydration: {
    what: 'How much urine you pass in a day. Your bones lose calcium in weightlessness and it leaves in the urine, where it can form kidney stones if you do not drink enough.',
    how: 'The volume from the collection device, once a day.',
  },
  loading: {
    what: 'How often your bones and muscles get real work. Without a load they weaken, and quickly.',
    how: 'The exercise machines count your sessions. Nothing for you to do.',
  },
  vitaminD: {
    what: 'The vitamin D in your blood. Your skin makes it from sunlight, which never reaches a sealed cabin, so it has to come from food and supplements. Your bones need it to take up calcium.',
    how: 'A blood sample. On the station these go back to Earth, so the result arrives late.',
  },
  bodyMass: {
    what: 'Your mass compared with launch day. You only eat what was packed, and losing mass is often the first sign that you are eating too little.',
    how: 'The onboard mass device, once a week.',
  },
  cabinAir: {
    what: 'The CO2 in the cabin air. Everyone breathes it out, and machines have to take it out again.',
    how: 'The cabin sensors measure it. Nothing for you to do.',
  },
  radiation: {
    what: 'Simulated environmental dose equivalent. Personal effective dose and organ gray-equivalent are different quantities; the organ panel integrates absorbed doses by particle type.',
    how: 'NASA active dosimeters timestamp absorbed-dose readings. Organ estimates require calibrated radiation data and transport through shielding and the body. Pulsar uses labelled examples or imported organ inputs.',
  },
}

/**
 * The NASA Human Research Program risk each signal belongs to, from https://www.nasa.gov/hrp/risks/.
 * Kidney stones and cabin air have no entry of their own on that list.
 */
export const NASA_RISK: Partial<Record<SignalId, { name: string; url: string }>> = {
  opticNerve: {
    name: 'Spaceflight Associated Neuro-ocular Syndrome (SANS)',
    url: 'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/',
  },
  neckVein: {
    name: 'Cardiovascular Adaptations',
    url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
  },
  redCells: {
    name: 'Cardiovascular Adaptations',
    url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
  },
  oxygen: {
    name: 'Cardiovascular Adaptations',
    url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
  },
  bodyChecks: {
    name: 'Cardiovascular Adaptations',
    url: 'https://www.nasa.gov/reference/risk-of-cardiovascular-adaptations/',
  },
  loading: {
    name: 'Spaceflight-Induced Bone Changes',
    url: 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/',
  },
  vitaminD: {
    name: 'Inadequate Food and Nutrition',
    url: 'https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/',
  },
  bodyMass: {
    name: 'Inadequate Food and Nutrition',
    url: 'https://www.nasa.gov/reference/risk-of-inadequate-food-and-nutrition/',
  },
  immunity: {
    name: 'Altered Immune System Responses',
    url: 'https://www.nasa.gov/reference/risk-of-altered-immune-system-responses/',
  },
  balance: {
    name: 'Altered Sensorimotor and Vestibular Function',
    url: 'https://www.nasa.gov/reference/risk-of-altered-sensorimotor-and-vestibular-function/',
  },
  sleep: {
    name: 'Inadequate Sleep and Irregular Schedules',
    url: 'https://www.nasa.gov/reference/risk-from-inadequate-sleep-and-irregular-schedules/',
  },
  mood: {
    name: 'Behavioral Changes and Psychiatric Disorders',
    url: 'https://www.nasa.gov/reference/risk-of-behavioral-conditions-and-psychiatric-disorders/',
  },
  radiation: {
    name: 'Radiation-Induced Cancers',
    url: 'https://www.nasa.gov/reference/risk-of-radiation-induced-cancers/',
  },
}
