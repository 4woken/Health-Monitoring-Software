// Plain words for each signal: what it is, and how it is taken. Nobody on board is assumed to know
// how to assess their own health.

import type { SignalId } from './signals'

export interface Guide {
  /** What the signal is, and why space changes it. */
  what: string
  /** How the value is taken. */
  how: string
}

export const GUIDE: Record<SignalId, Guide> = {
  opticNerve: {
    what: 'The width of the sleeve around the nerve behind the eye. Fluid moving toward the head can change the eye and vision on long flights: about 70% of station astronauts show some swelling at the back of the eye.',
    how: 'An ultrasound probe held gently on the closed eyelid, with gel. A crewmate can help.',
  },
  headache: {
    what: 'A headache the person reports. In a sealed cabin, the carbon dioxide everyone breathes out can build up and cause it.',
    how: 'Said by the person, on the day it happens.',
  },
  sleep: {
    what: 'Average sleep over the last week. Noise, workload and the lack of a normal day make sleep harder: the station sees 16 sunrises a day.',
    how: 'Measured by the wearable sensor. Alertness comes from your own reaction and thinking tests, in Self-tests.',
  },
  mood: {
    what: 'How the person rates their own mood, averaged over a week. Months in a small space far from home wear on anyone.',
    how: 'A rating from 1 (very low) to 5 (very good), once a day.',
  },
  balance: {
    what: 'Balance and fine control of the hands. The inner ear senses gravity, so each change of it, into weightlessness or back into gravity, upsets balance and coordination for days.',
    how: 'Your own tests in Self-tests: the balance test with the camera (or your phone on your chest), and the hand dexterity test.',
  },
  neckVein: {
    what: 'How blood drains from the head through the large vein in the neck. Without gravity pulling it down, the flow can slow or stall.',
    how: 'An ultrasound probe on the left side of the neck.',
  },
  oxygen: {
    what: 'The oxygen level in the blood and the resting pulse. Low gravity changes the heart and the vessels, so the trend matters as much as one value.',
    how: 'The wearable sensor, at rest. Your own pulse can also be read with the camera, in Self-tests.',
  },
  bodyChecks: {
    what: 'Blood pressure, temperature and blood sugar: the first checks a doctor would make. Far from a doctor, the crew makes them.',
    how: 'An arm cuff, a thermometer and a finger-prick meter.',
  },
  redCells: {
    what: 'The share of the blood made of red cells (hematocrit). In weightlessness the body sheds plasma, so this share goes up.',
    how: 'A small blood sample in the onboard blood analyser.',
  },
  immunity: {
    what: 'White blood cells fight infection; lymphocytes are one important kind. Radiation, stress, poor sleep and diet all change the immune system in flight.',
    how: 'The same small blood sample as the red cells, in the blood analyser.',
  },
  hydration: {
    what: 'How much urine is passed in a day. Bones lose calcium in weightlessness and it leaves through the urine, where it can form kidney stones if the urine is concentrated.',
    how: 'The volume from the collection device, once a day.',
  },
  loading: {
    what: 'How often the bones and muscles get a real load from resistance exercise. Without it they weaken.',
    how: 'Counted by the exercise device. Nothing to do.',
  },
  vitaminD: {
    what: 'The vitamin D in the blood. Skin makes it from sunlight, which never reaches a sealed cabin, so food and supplements are the only source. Bones need it to take up calcium.',
    how: 'A blood sample. On the station these samples go back to Earth, so the result comes late.',
  },
  bodyMass: {
    what: 'Body mass compared with before launch. Food is limited to what was packed, and losing mass is an early sign of eating too little.',
    how: 'The onboard mass device, once a week.',
  },
  cabinAir: {
    what: 'Carbon dioxide in the cabin air. Everyone breathes it out and machines must take it out again.',
    how: 'Measured by the cabin sensors. Nothing to do.',
  },
  radiation: {
    what: "The radiation dose received since launch. Outside Earth's magnetic shield it is much higher.",
    how: 'Measured by the dosimeter. Nothing to do.',
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
