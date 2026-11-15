import { expect, it } from 'vitest'
import { EXERCISES, TESTS } from './catalog'
import { TEST_GROUPS } from './groups'

it('lists every test and exercise once', () => {
  const listed = TEST_GROUPS.flatMap((g) => g.tests)
  expect(new Set(listed).size).toBe(listed.length)
  expect([...listed].sort()).toEqual([...TESTS, ...EXERCISES].sort())
})
