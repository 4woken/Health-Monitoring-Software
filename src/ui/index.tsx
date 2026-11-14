import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { X } from '@phosphor-icons/react'
import type { Level } from '../health/signals'

// Shared building blocks for the Orbital medical bay design. Screens compose these instead of
// re-creating panels, labels and controls. Colour rule: amber and red only for signal status.

export const CAPS = 'label'
export const SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const
export const SOFT_SPRING = { type: 'spring', stiffness: 160, damping: 24 } as const
export const EASE = [0.16, 1, 0.3, 1] as const

const LEVEL_LABEL: Record<Level, string> = { ok: 'Normal', watch: 'Check', act: 'Urgent' }
const LEVEL_CHIP: Record<Level, string> = {
  ok: 'border-line-strong text-muted',
  watch: 'border-check/30 bg-check-bg text-check',
  act: 'border-urgent/35 bg-urgent-bg text-urgent',
}
export const LEVEL_LINE: Record<Level, string> = { ok: '#A6AFBA', watch: '#F0A73A', act: '#F25757' }
export const LEVEL_TEXT: Record<Level, string> = {
  ok: 'text-muted',
  watch: 'text-check',
  act: 'text-urgent',
}

/** The Pulsar mark: a star and its two beams, which sweep past with the most regular pulse in the sky. */
export function Mark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      width={size}
      height={size}
      src="/brand/pulsar-mark.svg"
      alt=""
      aria-hidden="true"
      className={className}
    />
  )
}

/** The mark alone, or with the name next to it. */
export function Logo({ size = 28, variant = 'mark' }: { size?: number; variant?: 'mark' | 'full' }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-2 text-white" role="img" aria-label="Pulsar">
      <Mark size={size} />
      {variant === 'full' && (
        <span
          aria-hidden="true"
          className="font-semibold tracking-[0.075em]"
          style={{ fontSize: size * 0.72 }}
        >
          PULSAR
        </span>
      )}
    </span>
  )
}

export function Chip({ level, className = '', tag }: { level: Level; className?: string; tag?: string }) {
  return (
    <span
      className={`inline-flex h-6 min-w-[58px] items-center justify-center gap-1.5 rounded border px-2 font-cond text-[12.5px] font-medium ${LEVEL_CHIP[level]} ${className}`}
    >
      {level !== 'ok' && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {tag && <span className="font-normal opacity-70">{tag}</span>}
      {LEVEL_LABEL[level]}
    </span>
  )
}

/** Small round status light. */
export function StatusDot({ level, className = '' }: { level: Level; className?: string }) {
  const color = level === 'act' ? 'bg-urgent' : level === 'watch' ? 'bg-check' : 'bg-muted/60'
  return (
    <span className={`relative inline-flex h-2 w-2 ${className}`} aria-hidden="true">
      {level !== 'ok' && <span className={`marker-ring absolute inset-0 rounded-full ${color}`} />}
      <span className={`relative h-2 w-2 rounded-full ${color}`} />
    </span>
  )
}

type ButtonKind = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'
const BUTTON: Record<ButtonKind, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
}
const SIZE: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3.5 text-[13px]',
  md: 'min-h-11 px-5 text-sm',
  lg: 'min-h-13 px-7 text-[15px]',
}

export function Button({
  kind = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: {
  kind?: ButtonKind
  size?: ButtonSize
  children: ReactNode
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`press inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap disabled:opacity-40 ${SIZE[size]} ${BUTTON[kind]} ${className}`}
    >
      {children}
    </button>
  )
}

/** A glass panel. Pass `glow` for the environment-tinted edge light. */
export function Panel({
  children,
  className = '',
  glow = false,
  strong = false,
  as: Tag = 'section',
  ...rest
}: {
  children: ReactNode
  className?: string
  glow?: boolean
  strong?: boolean
  as?: 'section' | 'div' | 'aside' | 'article'
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      {...rest}
      className={`${strong ? 'glass-strong' : 'glass'} ${glow ? 'glass-glow' : ''} ${className}`}
    >
      {children}
    </Tag>
  )
}

