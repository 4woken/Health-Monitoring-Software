import { useMemo, useState, type FormEvent } from 'react'
import { ArrowClockwise, Check, Plus, X } from '@phosphor-icons/react'
import type { Member } from '../crew/roster'
import { dayReport } from '../health/readings'
import { HABITATS, type HabitatId } from '../mission/habitats'
import { MISSIONS, type MissionId } from '../mission/missions'
import { Button } from '../ui'
import type { Task, TaskKind } from './planner'
import ExerciseMissions from '../exercises/ExerciseMissions'
import type { ExerciseKind } from '../exercises/exercisePlan'
import { useCheckup } from './useCheckup'

const GROUPS: { kind: TaskKind; title: string }[] = [
  { kind: 'exam', title: 'Exams' },
  { kind: 'followUp', title: 'Follow-ups from the signals' },
  { kind: 'routine', title: 'Every day' },
  { kind: 'own', title: 'Added by hand' },
]

/** Today's check-up for one person: planned from their signals, then theirs to tick, add to and trim. */
export default function CheckupScreen({
  member,
  mission,
  day,
  habitat,
  onOpenBody,
  exerciseInterest,
}: {
  member: Member
  mission: MissionId
  day: number
  habitat: HabitatId
  onOpenBody: () => void
  exerciseInterest?: ExerciseKind
}) {
  const report = useMemo(() => dayReport(member, day, mission), [member, day, mission])
  const checkup = useCheckup(report, mission)
  const [draft, setDraft] = useState('')
  const place = HABITATS[habitat]
  const total = checkup.tasks.length
  const done = checkup.tasks.filter((t) => checkup.done.has(t.id)).length

  const add = (event: FormEvent) => {
    event.preventDefault()
    checkup.add(draft)
    setDraft('')
  }

  return (
    <>
      <section
        className="scene relative flex min-h-[44dvh] items-end"
        aria-label={`${member.short}, check-up`}
      >
        <img
          className="scene-photo"
          src={place.image}
          alt=""
          aria-hidden="true"
          style={{ objectPosition: place.imagePosition }}
        />
        <div className="scene-shade" aria-hidden="true" />
        <div className="on-photo relative z-[2] mx-auto w-full max-w-[920px] px-4 pt-28 pb-8 sm:px-6">
          <h1 className="font-cond text-[clamp(44px,6vw,80px)] leading-[0.92] font-semibold">
            {member.short}&apos;s check-up
          </h1>
          <p className="mt-3 text-[17px] text-white/85">
            {MISSIONS[mission].name}, day {day}.{' '}
            {total === 0
              ? 'Nothing planned yet.'
              : done === total
                ? 'All done for today.'
                : `${done} of ${total} done.`}
          </p>
          <div
            className="mt-5 h-1.5 w-full max-w-[28rem] overflow-hidden rounded-full bg-white/15"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-white transition-[width] duration-500"
              style={{ width: `${total ? (done / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[920px] px-4 pt-8 sm:px-6">
        <ExerciseMissions
          key={`${member.id}:${mission}:${day}`}
          memberId={member.id}
          person={member.short}
          interest={exerciseInterest}
        />
        {checkup.planning && total === 0 && <p className="py-6 text-muted">Planning the day…</p>}
        {GROUPS.map(({ kind, title }) => {
          const tasks = checkup.tasks.filter((t) => t.kind === kind)
          if (tasks.length === 0) return null
          return (
            <section key={kind} className="mt-8 first:mt-0" aria-label={title}>
              <h2 className="font-cond text-[15px] text-white/60">{title}</h2>
              <ul className="mt-2 divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    done={checkup.done.has(task.id)}
                    onToggle={() => checkup.toggle(task.id)}
                    onRemove={() => checkup.remove(task.id)}
                    onOpenBody={task.signal ? onOpenBody : undefined}
                  />
                ))}
              </ul>
            </section>
          )
        })}

        <form onSubmit={add} className="mt-10 flex gap-2" aria-label="Add a task">
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

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] py-6 text-[13px] text-muted">
          <p>{checkup.credit} You can tick, add and remove tasks.</p>
          <Button kind="ghost" size="sm" onClick={() => void checkup.replan()} disabled={checkup.planning}>
            <ArrowClockwise size={15} />
            Plan again
          </Button>
        </div>
        <p className="pb-10 text-center text-[13px] text-dim">
          Educational prototype with simulated data. It is not a medical device.
        </p>
      </div>
    </>
  )
}

function TaskRow({
  task,
  done,
  onToggle,
  onRemove,
  onOpenBody,
}: {
  task: Task
  done: boolean
  onToggle: () => void
  onRemove: () => void
  onOpenBody?: () => void
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
        {onOpenBody && !done && (
          <button
            onClick={onOpenBody}
            className="mt-1.5 text-[13px] text-white/70 underline-offset-4 hover:underline"
          >
            See it on the body
          </button>
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
