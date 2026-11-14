import { Euler, Matrix4, Quaternion } from 'three'
import { Face } from 'kalidokit'
import type { FaceLandmarkerResult } from '@mediapipe/tasks-vision'

export type Solver = 'hybrid' | 'direct' | 'kalidokit'
const expressionNames = ['blinkLeft', 'blinkRight', 'aa', 'ee', 'ih', 'oh', 'ou'] as const
export type Rig = {
  head: Quaternion
  expressions: Record<(typeof expressionNames)[number], number>
}

export function neutralRig(): Rig {
  return {
    head: new Quaternion(),
    expressions: { blinkLeft: 0, blinkRight: 0, aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 },
  }
}

/** Both solvers see exactly the same unmirrored camera frame. */
export function retarget(
  result: FaceLandmarkerResult,
  width: number,
  height: number,
): Record<Solver, Rig> | null {
  const points = result.faceLandmarks[0]
  if (!points || points.length < 468) return null
  const matrix = result.facialTransformationMatrixes[0]
  const bands = result.faceBlendshapes[0]?.categories
  if (!matrix || matrix.data.length !== 16 || !bands) return null

  const direct = neutralRig()
  const rotation = new Matrix4().extractRotation(new Matrix4().fromArray(matrix.data))
  direct.head.setFromRotationMatrix(rotation).normalize()
  const scores = Object.fromEntries(bands.map((c) => [c.categoryName, c.score]))
  direct.expressions.blinkLeft = scores.eyeBlinkLeft ?? 0
  direct.expressions.blinkRight = scores.eyeBlinkRight ?? 0
  direct.expressions.aa = scores.jawOpen ?? 0
  direct.expressions.oh = scores.mouthFunnel ?? 0
  direct.expressions.ou = scores.mouthPucker ?? 0

  // KalidoKit scales its input points in place. Preserve the MediaPipe result.
  const fit = Face.solve(
    points.map(({ x, y, z }) => ({ x, y, z })),
    {
      runtime: 'mediapipe',
      imageSize: { width, height },
      smoothBlink: false,
    },
  )
  if (!fit) return null
  const kalidokit = neutralRig()
  // KalidoKit's raw camera frame has Y down and Z away from the viewer.
  kalidokit.head.setFromEuler(new Euler(-fit.head.x, -fit.head.y, fit.head.z, 'XYZ'))
  const { A, E, I, O, U } = fit.mouth.shape
  kalidokit.expressions = {
    // KalidoKit names the eyes in image space; VRM uses the subject's sides.
    blinkLeft: 1 - fit.eye.r,
    blinkRight: 1 - fit.eye.l,
    aa: A,
    ee: E,
    ih: I,
    oh: O,
    ou: U,
  }
  // KalidoKit returns fully open eyes when the ten iris landmarks are absent.
  const useKalidoLids = points.length === 478
  const hybrid: Rig = {
    head: direct.head,
    expressions: {
      ...direct.expressions,
      blinkLeft: useKalidoLids ? kalidokit.expressions.blinkLeft : direct.expressions.blinkLeft,
      blinkRight: useKalidoLids ? kalidokit.expressions.blinkRight : direct.expressions.blinkRight,
    },
  }
  return { direct, kalidokit, hybrid }
}
