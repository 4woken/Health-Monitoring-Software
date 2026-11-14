import { faceCamera, intrinsicPoints, midpoint } from './faceFrame'

/** Visual personalisation only. Images and points remain in this tab's memory. */
export interface AvatarPoint {
  x: number
  y: number
  z: number
}
export interface FaceCalibration {
  scale: number
  x: number
  y: number
  skinMatch: number
  shape: number
}
export const DEFAULT_FACE_CALIBRATION: FaceCalibration = {
  scale: 1,
  x: 0,
  y: 0,
  skinMatch: 0.85,
  shape: 0.65,
}
export interface PortraitView {
  imageUrl: string
  width: number
  height: number
  points: AvatarPoint[]
  skinTone?: [number, number, number]
}
export interface AvatarCapture extends PortraitView {
  sideViews?: { left: PortraitView; right: PortraitView }
  /** Reconstructed surface in eye-centred, interocular units. */
  surface?: AvatarPoint[]
  calibration?: FaceCalibration
  sample?: boolean
}
export interface PersonalAvatar extends AvatarCapture {
  ownerId: string
}
export function faceCalibration(value?: Partial<FaceCalibration>): FaceCalibration {
  const limit = (key: keyof FaceCalibration, lo: number, hi: number) => {
    const n = value?.[key]
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n!)) : DEFAULT_FACE_CALIBRATION[key]
  }
  return {
    scale: limit('scale', 0.8, 1.25),
    x: limit('x', -0.25, 0.25),
    y: limit('y', -0.35, 0.35),
    skinMatch: limit('skinMatch', 0, 1),
    shape: limit('shape', 0, 1),
  }
}
/** Eye-anchored coordinates remove camera translation, distance and head rotation. */
export function normaliseFace(points: AvatarPoint[], width: number, height: number): AvatarPoint[] {
  return intrinsicPoints(faceCamera(points, width, height))
}

export function assessFace(
  points: AvatarPoint[] | undefined,
  brightness: number,
  aspect = 1,
  allowTurn = false,
) {
  if (!points || points.length < 468)
    return { ready: false, message: 'Face the camera so both eyes are visible.' }
  if (points.some((p) => ![p.x, p.y, p.z].every(Number.isFinite)))
    return { ready: false, message: 'Face tracking was lost. Try again.' }
  const xs = points.slice(0, 468).map((p) => p.x),
    ys = points.slice(0, 468).map((p) => p.y)
  const loX = Math.min(...xs),
    hiX = Math.max(...xs),
    loY = Math.min(...ys),
    hiY = Math.max(...ys)
  if (loX < 0.04 || hiX > 0.96 || loY < 0.03 || hiY > 0.97)
    return { ready: false, message: 'Keep your whole face inside the camera view.' }
  if (hiX - loX < 0.2 || hiY - loY < 0.28)
    return { ready: false, message: 'Move a little closer to the camera.' }
  const a = midpoint(points[33], points[133]),
    b = midpoint(points[362], points[263]),
    span = Math.abs(a.x - b.x)
  if (span < 0.03 || Math.abs(a.y - b.y) / (span * aspect) > 0.18)
    return { ready: false, message: 'Keep your head level with the camera.' }
  if (!allowTurn && Math.abs(a.z - b.z) / span > 0.35)
    return { ready: false, message: 'Look straight ahead and keep your head level.' }
  if (brightness < 25) return { ready: false, message: 'Add some light in front of your face.' }
  if (brightness > 238) return { ready: false, message: 'Reduce the light so your face is not washed out.' }
  return { ready: true, message: 'Good framing. Hold still for a moment.' }
}
