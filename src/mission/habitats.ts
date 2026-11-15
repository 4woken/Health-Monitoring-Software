import type { MissionId } from './missions.ts'

/** Where a crew member lives on each destination: the picture behind the body and the exercise of the place. */
export type HabitatId = 'spacecraft' | 'station' | 'rover' | 'base' | 'planet'

interface Habitat {
  name: string
  /** Describes either the photographed place or the invented interior concept. */
  description: string
  kind: 'photograph' | 'generated'
  image: string
  credit: string
  sourceUrl: string
  imagePosition: string
}

export const HABITATS: Record<HabitatId, Habitat> = {
  spacecraft: {
    name: 'Spacecraft',
    description: 'Orion cabin mock-up, on Earth',
    kind: 'photograph',
    image: '/environments/nasa-orion.jpg',
    credit: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details/jsc2022e044969',
    imagePosition: '50% 50%',
  },
  station: {
    name: 'Space station',
    description: 'Destiny laboratory, aboard the ISS',
    kind: 'photograph',
    image: '/environments/nasa-destiny.jpg',
    credit: 'NASA',
    sourceUrl: 'https://images.nasa.gov/details/iss007e11800',
    imagePosition: '50% 50%',
  },
  rover: {
    name: 'Rover',
    description: 'Pressurised lunar rover, imagined interior',
    kind: 'generated',
    image: '/environments/concept-rover-v1.png',
    credit: 'Generated illustration based on NASA images',
    sourceUrl:
      'https://www.nasa.gov/software-robotics-and-simulation-division/robotic-systems-technology-branch/',
    imagePosition: '50% 50%',
  },
  base: {
    name: 'Moon base',
    description: 'Lunar habitat interior, imagined',
    kind: 'generated',
    image: '/environments/concept-moon-base-v1.png',
    credit: 'Generated illustration based on NASA images',
    sourceUrl: 'https://www.nasa.gov/image-article/deep-space-habitat-x-hab-loft/',
    imagePosition: '50% 50%',
  },
  planet: {
    name: 'Mars base',
    description: 'Mars habitat interior, imagined',
    kind: 'generated',
    image: '/environments/concept-mars-base-v1.png',
    credit: 'Generated illustration based on NASA images',
    sourceUrl: 'https://www.nasa.gov/human-systems-integration-division/',
    imagePosition: '50% 50%',
  },
}

/** The habitats of each destination, the usual one first: the station in orbit, the ship on the way
 * to Mars, a base or a rover on the Moon, a base on Mars. */
export const MISSION_HABITATS: Record<MissionId, HabitatId[]> = {
  orbit: ['station'],
  moon: ['base', 'rover'],
  cruise: ['spacecraft'],
  mars: ['planet'],
}

/** The habitat shown first for each destination. */
export const DEFAULT_HABITAT: Record<MissionId, HabitatId> = {
  orbit: MISSION_HABITATS.orbit[0],
  moon: MISSION_HABITATS.moon[0],
  cruise: MISSION_HABITATS.cruise[0],
  mars: MISSION_HABITATS.mars[0],
}
