import type { AvatarPoint } from './portrait'
/** A frozen frame owns both the pixels that were analysed and their landmarks. */
export interface LiveFaceFrame {
  id: number
  source: HTMLCanvasElement
  points: AvatarPoint[]
  width: number
  height: number
  skinTone: [number, number, number]
  sample?: boolean
}
