import { useEffect, useRef, useState } from 'react'
import { VideoCamera } from '@phosphor-icons/react'
import { Button } from '../ui'
import { stopPulse } from '../camera/pulse/pulseSession'
import { MIN_SECONDS } from '../camera/respiration/breathRate'
import { BREATH_STATUS, startBreathingSession } from '../camera/respiration/breathingSession'

/** A single breathing sample, taken before the exercise and kept with this open check-in. */
export default function CheckInBreathingCamera({
  rate,
  onSample,
}: {
  rate: number | null
  onSample: (rate: number | null) => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const release = useRef<(() => void) | null>(null)
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    function onVisibility() {
      if (document.hidden && release.current) {
        release.current()
        release.current = null
        setActive(false)
        setStatus('Camera stopped when you left the tab.')
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      release.current?.()
      release.current = null
    }
  }, [])

  function toggle() {
    if (active) {
      release.current?.()
      release.current = null
      setActive(false)
      setStatus('Reading cancelled.')
      return
    }
    if (!video.current) return
    stopPulse()
    onSample(null)
    setActive(true)
    release.current = startBreathingSession(video.current, (preview) => {
      if (preview.state === 'error') {
        release.current = null
        setActive(false)
        setStatus(preview.error ?? 'Camera unavailable. You can continue your check-in.')
      } else if (preview.rate !== null) {
        release.current?.()
        release.current = null
        setActive(false)
        setStatus('')
        onSample(preview.rate)
      } else {
        const progress =
          preview.state === 'collect' ? ` · ${Math.floor(preview.seconds)} / ${MIN_SECONDS} s` : ''
        setStatus(BREATH_STATUS[preview.state] + progress)
      }
    })
  }

  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="font-medium">Optional breathing sample</p>
      <p className="mt-1 max-w-prose text-sm text-muted">
        Your camera can estimate breaths per minute from chest movement. Only your own answer is used to
        suggest a stress break.
      </p>
      <video
        ref={video}
        playsInline
        muted
        hidden={!active}
        aria-label="Breathing sample preview"
        className="mt-3 max-h-56 w-full -scale-x-100 rounded-lg bg-black object-contain"
      />
      {active && (
        <p className="mt-2 text-sm text-muted">
          Keep your face and upper chest in view. Breathe normally for at least {MIN_SECONDS} seconds.
        </p>
      )}
      <p role="status" className="mt-2 text-sm">
        {rate !== null ? `Camera estimate: ${rate} breaths/min. Camera off.` : status}
      </p>
      <Button type="button" size="sm" className="mt-1" onClick={toggle}>
        <VideoCamera size={16} />
        {active ? 'Cancel camera reading' : rate !== null ? 'Measure again' : 'Observe my breathing'}
      </Button>
    </div>
  )
}
