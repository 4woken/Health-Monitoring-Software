import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type LazyExoticComponent,
} from 'react'
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bluetooth,
  Warning,
} from '@phosphor-icons/react'
import type { BreathReading } from '../../camera/breathReading'
import type { Member } from '../../crew/roster'
import { GUIDE } from '../../health/guide'
import type { SignalId } from '../../health/signals'
import type { MissionId } from '../../mission/missions'
import { Button, Chip, LEVEL_LINE, Sparkline } from '../../ui'
import { CONDITIONS } from '../balance/balance'
import { probeMotion } from '../balance/phone'
import { SELF_TESTS, USE_LABEL } from '../catalog'
import { CAUSE_LABEL, type DueTest } from '../due'
import { connectStrap, disconnectStrap, useStrap } from '../heart/strap'
import type { SelfTestId } from '../ids'
import { detail, type RunValues } from '../judge'
import { BASELINE_RUNS, baselineOf, saveResult, useResults, type TestResult } from '../results'
import { snellen } from '../vision/acuity'
import { hush } from '../voice'
import { ICON, Label, VoiceToggle, type RunProps } from './parts'

const RUNS: Record<SelfTestId, LazyExoticComponent<ComponentType<RunProps>>> = {
  reaction: lazy(() => import('../reaction/ReactionTest')),
  cognition: lazy(() => import('../cognition/CognitionTest')),
  vision: lazy(() => import('../vision/VisionTest')),
  hearing: lazy(() => import('../hearing/HearingTest')),
  balance: lazy(() => import('../balance/BalanceTest')),
  sitToStand: lazy(() => import('../movement/SitToStandTest')),
  dexterity: lazy(() => import('../dexterity/DexterityTest')),
  pulseRecovery: lazy(() => import('../heart/PulseRecoveryTest')),
  restingPulse: lazy(() => import('../heart/RestingPulseTest')),
  breathingRate: lazy(() => import('../breathing/BreathingRateTest')),
  squats: lazy(() => import('../movement/RepsExercise')),
  heelRaises: lazy(() => import('../movement/RepsExercise')),
  breathing: lazy(() => import('../breathing/GuidedBreathing')),
}
const Coach = lazy(() => import('../coach/Coach'))

type Step = 'prepare' | 'do' | 'result'

interface ModeChoice {
  label: string
  options: { id: string; label: string; hint?: string; disabled?: boolean }[]
}

function choicesFor(id: SelfTestId, motion: boolean, bluetooth: boolean): ModeChoice | null {
  switch (id) {
    case 'balance':
      return {
        label: 'Measure with',
        options: [
          { id: 'camera', label: 'The camera', hint: 'Your whole body in view, 2 to 3 m away' },
          {
            id: 'phone',
            label: 'This phone, on your chest',
            hint: motion
              ? 'Finer sway; the voice guides you'
              : 'Open Pulsar on a phone to use its motion sensor',
            disabled: !motion,
          },
        ],
      }
    case 'pulseRecovery':
    case 'restingPulse':
      return {
        label: 'Read the pulse with',
        options: [
          { id: 'camera', label: 'The camera', hint: 'Your face, in even light' },
          {
            id: 'strap',
            label: 'A heart-rate strap',
            hint: bluetooth ? 'Bluetooth, any brand' : 'This browser cannot use Bluetooth',
            disabled: !bluetooth,
          },
        ],
      }
    case 'breathing':
      return {
        label: 'How long',
        options: [
          { id: '1', label: '1 minute' },
          { id: '3', label: '3 minutes' },
          { id: '5', label: '5 minutes', hint: 'As the NHS suggests' },
        ],
      }
    case 'squats':
      return {
        label: 'Sets',
        options: [
          { id: '2x10', label: '2 sets of 10' },
          { id: '2x15', label: '2 sets of 15' },
          { id: '3x12', label: '3 sets of 12' },
        ],
      }
    case 'heelRaises':
      return {
        label: 'Sets',
        options: [
          { id: '2x15', label: '2 sets of 15' },
          { id: '2x20', label: '2 sets of 20' },
        ],
      }
    default:
      return null
  }
}

