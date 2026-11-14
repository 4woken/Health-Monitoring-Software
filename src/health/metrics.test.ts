import { describe, expect, it } from 'vitest'
import { TEAM } from '../crew/roster'
import { METRICS, SIGNAL_METRICS, describeSeries } from './metrics'
import { history, readingsFor } from './readings'
import { SIGNAL_IDS } from './signals'

const lucas = TEAM[0]

describe('trend values', () => {
  it('maps every signal to metrics that exist, and neck vein flow to none', () => {
    for (const id of SIGNAL_IDS)
      for (const m of SIGNAL_METRICS[id]) expect(METRICS[m], `${id} -> ${m}`).toBeDefined()
    expect(SIGNAL_METRICS.neckVein).toEqual([])
    expect(SIGNAL_METRICS.bodyChecks).toEqual(['systolic', 'diastolic', 'glucose', 'temperature'])
  })
  it('reads each part of a grouped signal, not a stand-in', () => {
    const r = readingsFor(lucas, 60, 'cruise')
    expect(history(lucas, 'glucose', 60, 'cruise', 1).values).toEqual([r.glucoseMgDl])
    expect(history(lucas, 'pulse', 60, 'cruise', 1).values).toEqual([r.restingPulseBpm])
    expect(history(lucas, 'lymphocytes', 60, 'cruise', 1).before).toBe(lucas.baseline.lymphocytesK)
  })
  it('never includes future days or days before launch', () => {
    expect(history(lucas, 'bodyMass', 3, 'cruise', 7).values).toHaveLength(3)
    const week = history(lucas, 'bodyMass', 60, 'cruise', 7)
    expect(week.values).toHaveLength(7)
    expect(week.values[0]).toBe(readingsFor(lucas, 54, 'cruise').bodyMassKg)
    expect(week.values[6]).toBe(readingsFor(lucas, 60, 'cruise').bodyMassKg)
  })
})

describe('trend summary', () => {
  it('keeps the value before launch out of the observed range and average', () => {
    expect(describeSeries([10, 12, 14], 30)).toMatchObject({
      min: 10,
      max: 14,
      mean: 12,
      change: 4,
      sinceLaunch: -16,
    })
  })
  it('does not invent a value before launch or divide by zero', () => {
    expect(describeSeries([4])?.sinceLaunch).toBeNull()
    expect(describeSeries([4], 0)?.sinceLaunchPct).toBeNull()
    expect(describeSeries([], 1)).toBeNull()
    expect(describeSeries([NaN])).toBeNull()
  })
  it('gives absolute and relative changes with their signs', () => {
    expect(describeSeries([90, 80], 100)).toMatchObject({
      change: -10,
      sinceLaunch: -20,
      sinceLaunchPct: -20,
    })
  })
})
