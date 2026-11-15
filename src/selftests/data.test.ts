import { afterEach, describe, expect, it } from 'vitest'
import { TEAM } from '../crew/roster'
import { NASA_REQUIREMENTS } from '../health/exams'
import { dayReport, readingsFor } from '../health/readings'
import { assess, NO_SELF_TESTS, SIGNAL_IDS } from '../health/signals'
import { cabinOn, readingsOn } from '../health/simulation'
import { SELF_TESTS, testsFor, testsForCode, testsScheduledBy } from './catalog'
import { dueTests } from './due'
import { factsFrom, latestOn } from './facts'
import { SELF_TEST_IDS } from './ids'
import { clearResults, saveResult } from './results'
import { result } from './testing'

const member = TEAM[0]

describe('catalog', () => {
  it('describes every self-test with what NASA does and how to do it', () => {
    for (const id of SELF_TEST_IDS) {
      const t = SELF_TESTS[id]
      expect(t.id).toBe(id)
      expect(t.steps.length, id).toBeGreaterThan(0)
      expect(t.nasa.says.length, id).toBeGreaterThan(20)
      expect(t.adaptation.length, id).toBeGreaterThan(10)
      if (t.signal) expect(SIGNAL_IDS).toContain(t.signal)
    }
  })

  it('links NASA requirements to their at-home versions', () => {
    expect(testsForCode('MEDB 1.10')).toEqual(['vision'])
    expect(testsForCode('MEDB 5.1, 5.3')).toEqual(['balance', 'sitToStand'])
    expect(testsScheduledBy('MEDB 7.4')).toEqual(['cognition'])
    // Every scheduled code is a real requirement with flight days.
    for (const t of Object.values(SELF_TESTS))
      for (const code of t.nasa.due ?? [])
        expect(NASA_REQUIREMENTS.some((r) => r.code === code && r.task)).toBe(true)
    expect(testsFor('sleep')).toEqual(['reaction', 'cognition'])
    expect(testsFor('cabinAir')).toEqual(['cognition'])
  })
})

describe('facts for the signals', () => {
  it('keeps a result for its signal while it is fresh, and never before the day it was done', () => {
    const results = [result('reaction', 10, 290)]
    expect(latestOn(results, 'reaction', 9)).toBeUndefined()
    expect(latestOn(results, 'reaction', 13)).toBeDefined()
    expect(latestOn(results, 'reaction', 14)).toBeUndefined()
  })

  it('lets a flag fade after three days, but keeps a vision change until the next vision test', () => {
    const results = [
      result('cognition', 10, 40, 'watch', { nBack: 80 }),
      result('vision', 10, 0.4, 'watch', { amslerMarks: 2 }),
    ]
    expect(factsFrom(results, 12).alertness[0].level).toBe('watch')
    expect(factsFrom(results, 14).alertness[0].level).toBe('ok')
    expect(factsFrom(results, 30).vision?.changed).toBe(true)
    expect(factsFrom([...results, result('vision', 31, 0.1)], 31).vision?.changed).toBe(false)
  })

  it('counts camera sets on distinct days of the last week, and today’s camera pulse', () => {
    const results = [
      result('squats', 8, 20),
      result('squats', 8, 20),
      result('heelRaises', 10, 30),
      result('squats', 3, 20),
      result('restingPulse', 10, 66),
    ]
    const f = factsFrom(results, 10)
    expect(f.exerciseDays).toBe(2)
    expect(f.measuredPulseBpm).toBe(66)
    expect(factsFrom(results, 11).measuredPulseBpm).toBeNull()
  })

  it('notices two flagged runs in a row', () => {
    const results = [result('balance', 5, 80, 'watch'), result('balance', 6, 82, 'watch')]
    expect(factsFrom(results, 6).repeatedFlag).toBe(true)
    expect(factsFrom(results.slice(0, 1), 5).repeatedFlag).toBe(false)
  })
})

