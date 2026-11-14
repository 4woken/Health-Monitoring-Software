import { useState } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import type { MissionId } from '../../mission/missions'
import { PLACE, environmentOf, type FactorId } from '../environment'
import { NASA_REQUIREMENTS, NASA_SOURCES, type Phase } from '../exams'
import type { Signal, SignalId } from '../signals'
import { StatusDot } from '../../ui'

const GROUPS: { phase: Phase; title: string }[] = [
  { phase: 'flight', title: 'In flight' },
  { phase: 'ground', title: 'Before and after flight' },
  { phase: 'career', title: 'After the career' },
]

/**
 * NASA's reference, starting from where the crew is: what gravity, radiation, light, the closed
 * cabin and the distance do to the body there, and what NASA does about each. The full list of
 * requirements opens below.
 */
export default function NasaReference({
  mission,
  signals,
  onSignal,
  onSimulate,
}: {
  mission: MissionId
  signals: Signal[]
  onSignal: (id: SignalId) => void
  /** Shows gravity and radiation acting on the body over the mission. */
  onSimulate: () => void
}) {
  const factors = environmentOf(mission)
  const [open, setOpen] = useState<FactorId | null>(() => factors.find((f) => f.strong)?.id ?? null)
  const [all, setAll] = useState(false)
  const byId = new Map(signals.map((s) => [s.id, s]))

  const chips = (ids: SignalId[]) => (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const s = byId.get(id)
        if (!s) return null
        return (
          <button
            key={id}
            onClick={() => onSignal(id)}
            className="press flex items-center gap-1.5 rounded-full bg-white/[0.07] px-2.5 py-1 text-[12px] text-white/85 hover:bg-white/[0.14]"
          >
            {s.level !== 'ok' && <StatusDot level={s.level} />}
            {s.title}
          </button>
        )
      })}
    </div>
  )

  return (
    <div className="px-5 pb-6">
      <p className="text-[14px] leading-relaxed text-white/75">
        What {PLACE[mission]} does to the body, and what NASA does about it on its flights.
      </p>

      <ul className="mt-3 divide-y divide-white/[0.07] border-y border-white/[0.07]">
        {factors.map((f) => {
          const expanded = open === f.id
          return (
            <li key={f.id}>
              <button
                onClick={() => setOpen(expanded ? null : f.id)}
                aria-expanded={expanded}
                className="press flex w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
                    {f.name}
                    {f.strong && (
                      <span
                        className="text-[12px] font-normal text-check"
                        title="The hardest of the four destinations on this"
                      >
                        Hardest here
                      </span>
                    )}
                  </span>
                  <span className="block text-[13px] text-white/65">{f.value}</span>
                </span>
                <CaretDown
                  size={13}
                  weight="bold"
                  className={`shrink-0 text-white/50 transition-transform ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded && (
                <div className="pb-4">
                  <p className="text-[14px] leading-relaxed text-white/85">{f.effect}</p>
                  <p className="mt-3 font-cond text-[13px] text-white/60">What NASA does</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-white/85">{f.response}</p>
                  <p className="mt-1.5 font-cond text-[12px] text-white/45">{f.codes.join(', ')}</p>
                  {chips(f.signals)}
                  {(f.id === 'gravity' || f.id === 'radiation') && (
                    <button
                      onClick={onSimulate}
                      className="press mt-3 text-[13px] text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                    >
                      See it on the body over the mission
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <button
        onClick={() => setAll((a) => !a)}
        aria-expanded={all}
        className="press mt-5 flex w-full items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3 text-left hover:bg-white/[0.1]"
      >
        <span>
          <span className="block text-[15px] font-medium">All {NASA_REQUIREMENTS.length} requirements</span>
          <span className="block text-[13px] text-white/60">In flight, before and after, and for life</span>
        </span>
        <CaretDown
          size={13}
          weight="bold"
          className={`shrink-0 text-white/50 transition-transform ${all ? 'rotate-180' : ''}`}
        />
      </button>

      {all &&
        GROUPS.map(({ phase, title }) => {
          const list = NASA_REQUIREMENTS.filter((r) => r.phase === phase)
          return (
            <section key={phase} className="mt-6" aria-label={title}>
              <h3 className="font-cond text-[14px] text-white/60">
                {title}, {list.length} requirements
              </h3>
              <ul className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {list.map((r) => (
                  <li key={r.code} className="py-3">
                    <p className="text-[15px] leading-snug">
                      <span className="font-medium text-ink">{r.name}</span>{' '}
                      <span className="font-cond text-[13px] text-white/50">{r.code}</span>
                    </p>
                    <p className="mt-0.5 text-[13px] leading-snug text-white/80">{r.when}.</p>
                    <p className="mt-0.5 text-[13px] leading-snug text-white/60">{r.what}</p>
                    {r.signals.length > 0 && chips(r.signals)}
                  </li>
                ))}
              </ul>
            </section>
          )
        })}

      <p className="mt-6 text-[12px] leading-relaxed text-dim">
        {NASA_SOURCES.mrid.title}. {NASA_SOURCES.mrid.detail} After the career:{' '}
        <a
          href={NASA_SOURCES.mer.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {NASA_SOURCES.mer.title}
        </a>
        , part of the{' '}
        <a
          href={NASA_SOURCES.lsah.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          {NASA_SOURCES.lsah.title}
        </a>
        , whose data is not public.
      </p>
    </div>
  )
}
