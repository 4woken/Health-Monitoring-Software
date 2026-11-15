import { createSurfaceModel, type ModelStatus } from './surfaceModel'

export type SuitStatus = ModelStatus
export const SUITS = {
  EVA: { title: 'Spacewalk suit (EVA)', model: '/human/spacesuit-emu.glb', name: 'NASA EMU' },
  IVA: { title: 'Flight suit (IVA)', model: '/human/spacesuit-aces.glb', name: 'NASA ACES' },
} as const
export type SuitKind = keyof typeof SUITS

/** Both GLBs are one unit tall, centred above their soles in the same axes as the reference body. */
export function createSpacesuit(onStatus: (status: SuitStatus) => void) {
  return createSurfaceModel<SuitKind>('Spacesuit', (kind) => SUITS[kind].model, onStatus)
}
