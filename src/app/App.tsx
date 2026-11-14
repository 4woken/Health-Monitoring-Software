import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Camera, Check, ListChecks, UserFocus } from '@phosphor-icons/react'
import { BREATH_REPLAY_MS, recentBreath, type BreathReading } from '../camera/breathReading'
import type { CameraView } from '../camera/CameraScreen'
import { stopPulse, usePulse } from '../camera/pulse/pulseSession'
import { useCheckup } from '../checkup/useCheckup'
import { CrewProvider, useCrew } from '../crew/CrewProvider'
import CrewMenu from '../crew/CrewMenu'
import CrewPicker from '../crew/CrewPicker'
import type { Member } from '../crew/roster'
import type { DemoPlayback, OnExerciseDemo } from '../exercises/demoVitals'
import type { ExerciseKind } from '../exercises/exercisePlan'
import { dayReport } from '../health/readings'
import type { SignalId } from '../health/signals'
import { DEFAULT_HABITAT, type HabitatId } from '../mission/habitats'
import MissionMenu from '../mission/MissionMenu'
import { MISSIONS, missionDay, type MissionId } from '../mission/missions'
import { Cover, Drawer, Logo } from '../ui'

// The 3D body and the camera are the heaviest parts, so they load when first needed.
const BodyScreen = lazy(() => import('../body/BodyScreen'))
const CheckupScreen = lazy(() => import('../checkup/CheckupScreen'))
const CameraScreen = lazy(() => import('../camera/CameraScreen'))
const CrewLogin = lazy(() => import('../crew/CrewLogin'))
const NewMember = lazy(() => import('../crew/NewMember'))

/** Panels that open over the body. There is no other page. */
type Panel = 'checkup' | 'camera'
type Page = 'intro' | 'profile' | 'dashboard'

