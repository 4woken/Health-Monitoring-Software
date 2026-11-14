import { expect, it } from 'vitest'
import { firstRound, reactionResult, reactionRound } from './ReactionExercise'

it('restarts the wait after an anticipation and rejects the old cue', () => {
  const started = reactionRound(firstRound, { type: 'start' })
  const early = reactionRound(started, { type: 'early' })
  expect(early).toMatchObject({ phase: 'waiting', times: [], anticipations: 1 })
  expect(reactionRound(early, { type: 'light', attempt: started.attempt })).toBe(early)
  const lit = reactionRound(early, { type: 'light', attempt: early.attempt })
  expect(lit.phase).toBe('lit')
  expect(reactionRound(lit, { type: 'hit', elapsed: -1, target: 3 })).toBe(lit)
})

it('preserves completed signals through a pause and starts a fresh cue on resume', () => {
  const input = { ...firstRound, phase: 'lit' as const, times: [550], attempt: 2 }
  const paused = reactionRound(input, { type: 'pause' })
  expect(reactionRound(paused, { type: 'hit', elapsed: 7000, target: 3 })).toBe(paused)
  const resumed = reactionRound(paused, { type: 'start' })
  expect(resumed).toMatchObject({ phase: 'waiting', times: [550], attempt: 3 })
  expect(reactionRound(resumed, { type: 'light', attempt: 2 })).toBe(resumed)
})

it('completes only after the target number of valid responses and reports a rounded median', () => {
  const lit = { ...firstRound, phase: 'lit' as const, times: [900, 200, 400], anticipations: 2 }
  const ended = reactionRound(lit, { type: 'hit', elapsed: 299.8, target: 4 })
  expect(ended.phase).toBe('finished')
  expect(reactionResult(ended)).toEqual({ medianMs: 350, anticipations: 2 })
  expect(reactionRound(ended, { type: 'hit', elapsed: 100, target: 4 })).toBe(ended)
  expect(reactionRound(ended, { type: 'early' })).toBe(ended)
})
