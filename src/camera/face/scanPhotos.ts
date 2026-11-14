import type { PortraitView } from './portrait'
import { createTracker } from './faceModel'
import { capturePortrait, sampleSkin } from './portraitCapture'
import { assessScanView, angleLabels, type ScanAngle, type ScanPhotos } from './scanGuidance'

/** Decode photos in the tab. The callback also guards against a late result after cancel/unmount. */
export async function readScanPhotos(
  sources: { angle: ScanAngle; url: string }[],
  isCurrent: () => boolean,
): Promise<ScanPhotos> {
  const tracker = await createTracker('IMAGE', 2)
  try {
    const shots: ScanPhotos = {}
    for (const { angle, url } of sources) {
      if (!isCurrent()) break
      const image = new Image()
      image.src = url
      await image.decode()
      if (!isCurrent()) break
      // Bound inference cost for large phone photographs while preserving the original for the texture.
      const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight))
      const input = document.createElement('canvas')
      input.width = Math.round(image.naturalWidth * scale)
      input.height = Math.round(image.naturalHeight * scale)
      input.getContext('2d')!.drawImage(image, 0, 0, input.width, input.height)
      const faces = tracker.detect(input).faceLandmarks
      if (faces.length !== 1) throw new Error(`${angleLabels[angle]} photo needs one clearly visible face.`)
      const points = faces[0]
      const tone = sampleSkin(input, points)
      const quality = assessScanView(
        { points, width: input.width, height: input.height },
        (tone[0] + tone[1] + tone[2]) / 3,
        angle,
      )
      if (!quality.ready) throw new Error(`${angleLabels[angle]} photo: ${quality.message}`)
      const portrait: PortraitView = capturePortrait(image, points)
      shots[angle] = portrait
    }
    return shots
  } finally {
    tracker.close()
  }
}
