// Which self-tests to do today, and why. Four kinds of reason, each traceable to a rule:
// - NASA's in-flight schedule (health/exams.ts): the vision, cognitive, hearing and cycle tests fall
//   on set flight days, and their at-home version is due the same day;
// - a signal that needs attention: short sleep calls for the reaction test, high CO2 or a headache
//   for the thinking test, an optic nerve change for the vision test, missed sessions for squats;
// - the mission: the first week after a change of gravity, when NASA tests balance and hand control;
// - a result to repeat: a run worse than usual is repeated within 24 hours, as NASA does after a red
//   cognitive test (MEDB 7.4). After two flagged runs in a row, the signal says to tell the flight
//   surgeon instead.

import { dueOn } from '../health/exams'
import type { DayReport } from '../health/readings'
import type { SignalId } from '../health/signals'
import { MISSIONS, type MissionId } from '../mission/missions'
import { testsScheduledBy } from './catalog'
import { SELF_TEST_IDS, type SelfTestId } from './ids'
import type { TestResult } from './results'

export type DueCause = 'repeat' | 'nasa' | 'signal' | 'mission'

export const CAUSE_LABEL: Record<DueCause, string> = {
  repeat: 'Repeat',
  nasa: 'NASA schedule',
  signal: 'From your signals',
  mission: 'This mission',
}

export interface DueTest {
  test: SelfTestId
  cause: DueCause
  /** Why today, in one sentence. */
  reason: string
  /** Done on this mission day (for a repeat: done again since the flagged run). */
  done: boolean
}

/** The week after a change of gravity: arriving in orbit, on the Moon or on Mars. */
const ADAPTATION_DAYS = 7

/** Tests the signals call for, with the reason. */
const FROM_SIGNAL: { signal: SignalId; test: SelfTestId; reason: (value: string) => string }[] = [
  {
    signal: 'sleep',
    test: 'reaction',
    reason: (v) => `Short sleep this week (${v.split(';')[0]}). The reaction test shows how alert you are.`,
  },
  {
    signal: 'headache',
    test: 'cognition',
    reason: () => 'You reported a headache. NASA gives the cognitive test after high CO2 (MEDB 7.4).',
  },
  {
    signal: 'cabinAir',
    test: 'cognition',
    reason: () => 'Cabin CO2 is above the limit. NASA gives the cognitive test after high CO2 (MEDB 7.4).',
  },
  {
    signal: 'opticNerve',
    test: 'vision',
    reason: () => 'The optic nerve signal changed. Test your vision today.',
  },
  {
    signal: 'loading',
    test: 'squats',
    reason: () => 'Too few resistance sessions this week. A camera-counted set counts as one.',
  },
  {
    signal: 'mood',
    test: 'breathing',
    reason: () => 'A week of low mood. A breathing break helps some people unwind.',
  },
  {
    signal: 'oxygen',
    test: 'restingPulse',
    reason: () => 'Your pulse or oxygen is outside the usual range. Measure again at rest.',
  },
]

export function dueTests(report: DayReport, mission: MissionId, results: TestResult[]): DueTest[] {
  const day = report.day
  const out = new Map<SelfTestId, DueTest>()
  const doneOn = (test: SelfTestId) => results.some((r) => r.test === test && r.day === day)
  const add = (test: SelfTestId, cause: DueCause, reason: string) => {
    if (!out.has(test)) out.set(test, { test, cause, reason, done: doneOn(test) })
  }

  // A run worse than usual, today or yesterday: repeat it within 24 hours. A repeat done today
  // shows as done, even when it was flagged again (the signal then says to tell the flight surgeon).
  for (const test of SELF_TEST_IDS) {
    const runs = results.filter((r) => r.test === test && r.day <= day)
    const last = runs[runs.length - 1]
    const prev = runs[runs.length - 2]
    if (!last) continue
    if (prev && prev.level !== 'ok' && last.day === day && last.day - prev.day <= 1)
      out.set(test, {
        test,
        cause: 'repeat',
        reason: 'The repeat of a run worse than your usual, within 24 hours.',
        done: true,
      })
    else if (last.level !== 'ok' && day - last.day <= 1)
      out.set(test, {
        test,
        cause: 'repeat',
        reason: `${last.day === day ? 'Today' : 'Yesterday'}'s run was worse than your usual. NASA repeats a flagged test within 24 hours.`,
        done: false,
      })
  }

  // NASA's tasks of the day that have an at-home version.
  for (const r of dueOn(day))
    for (const test of testsScheduledBy(r.code))
      add(test, 'nasa', `NASA's ${r.name.toLowerCase()} (${r.code}) falls on flight day ${day}.`)

  // Signals that need attention.
  for (const rule of FROM_SIGNAL) {
    const s = report.signals.find((x) => x.id === rule.signal)
    if (s && s.level !== 'ok') add(rule.test, 'signal', rule.reason(s.value))
  }

  // The week after a change of gravity.
  if (day <= ADAPTATION_DAYS) {
    const g = MISSIONS[mission].gravity
    if (g > 0) {
      add(
        'balance',
        'mission',
        `Day ${day} after landing at ${g} g. Balance takes days to readapt; NASA tests it after landing.`,
      )
      add(
        'sitToStand',
        'mission',
        `Day ${day} after landing. NASA times standing up from a seat right after landing.`,
      )
    }
    add(
      'dexterity',
      'mission',
      `Day ${day} after a change of gravity. Fine hand control drops in the first week, then recovers.`,
    )
  }
  return [...out.values()]
}
