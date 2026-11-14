import { describe, expect, it } from 'vitest'
import { TEAM } from '../crew/roster'
import { MISSIONS, MISSION_ORDER } from '../mission/missions'
import { GUIDE, NASA_RISK } from './guide'
import { dayReport } from './readings'
import { SOURCES } from './sources'
import { cabinOn } from './simulation'
import {
  SIGNAL_IDS,
  assess,
  bySeverity,
  worstLevel,
  type Baseline,
  type Cabin,
  type Readings,
} from './signals'

const baseline: Baseline = {
  redCellsPct: 45,
  redCellsRange: [38.5, 50],
  opticNerveMm: 5.2,
  whiteCellsK: 9.5,
  lymphocytesK: 2.2,
  vitaminDNgMl: 40,
  bodyMassKg: 80,
}
const normal: Readings = {
  redCellsPct: 45,
  opticNerveMm: 5.2,
  visionChange: false,
  neckVeinFlow: 'forward',
  neckVeinClot: false,
  headache: false,
  sleepHours: 7,
  spo2Pct: 97,
  restingPulseBpm: 60,
  urineLitres: 2.4,
  resistanceSessions: 6,
  mood: 4,
  temperatureC: 36.7,
  systolic: 116,
  diastolic: 74,
  glucoseMgDl: 92,
  whiteCellsK: 9.5,
  lymphocytesK: 2.2,
  vitaminDNgMl: 40,
  bodyMassKg: 80,
}
const cabin: Cabin = {
  day: 11,
  co2MmHg: 2.2,
  doseMSv: 20,
  doseRateMSvDay: 1.8,
  where: 'on the way to Mars',
  doseSourceId: 'RAD_RATE',
}
const level = (r: Partial<Readings>, id: string, c: Partial<Cabin> = {}, b = baseline) =>
  assess({ ...normal, ...r }, b, { ...cabin, ...c }).find((s) => s.id === id)?.level

describe('red cells', () => {
  it('an 11% rise in flight is expected, not flagged', () => {
    expect(level({ redCellsPct: 49.95 }, 'redCells')).toBe('ok')
  })
  it('a rise over 20% or a value below the lab range is flagged', () => {
    expect(level({ redCellsPct: 54.5 }, 'redCells')).toBe('watch')
    expect(level({ redCellsPct: 36 }, 'redCells')).toBe('watch')
  })
})

describe('optic nerve', () => {
  it('a wide but unchanged sheath is fine: many astronauts start that way', () => {
    expect(level({ opticNerveMm: 6.3 }, 'opticNerve', {}, { ...baseline, opticNerveMm: 6.3 })).toBe('ok')
  })
  it('growth from the value before launch, or a vision change, is flagged', () => {
    expect(level({ opticNerveMm: 5.8 }, 'opticNerve')).toBe('watch')
    expect(level({ visionChange: true }, 'opticNerve')).toBe('watch')
  })
})

describe('neck vein', () => {
  it('slow flow is watched, a clot needs action', () => {
    expect(level({}, 'neckVein')).toBe('ok')
    expect(level({ neckVeinFlow: 'stagnant' }, 'neckVein')).toBe('watch')
    expect(level({ neckVeinClot: true }, 'neckVein')).toBe('act')
  })
})

describe('cabin air and headache', () => {
  it('CO2 above the 3 mmHg limit is flagged', () => {
    expect(level({}, 'cabinAir', { co2MmHg: 3.3 })).toBe('watch')
    expect(level({}, 'cabinAir', { co2MmHg: 2.6 })).toBe('ok')
  })
  it('a headache is flagged, and blamed on the air only when CO2 is high', () => {
    const stuffy = assess({ ...normal, headache: true }, baseline, { ...cabin, co2MmHg: 3.1 })
    const clean = assess({ ...normal, headache: true }, baseline, cabin)
    expect(stuffy.find((s) => s.id === 'headache')?.meaning).toMatch(/likely cause/)
    expect(clean.find((s) => s.id === 'headache')?.meaning).toMatch(/unlikely/)
  })
  it('no headache, no headache signal', () => {
    expect(level({}, 'headache')).toBeUndefined()
  })
})

