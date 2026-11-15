import { useEffect, useState } from 'react'
import { demoVitals, type DemoPlayback } from './demoVitals'

export default function AvatarDemoVitals({ playback }: { playback: DemoPlayback }) {
  const [now, setNow] = useState(() => performance.now())
  useEffect(() => {
    setNow(performance.now())
    const timer = window.setInterval(() => setNow(performance.now()), 400)
    return () => window.clearInterval(timer)
  }, [playback])
  const { bpm, breathsPerMinute } = demoVitals(playback.mode, (now - playback.startedAt) / 1000)

  return (
    <section
      aria-label="Avatar vitals"
      className="pointer-events-none absolute top-2 left-2 z-[6] rounded-xl bg-black/75 px-3 py-2 text-white sm:top-4 sm:left-4"
    >
      <h2 className="font-cond text-sm text-holo">Exercise demo</h2>
      <dl className="mt-1 space-y-1 text-xs sm:text-sm">
        <div>
          <dt className="text-white/70">Heart rate</dt>
          <dd className="font-medium tabular-nums">{bpm} bpm</dd>
        </div>
        <div>
          <dt className="text-white/70">Breathing</dt>
          <dd className="font-medium tabular-nums">{breathsPerMinute} breaths/min</dd>
        </div>
      </dl>
    </section>
  )
}