const CHECKUP_WIDTH = 560

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
  const member = crew.current
  const [page, setPage] = useState<Page>('intro')
  const [adding, setAdding] = useState(false)
  const [panel, setPanel] = useState<Panel | null>(null)
  /** An exercise asked from the body, shown first in the check-up. */
  const [exerciseInterest, setExerciseInterest] = useState<ExerciseKind>()
  const [mission, setMission] = useState<MissionId>('cruise')
  const [days, setDays] = useState<Record<MissionId, number>>({ cruise: 60, orbit: 1, moon: 1, mars: 1 })
  const day = days[mission]
  const setDay = (next: number) =>
    setDays((previous) => ({ ...previous, [mission]: missionDay(mission, next) }))
  const [habitat, setHabitat] = useState<HabitatId>(DEFAULT_HABITAT.cruise)
  const [gravity, setGravity] = useState(MISSIONS.cruise.gravity)
  const [playback, setPlayback] = useState<DemoPlayback | null>(null)
  const onDemo = useCallback<OnExerciseDemo>((mode, elapsedSeconds = 0) => {
    setPlayback(mode ? { mode, startedAt: performance.now() - elapsedSeconds * 1000 } : null)
  }, [])
  const playing = panel === 'checkup' ? playback : null
  const [toast, setToast] = useState<string | null>(null)
  const [request, setRequest] = useState<{ signal: SignalId; at: number } | null>(null)
  const pulse = usePulse()

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3400)
    return () => clearTimeout(t)
  }, [toast])

  const [cameraView, setCameraView] = useState<CameraView>('portrait')
  const [breath, setBreath] = useState<(BreathReading & { ownerId: string }) | null>(null)
  const ownerId = member.id
  const clearBreath = useCallback(() => setBreath(null), [])
  const acceptBreath = useCallback((reading: BreathReading) => setBreath({ ...reading, ownerId }), [ownerId])
  useEffect(() => {
    if (!breath) return
    const timer = window.setTimeout(
      () => setBreath((current) => (current === breath ? null : current)),
      Math.max(0, breath.measuredAt + BREATH_REPLAY_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [breath])

  const close = useCallback(() => setPanel(null), [])
  const openCamera = (view: CameraView = 'portrait') => {
    if (view !== 'pulse') stopPulse()
    setCameraView(view)
    setPanel('camera')
  }
  const toggle = (next: Panel) => {
    setExerciseInterest(undefined)
    if (next === 'camera') {
      if (panel === 'camera') close()
      else openCamera()
      return
    }
    setPanel((p) => (p === next ? null : next))
  }
  const leaveDashboard = () => {
    stopPulse()
    setPlayback(null)
    clearBreath()
    setPanel(null)
    setRequest(null)
    setExerciseInterest(undefined)
    setToast(null)
    setCameraView('portrait')
  }
  const openMember = (id: string, destination: 'profile' | 'dashboard') => {
    leaveDashboard()
    crew.select(id)
    setAdding(false)
    setPage(destination)
  }
  const openDashboard = (id: string) => openMember(id, 'dashboard')
  const openAvatarSetup = (id: string) => openMember(id, 'profile')
  const showIntro = () => {
    leaveDashboard()
    setAdding(false)
    setPage('intro')
  }
  const startAdding = () => {
    leaveDashboard()
    setAdding(true)
  }
  // A new destination brings its usual habitat; the habitat menu can still pick another.
  const chooseMission = (next: MissionId) => {
    setExerciseInterest(undefined)
    setMission(next)
    setHabitat(DEFAULT_HABITAT[next])
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [page, adding])

  if (adding)
    return (
      <Suspense fallback={<Loading />}>
        <NewMember onCancel={() => setAdding(false)} onCreate={openDashboard} onSetupFace={openAvatarSetup} />
      </Suspense>
    )
  if (page === 'intro')
    return <CrewPicker mission={mission} day={day} onPick={openDashboard} onAdd={startAdding} />
  if (page === 'profile')
    return (
      <Suspense fallback={<Loading />}>
        <CrewLogin key={member.id} initialMemberId={member.id} onBack={showIntro} onEnter={openDashboard} />
      </Suspense>
    )

  const cameraOn = pulse.phase !== 'off' && pulse.phase !== 'error'

  return (
    <div key={member.id} className="min-h-[100dvh]">
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/[0.06] bg-[#0d0f12]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-2 px-3 sm:gap-3 sm:px-6">
          <button
            onClick={showIntro}
            className="press flex shrink-0 items-center rounded"
            aria-label="Pulsar, back to the crew list"
          >
            <span className="hidden sm:inline-flex">
              <Logo variant="full" size={24} />
            </span>
            <span className="inline-flex sm:hidden">
              <Logo size={24} />
            </span>
          </button>
          <span className="mx-1 hidden h-5 w-px bg-white/15 sm:block" aria-hidden="true" />
          <CrewMenu
            onPick={(id) => {
              if (id !== member.id) openDashboard(id)
            }}
            onAdd={startAdding}
            onFace={() => openAvatarSetup(member.id)}
          />

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            {cameraOn && (
              <button
                onClick={stopPulse}
                className="press flex h-9 items-center gap-2 rounded-full bg-white/[0.08] px-3 text-[13px] hover:bg-white/[0.14]"
                title="The camera is on and processed on this device. Click to stop it."
              >
                <Camera size={15} weight="fill" className="text-holo" />
                <span className="hidden tabular-nums md:inline">
                  {pulse.bpm ? `${Math.round(pulse.bpm)} bpm, stop` : 'Camera on, stop'}
                </span>
              </button>
            )}
            <HeaderButton on={panel === 'checkup'} onClick={() => toggle('checkup')} label="Check-up">
              <ListChecks size={17} />
              <PendingCount member={member} mission={mission} day={day} />
            </HeaderButton>
            <HeaderButton on={panel === 'camera'} onClick={() => toggle('camera')} label="Camera">
              <UserFocus size={17} />
            </HeaderButton>
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
          </div>
        </div>
      </header>

      <main className="relative">
        <Suspense fallback={<Loading />}>
          <BodyScreen
            member={member}
            face={crew.faceOf(member.id)}
            mission={mission}
            day={day}
            setDay={setDay}
            habitat={habitat}
            onGravity={setGravity}
            exerciseDemo={playing}
            onOpenCamera={openCamera}
            onOpenExercises={(kind) => {
              setExerciseInterest(kind)
              setPanel('checkup')
            }}
            breath={recentBreath(breath, member.id, Date.now())}
            covered={panel === 'checkup' ? CHECKUP_WIDTH : 0}
            paused={panel === 'camera'}
            request={request}
          />
        </Suspense>
      </main>

      <AnimatePresence>
        {panel === 'checkup' && (
          <Drawer
            key="checkup"
            title="Today's check-up"
            subtitle={`${member.short}, day ${day}`}
            onClose={close}
            width={CHECKUP_WIDTH}
            showAvatar={!!playing}
          >
            <Suspense fallback={<Loading />}>
              <CheckupScreen
                habitat={habitat}
                gravity={gravity}
                onDemo={onDemo}
                exerciseInterest={exerciseInterest}
                member={member}
                mission={mission}
                day={day}
                onShow={(signal) => {
                  setRequest({ signal, at: Date.now() })
                  close()
                }}
              />
            </Suspense>
          </Drawer>
        )}
        {panel === 'camera' && (
          <Cover key="camera" title={`Camera, ${member.short}`} onClose={close}>
            <Suspense fallback={<Loading />}>
              <CameraScreen
                key={member.id}
                initialView={cameraView}
                preflightRestingPulseBpm={member.preflightRestingPulseBpm}
                onBreathReading={acceptBreath}
                onBreathUnavailable={clearBreath}
                person={member.short}
                build={member.build}
                avatar={crew.faceOf(member.id)}
                onSavePortrait={(capture) => crew.setFace(member.id, capture)}
                onApplied={() => {
                  close()
                  setToast(`Portrait saved to ${member.short}'s profile in this browser.`)
                }}
              />
            </Suspense>
          </Cover>
        )}
      </AnimatePresence>

      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center px-4"
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

function HeaderButton({
  on,
  onClick,
  label,
  children,
}: {
  on: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`press flex h-9 items-center gap-1.5 rounded-full px-2.5 text-[14px] sm:px-3 ${on ? 'bg-white text-[#0d0f12]' : 'text-white/75 hover:bg-white/[0.08] hover:text-white'}`}
    >
      {children}
      <span className="hidden md:inline">{label}</span>
    </button>
  )
}

/** Tasks of today's check-up not done yet, next to its button. */
function PendingCount({ member, mission, day }: { member: Member; mission: MissionId; day: number }) {
  const report = useMemo(() => dayReport(member, day, mission), [member, day, mission])
  const checkup = useCheckup(report, mission)
  const left = checkup.tasks.filter((t) => !checkup.done.has(t.id)).length
  if (left === 0) return null
  return (
    <span className="order-last rounded-full bg-urgent px-1.5 font-cond text-[12px] leading-5 font-semibold text-white">
      {left}
      <span className="sr-only"> tasks left</span>
    </span>
  )
}
