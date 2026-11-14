import { assessFace, type AvatarCapture, type PortraitView } from './portrait'
import { faceYawDegrees, reconstructFace } from './multiViewFace'

export const scanAngles = ['front', 'left', 'right'] as const
export type ScanAngle = (typeof scanAngles)[number]
export type ScanPhotos = Partial<Record<ScanAngle, PortraitView>>
export const angleLabels = { front: 'Front', left: 'Your left', right: 'Your right' }
type LandmarkView = Pick<PortraitView, 'width' | 'height' | 'points'>

export function assessScanView(view: LandmarkView, brightness: number, angle?: ScanAngle) {
  const framing = assessFace(view.points, brightness, view.width / view.height, angle !== undefined)
  if (!framing.ready || !angle) return framing
  const yaw = faceYawDegrees(view)
  if (!Number.isFinite(yaw)) return { ready: false, message: 'Keep both eyes in view.' }
  if (angle === 'front') {
    if (Math.abs(yaw) > 12) return { ready: false, message: 'Face the camera straight on.' }
  } else {
    const turn = angle === 'left' ? yaw : -yaw
    if (turn < 20) return { ready: false, message: `Turn your head about 30° to your ${angle}.` }
    if (turn > 44) return { ready: false, message: 'Turn a little back toward the camera so both eyes show.' }
  }
  return { ready: true, message: 'Angle looks good. Hold still.' }
}

export function assembleScan(photos: ScanPhotos): AvatarCapture {
  const { front, left, right } = photos
  if (!front || !left || !right) throw new Error('Capture all three views first.')
  const surface = reconstructFace(front, left, right)
  if (!surface)
    throw new Error(
      'These views could not be aligned. Retake a view with a level head, relaxed mouth and the same lighting.',
    )
  return { ...front, sideViews: { left, right }, surface }
}
