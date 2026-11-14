import { useId, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Member } from '../../crew/roster'
import type { MissionId } from '../../mission/missions'
import { history } from '../readings'
import {
  describeSeries,
  formatMetric,
  METRICS,
  SIGNAL_METRICS,
  signedMetric,
  type MetricId,
} from '../metrics'
import type { Level, Signal } from '../signals'
import { LEVEL_LINE, Panel, Segmented } from '../../ui'

interface Props {
  member: Member
  mission: MissionId
  signals: Signal[]
  day: number
  /** Metrics to show first, for example the value that was clicked. */
  initialPicked?: MetricId[]
  /** Lighter layout inside a panel. */
  compact?: boolean
}

const W = 900
const H = 120
const MAX = 3

function Strip({
  metric,
  values,
  before,
  color,
  day,
  inspectDay,
}: {
  metric: MetricId
  values: number[]
  before?: number
  color: string
  day: number
  inspectDay: number
}) {
  const gradient = useId()
  const stats = describeSeries(values, before)
  if (!stats) return null
  const m = METRICS[metric]
  const start = day - values.length + 1
  const lo = Math.min(stats.min, before ?? stats.min)
  const hi = Math.max(stats.max, before ?? stats.max)
  const x = (d: number) => (values.length === 1 ? W / 2 : ((d - start) / (values.length - 1)) * W)
  const y = (v: number) => (hi === lo ? H / 2 : H - 12 - ((v - lo) / (hi - lo)) * (H - 24))
  const path = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(start + i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ')
  const inspected = values[inspectDay - start]
  return (
    <section className="border-t border-line-soft py-5" aria-label={`${m.label} trend`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">{m.label}</h3>
          <p className="mt-1 font-cond text-[13px] text-dim">
            Days {start} to {day}, {m.unit}
          </p>
        </div>
        <p className="text-right">
          <span className="display text-[32px]">{formatMetric(inspected)}</span>{' '}
          <span className="text-xs text-muted">
            {m.unit} on day {inspectDay}
          </span>
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-3 block h-32 w-full"
        role="img"
        aria-label={`${m.label}, days ${start} to ${day}. Day ${inspectDay}: ${formatMetric(inspected)} ${m.unit}`}
      >
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.22" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="rgb(255 255 255 / 0.06)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {before !== undefined && (
          <line
            x1="0"
            x2={W}
            y1={y(before)}
            y2={y(before)}
            stroke="rgb(255 255 255 / 0.35)"
            strokeDasharray="4 5"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {values.length > 1 && <path d={`${path} L${W} ${H} L0 ${H} Z`} fill={`url(#${gradient})`} />}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="1.8"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={x(inspectDay)}
          x2={x(inspectDay)}
          y1="0"
          y2={H}
          stroke="#FFFFFF"
          strokeOpacity="0.45"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={x(inspectDay)} cy={y(inspected)} r="4" fill="#FFFFFF" stroke={color} strokeWidth="2" />
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
        {[
          ['Lowest / highest', `${formatMetric(stats.min)} / ${formatMetric(stats.max)} ${m.unit}`],
          ['Average', `${formatMetric(stats.mean)} ${m.unit}`],
          ['Change', `${signedMetric(stats.change)} ${m.changeUnit ?? m.unit}`],
          ['Before launch', before === undefined ? 'Not measured' : `${formatMetric(before)} ${m.unit}`],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[13px] text-muted">{label}</dt>
            <dd className="mt-1 font-cond text-[15px] text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** Up to three measurements over the mission, with a day you can move along all of them. */
export default function TrendChart({ member, mission, signals, day, initialPicked, compact = false }: Props) {
  // A signal made of several measurements (blood pressure, temperature, sugar) gives one curve each.
  const options = signals.flatMap((s) =>
    SIGNAL_METRICS[s.id].map((metric) => ({ metric, level: s.level as Level })),
  )
  const unique = options.filter((o, i) => options.findIndex((x) => x.metric === o.metric) === i)
  const [picked, setPicked] = useState<MetricId[]>(() => {
    const valid = initialPicked?.filter((id) => unique.some((o) => o.metric === id)).slice(0, MAX)
    if (valid?.length) return valid
    const flagged = unique.filter((o) => o.level !== 'ok')
    return (flagged.length ? flagged : unique).slice(0, 2).map((o) => o.metric)
  })
  const [span, setSpan] = useState<'7' | '30' | 'mission'>('mission')
  const [inspection, setInspection] = useState<number | null>(null)
  const start = Math.max(1, day - (span === 'mission' ? day : Number(span)) + 1)
  const inspectDay = Math.max(start, Math.min(day, inspection ?? day))
  const shown = picked.filter((id) => unique.some((o) => o.metric === id))
  const series = useMemo(
    () => new Map(picked.map((metric) => [metric, history(member, metric, day, mission, day - start + 1)])),
    [picked, member, day, mission, start],
  )
  const toggle = (id: MetricId) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-MAX)))
  const fill = day === start ? 100 : ((inspectDay - start) / (day - start)) * 100

  if (unique.length === 0)
    return (
      <p className="text-[13px] leading-relaxed text-muted">
        This signal is an observation, not a number, so it has no curve.
      </p>
    )

  return (
    <Frame compact={compact}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className={compact ? 'font-semibold' : 'text-[20px] font-semibold'}>
            {compact ? 'Scenario history' : `${member.short} · scenario history`}
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Up to {MAX} measurements. The dashed line is the value before launch.
          </p>
        </div>
        <Segmented
          label="Time window"
          value={span}
          onChange={setSpan}
          options={[
            { id: '7', label: '7 days' },
            { id: '30', label: '30 days' },
            { id: 'mission', label: 'Whole mission' },
          ]}
        />
      </div>
      {unique.length > 1 && (
        <div className="mt-5 flex flex-wrap gap-1.5" role="group" aria-label="Measurements to show">
          {unique.map((o) => {
            const on = shown.includes(o.metric)
            return (
              <button
                key={o.metric}
                onClick={() => toggle(o.metric)}
                aria-pressed={on}
                className={`press flex min-h-9 items-center gap-2 rounded-full border px-3 text-[14px] font-medium ${on ? 'border-white bg-white text-[#0d0f12]' : 'border-line-strong text-muted hover:text-ink'}`}
              >
                {o.level !== 'ok' && (
                  <span
                    className={`h-2 w-2 rounded-full ${o.level === 'act' ? 'bg-urgent' : 'bg-check'}`}
                    aria-hidden="true"
                  />
                )}
                {METRICS[o.metric].label}
              </button>
            )
          })}
        </div>
      )}
      {shown.length > 0 ? (
        <label className="mt-5 block text-xs">
          <span className="flex items-baseline justify-between">
            <span className="text-[13px] text-muted">Day shown</span>
            <strong className="font-cond text-[15px] text-ink">Day {inspectDay}</strong>
          </span>
          <input
            type="range"
            min={start}
            max={day}
            value={inspectDay}
            onChange={(e) => setInspection(Number(e.target.value))}
            className="range mt-2 w-full"
            style={{ '--fill': `${fill}%` } as CSSProperties}
          />
        </label>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Pick a measurement above to see its curve.</p>
      )}
      <div className="mt-2">
        {shown.map((metric) => {
          const level = unique.find((o) => o.metric === metric)!.level
          const data = series.get(metric)!
          return (
            <Strip
              key={metric}
              metric={metric}
              values={data.values}
              before={data.before}
              color={level === 'ok' ? '#FFFFFF' : LEVEL_LINE[level]}
              day={day}
              inspectDay={inspectDay}
            />
          )
        })}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-dim">
        Simulated values. Between two exams the last result is repeated, so an average is over displayed days,
        not separate measurements. A curve alone is not a diagnosis.
      </p>
    </Frame>
  )
}

function Frame({ compact, children }: { compact: boolean; children: ReactNode }) {
  return compact ? (
    <section aria-label="Trend">{children}</section>
  ) : (
    <Panel className="mt-4 px-5 py-5 sm:px-7" aria-label="Trends">
      {children}
    </Panel>
  )
}