describe('signals from self-tests', () => {
  const r = readingsOn(member, 20, 'orbit')
  const cabin = cabinOn(20, 'orbit')
  const of = (facts: typeof NO_SELF_TESTS, id: string) =>
    assess(r, member.baseline, cabin, facts).find((s) => s.id === id)!

  it('adds a balance signal that waits for a test', () => {
    const balance = of(NO_SELF_TESTS, 'balance')
    expect(balance.value).toBe('No self-test yet')
    expect(balance.level).toBe('ok')
  })

  it('raises sleep and alertness on a reaction test worse than usual', () => {
    const facts = {
      ...NO_SELF_TESTS,
      alertness: [{ level: 'watch' as const, text: 'reaction test 340 ms (today)', ageDays: 0 }],
    }
    const sleep = of(facts, 'sleep')
    expect(sleep.title).toBe('Sleep and alertness')
    expect(sleep.level).toBe('watch')
    expect(sleep.value).toMatch(/reaction test 340 ms/)
    expect(sleep.advice).toMatch(/24 hours/)
    expect(sleep.sources).toContain('SELF_TEST')
  })

  it('says to tell the flight surgeon when a vision test found a change', () => {
    const facts = {
      ...NO_SELF_TESTS,
      vision: { level: 'watch' as const, text: 'vision test 0.40 logMAR (today)', ageDays: 0, changed: true },
    }
    const eyes = assess({ ...r, visionChange: true }, member.baseline, cabin, facts).find(
      (s) => s.id === 'opticNerve',
    )!
    expect(eyes.level).toBe('watch')
    expect(eyes.advice).toMatch(/flight surgeon/)
  })

  it('names camera sets in the loading signal', () => {
    const loading = of({ ...NO_SELF_TESTS, exerciseDays: 2 }, 'loading')
    expect(loading.value).toMatch(/2 of them counted by the camera/)
  })
})

describe('readings with saved self-tests', () => {
  afterEach(() => clearResults(member.id))

  it('uses today’s camera pulse and counts camera sets as resistance sessions', () => {
    const before = readingsFor(member, 40, 'orbit')
    saveResult({ ...result('restingPulse', 40, 81), memberId: member.id, at: Date.now() })
    saveResult({ ...result('squats', 40, 20), memberId: member.id, at: Date.now() + 1 })
    const after = readingsFor(member, 40, 'orbit')
    expect(after.restingPulseBpm).toBe(81)
    expect(after.resistanceSessions).toBe(Math.min(7, before.resistanceSessions + 1))
    expect(readingsFor(member, 41, 'orbit').restingPulseBpm).not.toBe(81)
    const report = dayReport(member, 40, 'orbit')
    expect(report.signals.find((s) => s.id === 'oxygen')!.value).toMatch(/camera self-test today/)
  })

  it('dates the balance signal by the latest balance or hand test', () => {
    expect(dayReport(member, 40, 'orbit').freshness.balance.never).toBe(true)
    saveResult({ ...result('dexterity', 38, 25), memberId: member.id, at: Date.now() })
    const f = dayReport(member, 40, 'orbit').freshness.balance
    expect(f.never).toBeUndefined()
    expect(f.ageDays).toBe(2)
  })
})

describe('what is due today', () => {
  afterEach(() => clearResults(member.id))
  const due = (
    day: number,
    mission: 'orbit' | 'moon' | 'mars',
    results = [] as ReturnType<typeof result>[],
  ) => dueTests(dayReport(member, day, mission), mission, results)

  it('follows NASA’s flight days', () => {
    expect(due(30, 'orbit').map((d) => d.test)).toEqual(expect.arrayContaining(['vision', 'cognition']))
    expect(due(21, 'orbit').map((d) => d.test)).toContain('hearing')
    expect(due(14, 'orbit').map((d) => d.test)).toEqual(
      expect.arrayContaining(['pulseRecovery', 'restingPulse']),
    )
  })

  it('asks for balance and standing up in the first week on the Moon, and hand control everywhere', () => {
    const moon = due(3, 'moon').map((d) => d.test)
    expect(moon).toEqual(expect.arrayContaining(['balance', 'sitToStand', 'dexterity']))
    const orbit = due(3, 'orbit').map((d) => d.test)
    expect(orbit).toContain('dexterity')
    expect(orbit).not.toContain('balance')
    // The Moon scenario lasts three days, all of them in the first week; Mars lasts 500.
    expect(due(9, 'mars').map((d) => d.test)).not.toContain('balance')
  })

  it('repeats a flagged run within 24 hours, and shows the repeat as done', () => {
    const flagged = result('reaction', 33, 360, 'watch')
    const yesterday = due(34, 'orbit', [flagged]).find((d) => d.test === 'reaction')
    expect(yesterday?.cause).toBe('repeat')
    expect(yesterday?.done).toBe(false)
    expect(
      due(36, 'orbit', [flagged]).find((d) => d.test === 'reaction' && d.cause === 'repeat'),
    ).toBeUndefined()
    const repeated = due(34, 'orbit', [flagged, result('reaction', 34, 300)]).find(
      (d) => d.test === 'reaction',
    )
    expect(repeated?.done).toBe(true)
  })

  it('marks a test done once it has a result on the day', () => {
    const vision = due(30, 'orbit', [result('vision', 30, 0.1)]).find((d) => d.test === 'vision')
    expect(vision?.done).toBe(true)
  })
})
