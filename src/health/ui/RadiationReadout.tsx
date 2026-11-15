import { Radioactive } from '@phosphor-icons/react'
import { MISSIONS, type MissionId } from '../../mission/missions'
import { sampleAt } from '../../simulation/engine'
import { useSimulation } from '../../simulation/SimulationProvider'
import type { VitalLevel } from '../vitalLevels'
import { valueColor, VitalLabel, VitalSource } from './VitalParts'

/** The dose rate where the person is, and the dose since launch; it opens the radiation details. */
export default function RadiationReadout({
  mission,
  day,
  vital,
  onOpen,
}: {
  mission: MissionId
  day: number
  /** The level of the radiation signal. */
  vital: VitalLevel
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
      className="press on-photo group shrink-0 border-l border-white/15 px-5 py-1 text-left hover:bg-white/[0.04]"
      aria-label={`Radiation ${Math.round(rate)} µSv/h${vital.word ? `, ${vital.word.toLowerCase()}` : ''}. Open the dose by organ`}
    >
      <VitalLabel vital={vital}>
        {vital.level === 'ok' && <Radioactive size={14} />}
        Radiation
      </VitalLabel>
      <span className="mt-1 flex items-baseline gap-1.5">
        <span className="display text-[38px]" style={{ color: valueColor(vital.level) }}>
          {Math.round(rate)}
        </span>
        <span className="text-[13px] text-white/65">µSv/h</span>
      </span>
      <VitalSource vital={vital}>{Math.round(total)} mSv since launch</VitalSource>
    </button>
  )
}
