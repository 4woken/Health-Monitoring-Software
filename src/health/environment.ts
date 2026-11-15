// What a destination does to the body, factor by factor, and what NASA does about it on its flights.
// The factors follow NASA's hazards of spaceflight (radiation, isolation and distance, gravity, a
// closed environment), with light added, since a sealed cabin has no sunlight. Each factor names the
// NASA requirements that watch it (exams.ts) and the signals of this app that follow it.

import { MISSIONS, type MissionId } from '../mission/missions'
import { PARAMETERS } from '../mission/physiology'
import type { SignalId } from './signals'

export type FactorId = 'gravity' | 'radiation' | 'light' | 'air' | 'distance'

export interface Factor {
  id: FactorId
  name: string
  /** The value at this destination, written out. */
  value: string
  /** True where this destination is the hardest of the four on this factor. */
  strong: boolean
  /** What it does to the body here. */
  effect: string
  /** What NASA does about it. */
  response: string
  /** NASA requirements that watch it. */
  codes: string[]
  signals: SignalId[]
}

const CAREER_LIMIT_MSV = PARAMETERS.careerLimitMSv.value

/** The place, as it reads in "what ... does to the body". */
export const PLACE: Record<MissionId, string> = {
  orbit: 'low Earth orbit',
  moon: 'the Moon',
  cruise: 'the cruise to Mars',
  mars: 'Mars',
}

/** One-way delay of a message to Earth. */
const DELAY: Record<MissionId, string> = {
  orbit: 'Live calls with Earth',
  moon: 'About 1.3 seconds each way',
  cruise: 'Up to about 20 minutes each way',
  mars: '3 to 22 minutes each way',
}

/** Day and night, which set the body clock. */
const DAYLIGHT: Record<MissionId, string> = {
  orbit: 'In orbit the Sun rises 16 times a day, so cabin lighting keeps the body clock.',
  moon: 'At the lunar south pole the Sun stays low on the horizon for days, so cabin lighting keeps the body clock.',
  cruise: 'In deep space there is no day or night at all: cabin lighting keeps the body clock.',
  mars: 'A day on Mars lasts 24 hours 39 minutes, so the clock shifts about 40 minutes a day against Earth time.',
}

const RADIATION: Record<MissionId, string> = {
  orbit: "Earth's magnetic field still turns away part of the particles.",
  moon: 'No magnetic field and no air: only the ground below shields anything.',
  cruise:
    "Outside Earth's protection: the highest dose rate of the journey, and a solar storm can add a large dose within hours.",
  mars: 'The planet blocks half of the sky, and its thin air a little more.',
}

/** The factors at one destination, in the order NASA lists its hazards. */
export function environmentOf(mission: MissionId): Factor[] {
  const m = MISSIONS[mission]
  const g = m.gravity
  const days = Math.round(CAREER_LIMIT_MSV / m.radiationMSvDay)
  const far = mission === 'cruise' || mission === 'mars'
  return [
    {
      id: 'gravity',
      name: 'Gravity',
      value: g === 0 ? 'None: weightless' : `${g} g, ${Math.round(g * 100)}% of Earth's`,
      strong: g === 0,
      effect:
        g === 0
          ? 'Fluids move toward the head, which can swell the optic nerve and slow the blood in the neck veins. Bones and muscles lose the load that keeps them, and the spine lengthens, often with back pain in the first weeks.'
          : `Some load comes back, less than on Earth. In this simulation the shift of fluids toward the head is ${Math.round(m.fluidShift * 100)}% of the weightless one, and bones and muscles still lose mass without exercise. NASA's limits come from weightless flights.`,
      response:
        'Exercise 2.5 hours a day, with a fitness test on days 14 and 75 and the calf measured every 2 weeks. Eye exams on days 30 and 90 and a vein ultrasound on days 30 and 60 watch the fluid shift. Bone density is scanned before and after flight, and 45 days of reconditioning follow landing.',
      codes: ['MEDB 5.2', 'MEDB N3.07', 'MEDB 5.4', 'MEDB 1.10', 'MEDB 1.12', 'MEDB 1.11', 'MR026L'],
      signals: ['loading', 'opticNerve', 'neckVein', 'bodyMass', 'balance'],
    },
    {
      id: 'radiation',
      name: 'Radiation',
      value: `${m.radiationMSvDay} mSv a day, the career limit in about ${days} days`,
      strong: m.radiationMSvDay >= 1.5,
      effect: `${RADIATION[mission]} The dose adds up over the flight and raises the lifetime risk of cancer. NASA's career limit is ${CAREER_LIMIT_MSV} mSv.`,
      response:
        'Each crew member wears a dosimeter for the whole flight, and monitors in the cabin warn of solar storms, when the crew moves to the most shielded area. The blood is checked for radiation damage before and after flight, and the skin every year after the career.',
      codes: ['MEDB 3.1', 'MR004L, MR005L, MR092L, MR094L', 'MEDB 3.2', 'MER3001'],
      signals: ['radiation'],
    },
    {
      id: 'light',
      name: 'Light and UV',
      value:
        mission === 'mars'
          ? 'No sunlight inside, strong UV outside'
          : 'No sunlight inside, unfiltered UV outside',
      strong: false,
      effect: `Sunlight never reaches the cabin, so the skin makes almost no vitamin D, which the bones need. Outside, ${mission === 'mars' ? 'Mars has almost no ozone layer, so its ground gets far more ultraviolet light than Earth' : 'no ozone layer stops the ultraviolet light of the Sun'}. ${DAYLIGHT[mission]}`,
      response:
        'Crews take vitamin D, and it is measured before and after flight. Suit visors and windows filter ultraviolet light. Sleep and fatigue are reviewed at the weekly private medical conference.',
      codes: ['MEDB N3.06', 'MEDB 1.3', 'MER3001'],
      signals: ['vitaminD', 'sleep'],
    },
    {
      id: 'air',
      name: 'Closed cabin',
      value: 'Recycled air and water',
      strong: false,
      effect:
        'The same air and water go round in a closed volume. CO2 builds up where air does not move, as in sleeping quarters, and brings headaches. Materials and cargo give off vapours, and microbes spread from person to person.',
      response:
        'An air monitor runs every 73 hours, a portable CO2 monitor checks the sleeping quarters, and the air, the water and surfaces are sampled for chemicals and microbes.',
      codes: ['MR091L', 'MR039L', 'MR036L, MR037L', 'MR054L', 'MR050L, MR051L, MR052L'],
      signals: ['cabinAir', 'headache', 'hydration', 'immunity'],
    },
    {
      id: 'distance',
      name: 'Distance and isolation',
      value: DELAY[mission],
      strong: far,
      effect: far
        ? 'No quick way home and no live call with a doctor: the crew handles medical care itself, in a small group, for months.'
        : mission === 'moon'
          ? 'Days from home, in a small group: the crew handles most problems itself.'
          : 'A small group for months, with Earth in view and calls home every week.',
      response: `A private call with the flight surgeon every week, with behavioural health every 2 weeks and with family every week, and a cognitive test every month. One crew member is trained as medical officer.${far ? ' With the delay, these calls become recorded messages.' : ''}`,
      codes: ['MEDB 1.3', 'MEDB 7.2', 'MR032L', 'MEDB 7.4', 'MEDB 1.2'],
      signals: ['mood', 'sleep'],
    },
  ]
}
