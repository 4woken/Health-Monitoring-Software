import { useSyncExternalStore } from 'react'
import { validateDosimetry, type DoseDataset } from './dosimetry'
import { validateOcularExam, type OcularExam } from './ocular'
export interface MedicalRecord {
  dosimetry: DoseDataset | null
  ocular: OcularExam | null
}
const EMPTY: MedicalRecord = { dosimetry: null, ocular: null }
const cache = new Map<string, MedicalRecord>()
const listeners = new Set<() => void>()
let version = 0
const keyFor = (id: string, mission: string) => `pulsar.medical.v1.${id}.${mission}`
export function medicalRecord(id: string, mission: string): MedicalRecord {
  const key = keyFor(id, mission)
  if (!cache.has(key)) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as MedicalRecord | null
      cache.set(
        key,
        raw
          ? {
              dosimetry: raw.dosimetry ? validateDosimetry(raw.dosimetry) : null,
              ocular: raw.ocular ? validateOcularExam(raw.ocular) : null,
            }
          : EMPTY,
      )
    } catch {
      cache.set(key, EMPTY)
    }
  }
  return cache.get(key)!
}
export function saveMedicalRecord(id: string, mission: string, update: Partial<MedicalRecord>) {
  const next = { ...medicalRecord(id, mission), ...update }
  if (next.dosimetry) validateDosimetry(next.dosimetry)
  if (next.ocular) validateOcularExam(next.ocular)
  localStorage.setItem(keyFor(id, mission), JSON.stringify(next))
  cache.set(keyFor(id, mission), next)
  version++
  listeners.forEach((f) => f())
}
export const useMedicalVersion = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    () => version,
  )
export function useMedicalRecord(id: string, mission: string) {
  useMedicalVersion()
  return medicalRecord(id, mission)
}
