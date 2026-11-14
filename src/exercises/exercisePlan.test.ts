import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BREATHING_SECONDS,
  clearExerciseHistory,
  getReportedStress,
  setReportedStress,
  completedToday,
  loadExerciseHistory,
  rateExerciseResult,
  recordStressChange,
  recommendExercises,
  saveExerciseResult,
  type ExerciseCheckIn,
  type ExerciseHistory,
} from './exercisePlan'

const checkIn: ExerciseCheckIn = {
  energy: 'usual',
  shortSleep: false,
  longSitting: false,
  wantsDexterity: false,
  wantsMobility: false,
  onEarth: false,
  unwell: false,
}
const now = new Date(2026, 10, 14, 9)
const yesterday = new Date(2026, 10, 13, 19).getTime()
beforeEach(() => vi.stubGlobal('localStorage', undefined))
afterEach(() => {
  clearExerciseHistory('A')
  clearExerciseHistory('B')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('personal exercise suggestions', () => {
  const all: ExerciseCheckIn = {
    ...checkIn,
    energy: 'low',
    shortSleep: true,
    longSitting: true,
    onEarth: true,
  }
  it('gives each matching exercise a reason from the check-in, and no suggestion when nothing matches', () => {
    expect(recommendExercises(checkIn, {})).toEqual([])
    expect(recommendExercises(all, {}).map((r) => [r.kind, r.target])).toEqual([
      ['reaction', 5],
      ['assembly', 3],
      ['knee', 3],
    ])
    for (const item of recommendExercises(all, {})) expect(item.reason).toMatch(/reported/)
    const preferences = recommendExercises(
      { ...checkIn, onEarth: true, wantsMobility: true, wantsDexterity: true },
      {},
    )
    expect(preferences.map((r) => r.kind)).toEqual(['assembly', 'knee'])
  })
  it('gates the seated leg exercise on the real setting and excludes missions when feeling unwell', () => {
    expect(recommendExercises({ ...all, onEarth: false }, {}).map((r) => r.kind)).toEqual([
      'reaction',
      'assembly',
    ])
    expect(recommendExercises({ ...all, unwell: true }, {})).toEqual([])
  })
  it('offers the one-minute break only for an explicit report of current stress', () => {
    const reported: ExerciseCheckIn = { ...checkIn, stress: 'some' }
    expect(recommendExercises(reported, {}, now)).toEqual([
      { kind: 'breathing', target: 60, reason: 'You reported feeling stressed right now.' },
    ])
    expect(recommendExercises({ ...checkIn, stress: 'high' }, {}, now)[0]?.kind).toEqual('breathing')
    expect(recommendExercises({ ...all, stress: 'high', unwell: true }, {}, now)).toEqual([])
    for (const stress of [undefined, 'none'] as const) {
      const suggestions = recommendExercises({ ...all, stress }, {}, now)
      expect(suggestions.some((r) => r.kind === 'breathing')).toBe(false)
    }
  })
  it('recommends a mission once each local day, and adapts the next target to the previous difficulty', () => {
    const history: ExerciseHistory = {
      assembly: { kind: 'assembly', target: 3, completedAt: yesterday, rating: 'easy' },
    }
    const findTarget = () => recommendExercises(all, history, now).find((r) => r.kind === 'assembly')?.target
    expect(findTarget()).toBe(4)
    history.assembly!.rating = 'hard'
    expect(findTarget()).toBe(2)
    history.assembly!.rating = 'right'
    expect(findTarget()).toBe(3)
    history.assembly!.completedAt = now.getTime()
    expect(findTarget()).toBeUndefined()
    expect(completedToday(history.assembly, new Date(2026, 10, 15, 0, 1))).toBe(false)
  })
  it('caps dose when energy is low, never inferring exertion or progress from reaction speed', () => {
    const history: ExerciseHistory = {
      knee: { kind: 'knee', completedAt: yesterday, target: 6, rating: 'easy' },
      reaction: { kind: 'reaction', completedAt: yesterday, target: 5, medianMs: 720, rating: 'hard' },
    }
    expect(recommendExercises(all, history, now).map((r) => r.target)).toEqual([5, 3, 3])
  })
})

function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v),
    removeItem: (k: string) => values.delete(k),
  })
  return values
}

describe('stress reports for this tab and local day', () => {
  it('keeps the latest explicit answer per member, and Skip clears the report', () => {
    const values = storage()
    setReportedStress('A', 'some', now)
    setReportedStress('B', 'none', now)
    setReportedStress('A', 'high', now)
    expect(getReportedStress('A', now)).toBe('high')
    expect(getReportedStress('B', now)).toBe('none')
    setReportedStress('A', undefined, now)
    expect(getReportedStress('A', now)).toBeUndefined()
    expect(getReportedStress('B', now)).toBe('none')
    expect(values.size).toBe(0)
    clearExerciseHistory('B')
    expect(getReportedStress('B', now)).toBeUndefined()
  })
  it('expires at the next local calendar day and keeps reports out of saved exercise results', () => {
    const values = storage()
    const beforeMidnight = new Date(2026, 10, 14, 23, 59)
    setReportedStress('A', 'high', beforeMidnight)
    saveExerciseResult('A', { kind: 'breathing', target: 60 }, true)
    expect([...values.values()]).toHaveLength(1)
    expect(JSON.parse([...values.values()][0])).toEqual({
      kind: 'breathing',
      target: 60,
      completedAt: expect.any(Number),
    })
    expect(getReportedStress('A', new Date(2026, 10, 15, 0, 0))).toBeUndefined()
    expect(getReportedStress('A', beforeMidnight)).toBeUndefined()
  })
})

