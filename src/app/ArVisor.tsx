import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeft, Crosshair, Eye, EyeSlash } from '@phosphor-icons/react'
import type { Member } from '../crew/roster'
import { advise, KIND_LABEL } from '../health/advice'
import type { Level } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import { MISSION_ORDER, MISSIONS, type MissionId } from '../mission/missions'
import { EASE, LEVEL_LINE } from '../ui'
import { clockText, EVA_START_S, evaVitals } from './evaVitals'
import { useGaze } from './useGaze'

/** What the crew member sees outside the helmet on a spacewalk, for each destination. NASA photographs. */
const OUTSIDE: Record<MissionId, { src: string; position: string }> = {
  orbit: { src: '/environments/eva/nasa-earth-limb-iss.jpg', position: '50% 62%' },
  cruise: { src: '/environments/eva/nasa-orion-earth-moon.jpg', position: '50% 35%' },
  moon: { src: '/environments/references/nasa-moon.jpg', position: '50% 55%' },
  mars: { src: '/environments/eva/nasa-mars-curiosity.jpg', position: '50% 38%' },
}
const HOLO = '#6fd0ec'

/**
 * The helmet, seen from inside: the brim above and the lower rim below, too close to the eye to be in
 * focus, so they are dark and soft. A faint sheen lies on the glass.
 */
function Helmet() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-0 z-[3] h-full w-full"
    >
      <defs>
        <filter id="ar-soft" x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
        <linearGradient id="ar-brim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#020304" />
          <stop offset="0.7" stopColor="#0d1014" />
          <stop offset="1" stopColor="#1d232a" />
        </linearGradient>
        <linearGradient id="ar-rim" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#020304" />
          <stop offset="0.7" stopColor="#0c0f13" />
          <stop offset="1" stopColor="#1b2027" />
        </linearGradient>
        <linearGradient id="ar-sheen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.1" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* A soft sheen across the glass, from the top left. */}
      <path d="M 0 0 L 900 0 L 0 760 Z" fill="url(#ar-sheen)" />
      <g filter="url(#ar-soft)">
        {/* The brim: thicker at the sides, where the helmet curves round. */}
        <path
          d="M -40 -40 H 1640 V 150 C 1350 70 1050 55 800 55 C 550 55 250 70 -40 150 Z"
          fill="url(#ar-brim)"
        />
        {/* The lower rim, rising at the corners towards the shoulders. */}
        <path
          d="M -40 1040 H 1640 V 820 C 1380 925 1080 950 800 950 C 520 950 220 925 -40 820 Z"
          fill="url(#ar-rim)"
        />
        {/* The inner edge of the glass catches a little light. */}
        <path
          d="M -40 158 C 250 78 550 63 800 63 C 1050 63 1350 78 1640 158"
          fill="none"
          stroke="#8fa3b5"
          strokeOpacity="0.28"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d="M -40 812 C 220 917 520 942 800 942 C 1080 942 1380 917 1640 812"
          fill="none"
          stroke="#8fa3b5"
          strokeOpacity="0.22"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  )
}

/** A block of the head-up display: cut corners and a faint glass backing. */
function Pane({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <motion.section
      aria-label={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, delay, ease: EASE }}
      className="ar-pane relative px-4 py-3"
    >
      <h3 className="ar-glow font-cond text-[11.5px] tracking-[0.22em] text-holo uppercase">{title}</h3>
      <div className="mt-2">{children}</div>
    </motion.section>
  )
}

function Reading({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="font-cond text-[12px] tracking-[0.12em] text-white/70 uppercase">{label}</span>
      <span className="ar-glow font-cond text-white tabular-nums">
        <span className="text-[26px] leading-none font-semibold">{value}</span>
        <span className="ml-1 text-[12px] text-holo/80">{unit}</span>
      </span>
    </div>
  )
}

