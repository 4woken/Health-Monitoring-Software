import { useEffect, useRef, useState } from 'react'
import {
  ArrowSquareOut,
  DownloadSimple,
  UserFocus,
  Heart,
  ShieldCheck,
  VideoCamera,
  VideoCameraSlash,
  Warning,
} from '@phosphor-icons/react'
import { Button, Meter, Panel, Segmented } from '../../ui'
import { RPPG } from './rppg'
import { regionPolygons } from './skinRegions'
import {
  setPulseComparison,
  getPulseLog,
  capturePulsePortrait,
  getPulseVideo,
  pulseLogCsv,
  subscribeFrames,
  stopPulse,
  type PulsePhase,
} from './pulseSession'
import { usePulseTracking } from './usePulseTracking'
import type { AvatarCapture } from '../face/portrait'

/** Live-data colour, the same cyan as the pleth trace of a bedside monitor. */
const TRACE = '#5CC8E8'

const PHASE: Record<PulsePhase, { label: string; step: number }> = {
  off: { label: 'Camera off', step: 0 },
  loading: { label: 'Loading the face model', step: 1 },
  permission: { label: 'Waiting for camera permission', step: 2 },
  searching: { label: 'Looking for a face', step: 3 },
  warming: { label: 'Collecting the first seconds of signal', step: 4 },
  measuring: { label: 'Measuring', step: 5 },
  error: { label: 'Stopped', step: 0 },
}
const STEPS = ['Face model', 'Camera', 'Face found', 'Signal', 'Pulse']
/** Samples drawn across the full width of the waveform. */
const WAVE_POINTS = RPPG.waveSeconds * RPPG.sampleRateHz

