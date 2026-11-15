import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  BatteryHigh,
  Bluetooth,
  Broadcast,
  Crosshair,
  Eye,
  EyeSlash,
  Heart,
  WarningCircle,
} from '@phosphor-icons/react'
import type { Member } from '../crew/roster'
import type { Level } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import { MISSION_ORDER, MISSIONS, type MissionId } from '../mission/missions'
import { EASE, LEVEL_LINE, Logo } from '../ui'
import { EVA_START_S, evaVitals, nextDrinkMinutes } from './evaVitals'
import { useGaze } from './useGaze'

/** Generated EVA scenery; provenance and prompts live in public/environments/eva/GENERATION.md. */
const OUTSIDE: Record<MissionId, string> = {
  orbit: '/environments/eva/concept-eva-orbit-v1.png',
  cruise: '/environments/eva/concept-eva-cruise-v1.png',
  moon: '/environments/eva/concept-eva-moon-v1.png',
  mars: '/environments/eva/concept-eva-mars-v1.png',
}
/** The helmet seen from inside, with a transparent visor opening the scenery shows through. */
const HELMET = '/environments/eva/concept-eva-helmet-v1.png'
const HOLO = '#6fd0ec'
/** Short names, so the menu fits the top of the glass. */
const SHORT: Record<MissionId, string> = { orbit: 'Orbit', moon: 'Moon', cruise: 'Cruise', mars: 'Mars' }

/** Readings handed in by the mission simulation, in place of the spacewalk demonstration. */
export interface LiveReadings {
  bpm: number
  spo2Pct: number
  systolic: number
  diastolic: number
  coreTempC: number
  glucoseMgDl: number
  /** Environmental dose-equivalent rate, not absorbed eye dose. */
  radiationUSvH?: number
  sleepHours: number
  /** Minutes to the next drink, or null when none is planned. */
  nextDrinkMin: number | null
  /** The simulated time, shown beside the suit's status. */
  clock?: string
  /** The newest warning of the simulation, shown under the menu. */
  alert: { level: Level; text: string } | null
}

