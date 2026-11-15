import { AnimatePresence, motion } from 'motion/react'
import { clock } from './engine'
import { activityAt, eventsUntil } from './live'
import { LevelIcon } from './SimulationChecklist'
import { useSimulation } from './SimulationProvider'

/**
 * While the simulation runs, at the top of the list of the day: what the person is doing, and the
 * latest news. The whole log is in the check-up panel.
 */
export default function MissionLog() {
  const s = useSimulation()
  if (!s.active || !s.sim) return null
  const { now } = activityAt(s.sim, s.t)
  const recent = eventsUntil(s.sim, s.t).slice(0, 1)
  return (
    <section aria-label="Mission log" className="mb-3 rounded-2xl bg-black/50 px-3.5 py-2.5 backdrop-blur-md">
      <p className="flex items-baseline gap-2">
        <span className="font-cond text-[12px] tracking-[0.12em] text-holo uppercase tabular-nums">
          {clock(s.t)}
        </span>
        <span className="min-w-0 truncate text-[14px] leading-snug font-medium text-white">{now.title}</span>
      </p>
      {recent.length > 0 && (
        <ol className="mt-1.5" aria-live="polite">
          <AnimatePresence initial={false} mode="popLayout">
            {recent.map((e) => (
              <motion.li
                key={`${e.at}:${e.title}`}
                layout="position"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2"
              >
                <span className="w-10 shrink-0 font-cond text-[12.5px] text-white/55 tabular-nums">
                  {clock(e.at)}
                </span>
                <span className="pt-0.5">
                  <LevelIcon level={e.level} size={14} />
                </span>
                <span className="min-w-0 text-[13px] leading-snug text-white/90">{e.title}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
    </section>
  )
}
