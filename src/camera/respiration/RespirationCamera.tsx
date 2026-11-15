import { useEffect, useRef, useState } from 'react'
import { Wind, VideoCamera, VideoCameraSlash } from '@phosphor-icons/react'
import { Button, Panel } from '../../ui'
import type { BreathReading } from '../breathReading'
import { MIN_SECONDS } from './breathRate'
import { ChestMotionTrace } from './ChestMotionTrace'
import { EMPTY_PREVIEW, startBreathingSession, type BreathPreview, BREATH_STATUS } from './breathingSession'

export function RespirationCamera({
  onReading,
  onUnavailable,
}: {
  onReading?: (reading: BreathReading) => void
  onUnavailable?: () => void
} = {}) {
  const video = useRef<HTMLVideoElement>(null)
  const stop = useRef<(() => void) | null>(null)
  const callbacks = useRef({ onReading, onUnavailable })
  const [preview, setPreview] = useState<BreathPreview>(EMPTY_PREVIEW)
  const running = preview.state !== 'off' && preview.state !== 'error'

  useEffect(() => {
    callbacks.current = { onReading, onUnavailable }
  }, [onReading, onUnavailable])
  useEffect(() => () => stop.current?.(), [])

  function toggleCamera() {
    stop.current?.()
    stop.current = null
    callbacks.current.onUnavailable?.()
    if (running || !video.current) {
      setPreview(EMPTY_PREVIEW)
      return
    }
    let hadReading = false
    stop.current = startBreathingSession(video.current, (next) => {
      setPreview(next)
      if (next.rate !== null)
        callbacks.current.onReading?.({ breathsPerMinute: next.rate, measuredAt: Date.now() })
      else if (hadReading) callbacks.current.onUnavailable?.()
      hadReading = next.rate !== null
    })
  }

  const box = preview.box
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">Breathing camera</h1>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">
            Estimates your breathing rate from the rise and fall of your chest. Video is processed on this
            device.
          </p>
        </div>
        <Button kind={running ? 'secondary' : 'primary'} onClick={toggleCamera}>
          {running ? <VideoCameraSlash size={18} /> : <VideoCamera size={18} />}
          {running ? 'Stop breathing camera' : 'Start breathing camera'}
        </Button>
      </header>
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel className="overflow-hidden">
          <div className="relative flex min-h-48 items-center justify-center bg-[#161a1f]">
            <div className={running ? 'relative mx-auto w-full max-w-2xl' : 'hidden'}>
              <video
                ref={video}
                playsInline
                muted
                className="block h-auto w-full -scale-x-100"
                aria-label="Mirrored breathing camera preview"
              />
              {box && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-holo/90"
                  style={{
                    left: box.left * 100 + '%',
                    top: box.top * 100 + '%',
                    width: box.width * 100 + '%',
                    height: box.height * 100 + '%',
                  }}
                />
              )}
            </div>
            {!running && (
              <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-white/70">
                <Wind size={50} weight="thin" aria-hidden="true" />
                <span className="text-sm">Face and upper chest</span>
              </div>
            )}
          </div>
          <p className="border-t border-line px-4 py-3 text-[14px]" role="status">
            {preview.error || BREATH_STATUS[preview.state]}
          </p>
        </Panel>
        <Panel className="p-5">
          <h2 className="font-cond text-[18px] font-semibold">Breathing rate</h2>
          <p className="mt-2 flex items-baseline gap-2">
            <output aria-label="Estimated breathing rate" className="display text-6xl tabular-nums">
              {preview.rate ?? '—'}
            </output>
            <span className="text-sm text-muted">breaths/min</span>
          </p>
          {running && (
            <p className="mt-2 text-sm text-muted">{Math.floor(preview.seconds)} s of usable chest motion</p>
          )}
          <ChestMotionTrace wave={preview.wave} />
          <h3 className="mt-5 border-t border-line pt-4 font-cond text-[17px] font-semibold">
            Take a reading
          </h3>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted">
            <li>Rest the camera on a fixed surface and sit facing it.</li>
            <li>Step back until the outline covers your upper chest. Keep your face in view.</li>
            <li>Breathe normally. An estimate needs at least {MIN_SECONDS} seconds of usable motion.</li>
          </ol>
          <p className="mt-4 text-xs leading-relaxed text-dim">
            Experimental estimate, designed for 6–36 breaths/min. Talking or swaying can look like breathing.
          </p>
        </Panel>
      </div>
    </div>
  )
}