/** The lines under a result: each eye, each stance, each pulse reading. */
function resultLines(r: TestResult): string[] {
  const d = (k: string) => detail(r, k)
  switch (r.test) {
    case 'reaction':
      return [
        `${d('lapses')} lapse${d('lapses') === 1 ? '' : 's'} (responses of 355 ms or more)`,
        `${d('falseStarts')} early press${d('falseStarts') === 1 ? '' : 'es'}`,
        `${d('trials')} counters in 3 minutes`,
      ]
    case 'cognition':
      return [
        `${d('errors')} wrong digit${d('errors') === 1 ? '' : 's'}`,
        `Memory task: ${d('nBack')}% (hits ${d('hits')}, false alarms ${d('falseAlarms')})`,
      ]
    case 'vision':
      return [
        `Right eye ${Number.isFinite(d('right')) ? `${d('right').toFixed(2)} logMAR (${snellen(d('right'))})` : 'not measured'}`,
        `Left eye ${Number.isFinite(d('left')) ? `${d('left').toFixed(2)} logMAR (${snellen(d('left'))})` : 'not measured'}`,
        `Amsler grid: ${d('amslerMarks') > 0 ? `${d('amslerMarks')} square${d('amslerMarks') === 1 ? '' : 's'} marked` : 'all lines straight'}`,
        `Tested at ${Math.round(d('distanceMm') / 10)} cm`,
      ]
    case 'hearing':
      return [`${d('correct')} of 24 triplets right`, `Voice: ${String(r.details.voice ?? 'this device')}`]
    case 'balance':
      return CONDITIONS.map((c) => {
        const held = d(`${c.id}Held`)
        const stop = r.details[`${c.id}Stop`]
        return `${c.title}: ${Number.isFinite(held) ? `${held} of ${c.seconds} s` : 'not done'}${typeof stop === 'string' ? `, ${stop.toLowerCase()}` : ''}`
      }).concat(
        typeof r.details.sway === 'number'
          ? [`Mean sway ${r.details.sway}${r.details.mode === 'phone' ? ' m/s²' : ' cm'}`]
          : [],
      )
    case 'sitToStand':
      return [
        `Five stands in ${r.score.toFixed(1)} s`,
        r.details.armsCrossed === false ? 'Arms not crossed: the test asks for them crossed' : 'Arms crossed',
      ]
    case 'dexterity':
      return [
        `${d('drops')} cell${d('drops') === 1 ? '' : 's'} dropped outside the socket`,
        `Fastest cell ${d('fastest')} s`,
      ]
    case 'pulseRecovery':
      return [
        `At rest ${d('p0')} bpm, after the squats ${d('p1')} bpm, after one minute ${d('p2')} bpm`,
        `Ruffier-Dickson index ${d('dickson')}`,
        `${d('squats')} squats counted, pulse read with ${r.details.source === 'strap' ? 'the strap' : 'the camera'}`,
      ]
    case 'restingPulse':
      return [`Read with ${r.details.source === 'strap' ? 'the strap' : 'the camera'} over ${d('seconds')} s`]
    case 'squats':
    case 'heelRaises':
      return [
        `${d('sets')} set${d('sets') === 1 ? '' : 's'}`,
        ...(d('shallow') > 0 ? [`${d('shallow')} shallow`] : []),
      ]
    case 'breathing':
      return typeof r.details.feeling === 'string' ? [`Feeling ${r.details.feeling} afterwards`] : []
    default:
      return []
  }
}

