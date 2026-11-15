/** All geometry is in pixels of the analysis frame, before mirroring the preview. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Regions {
  chest: Rect
  face: Rect
}

/** Use forehead, chin and cheek landmarks to keep the ROI below one visible face. */
export function torsoRegions(
  faces: readonly (readonly { x: number; y: number }[])[],
  width: number,
  height: number,
): Regions | null {
  if (faces.length !== 1) return null
  const points = faces[0]
  const [top, chin, left, right] = [10, 152, 234, 454].map((index) => points[index])
  if (!top || !chin || !left || !right) return null
  const cx = ((left.x + right.x) / 2) * width
  const fw = Math.abs(right.x - left.x) * width
  const fh = (chin.y - top.y) * height
  if (![cx, fw, fh].every(Number.isFinite) || fw < 17 || fh < 20) return null
  const chestY = chin.y * height + 0.28 * fh
  // A seated laptop view often clips the bottom or one edge of the nominal chest box.
  // Keep comparable left/right patches as long as enough of the upper chest is still visible.
  const halfWidth = Math.min(0.87 * fw, cx - 2, width - 2 - cx)
  const chestHeight = Math.min(0.86 * fh, height - 2 - chestY)
  const face = { x: cx - 0.37 * fw, y: top.y * height + 0.16 * fh, w: 0.74 * fw, h: 0.63 * fh }
  if (halfWidth < 0.65 * fw || chestHeight < 0.55 * fh || face.y < 2) return null
  const chest = { x: cx - halfWidth, y: chestY, w: 2 * halfWidth, h: chestHeight }
  return { chest, face }
}

/** Differential Lucas–Kanade on a small patch, with the patch's mean lighting change removed.
 * See Wang & den Brinker, Algorithmic insights of camera-based respiratory motion extraction.
 * The residual and texture checks reject occlusion, blur and ill-conditioned image patches.
 */
function patchFlow(a: Uint8Array, b: Uint8Array, width: number, cx: number, cy: number, radius: number) {
  let xx = 0,
    xy = 0,
    yy = 0,
    xt = 0,
    yt = 0,
    tt = 0
  let sumX = 0,
    sumY = 0,
    sumT = 0
  const n = (radius * 2 + 1) ** 2
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const i = y * width + x
      const gx = (a[i + 1] - a[i - 1] + b[i + 1] - b[i - 1]) / 4
      const gy = (a[i + width] - a[i - width] + b[i + width] - b[i - width]) / 4
      const gt = b[i] - a[i]
      xx += gx * gx
      xy += gx * gy
      yy += gy * gy
      xt += gx * gt
      yt += gy * gt
      tt += gt * gt
      sumX += gx
      sumY += gy
      sumT += gt
    }
  }
  xx -= (sumX * sumX) / n
  xy -= (sumX * sumY) / n
  yy -= (sumY * sumY) / n
  xt -= (sumX * sumT) / n
  yt -= (sumY * sumT) / n
  tt -= (sumT * sumT) / n
  // Horizontal stripes on clothing constrain vertical displacement even if horizontal motion is ambiguous.
  const regularizer = 0.4 * n
  const det = (xx + regularizer) * (yy + regularizer) - xy * xy
  if (yy - (xy * xy) / (xx + regularizer) < 2.4 * n) return null
  const dx = (xy * yt - (yy + regularizer) * xt) / det
  const dy = (xy * xt - (xx + regularizer) * yt) / det
  const residual = (tt + dx * xt + dy * yt) / n
  if (residual > 14 || Math.abs(sumT / n) > 22) return null
  return { dx, dy }
}

function median(values: number[]) {
  values.sort((a, b) => a - b)
  const mid = Math.floor(values.length / 2)
  return (values[mid] + values[Math.floor((values.length - 1) / 2)]) / 2
}

function sampleRegion(a: Uint8Array, b: Uint8Array, width: number, rect: Rect) {
  const radius = Math.max(2, Math.min(5, Math.floor(Math.min(rect.w / 9, rect.h / 5))))
  const height = a.length / width
  const xs: number[] = []
  const ys: number[] = []
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = Math.round(rect.x + ((col + 0.5) * rect.w) / 5)
      const cy = Math.round(rect.y + ((row + 0.5) * rect.h) / 4)
      if (cx <= radius || cy <= radius || cx >= width - radius - 1 || cy >= height - radius - 1) continue
      const flow = patchFlow(a, b, width, cx, cy, radius)
      if (flow) {
        xs.push(flow.dx)
        ys.push(flow.dy)
      }
    }
  }
  if (ys.length < 5) return null
  const dy = median(ys)
  return { dx: median(xs), dy, scatter: median(ys.map((y) => Math.abs(y - dy))) }
}

export type FrameFlow =
  { status: 'tracking'; left: number; right: number; reference: number } | { status: 'texture' | 'motion' }

/** Per-frame bilateral chest flow and a simultaneous head reference for common camera/body translation. */
export function chestFlow(a: Uint8Array, b: Uint8Array, width: number, regions: Regions): FrameFlow {
  const { chest, face } = regions
  const half = { ...chest, w: chest.w / 2 }
  const left = sampleRegion(a, b, width, half)
  const right = sampleRegion(a, b, width, { ...half, x: half.x + half.w })
  const head = sampleRegion(a, b, width, face)
  if (!left || !right || !head) return { status: 'texture' }
  if (
    [left, right, head].some((r) => Math.abs(r.dx) > 1.25 || Math.abs(r.dy) > 1.25 || r.scatter > 0.45) ||
    Math.abs(left.dy - right.dy) > 0.7
  )
    return { status: 'motion' }
  return { status: 'tracking', left: left.dy, right: right.dy, reference: head.dy }
}

export function grayscale(rgba: Uint8ClampedArray, out: Uint8Array) {
  for (let i = 0, j = 0; i < out.length; i++, j += 4) {
    out[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
  }
}
