import { Radioactive } from '@phosphor-icons/react'
import { MISSIONS, type MissionId } from '../../mission/missions'
import { sampleAt } from '../../simulation/engine'
import { useSimulation } from '../../simulation/SimulationProvider'

/** The dose rate where the person is, and the dose since launch; it opens the radiation details. */
export default function RadiationReadout({
  mission,
  day,
  onOpen,
}: {
  mission: MissionId
  day: number
  onOpen: () => void
}) {
  const sim = useSimulation()
  const daily = MISSIONS[mission].radiationMSvDay
  const sample = sim.active && sim.sim ? sampleAt(sim.sim, sim.t) : null
  const rate = sample?.doseRate ?? (daily * 1000) / 24
  const total =
    sample && sim.sim ? daily * (day - 1 + sim.sim.scenario.start / 1440) + sample.doseMSv : day * daily
  return (
    <button
      onClick={onOpen}
      className="press on-photo shrink-0 border-l border-white/15 px-5 py-1 text-left hover:bg-white/[0.04]"
      aria-label="Radiation dose rate. Open the dose by organ"
    >
      <span className="flex items-center gap-1.5 font-cond text-[13px] text-white/65">
        <Radioactive size={14} />
        Radiation
      </span>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="display text-[38px] text-white">{Math.round(rate)}</span>
        <span className="text-[13px] text-white/65">µSv/h</span>
      </span>
      <span className="block font-cond text-[13px] text-white/75">{Math.round(total)} mSv since launch</span>
    </button>
  )
}
