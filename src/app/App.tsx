import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, Check, Heartbeat, ListChecks, UserFocus } from '@phosphor-icons/react'
import { BREATH_REPLAY_MS, recentBreath, type BreathReading } from '../camera/breathReading'
import type { CameraView } from '../camera/CameraScreen'
import { stopPulse, usePulse } from '../camera/pulse/pulseSession'
import { useCheckup } from '../checkup/useCheckup'
import { CrewProvider, useCrew } from '../crew/CrewProvider'
import CrewMenu from '../crew/CrewMenu'
import CrewPicker from '../crew/CrewPicker'
import type { Member } from '../crew/roster'
import type { ExerciseKind } from '../exercises/exercisePlan'
import { dayReport } from '../health/readings'
import { DEFAULT_HABITAT, type HabitatId } from '../mission/habitats'
import MissionMenu from '../mission/MissionMenu'
import type { MissionId } from '../mission/missions'
import { Logo } from '../ui'
import { useScrolled } from '../ui/useScrolled'

// The 3D body and the camera are the heaviest parts, so they load when first opened.
const BodyScreen = lazy(() => import('../body/BodyScreen'))
const CheckupScreen = lazy(() => import('../checkup/CheckupScreen'))
const CameraScreen = lazy(() => import('../camera/CameraScreen'))
const NewMember = lazy(() => import('../crew/NewMember'))

type Screen = 'body' | 'checkup' | 'camera'
const SCREENS: { id: Screen; label: string; icon: typeof Heartbeat }[] = [
  { id: 'body', label: 'Body', icon: Heartbeat },
  { id: 'checkup', label: 'Check-up', icon: ListChecks },
  { id: 'camera', label: 'Camera', icon: UserFocus },
]

function Loading() {
  return (
    <p className="flex min-h-[60dvh] items-center justify-center text-sm text-muted" role="status">
      Loading…
    </p>
  )
}

export default function App() {
  return (
    <CrewProvider>
      <Shell />
    </CrewProvider>
  )
}

