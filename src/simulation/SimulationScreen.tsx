import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowCounterClockwise,
  CheckCircle,
  Circle,
  Eyeglasses,
  Pause,
  Play,
  SkipForward,
  WarningCircle,
} from '@phosphor-icons/react'
import ArVisor, { type LiveReadings } from '../app/ArVisor'
import { planDay } from '../checkup/planner'
import type { Member } from '../crew/roster'
import type { Level } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import { MISSION_ORDER, MISSIONS, type MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'
import { LEVEL_LINE } from '../ui'
import {
  blockMet,
  clock,
  nextDrink,
  personOf,
  sampleAt,
  simulate,
  taskAt,
  type Sample,
  type SimEvent,
  type Simulation,
} from './engine'
import { SCENARIOS } from './scenarios'

const HOLO = '#6fd0ec'
/** Simulated minutes per second of playback. */
const SPEEDS = [2, 5, 15]
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The width of an element, kept up to date. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

function LevelIcon({ level, size = 15 }: { level: Level; size?: number }) {
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
 * The day at a glance: one bar per block, as tall as its planned effort, filled as the day goes by.
 * The activity is named on hover and in the "now" card; colour only tells past from future.
 */
function Timeline({ sim, t, onSeek }: { sim: Simulation; t: number; onSeek: (t: number) => void }) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { start, end, blocks } = sim.scenario
  const H = 64
  const x = (m: number) => ((m - start) / (end - start)) * width
  const minuteAt = (clientX: number) => {
    const box = ref.current!.getBoundingClientRect()
    return clamp(start + ((clientX - box.left) / box.width) * (end - start), start, end)
  }
  const hovered = hover === null ? null : blocks.find((b) => hover >= b.from && hover < b.to)
  const seen = sim.events.filter((e) => e.at <= t && e.at < end)
  const hours = []
  for (let h = Math.ceil(start / 120) * 120; h <= end; h += 120) hours.push(h)
  return (
    <div className="relative select-none">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label="Time of the simulated day"
        aria-valuemin={start}
        aria-valuemax={end}
        aria-valuenow={Math.round(t)}
        aria-valuetext={clock(t)}
        className="relative h-[64px] cursor-pointer touch-none"
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
          if (e.key === 'ArrowRight') onSeek(Math.min(end, t + 15))
          if (e.key === 'ArrowLeft') onSeek(Math.max(start, t - 15))
        }}
      >
        {width > 0 && (
          <svg width={width} height={H} className="absolute inset-0 overflow-visible" aria-hidden="true">
            <defs>
              <clipPath id="sim-past">
                <rect x={0} y={0} width={x(t)} height={H} />
              </clipPath>
            </defs>
            {(['future', 'past'] as const).map((part) => (
              <g key={part} clipPath={part === 'past' ? 'url(#sim-past)' : undefined}>
                {blocks.map((b) => {
                  const w = Math.max(1, x(b.to) - x(b.from) - 2)
                  const h = 6 + (Math.min(9, blockMet(b)) / 9) * (H - 18)
                  return (
                    <rect
                      key={b.from}
                      x={x(b.from) + 1}
                      y={H - h}
                      width={w}
                      height={h}
                      rx={Math.min(4, w / 2)}
                      fill={part === 'past' ? HOLO : '#3d444d'}
                      fillOpacity={part === 'past' ? 0.78 : 1}
                    />
                  )
                })}
              </g>
            ))}
            {blocks
              .filter((b) => t >= b.from && t < b.to)
              .map((b) => {
                const h = 6 + (Math.min(9, blockMet(b)) / 9) * (H - 18)
                return (
                  <rect
                    key="now"
                    x={x(b.from) + 1}
                    y={H - h}
                    width={Math.max(1, x(b.to) - x(b.from) - 2)}
                    height={h}
                    rx={4}
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth={1.5}
                  />
                )
              })}
            {seen
              .filter((e) => e.level !== 'ok')
              .map((e) => (
                <circle
                  key={`${e.at}:${e.title}`}
                  cx={x(e.at)}
                  cy={5}
                  r={4}
                  fill={LEVEL_LINE[e.level]}
                  stroke="#0d0f12"
                  strokeWidth={2}
                />
              ))}
            <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="#ffffff" strokeWidth={2} />
            <circle cx={x(t)} cy={H} r={5} fill="#ffffff" />
          </svg>
        )}
      </div>
      <div className="relative mt-1.5 h-4 font-cond text-[11.5px] text-dim tabular-nums" aria-hidden="true">
        {width > 0 &&
          hours.map((h) => (
            <span key={h} className="absolute -translate-x-1/2" style={{ left: x(h) }}>
              {clock(h)}
            </span>
          ))}
      </div>
      {hovered && hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute bottom-[86px] z-10 w-max max-w-[260px] -translate-x-1/2 rounded-xl border border-line bg-raised px-3 py-2 text-[12.5px] shadow-[0_10px_28px_rgb(0_0_0/0.45)]"
          style={{ left: clamp(x(hover), 120, width - 120) }}
        >
          <p className="font-cond text-dim tabular-nums">
            {clock(hovered.from)} – {clock(hovered.to)} · {hovered.place}
          </p>
          <p className="mt-0.5 font-medium text-ink">{hovered.title}</p>
          <p className="text-dim">Effort {blockMet(hovered).toFixed(1)} METs (1 is sitting still)</p>
        </div>
      )}
    </div>
  )
}

