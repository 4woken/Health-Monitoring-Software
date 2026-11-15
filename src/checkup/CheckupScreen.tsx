import { useState, type FormEvent } from 'react'
import { ArrowClockwise, ArrowRight, Check, Plus, X } from '@phosphor-icons/react'
import type { HabitatId } from '../mission/habitats'
import type { OnExerciseDemo } from '../exercises/demoVitals'
import EnvironmentExerciseDemo from '../exercises/EnvironmentExerciseDemo'
import type { Member } from '../crew/roster'
import type { SignalId } from '../health/signals'
import { useDayReport } from '../health/useDayReport'
import { MISSIONS, type MissionId } from '../mission/missions'
import type { SelfTestId } from '../selftests/ids'
import { Button } from '../ui'
import type { Task, TaskKind } from './planner'
import { useCheckup } from './useCheckup'

const GROUPS: { kind: TaskKind; title: string }[] = [
  { kind: 'exam', title: 'Exams and NASA schedule' },
  { kind: 'test', title: 'Self-tests' },
  { kind: 'followUp', title: 'Follow-ups from the signals' },
  { kind: 'routine', title: 'Every day' },
  { kind: 'own', title: 'Added by hand' },
]

/** Today's check-up for one person: planned from their signals and NASA's schedule, then theirs to tick, add to and trim. */
export default function CheckupScreen({
  member,
  mission,
  day,
  onShow,
  habitat,
  gravity,
  onDemo,
  onStartTest,
}: {
  member: Member
  habitat: HabitatId
  gravity: number
  onDemo: OnExerciseDemo
  mission: MissionId
  day: number
  /** Shows the part of the body a task is about. */
  onShow: (signal: SignalId) => void
  /** Opens a self-test, which ticks its task when done. */
  onStartTest: (test: SelfTestId) => void
}) {
  const report = useDayReport(member, day, mission)
  const checkup = useCheckup(report, mission)
  const [draft, setDraft] = useState('')
  const total = checkup.tasks.length
  const done = checkup.tasks.filter((t) => checkup.done.has(t.id)).length

  const add = (event: FormEvent) => {
    event.preventDefault()
    checkup.add(draft)
    setDraft('')
  }

  return (
    <div className="px-5 pb-8 sm:px-6">
      <p className="text-[15px] text-white/80">
        {MISSIONS[mission].name}.{' '}
        {total === 0
          ? 'Nothing planned yet.'
          : done === total
            ? 'All done for today.'
            : `${done} of ${total} done.`}
      </p>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/15" aria-hidden="true">
        <div
          className="h-full rounded-full bg-white transition-[width] duration-500"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </div>

      <div className="pt-6">
        {checkup.planning && total === 0 && <p className="py-6 text-muted">Planning the day…</p>}
        {GROUPS.map(({ kind, title }) => {
          const tasks = checkup.tasks.filter((t) => t.kind === kind)
          if (tasks.length === 0) return null
          return (
            <section key={kind} className="mt-7 first:mt-0" aria-label={title}>
              <h3 className="font-cond text-[15px] text-white/60">{title}</h3>
              <ul className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    done={checkup.done.has(task.id)}
                    onToggle={() => checkup.toggle(task.id)}
                    onRemove={() => checkup.remove(task.id)}
                    onShow={task.signal ? () => onShow(task.signal!) : undefined}
                    onStart={task.test ? () => onStartTest(task.test!) : undefined}
                  />
                ))}
              </ul>
            </section>
          )
        })}

        {/* What exercise looks like here: the body on the left plays it for 30 seconds. */}
        <EnvironmentExerciseDemo
          key={`${habitat}:${gravity}`}
          habitat={habitat}
          gravity={gravity}
          onDemo={onDemo}
        />

        <form onSubmit={add} className="mt-8 flex gap-2" aria-label="Add a task">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={120}
            placeholder="Add a task for today"
            className="h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/[0.04] px-5 text-[15px] placeholder:text-white/35 focus:border-white/50 focus:outline-none"
          />
          <Button type="submit" disabled={!draft.trim()}>
            <Plus size={16} />
            Add
          </Button>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-5 text-[13px] text-muted">
          <p className="max-w-[34ch]">{checkup.credit} You can tick, add and remove tasks.</p>
          <Button kind="ghost" size="sm" onClick={() => void checkup.replan()} disabled={checkup.planning}>
            <ArrowClockwise size={15} />
            Plan again
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  done,
  onToggle,
  onRemove,
  onShow,
  onStart,
}: {
  task: Task
  done: boolean
  onToggle: () => void
  onRemove: () => void
  onShow?: () => void
  /** Starts the self-test that does this task. */
  onStart?: () => void
}) {
  return (
    <li className="group flex items-start gap-4 py-4">
      <button
        onClick={onToggle}
        role="checkbox"
        aria-checked={done}
        aria-label={task.title}
        className={`press mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${done ? 'border-white bg-white text-[#0d0f12]' : 'border-white/35 hover:border-white'}`}
      >
        {done && <Check size={14} weight="bold" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[16px] leading-snug ${done ? 'text-white/45 line-through decoration-white/30' : 'font-medium'}`}
        >
          {task.title}
        </p>
        {task.detail && !done && <p className="mt-1 text-[14px] leading-relaxed text-muted">{task.detail}</p>}
        {!done && (onStart || onShow) && (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
            {onStart && (
              <Button size="sm" kind="primary" onClick={onStart}>
                Start
                <ArrowRight size={14} />
              </Button>
            )}
            {onShow && (
              <button
                onClick={onShow}
                className="text-[13px] text-white/70 underline-offset-4 hover:underline"
              >
                See it on the body
              </button>
            )}
          </div>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove: ${task.title}`}
        title="Remove from today"
        className="press flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-dim opacity-60 group-hover:opacity-100 hover:bg-white/10 hover:text-white"
      >
        <X size={14} />
      </button>
    </li>
  )
}
