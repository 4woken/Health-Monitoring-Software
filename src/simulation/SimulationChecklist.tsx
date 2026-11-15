import { AnimatePresence, motion } from 'motion/react'
import { CheckCircle, Circle, WarningCircle } from '@phosphor-icons/react'
import type { Level } from '../health/signals'
import type { SelfTestId } from '../selftests/ids'
import { LEVEL_LINE } from '../ui'
import { clock } from './engine'
import { eventsUntil, tasksAt } from './live'
import { useSimulation } from './SimulationProvider'

export function LevelIcon({ level, size = 15 }: { level: Level; size?: number }) {
  return level === 'ok' ? (
    <CheckCircle size={size} weight="fill" style={{ color: LEVEL_LINE.ok }} aria-label="Normal" />
  ) : (
    <WarningCircle
      size={size}
      weight="fill"
      style={{ color: LEVEL_LINE[level] }}
      aria-label={level === 'act' ? 'Urgent' : 'Check'}
    />
  )
}

/**
 * The list of the simulated day, in the check-up panel: the person's own check-up and the mission
 * plan, ticked as the day goes, with the tasks the alerts add; then what happened.
 */
export default function SimulationChecklist({ onStartTest }: { onStartTest: (test: SelfTestId) => void }) {
  const s = useSimulation()
  if (!s.sim) return null
  const { sim, t } = s
  const tasks = tasksAt(sim, t)
  const done = tasks.filter((x) => x.state === 'done').length
  const events = eventsUntil(sim, t)
  return (
    <div className="px-5 pb-8">
      <p className="font-cond text-[13px] text-muted tabular-nums">
        {clock(t)} · {done} of {tasks.length} done
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-300"
          style={{ width: `${tasks.length ? (100 * done) / tasks.length : 0}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1">
        <AnimatePresence initial={false}>
          {tasks.map((x) => {
            const added = x.from === 'monitor' || x.shownFrom > sim.scenario.start
            const fresh = added && t - x.shownFrom < 25 && x.state !== 'done'
            return (
              <motion.li
                key={x.id}
                layout="position"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
                className={`flex gap-3 rounded-xl px-2 py-2 ${fresh ? 'bg-holo/[0.09]' : ''}`}
              >
                <span className="w-11 shrink-0 pt-0.5 font-cond text-[13px] text-dim tabular-nums">
                  {clock(x.due)}
                </span>
                <span className="pt-0.5">
                  {x.state === 'done' ? (
                    <CheckCircle size={17} weight="fill" className="text-white/70" aria-label="Done" />
                  ) : x.state === 'late' ? (
                    <WarningCircle
                      size={17}
                      weight="fill"
                      style={{ color: LEVEL_LINE.watch }}
                      aria-label="Late"
                    />
                  ) : x.state === 'now' ? (
                    <Circle size={17} weight="fill" className="text-holo" aria-label="Now" />
                  ) : (
                    <Circle size={17} className="text-dim" aria-label="Later" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-[14px] leading-snug ${x.state === 'done' ? 'text-dim line-through decoration-white/25' : 'text-ink'}`}
                  >
                    {x.title}
                  </p>
                  {x.state !== 'done' && x.detail && (
                    <p className="text-[12.5px] leading-snug text-dim">{x.detail}</p>
                  )}
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-cond text-[12px] tracking-wide">
                    {x.from === 'monitor' && <span className="text-holo">Added at {clock(x.shownFrom)}</span>}
                    {x.moved && x.move && <span style={{ color: LEVEL_LINE.watch }}>{x.move.reason}</span>}
                    {x.test && x.state !== 'done' && (
                      <button
                        onClick={() => onStartTest(x.test!)}
                        className="text-holo underline underline-offset-2 hover:text-white"
                      >
                        Take the test
                      </button>
                    )}
                  </div>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>

      <h3 className="mt-6 text-[16px] font-semibold">What happened</h3>
      <ol className="mt-3 space-y-3">
        <AnimatePresence initial={false}>
          {events.map((e) => (
            <motion.li
              key={`${e.at}:${e.title}`}
              layout="position"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3"
            >
              <span className="w-11 shrink-0 pt-0.5 font-cond text-[13px] text-dim tabular-nums">
                {clock(e.at)}
              </span>
              <span className="pt-0.5">
                <LevelIcon level={e.level} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] leading-snug font-medium text-ink">{e.title}</p>
                <p className="text-[12.5px] leading-snug text-dim">{e.detail}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </div>
  )
}