/**
 * One measure over the day so far: a single line on its own axis, with optional reference lines,
 * a crosshair and a tooltip on hover, and the hourly values as a table for screen readers.
 */
function LineChart({
  sim,
  t,
  title,
  unit,
  value,
  domain,
  refs = [],
  format = (v) => String(v),
}: {
  sim: Simulation
  t: number
  title: string
  unit: string
  value: (s: Sample) => number | null
  domain: [number, number]
  refs?: { y: number; label: string }[]
  format?: (v: number) => string
}) {
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)
  const { start, end } = sim.scenario
  const H = 112
  const pad = { l: 34, r: 10, t: 8, b: 20 }
  const x = (m: number) => pad.l + ((m - start) / (end - start)) * (width - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - (v - domain[0]) / (domain[1] - domain[0])) * (H - pad.t - pad.b)
  const upto = sim.samples.slice(0, Math.floor(t) - start + 1)
  let d = ''
  let open = false
  for (const s of upto) {
    const v = value(s)
    if (v === null) {
      open = false
      continue
    }
    d += `${open ? 'L' : 'M'}${x(s.t).toFixed(1)} ${y(clamp(v, domain[0], domain[1])).toFixed(1)}`
    open = true
  }
  const last = [...upto].reverse().find((s) => value(s) !== null)
  const ticks = [domain[0], (domain[0] + domain[1]) / 2, domain[1]]
  const hoverSample = hover === null ? null : upto[Math.round(hover) - start]
  const hoverValue = hoverSample ? value(hoverSample) : null
  const hours = []
  for (let h = Math.ceil(start / 180) * 180; h <= end; h += 180) hours.push(h)
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="font-cond text-[12px] tracking-[0.12em] text-muted uppercase">{title}</span>
        {last && value(last) !== null && (
          <span className="font-cond text-[13px] text-ink tabular-nums">
            {format(value(last)!)} {unit}
          </span>
        )}
      </figcaption>
      <div
        ref={ref}
        className="relative mt-1"
        style={{ height: H }}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          const m = start + ((e.clientX - box.left - pad.l) / (box.width - pad.l - pad.r)) * (end - start)
          setHover(m >= start && m <= t ? m : null)
        }}
        onPointerLeave={() => setHover(null)}
      >
        {width > 0 && (
          <svg width={width} height={H} aria-hidden="true" className="absolute inset-0">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} stroke="#20242a" />
                <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10.5} fill="#8b939d">
                  {format(v)}
                </text>
              </g>
            ))}
            {hours.map((h) => (
              <text key={h} x={x(h)} y={H - 5} textAnchor="middle" fontSize={10.5} fill="#8b939d">
                {clock(h)}
              </text>
            ))}
            {refs.map((r) => (
              <g key={r.label}>
                <line
                  x1={pad.l}
                  x2={width - pad.r}
                  y1={y(r.y)}
                  y2={y(r.y)}
                  stroke="#aab1ba"
                  strokeDasharray="4 4"
                  strokeOpacity={0.7}
                />
                <text x={width - pad.r} y={y(r.y) - 4} textAnchor="end" fontSize={10.5} fill="#aab1ba">
                  {r.label}
                </text>
              </g>
            ))}
            <path
              d={d}
              fill="none"
              stroke={HOLO}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {last && value(last) !== null && (
              <circle
                cx={x(last.t)}
                cy={y(clamp(value(last)!, domain[0], domain[1]))}
                r={4.5}
                fill={HOLO}
                stroke="#15181c"
                strokeWidth={2}
              />
            )}
            {hoverSample && hoverValue !== null && (
              <g>
                <line
                  x1={x(hoverSample.t)}
                  x2={x(hoverSample.t)}
                  y1={pad.t}
                  y2={H - pad.b}
                  stroke="#ffffff"
                  strokeOpacity={0.35}
                />
                <circle
                  cx={x(hoverSample.t)}
                  cy={y(clamp(hoverValue, domain[0], domain[1]))}
                  r={4.5}
                  fill="#ffffff"
                  stroke="#15181c"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
        )}
        {hoverSample && hoverValue !== null && width > 0 && (
          <div
            className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[12px] shadow-[0_8px_22px_rgb(0_0_0/0.45)]"
            style={{ left: clamp(x(hoverSample.t), 70, width - 70) }}
          >
            <span className="font-cond text-dim tabular-nums">{clock(hoverSample.t)}</span>{' '}
            <span className="font-medium text-ink tabular-nums">
              {format(hoverValue)} {unit}
            </span>
            <span className="block text-dim">{sim.scenario.blocks[hoverSample.block]?.title}</span>
          </div>
        )}
      </div>
      <table className="sr-only">
        <caption>
          {title}, {unit}, every hour so far
        </caption>
        <tbody>
          {upto
            .filter((s) => (s.t - start) % 60 === 0 && value(s) !== null)
            .map((s) => (
              <tr key={s.t}>
                <th scope="row">{clock(s.t)}</th>
                <td>{format(value(s)!)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </figure>
  )
}

/** A heartbeat trace that scrolls at the pulse rate. */
function Beat({ bpm }: { bpm: number }) {
  const beat = 'l 14 0 l 4 -6 l 4 6 l 6 0 l 3 4 l 5 -34 l 5 40 l 4 -10 l 8 0 l 6 -8 l 6 8 l 15 0'
  const path = `M 0 50 ${Array.from({ length: 8 }, () => beat).join(' ')}`
  return (
    <svg viewBox="0 0 320 70" aria-hidden="true" className="h-12 w-full overflow-hidden">
      <g className="ar-ecg" style={{ animationDuration: `${(4 * 60) / Math.max(30, bpm)}s` }}>
        <path d={path} fill="none" stroke={HOLO} strokeWidth="2" strokeLinejoin="round" />
        <path
          d={path}
          transform="translate(320 0)"
          fill="none"
          stroke={HOLO}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

/** One reading as a large number. A value out of range gets its warning colour and an icon. */
function Stat({
  label,
  value,
  unit,
  level = 'ok',
  note,
  children,
}: {
  label: string
  value: string
  unit?: string
  level?: Level
  note?: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-line-soft bg-panel px-4 py-3">
      <p className="flex items-center gap-1.5 font-cond text-[12px] tracking-[0.12em] text-muted uppercase">
        {label}
        {level !== 'ok' && <LevelIcon level={level} size={13} />}
      </p>
      <p
        className="mt-1 font-cond text-[30px] leading-none font-semibold text-ink tabular-nums"
        style={level === 'ok' ? undefined : { color: LEVEL_LINE[level] }}
      >
        {value}
        {unit && <span className="ml-1 text-[13px] font-normal text-muted">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[12px] text-dim">{note}</p>}
      {children}
    </div>
  )
}

const pulseLevel = (bpm: number, max: number): Level =>
  bpm >= 0.95 * max ? 'act' : bpm >= 0.8 * max ? 'watch' : 'ok'

/**
 * The mission simulation: one day of the chosen destination, played minute by minute, with the
 * readings, the alerts of the monitoring rules and the person's list for the day changing as it goes.
 */
export default function SimulationScreen({
  member,
  mission,
  days,
  onStartTest,
}: {
  member: Member
  mission: MissionId
  days: Record<MissionId, number>
  onStartTest: (test: SelfTestId) => void
}) {
  const [id, setId] = useState<MissionId>(mission)
  const scenario = SCENARIOS[id]
  const day = days[id]
  const report = useDayReport(member, day, id)
  const sim = useMemo(
    () => simulate(scenario, personOf(report.readings), planDay({ report, mission: id })),
    [scenario, report, id],
  )
  const [t, setT] = useState(scenario.start)
  const time = useRef(scenario.start)
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(5)
  const [visor, setVisor] = useState(false)
  const closeVisor = useCallback(() => setVisor(false), [])

  const seek = (to: number) => {
    time.current = clamp(to, scenario.start, scenario.end)
    setT(time.current)
  }
  const choose = (next: MissionId) => {
    setId(next)
    time.current = SCENARIOS[next].start
    setT(time.current)
    setPlaying(true)
  }

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let painted = 0
    const step = (now: number) => {
      time.current = Math.min(scenario.end, time.current + ((now - last) / 1000) * speed)
      last = now
      const done = time.current >= scenario.end
      if (now - painted > 90 || done) {
        painted = now
        setT(time.current)
      }
      if (done) setPlaying(false)
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, scenario.end])

  const now = sampleAt(sim, t)
  const block = scenario.blocks[now.block] ?? scenario.blocks[scenario.blocks.length - 1]
  const next = scenario.blocks[now.block + 1]
  const seen = sim.events.filter((e) => e.at <= t)
  const upcoming = sim.events.find((e) => e.at > t + 0.5)
  const warning = [...seen].reverse().find((e) => e.level !== 'ok' && t - e.at <= 30)
  const tasks = sim.tasks
    .filter((x) => t >= x.shownFrom)
    .map((x) => ({ ...x, ...taskAt(x, t) }))
    .sort((a, b) => a.due - b.due || a.at - b.at)
  const done = tasks.filter((x) => x.state === 'done').length
  const outside = block.activity === 'eva'
  const ended = t >= scenario.end
  const live: LiveReadings = {
    bpm: now.bpm,
    spo2Pct: now.spo2Pct,
    systolic: now.systolic,
    diastolic: now.diastolic,
    coreTempC: now.coreTempC,
    glucoseMgDl: now.glucoseMgDl,
    sleepHours: sim.person.sleepHours,
    nextDrinkMin: nextDrink(sim, t),
    caption: `Simulation · ${clock(t)} · ${block.title}`,
    alert: warning ? { level: warning.level, text: warning.title } : null,
  }
  const doseUsual = (sim.usualRate * (t - scenario.start)) / 60 / 1000
  const waterGoal = scenario.waterGoalMl

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-4 pb-12 sm:px-6">
      {/* The four days, one per destination. */}
      <div role="group" aria-label="Scenario" className="flex flex-wrap gap-2">
        {MISSION_ORDER.map((m) => (
          <button
            key={m}
            onClick={() => choose(m)}
            aria-pressed={id === m}
            className={`press rounded-2xl border px-4 py-2.5 text-left ${id === m ? 'border-white bg-white text-[#0d0f12]' : 'border-line text-ink hover:bg-white/[0.05]'}`}
          >
            <span
              className={`block font-cond text-[11.5px] tracking-[0.14em] uppercase ${id === m ? 'text-[#0d0f12]/60' : 'text-dim'}`}
            >
              {MISSIONS[m].name} · day {days[m]}
            </span>
            <span className="block text-[14.5px] font-medium">{SCENARIOS[m].title}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 max-w-3xl text-[14px] text-muted">{scenario.summary}</p>

      {/* Playback. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button
          onClick={() => {
            if (ended) seek(scenario.start)
            setPlaying((p) => !p || ended)
          }}
          className="press flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-medium text-[#0d0f12]"
        >
          {playing ? <Pause size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          {playing ? 'Pause' : ended ? 'Play again' : 'Play'}
        </button>
        <div role="group" aria-label="Speed" className="flex rounded-full border border-line p-0.5">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              aria-pressed={speed === s}
              className={`press h-8 rounded-full px-3 font-cond text-[13px] tabular-nums ${speed === s ? 'bg-white/[0.14] text-ink' : 'text-muted hover:text-ink'}`}
            >
              {s} min/s
            </button>
          ))}
        </div>
        <button
          onClick={() => upcoming && seek(upcoming.at)}
          disabled={!upcoming}
          className="press flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[14px] text-ink hover:bg-white/[0.05] disabled:opacity-40"
        >
          <SkipForward size={16} />
          Next event
        </button>
        <button
          onClick={() => seek(scenario.start)}
          className="press flex h-10 items-center gap-2 rounded-full border border-line px-4 text-[14px] text-ink hover:bg-white/[0.05]"
        >
          <ArrowCounterClockwise size={16} />
          Restart
        </button>
        <button
          onClick={() => setVisor(true)}
          className={`press ml-auto flex h-10 items-center gap-2 rounded-full px-4 text-[14px] ${outside ? 'bg-holo font-medium text-[#0d0f12]' : 'border border-holo/60 text-holo hover:bg-holo/10'}`}
        >
          <Eyeglasses size={17} />
          {outside ? 'Spacewalk: see it in the visor' : 'Open the visor'}
        </button>
      </div>

      <div className="mt-5">
        <Timeline sim={sim} t={t} onSeek={seek} />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          {/* Now. */}
          <section aria-label="Now" className="rounded-2xl border border-line-soft bg-panel p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-cond text-[12px] tracking-[0.14em] text-dim uppercase">
                  Day {day} · {scenario.clock}
                </p>
                <p className="mt-1 font-cond text-[56px] leading-none font-semibold text-ink tabular-nums">
                  {clock(t)}
                </p>
              </div>
              <div className="min-w-0 flex-1 sm:text-right">
                <p className="text-[18px] leading-snug font-medium text-ink">{block.title}</p>
                <p className="text-[13.5px] text-muted">
                  {block.place} · {scenario.place}
                </p>
                {next && (
                  <p className="mt-1 text-[13px] text-dim">
                    Next at {clock(next.from)}: {next.title}
                  </p>
                )}
              </div>
            </div>
            <AnimatePresence>
              {warning && (
                <motion.p
                  key={`${warning.at}:${warning.title}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-xl px-3 py-2 text-[14px]"
                  style={{ background: `${LEVEL_LINE[warning.level]}1f`, color: LEVEL_LINE[warning.level] }}
                >
                  <WarningCircle size={18} weight="fill" className="mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">
                      {clock(warning.at)} · {warning.title}.
                    </span>{' '}
                    <span className="text-ink/85">{warning.detail}</span>
                  </span>
                </motion.p>
              )}
            </AnimatePresence>
          </section>

          {/* The body. */}
          <section aria-label="Heart" className="rounded-2xl border border-line-soft bg-panel p-5">
            <div className="grid items-end gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <div>
                <p className="flex items-center gap-1.5 font-cond text-[12px] tracking-[0.12em] text-muted uppercase">
                  Heart rate
                  {pulseLevel(now.bpm, sim.person.maxBpm) !== 'ok' && (
                    <LevelIcon level={pulseLevel(now.bpm, sim.person.maxBpm)} size={13} />
                  )}
                </p>
                <p
                  className="font-cond text-[64px] leading-none font-semibold tabular-nums"
                  style={{
                    color:
                      pulseLevel(now.bpm, sim.person.maxBpm) === 'ok'
                        ? '#f4f5f6'
                        : LEVEL_LINE[pulseLevel(now.bpm, sim.person.maxBpm)],
                  }}
                >
                  {now.bpm}
                  <span className="ml-1.5 text-[16px] font-normal text-muted">bpm</span>
                </p>
                <p className="mt-1 text-[12.5px] text-dim">
                  {Math.round((100 * now.bpm) / sim.person.maxBpm)}% of maximum · rest {sim.person.restingBpm}
                </p>
              </div>
              <Beat bpm={now.bpm} />
            </div>
            <div className="mt-4">
              <LineChart
                sim={sim}
                t={t}
                title="Heart rate today"
                unit="bpm"
                value={(s) => s.bpm}
                domain={[40, 190]}
                refs={[{ y: Math.round(0.8 * sim.person.maxBpm), label: '80% of maximum' }]}
              />
            </div>
          </section>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat
              label="Blood oxygen"
              value={String(now.spo2Pct)}
              unit="%"
              level={now.spo2Pct < 90 ? 'act' : now.spo2Pct < 94 ? 'watch' : 'ok'}
            />
            <Stat label="Blood pressure" value={`${now.systolic}/${now.diastolic}`} unit="mmHg" />
            <Stat label="Breathing" value={String(now.breaths)} unit="/min" />
            <Stat
              label="Core temperature"
              value={now.coreTempC.toFixed(1)}
              unit="°C"
              level={now.coreTempC >= 38.5 ? 'act' : now.coreTempC >= 38 ? 'watch' : 'ok'}
            />
            <Stat
              label="Blood sugar"
              value={String(now.glucoseMgDl)}
              unit="mg/dL"
              level={now.glucoseMgDl < 70 ? 'watch' : 'ok'}
            />
            <Stat
              label="Water today"
              value={(now.waterMl / 1000).toFixed(1)}
              unit={`of ${(waterGoal / 1000).toFixed(1)} L`}
            >
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full rounded-full bg-holo"
                  style={{ width: `${Math.min(100, (100 * now.waterMl) / waterGoal)}%` }}
                />
              </div>
            </Stat>
          </div>

          {/* The air and the radiation around the person. */}
          <section aria-label="Environment" className="rounded-2xl border border-line-soft bg-panel p-5">
            <div className="grid gap-6 md:grid-cols-2">
              {outside && now.suitCo2MmHg !== null ? (
                <LineChart
                  sim={sim}
                  t={t}
                  title="Suit CO2"
                  unit="mmHg"
                  value={(s) => s.suitCo2MmHg}
                  domain={[0, 6]}
                  refs={[{ y: 4.5, label: 'walk ends' }]}
                  format={(v) => v.toFixed(1)}
                />
              ) : (
                <LineChart
                  sim={sim}
                  t={t}
                  title="Cabin CO2"
                  unit="mmHg"
                  value={(s) => s.co2MmHg}
                  domain={[0, 6]}
                  refs={[{ y: 3, label: 'limit' }]}
                  format={(v) => v.toFixed(1)}
                />
              )}
              <LineChart
                sim={sim}
                t={t}
                title="Radiation dose rate"
                unit="µSv/h"
                value={(s) => s.doseRate}
                domain={[0, Math.max(200, ...sim.samples.map((s) => s.doseRate)) * 1.1]}
                refs={[{ y: sim.usualRate, label: 'usual here' }]}
                format={(v) => String(Math.round(v))}
              />
            </div>
            <p className="mt-3 text-[13px] text-muted">
              Dose since waking {now.doseMSv.toFixed(2)} mSv
              {now.doseMSv > 1.5 * doseUsual && doseUsual > 0
                ? `, ${(now.doseMSv / doseUsual).toFixed(1)}× a usual day so far`
                : ''}
              . Effort now {now.met.toFixed(1)} METs.
            </p>
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          {/* The list of the day. */}
          <section aria-label="To do today" className="rounded-2xl border border-line-soft bg-panel p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-[17px] font-semibold">To do today</h3>
              <p className="font-cond text-[13px] text-muted tabular-nums">
                {done} of {tasks.length} done
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-white transition-[width] duration-300"
                style={{ width: `${tasks.length ? (100 * done) / tasks.length : 0}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1">
              <AnimatePresence initial={false}>
                {tasks.map((x) => {
                  const fresh = x.from === 'monitor' || x.shownFrom > scenario.start
                  const isNew = fresh && t - x.shownFrom < 25 && x.state !== 'done'
                  return (
                    <motion.li
                      key={x.id}
                      layout="position"
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className={`flex gap-3 rounded-xl px-2 py-2 ${isNew ? 'bg-holo/[0.09]' : ''}`}
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
                          {x.from === 'monitor' && (
                            <span className="text-holo">Added at {clock(x.shownFrom)} by Pulsar</span>
                          )}
                          {x.from === 'checkup' && <span className="text-dim">Your check-up</span>}
                          {x.moved && x.move && (
                            <span style={{ color: LEVEL_LINE.watch }}>{x.move.reason}</span>
                          )}
                          {x.test && x.state !== 'done' && (
                            <button
                              onClick={() => onStartTest(x.test!)}
                              className="text-holo underline underline-offset-2 hover:text-white"
                            >
                              Try the real test
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          </section>

          {/* What happened. */}
          <section aria-label="Events" className="rounded-2xl border border-line-soft bg-panel p-5">
            <h3 className="text-[17px] font-semibold">Events</h3>
            <ol className="mt-3 max-h-[440px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
              <AnimatePresence initial={false}>
                {[...seen].reverse().map((e: SimEvent) => (
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
                      <p className="font-cond text-[11.5px] tracking-wide text-dim/80">
                        {e.from === 'monitor' ? 'Read by Pulsar from the values' : 'Mission'}
                      </p>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
          </section>
        </div>
      </div>

      <p className="mt-6 max-w-4xl text-[12.5px] text-dim">
        A simulated day. The body model and the events are invented for the demonstration; the CO2 limit, the
        dose rates and the spacewalk effort are the app’s sourced figures, and the list mixes {member.short}’s
        own check-up of day {day} with the mission plan and the tasks Pulsar adds when a value goes out of
        range.
      </p>

      {/* Over the whole screen: outside this panel, which moves when it opens. */}
      {createPortal(
        <AnimatePresence>
          {visor && (
            <ArVisor key="visor" member={member} mission={id} day={day} live={live} onClose={closeVisor} />
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