/** Eyebrow label, title and optional action, for the top of a panel or page section. */
export function SectionHeader({
  eyebrow,
  title,
  accent,
  detail,
  action,
  className = '',
  size = 'md',
}: {
  eyebrow?: string
  title: ReactNode
  /** Words shown after the title in the italic serif. */
  accent?: string
  detail?: ReactNode
  action?: ReactNode
  className?: string
  size?: 'sm' | 'md' | 'xl'
}) {
  const titleSize =
    size === 'xl' ? 'headline' : size === 'md' ? 'text-[26px] leading-tight tracking-[-0.03em]' : 'text-base'
  return (
    <div className={`flex flex-wrap items-end justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="label label-accent">{eyebrow}</p>}
        <h2 className={`${titleSize} ${eyebrow ? 'mt-2' : ''} font-medium`}>
          {title}
          {accent && <span className="serif text-muted"> {accent}</span>}
        </h2>
        {detail && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

/** A number that counts to its new value, so a change is seen, not missed. */
export function AnimatedNumber({
  value,
  className,
  decimals = 0,
}: {
  value: number
  className?: string
  decimals?: number
}) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => v.toFixed(decimals))
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: EASE })
    return () => controls.stop()
  }, [mv, value])
  return <motion.span className={className}>{text}</motion.span>
}

/** Big instrument number with unit and label. */
export function Readout({
  label,
  value,
  unit,
  decimals = 0,
  detail,
  level = 'ok',
  size = 'md',
}: {
  label: string
  value: number
  unit?: string
  decimals?: number
  detail?: ReactNode
  level?: Level
  size?: 'sm' | 'md' | 'lg'
}) {
  const text = size === 'lg' ? 'text-[56px]' : size === 'md' ? 'text-[36px]' : 'text-[26px]'
  return (
    <div className="min-w-0">
      <p className="label">{label}</p>
      <p className={`display mt-2 ${text} ${level === 'ok' ? 'text-ink' : LEVEL_TEXT[level]}`}>
        <AnimatedNumber value={value} decimals={decimals} />
        {unit && (
          <span className="ml-1.5 align-baseline text-[0.36em] font-normal tracking-normal text-muted">
            {unit}
          </span>
        )}
      </p>
      {detail && <p className="mt-1.5 text-xs leading-snug text-dim">{detail}</p>}
    </div>
  )
}

export function Sparkline({
  values,
  baseline,
  color,
  width = 120,
  height = 28,
  fill = false,
}: {
  values: number[]
  baseline?: number
  color: string
  width?: number
  height?: number
  fill?: boolean
}) {
  const id = useId()
  if (values.length === 0) return null
  const all = baseline === undefined ? values : [...values, baseline]
  const lo = Math.min(...all)
  const hi = Math.max(...all)
  const flat = hi === lo
  const y = (v: number) => (flat ? height / 2 : height - 4 - ((v - lo) / (hi - lo)) * (height - 8))
  const x = (i: number) => (values.length === 1 ? width / 2 : (i * width) / (values.length - 1))
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <defs>
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline !== undefined && (
        <line
          x1="0"
          x2={width}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="rgb(190 215 255 / 0.25)"
          strokeDasharray="2 3"
        />
      )}
      {fill && values.length > 1 && (
        <path d={`${d} L${width} ${height} L0 ${height} Z`} fill={`url(#${id}-f)`} />
      )}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r="2.4" fill={color} />
    </svg>
  )
}

/** Ring gauge. `fraction` is 0 to 1. */
export function Gauge({
  label,
  value,
  unit,
  fraction,
  level,
  note,
  size = 144,
}: {
  label: string
  value: string
  unit: string
  fraction: number
  level: Level
  note: string
  size?: number
}) {
  const id = useId()
  const r = 54
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, fraction))
  const stroke = level === 'ok' ? '#ECEFF2' : LEVEL_LINE[level]
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="1" stopColor="#7FD6FF" />
            </linearGradient>
          </defs>
          <circle cx="64" cy="64" r={r} fill="none" stroke="rgb(190 215 255 / 0.1)" strokeWidth="4" />
          <circle
            cx="64"
            cy="64"
            r={r + 7}
            fill="none"
            stroke="rgb(190 215 255 / 0.12)"
            strokeWidth="0.75"
            strokeDasharray="1 4"
          />
          <motion.circle
            cx="64"
            cy="64"
            r={r}
            fill="none"
            stroke={stroke}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - f) }}
            transition={{ duration: 1, ease: EASE }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="display text-[30px]">{value}</span>
          <span className="mt-1 text-[11px] text-muted">{unit}</span>
        </div>
      </div>
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-0.5 max-w-52 text-xs text-muted">{note}</p>
      </div>
    </div>
  )
}

/** Thin horizontal meter, 0 to 1, with optional marks (also 0 to 1). */
export function Meter({
  value,
  level = 'ok',
  marks = [],
  className = '',
}: {
  value: number
  level?: Level
  marks?: number[]
  className?: string
}) {
  const v = Math.max(0, Math.min(1, value))
  const bar = level === 'ok' ? 'bg-ink/80' : level === 'watch' ? 'bg-check' : 'bg-urgent'
  return (
    <div className={`relative h-1.5 w-full overflow-hidden rounded-sm bg-white/[0.08] ${className}`}>
      <motion.div
        className={`absolute inset-y-0 left-0 ${bar}`}
        initial={{ width: 0 }}
        animate={{ width: `${v * 100}%` }}
        transition={{ duration: 0.8, ease: EASE }}
      />
      {marks.map((m) => (
        <span key={m} className="absolute inset-y-0 w-px bg-white/30" style={{ left: `${m * 100}%` }} />
      ))}
    </div>
  )
}

