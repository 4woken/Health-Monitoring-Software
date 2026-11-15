// What a person's self-tests say on one mission day, in the shape the signals read. A result speaks
// for its signal from the day it was done for as long as it stays fresh; a test done on day 40 is
// not shown on day 30.

import { NO_SELF_TESTS, type SelfTestFacts, type SelfTestNote } from '../health/signals'
import { SELF_TESTS } from './catalog'
import type { SelfTestId } from './ids'
import { resultsOf, resultsVersion, type TestResult } from './results'

/** Mission days a result keeps speaking for its signal. */
export const FRESH_DAYS: Record<SelfTestId, number> = {
  reaction: 3,
  cognition: 30,
  vision: 30,
  hearing: 120,
  balance: 14,
  sitToStand: 14,
  dexterity: 14,
  pulseRecovery: 30,
  restingPulse: 0,
  breathingRate: 0,
  squats: 6,
  heelRaises: 6,
  breathing: 0,
}

/** The latest result of a test done on or before this day and still fresh. */
export function latestOn(results: TestResult[], test: SelfTestId, day: number): TestResult | undefined {
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i]
    if (r.test === test && r.day <= day && day - r.day <= FRESH_DAYS[test]) return r
  }
  return undefined
}

const when = (ageDays: number) =>
  ageDays === 0 ? 'today' : ageDays === 1 ? 'yesterday' : `${ageDays} days ago`

/** Days a flagged result keeps its level; after that it stays as information until a new run. */
const FLAG_DAYS = 3

export function noteOf(r: TestResult, day: number, flagDays = FLAG_DAYS): SelfTestNote {
  const ageDays = day - r.day
  return {
    level: ageDays <= flagDays ? r.level : 'ok',
    text: `${SELF_TESTS[r.test].describe(r)} (${when(ageDays)})`,
    ageDays,
  }
}

/** True when the last two runs of a test, on or before this day, were both flagged, a day apart at most. */
export function flaggedTwice(results: TestResult[], test: SelfTestId, day: number): boolean {
  const runs = results.filter((r) => r.test === test && r.day <= day)
  const [a, b] = runs.slice(-2)
  return !!a && !!b && a.level !== 'ok' && b.level !== 'ok' && b.day - a.day <= 1 && day - b.day <= 1
}

export function factsFrom(results: TestResult[], day: number): SelfTestFacts {
  if (!results.length) return NO_SELF_TESTS
  const notes = (tests: SelfTestId[]) =>
    tests.flatMap((t) => {
      const r = latestOn(results, t, day)
      return r ? [noteOf(r, day)] : []
    })
  const vision = latestOn(results, 'vision', day)
  const pulse = results.filter((r) => r.test === 'restingPulse' && r.day === day).pop()
  const exerciseDays = new Set(
    results
      .filter((r) => (r.test === 'squats' || r.test === 'heelRaises') && r.day <= day && r.day > day - 7)
      .map((r) => r.day),
  ).size
  const judged: SelfTestId[] = [
    'reaction',
    'cognition',
    'balance',
    'dexterity',
    'sitToStand',
    'pulseRecovery',
    'vision',
  ]
  return {
    alertness: notes(['reaction', 'cognition']),
    // A vision change stays until a new vision test says otherwise.
    vision: vision ? { ...noteOf(vision, day, Infinity), changed: vision.level !== 'ok' } : null,
    balance: notes(['balance', 'dexterity']),
    legs: notes(['sitToStand']),
    heart: notes(['pulseRecovery', 'restingPulse', 'breathingRate']),
    calm: notes(['breathing']),
    measuredPulseBpm: pulse ? Math.round(pulse.score) : null,
    exerciseDays,
    repeatedFlag: judged.some((t) => flaggedTwice(results, t, day)),
  }
}

const cache = new Map<string, SelfTestFacts>()

/** The facts for one person and day, from the results kept in this browser. */
export function testFacts(memberId: string, day: number): SelfTestFacts {
  const key = `${memberId}:${day}:${resultsVersion()}`
  let facts = cache.get(key)
  if (!facts) {
    if (cache.size > 2000) cache.clear()
    facts = factsFrom(resultsOf(memberId), day)
    cache.set(key, facts)
  }
  return facts
}