describe('radiation', () => {
  it('is watched from half the career limit and needs action at the limit', () => {
    expect(level({}, 'radiation', { doseMSv: 299 })).toBe('ok')
    expect(level({}, 'radiation', { doseMSv: 300 })).toBe('watch')
    expect(level({}, 'radiation', { doseMSv: 600 })).toBe('act')
  })
})

describe('the other signals', () => {
  it('flags concentrated urine and too little resistance exercise', () => {
    expect(level({ urineLitres: 1.6 }, 'hydration')).toBe('watch')
    expect(level({ resistanceSessions: 3 }, 'loading')).toBe('watch')
  })
  it('flags a week of low mood, fever, high blood pressure and low blood sugar', () => {
    expect(level({ mood: 2.2 }, 'mood')).toBe('watch')
    for (const r of [{ temperatureC: 38.4 }, { systolic: 150 }, { glucoseMgDl: 60 }])
      expect(level(r, 'bodyChecks')).toBe('watch')
  })
  it('treats the usual rise in white cells as expected, and a large one as a flag', () => {
    expect(level({ whiteCellsK: 11.4 }, 'immunity')).toBe('ok')
    expect(level({ whiteCellsK: 14 }, 'immunity')).toBe('watch')
  })
  it('flags vitamin D below 30 ng/mL and a body mass loss over 5%', () => {
    expect(level({ vitaminDNgMl: 26 }, 'vitaminD')).toBe('watch')
    expect(level({ bodyMassKg: 75 }, 'bodyMass')).toBe('watch')
  })
  it('low oxygen needs action', () => {
    expect(level({ spo2Pct: 88 }, 'oxygen')).toBe('act')
    expect(level({ spo2Pct: 93 }, 'oxygen')).toBe('watch')
  })
})

describe('ordering', () => {
  it('lists the most serious signals first', () => {
    const list = assess({ ...normal, spo2Pct: 88, mood: 2 }, baseline, cabin)
    expect(list[0].id).toBe('oxygen')
    expect(list[1].level).toBe('watch')
    expect(worstLevel(list)).toBe('act')
    expect(bySeverity([...list].reverse()).map((s) => s.level)).toEqual(list.map((s) => s.level))
  })
})

describe('destinations', () => {
  it('radiation builds up at the rate of each destination, with its own source', () => {
    expect(cabinOn(60, 'cruise').doseMSv).toBe(108)
    expect(cabinOn(60, 'moon').doseMSv).toBeCloseTo(82.2, 1)
    expect(cabinOn(60, 'orbit').doseMSv).toBeCloseTo(43.8, 1)
    for (const m of MISSION_ORDER) expect(SOURCES[cabinOn(60, m).doseSourceId], m).toBeDefined()
  })
})

describe('guides and sources', () => {
  it('every signal has a plain-language guide, and risk links point to nasa.gov', () => {
    for (const id of SIGNAL_IDS) expect(GUIDE[id], id).toBeDefined()
    for (const r of Object.values(NASA_RISK))
      expect(r!.url.startsWith('https://www.nasa.gov/reference/')).toBe(true)
  })
  it('every signal of every crew member, every day and everywhere, cites a known source', () => {
    for (const mission of MISSION_ORDER)
      for (let day = 1; day <= MISSIONS[mission].days; day += 3)
        for (const member of TEAM)
          for (const s of dayReport(member, day, mission).signals) {
            expect(s.sources.length).toBeGreaterThan(0)
            for (const id of s.sources) expect(SOURCES[id], `${s.id} -> ${id}`).toBeDefined()
          }
  }, 30_000)
})
