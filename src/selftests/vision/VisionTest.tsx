import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from '@phosphor-icons/react'
import { Button } from '../../ui'
import { CameraStage, useCameraTest } from '../camera/CameraStage'
import { median } from '../results'
import { Cue, type RunProps } from '../ui/parts'
import { say } from '../voice'
import {
  chartLines,
  coveredEyes,
  DIRECTIONS,
  eyeScore,
  irisDistanceMm,
  LETTERS_PER_LINE,
  lineDone,
  snellen,
  testDistanceMm,
  type Direction,
  type Eye,
} from './acuity'
import { Amsler, ScreenScale, TumblingE } from './parts'
import { savedScale } from './screen'

type Step = 'scale' | 'distance' | 'acuity' | 'amsler' | 'questions'
const OTHER: Record<Eye, Eye> = { right: 'left', left: 'right' }
const QUESTIONS = [
  'Is reading up close harder than before the flight?',
  'Has your sight changed since launch, in either eye?',
  'Do you see new blur, spots or wavy lines?',
]
/** How far from the asked distance still counts, as a share. */
const TOLERANCE = 0.12

/** Close-up sharpness of each eye, then the Amsler grid with each eye, then three questions. */
export default function VisionTest({ onDone, onCancel }: RunProps) {
  const [scale, setScale] = useState<number | null>(() => savedScale())
  const [step, setStep] = useState<Step>(scale ? 'distance' : 'scale')
  const camera = useCameraTest(['face', 'hands'])
  const distances = useRef<number[]>([])
  const [distance, setDistance] = useState<number | null>(null)
  const [covered, setCovered] = useState<Record<Eye, boolean>>({ right: false, left: false })
  const [faceSeen, setFaceSeen] = useState(false)
  const [manual, setManual] = useState(false)
  const [eye, setEye] = useState<Eye>('right')
  const ratio = window.devicePixelRatio || 1
  const target = scale ? testDistanceMm(scale * ratio) : 400
  const lines = useMemo(() => (scale ? chartLines(target, scale * ratio) : []), [scale, target, ratio])
  // Start a little above 20/40 so most people read the first lines easily.
  const first = Math.max(
    0,
    lines.findIndex((l) => l.logMAR <= 0.5),
  )
  const [lineOffset, setLineOffset] = useState(0)
  const line = first + lineOffset
  const [letter, setLetter] = useState(() => DIRECTIONS[Math.floor(Math.random() * 4)])
  const tally = useRef({ shown: 0, right: 0, wrong: 0 })
  const correctByLine = useRef<number[]>([])
  const scores = useRef<Record<Eye, number | null>>({ right: null, left: null })
  const marks = useRef<Record<Eye, Set<number>>>({ right: new Set(), left: new Set() })
  const [marked, setMarked] = useState<Set<number>>(new Set())
  const [answers, setAnswers] = useState<(boolean | null)[]>(QUESTIONS.map(() => null))
  const [steady, setSteady] = useState(0)

  // The camera follows the distance and which eye is covered, all along the test.
  const cameraNeeded = step !== 'scale' && step !== 'questions' && !manual
  useEffect(() => {
    if (!cameraNeeded) return
    camera.start((frame) => {
      if (!frame.face) {
        setFaceSeen(false)
        distances.current = []
        setDistance(null)
        return
      }
      setFaceSeen(true)
      const hands = frame.hands.map((h) => h.points)
      const cover = coveredEyes(frame.face.points, hands)
      setCovered(cover)
      const open: Eye | 'both' =
        cover.right && !cover.left ? 'left' : cover.left && !cover.right ? 'right' : 'both'
      const d = irisDistanceMm(frame.face.points, frame.width, frame.height, open)
      if (d === null) {
        distances.current = []
        setDistance(null)
        return
      }
      distances.current = [...distances.current.slice(-9), d]
      setDistance(median(distances.current))
    })
    return () => camera.stop()
  }, [cameraNeeded, camera.start, camera.stop])

  const inRange =
    manual ||
    (camera.running && faceSeen && distance !== null && Math.abs(distance - target) / target <= TOLERANCE)
  const coverOk = manual || (covered[OTHER[eye]] && !covered[eye])
  const ready = inRange && (step !== 'acuity' && step !== 'amsler' ? true : coverOk)

  // Distance step: hold the right distance for a moment, then go on.
  useEffect(() => {
    if (step !== 'distance' || manual) return
    if (!inRange) {
      setSteady(0)
      return
    }
    const id = window.setTimeout(() => setSteady((s) => s + 1), 500)
    if (steady >= 3) {
      setStep('acuity')
      void say(`Good. Cover your ${OTHER[eye]} eye with your palm.`)
    }
    return () => clearTimeout(id)
  }, [step, inRange, steady, eye, manual])

  useEffect(() => {
    if (step === 'distance') void say(`Sit about ${Math.round(target / 10)} centimetres from the screen.`)
  }, [step, target])

  function nextEyeOrGrid() {
    scores.current[eye] = eyeScore(lines.slice(first), correctByLine.current)
    correctByLine.current = []
    tally.current = { shown: 0, right: 0, wrong: 0 }
    setLineOffset(0)
    if (eye === 'right') {
      setEye('left')
      setLetter(DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)])
      void say('Now cover your right eye.')
    } else {
      setEye('right')
      setStep('amsler')
      void say('Amsler grid. Cover your left eye and look at the dot.')
    }
  }

  function answer(direction: Direction) {
    if (step !== 'acuity' || !ready) return
    const t = tally.current
    t.shown++
    if (direction === letter) t.right++
    else t.wrong++
    if (lineDone(t.shown, t.wrong)) {
      correctByLine.current.push(t.right)
      const passed = t.wrong < 3 && t.right >= 3
      tally.current = { shown: 0, right: 0, wrong: 0 }
      if (!passed || line + 1 >= lines.length) return nextEyeOrGrid()
      setLineOffset((offset) => offset + 1)
    }
    let next = DIRECTIONS[Math.floor(Math.random() * 4)]
    if (next === letter) next = DIRECTIONS[(DIRECTIONS.indexOf(next) + 1 + Math.floor(Math.random() * 3)) % 4]
    setLetter(next)
  }

  useEffect(() => {
    if (step !== 'acuity') return
    const keys: Record<string, Direction> = {
      ArrowRight: 'right',
      ArrowLeft: 'left',
      ArrowUp: 'up',
      ArrowDown: 'down',
    }
    const onKey = (e: KeyboardEvent) => {
      const d = keys[e.key]
      if (!d || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      answer(d)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function amslerDone() {
    marks.current[eye] = marked
    setMarked(new Set())
    if (eye === 'right') {
      setEye('left')
      void say('Now cover your right eye and look at the dot.')
    } else {
      setStep('questions')
      camera.stop()
    }
  }

  function finish() {
    const right = scores.current.right
    const left = scores.current.left
    const known = [right, left].filter((v): v is number => v !== null)
    // An eye that missed even the first line scores one line above it.
    const worst = known.length === 2 ? Math.max(...known) : (lines[first]?.logMAR ?? 0.5) + 0.1
    onDone({
      score: Number(worst.toFixed(2)),
      details: {
        right,
        left,
        amslerRight: marks.current.right.size,
        amslerLeft: marks.current.left.size,
        amslerMarks: marks.current.right.size + marks.current.left.size,
        complaint: answers.some((a) => a === true),
        distanceMm: Math.round(manual ? target : (distance ?? target)),
        smallest: lines[lines.length - 1]?.logMAR ?? null,
      },
    })
  }

  const guidance = manual
    ? step === 'acuity' || step === 'amsler'
      ? `Cover your ${OTHER[eye]} eye and keep your ${eye} eye open.`
      : null
    : !camera.running
      ? camera.stopped || 'Starting the camera…'
      : !faceSeen
        ? 'Face the camera, in even light.'
        : distance === null
          ? 'Looking at your eyes…'
          : !inRange
            ? `${Math.round(distance / 10)} cm: ${distance > target ? 'come closer' : 'move back'} to ${Math.round(target / 10)} cm.`
            : (step === 'acuity' || step === 'amsler') && !coverOk
              ? `Cover your ${OTHER[eye]} eye with your palm, and keep your ${eye} eye open.`
              : `${Math.round(distance / 10)} cm. Good.`

  const lineNow = lines[line]
  return (
    <section aria-label="Vision test" className="space-y-5">
      {step === 'scale' && (
        <ScreenScale
          onDone={(s) => {
            setScale(s)
            setStep('distance')
          }}
        />
      )}

      {step !== 'scale' && step !== 'questions' && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            {step === 'distance' && (
              <>
                <Cue>Sit about {Math.round(target / 10)} cm from the screen, both eyes open.</Cue>
                <p className="max-w-2xl text-[15px] text-muted">
                  {target > 400
                    ? `This screen is too coarse to draw the smallest letters at 40 cm, so the test runs at ${Math.round(target / 10)} cm.`
                    : '40 cm is the usual distance for close-up sight, about a forearm and a hand.'}{' '}
                  Wear your usual glasses or lenses for reading.
                </p>
                {manual && (
                  <Button kind="primary" onClick={() => setStep('acuity')}>
                    I am at {Math.round(target / 10)} cm
                  </Button>
                )}
              </>
            )}
            {step === 'acuity' && lineNow && (
              <>
                <Cue>{eye === 'right' ? 'Right eye' : 'Left eye'}: which way does the E open?</Cue>
                <div className="flex min-h-[38vh] items-center justify-center rounded-3xl bg-black">
                  {ready ? (
                    <TumblingE unit={lineNow.unit} direction={letter} />
                  ) : (
                    <p className="px-6 text-center text-[15px] text-white/70">{guidance}</p>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 text-[14px] text-muted">
                  <span>
                    Line {line - first + 1}, letter {Math.min(LETTERS_PER_LINE, tally.current.shown + 1)} of{' '}
                    {LETTERS_PER_LINE}
                  </span>
                  <span className="font-cond tabular-nums">
                    {lineNow.logMAR.toFixed(2)} logMAR ({snellen(lineNow.logMAR)})
                  </span>
                </div>
                <div className="mx-auto grid w-56 grid-cols-3 gap-2" aria-label="Answer with the arrows">
                  <span />
                  <Button onClick={() => answer('up')} aria-label="Up" disabled={!ready}>
                    <ArrowUp size={18} />
                  </Button>
                  <span />
                  <Button onClick={() => answer('left')} aria-label="Left" disabled={!ready}>
                    <ArrowLeft size={18} />
                  </Button>
                  <Button onClick={() => answer('down')} aria-label="Down" disabled={!ready}>
                    <ArrowDown size={18} />
                  </Button>
                  <Button onClick={() => answer('right')} aria-label="Right" disabled={!ready}>
                    <ArrowRight size={18} />
                  </Button>
                </div>
                <p className="text-center text-[13px] text-dim">Arrow keys work too. Guess when unsure.</p>
              </>
            )}
            {step === 'amsler' && scale && (
              <>
                <Cue>
                  {eye === 'right' ? 'Right eye' : 'Left eye'}: look only at the black dot. Tap any square
                  whose lines look wavy, blurred or missing.
                </Cue>
                {ready ? (
                  <Amsler
                    distanceMm={target}
                    cssPxPerMm={scale}
                    marked={marked}
                    onToggle={(cell) =>
                      setMarked((m) => {
                        const next = new Set(m)
                        if (next.has(cell)) next.delete(cell)
                        else next.add(cell)
                        return next
                      })
                    }
                  />
                ) : (
                  <p className="rounded-3xl bg-black px-6 py-16 text-center text-[15px] text-white/70">
                    {guidance}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button kind="primary" onClick={amslerDone} disabled={!ready}>
                    {marked.size
                      ? `Done: ${marked.size} square${marked.size === 1 ? '' : 's'} marked`
                      : 'All lines look straight'}
                  </Button>
                  {marked.size > 0 && (
                    <Button kind="ghost" onClick={() => setMarked(new Set())}>
                      Clear the marks
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          <aside className="space-y-3">
            {!manual && (
              <CameraStage
                camera={camera}
                showBody={false}
                showHands
                idle="The camera measures your distance"
              />
            )}
            <p className="text-[14px] leading-snug" aria-live="polite">
              {guidance}
            </p>
            {!manual && (
              <button
                onClick={() => {
                  camera.stop()
                  setManual(true)
                }}
                className="text-[13px] text-muted underline underline-offset-4 hover:text-ink"
              >
                No camera: I will measure the distance myself
              </button>
            )}
          </aside>
        </div>
      )}

      {step === 'questions' && (
        <div className="max-w-2xl space-y-4">
          <Cue>Three questions, as in NASA&apos;s vision questionnaire.</Cue>
          {QUESTIONS.map((q, i) => (
            <fieldset key={q}>
              <legend className="mb-2 text-[16px]">{q}</legend>
              <div className="flex gap-2">
                {(['No', 'Yes'] as const).map((label) => (
                  <Button
                    key={label}
                    size="sm"
                    kind={answers[i] === (label === 'Yes') ? 'primary' : 'secondary'}
                    aria-pressed={answers[i] === (label === 'Yes')}
                    onClick={() => setAnswers((a) => a.map((v, j) => (j === i ? label === 'Yes' : v)))}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </fieldset>
          ))}
          <Button kind="primary" onClick={finish} disabled={answers.some((a) => a === null)}>
            See my result
          </Button>
        </div>
      )}

      <Button size="sm" kind="ghost" onClick={onCancel}>
        Leave the test
      </Button>
    </section>
  )
}
