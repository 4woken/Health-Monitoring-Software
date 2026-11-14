import type { HabitatId } from '../mission/habitats'

export type ExerciseMotion = 'cycle' | 'row' | 'ankle' | 'step' | 'march'

const ascr = {
  label: 'NASA · Astronaut Strength, Conditioning and Rehabilitation',
  url: 'https://www.nasa.gov/directorates/esdmd/hhp/astronaut-strength-conditioning-and-rehabilitation/',
}
const orion = { label: 'NASA · Orion crew systems', url: 'https://www.nasa.gov/reference/crew-systems/' }
const ecl = {
  label: 'NASA · Exercise Countermeasures Lab',
  url: 'https://www.nasa.gov/glenn/glenn-expertise-space-exploration/human-health-performance/advanced-exercise-concepts/exercise-countermeasures-lab/',
}

export const ENVIRONMENT_EXERCISES = {
  cycle: {
    title: 'Station cycle',
    movement:
      'Watch the legs alternate on a cycle ergometer. The pedals provide resistance in weightlessness.',
    source: ascr,
  },
  row: {
    title: 'Spacecraft rowing',
    movement:
      'Watch the knees and elbows bend through a rowing stroke. Orion’s flywheel provides resistance in a compact cabin.',
    source: orion,
  },
  ankle: {
    title: 'Seated ankle mobility',
    movement:
      'With knees bent, the avatar flexes and points its ankles. This Pulsar example uses little legroom.',
    source: ecl,
  },
  step: {
    title: 'Low-gravity stepping',
    movement:
      'The avatar shifts its weight and lifts one foot at a time. This Pulsar example illustrates movement under lunar-like gravity.',
    source: ecl,
  },
  march: {
    title: 'Surface walking',
    movement:
      'The avatar takes alternating steps with a natural arm swing. This Pulsar example illustrates walking with gravity underfoot.',
    source: ecl,
  },
} as const satisfies Record<
  ExerciseMotion,
  { title: string; movement: string; source: { label: string; url: string } }
>

export function environmentMotion(habitat: HabitatId, gravity: number): ExerciseMotion {
  if (habitat === 'rover') return 'ankle'
  if (gravity < 0.05) {
    if (habitat === 'station') return 'cycle'
    if (habitat === 'spacecraft') return 'row'
    return 'ankle'
  }
  return gravity < 0.26 ? 'step' : 'march'
}
