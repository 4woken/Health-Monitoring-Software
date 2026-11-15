import { useEffect, useRef, useState } from 'react'
import { CreditCard } from '@phosphor-icons/react'
import { Button } from '../../ui'
import { amslerSquareMm, type Direction } from './acuity'
import { CARD_MM, GUESS_CSS_PX_PER_MM, saveScale, savedScale } from './screen'

/** Matching a bank card on the screen, once per screen, so sizes on screen are true millimetres. */
export function ScreenScale({ onDone }: { onDone: (cssPxPerMm: number) => void }) {
  const [scale, setScale] = useState(() => savedScale() ?? GUESS_CSS_PX_PER_MM)
  const width = CARD_MM * scale
  const step = (by: number) => setScale((s) => Math.min(12, Math.max(2, s + by)))
  return (
    <div className="space-y-4">
      <p className="max-w-2xl text-[16px] leading-relaxed">
        Hold a bank card, or any card of that size, flat against the screen over the outline. Change the size
        until the outline matches the card&apos;s edges exactly.
      </p>
      <div className="flex min-h-56 items-center justify-center overflow-hidden rounded-2xl bg-white/[0.03] py-6">
        <div
          aria-label="Card outline"
          className="flex shrink-0 items-center justify-center rounded-[3mm] border-2 border-white/90 text-white/40"
          style={{ width, height: width * (53.98 / 85.6) }}
        >
          <CreditCard size={40} weight="thin" aria-hidden="true" />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => step(-0.1)} aria-label="Smaller">
          − Smaller
        </Button>
        <input
          type="range"
          min={2}
          max={12}
          step={0.01}
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
          aria-label="Outline size"
          className="w-64 max-w-full"
        />
        <Button size="sm" onClick={() => step(0.1)} aria-label="Larger">
          + Larger
        </Button>
      </div>
      <Button
        kind="primary"
        onClick={() => {
          saveScale(scale)
          onDone(scale)
        }}
      >
        The outline matches the card
      </Button>
    </div>
  )
}

/**
 * One tumbling E, drawn in device pixels so its strokes are exact: five strokes tall, with the open
 * side pointing in `direction`.
 */
export function TumblingE({ unit, direction }: { unit: number; direction: Direction }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const size = unit * 5
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = '#ffffff'
    // The E opening to the right on a 5 by 5 grid, then turned.
    const cells: [number, number][] = []
    for (let r = 0; r < 5; r++) cells.push([0, r])
    for (const r of [0, 2, 4]) for (let col = 1; col < 5; col++) cells.push([col, r])
    for (const [col, row] of cells) {
      const [x, y] =
        direction === 'right'
          ? [col, row]
          : direction === 'left'
            ? [4 - col, row]
            : direction === 'down'
              ? [row, col]
              : [row, 4 - col]
      ctx.fillRect(x * unit, y * unit, unit, unit)
    }
  }, [unit, direction, size])
  return (
    <canvas
      ref={canvas}
      width={size}
      height={size}
      aria-hidden="true"
      style={{ width: size / ratio, height: size / ratio, imageRendering: 'pixelated' }}
    />
  )
}

/**
 * The Amsler grid: squares of 1 degree at the viewing distance, with a dot in the middle. A tap
 * marks a square that looks wavy, blurred or missing.
 */
export function Amsler({
  distanceMm,
  cssPxPerMm,
  marked,
  onToggle,
}: {
  distanceMm: number
  cssPxPerMm: number
  marked: Set<number>
  onToggle: (cell: number) => void
}) {
  const square = amslerSquareMm(distanceMm) * cssPxPerMm
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = container.current
    if (!el) return
    const resize = new ResizeObserver(() => setWidth(el.clientWidth))
    resize.observe(el)
    return () => resize.disconnect()
  }, [])
  const fit = Math.floor(Math.min(Math.max(window.innerHeight - 260, square * 8), width) / square)
  // An even count keeps the dot on a crossing.
  const n = Math.max(2, Math.min(20, fit - (fit % 2)))
  return (
    <div ref={container} className="w-full">
      <div
        role="grid"
        aria-label={`Amsler grid, ${n} by ${n} squares of 1 degree`}
        className="relative mx-auto bg-white"
        style={{ width: n * square, height: n * square }}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const row = Math.floor(i / n)
          const col = i % n
          const cell = (row + (20 - n) / 2) * 20 + col + (20 - n) / 2
          return (
            <button
              key={i}
              type="button"
              aria-label={`Square ${row + 1}, ${col + 1}`}
              aria-pressed={marked.has(cell)}
              onClick={() => onToggle(cell)}
              className="absolute border-[0.5px] border-black/80"
              style={{
                left: (i % n) * square,
                top: Math.floor(i / n) * square,
                width: square,
                height: square,
                background: marked.has(cell) ? 'rgb(242 171 60 / 0.75)' : 'transparent',
              }}
            />
          )
        })}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute rounded-full bg-black"
          style={{ width: 8, height: 8, left: (n * square) / 2 - 4, top: (n * square) / 2 - 4 }}
        />
      </div>
    </div>
  )
}
