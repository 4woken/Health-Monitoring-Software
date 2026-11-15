import { expect, it } from 'vitest'
import { CREW_DEPTH, FIRST_DEPTH, LAST_DEPTH } from '../anatomy/organs'
import { effectiveDepth } from './crewView'

it('shows crew wear during rowing and returns to the selected depth afterwards', () => {
  for (let selected = FIRST_DEPTH; selected <= LAST_DEPTH; selected++) {
    expect(effectiveDepth(selected, false, 'row', false)).toBe(CREW_DEPTH)
    expect(effectiveDepth(selected, true, 'row', true)).toBe(CREW_DEPTH)
    expect(effectiveDepth(selected, false, null, false)).toBe(selected)
  }
})

it('can inspect skin for physiology and preserve an internal layer during other exercises', () => {
  expect(effectiveDepth(CREW_DEPTH, true, null, false)).toBe(0)
  expect(effectiveDepth(FIRST_DEPTH, false, 'step', false)).toBe(CREW_DEPTH)
  expect(effectiveDepth(2, false, 'step', false)).toBe(2)
  expect(effectiveDepth(2, false, 'step', true)).toBe(0)
})
