import { describe, expect, it } from 'vitest'
import {
  exampleDosimetry,
  grayEquivalent,
  organExposure,
  validateDosimetry,
  type AbsorbedDose,
} from './dosimetry'
import { EMPTY_EYE, reviewEye, validateOcularExam } from './ocular'
const bins: AbsorbedDose = {
  proton: 1,
  heavyIon: 0.1,
  neutronBelow1MeV: 0,
  neutron1To5MeV: 0.2,
  neutronAbove5MeV: 0,
}
describe('organ-specific NASA RBE integration', () => {
  it('matches the independent mixed-field worked example (mGy to mGy-Eq)', () =>
    expect(grayEquivalent(bins)).toBeCloseTo(2.95))
  it('integrates partial boundary intervals, excludes future records and retains unknown history', () => {
    const d = exampleDosimetry(100)
    d.intervals = [{ id: 'lens', organ: 'lens', startDay: 0, endDay: 100, absorbedMGy: bins }]
    const r = organExposure(validateDosimetry(d), 'lens', 60)
    expect(r.month.dose).toBeCloseTo(0.885)
    expect(r.mission.dose).toBeCloseTo(1.77)
    expect(r.career).toBeNull()
    expect(r.month.complete).toBe(true)
    expect(organExposure(d, 'skin', 60).month.complete).toBe(false)
  })
  it('flags a reached organ limit and combines independently supplied career history', () => {
    const d = exampleDosimetry(1)
    d.intervals = [
      { id: 'lens', organ: 'lens', startDay: 0, endDay: 1, absorbedMGy: { ...bins, proton: 800 } },
    ]
    d.priorCareerMGyEq.lens = 3100
    const r = organExposure(validateDosimetry(d), 'lens', 1)
    expect(r.exceeded).toBe(true)
    expect(r.career).toBeCloseTo(4301.45)
  })
  it('rejects duplicated/overlapping exposures and missing particle bins instead of fabricating zero', () => {
    const d = exampleDosimetry(10)
    expect(() =>
      validateDosimetry({ ...d, intervals: [...d.intervals, { ...d.intervals[0], id: 'extra' }] }),
    ).toThrow(/Overlapping/)
    expect(() =>
      validateDosimetry({ ...d, intervals: [{ ...d.intervals[0], absorbedMGy: { proton: 2 } }] }),
    ).toThrow()
  })
  it('retains missing prelaunch windows and alerts on a career lower bound even with a recording gap', () => {
    const d = exampleDosimetry(1)
    d.priorCareerMGyEq.lens = 3999.9
    const r = organExposure(d, 'lens', 10)
    expect(r.month.complete).toBe(false)
    expect(r.month.requestedDays).toBe(30)
    expect(r.year.complete).toBe(false)
    expect(r.career).toBeNull()
    expect(r.careerLowerBound).toBeGreaterThan(4000)
    expect(r.exceeded).toBe(true)
  })
})
describe('ocular findings independent of radiation', () => {
  it('keeps missing examinations unknown and uses delta from the same eye baseline', () => {
    expect(reviewEye(EMPTY_EYE)).toMatchObject({ complete: false, needsReview: false, deltaTrt: null })
    expect(reviewEye({ ...EMPTY_EYE, baselineTrtUm: 300, trtUm: 319.9 }).needsReview).toBe(false)
    expect(reviewEye({ ...EMPTY_EYE, baselineTrtUm: 300, trtUm: 320 }).needsReview).toBe(true)
    expect(reviewEye({ ...EMPTY_EYE, baselineRefractionD: -2, refractionD: -1.25 }).needsReview).toBe(true)
    expect(reviewEye({ ...EMPTY_EYE, baselineRefractionD: 1, refractionD: 0 }).needsReview).toBe(false)
  })
  it('rejects malformed examinations without replacing missing measurements with zero', () => {
    const exam = {
      source: 'OCT exam',
      measuredAt: '2026-01-01T12:00:00Z',
      origin: 'entered-exam',
      left: { ...EMPTY_EYE },
      right: { ...EMPTY_EYE },
    }
    expect(validateOcularExam(exam).left.trtUm).toBeNull()
    expect(() => validateOcularExam({ ...exam, left: { ...EMPTY_EYE, trtUm: -1 } })).toThrow()
    expect(() => validateOcularExam({ ...exam, left: { ...EMPTY_EYE, iopMmHg: Infinity } })).toThrow()
    expect(() => validateOcularExam({ ...exam, measuredAt: 'invalid' })).toThrow()
    expect(() => validateOcularExam({ ...exam, right: {} })).toThrow()
  })
})
