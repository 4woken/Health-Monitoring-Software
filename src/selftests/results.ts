// Self-test results, kept in this browser for each crew member. A result is what one test gave on
// one mission day, with how it compares with the person's usual result. The first runs of each test
// set that usual result, like the baseline sessions NASA records before flight.
//
// Privacy: only the numbers shown to the person are stored, never an image, a sound or a landmark.

import { useSyncExternalStore } from 'react'
import type { Level } from '../health/signals'
import { isMission, type MissionId } from '../mission/missions'
import { isSelfTest, type SelfTestId } from './ids'

export type Detail = number | string | boolean | null

export interface TestResult {
  id: string
  test: SelfTestId
  memberId: string
  mission: MissionId
  /** Mission day it was done on. */
  day: number
  /** Wall-clock time, ms since 1970. */
  at: number
  /** The main number, in the test's unit. */
  score: number
  /** The other numbers of the run: each eye, each stance, each pulse reading. */
  details: Record<string, Detail>
  level: Level
  /** What the result means, in one sentence. */
  note: string
  /** The person's usual score when this one was judged; absent while it is being set. */
  usual?: number
}

/** Runs that set the usual result, as NASA records three baseline sessions of its cognitive test. */
export const BASELINE_RUNS = 3
/** Results kept per person; the oldest go first. */
const KEEP = 400

const keyFor = (memberId: string) => `pulsar.selftests.v1.${memberId}`
const cache = new Map<string, TestResult[]>()
const listeners = new Set<() => void>()
let version = 0

function valid(value: unknown, memberId: string): value is TestResult {
  if (!value || typeof value !== 'object') return false
  const r = value as Partial<TestResult>
  return (
    typeof r.id === 'string' &&
    isSelfTest(r.test) &&
    r.memberId === memberId &&
    isMission(r.mission) &&
    Number.isInteger(r.day) &&
    typeof r.at === 'number' &&
    Number.isFinite(r.at) &&
    typeof r.score === 'number' &&
    Number.isFinite(r.score) &&
    (r.level === 'ok' || r.level === 'watch' || r.level === 'act') &&
    typeof r.note === 'string' &&
    !!r.details &&
    typeof r.details === 'object'
  )
}

function read(memberId: string): TestResult[] {
  let list = cache.get(memberId)
  if (list) return list
  list = []
  try {
    const raw = JSON.parse(localStorage.getItem(keyFor(memberId)) ?? '[]') as unknown
    if (Array.isArray(raw)) list = raw.filter((r) => valid(r, memberId)).sort((a, b) => a.at - b.at)
  } catch {
    // No storage in this browsing mode, or a damaged entry: start empty.
  }
  cache.set(memberId, list)
  return list
}

function write(memberId: string, list: TestResult[]) {
  const kept = list.slice(-KEEP)
  cache.set(memberId, kept)
  version++
  try {
    if (kept.length) localStorage.setItem(keyFor(memberId), JSON.stringify(kept))
    else localStorage.removeItem(keyFor(memberId))
  } catch {
    // Storage is off: the results last until the page reloads.
  }
  for (const l of listeners) l()
}

/** Every result of one person, oldest first. */
export const resultsOf = (memberId: string): TestResult[] => read(memberId)

/** One test's results for one person, oldest first. */
export const resultsFor = (memberId: string, test: SelfTestId): TestResult[] =>
  read(memberId).filter((r) => r.test === test)

export function saveResult(result: Omit<TestResult, 'id'>): TestResult {
  const saved: TestResult = {
    ...result,
    id: `${result.at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  }
  write(result.memberId, [...read(result.memberId), saved])
  return saved
}

export function clearResults(memberId: string): void {
  write(memberId, [])
}

export const resultsVersion = () => version

export function subscribeResults(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** One person's results, kept up to date when a test is saved anywhere in the app. */
export function useResults(memberId: string): TestResult[] {
  return useSyncExternalStore(subscribeResults, () => read(memberId))
}

/** Changes whenever a result is saved or cleared, for values computed from the results. */
export const useResultsVersion = () => useSyncExternalStore(subscribeResults, resultsVersion)

/** The median of a list of numbers; NaN for an empty list. */
export function median(values: number[]): number {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** How far the usual result is set: the runs done so far, and the usual score once there are enough. */
export function baselineOf(earlier: TestResult[], pick: (r: TestResult) => number = (r) => r.score) {
  const first = earlier.slice(0, BASELINE_RUNS)
  return {
    runs: first.length,
    usual: first.length >= BASELINE_RUNS ? median(first.map(pick)) : undefined,
  }
}

// The first version kept the latest mini-mission results under these keys. Self-tests replace them.
try {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith('pulsar.exercises.v1.')) localStorage.removeItem(key)
  }
} catch {
  // No storage here.
}
