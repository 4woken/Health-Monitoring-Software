import { useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowCounterClockwise, CaretDown, Flask } from '@phosphor-icons/react'
import { SOURCES } from '../health/sources'
import {
  GRAVITY_PRESETS,
  MARS_PROFILE_PUBLISHED_SV,
  PARAMETERS,
  boneRatePerDay,
  daysToCareerLimit,
  daysToLoss,
  muscleRatePerDay,
  type MissionPhase,
  type ProfilePoint,
} from './physiology'
import { AnimatedNumber, EASE, SectionHeader, Segmented, Slider } from '../ui'

export type ProfileId = 'setting' | 'iss' | 'mars'

export interface SimInput {
  gravity: number
  doseRateMSvDay: number
  exercise: number
}

interface Props {
  settingName: string
  profile: ProfileId
  onProfile: (p: ProfileId) => void
  input: SimInput
  onInput: (i: SimInput) => void
  /** True when the sliders still match the active environment and crew member. */
  linked: boolean
  onReset: () => void
  /** Name of the crew member whose exercise log set the default. */
  person?: string
  phases: MissionPhase[]
  points: ProfilePoint[]
  cursor: number
  onCursor: (day: number) => void
}

const DOSE_TICKS = [
  { value: 0.67, label: 'Mars' },
  { value: 1.37, label: 'Moon' },
  { value: 1.8, label: 'Cruise' },
]

type MetricKey = 'fluid' | 'bone' | 'muscle' | 'dose'
interface MetricDef {
  key: MetricKey
  label: string
  unit: string
  decimals: number
  value: (p: ProfilePoint) => number
  /** Line drawn on the chart, for example the career dose limit. */
  limit?: { value: number; label: string }
  sources: string[]
  floor?: number
}

const METRICS: MetricDef[] = [
  {
    key: 'fluid',
    label: 'Fluid moved toward the head',
    unit: 'L',
    decimals: 2,
    value: (p) => p.fluidShiftL,
    sources: ['FLUID_SHIFT', 'FLUID_SHIFT_TIME', 'GRAVITY_PARTIAL'],
    floor: 0,
  },
  {
    key: 'bone',
    label: 'Hip and spine bone density',
    unit: '% of pre-flight',
    decimals: 1,
    value: (p) => p.bonePct,
    sources: ['BONE_LOSS', 'BONE_EXERCISE'],
  },
  {
    key: 'muscle',
    label: 'Calf muscle volume',
    unit: '% of pre-flight',
    decimals: 1,
    value: (p) => p.musclePct,
    sources: ['MUSCLE_ISS', 'MUSCLE_BEDREST'],
  },
  {
    key: 'dose',
    label: 'Radiation dose in this scenario',
    unit: 'mSv',
    decimals: 0,
    value: (p) => p.doseMSv,
    limit: { value: PARAMETERS.careerLimitMSv.value, label: 'NASA career limit' },
    sources: ['RAD_RATE', 'RAD_MARS_SURFACE', 'RAD_LIMIT'],
    floor: 0,
  },
]

const W = 420
const H = 112
const PAD_TOP = 14

