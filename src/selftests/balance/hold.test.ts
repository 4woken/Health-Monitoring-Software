import { expect, it } from 'vitest'
import { standing } from '../testing'
import { CONDITIONS, holdTracker, type ConditionId, type Frame } from './balance'

function checkHold(id: ConditionId, pose: (ms: number) => Partial<Frame>) {
  const condition = CONDITIONS.find((c) => c.id === id)!
  const tracker = holdTracker(condition, 0)
  for (let ms = 0; ms <= condition.seconds * 1000; ms += 100) {
    const { done } = tracker.update({
      now: ms,
      aspect: 4 / 3,
      body: standing(),
      eyesClosed: true,
      ...pose(ms),
    })
    if (done) return done
  }
}

it('retries unobservable eyes and tolerates a brief face dropout', () => {
  expect(checkHold('togetherClosed', () => ({ eyesClosed: null }))).toMatchObject({
    completed: false,
    interrupted: true,
  })
  expect(
    checkHold('togetherClosed', (ms) => ({ eyesClosed: ms >= 2000 && ms < 2400 ? null : true })),
  ).toMatchObject({ completed: true })
})

it('requires observed head movement for the nodding stance', () => {
  expect(checkHold('nod', () => ({}))).toMatchObject({ completed: false, interrupted: true })
  const hold = checkHold('nod', (ms) => ({
    body: standing({ 0: { y: 0.16 + 0.018 * Math.sin((ms * 2 * Math.PI) / 1000) } }),
  }))
  expect(hold?.completed).toBe(true)
  expect(hold?.nods).toBeGreaterThan(10)
})

it('keeps sway at zero when only the estimated hip height fluctuates', () => {
  const hold = checkHold('together', (ms) => {
    const y = 0.51 + 0.006 * Math.sin(ms / 300)
    return { body: standing({ 23: { y }, 24: { y } }) }
  })
  expect(hold?.swayCm).toBe(0)
})
