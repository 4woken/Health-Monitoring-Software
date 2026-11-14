import { ArrowUpRight, CheckCircle, ListPlus } from '@phosphor-icons/react'
import { MISSIONS, type MissionId } from '../../mission/missions'
import { NASA_SOURCES, requirementsFor, type Phase } from '../exams'
import { GUIDE, NASA_RISK } from '../guide'
import type { MetricId } from '../metrics'
import type { DayReport } from '../readings'
import type { Signal, SignalId } from '../signals'
import { SOURCES } from '../sources'
import { Button, Chip } from '../../ui'
import { freshnessText } from './format'
import TrendChart from './TrendChart'

/** Signals whose space limits come from weightless flights, where partial gravity changes the picture. */
const GRAVITY_SENSITIVE = new Set<SignalId>([
  'opticNerve',
  'neckVein',
  'redCells',
  'oxygen',
  'hydration',
  'loading',
])

const link = 'text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink'

const PHASE_LABEL: Record<Phase, string> = {
  flight: 'In flight',
  ground: 'Before and after flight',
  career: 'After the career',
}

/** One signal explained: the value, what it means here, how it is taken, what to do, and why we say so. */
export default function SignalPanel({
  report,
  signal,
  mission,
  metric,
  planned,
  onPlan,
  onReference,
}: {
  report: DayReport
  signal: Signal
  mission: MissionId
  metric?: MetricId
  /** True when today's check-up already has a task for this signal. */
  planned: boolean
  onPlan: () => void
  /** Opens the whole NASA reference. */
  onReference?: () => void
}) {
  const guide = GUIDE[signal.id]
  const fresh = report.freshness[signal.id]
  const m = MISSIONS[mission]
  const risk = NASA_RISK[signal.id]
  const nasa = requirementsFor(signal.id)
  const blocks: [string, string][] = [
    ['Value', signal.value],
    ['What it is', guide.what],
    ['What it means here', signal.meaning],
    ['How it is taken', guide.how],
    ['What to do', signal.advice],
  ]
  return (
    <div className="space-y-5 px-5 pb-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {report.member.short}, day {report.day}. Simulated data.
        </p>
        <Chip level={signal.level} />
      </div>

      <dl className="space-y-4">
        {blocks.map(([title, text]) => (
          <div key={title}>
            <dt className="font-cond text-[13px] text-white/60">{title}</dt>
            <dd
              className={`mt-1 leading-relaxed ${title === 'Value' ? 'font-cond text-[17px] text-ink' : 'text-[15px]'}`}
            >
              {text}
            </dd>
          </div>
        ))}
      </dl>
      {fresh && (
        <p className={`text-[13px] ${fresh.outdated ? 'text-check' : 'text-dim'}`}>{freshnessText(fresh)}</p>
      )}

      {signal.level !== 'ok' && (
        <Button size="sm" onClick={onPlan} disabled={planned}>
          {planned ? <CheckCircle size={16} weight="fill" /> : <ListPlus size={16} />}
          {planned ? "In today's check-up" : "Add to today's check-up"}
        </Button>
      )}

      {GRAVITY_SENSITIVE.has(signal.id) && m.gravity > 0 && (
        <p className="text-[13px] leading-relaxed text-check">
          {m.name}: gravity is {m.gravity} of Earth&apos;s, and these limits come from weightless flights. The
          simulation assumes {Math.round(m.fluidShift * 100)}% of the weightless fluid shift, interpolated
          from a{' '}
          <a
            href={SOURCES.GRAVITY_PARTIAL.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            short-flight study
          </a>{' '}
          (our assumption).
        </p>
      )}

      <TrendChart
        key={`${report.member.id}:${signal.id}:${metric ?? ''}`}
        compact
        member={report.member}
        mission={mission}
        signals={[signal]}
        day={report.day}
        initialPicked={metric ? [metric] : undefined}
      />

      {nasa.length > 0 && (
        <div className="border-t border-line-soft pt-4">
          <p className="font-cond text-[13px] text-white/60">What NASA examines on the same question</p>
          <ul className="mt-2 space-y-3">
            {nasa.map((r) => (
              <li key={r.code} className="text-[14px] leading-snug">
                <span className="font-medium text-ink">{r.name}</span>{' '}
                <span className="font-cond text-[13px] text-white/55">{r.code}</span>
                <span className="mt-0.5 block text-[13px] text-white/70">
                  {PHASE_LABEL[r.phase]}: {r.when.charAt(0).toLowerCase() + r.when.slice(1)}. {r.what}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] leading-relaxed text-dim">
            {NASA_SOURCES.mrid.title}. After the career:{' '}
            <a
              href={NASA_SOURCES.mer.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              NASA&apos;s yearly exam
            </a>
            , part of the{' '}
            <a
              href={NASA_SOURCES.lsah.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Lifetime Surveillance of Astronaut Health
            </a>
            .
          </p>
          {onReference && (
            <button
              onClick={onReference}
              className="press mt-2 text-[13px] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
            >
              See the whole NASA reference
            </button>
          )}
        </div>
      )}

      <div className="space-y-2 border-t border-line-soft pt-4 text-[13px] leading-relaxed text-muted">
        <p className="font-cond text-white/60">Why we say so</p>
        {signal.sources.map((id) => {
          const s = SOURCES[id]
          if (!s) return null
          return (
            <p key={id}>
              {s.status === 'demo' ? (
                <span className="text-ink">Our own value, no published source.</span>
              ) : (
                <a href={s.url} target="_blank" rel="noreferrer" className={link}>
                  {s.title}
                </a>
              )}{' '}
              {s.says}
            </p>
          )
        })}
        {risk && (
          <a
            href={risk.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-ink hover:underline"
          >
            NASA risk: {risk.name}
            <ArrowUpRight size={12} />
          </a>
        )}
      </div>
    </div>
  )
}
