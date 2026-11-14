import { motion } from 'motion/react'
import { Warning } from '@phosphor-icons/react'
import type { Freshness } from '../readings'
import type { Signal } from '../signals'
import { Chip, EASE, LEVEL_LINE, Sparkline } from '../../ui'
import { freshnessText } from './format'

/** One signal in a list: its state, its value, how fresh it is and its recent trend. */
export default function SignalRow({
  signal,
  freshness,
  trend,
  index,
  onOpen,
  onHover,
}: {
  signal: Signal
  freshness?: Freshness
  trend: { values: number[]; before?: number }
  index: number
  onOpen: () => void
  onHover: (on: boolean) => void
}) {
  const quiet = signal.level === 'ok'
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.035, ease: EASE }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className="border-t border-line-soft"
    >
      <button
        onClick={onOpen}
        className={`flex w-full flex-col px-5 text-left hover:bg-white/[0.03] ${quiet ? 'gap-0.5 py-2.5' : 'gap-2 py-4'}`}
      >
        <span className="flex w-full items-center gap-2">
          <span className={`min-w-0 flex-1 ${quiet ? 'text-muted' : 'text-[15px] font-medium'}`}>
            {signal.title}
          </span>
          {!quiet && <Chip level={signal.level} />}
        </span>
        <span className="flex w-full items-center justify-between gap-3">
          <span className="min-w-0">
            <span className={`block font-cond text-[15px] ${quiet ? 'text-dim' : 'text-ink'}`}>
              {signal.value}
            </span>
            {freshness && (!quiet || freshness.outdated) && (
              <span
                className={`mt-0.5 flex items-center gap-1 text-xs ${freshness.outdated ? 'text-check' : 'text-dim'}`}
              >
                {freshness.outdated && <Warning size={13} weight="fill" />}
                {freshnessText(freshness)}
              </span>
            )}
          </span>
          {!quiet && trend.values.length > 1 && (
            <Sparkline values={trend.values} baseline={trend.before} color={LEVEL_LINE[signal.level]} />
          )}
        </span>
      </button>
    </motion.div>
  )
}
