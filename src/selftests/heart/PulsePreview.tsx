import { useEffect, useRef, useState } from 'react'
import { Heart } from '@phosphor-icons/react'
import { getPulseVideo, usePulse } from '../../camera/pulse/pulseSession'

/** The camera image of the shared pulse session, mirrored, with its pulse estimate and status. */
export function PulsePreview() {
  const pulse = usePulse()
  const video = useRef<HTMLVideoElement>(null)
  const [attached, setAttached] = useState(false)
  useEffect(() => {
    const source = getPulseVideo()?.srcObject ?? null
    const el = video.current
    if (!el) return
    if (!source) {
      el.srcObject = null
      setAttached(false)
      return
    }
    if (el.srcObject === source) return
    el.srcObject = source
    void el.play().catch(() => undefined)
    setAttached(true)
  }, [pulse.phase])
  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#12161e]">
        <video
          ref={video}
          muted
          playsInline
          aria-label="Mirrored camera preview"
          className="h-full w-full -scale-x-100 object-cover"
        />
        {!attached && (
          <span className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
            {pulse.phase === 'off' || pulse.phase === 'error' ? 'Camera off' : 'Starting the camera…'}
          </span>
        )}
      </div>
      <p className="flex items-center gap-2 text-[15px]" aria-live="polite">
        <Heart size={16} weight={pulse.bpm ? 'fill' : 'regular'} className="text-holo" aria-hidden="true" />
        {pulse.bpm ? `${Math.round(pulse.bpm)} bpm` : '—'}
        <span className="text-[13px] text-muted">{pulse.message}</span>
      </p>
    </div>
  )
}