/** Area chart over the mission, with phase bands and a draggable day cursor. */
function ProfileChart({
  def,
  points,
  phases,
  cursor,
  onCursor,
}: {
  def: MetricDef
  points: ProfilePoint[]
  phases: MissionPhase[]
  cursor: number
  onCursor: (d: number) => void
}) {
  const id = useId()
  const box = useRef<SVGSVGElement>(null)
  const n = points.length - 1
  const values = points.map(def.value)
  const all = def.limit ? [...values, def.limit.value] : values
  let lo = Math.min(...all)
  let hi = Math.max(...all)
  if (def.floor !== undefined) lo = Math.min(lo, def.floor)
  if (hi - lo < 1e-6) {
    hi += 1
    lo -= def.floor === undefined ? 1 : 0
  }
  const x = (d: number) => (n === 0 ? 0 : (d / n) * W)
  const y = (v: number) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * (H - PAD_TOP - 4)
  // Keep the path light: at most about 240 vertices.
  const step = Math.max(1, Math.ceil(points.length / 240))
  const pts: string[] = []
  for (let i = 0; i <= n; i += step) pts.push(`${x(i).toFixed(1)},${y(values[i]).toFixed(1)}`)
  if (n % step !== 0) pts.push(`${x(n).toFixed(1)},${y(values[n]).toFixed(1)}`)
  const line = `M${pts.join(' L')}`
  const area = `${line} L${W},${H} L0,${H} Z`
  const c = Math.min(n, Math.max(0, cursor))

  let start = 0
  const bands = phases.map((ph, i) => {
    const from = start
    start += ph.days
    return { i, from, to: start, label: ph.label }
  })

  const pick = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    onCursor(Math.round(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * n))
  }

  return (
    <svg
      ref={box}
      viewBox={`0 0 ${W} ${H}`}
      className="h-28 w-full cursor-ew-resize touch-none overflow-visible"
      preserveAspectRatio="none"
      onPointerDown={(e) => {
        ;(e.target as Element).setPointerCapture?.(e.pointerId)
        pick(e.clientX)
      }}
      onPointerMove={(e) => e.buttons > 0 && pick(e.clientX)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FD6FF" stopOpacity="0.32" />
          <stop offset="1" stopColor="#7FD6FF" stopOpacity="0" />
        </linearGradient>
      </defs>
      {bands.length > 1 &&
        bands.map((b) => (
          <g key={b.i}>
            {b.i % 2 === 1 && (
              <rect
                x={x(b.from)}
                y={0}
                width={x(b.to) - x(b.from)}
                height={H}
                fill="rgb(255 255 255 / 0.035)"
              />
            )}
            <text
              x={x(b.from) + 4}
              y={9}
              fill="rgb(155 168 187 / 0.75)"
              fontSize="10"
              fontFamily="Barlow Semi Condensed, sans-serif"
            >
              {b.label}
            </text>
          </g>
        ))}
      {def.limit && (
        <g>
          <line
            x1={0}
            x2={W}
            y1={y(def.limit.value)}
            y2={y(def.limit.value)}
            stroke="#FF6374"
            strokeOpacity="0.7"
            strokeDasharray="3 4"
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={W - 4}
            y={y(def.limit.value) - 4}
            textAnchor="end"
            fill="#FF6374"
            fontSize="10"
            fontFamily="Barlow Semi Condensed, sans-serif"
          >
            {def.limit.value} mSv limit
          </text>
        </g>
      )}
      <path d={area} fill={`url(#${id}-a)`} />
      <path d={line} fill="none" stroke="#BFEAFF" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <line
        x1={x(c)}
        x2={x(c)}
        y1={0}
        y2={H}
        stroke="#FFFFFF"
        strokeOpacity="0.55"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        cx={x(c)}
        cy={y(values[c])}
        r="3.2"
        fill="#FFFFFF"
        stroke="#7FD6FF"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function MetricCard({
  def,
  points,
  phases,
  cursor,
  onCursor,
}: {
  def: MetricDef
  points: ProfilePoint[]
  phases: MissionPhase[]
  cursor: number
  onCursor: (d: number) => void
}) {
  const now = points[Math.min(points.length - 1, Math.max(0, cursor))]
  const end = points[points.length - 1]
  const value = def.value(now)
  const change =
    def.key === 'bone' || def.key === 'muscle'
      ? `${(value - 100).toFixed(1)}% since scenario start`
      : def.key === 'dose'
        ? `${(now.doseCareerShare * 100).toFixed(0)}% of the career limit`
        : `${Math.round(now.fluidShiftShare * 100)}% of the full weightless shift`
  const demo = def.sources.some((s) => SOURCES[s]?.status === 'demo')
  return (
    <div className="glass-soft flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="label">{def.label}</p>
        {demo && (
          <span className="rounded border border-dashed border-line-strong px-1.5 py-0.5 font-cond text-[12px] text-muted">
            Uses one of our assumptions
          </span>
        )}
      </div>
      <p className="display mt-3 text-[40px]">
        <AnimatedNumber value={value} decimals={def.decimals} />
        <span className="ml-1.5 text-[13px] font-normal tracking-normal text-muted">{def.unit}</span>
      </p>
      <p className="mt-1 text-xs text-muted">
        Day {now.day}: {change}
      </p>
      <div className="mt-3">
        <ProfileChart def={def} points={points} phases={phases} cursor={cursor} onCursor={onCursor} />
      </div>
      <div className="mt-2 flex items-center justify-between font-cond text-[12.5px] text-dim">
        <span>Day 0</span>
        <span>
          End, day {end.day}: {def.value(end).toFixed(def.decimals)}{' '}
          {def.unit === 'L' || def.unit === 'mSv' ? def.unit : '%'}
        </span>
      </div>
      <p className="mt-3 flex flex-wrap gap-1.5">
        {def.sources.map((s) => {
          const src = SOURCES[s]
          if (!src) return null
          const short = src.title.split(/[,:(]/)[0].trim()
          return src.url ? (
            <a
              key={s}
              href={src.url}
              target="_blank"
              rel="noreferrer"
              title={src.says}
              className={`rounded border px-1.5 py-0.5 text-[12.5px] hover:text-ink ${src.status === 'demo' ? 'border-dashed border-line-strong text-dim' : 'border-line-strong text-muted'}`}
            >
              {short.length > 42 ? `${short.slice(0, 40)}…` : short}
            </a>
          ) : null
        })}
      </p>
    </div>
  )
}

/** Equations, parameters and their sources, for anyone who wants to check the model. */
function ModelCard({ marsCheckSv }: { marsCheckSv: number | null }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-6 border-t border-line-soft pt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="press flex w-full items-center justify-between gap-3 rounded-xl py-1 text-left"
      >
        <span className="flex items-center gap-2.5">
          <Flask size={18} className="text-accent" />
          <span className="font-medium">How the model works</span>
          <span className="hidden text-sm text-muted sm:inline">
            4 equations, {Object.keys(PARAMETERS).length} parameters, every one sourced
          </span>
        </span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} className="text-muted">
          <CaretDown size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="grid gap-6 pt-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <div className="space-y-4">
                {[
                  [
                    'Fluid shift',
                    'V(t) = 2.0 L × f(g) × (1 − e^(−t / 0.5 d))',
                    'f(g): straight lines through neck-vein areas measured at 1 g, ¼ g and lying flat (1 → 0.62 → 0).',
                  ],
                  [
                    'Bone density',
                    'BMD(t) = BMD₀ × e^(−k_b t),  k_b = −ln(1 − 1.25% × (1 − 0.5 e)) / 30.44 d × (1 − g)',
                    'e is the share of the resistance programme done. The loss compounds day by day.',
                  ],
                  [
                    'Calf muscle',
                    'Vol(t) = Vol₀ × e^(−k_m t),  k_m = k_ex × (29/15 − (29/15 − 1) e) × (1 − g)',
                    'k_ex is fitted to −13% after 180 days on the ISS with exercise; without exercise bed rest loses about twice as much.',
                  ],
                  [
                    'Radiation',
                    'D(t) = Ḋ × t,  limit 600 mSv',
                    'Ḋ is the measured dose rate of the setting. Solar storms are not modelled.',
                  ],
                ].map(([name, eq, note]) => (
                  <div key={name}>
                    <p className="label">{name}</p>
                    <p className="mt-1.5 overflow-x-auto rounded-md border border-line bg-ground px-3 py-2 font-cond text-[14px] whitespace-nowrap text-ink">
                      {eq}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>
                  </div>
                ))}
                {marsCheckSv !== null && (
                  <p className="rounded-xl border border-accent/25 bg-accent/[0.06] px-3 py-2.5 text-xs leading-relaxed text-ink">
                    <span className="mr-2 font-semibold">Model check.</span>
                    For a 180-day cruise, 500 days on Mars and a 180-day return the engine adds up{' '}
                    {marsCheckSv.toFixed(2)} Sv. Published estimate from Curiosity measurements:{' '}
                    {MARS_PROFILE_PUBLISHED_SV.value} Sv.
                  </p>
                )}
              </div>
              <div>
                <p className="label">Parameters</p>
                <ul className="mt-2 divide-y divide-line-soft rounded-2xl border border-line">
                  {Object.entries(PARAMETERS).map(([key, p]) => {
                    const src = SOURCES[p.sourceId]
                    return (
                      <li key={key} className="flex items-start gap-3 px-3 py-2.5 text-xs">
                        <span className="w-20 shrink-0 font-cond text-[14px] text-ink tabular-nums">
                          {Number.isInteger(p.value) ? p.value : p.value.toFixed(2)}{' '}
                          <span className="text-dim">{p.unit}</span>
                        </span>
                        <span className="min-w-0 flex-1 leading-relaxed text-muted">
                          {p.note}{' '}
                          {src?.url ? (
                            <a
                              href={src.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink"
                            >
                              {src.title.split(/[,:(]/)[0].trim()}
                            </a>
                          ) : (
                            <span className="text-ink">{src?.title}</span>
                          )}
                        </span>
                        {p.demo && (
                          <span className="shrink-0 rounded border border-dashed border-line-strong px-1.5 py-0.5 font-cond text-[12px] text-muted">
                            our assumption
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ul>
                <p className="mt-3 text-xs leading-relaxed text-dim">
                  An educational model to show trends and orders of magnitude. It does not predict what will
                  happen to a real person, and recovery after landing is not modelled.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/** What-if simulator: choose a mission profile, gravity, exercise and dose rate; see the body react. */
export default function PhysiologyLab({
  settingName,
  profile,
  onProfile,
  input,
  onInput,
  linked,
  onReset,
  person,
  phases,
  points,
  cursor,
  onCursor,
}: Props) {
  const total = points.length - 1
  const fixedPhases = profile !== 'setting'
  const careerDay = daysToCareerLimit(input.doseRateMSvDay)
  const calfDay = daysToLoss(muscleRatePerDay(input.gravity, input.exercise), 10)
  const boneDay = daysToLoss(boneRatePerDay(input.gravity, input.exercise), 5)
  const marsCheck = useMemo(
    () => (profile === 'mars' ? points[points.length - 1].doseMSv / 1000 : null),
    [profile, points],
  )
  const days = (d: number | null) =>
    d === null ? 'never at this setting' : d > 3650 ? 'after 10 years' : `day ${Math.round(d)}`

  return (
    <section className="@container" aria-label="Physiology simulator">
      <SectionHeader
        title="Physiology simulator"
        detail="Gravity, exercise and radiation drive these illustrative projections. Long-term partial-gravity effects on a person remain unvalidated."
        action={
          <Segmented
            label="Mission profile"
            value={profile}
            onChange={onProfile}
            options={[
              { id: 'setting', label: 'This mission' },
              { id: 'iss', label: 'ISS 6 months' },
              { id: 'mars', label: 'Mars mission' },
            ]}
          />
        }
      />

      <div className="mt-7 grid gap-6 @3xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {linked ? (
              <span className="flex items-center gap-2 rounded border border-line-strong px-2.5 py-1 text-[13px] text-muted">
                <span className="live-dot" aria-hidden="true" />
                Linked to {settingName}
                {person ? ` and ${person}'s exercise log` : ''}
              </span>
            ) : (
              <>
                <span className="rounded border border-accent/60 px-2.5 py-1 text-[13px] text-ink">
                  What-if values
                </span>
                <button
                  onClick={onReset}
                  className="press flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-muted hover:text-ink"
                >
                  <ArrowCounterClockwise size={13} />
                  Reset
                </button>
              </>
            )}
          </div>

          <Slider
            label="Gravity"
            value={fixedPhases ? phases[0].gravity : input.gravity}
            min={0}
            max={1}
            step={0.01}
            onChange={(g) => onInput({ ...input, gravity: g })}
            format={(g) => (g === 0 ? '0 g, weightless' : `${g.toFixed(2)} g`)}
            ticks={GRAVITY_PRESETS.map((p) => ({ value: p.gravity, label: p.label }))}
            disabled={fixedPhases}
            hint={fixedPhases ? 'Set by each phase of this mission profile.' : undefined}
          />
          <Slider
            label="Exercise programme done"
            value={Math.round(input.exercise * 100)}
            min={0}
            max={100}
            step={5}
            onChange={(v) => onInput({ ...input, exercise: v / 100 })}
            format={(v) => `${v}%`}
            hint="100% is the full onboard programme; 0% is none."
          />
          <Slider
            label="Radiation dose rate"
            value={fixedPhases ? phases[0].doseRateMSvDay : input.doseRateMSvDay}
            min={0}
            max={2.5}
            step={0.01}
            onChange={(d) => onInput({ ...input, doseRateMSvDay: d })}
            format={(d) => `${d.toFixed(2)} mSv/day`}
            ticks={DOSE_TICKS}
            disabled={fixedPhases}
            hint={fixedPhases ? 'Set by each phase: 1.8 in cruise, 0.67 on the surface.' : undefined}
          />
          <Slider
            label="Projection day"
            value={Math.min(cursor, total)}
            min={0}
            max={total}
            step={1}
            onChange={onCursor}
            format={(d) => `day ${d} / ${total}`}
            hint="Drag here or on any chart. The 3D body follows this day."
          />

          <dl className="space-y-2.5 rounded-2xl border border-line bg-black/20 p-4 text-xs">
            {[
              ['Career dose limit reached', days(careerDay)],
              ['Calf muscle down 10%', days(calfDay)],
              ['Bone density down 5%', days(boneDay)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-muted">{k}</dt>
                <dd className="font-cond text-[15px] text-ink">{v}</dd>
              </div>
            ))}
            <p className="pt-1 text-[11px] leading-snug text-dim">
              At the gravity, exercise and dose rate set above.
            </p>
          </dl>
        </div>

        <div className="grid gap-4 @lg:grid-cols-2">
          {METRICS.map((def) => (
            <MetricCard
              key={def.key}
              def={def}
              points={points}
              phases={phases}
              cursor={cursor}
              onCursor={onCursor}
            />
          ))}
        </div>
      </div>

      <ModelCard marsCheckSv={marsCheck} />
    </section>
  )
}
