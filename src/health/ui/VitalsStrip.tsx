import type { MetricId } from '../metrics'
import type { Level, Readings, SignalId } from '../signals'
import { formatMetric } from '../metrics'
import {
  glucoseLevel,
  oxygenLevel,
  pressureLevel,
  radiationLevel,
  sleepLevel,
  temperatureLevel,
  type VitalLevel,
} from '../vitalLevels'
import { valueColor, VitalLabel, VitalSource } from './VitalParts'
import type { BreathReading } from '../../camera/breathReading'
import type { LiveVitals } from '../../simulation/live'
import LivePulse from './LivePulse'
import RadiationReadout from './RadiationReadout'
import type { MissionId } from '../../mission/missions'

interface Cell {
  metric: MetricId
  signal: SignalId
  label: string
  value: string
  unit: string
  source: string
  vital: VitalLevel
}

/**
 * Vital signs along the bottom of the body scene, like the number row of a bedside monitor. Each
 * value opens its signal.
 */
export default function VitalsStrip({
  readings,
  mission,
  day,
  onPick,
  onOpenCamera,
  onBreathing,
  breath,
  live,
  pulse,
  radiation,
}: {
  readings: Readings
  mission: MissionId
  day: number
  onPick: (signal: SignalId, metric?: MetricId) => void
  onOpenCamera: () => void
  onBreathing: () => void
  breath: BreathReading | null
  /** The minute of the mission simulation, when it runs. */
  live?: LiveVitals | null
  /** How the heart rate stands: at rest, or for the task of the simulated minute. */
  pulse: VitalLevel
  /** The level of the radiation signal. */
  radiation: Level
}) {
  const spo2 = live?.spo2Pct ?? readings.spo2Pct
  const systolic = live?.systolic ?? readings.systolic
  const diastolic = live?.diastolic ?? readings.diastolic
  const temperature = live?.temperatureC ?? readings.temperatureC
  const glucose = live?.glucoseMgDl ?? readings.glucoseMgDl
  const cells: Cell[] = [
    {
      metric: 'spo2',
      signal: 'oxygen',
      label: 'Blood oxygen',
      value: formatMetric(spo2),
      unit: '%',
      source: live ? 'Live' : 'Wearable',
      vital: oxygenLevel(spo2),
    },
    {
      metric: 'systolic',
      signal: 'bodyChecks',
      label: 'Blood pressure',
      value: `${systolic}/${diastolic}`,
      unit: 'mmHg',
      source: live ? 'Live' : 'Morning check',
      vital: pressureLevel(systolic, diastolic),
    },
    {
      metric: 'temperature',
      signal: 'bodyChecks',
      label: 'Temperature',
      value: formatMetric(temperature),
      unit: '°C',
      source: live ? 'Core, live' : 'Morning check',
      vital: temperatureLevel(temperature),
    },
    {
      metric: 'glucose',
      signal: 'bodyChecks',
      label: 'Blood sugar',
      value: formatMetric(glucose),
      unit: 'mg/dL',
      source: live ? 'Live' : 'Morning check',
      vital: glucoseLevel(glucose),
    },
    {
      metric: 'sleep',
      signal: 'sleep',
      label: 'Sleep',
      value: formatMetric(readings.sleepHours),
      unit: 'h a night',
      source: 'Last 7 nights',
      vital: sleepLevel(readings.sleepHours),
    },
  ]
  return (
    <section aria-label="Vital signs" className="no-scrollbar flex items-end overflow-x-auto">
      <div className="shrink-0 pr-6">
        <LivePulse
          restingPulseBpm={readings.restingPulseBpm}
          liveBpm={live?.bpm}
          level={pulse}
          onOpenCamera={onOpenCamera}
          onOpen={() => onPick('oxygen', 'pulse')}
        />
      </div>
      <button
        onClick={onBreathing}
        className="press on-photo shrink-0 border-l border-white/15 px-5 py-1 text-left hover:bg-white/[0.04]"
        aria-label="Measure my breathing with the webcam"
      >
        <span className="block font-cond text-[13px] text-white/65">Breathing</span>
        <span className="mt-1 flex items-baseline gap-1.5">
          <span className="display text-[38px] text-white">
            {live ? live.breaths : breath ? Math.round(breath.breathsPerMinute) : '—'}
          </span>
          <span className="text-[13px] text-white/65">breaths/min</span>
        </span>
        <span className="block font-cond text-[13px] text-white/75">
          {live ? 'Live' : breath ? 'Recent webcam estimate' : 'Measure with camera'}
        </span>
      </button>
      {cells.map((c) => (
        <button
          key={c.metric}
          onClick={() => onPick(c.signal, c.metric)}
          title={`Open ${c.label}`}
          aria-label={`${c.label} ${c.value} ${c.unit}${c.vital.word ? `, ${c.vital.word.toLowerCase()}` : ''}. Open the detail`}
          className="press on-photo group shrink-0 border-l border-white/15 px-6 py-1 text-left"
        >
          <VitalLabel vital={c.vital}>{c.label}</VitalLabel>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="display text-[38px]" style={{ color: valueColor(c.vital.level) }}>
              {c.value}
            </span>
            <span className="text-[13px] text-white/60">{c.unit}</span>
          </span>
          <VitalSource vital={c.vital}>{c.source}</VitalSource>
        </button>
      ))}
      <RadiationReadout
        mission={mission}
        day={day}
        vital={radiationLevel(radiation)}
        onOpen={() => onPick('radiation', 'dose')}
      />
    </section>
  )
}
