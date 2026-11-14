import type { MetricId } from '../metrics'
import type { Readings, SignalId } from '../signals'
import { formatMetric } from '../metrics'
import type { BreathReading } from '../../camera/breathReading'
import LivePulse from './LivePulse'

interface Cell {
  metric: MetricId
  signal: SignalId
  label: string
  value: string
  unit: string
  source: string
}

/**
 * Vital signs along the bottom of the body scene, like the number row of a bedside monitor. Each
 * value opens its signal.
 */
export default function VitalsStrip({
  readings,
  onPick,
  onOpenCamera,
  onBreathing,
  breath,
}: {
  readings: Readings
  onPick: (signal: SignalId, metric?: MetricId) => void
  onOpenCamera: () => void
  onBreathing: () => void
  breath: BreathReading | null
}) {
  const cells: Cell[] = [
    {
      metric: 'spo2',
      signal: 'oxygen',
      label: 'Blood oxygen',
      value: formatMetric(readings.spo2Pct),
      unit: '%',
      source: 'Wearable, simulated',
    },
    {
      metric: 'systolic',
      signal: 'bodyChecks',
      label: 'Blood pressure',
      value: `${readings.systolic}/${readings.diastolic}`,
      unit: 'mmHg',
      source: 'Health kit, simulated',
    },
    {
      metric: 'temperature',
      signal: 'bodyChecks',
      label: 'Temperature',
      value: formatMetric(readings.temperatureC),
      unit: '°C',
      source: 'Health kit, simulated',
    },
    {
      metric: 'glucose',
      signal: 'bodyChecks',
      label: 'Blood sugar',
      value: formatMetric(readings.glucoseMgDl),
      unit: 'mg/dL',
      source: 'Health kit, simulated',
    },
    {
      metric: 'sleep',
      signal: 'sleep',
      label: 'Sleep',
      value: formatMetric(readings.sleepHours),
      unit: 'h a night',
      source: 'Wearable, simulated',
    },
  ]
  return (
    <section aria-label="Vital signs" className="no-scrollbar flex items-end overflow-x-auto">
      <div className="shrink-0 pr-6">
        <LivePulse
          restingPulseBpm={readings.restingPulseBpm}
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
            {breath ? Math.round(breath.breathsPerMinute) : '—'}
          </span>
          <span className="text-[13px] text-white/65">breaths/min</span>
        </span>
        <span className="block font-cond text-[13px] text-white/75">
          {breath ? 'Recent webcam estimate' : 'Measure with camera'}
        </span>
      </button>
      {cells.map((c) => (
        <button
          key={c.metric}
          onClick={() => onPick(c.signal, c.metric)}
          title={`Open ${c.label}`}
          className="press on-photo group shrink-0 border-l border-white/15 px-6 py-1 text-left"
        >
          <span className="block font-cond text-[13px] text-white/65 group-hover:text-white">{c.label}</span>
          <span className="mt-1 flex items-baseline gap-1.5">
            <span className="display text-[38px] text-white">{c.value}</span>
            <span className="text-[13px] text-white/60">{c.unit}</span>
          </span>
          <span className="block font-cond text-[13px] text-white/75">{c.source}</span>
        </button>
      ))}
    </section>
  )
}
