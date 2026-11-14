// Destinations. Each one sets the gravity and the radiation the body lives with. The picture
// behind the body is chosen separately (habitats.ts).

import { fluidShiftFactor } from './physiology'

export type MissionId = 'orbit' | 'moon' | 'cruise' | 'mars'

export interface Mission {
  id: MissionId
  name: string
  /** Number of whole Earth days in this dashboard scenario. */
  days: number
  durationBasis: string
  durationSource: string
  /** Where exactly, in a few words. */
  place: string
  /** Completes "expected ...", for example "on the way to Mars". */
  where: string
  /** Gravity as a share of Earth's. */
  gravity: number
  /**
   * How much of the weightless "fluid moves toward the head" effect applies: 1 in weightlessness,
   * less in partial gravity (from the physiology engine).
   */
  fluidShift: number
  /** Dose equivalent per day, mSv. */
  radiationMSvDay: number
  /** Id in health/sources.ts for the dose rate. */
  radiationSourceId: string
  /** What this destination does to the body, in one sentence. */
  about: string
}

export const MISSIONS: Record<MissionId, Mission> = {
  orbit: {
    id: 'orbit',
    days: 180,
    durationBasis: 'A typical ISS stay lasts about six months. Pulsar uses 180 Earth days.',
    durationSource:
      'https://www.nasa.gov/missions/station/faq-the-real-story-about-astronaut-health-care-in-space/',
    name: 'Orbit',
    place: 'Low Earth orbit, 400 km up',
    where: 'in low Earth orbit',
    gravity: 0,
    fluidShift: 1,
    radiationMSvDay: 0.73,
    radiationSourceId: 'RAD_ISS',
    about:
      "Weightless: fluids rise toward the head and bones lose their load. Earth's magnetic field still blocks part of the radiation.",
  },
  moon: {
    id: 'moon',
    days: 3,
    durationBasis:
      'Apollo 17 spent 75 hours on the lunar surface. This scenario covers its three complete Earth days.',
    durationSource: 'https://www.nasa.gov/missions/apollo/apollo-17-mission-details/',
    name: 'Moon',
    place: 'Lunar south pole',
    where: 'on the Moon',
    gravity: 0.17,
    fluidShift: fluidShiftFactor(0.17),
    radiationMSvDay: 1.37,
    radiationSourceId: 'RAD_MOON',
    about: "A sixth of Earth's gravity gives the bones some load back, but nothing shields the radiation.",
  },
  cruise: {
    id: 'cruise',
    days: 203,
    durationBasis:
      'The robotic Perseverance mission took 203 days to reach Mars. Its transit provides the time scale for this fictional crew.',
    durationSource: 'https://www.jpl.nasa.gov/news/press_kits/mars_2020/landing/mission/',
    name: 'Cruise to Mars',
    place: 'Deep space',
    where: 'on the way to Mars',
    gravity: 0,
    fluidShift: 1,
    radiationMSvDay: 1.8,
    radiationSourceId: 'RAD_RATE',
    about: "Months of weightlessness outside Earth's protection: the highest dose rate of the journey.",
  },
  mars: {
    id: 'mars',
    days: 500,
    durationBasis:
      'The 1997 NASA Mars reference mission studied a 500-day crew surface stay. Pulsar uses Earth days for this design scenario.',
    durationSource: 'https://ntrs.nasa.gov/citations/19990026747',
    name: 'Mars',
    place: 'Gale crater',
    where: 'on Mars',
    gravity: 0.38,
    fluidShift: fluidShiftFactor(0.38),
    radiationMSvDay: 0.67,
    radiationSourceId: 'RAD_MARS_SURFACE',
    about: "About a third of Earth's gravity, and the planet itself shields half the sky.",
  },
}

export const MISSION_ORDER: MissionId[] = ['orbit', 'moon', 'cruise', 'mars']

export const isMission = (value: unknown): value is MissionId =>
  typeof value === 'string' && value in MISSIONS

export function missionDay(id: MissionId, day: number) {
  return Number.isFinite(day) ? Math.min(MISSIONS[id].days, Math.max(1, Math.floor(day))) : 1
}