function Shell() {
  const crew = useCrew()
  const [screen, setScreen] = useState<Screen>('body')
  const [exerciseInterest, setExerciseInterest] = useState<ExerciseKind>()
  const [adding, setAdding] = useState(false)
  const [day, setDay] = useState(60)
  const [mission, setMission] = useState<MissionId>('cruise')
  const [habitat, setHabitat] = useState<HabitatId>(DEFAULT_HABITAT.cruise)
  const [toast, setToast] = useState<string | null>(null)
  const pulse = usePulse()
  const scrolled = useScrolled()
  const member = crew.current

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3400)
    return () => clearTimeout(t)
  }, [toast])

  // Back to the top when the screen or the person changes.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [screen, member?.id, adding])

  const [cameraView, setCameraView] = useState<CameraView>('portrait')
  const [breath, setBreath] = useState<(BreathReading & { ownerId: string }) | null>(null)
  const ownerId = member?.id
  const clearBreath = useCallback(() => setBreath(null), [])
  const acceptBreath = useCallback(
    (reading: BreathReading) => {
      if (ownerId) setBreath({ ...reading, ownerId })
    },
    [ownerId],
  )
  useEffect(() => {
    if (!breath) return
    const timer = window.setTimeout(
      () => setBreath((current) => (current === breath ? null : current)),
      Math.max(0, breath.measuredAt + BREATH_REPLAY_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [breath])
  const openCamera = (view: CameraView = 'portrait') => {
    if (view !== 'pulse') stopPulse()
    setCameraView(view)
    setScreen('camera')
  }
  const leaveProfile = () => {
    stopPulse()
    clearBreath()
    setCameraView('portrait')
    crew.select(null)
  }
  const navigate = (next: Screen) => {
    setExerciseInterest(undefined)
    if (next === 'camera') openCamera()
    else setScreen(next)
  }
  const startAdding = () => {
    stopPulse()
    clearBreath()
    setAdding(true)
  }
  const open = (id: string, next: Screen = 'body') => {
    if (id !== ownerId) {
      stopPulse()
      clearBreath()
      setCameraView('portrait')
    }
    setExerciseInterest(undefined)
    setAdding(false)
    crew.select(id)
    setScreen(next)
  }
  // A new destination brings its usual habitat; the habitat menu can still pick another.
  const chooseMission = (next: MissionId) => {
    setExerciseInterest(undefined)
    setMission(next)
    setHabitat(DEFAULT_HABITAT[next])
  }

  if (adding)
    return (
      <Suspense fallback={<Loading />}>
        <NewMember onCancel={() => setAdding(false)} onDone={(id) => open(id)} />
      </Suspense>
    )
  if (!member) return <CrewPicker mission={mission} day={day} onPick={(id) => open(id)} onAdd={startAdding} />

  const cameraOn = pulse.phase !== 'off' && pulse.phase !== 'error'
  // Body and Check-up open on a full-bleed picture: the bar floats over it until you scroll.
  const overPicture = screen !== 'camera' && !scrolled

  return (
    <div className="min-h-[100dvh]">
      <header
        className={`fixed inset-x-0 top-0 z-30 transition-colors duration-300 ${overPicture ? 'bg-gradient-to-b from-black/55 to-transparent' : 'border-b border-white/[0.06] bg-[#0d0f12]/85 backdrop-blur-xl'}`}
      >
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-4 px-4 sm:px-6">
          <button
            onClick={leaveProfile}
            className="press flex shrink-0 items-center"
            aria-label="Pulsar, back to the crew list"
          >
            <Logo variant="full" size={26} />
          </button>

          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Sections">
            {SCREENS.map((s) => {
              const on = screen === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(s.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`press relative flex h-10 items-center gap-2 rounded-full px-3.5 text-[15px] ${on ? 'text-white' : 'text-white/65 hover:text-white'}`}
                >
                  {s.label}
                  {s.id === 'checkup' && <PendingCount member={member} mission={mission} day={day} />}
                  {on && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-3.5 -bottom-0.5 h-[2px] rounded-full bg-white"
                      aria-hidden="true"
                    />
                  )}
                </button>
              )
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {cameraOn && (
              <button
                onClick={stopPulse}
                className="press flex h-10 items-center gap-2 rounded-full bg-white/[0.08] px-3.5 text-[13px] hover:bg-white/[0.14]"
                title="The camera is on and processed on this device. Click to stop it."
              >
                <Camera size={15} weight="fill" className="text-holo" />
                <span className="hidden tabular-nums sm:inline">
                  {pulse.bpm ? `${Math.round(pulse.bpm)} bpm, stop` : 'Camera on, stop'}
                </span>
              </button>
            )}
            <MissionMenu
              mission={mission}
              onMission={chooseMission}
              habitat={habitat}
              onHabitat={setHabitat}
              day={day}
              onDay={(next) => {
                setExerciseInterest(undefined)
                setDay(next)
              }}
            />
            <CrewMenu onPick={(id) => open(id, screen)} onAdd={startAdding} onAll={leaveProfile} />
          </div>
        </div>
      </header>

      <main className={`relative pb-24 lg:pb-10 ${screen === 'camera' ? 'pt-16' : ''}`}>
        <Suspense fallback={<Loading />}>
          {screen === 'body' ? (
            <BodyScreen
              member={member}
              members={crew.members}
              onSwitch={(id) => open(id)}
              onAddMember={startAdding}
              face={crew.faceOf(member.id)}
              mission={mission}
              day={day}
              setDay={setDay}
              habitat={habitat}
              onOpenCamera={openCamera}
              onOpenExercises={(kind) => {
                setExerciseInterest(kind)
                setScreen('checkup')
              }}
              breath={recentBreath(breath, member.id, Date.now())}
            />
          ) : screen === 'checkup' ? (
            <CheckupScreen
              exerciseInterest={exerciseInterest}
              member={member}
              mission={mission}
              day={day}
              habitat={habitat}
              onOpenBody={() => setScreen('body')}
            />
          ) : (
            <CameraScreen
              key={member.id}
              initialView={cameraView}
              preflightRestingPulseBpm={member.preflightRestingPulseBpm}
              onBreathReading={acceptBreath}
              onBreathUnavailable={clearBreath}
              person={member.short}
              build={member.build}
              avatar={crew.faceOf(member.id)}
              onSkip={() => setScreen('body')}
              onRemove={() => crew.setFace(member.id, null)}
              onCapture={(capture) => {
                crew.setFace(member.id, capture)
                setScreen('body')
                setToast(`${member.short}'s face is now on the body.`)
              }}
            />
          )}
        </Suspense>
      </main>

      {/* Phone and tablet navigation: a tab bar within thumb reach. */}
      <nav
        className="fixed inset-x-3 bottom-3 z-30 flex items-stretch rounded-2xl border border-white/[0.08] bg-[#121519]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
        aria-label="Sections"
      >
        {SCREENS.map((s) => {
          const on = screen === s.id
          return (
            <button
              key={s.id}
              onClick={() => navigate(s.id)}
              aria-current={on ? 'page' : undefined}
              className={`press relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 font-cond text-[12px] ${on ? 'text-white' : 'text-white/55'}`}
            >
              <s.icon size={20} weight={on ? 'fill' : 'regular'} />
              {s.label}
            </button>
          )
        })}
      </nav>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 lg:bottom-6"
        aria-live="polite"
      >
        <AnimatePresence>
          {toast && (
            <motion.p
              key={toast}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="flex items-center gap-2.5 rounded-full bg-white px-5 py-3 text-sm text-[#0d0f12] shadow-[0_12px_32px_rgb(0_0_0/0.4)]"
            >
              <Check size={15} weight="bold" />
              {toast}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Tasks of today's check-up not done yet, next to the tab name. */
function PendingCount({ member, mission, day }: { member: Member; mission: MissionId; day: number }) {
  const report = useMemo(() => dayReport(member, day, mission), [member, day, mission])
  const checkup = useCheckup(report, mission)
  const left = checkup.tasks.filter((t) => !checkup.done.has(t.id)).length
  if (left === 0) return null
  return (
    <span
      className="rounded-full bg-white/[0.16] px-1.5 font-cond text-[12px] leading-5 text-white"
      aria-label={`${left} check-up tasks left`}
    >
      {left}
    </span>
  )
}
