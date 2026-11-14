import type { CSSProperties } from 'react'
import { CaretRight, Plus, X } from '@phosphor-icons/react'
import { dayReport } from '../health/readings'
import { worstLevel } from '../health/signals'
import { HABITATS } from '../mission/habitats'
import { MISSIONS, type MissionId } from '../mission/missions'
import { Logo, StatusDot } from '../ui'
import { useCrew } from './CrewProvider'
import MemberAvatar from './MemberAvatar'

/** The picture behind the crew list: the Destiny laboratory aboard the ISS. */
const PLACE = HABITATS.station
const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` })

/** The first screen: pick whose body to see, or add someone with the camera. Every profile is open. */
export default function CrewPicker({
  mission,
  day,
  onPick,
  onAdd,
}: {
  mission: MissionId
  day: number
  onPick: (id: string) => void
  onAdd: () => void
}) {
  const crew = useCrew()
  return (
    <div className="scene flex min-h-[100dvh] flex-col">
      <img
        className="scene-photo"
        src={PLACE.image}
        alt=""
        aria-hidden="true"
        style={{ objectPosition: PLACE.imagePosition }}
      />
      <div className="scene-shade" aria-hidden="true" />

      <main className="mx-auto grid w-full max-w-[1400px] flex-1 items-center gap-x-16 gap-y-10 px-5 pt-14 pb-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_460px]">
        <div className="on-photo">
          <div className="rise" style={delay(0)}>
            <Logo variant="full" size={36} />
          </div>
          <h1
            className="rise mt-8 font-cond text-[clamp(56px,8vw,108px)] leading-[0.88] font-semibold tracking-[-0.025em]"
            style={delay(80)}
          >
            Who&apos;s on board?
          </h1>
          <p
            className="rise mt-6 max-w-[34rem] text-[clamp(18px,1.7vw,22px)] leading-relaxed text-white/90"
            style={delay(160)}
          >
            Pick a crew member to explore their body in space or open the camera to measure your own pulse and
            breathing.
          </p>
          <p className="rise mt-3 text-[15px] text-white/65" style={delay(240)}>
            Mission records are simulated. Camera readings are experimental estimates.
          </p>
        </div>

        <section className="veil rise p-3" style={delay(200)} aria-label="Crew">
          <p className="px-3 pt-2 pb-2 font-cond text-[14px] text-white/60">
            {MISSIONS[mission].name}, day {day}
          </p>
          <ul>
            {crew.members.map((m) => {
              const signals = dayReport(m, day, mission).signals
              const flagged = signals.filter((s) => s.level !== 'ok').length
              return (
                <li key={m.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onPick(m.id)}
                    className="press flex min-w-0 flex-1 items-center gap-4 rounded-xl px-3 py-3 text-left hover:bg-white/[0.07]"
                  >
                    <MemberAvatar member={m} face={crew.faceOf(m.id)} size={46} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[17px] font-medium">{m.name}</span>
                      <span className="block truncate text-[14px] text-muted">
                        {m.role}
                        {m.callSign ? ` · ${m.callSign}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 font-cond text-[14px] text-muted">
                      {flagged > 0 && <StatusDot level={worstLevel(signals)} />}
                      {flagged === 0 ? 'All clear' : `${flagged} to watch`}
                    </span>
                    <CaretRight size={16} className="shrink-0 text-dim group-hover:text-white" />
                  </button>
                  {m.added && (
                    <button
                      type="button"
                      onClick={() => crew.remove(m.id)}
                      aria-label={`Remove ${m.name}`}
                      title={`Remove ${m.name}`}
                      className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-dim hover:bg-white/10 hover:text-white"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={onAdd}
            className="press mt-1 flex w-full items-center gap-4 rounded-xl border border-dashed border-white/20 px-3 py-3 text-left hover:border-white/40 hover:bg-white/[0.05]"
          >
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
              <Plus size={18} />
            </span>
            <span>
              <span className="block text-[17px] font-medium">Add a crew member</span>
              <span className="block text-[14px] text-muted">
                Set up a profile and personalise the 3D body
              </span>
            </span>
          </button>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-[1400px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-5 pb-5 font-cond text-[13px] text-white/55 sm:px-8">
        <p>
          A NASA Space Apps Challenge 2026 project by Lucas Baurianne, Enzo Baurianne, Nassim Arifette and
          Youssef Mir. Not affiliated with NASA.
        </p>
        <a href={PLACE.sourceUrl} target="_blank" rel="noreferrer" className="hover:text-white">
          Photo: {PLACE.credit}. {PLACE.description}.
        </a>
      </footer>
    </div>
  )
}
