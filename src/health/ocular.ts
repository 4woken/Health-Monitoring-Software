/** Observation criteria from NASA's 2023 SANS clinical update, not a webcam diagnosis. */
export const OCULAR_SOURCE = 'https://ntrs.nasa.gov/citations/20220014606'
export interface EyeExam {
  baselineTrtUm: number | null
  trtUm: number | null
  baselineRefractionD: number | null
  refractionD: number | null
  iopMmHg: number | null
  folds: boolean | null
  flattening: boolean | null
}
export interface OcularExam {
  source: string
  measuredAt: string
  origin: 'entered-exam' | 'simulated'
  left: EyeExam
  right: EyeExam
}
export const EMPTY_EYE: EyeExam = {
  baselineTrtUm: null,
  trtUm: null,
  baselineRefractionD: null,
  refractionD: null,
  iopMmHg: null,
  folds: null,
  flattening: null,
}
export function validateOcularExam(value: unknown): OcularExam {
  const exam = value as OcularExam
  if (
    !exam ||
    !['entered-exam', 'simulated'].includes(exam.origin) ||
    typeof exam.source !== 'string' ||
    !exam.source.trim() ||
    typeof exam.measuredAt !== 'string' ||
    !Number.isFinite(Date.parse(exam.measuredAt))
  )
    throw new Error('Add a valid examination time and instrument/source.')
  for (const side of ['left', 'right'] as const) {
    const eye = exam[side]
    if (!eye) throw new Error('Supply both eyes; use null for unassessed fields.')
    for (const key of ['baselineTrtUm', 'trtUm', 'baselineRefractionD', 'refractionD', 'iopMmHg'] as const) {
      const n = eye[key]
      if (
        n !== null &&
        (typeof n !== 'number' ||
          !Number.isFinite(n) ||
          (!['baselineRefractionD', 'refractionD'].includes(key) && n < 0))
      )
        throw new Error(
          'Eye measurements must be finite; thickness and pressure cannot be negative. Use null for missing measurements.',
        )
    }
    for (const key of ['folds', 'flattening'] as const)
      if (eye[key] !== null && typeof eye[key] !== 'boolean')
        throw new Error('Ocular findings must be true, false or null when unassessed.')
  }
  return exam
}
export function reviewEye(eye: EyeExam) {
  const finite = (n: number | null): n is number => n !== null && Number.isFinite(n)
  const deltaTrt = finite(eye.trtUm) && finite(eye.baselineTrtUm) ? eye.trtUm - eye.baselineTrtUm : null
  const deltaRefraction =
    finite(eye.refractionD) && finite(eye.baselineRefractionD)
      ? eye.refractionD - eye.baselineRefractionD
      : null
  const findings: string[] = []
  if (deltaTrt !== null && deltaTrt >= 20) findings.push('OCT retinal thickness increased by at least 20 µm')
  if (deltaRefraction !== null && deltaRefraction >= 0.75)
    findings.push('Hyperopic shift of at least +0.75 D')
  if (eye.folds === true) findings.push('Chorioretinal folds recorded')
  if (eye.flattening === true) findings.push('Posterior globe flattening recorded')
  return {
    deltaTrt,
    deltaRefraction,
    findings,
    needsReview: findings.length > 0,
    complete: deltaTrt !== null && deltaRefraction !== null && eye.folds !== null && eye.flattening !== null,
  }
}
