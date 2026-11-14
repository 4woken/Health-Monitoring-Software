import { regionOf, type Build } from './anatomy/bodyShape'
import type { Signal, SignalId } from '../health/signals'
import { Chip, Panel, StatusDot } from '../ui'

/** Every signal by where it is measured on the body. Picking one moves the 3D camera to it. */
export default function SignalMap({
  build,
  signals,
  activeId,
  onPick,
}: {
  build: Build
  signals: Signal[]
  activeId: SignalId | null
  onPick: (id: SignalId) => void
}) {
  const regions = signals.flatMap((s) => {
    const region = regionOf(s.id, build)
    return region ? [{ signal: s, region }] : []
  })
  return (
    <Panel className="mt-4 p-5 sm:p-7" aria-label="Where each signal is measured">
      <h2 className="text-[20px] font-semibold">Where each signal is measured</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Pick a place to move the camera there and open the signal. Markers show where a value is taken, not an
        injury or a scan of this person.
      </p>
      <div
        role="group"
        aria-label="Body regions"
        className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        {regions.map(({ signal: s, region }) => (
          <button
            key={s.id}
            onClick={() => onPick(s.id)}
            aria-pressed={activeId === s.id}
            className={`press flex min-h-12 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[14px] ${activeId === s.id ? 'border-white bg-white/[0.08] text-ink' : 'border-line text-muted hover:border-line-strong hover:text-ink'}`}
          >
            <span className="flex items-center gap-2">
              <StatusDot level={s.level} />
              {region.label}
            </span>
            {s.level !== 'ok' && <Chip level={s.level} className="min-w-0" />}
          </button>
        ))}
      </div>
    </Panel>
  )
}