/** A heartbeat trace that scrolls at the pulse rate. */
function Trace({ bpm }: { bpm: number }) {
  const beat = 'l 14 0 l 4 -6 l 4 6 l 6 0 l 3 4 l 5 -34 l 5 40 l 4 -10 l 8 0 l 6 -8 l 6 8 l 15 0'
  const path = `M 0 50 ${Array.from({ length: 8 }, () => beat).join(' ')}`
  return (
    <svg viewBox="0 0 320 70" aria-hidden="true" className="h-12 w-full overflow-hidden">
      <g className="ar-ecg" style={{ animationDuration: `${(4 * 60) / Math.max(30, bpm)}s` }}>
        <path d={path} fill="none" stroke={HOLO} strokeWidth="2" strokeLinejoin="round" />
        <path
          d={path}
          transform="translate(320 0)"
          fill="none"
          stroke={HOLO}
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

/**
 * A simulated augmented-reality view: what a crew member could see inside the helmet visor on a
 * spacewalk, their health over the world outside. Hiding the readings leaves the view clear.
 */
export default function ArVisor({
  member,
  mission,
  day,
  onMission,
  onClose,
}: {
  member: Member
  mission: MissionId
  day: number
  onMission: (mission: MissionId) => void
  onClose: () => void
}) {
  const report = useDayReport(member, day, mission)
  const advice = advise(report, mission).slice(0, 3)
  const counts = { act: 0, watch: 0 }
  for (const s of report.signals) if (s.level !== 'ok') counts[s.level]++
  const status: Level = counts.act ? 'act' : counts.watch ? 'watch' : 'ok'
  const [hud, setHud] = useState(true)
  const [seconds, setSeconds] = useState(EVA_START_S)
  const opened = useRef(performance.now())
  const back = useRef<HTMLButtonElement>(null)
  const eva = evaVitals(report.readings.restingPulseBpm, MISSIONS[mission].gravity, seconds)
  const outside = OUTSIDE[mission]
  // Eye control starts with the view; the mouse and the keyboard keep working beside it.
  const gaze = useGaze({ auto: true })
  const gazing = gaze.state !== 'off' && gaze.state !== 'error'
  /** A typical gaze error past a tenth of the screen diagonal makes the buttons hard to tell apart. */
  const rough =
    gaze.errorPx !== null && gaze.errorPx > 0.1 * Math.hypot(window.innerWidth, window.innerHeight)

  useEffect(() => {
    back.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', key)
    const id = window.setInterval(
      () => setSeconds(EVA_START_S + (performance.now() - opened.current) / 1000),
      1000,
    )
    return () => {
      document.removeEventListener('keydown', key)
      clearInterval(id)
    }
  }, [onClose])

  /** A control of the visor; with eye control on, the buttons grow and spread so the gaze can tell them apart. */
  const control = (selected = false) =>
    `press inline-flex items-center justify-center gap-2 rounded-full border font-cond tracking-wide backdrop-blur-md ${
      selected ? 'border-holo bg-holo/25 text-white' : 'border-holo/50 bg-black/40 text-holo hover:bg-holo/15'
    } ${gazing ? 'h-12 min-w-[124px] px-5 text-[15px]' : 'h-10 px-4 text-[14px]'}`
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Augmented reality view, ${member.short}`}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{ duration: 0.55, ease: EASE }}
      className="fixed inset-0 z-50 overflow-hidden bg-black text-white"
    >
      {/* The world outside, sharp in the middle; the readings soften it a little. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={mission}
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          className="pointer-events-none fixed inset-0"
        >
          <img
            src={outside.src}
            alt=""
            style={{ objectPosition: outside.position }}
            className={`h-full w-full scale-[1.03] object-cover transition-[filter] duration-700 ${hud ? 'blur-[1.5px] brightness-[0.82]' : ''}`}
          />
          {/* The edges of a curved visor are out of focus. */}
          <img
            src={outside.src}
            alt=""
            style={{ objectPosition: outside.position }}
            className="ar-periphery absolute inset-0 h-full w-full scale-[1.03] object-cover blur-[6px]"
          />
        </motion.div>
      </AnimatePresence>
      {hud && <div aria-hidden="true" className="ar-scan pointer-events-none fixed inset-0" />}

      <div className="absolute inset-x-[5%] top-[13%] bottom-[11%] z-[4] flex flex-col">
        <AnimatePresence>
          {hud && (
            <motion.div
              key="hud"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-1 flex-col"
            >
              <p className="ar-glow mx-auto text-center font-cond text-[13px] tracking-[0.26em] uppercase">
                <span style={{ color: status === 'ok' ? HOLO : LEVEL_LINE[status] }}>
                  {status === 'act'
                    ? `Health · ${counts.act} urgent`
                    : status === 'watch'
                      ? `Health · ${counts.watch} to check`
                      : 'Health · nominal'}
                </span>
                <span className="text-white/60"> · EVA {clockText(seconds)}</span>
              </p>
              <div className="mt-4 grid flex-1 content-center gap-5 md:grid-cols-2 md:items-center">
                <div className="w-full max-w-[340px] space-y-4">
                  <Pane title="Heart · on the spacewalk" delay={0.1}>
                    <div className="flex items-end justify-between gap-3">
                      <p
                        className="ar-glow font-cond tabular-nums"
                        style={{ color: eva.bpm > 150 ? LEVEL_LINE.watch : '#fff' }}
                      >
                        <span className="text-[56px] leading-none font-semibold">{eva.bpm}</span>
                        <span className="ml-1 text-[14px] text-holo/80">bpm</span>
                      </p>
                      <div className="w-1/2">
                        <Trace bpm={eva.bpm} />
                      </div>
                    </div>
                    <p className="mt-1 font-cond text-[12px] tracking-wide text-white/55">
                      {report.readings.restingPulseBpm} bpm at rest this morning
                    </p>
                  </Pane>
                  <Pane title="Body" delay={0.2}>
                    <Reading label="Breathing" value={String(eva.breathsPerMinute)} unit="/min" />
                    <Reading label="Oxygen" value={String(eva.spo2Pct)} unit="%" />
                    <Reading label="Core temp." value={eva.coreTempC.toFixed(1)} unit="°C" />
                    <Reading label="Effort" value={String(eva.kcalPerHour)} unit="kcal/h" />
                    <Reading label="Suit CO2" value={eva.suitCo2MmHg.toFixed(1)} unit="mmHg" />
                  </Pane>
                </div>
                <div className="w-full max-w-[340px] md:justify-self-end">
                  {advice.length > 0 && (
                    <Pane title="To check today" delay={0.3}>
                      <ul className="space-y-2.5">
                        {advice.map((a) => (
                          <li key={a.id} className="flex gap-2.5">
                            <span
                              className="mt-1 w-[3px] shrink-0 rounded-full"
                              style={{ background: LEVEL_LINE[a.level] }}
                            />
                            <span>
                              <span
                                className="block font-cond text-[11px] tracking-[0.12em] uppercase"
                                style={{ color: LEVEL_LINE[a.level] }}
                              >
                                {KIND_LABEL[a.kind]} · {a.level === 'act' ? 'now' : 'today'}
                              </span>
                              <span className="block text-[15px] leading-snug font-medium">{a.title}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    </Pane>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!hud && <div className="flex-1" />}

        <div
          className={`mt-4 flex flex-wrap items-center justify-center ${gazing ? 'gap-x-4 gap-y-3' : 'gap-2'}`}
        >
          {/* Back is left to the mouse and the keyboard, so a glance cannot close the view. */}
          <button ref={back} onClick={onClose} className={control()}>
            <ArrowLeft size={16} />
            Back
          </button>
          <button data-gaze="hud" onClick={() => setHud((h) => !h)} aria-pressed={!hud} className={control()}>
            {hud ? <EyeSlash size={16} /> : <Eye size={16} />}
            {hud ? 'Hide info' : 'Show info'}
          </button>
          <div
            role="group"
            aria-label="Mission"
            className={`flex flex-wrap items-center justify-center ${gazing ? 'gap-x-4 gap-y-3' : 'gap-1.5'}`}
          >
            {MISSION_ORDER.map((id) => (
              <button
                key={id}
                data-gaze={`mission:${id}`}
                onClick={() => onMission(id)}
                aria-pressed={mission === id}
                className={control(mission === id)}
              >
                {MISSIONS[id].name}
              </button>
            ))}
          </div>
          <button
            onClick={gazing ? gaze.stop : gaze.start}
            aria-pressed={gazing}
            title="Press the buttons by looking at them, with the webcam"
            className={control(gazing)}
          >
            <Crosshair size={16} />
            {gazing ? 'Eye control on' : 'Eye control off'}
          </button>
        </div>
        {gaze.state !== 'off' && gaze.state !== 'calibrating' && (
          <p className="mt-2 text-center font-cond text-[13px] tracking-wide text-holo/90" aria-live="polite">
            {gaze.state === 'on'
              ? gaze.lost
                ? 'Face not found: look at the screen, with your face in the light.'
                : `Look at a button for a second to press it.${gaze.errorPx === null ? '' : ` Typical error ${Math.round(gaze.errorPx)} px.`}${rough ? ' Tracking is rough: face the camera in even light, then recalibrate.' : ''}`
              : gaze.message}
            {gaze.state === 'on' && (
              <button
                onClick={gaze.recalibrate}
                className="ml-2 underline underline-offset-4 hover:text-white"
              >
                Recalibrate
              </button>
            )}
          </p>
        )}
        {hud && (
          <p className="mt-2 text-center font-cond text-[11px] tracking-wide text-white/45">
            Simulated view: spacewalk readings are a demonstration built from the resting pulse.
          </p>
        )}
      </div>

      <Helmet />

      {/* Calibration: nine dots, one after the other, each with a ring that closes on it. */}
      <AnimatePresence>
        {gaze.state === 'calibrating' && (
          <motion.div
            key="calibration"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-[7] bg-[#02070b]/75"
          >
            <div
              className="absolute inset-x-0 top-[57%] mx-auto max-w-md px-4 text-center"
              aria-live="polite"
            >
              <p className="ar-glow font-cond text-[12px] tracking-[0.24em] text-holo uppercase">
                Eye control · calibration
              </p>
              <p className="mt-2 text-[16px] leading-snug text-white">
                Look at each dot until its ring closes.
              </p>
              <p className="mt-1 font-cond text-[13px] tracking-wide text-white/60">
                {gaze.lost
                  ? 'Paused: the camera cannot see your face.'
                  : `Dot ${(gaze.dot?.index ?? 0) + 1} of 9`}
              </p>
              <button
                onClick={gaze.stop}
                className="press mt-4 font-cond text-[13px] tracking-wide text-holo/90 underline underline-offset-4 hover:text-white"
              >
                Use the mouse instead
              </button>
            </div>
            {gaze.dot && (
              <span
                key={gaze.dot.index}
                aria-hidden="true"
                className="gaze-dot"
                data-paused={gaze.lost || undefined}
                style={
                  {
                    left: `${gaze.dot.point.x * 100}%`,
                    top: `${gaze.dot.point.y * 100}%`,
                    '--dot-ms': `${gaze.dot.ms}ms`,
                  } as CSSProperties
                }
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Where the eyes point. It shrinks on a button, which lights up and fills while the gaze holds. */}
      <div ref={gaze.cursorRef} aria-hidden="true" className="gaze-cursor" />
    </motion.div>
  )
}
