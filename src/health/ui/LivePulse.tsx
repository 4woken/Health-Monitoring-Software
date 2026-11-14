import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Camera, Heart } from '@phosphor-icons/react'
import { getPulse, getPulseVideo, startPulse, stopPulse, usePulse } from '../../camera/pulse/pulseSession'

const WAVE_W = 196
const WAVE_H = 44

/** Shape of one simulated pulse: a fast rise, a notch and a smaller second wave. */
function ppg(phase: number) {
  const g = (c: number, w: number) => Math.exp(-(((phase - c) / w) ** 2))
  return g(0.16, 0.07) + 0.38 * g(0.42, 0.09) - 0.08 * g(0.3, 0.03)
}

/**
 * Scrolling pulse trace. With the webcam measuring it draws the real filtered signal;
 * otherwise a simulated wave at the wearable rate.
 */
function PulseWave({ bpm, live }: { bpm: number; live: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const bpmRef = useRef(bpm)
  const liveRef = useRef(live)
  bpmRef.current = bpm
  liveRef.current = live
  useEffect(() => {
    const c = canvas.current
    const ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    c.width = WAVE_W * dpr
    c.height = WAVE_H * dpr
    ctx.scale(dpr, dpr)
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (document.hidden) return
      ctx.clearRect(0, 0, WAVE_W, WAVE_H)
      const values: number[] = []
      if (liveRef.current) {
        const wave = getPulse().wave
        const n = Math.min(wave.length, 150)
        for (let i = wave.length - n; i < wave.length; i++) values.push(wave[i])
      } else {
        const t = reduce ? 4 : (now - start) / 1000
        const period = 60 / Math.max(30, bpmRef.current)
        for (let i = 0; i < 120; i++) {
          const ts = t - 3.2 + (i / 119) * 3.2
          values.push(ppg((((ts / period) % 1) + 1) % 1))
        }
      }
      if (values.length < 2) return
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const span = hi - lo || 1
      const grad = ctx.createLinearGradient(0, 0, WAVE_W, 0)
      grad.addColorStop(0, 'rgba(127,214,255,0)')
      grad.addColorStop(0.35, 'rgba(127,214,255,0.65)')
      grad.addColorStop(1, 'rgba(235,250,255,1)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1.6
      ctx.lineJoin = 'round'
      ctx.shadowColor = 'rgba(127,214,255,0.8)'
      ctx.shadowBlur = 6
      ctx.beginPath()
      values.forEach((v, i) => {
        const x = (i / (values.length - 1)) * (WAVE_W - 4)
        const y = WAVE_H - 4 - ((v - lo) / span) * (WAVE_H - 8)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
      const last = values[values.length - 1]
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(WAVE_W - 4, WAVE_H - 4 - ((last - lo) / span) * (WAVE_H - 8), 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <canvas ref={canvas} style={{ width: WAVE_W, height: WAVE_H }} aria-hidden="true" />
}

/** Small mirrored preview of the camera, so the user can keep their face in view. */
function CameraThumb() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const video = getPulseVideo()
      if (!video || !video.videoWidth) return
      const size = 96
      const side = Math.min(video.videoWidth, video.videoHeight)
      ctx.save()
      ctx.translate(size, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(
        video,
        (video.videoWidth - side) / 2,
        (video.videoHeight - side) / 2,
        side,
        side,
        0,
        0,
        size,
        size,
      )
      ctx.restore()
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <canvas
      ref={canvas}
      width={96}
      height={96}
      className="h-12 w-12 rounded-md bg-ground ring-1 ring-line-strong"
      aria-label="Camera preview, processed on this device"
    />
  )
}

/** Heart-rate card over the body: webcam pulse when it is measuring, otherwise the simulated wearable. */
export default function LivePulse({
  restingPulseBpm,
  onOpenCamera,
  onOpen,
}: {
  restingPulseBpm: number
  onOpenCamera: () => void
  /** Opens the heart rate and oxygen detail. */
  onOpen?: () => void
}) {
  const pulse = usePulse()
  const live = pulse.phase === 'measuring' && pulse.bpm !== null
  const running = pulse.phase !== 'off' && pulse.phase !== 'error'
  // The simulated feed moves a little by itself, like a real wearable stream.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1600)
    return () => clearInterval(t)
  }, [])
  const wobble = (seed: number) => Math.round(Math.sin(tick * 1.7 + seed) * 1.6)
  const bpm = live ? Math.round(pulse.bpm!) : restingPulseBpm + wobble(0)

  return (
    <div className="on-photo w-[250px]">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        aria-label={`Heart rate ${bpm} bpm. Open the detail`}
        className="press -m-2 block w-[calc(100%+1rem)] rounded-2xl p-2 text-left enabled:hover:bg-white/[0.035]"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 font-cond text-[13px] text-white/65">
            <Heart size={12} weight="fill" className="text-accent" />
            Heart rate
          </p>
          <span
            className={`rounded px-1.5 py-0.5 font-cond text-[12px] ${live ? 'border border-holo/60 text-ink' : 'border border-line-strong text-dim'}`}
          >
            {live ? 'Webcam, live' : running ? 'Webcam, starting' : 'Wearable, simulated'}
          </span>
        </div>
        <div className="mt-2 flex items-end gap-2">
          <motion.span
            key={live ? 'live' : 'sim'}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="display text-[46px] text-white"
          >
            {bpm}
          </motion.span>
          <span className="mb-1.5 text-xs text-muted">bpm</span>
        </div>
        <div className="mt-1">
          <PulseWave bpm={bpm} live={live} />
        </div>
      </button>
      {running ? (
        <div className="mt-3 flex items-center gap-3">
          <CameraThumb />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] leading-snug text-muted">
              {live ? 'The 3D heart now beats with your pulse.' : pulse.message}
            </p>
            <p className="mt-1 flex gap-3 text-[11px]">
              <button onClick={onOpenCamera} className="text-accent hover:underline">
                Open camera
              </button>
              <button onClick={stopPulse} className="text-muted hover:text-ink">
                Stop camera
              </button>
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => void startPulse()}
          className="press mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-line-strong bg-raised py-2 text-[13px] font-medium text-ink hover:bg-[#343c46]"
        >
          <Camera size={14} />
          Measure the pulse with the camera
        </button>
      )}
    </div>
  )
}
