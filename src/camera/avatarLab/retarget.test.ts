import { Matrix4 } from 'three'
import { expect, it } from 'vitest'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'
import referenceHeads from '../../body/portrait/referenceHeads.json'
import { retarget } from './retarget'

function winkingFrame(withIrises: boolean): FaceLandmarkerResult {
  const { camera, points } = referenceHeads.male
  const landmarks = points.map(({ x, y, z }) => ({
    x: (x - camera.left) / (camera.right - camera.left),
    y: (camera.top - y) / (camera.top - camera.bottom),
    z,
    visibility: 1,
  }))
  // Close the subject's left lid and open the right on the same photographed pose.
  for (const [upper, lower] of [
    [387, 373],
    [386, 374],
    [385, 380],
  ])
    landmarks[upper] = { ...landmarks[lower] }
  for (const [upper, lower] of [
    [160, 144],
    [159, 145],
    [158, 153],
  ]) {
    landmarks[upper] = { ...landmarks[lower], y: landmarks[lower].y - 0.03 }
  }
  if (withIrises) {
    for (const corner of [133, 362]) {
      for (let i = 0; i < 5; i++) landmarks.push({ ...landmarks[corner] })
    }
  }
  const scores = { eyeBlinkLeft: 0.1, eyeBlinkRight: 0.8, jawOpen: 0.6, mouthFunnel: 0.2, mouthPucker: 0.3 }
  return {
    faceLandmarks: [landmarks],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: new Matrix4().makeRotationY(0.3).toArray() }],
    faceBlendshapes: [
      {
        headIndex: 0,
        headName: '',
        categories: Object.entries(scores).map(([categoryName, score], index) => ({
          categoryName,
          score,
          index,
          displayName: '',
        })),
      },
    ],
  }
}

it('animates an asymmetric KalidoKit blink and a simultaneous MediaPipe mouth movement on the same frame', () => {
  const { hybrid, direct, kalidokit } = retarget(winkingFrame(true), 640, 480)!
  expect(kalidokit.expressions.blinkLeft).toBe(1)
  expect(kalidokit.expressions.blinkRight).toBe(0)
  expect(hybrid.expressions).toEqual({ blinkLeft: 1, blinkRight: 0, aa: 0.6, ee: 0, ih: 0, oh: 0.2, ou: 0.3 })
  expect(hybrid.head.angleTo(direct.head)).toBeCloseTo(0)
  expect(direct.expressions.blinkRight).toBe(0.8)
})

it('keeps the MediaPipe blink when iris landmarks are absent', () => {
  const { hybrid, direct, kalidokit } = retarget(winkingFrame(false), 640, 480)!
  expect(kalidokit.expressions.blinkRight).toBe(0)
  expect(hybrid.expressions).toEqual(direct.expressions)
})
