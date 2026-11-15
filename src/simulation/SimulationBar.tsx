import { useEffect, useRef, useState } from 'react'
import { Pause, Play, SkipForward, X } from '@phosphor-icons/react'
import { LEVEL_LINE } from '../ui'
import { blockMet, clock, type Simulation } from './engine'
import { activityAt } from './live'
import { useSimulation } from './SimulationProvider'

const HOLO = '#6fd0ec'
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * The day at a glance, small enough for the top bar: one bar per activity, as tall as its effort,
 * filled up to now, with a dot for each warning so far. Click or drag to go to a time; the activity
 * is named on hover.
 */
function DayBar({ sim, t, onSeek }: { sim: Simulation; t: number; onSeek: (t: number) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const { start, end, blocks } = sim.scenario
  const H = 30
  const x = (m: number) => ((m - start) / (end - start)) * width
  const minuteAt = (clientX: number) => {
    const r = box.current!.getBoundingClientRect()
    return clamp(start + ((clientX - r.left) / r.width) * (end - start), start, end)
  }
  const height = (met: number) => 4 + (Math.min(9, met) / 9) * (H - 8)
  const hovered = hover === null ? null : blocks.find((b) => hover >= b.from && hover < b.to)
  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={box}
        role="slider"
        tabIndex={0}
        aria-label="Time of the simulated day"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={Math.round(t)}
        aria-valuetext={clock(t)}
        className="relative h-[30px] cursor-pointer touch-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onSeek(minuteAt(e.clientX))
        }}
        onPointerMove={(e) => {
          const m = minuteAt(e.clientX)
          setHover(m)
          if (e.buttons === 1) onSeek(m)
        }}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') onSeek(t + 15)
          if (e.key === 'ArrowLeft') onSeek(t - 15)
        }}
      >
        {width > 0 && (
          <svg width={width} height={H} aria-hidden="true" className="absolute inset-0 overflow-visible">
            <defs>
              <clipPath id="day-past">
                <rect x={0} y={0} width={x(t)} height={H} />
              </clipPath>
            </defs>
            {(['future', 'past'] as const).map((part) => (
              <g key={part} clipPath={part === 'past' ? 'url(#day-past)' : undefined}>
                {blocks.map((b) => {
                  const w = Math.max(1, x(b.to) - x(b.from) - 2)
                  const h = height(blockMet(b))
                  return (
                    <rect
                      key={b.from}
                      x={x(b.from) + 1}
                      y={H - h}
                      width={w}
                      height={h}
                      rx={Math.min(3, w / 2)}
                      fill={part === 'past' ? HOLO : '#3d444d'}
                      fillOpacity={part === 'past' ? 0.8 : 1}
                    />
                  )
                })}
              </g>
            ))}
            {sim.events
              .filter((e) => e.at <= t && e.level !== 'ok')
              .map((e) => (
                <circle
                  key={`${e.at}:${e.title}`}
                  cx={x(e.at)}
                  cy={3}
                  r={3.5}
                  fill={LEVEL_LINE[e.level]}
                  stroke="#0d0f12"
                  strokeWidth={1.5}
                />
              ))}
            <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="#ffffff" strokeWidth={2} />
          </svg>
        )}
      </div>
      {hovered && hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-[38px] z-50 w-max max-w-[260px] -translate-x-1/2 rounded-xl border border-line bg-raised px-3 py-2 text-[12.5px] shadow-[0_10px_28px_rgb(0_0_0/0.45)]"
          style={{ left: clamp(x(hover), 110, Math.max(110, width - 110)) }}
        >
          <p className="font-cond text-dim tabular-nums">
            {clock(hovered.from)} – {clock(hovered.to)} · {hovered.place}
          </p>
          <p className="mt-0.5 font-medium text-ink">{hovered.title}</p>
        </div>
      )}
    </div>
  )
}

/** The playback of the mission simulation, in the top bar while it runs. */
export default function SimulationBar() {
  const s = useSimulation()
  if (!s.active || !s.sim) return null
  const { now } = activityAt(s.sim, s.t)
  const round = 'press flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/[0.1]'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] py-1 pr-1 pl-1">
      <button
        onClick={s.togglePlay}
        aria-label={s.playing ? 'Pause the simulation' : 'Play the simulation'}
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[#0d0f12]"
      >
        {s.playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
      </button>
      <p className="shrink-0 font-cond text-[17px] leading-none font-semibold text-white tabular-nums">
        {clock(s.t)}
      </p>
      <p
        className="hidden max-w-[220px] min-w-0 truncate text-[13px] text-white/70 xl:block"
        title={now.title}
      >
        {now.title}
      </p>
      <div className="hidden min-w-[120px] flex-1 lg:flex">
        <DayBar sim={s.sim} t={s.t} onSeek={s.seek} />
      </div>
      <button
        onClick={s.cycleSpeed}
        title="Simulated minutes per second"
        className="press hidden h-8 shrink-0 rounded-full px-2.5 font-cond text-[13px] text-white/80 tabular-nums hover:bg-white/[0.1] sm:block"
      >
        {s.speed} min/s
      </button>
      <button onClick={s.next} aria-label="Next event" title="Next event" className={round}>
        <SkipForward size={15} />
      </button>
      <button onClick={s.stop} aria-label="End the simulation" title="End the simulation" className={round}>
        <X size={15} />
      </button>
    </div>
  )
}
