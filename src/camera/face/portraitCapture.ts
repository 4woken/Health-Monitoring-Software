import type { AvatarCapture, AvatarPoint } from './portrait'

type ImageSource = CanvasImageSource & {
  width?: number
  height?: number
  videoWidth?: number
  videoHeight?: number
}
export function imageSize(source: ImageSource) {
  return { width: source.videoWidth || source.width || 0, height: source.videoHeight || source.height || 0 }
}
/** A small cheek sample is used only to blend the reference skin colour, not to infer health. */
export function sampleSkin(
  source: ImageSource,
  points: AvatarPoint[],
  probe?: HTMLCanvasElement,
): [number, number, number] {
  const { width, height } = imageSize(source),
    canvas = probe ?? document.createElement('canvas')
  if (canvas.width !== 16) canvas.width = 16
  if (canvas.height !== 8) canvas.height = 8
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  for (const [i, index] of [50, 280].entries()) {
    const p = points[index],
      size = Math.max(4, width * 0.012)
    context.drawImage(source, p.x * width - size / 2, p.y * height - size / 2, size, size, i * 8, 0, 8, 8)
  }
  const pixels = context.getImageData(0, 0, 16, 8).data,
    channels: [number[], number[], number[]] = [[], [], []]
  for (let i = 0; i < pixels.length; i += 4) for (let c = 0; c < 3; c++) channels[c].push(pixels[i + c])
  return channels.map((values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)]) as [
    number,
    number,
    number,
  ]
}

/** Crop in source pixels, preserving the landmark-to-image coordinates at every output size. */
export function capturePortrait(source: ImageSource, points: AvatarPoint[]): AvatarCapture {
  const { width, height } = imageSize(source)
  if (!width || !height || points.length < 468) throw new Error('No complete face frame is available.')
  const face = points.slice(0, 468),
    xs = face.map((p) => p.x),
    ys = face.map((p) => p.y)
  const padX = (Math.max(...xs) - Math.min(...xs)) * 0.14,
    padY = (Math.max(...ys) - Math.min(...ys)) * 0.12
  const left = Math.max(0, Math.floor((Math.min(...xs) - padX) * width)),
    top = Math.max(0, Math.floor((Math.min(...ys) - padY) * height))
  const right = Math.min(width, Math.ceil((Math.max(...xs) + padX) * width)),
    bottom = Math.min(height, Math.ceil((Math.max(...ys) + padY) * height))
  const cropWidth = right - left,
    cropHeight = bottom - top
  // Keep phone photographs within a predictable GPU texture and memory budget.
  const scale = Math.min(1, 2048 / Math.max(cropWidth, cropHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(cropWidth * scale)
  canvas.height = Math.round(cropHeight * scale)
  if (canvas.width < 64 || canvas.height < 64) throw new Error('Move closer to capture a sharper portrait.')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('The portrait could not be captured.')
  context.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, canvas.width, canvas.height)
  return {
    imageUrl: canvas.toDataURL('image/jpeg', 0.96),
    width: canvas.width,
    height: canvas.height,
    skinTone: sampleSkin(source, face),
    points: face.map((p) => ({
      x: (p.x * width - left) / cropWidth,
      y: (p.y * height - top) / cropHeight,
      z: (p.z * width) / cropWidth,
    })),
  }
}
