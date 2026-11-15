import { expect, it } from 'vitest'
import { DEFAULT_HABITAT, HABITATS, MISSION_HABITATS, type HabitatId } from './habitats'
import { MISSION_ORDER } from './missions'

it('gives every destination its own habitats, the usual one first', () => {
  for (const mission of MISSION_ORDER) {
    expect(MISSION_HABITATS[mission].length).toBeGreaterThan(0)
    expect(DEFAULT_HABITAT[mission]).toBe(MISSION_HABITATS[mission][0])
  }
  const used = new Set(MISSION_ORDER.flatMap((m) => MISSION_HABITATS[m]))
  expect([...used].sort()).toEqual((Object.keys(HABITATS) as HabitatId[]).sort())
  expect(MISSION_HABITATS.orbit).toEqual(['station'])
  expect(MISSION_HABITATS.cruise).toEqual(['spacecraft'])
  expect(MISSION_HABITATS.moon).toContain('rover')
})
