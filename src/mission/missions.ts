// Destinations. Each one sets the gravity and the radiation the body lives with. The picture
// behind the body is chosen separately (habitats.ts).

import { fluidShiftFactor } from './physiology'

export type MissionId = 'orbit' | 'moon' | 'cruise' | 'mars'

export interface Mission {
  id: MissionId
  name: string
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
