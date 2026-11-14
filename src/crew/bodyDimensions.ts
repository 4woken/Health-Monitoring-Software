import type { Build } from '../body/anatomy/bodyShape'

export interface BodyDimensions {
  heightCm?: number
  weightKg?: number
  chestCm?: number
  waistCm?: number
}
export interface SizeSetting {
  values: BodyDimensions
  remembered: boolean
}
export const SIZE_RANGES = {
  heightCm: [50, 260],
  weightKg: [10, 400],
  chestCm: [35, 220],
  waistCm: [30, 240],
} as const
export const EMPTY_SIZE: SizeSetting = { values: {}, remembered: false }

function validValue(value: unknown, [min, max]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

/** Discard invalid or legacy fields independently, preserving a usable single measurement. */
export function readDimensions(value: unknown): BodyDimensions {
  if (!value || typeof value !== 'object') return {}
  const { heightCm, weightKg, chestCm, waistCm } = value as BodyDimensions
  return {
    ...(validValue(heightCm, SIZE_RANGES.heightCm) ? { heightCm } : {}),
    ...(validValue(weightKg, SIZE_RANGES.weightKg) ? { weightKg } : {}),
    ...(validValue(chestCm, SIZE_RANGES.chestCm) ? { chestCm } : {}),
    ...(validValue(waistCm, SIZE_RANGES.waistCm) ? { waistCm } : {}),
  }
}

export function hasSize(value: BodyDimensions) {
  return (
    value.heightCm !== undefined ||
    value.weightKg !== undefined ||
    value.chestCm !== undefined ||
    value.waistCm !== undefined
  )
}

const parsed = (raw: string) => (raw.trim() ? Number(raw.replace(',', '.')) : undefined)

export function parseDimensions(height: string, weight: string, chest = '', waist = '') {
  const entered = {
    heightCm: parsed(height),
    weightKg: parsed(weight),
    chestCm: parsed(chest),
    waistCm: parsed(waist),
  }
  const values = readDimensions(entered)
  const invalid = (Object.keys(entered) as (keyof BodyDimensions)[]).filter(
    (key) => entered[key] !== values[key],
  )
  return { values, valid: invalid.length === 0, invalid }
}

/** Display scales only. Nominal masses calibrate the width dial of each reference mesh. */
export function mannequinScale(build: Build, referenceHeightM: number, dimensions: BodyDimensions) {
  const { heightCm, weightKg } = readDimensions(dimensions)
  const vertical = heightCm === undefined ? 1 : heightCm / (referenceHeightM * 100)
  const referenceKg = build === 'male' ? 76 : 64
  // At a given height, cross-sectional area varies with the chosen mass. Cap the
  // silhouette adjustment because weight alone cannot determine body shape.
  const widthFactor = weightKg === undefined ? 1 : Math.sqrt(weightKg / (referenceKg * vertical ** 3))
  const horizontal = vertical * Math.max(0.74, Math.min(1.35, widthFactor))
  return { horizontal, vertical }
}

const keyFor = (id: string) => 'pulsar.crew.dimensions.' + id

export function loadSize(id: string): SizeSetting {
  try {
    const values = readDimensions(JSON.parse(localStorage.getItem(keyFor(id)) ?? 'null'))
    return hasSize(values) ? { values, remembered: true } : EMPTY_SIZE
  } catch {
    return EMPTY_SIZE
  }
}

export function saveSize(id: string, dimensions: BodyDimensions, remember: boolean): SizeSetting {
  const values = readDimensions(dimensions)
  const remembered = remember && hasSize(values)
  try {
    if (remembered) localStorage.setItem(keyFor(id), JSON.stringify(values))
    else localStorage.removeItem(keyFor(id))
    return { values, remembered }
  } catch {
    return { values, remembered: false }
  }
}
