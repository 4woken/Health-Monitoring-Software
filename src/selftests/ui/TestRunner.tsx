import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type LazyExoticComponent,
} from 'react'
import { ArrowCounterClockwise, ArrowLeft, Bluetooth, Warning } from '@phosphor-icons/react'
import type { BreathReading } from '../../camera/breathReading'
import type { Member } from '../../crew/roster'
import type { SignalId } from '../../health/signals'
import type { MissionId } from '../../mission/missions'
import { Button, Chip, LEVEL_LINE, Sparkline } from '../../ui'
import { CONDITIONS } from '../balance/balance'
import { probeMotion } from '../balance/phone'
import { SELF_TESTS, testDuration, USE_LABEL } from '../catalog'
import type { DueTest } from '../due'
import { connectStrap, disconnectStrap, useStrap } from '../heart/strap'
import type { SelfTestId } from '../ids'
import { detail, type RunValues } from '../judge'
import { BASELINE_RUNS, baselineOf, saveResult, useResults, type TestResult } from '../results'
import { snellen } from '../vision/acuity'
import { hush } from '../voice'
import { VoiceToggle, type RunProps } from './parts'

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
        r.details.armsCrossed === true
          ? 'Camera detected both wrists near the chest'
          : 'The camera could not confirm your arm position',
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
    case 'breathingRate':
      return Number.isFinite(d('seconds')) ? [`Chest motion tracked for ${d('seconds')} s`] : []
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
  const modeChosen = useRef(false)
  const [saved, setSaved] = useState<TestResult | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  // A completion belongs to the attempt that started it. A cancelled sensor callback can arrive late.
  const attempt = useRef(0)
  const runNumber = attempt.current

  useEffect(() => {
    if (id !== 'balance' || step !== 'prepare') return
    let live = true
    void probeMotion().then((ok) => {
      if (!live) return
      setMotion(ok)
      if (ok && !modeChosen.current) setMode('phone')
    })
    return () => {
      live = false
    }
  }, [id, step])
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    window.scrollTo?.({ top: 0 })
  }, [step])
  useEffect(
    () => () => {
      attempt.current++
      hush()
    },
    [],
  )

  const finish = (run: RunValues) => {
    if (step !== 'do' || runNumber !== attempt.current || !Number.isFinite(run.score)) return
    attempt.current++
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
      <header className="mt-4">
        {step !== 'prepare' && (
          <p className="font-cond text-[14px] text-white/55">
            {step === 'result' ? `Result for ${member.short}, day ${day}` : `${member.short}, day ${day}`}
          </p>
        )}
        <h1
          ref={heading}
          tabIndex={-1}
          className={`font-semibold tracking-[-0.01em] focus:outline-none ${step === 'prepare' ? 'text-[34px] leading-[1.1] sm:text-[44px]' : 'text-[28px] leading-tight'}`}
        >
          {test.title}
        </h1>
        {step === 'prepare' && (
          <p className="mt-2 max-w-[60ch] text-[17px] leading-snug text-white/70">{test.summary}</p>
        )}
      </header>

      {step === 'prepare' && (
        <div
          className={`grid items-start gap-x-14 gap-y-10 ${test.coach ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}
        >
          <div className="min-w-0">
            {/* The facts of the run, value first, the way a workout preview shows them. */}
            <dl className="mt-7 flex flex-wrap gap-x-12 gap-y-5">
              <Fact value={testDuration(test).replace(/^About /, '')} label="to do" />
              <div className="max-w-[26rem]">
                <dd className="space-y-0.5 text-[15.5px] leading-snug font-medium">
                  {test.uses.map((u) => (
                    <span key={u} className="block">
                      {USE_LABEL[u]}
                    </span>
                  ))}
                </dd>
                <dt className="mt-1 text-[13px] text-white/50">what you need</dt>
              </div>
              {test.family === 'test' && (
                <Fact
                  value={usual !== undefined ? test.score.format(usual) : `${runs} of ${BASELINE_RUNS}`}
                  label={usual !== undefined ? 'your usual result' : 'first runs, to set your usual'}
                />
              )}
              {test.family === 'exercise' && (
                <Fact
                  value={String(earlier.length)}
                  label={earlier.length === 1 ? 'session so far' : 'sessions so far'}
                />
              )}
            </dl>

            {due && (
              <p className="mt-7 max-w-[64ch] border-l-2 border-white/60 pl-4 text-[15px] leading-snug text-white/85">
                <span className="font-semibold text-white">Due today.</span> {due.reason}
              </p>
            )}

            {test.safety && (
              <p className="mt-5 flex max-w-[64ch] items-start gap-2.5 text-[14.5px] leading-relaxed text-white/80">
                <Warning size={18} className="mt-0.5 shrink-0 text-check" aria-hidden="true" />
                {test.safety}
              </p>
            )}

            {choices && (
              <div className="mt-7">
                <ChoiceRow
                  choice={choices}
                  value={mode}
                  onChange={(value) => {
                    modeChosen.current = true
                    setMode(value)
                  }}
                />
              </div>
            )}
            {mode === 'strap' && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
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

            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Button
                kind="primary"
                size="lg"
                onClick={() => {
                  attempt.current++
                  setStep('do')
                }}
                disabled={mode === 'strap' && strap.status !== 'connected'}
              >
                {test.family === 'test' ? 'Start the test' : 'Start'}
              </Button>
              <VoiceToggle />
            </div>

            {/* The run as a strip of steps, in the order they come. */}
            <section aria-label="How it goes" className="mt-12">
              <h2 className="text-[17px] font-semibold">How it goes</h2>
              <ol
                className="mt-4 grid gap-x-6 gap-y-6 sm:grid-cols-2 xl:grid-cols-[repeat(var(--steps),minmax(0,1fr))]"
                style={{ '--steps': test.steps.length } as CSSProperties}
              >
                {test.steps.map((s, i) => (
                  <li key={s} className="border-t border-white/15 pt-3">
                    <span className="font-cond text-[15px] font-semibold text-white/45 tabular-nums">
                      {i + 1}
                    </span>
                    <p className="mt-1.5 text-[14.5px] leading-snug text-white/85">{s}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section
              aria-label="About this test"
              className="mt-12 max-w-[68ch] space-y-5 text-[15px] leading-relaxed"
            >
              <div>
                <h2 className="text-[17px] font-semibold">What it measures</h2>
                <p className="mt-1.5 text-white/80">{test.measures}</p>
              </div>
              <div>
                <h2 className="text-[17px] font-semibold">
                  What NASA does
                  {test.nasa.codes.length > 0 && (
                    <span className="ml-2 font-cond text-[14px] font-normal text-white/50">
                      {test.nasa.codes.join(', ')}
                    </span>
                  )}
                </h2>
                <p className="mt-1.5 text-white/80">{test.nasa.says}</p>
                <p className="mt-2 text-white/65">{test.adaptation}</p>
              </div>
              {test.family === 'test' && history.length > 1 && (
                <div>
                  <h2 className="text-[17px] font-semibold">Your runs so far</h2>
                  <div className="mt-2 flex items-end gap-5">
                    <Sparkline
                      values={history}
                      baseline={usual}
                      color={LEVEL_LINE.ok}
                      width={220}
                      height={40}
                    />
                    <p className="font-cond text-[14px] text-white/55">
                      {earlier.length} run{earlier.length === 1 ? '' : 's'}, last on day{' '}
                      {earlier[earlier.length - 1].day}
                    </p>
                  </div>
                </div>
              )}
              {test.sources.length > 0 && (
                <p className="text-[13.5px] text-white/55">
                  Sources:{' '}
                  {test.sources.map((s, i) => (
                    <span key={s.title}>
                      {i > 0 && '; '}
                      {s.url ? (
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline decoration-white/30 underline-offset-2 hover:text-white"
                        >
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                    </span>
                  ))}
                  .
                </p>
              )}
            </section>
          </div>

          {test.coach && (
            <aside className="lg:sticky lg:top-6 lg:mt-7">
              <Suspense fallback={<div className="aspect-[3/4] w-full rounded-2xl bg-white/[0.04]" />}>
                <Coach move={test.coach} label={`A figure showing the ${test.title.toLowerCase()}`} />
              </Suspense>
            </aside>
          )}
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
                attempt.current++
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

/** A fact of the run: the value large, what it is under it. */
function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dd className="font-cond text-[24px] leading-tight font-medium tabular-nums">{value}</dd>
      <dt className="mt-1 text-[13px] text-white/50">{label}</dt>
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

/** Decimals worth showing for a difference in each unit. */
const DELTA_DECIMALS: Record<string, number> = { s: 1, logMAR: 2, dB: 1, min: 1, '': 1 }

/** How a run compares with a reference: the gap in the test's unit, and whether it is the better way. */
function versus(result: TestResult, reference: number) {
  const { unit, better } = SELF_TESTS[result.test].score
  const gap = result.score - reference
  const decimals = DELTA_DECIMALS[unit] ?? 0
  const size = Math.abs(gap).toFixed(decimals)
  if (Number(size) === 0) return 'The same'
  const improved = better === 'lower' ? gap < 0 : gap > 0
  return `${size}${unit ? ` ${unit}` : ''} ${improved ? 'better' : 'worse'}`
}

/**
 * The recap of a run, read from the top: the number and whether it is usual for this person, how it
 * compares with the usual result and the last run, what the run recorded, and where it goes.
 */
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
  const isTest = test.family === 'test'
  const last = earlier[earlier.length - 1]
  const runs = [...earlier, result]
  const usual = result.usual ?? baselineOf(runs).usual
  const signal = test.signal
  const flagged = isTest && result.level !== 'ok'
  const lines = resultLines(result)
  const rows: [string, string, string?][] = []
  if (isTest)
    rows.push(
      usual !== undefined
        ? ['Your usual result', test.score.format(usual), versus(result, usual)]
        : [
            'Your usual result',
            `Set after ${BASELINE_RUNS} runs`,
            `${Math.min(runs.length, BASELINE_RUNS)} of ${BASELINE_RUNS} done`,
          ],
    )
  if (last)
    rows.push([`Last time, day ${last.day}`, test.score.format(last.score), versus(result, last.score)])
  if (!isTest) rows.push(['Sessions so far', String(runs.length)])

  return (
    <div className="mt-8 max-w-[44rem]">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="font-cond text-[14px] text-white/60">{test.score.label}</p>
          <p
            className="mt-1 font-cond text-[56px] leading-none font-semibold tabular-nums sm:text-[76px]"
            style={{ color: flagged ? LEVEL_LINE[result.level] : undefined }}
          >
            {test.score.format(result.score)}
          </p>
        </div>
        {isTest && <Chip level={result.level} />}
      </div>
      <p className="mt-5 max-w-[60ch] text-[17px] leading-snug">{result.note}</p>

      {rows.length > 0 && (
        <dl className="mt-7 divide-y divide-white/[0.08] border-y border-white/[0.08]">
          {rows.map(([label, value, gap]) => (
            <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto_7.5rem] items-baseline gap-4 py-3">
              <dt className="text-[14.5px] text-white/65">{label}</dt>
              <dd className="font-cond text-[16px] tabular-nums">{value}</dd>
              <dd className="text-right font-cond text-[14px] text-white/55">{gap}</dd>
            </div>
          ))}
        </dl>
      )}

      {runs.length > 1 && (
        <div className="mt-6 [&_svg]:h-auto [&_svg]:w-full" aria-hidden="true">
          <Sparkline
            values={runs.slice(-12).map((r) => r.score)}
            baseline={isTest ? usual : undefined}
            color={LEVEL_LINE[isTest ? result.level : 'ok']}
            width={704}
            height={72}
            fill
          />
          <p className="mt-1.5 font-cond text-[12.5px] text-white/45">
            The last {Math.min(runs.length, 12)} runs
            {isTest && usual !== undefined ? ', the line is your usual' : ''}
          </p>
        </div>
      )}

      {lines.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[15px] font-semibold">What the run recorded</h2>
          <ul className="mt-2 space-y-1.5 text-[15px] leading-snug text-white/80">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      {flagged && (
        <p className="mt-7 max-w-[60ch] text-[14.5px] leading-relaxed text-check">
          Repeat this test within 24 hours: it is on your check-up. If the next run is also worse than usual,
          tell the flight surgeon, as NASA does after a second red cognitive test.
        </p>
      )}

      {signal && (
        <p className="mt-7 max-w-[60ch] text-[14.5px] leading-relaxed text-white/70">
          Sent to <span className="text-white">{signalName(signal)}</span> on the body, for day {result.day}.
        </p>
      )}

      <div className="mt-7 flex flex-wrap gap-2">
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
      <p className="mt-8 text-[12.5px] leading-relaxed text-dim">
        Kept in this browser only. An educational prototype, not a medical device.
      </p>
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