describe('per-person exercise history', () => {
  it('keeps each activity’s latest completion, with separate storage consent across activities and people', () => {
    const values = storage()
    const a = saveExerciseResult(
      'A',
      { kind: 'assembly', target: 3, stressChange: 'higher' },
      false,
    ).assembly!
    saveExerciseResult('A', { kind: 'reaction', target: 5, medianMs: 321, anticipations: 1 }, true)
    saveExerciseResult('B', { kind: 'knee', target: 3 }, true)
    expect(values.size).toBe(2)
    expect(loadExerciseHistory('A').reaction?.medianMs).toBe(321)
    expect(a.stressChange).toBeUndefined()
    expect(loadExerciseHistory('B').assembly).toBeUndefined()
    rateExerciseResult('A', 'assembly', a.completedAt, 'hard')
    expect(JSON.stringify([...values.values()])).not.toContain('assembly')
    clearExerciseHistory('A')
    expect(loadExerciseHistory('A')).toEqual({})
    expect(loadExerciseHistory('B').knee?.target).toBe(3)
    expect(values.size).toBe(1)
  })
  it('respects the breathing completion, stress feedback and consent of the current member only', () => {
    const values = storage()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const reported: ExerciseCheckIn = { ...checkIn, stress: 'some' }
    const session = { kind: 'breathing', target: BREATHING_SECONDS } as const
    const latest = saveExerciseResult('A', session, false).breathing!
    recordStressChange('A', latest.completedAt, 'same')
    expect(values.size).toBe(0)
    expect(recommendExercises(reported, loadExerciseHistory('A'), now)).toEqual([])
    expect(recommendExercises(reported, loadExerciseHistory('B'), now)[0]?.kind).toBe('breathing')
    vi.setSystemTime(new Date(2026, 10, 15))
    expect(recommendExercises(reported, loadExerciseHistory('A'))[0]?.target).toBe(60)
    expect(saveExerciseResult('B', { ...session, target: 59 }, true)).toEqual({})
    const other = saveExerciseResult('B', session, true).breathing!
    expect(recordStressChange('B', latest.completedAt, 'higher').breathing?.stressChange).toBeUndefined()
    recordStressChange('B', other.completedAt, 'lower')
    expect(JSON.parse([...values.values()][0]).stressChange).toBe('lower')
    expect(loadExerciseHistory('A').breathing?.stressChange).toBe('same')
    expect(values.size).toBe(1)
    clearExerciseHistory('B')
    expect(values.size).toBe(0)
    expect(loadExerciseHistory('A').breathing?.stressChange).toBe('same')
  })
  it('applies delayed ratings to that same session only and preserves persistence and measured score', () => {
    const values = storage()
    vi.useFakeTimers()
    vi.setSystemTime(now)
    const earlier = saveExerciseResult('A', { kind: 'reaction', target: 5, medianMs: 310 }, true).reaction!
    vi.advanceTimersByTime(10000)
    const newer = saveExerciseResult('A', { kind: 'reaction', target: 5, medianMs: 370 }, true).reaction!
    expect(rateExerciseResult('A', 'reaction', earlier.completedAt, 'easy').reaction?.rating).toBeUndefined()
    expect(rateExerciseResult('A', 'reaction', newer.completedAt, 'right').reaction).toEqual({
      ...newer,
      rating: 'right',
    })
    expect([...values.values()][0]).toContain('"rating":"right"')
    saveExerciseResult('A', { kind: 'reaction', target: 5, medianMs: 280 }, false)
    expect(values.size).toBe(0)
  })
  it('ignores corrupt entries and still records feedback with storage disabled', () => {
    const values = storage()
    saveExerciseResult('A', { kind: 'knee', target: 3 }, true)
    const key = [...values.keys()][0]
    values.set(key, '<broken>')
    expect(loadExerciseHistory('A').knee).toBeUndefined()
    values.set(key, JSON.stringify({ kind: 'knee', target: 900, completedAt: 123 }))
    expect(loadExerciseHistory('A').knee).toBeUndefined()
    vi.stubGlobal('localStorage', undefined)
    const result = saveExerciseResult('A', { kind: 'assembly', target: 3 }, true).assembly!
    expect(rateExerciseResult('A', 'assembly', result.completedAt, 'easy').assembly?.rating).toBe('easy')
  })
})
