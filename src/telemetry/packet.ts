import type { DayReport } from '../health/readings'
import { METRICS, SIGNAL_METRICS, type MetricId } from '../health/metrics'
import { cabinOn } from '../health/simulation'
import { SOURCES } from '../health/sources'
import { exampleDosimetry, ORGANS, organExposure } from '../health/dosimetry'
import { medicalRecord } from '../health/medicalRecords'
import type { MissionId } from '../mission/missions'
import { resultsOf } from '../selftests/results'
import { testFacts } from '../selftests/facts'
import type { Cbor } from './cbor'

/** A self-contained snapshot: units, acquisition provenance, model versions, no portrait/video. */
export function healthPacket(
  report: DayReport,
  mission: MissionId,
  includeHistory: boolean,
  simulation: unknown = null,
): Cbor {
  const cabin = cabinOn(report.day, mission)
  const records = medicalRecord(report.member.id, mission)
  const organInputs = records.dosimetry ?? exampleDosimetry(report.day)
  const measuredPulse = testFacts(report.member.id, report.day).measuredPulseBpm
  const observations = (Object.keys(METRICS) as MetricId[]).map((metric) => {
    const m = METRICS[metric]
    const signal = report.signals.find((s) => SIGNAL_METRICS[s.id].includes(metric))
    return {
      metric,
      label: m.label,
      value: m.read(report.readings, cabin),
      unit: m.unit,
      origin: metric === 'pulse' && measuredPulse !== null ? 'self-test' : 'simulated',
      acquisition: signal ? report.freshness[signal.id] : null,
    }
  })
  const sourceIds = [...new Set(report.signals.flatMap((s) => s.sources))]
  // JSON normalization removes absent optional members; the CBOR encoder does not silently accept undefined.
  return JSON.parse(
    JSON.stringify({
      schema: 'pulsar.health.v1',
      createdAt: new Date().toISOString(),
      subjectId: report.member.id,
      mission,
      missionDay: report.day,
      observationBasis:
        'Daily report. The optional missionSimulation field contains the current simulated minute separately.',
      intendedRecipient: 'Ground medical operations — local simulator',
      observations,
      signals: report.signals,
      selfTests: resultsOf(report.member.id).filter(
        (r) => r.mission === mission && (includeHistory ? r.day <= report.day : r.day === report.day),
      ),
      organDosimetry: {
        model: 'NASA-TM-20220006594 RBE aggregation',
        inputs: organInputs,
        outputs: ORGANS.map((o) => organExposure(organInputs, o, report.day)),
        unit: 'mGy-Eq',
        annualWindowDays: 365,
      },
      ocularExamination: records.ocular,
      missionSimulation: simulation,
      sources: sourceIds.map((id) => SOURCES[id]).filter(Boolean),
      limitations: [
        'Browser prototype; no actual spacecraft link.',
        'Simulated values are not instrument measurements.',
        'No raw camera images, portrait or video included.',
      ],
    }),
  ) as Cbor
}