/** A heartbeat trace that scrolls at the pulse rate. */
function Trace({ bpm }: { bpm: number }) {
  const beat = 'l 14 0 l 4 -6 l 4 6 l 6 0 l 3 4 l 5 -34 l 5 40 l 4 -10 l 8 0 l 6 -8 l 6 8 l 15 0'
  const path = `M 0 50 ${Array.from({ length: 8 }, () => beat).join(' ')}`
  return (
    <svg viewBox="0 0 320 70" aria-hidden="true" className="h-full w-full overflow-hidden">
      <g className="ar-ecg" style={{ animationDuration: `${(4 * 60) / Math.max(30, bpm)}s` }}>
        <path d={path} fill="none" stroke={HOLO} strokeWidth="2.2" strokeLinejoin="round" />
        <path
          d={path}
          transform="translate(320 0)"
          fill="none"
          stroke={HOLO}
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

/**
 * One reading of the head-up display, placed on the visor glass in hundredths of the helmet frame,
 * so it keeps its place along the rim on every screen.
 */
function Reading({
  left,
  top,
  label,
  value,
  unit,
  level = 'ok',
  icon,
  children,
}: {
  left: number
  top: number
  label: string
  value: string
  unit?: string
  level?: Level
  icon?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="absolute" style={{ left: `${left}%`, top: `${top}%` }}>
      <p className="ar-label flex items-center gap-[0.35em]">
        {icon}
        {label}
      </p>
      <p className="ar-value" style={level === 'ok' ? undefined : { color: LEVEL_LINE[level] }}>
        {value}
        {unit && <span className="ar-unit">{unit}</span>}
      </p>
      {children}
    </div>
  )
}

const pulseLevel = (bpm: number): Level => (bpm >= 170 ? 'act' : bpm >= 150 ? 'watch' : 'ok')
const oxygenLevel = (pct: number): Level => (pct < 90 ? 'act' : pct < 94 ? 'watch' : 'ok')
const heatLevel = (c: number): Level => (c >= 38.5 ? 'act' : c >= 38 ? 'watch' : 'ok')
const sugarLevel = (mg: number): Level => (mg < 54 ? 'act' : mg < 70 || mg > 180 ? 'watch' : 'ok')

/**
 * A simulated augmented-reality view: what a crew member could see inside the helmet visor on a
 * spacewalk, their health over the world outside. The readings run along the lower rim of the glass,
 * as a head-up display would place them, and hiding them leaves the view clear. The mission
 * simulation can hand in its own readings.
 */
export default function ArVisor({
  member,
  mission,
  day,
  onMission,
  onClose,
  live,
}: {
  member: Member
  mission: MissionId
  day: number
  /** Changes the destination; without it, the menu has no missions. */
  onMission?: (mission: MissionId) => void
  onClose: () => void
  live?: LiveReadings
}) {
  const report = useDayReport(member, day, mission)
  const r = report.readings
  const [hud, setHud] = useState(true)
  const [seconds, setSeconds] = useState(EVA_START_S)
  const opened = useRef(performance.now())
  const back = useRef<HTMLButtonElement>(null)
  // The latest close handler, so a parent rendering often does not restart the effect below.
  const close = useRef(onClose)
  close.current = onClose
  const eva = evaVitals(r.restingPulseBpm, MISSIONS[mission].gravity, seconds, {
    systolic: r.systolic,
    diastolic: r.diastolic,
    glucoseMgDl: r.glucoseMgDl,
  })
  const shown = live ?? {
    bpm: eva.bpm,
    spo2Pct: eva.spo2Pct,
    systolic: eva.systolic,
    diastolic: eva.diastolic,
    coreTempC: eva.coreTempC,
    glucoseMgDl: eva.glucoseMgDl,
    sleepHours: r.sleepHours,
    nextDrinkMin: nextDrinkMinutes(seconds),
    alert: null,
  }
  // The suit battery runs about eight hours.
  const battery = Math.max(5, Math.round(100 - (seconds / 3600) * 12))
  // Eye control starts with the view; the mouse and the keyboard keep working beside it.
  const gaze = useGaze({ auto: true })
  const gazing = gaze.state !== 'off' && gaze.state !== 'error'

  useEffect(() => {
    back.current?.focus({ preventScroll: true })
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close.current()
    document.addEventListener('keydown', key)
    const id = window.setInterval(
      () => setSeconds(EVA_START_S + (performance.now() - opened.current) / 1000),
      1000,
    )
    return () => {
      document.removeEventListener('keydown', key)
      clearInterval(id)
    }
  }, [])

  const corner =
    'press inline-flex h-10 items-center gap-2 rounded-full border border-holo/45 bg-black/55 px-4 font-cond text-[14px] tracking-wide text-holo backdrop-blur-md hover:bg-holo/15'
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
      {/* The helmet frame and everything on its glass share one box, sized like the frame picture. */}
      <div className="ar-stage">
        <AnimatePresence initial={false}>
          <motion.div
            key={mission}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="pointer-events-none absolute inset-0"
          >
            <img
              src={OUTSIDE[mission]}
              alt=""
              className={`h-full w-full object-cover transition-[filter] duration-700 ${hud ? 'brightness-[0.9]' : ''}`}
            />
            {/* The edges of a curved visor are out of focus. */}
            <img
              src={OUTSIDE[mission]}
              alt=""
              className="ar-periphery absolute inset-0 h-full w-full object-cover blur-[5px]"
            />
          </motion.div>
        </AnimatePresence>
        {/* A darker band along the lower rim keeps the readings legible over a bright Earth. */}
        {hud && <div aria-hidden="true" className="ar-shade pointer-events-none absolute inset-0" />}
        <img
          src={HELMET}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />

        {/* The top of the glass: the brand, the menu, the suit's links and battery. */}
        <p className="ar-brand absolute flex items-center gap-[0.5em]" style={{ left: '21.5%', top: '7.4%' }}>
          <Logo size={20} />
          PULSAR
        </p>
        <div
          role="group"
          aria-label="Visor menu"
          data-big={gazing || undefined}
          className="ar-menu absolute flex items-center gap-[0.6em]"
          style={{ left: '50%', top: '12.6%', transform: 'translateX(-50%)' }}
        >
          <button data-gaze="hud" onClick={() => setHud((h) => !h)} aria-pressed={!hud}>
            {hud ? <EyeSlash size="1.15em" /> : <Eye size="1.15em" />}
            {hud ? 'Hide info' : 'Show info'}
          </button>
          {onMission &&
            MISSION_ORDER.map((id) => (
              <button
                key={id}
                data-gaze={`mission:${id}`}
                onClick={() => onMission(id)}
                aria-pressed={mission === id}
                aria-label={MISSIONS[id].name}
              >
                {SHORT[id]}
              </button>
            ))}
        </div>
        {hud && (
          <div
            className="ar-status absolute flex items-center gap-[0.7em]"
            style={{ right: '20%', top: '7.6%' }}
            title="Biosensor link, voice link and suit battery"
          >
            {shown.clock && <span className="tabular-nums">{shown.clock}</span>}
            <Bluetooth size="1.25em" />
            <Broadcast size="1.25em" />
            <span className="flex items-center gap-[0.25em]">
              <BatteryHigh size="1.45em" />
              {battery}%
            </span>
          </div>
        )}
        {hud && shown.alert && (
          <p
            role="alert"
            className="ar-alert absolute flex items-center gap-[0.5em]"
            style={{ left: '50%', top: '21%', color: LEVEL_LINE[shown.alert.level] }}
          >
            <WarningCircle size="1.3em" weight="fill" />
            {shown.alert.text}
          </p>
        )}

        {/* The readings, along the lower rim of the glass. */}
        <AnimatePresence>
          {hud && (
            <motion.div
              key="readings"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              className="absolute inset-0"
              aria-label="Health readings"
            >
              <Reading
                left={42.4}
                top={59}
                label="Radiation · sim /"
                value={(shown.radiationUSvH ?? (MISSIONS[mission].radiationMSvDay * 1000) / 24).toFixed(1)}
                unit="µSv/h"
              />
              <Reading
                left={17.6}
                top={60}
                label="Heart rate /"
                value={String(shown.bpm)}
                unit="bpm"
                level={pulseLevel(shown.bpm)}
                icon={<Heart size="1.05em" weight="fill" />}
              >
                <div className="mt-[0.25em] h-[3.8em] w-[15em]">
                  <Trace bpm={shown.bpm} />
                </div>
              </Reading>
              <Reading
                left={23.2}
                top={77}
                label="Blood oxygen /"
                value={String(shown.spo2Pct)}
                unit="%"
                level={oxygenLevel(shown.spo2Pct)}
              />
              <Reading
                left={42.4}
                top={74.6}
                label="Blood pressure /"
                value={`${shown.systolic}/${shown.diastolic}`}
                unit="mmHg"
              />
              {shown.nextDrinkMin !== null && (
                <Reading
                  left={58.6}
                  top={75.2}
                  label="Next drink in:"
                  value={shown.nextDrinkMin <= 0 ? 'Now' : String(Math.round(shown.nextDrinkMin))}
                  unit={shown.nextDrinkMin <= 0 ? undefined : 'min'}
                  level={shown.nextDrinkMin <= 0 ? 'watch' : 'ok'}
                />
              )}
              <Reading
                left={73}
                top={58.6}
                label="Temperature /"
                value={shown.coreTempC.toFixed(1)}
                unit="°C"
                level={heatLevel(shown.coreTempC)}
              />
              <Reading
                left={72}
                top={69.2}
                label="Glucose level /"
                value={String(shown.glucoseMgDl)}
                unit="mg/dL"
                level={sugarLevel(shown.glucoseMgDl)}
              />
              <Reading
                left={68.6}
                top={78.6}
                label="Sleep /"
                value={shown.sleepHours.toFixed(1)}
                unit="h a night"
                level={shown.sleepHours < 6 ? 'watch' : 'ok'}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Outside the glass, in the corners: leaving the view, and eye control. */}
      <button ref={back} onClick={onClose} className={`${corner} fixed bottom-4 left-4 z-[6]`}>
        <ArrowLeft size={16} />
        Back
      </button>
      <div className="fixed right-4 bottom-4 z-[6] flex items-center gap-2">
        {gaze.state === 'on' && (
          <button onClick={gaze.recalibrate} className={corner}>
            Recalibrate
          </button>
        )}
        <button
          onClick={gazing ? gaze.stop : gaze.start}
          aria-pressed={gazing}
          title={
            gaze.state === 'error' ? gaze.message : 'Press the buttons by looking at them, with the webcam'
          }
          className={`${corner} ${gazing ? 'border-holo text-white' : ''}`}
        >
          <Crosshair size={16} />
          {gazing ? 'Eye control on' : 'Eye control off'}
        </button>
      </div>

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