/** Pulse camera: live 3D face, camera pulse estimate, waveform and validation export. */
export default function PulseCamera({
  onCapture,
  onRemove,
  hasPortrait = false,
  preflightRestingPulseBpm,
}: {
  /** Hands the captured face to the fit step, for the person shown (kept in memory for this session). */
  onCapture?: (capture: AvatarCapture) => void
  onRemove?: () => void
  hasPortrait?: boolean
  preflightRestingPulseBpm?: number
} = {}) {
  const host = useRef<HTMLDivElement>(null)
  const { pulse, running, streaming, wireframe, setWireframe, toggle } = usePulseTracking(host)
  const [faceFound, setFaceFound] = useState(false)
  const [captureError, setCaptureError] = useState('')
  const [compare, setCompare] = useState(false)
  useEffect(() => {
    setPulseComparison(compare)
    return () => setPulseComparison(false)
  }, [compare])
  useEffect(() => {
    if (!streaming) {
      setFaceFound(false)
      return
    }
    return subscribeFrames((points) => {
      setFaceFound(points !== null)
    })
  }, [streaming])

  /** One still frame and its face points. Nothing is sent anywhere. */
  const capture = () => {
    try {
      const portrait = capturePulsePortrait()
      stopPulse()
      setCaptureError('')
      onCapture?.(portrait)
    } catch (cause) {
      setCaptureError(cause instanceof Error ? cause.message : 'Could not capture the portrait.')
    }
  }

  const logged = getPulseLog().length
  const step = PHASE[pulse.phase].step
  const measuring = pulse.bpm !== null
  const preflight = preflightRestingPulseBpm === undefined ? null : Math.round(preflightRestingPulseBpm)
  const difference =
    preflight !== null &&
    pulse.phase === 'measuring' &&
    pulse.bpm !== null &&
    pulse.quality >= RPPG.qualityThreshold
      ? Math.round(pulse.bpm) - preflight
      : null

  const download = () => {
    const blob = new Blob([pulseLogCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `pulse-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold">Pulse camera</h1>
          <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">
            Estimates your pulse from the small colour change each heartbeat makes in the skin of your face.
            Experimental, and processed on this device only.
          </p>
        </div>
        <ol className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label="Measurement progress">
          {STEPS.map((name, i) => {
            const state = step > i + 1 ? 'done' : step === i + 1 ? 'now' : 'todo'
            return (
              <li key={name} className="flex items-center gap-1.5 font-cond text-[14px]">
                <span
                  className={`h-2 w-2 rounded-full ${state === 'todo' ? 'bg-line-strong' : state === 'now' ? 'bg-holo' : 'bg-ink'}`}
                  aria-hidden="true"
                />
                <span className={state === 'todo' ? 'text-dim' : 'text-ink'}>
                  {i + 1}. {name}
                </span>
              </li>
            )
          })}
        </ol>
      </header>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Panel
          className="avatar-canvas relative h-[420px] overflow-hidden bg-[#161a1f]! sm:h-[560px]"
          aria-label="Live 3D face"
        >
          <div ref={host} className="absolute inset-0" />
          {!streaming && <Placeholder phase={pulse.phase} />}
          {streaming && <CameraPreview />}
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-panel px-4 py-2.5">
            <p className="flex items-center gap-2 font-cond text-[15px] font-medium">
              {pulse.phase === 'error' ? (
                <Warning size={15} weight="fill" className="text-check" />
              ) : (
                <span
                  className={`h-2 w-2 rounded-full ${running ? 'bg-holo' : 'bg-line-strong'}`}
                  aria-hidden="true"
                />
              )}
              {PHASE[pulse.phase].label}
            </p>
            {streaming && (
              <p className="font-cond text-[14px] text-dim tabular-nums">
                {pulse.fps ? `${pulse.fps} frames a second analysed` : 'Starting…'}
              </p>
            )}
            <p className="w-full text-[13.5px] leading-snug text-muted">{pulse.message}</p>
          </div>
          <p className="sr-only" role="status">
            {PHASE[pulse.phase].label}
          </p>
        </Panel>

        <div className="flex flex-col gap-4">
          <Panel className="overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-5 pt-4">
              <div>
                <h2
                  className="font-cond text-[17px] font-semibold"
                  style={{ color: measuring ? TRACE : undefined }}
                >
                  Pulse
                </h2>
                <p className="text-[13px] text-dim">Median of the last 5 estimates</p>
              </div>
              <BeatHeart bpm={pulse.bpm} lastBeatAt={pulse.lastBeatAt} />
            </div>
            <p className="display flex items-baseline gap-2 px-5 pt-2 text-[96px]" aria-live="off">
              <span
                style={{ color: measuring ? TRACE : undefined }}
                className={measuring ? '' : 'text-line-strong'}
              >
                {measuring ? Math.round(pulse.bpm!) : '--'}
              </span>
              <span className="font-cond text-[18px] font-normal text-muted">bpm</span>
            </p>
            {preflight !== null && (
              <div className="mx-5 my-3 text-sm" aria-label="Preflight resting pulse comparison">
                <p className="font-medium">Preflight resting pulse · {preflight} bpm</p>
                <p className="mt-1 text-muted">
                  {difference === null
                    ? 'A clear camera reading is needed to compare.'
                    : difference === 0
                      ? 'Camera matches your reference to the nearest bpm.'
                      : `Camera is ${Math.abs(difference)} bpm ${difference > 0 ? 'above' : 'below'} your reference.`}
                </p>
              </div>
            )}
            <div className="mt-2 border-t border-line px-5 pt-3 pb-4">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-cond text-[15px] font-medium">Pulse wave</h3>
                <p className="font-cond text-[13px] text-dim">
                  Last {RPPG.waveSeconds} s, filtered to 0.7–3 Hz
                </p>
              </div>
              <PulseWave wave={pulse.wave} />
            </div>
            <div className="border-t border-line px-5 pt-3 pb-4">
              <div className="mb-2 flex items-baseline justify-between">
                <h3 className="font-cond text-[15px] font-medium">Signal quality</h3>
                <p className="font-cond text-[15px] text-ink tabular-nums">
                  {Math.round(pulse.quality * 100)}%
                </p>
              </div>
              <Meter value={pulse.quality} marks={[RPPG.qualityThreshold]} />
              <p className="mt-2 text-[13px] leading-snug text-dim">
                A rate is shown only above the mark at {Math.round(RPPG.qualityThreshold * 100)}%. Below it
                the number would be a guess.
              </p>
            </div>
            <div className="border-t border-line px-5 py-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={compare}
                  onChange={(event) => setCompare(event.target.checked)}
                />
                Compare POS and CHROM
              </label>
              {compare && (
                <div className="mt-2 text-sm">
                  <p className="text-xs text-muted">
                    Same skin samples, current window. Each method shows a rate when its signal is clear.
                  </p>
                  <div className="mt-2 flex gap-5 tabular-nums">
                    {(['pos', 'chrom'] as const).map((method) => {
                      const rate = pulse.comparison?.[method]
                      return (
                        <span key={method}>
                          {method.toUpperCase()}{' '}
                          <strong>{rate != null ? Math.round(rate) + ' bpm' : '—'}</strong>
                        </span>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </Panel>

          <div className="flex flex-col gap-3">
            <Button kind={running ? 'secondary' : 'primary'} size="lg" onClick={toggle} className="w-full">
              {running ? <VideoCameraSlash size={18} /> : <VideoCamera size={18} />}
              {running ? 'Stop the camera' : 'Start the camera'}
            </Button>
            <div className="flex flex-wrap gap-3">
              <Segmented
                label="Face view"
                value={wireframe ? 'mesh' : 'video'}
                options={[
                  { id: 'video', label: 'Video' },
                  { id: 'mesh', label: 'Mesh' },
                ]}
                onChange={(v) => setWireframe(v === 'mesh')}
                className="flex-1"
              />
              <Button
                onClick={download}
                disabled={logged === 0}
                title={logged === 0 ? 'Measure first: the file holds the numbers shown' : undefined}
              >
                <DownloadSimple size={16} />
                Download CSV
              </Button>
            </div>
            {onCapture && (
              <div className="rounded-md border border-line p-4">
                <p className="font-semibold">Your face on the 3D body</p>
                <p className="mt-1 text-[14px] leading-relaxed text-muted">
                  Look straight at the camera, then capture and check the fit. The face is blended into the
                  reference head and the body takes your skin tone. The picture stays in memory for this
                  session only.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button kind="primary" size="sm" onClick={capture} disabled={!streaming || !faceFound}>
                    <UserFocus size={16} />
                    {hasPortrait ? 'Review a new portrait' : 'Capture & check the fit'}
                  </Button>
                  {hasPortrait && onRemove && (
                    <Button size="sm" onClick={onRemove}>
                      Remove my portrait
                    </Button>
                  )}
                </div>
                {captureError && (
                  <p role="alert" className="mt-2 text-[13px] text-urgent">
                    {captureError}
                  </p>
                )}
              </div>
            )}
            {pulse.phase === 'error' && (
              <p
                role="alert"
                className="rounded-md border border-urgent/40 bg-urgent-bg px-4 py-3 text-sm text-urgent"
              >
                {pulse.message}
              </p>
            )}
          </div>

          <p className="flex gap-2.5 text-[13px] leading-relaxed text-muted">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span>
              No image, face point or colour sample is stored or sent. The camera stops when you press stop or
              leave the page. While it runs, the heart of the 3D body beats with this pulse.
            </span>
          </p>
        </div>
      </div>

      <section className="mt-5 grid gap-5 md:grid-cols-3" aria-label="About the measurement">
        <Panel className="p-5">
          <h2 className="text-[17px] font-semibold">How it works</h2>
          <ol className="mt-3 space-y-3">
            {[
              ['Find the face', 'MediaPipe Face Landmarker places a 468-point mesh on your face, locally.'],
              ['Sample the skin', 'Average colour of the forehead and both cheeks, about 30 times a second.'],
              [
                'Separate pulse from light',
                'The POS method divides out skin tone and brightness, then projects the colour on the direction where the blood-volume change stands out (Wang et al., IEEE Trans. Biomed. Eng. 2017).',
              ],
              [
                'Find the rhythm',
                'A 0.7–3 Hz filter (42–180 bpm) finds the strongest rhythm over ten seconds. A clear pulse should stand out from noise and from any strong flicker in the light.',
              ],
            ].map(([title, text], i) => (
              <li key={title} className="flex gap-3">
                <span className="w-4 shrink-0 font-cond text-[15px] text-muted tabular-nums">{i + 1}.</span>
                <span>
                  <span className="block text-[15px] font-medium">{title}</span>
                  <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{text}</span>
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[17px] font-semibold">Limits</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[14px] leading-relaxed text-muted marker:text-dim">
            <li>
              <span className="text-ink">Not a medical device.</span> An estimate for learning and demos,
              never for a decision about someone's health.
            </li>
            <li>
              Movement, dim or flickering light, strong light behind you and camera auto-exposure disturb it.
            </li>
            <li>
              Published studies report lower accuracy on darker skin and in low light. Test across people
              before drawing conclusions.
            </li>
            <li>Compare with a finger pulse oximeter before trusting any number.</li>
          </ul>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-[17px] font-semibold">Check it against an oximeter</h2>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            Wear a finger pulse oximeter while measuring, download the numbers shown (time, bpm, quality),
            then compare the two files:
          </p>
          <pre className="mt-3 overflow-x-auto rounded-md border border-line bg-ground px-3 py-2.5 font-cond text-[13.5px] text-ink">
            node scripts/compare-pulse.mjs pulse.csv oximeter.csv
          </pre>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            It reports mean error, RMSE and Bland-Altman limits. The protocol is in docs/VALIDATION.md.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-[13px]">
            <p className="text-dim">
              {logged} reading{logged === 1 ? '' : 's'} recorded this session
            </p>
            <a
              href="https://github.com/google-ai-edge/mediapipe"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-muted underline decoration-line-strong underline-offset-4 hover:text-ink"
            >
              Face tracking: MediaPipe (Apache 2.0)
              <ArrowSquareOut size={12} />
            </a>
          </div>
        </Panel>
      </section>
    </div>
  )
}

/** Shown in the viewport before the camera streams: where the pulse is read, or why it stopped. */
function Placeholder({ phase }: { phase: PulsePhase }) {
  const busy = phase === 'loading' || phase === 'permission'
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 bottom-20 flex flex-col items-center justify-center px-8 text-center">
      <svg viewBox="0 0 176 224" className="h-52 w-40" aria-hidden="true">
        <ellipse cx="88" cy="112" rx="66" ry="90" fill="none" stroke="#46505C" strokeWidth="1.5" />
        {/* The three sampled regions, where they sit on a face. */}
        <path d="M62 66 Q88 52 114 66 L110 84 Q88 78 66 84 Z" fill="rgb(92 200 232 / 0.14)" stroke={TRACE} />
        <path d="M52 118 L70 112 L72 138 L56 142 Z" fill="rgb(92 200 232 / 0.14)" stroke={TRACE} />
        <path d="M124 118 L106 112 L104 138 L120 142 Z" fill="rgb(92 200 232 / 0.14)" stroke={TRACE} />
      </svg>
      <p className="mt-5 text-[15px] text-ink">
        {busy
          ? 'Preparing the local face model…'
          : phase === 'error'
            ? 'The camera stopped'
            : 'Start the camera to see your face here'}
      </p>
      <p className="mt-1 max-w-xs text-[13.5px] leading-relaxed text-dim">
        Outlined: the forehead and cheek skin used to read the pulse.
      </p>
    </div>
  )
}

/** Small mirrored camera view with the sampled skin regions outlined. */
function CameraPreview() {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const W = 320
    return subscribeFrames((points) => {
      const video = getPulseVideo()
      if (!video || !video.videoWidth) return
      const H = Math.round((W * video.videoHeight) / video.videoWidth)
      if (el.width !== W || el.height !== H) {
        el.width = W
        el.height = H
      }
      ctx.save()
      ctx.translate(W, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(video, 0, 0, W, H)
      if (points) {
        ctx.lineWidth = 1.5
        ctx.strokeStyle = TRACE
        ctx.fillStyle = 'rgba(92, 200, 232, 0.18)'
        for (const poly of Object.values(regionPolygons(points, W, H))) {
          ctx.beginPath()
          poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
          ctx.closePath()
          ctx.fill()
          ctx.stroke()
        }
      }
      ctx.restore()
    })
  }, [])
  return (
    <figure className="absolute top-4 right-4 w-[128px] overflow-hidden rounded-md border border-line-strong bg-ground sm:w-[200px]">
      <canvas
        ref={canvas}
        className="block aspect-[4/3] w-full object-cover"
        aria-label="Camera view with the sampled skin regions outlined"
        role="img"
      />
      <figcaption className="border-t border-line px-2.5 py-1.5 font-cond text-[12.5px] text-muted">
        Sampled: forehead and cheeks
      </figcaption>
    </figure>
  )
}

/** Heart that beats on the detected beats, predicted between updates from the rate. */
function BeatHeart({ bpm, lastBeatAt }: { bpm: number | null; lastBeatAt: number | null }) {
  const ref = useRef<HTMLSpanElement>(null)
  const latest = useRef({ bpm, lastBeatAt })
  latest.current = { bpm, lastBeatAt }
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const tick = (now: number) => {
      const el = ref.current
      const { bpm, lastBeatAt } = latest.current
      let k = 0
      if (bpm && lastBeatAt !== null && !reduce) {
        const period = 60000 / bpm
        const since = (((now - lastBeatAt) % period) + period) % period
        k = Math.exp(-since / 130)
      }
      if (el) el.style.transform = `scale(${(1 + 0.2 * k).toFixed(3)})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <span
      ref={ref}
      className="mt-1 flex h-9 w-9 items-center justify-center"
      style={{ color: bpm !== null ? TRACE : '#46505C' }}
      aria-hidden="true"
    >
      <Heart size={22} weight="fill" />
    </span>
  )
}

/** Filtered pulse wave, newest on the right. */
function PulseWave({ wave }: { wave: number[] }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setBox({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const el = canvas.current
    if (!el || box.w === 0) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    el.width = Math.round(box.w * dpr)
    el.height = Math.round(box.h * dpr)
    const ctx = el.getContext('2d')
    if (!ctx) return
    const { w, h } = box
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // One grid line per second, like monitor paper.
    ctx.strokeStyle = 'rgba(166, 175, 186, 0.12)'
    ctx.lineWidth = 1
    for (let s = 1; s < RPPG.waveSeconds; s++) {
      const x = Math.round((s / RPPG.waveSeconds) * w) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    if (wave.length < 2) return
    const x = (i: number) => w * (1 - (wave.length - 1 - i) / (WAVE_POINTS - 1))
    const y = (v: number) => h / 2 - v * (h / 2 - 6)
    ctx.strokeStyle = TRACE
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    wave.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
    ctx.stroke()
  }, [wave, box])
  return (
    <canvas
      ref={canvas}
      className="mt-2 block h-24 w-full rounded-sm bg-ground"
      role="img"
      aria-label={wave.length > 1 ? 'Live pulse waveform' : 'Pulse waveform, waiting for signal'}
    />
  )
}