/** One self-test, in three steps: prepare, do, result. */
export default function TestRunner({
  id,
  member,
  mission,
  day,
  due,
  onBack,
  onShowSignal,
  onBreathReading,
  onBreathUnavailable,
}: {
  id: SelfTestId
  member: Member
  mission: MissionId
  day: number
  /** Why the test is due today, if it is. */
  due?: DueTest
  onBack: () => void
  onShowSignal: (signal: SignalId) => void
  onBreathReading: (reading: BreathReading) => void
  onBreathUnavailable: () => void
}) {
  const test = SELF_TESTS[id]
  const Run = RUNS[id]
  const all = useResults(member.id)
  const earlier = all.filter((r) => r.test === id)
  const [step, setStep] = useState<Step>('prepare')
  const [motion, setMotion] = useState(false)
  const strap = useStrap()
  const choices = choicesFor(id, motion, strap.status !== 'unsupported')
  const [mode, setMode] = useState(() => choicesFor(id, false, false)?.options[0].id ?? 'default')
  const [saved, setSaved] = useState<TestResult | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (id !== 'balance') return
    let live = true
    void probeMotion().then((ok) => {
      if (!live) return
      setMotion(ok)
      if (ok) setMode('phone')
    })
    return () => {
      live = false
    }
  }, [id])
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo?.({ top: 0 })
  }, [step])
  useEffect(() => () => hush(), [])

  const finish = (run: RunValues) => {
    hush()
    const judged = test.judge(run, earlier)
    const result = saveResult({
      test: id,
      memberId: member.id,
      mission,
      day,
      at: Date.now(),
      score: run.score,
      details: run.details,
      level: judged.level,
      note: judged.note,
      usual: judged.usual,
    })
    setSaved(result)
    setStep('result')
  }

  const Icon = ICON[id]
  const { runs, usual } = baselineOf(earlier)
  const history = earlier.slice(-12).map((r) => r.score)

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-4 pb-10 sm:px-6">
      <button
        onClick={() => {
          hush()
          onBack()
        }}
        className="press inline-flex items-center gap-1.5 text-[13px] text-white/70 hover:text-white"
      >
        <ArrowLeft size={14} />
        All self-tests
      </button>
      <header className="mt-3 flex items-start gap-3">
        <span className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
          <Icon size={22} />
        </span>
        <div className="min-w-0">
          <p className="font-cond text-[13px] text-white/60">
            {test.family === 'test' ? 'Self-test' : 'Exercise'} · about {test.minutes} min · {member.short},
            day {day}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-[28px] leading-tight font-semibold focus:outline-none"
          >
            {step === 'result' ? `${test.title}: result` : test.title}
          </h1>
          {step === 'prepare' && (
            <p className="mt-1 max-w-2xl text-[15px] leading-relaxed text-muted">{test.summary}</p>
          )}
        </div>
      </header>

      {step === 'prepare' && (
        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="space-y-6">
            {due && (
              <div className="rounded-2xl bg-white/[0.06] px-4 py-3">
                <p className="font-cond text-[13px] text-white/60">Why today · {CAUSE_LABEL[due.cause]}</p>
                <p className="mt-0.5 text-[15px] leading-snug">{due.reason}</p>
              </div>
            )}
            <div>
              <Label>What it measures</Label>
              <p className="mt-1 max-w-2xl text-[15px] leading-relaxed">{test.measures}</p>
            </div>
            <div>
              <Label>How it goes</Label>
              <ol className="mt-1 max-w-2xl list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed">
                {test.steps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
            <div>
              <Label>You need</Label>
              <p className="mt-1 text-[15px] text-muted">{test.uses.map((u) => USE_LABEL[u]).join(' · ')}</p>
            </div>
            {test.safety && (
              <p className="flex max-w-2xl items-start gap-2.5 rounded-2xl border border-line-strong px-4 py-3 text-[14px] leading-relaxed">
                <Warning size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                {test.safety}
              </p>
            )}
            {choices && <ChoiceRow choice={choices} value={mode} onChange={setMode} />}
            {mode === 'strap' && (
              <div className="flex flex-wrap items-center gap-3">
                {strap.status === 'connected' ? (
                  <>
                    <p className="text-[14px]">
                      <Bluetooth size={15} className="mr-1 inline" aria-hidden="true" />
                      {strap.name}: {strap.bpm ?? '—'} bpm
                    </p>
                    <Button size="sm" kind="ghost" onClick={disconnectStrap}>
                      Disconnect
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => void connectStrap()}
                    disabled={strap.status === 'connecting'}
                  >
                    <Bluetooth size={15} />
                    {strap.status === 'connecting' ? 'Connecting…' : 'Connect the strap'}
                  </Button>
                )}
                {strap.message && <p className="text-[13px] text-muted">{strap.message}</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button
                kind="primary"
                size="lg"
                onClick={() => setStep('do')}
                disabled={mode === 'strap' && strap.status !== 'connected'}
              >
                Start
                <ArrowRight size={16} />
              </Button>
              <VoiceToggle />
            </div>
          </div>

          <aside className="space-y-5">
            {test.coach && (
              <Suspense fallback={<div className="aspect-[3/4] w-full rounded-2xl bg-white/[0.04]" />}>
                <Coach move={test.coach} label={`A figure showing the ${test.title.toLowerCase()}`} />
              </Suspense>
            )}
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <Label>What NASA does{test.nasa.codes.length ? ` · ${test.nasa.codes.join(', ')}` : ''}</Label>
              <p className="mt-1 text-[14px] leading-relaxed">{test.nasa.says}</p>
              <p className="mt-3 font-cond text-[13px] text-white/60">This version</p>
              <p className="mt-1 text-[14px] leading-relaxed text-white/80">{test.adaptation}</p>
            </div>
            <div className="px-1">
              <Label>Your usual result</Label>
              {test.family === 'exercise' ? (
                <p className="mt-1 text-[14px] text-white/80">
                  {earlier.length
                    ? `Done ${earlier.length} time${earlier.length === 1 ? '' : 's'}, last on day ${earlier[earlier.length - 1].day}.`
                    : 'Not done yet.'}
                </p>
              ) : usual !== undefined ? (
                <div className="mt-1 flex items-end justify-between gap-3">
                  <p className="text-[14px] text-white/80">
                    {test.score.format(usual)}, from your first {BASELINE_RUNS} runs.
                  </p>
                  {history.length > 1 && (
                    <Sparkline
                      values={history}
                      baseline={usual}
                      color={LEVEL_LINE.ok}
                      width={110}
                      height={28}
                    />
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[14px] text-white/80">
                  Set by your first {BASELINE_RUNS} runs: {runs} done. NASA records baseline sessions before
                  flight the same way.
                </p>
              )}
            </div>
            {test.sources.length > 0 && (
              <div className="px-1 text-[13px] leading-relaxed text-muted">
                <Label>Sources</Label>
                <ul className="mt-1 space-y-1">
                  {test.sources.map((s) => (
                    <li key={s.title}>
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-start gap-1 hover:text-ink hover:underline"
                        >
                          {s.title}
                          <ArrowUpRight size={12} className="mt-1 shrink-0" />
                        </a>
                      ) : (
                        s.title
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      )}

      {step === 'do' && (
        <div className="mt-6">
          <Suspense
            fallback={
              <p role="status" className="py-10 text-muted">
                Opening the test…
              </p>
            }
          >
            <Run
              key={`${id}:${mode}`}
              member={member}
              mode={id === 'squats' || id === 'heelRaises' ? `${id}:${mode}` : mode}
              onDone={finish}
              onCancel={() => {
                hush()
                setStep('prepare')
              }}
              onBreath={onBreathReading}
              onBreathGone={onBreathUnavailable}
            />
          </Suspense>
        </div>
      )}

      {step === 'result' && saved && (
        <ResultView
          result={saved}
          earlier={earlier.filter((r) => r.id !== saved.id)}
          onAgain={() => {
            setSaved(null)
            setStep('prepare')
          }}
          onBack={onBack}
          onShowSignal={onShowSignal}
        />
      )}
    </div>
  )
}

function ChoiceRow({
  choice,
  value,
  onChange,
}: {
  choice: ModeChoice
  value: string
  onChange: (v: string) => void
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-cond text-[13px] text-white/60">{choice.label}</legend>
      <div className="flex flex-wrap gap-2">
        {choice.options.map((o) => (
          <label
            key={o.id}
            className={`flex items-start gap-2 rounded-2xl border px-4 py-2.5 text-[14px] has-checked:border-white/75 has-checked:bg-white/[0.06] ${o.disabled ? 'cursor-default border-line opacity-45' : 'cursor-pointer border-line-strong'}`}
          >
            <input
              type="radio"
              className="mt-1"
              checked={value === o.id}
              disabled={o.disabled}
              onChange={() => onChange(o.id)}
            />
            <span>
              <span className="block font-medium">{o.label}</span>
              {o.hint && <span className="block text-[12.5px] text-white/60">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ResultView({
  result,
  earlier,
  onAgain,
  onBack,
  onShowSignal,
}: {
  result: TestResult
  earlier: TestResult[]
  onAgain: () => void
  onBack: () => void
  onShowSignal: (signal: SignalId) => void
}) {
  const test = SELF_TESTS[result.test]
  const last = earlier[earlier.length - 1]
  const scores = [...earlier.slice(-11), result].map((r) => r.score)
  const signal = test.signal
  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-5">
        <div>
          <p className="font-cond text-[13px] text-white/60">{test.score.label}</p>
          <p className="mt-1 font-cond text-[44px] leading-tight font-semibold tabular-nums sm:text-[56px]">
            {test.score.format(result.score)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {test.family === 'test' && <Chip level={result.level} />}
          <p className="max-w-2xl text-[16px] leading-snug">{result.note}</p>
        </div>
        <ul className="max-w-2xl space-y-1 text-[15px] text-white/80">
          {resultLines(result).map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        {result.level !== 'ok' && (
          <p className="max-w-2xl rounded-2xl border border-check/30 bg-check-bg px-4 py-3 text-[14px] leading-relaxed text-check">
            Repeat this test within 24 hours: it is on your check-up. If the next run is worse than usual
            again, tell the flight surgeon, as NASA does with a second red cognitive test.
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button kind="primary" onClick={onBack}>
            Back to the self-tests
          </Button>
          <Button onClick={onAgain}>
            <ArrowCounterClockwise size={15} />
            Do it again
          </Button>
          {signal && (
            <Button kind="ghost" onClick={() => onShowSignal(signal)}>
              See it on the body
            </Button>
          )}
        </div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl bg-white/[0.04] p-4">
          <p className="font-cond text-[13px] text-white/60">Compared with</p>
          <p className="mt-1 text-[14px] leading-relaxed">
            {result.usual !== undefined
              ? `Your usual result: ${test.score.format(result.usual)}.`
              : `Your usual result is not set yet: ${Math.min(BASELINE_RUNS, earlier.length + 1)} of ${BASELINE_RUNS} runs.`}
            {last ? ` Last time, day ${last.day}: ${test.score.format(last.score)}.` : ''}
          </p>
          {scores.length > 1 && (
            <div className="mt-3">
              <Sparkline
                values={scores}
                baseline={result.usual}
                color={LEVEL_LINE[result.level]}
                width={300}
                height={44}
                fill
              />
            </div>
          )}
        </div>
        {signal && (
          <div className="px-1 text-[14px] leading-relaxed text-white/80">
            <p className="font-cond text-[13px] text-white/60">Where it goes</p>
            <p className="mt-1">
              Added to <span className="text-ink">{signalName(signal)}</span> on the body, for day{' '}
              {result.day}. {GUIDE[signal].what.split('. ')[0]}.
            </p>
          </div>
        )}
        <p className="px-1 text-[12.5px] leading-relaxed text-dim">
          Kept in this browser only. An educational prototype, not a medical device.
        </p>
      </aside>
    </div>
  )
}

const SIGNAL_NAME: Partial<Record<SignalId, string>> = {
  sleep: 'Sleep and alertness',
  opticNerve: 'Optic nerve swelling',
  balance: 'Balance and coordination',
  loading: 'Bone and muscle loading',
  oxygen: 'Oxygen and resting pulse',
  mood: 'Mood',
}
const signalName = (id: SignalId) => SIGNAL_NAME[id] ?? id