/** Segmented control with a sliding thumb. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className = '',
  size = 'md',
}: {
  value: T
  options: { id: T; label: ReactNode }[]
  onChange: (v: T) => void
  label: string
  className?: string
  size?: 'sm' | 'md'
}) {
  const id = useId()
  return (
    <div
      role="group"
      aria-label={label}
      className={`relative inline-flex rounded-full bg-white/[0.07] p-1 ${className}`}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`press relative flex-1 rounded-full font-medium whitespace-nowrap ${size === 'sm' ? 'min-h-8 px-3 text-[13px]' : 'min-h-10 px-4 text-sm'}`}
        >
          {value === o.id && (
            <motion.span
              layoutId={`${id}-thumb`}
              transition={SPRING}
              className="absolute inset-0 rounded-full bg-white"
            />
          )}
          <span className={`relative ${value === o.id ? 'text-ground' : 'text-muted hover:text-ink'}`}>
            {o.label}
          </span>
        </button>
      ))}
    </div>
  )
}

/** Labelled range slider. Shows its value and optional tick marks with names. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  ticks = [],
  hint,
  disabled = false,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
  ticks?: { value: number; label: string }[]
  hint?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  const fill = ((value - min) / (max - min || 1)) * 100
  return (
    <div className={disabled ? 'opacity-55' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="label">
          {label}
        </label>
        <span className="font-cond text-[15px] font-medium text-ink tabular-nums">{format(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="range mt-1 w-full disabled:cursor-not-allowed"
        style={{ '--fill': `${fill}%` } as CSSProperties}
      />
      {ticks.length > 0 && (
        <div className="relative h-5">
          {ticks.map((t) => {
            const at = ((t.value - min) / (max - min || 1)) * 100
            const active = Math.abs(t.value - value) < step / 2 + 1e-9
            return (
              <button
                key={t.label}
                type="button"
                disabled={disabled}
                onClick={() => onChange(t.value)}
                className={`press absolute -translate-x-1/2 font-cond text-[12px] ${active ? 'text-accent' : 'text-dim hover:text-ink'}`}
                style={{ left: `clamp(16px, ${at}%, calc(100% - 16px))` }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      )}
      {hint && <p className="mt-1 text-xs leading-snug text-dim">{hint}</p>}
    </div>
  )
}

/** Centered modal sheet with a dimmed, blurred page behind. */
export function Sheet({
  children,
  onClose,
  label,
  className = '',
}: {
  children: ReactNode
  onClose: () => void
  label: string
  className?: string
}) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return (
    <motion.div
      className="fixed inset-0 z-40 flex overflow-y-auto bg-black/60 px-4 py-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={SPRING}
        className={`glass-strong glass-glow relative m-auto w-full ${className}`}
      >
        {children}
      </motion.div>
    </motion.div>
  )
}

/**
 * Fades and lifts children in, one after another. Wrap list items or sections.
 * No CSS filter here on purpose: a filter on an ancestor stops glass panels inside it from
 * blurring the environment behind the page.
 */
export function Reveal({
  children,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  // Kept for compatibility. Content appears at once: entrance animations on every block read
  // as decoration, so the only motion left is what answers the user.
  return <div className={className}>{children}</div>
}

/** Escape closes, and the close button takes the focus when the panel opens. */
function useClosable(onClose: () => void) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [onClose])
  return close
}

/** A panel that slides over the scene from the right. The body stays in view on its left. */
export function Drawer({
  title,
  subtitle,
  onClose,
  width,
  children,
}: {
  title: string
  subtitle?: string
  onClose: () => void
  width: number
  children: ReactNode
}) {
  const close = useClosable(onClose)
  return (
    <motion.aside
      role="dialog"
      aria-label={title}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ duration: 0.42, ease: EASE }}
      className="fixed top-16 right-0 bottom-0 z-20 flex w-full flex-col border-l border-white/[0.08] bg-[#0f1215]/95 backdrop-blur-xl"
      style={{ maxWidth: width }}
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-2 sm:px-6">
        <div className="min-w-0">
          {subtitle && <p className="font-cond text-[13px] text-white/60">{subtitle}</p>}
          <h2 className="mt-0.5 text-[24px] leading-tight font-semibold">{title}</h2>
        </div>
        <button
          ref={close}
          onClick={onClose}
          aria-label="Close"
          className="press flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </motion.aside>
  )
}

/** A panel over the whole scene, for the camera tools. Closing it goes back to the body. */
export function Cover({
  title,
  onClose,
  bare = false,
  children,
}: {
  title: string
  onClose: () => void
  /** No title bar: the content has its own way out. */
  bare?: boolean
  children: ReactNode
}) {
  const close = useClosable(onClose)
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="fixed inset-x-0 top-16 bottom-0 z-20 overflow-y-auto bg-ground"
    >
      {!bare && (
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-3 px-4 pt-4 sm:px-6">
          <h2 className="text-[22px] font-semibold">{title}</h2>
          <button
            ref={close}
            onClick={onClose}
            className="press flex h-9 shrink-0 items-center gap-2 rounded-full bg-white/10 px-3.5 text-[13px] hover:bg-white/20"
          >
            <X size={14} />
            Back to the body
          </button>
        </div>
      )}
      {children}
    </motion.div>
  )
}
