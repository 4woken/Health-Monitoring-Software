import { useEffect, useRef, useState } from 'react'
import type { Move } from '../catalog'
import { coachStage } from './coachStage'

/** The 3D figure that shows the movement a test asks for, over and over. */
export default function Coach({
  move,
  eyesClosed = false,
  small = false,
  label,
}: {
  move: Move
  eyesClosed?: boolean
  /** A small figure beside a live camera, without the caption. */
  small?: boolean
  label: string
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<ReturnType<typeof coachStage> | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  const failed = state === 'error'
  useEffect(() => {
    if (failed || !canvas.current) return
    let s: ReturnType<typeof coachStage>
    try {
      s = coachStage(
        canvas.current,
        () => setState('ready'),
        () => setState('error'),
        small,
      )
    } catch {
      setState('error')
      return
    }
    stage.current = s
    return () => {
      s.dispose()
      stage.current = null
    }
  }, [failed, small])
  useEffect(() => {
    stage.current?.play(move, eyesClosed)
  }, [move, eyesClosed, state])

  if (state === 'error')
    return (
      <p role="status" className="text-sm text-muted">
        The 3D demonstration could not load. Follow the written movement instructions.
      </p>
    )
  return (
    <figure className={small ? '' : 'rounded-2xl bg-white/[0.03] p-2'}>
      <div className="relative aspect-[3/4] w-full">
        <canvas ref={canvas} role="img" aria-label={label} className="h-full w-full" />
        {state === 'loading' && (
          <span className="absolute inset-0 flex items-center justify-center text-[13px] text-white/50">
            Loading the figure…
          </span>
        )}
      </div>
      {!small && (
        <figcaption className="px-2 pb-1 text-[12px] leading-snug text-dim">
          How the movement goes. The figure is the sample avatar of the lab, not your body.
        </figcaption>
      )}
    </figure>
  )
}
