import { describe, expect, it } from 'vitest'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { faceIndices, faceContours, FACE_VERTEX_COUNT } from './faceMesh'

describe('face mesh geometry', () => {
  it('builds closed triangles compatible with the installed MediaPipe model', () => {
    const indices = faceIndices(FaceLandmarker.FACE_LANDMARKS_TESSELATION)
    expect(indices).toHaveLength(852 * 3)
    expect(Math.min(...indices)).toBe(0)
    expect(Math.max(...indices)).toBe(FACE_VERTEX_COUNT - 1)
    expect(() => faceIndices([{ start: 0, end: 1 }])).toThrow()
  })
  it('recovers the eye and lip boundaries used to fill the missing texture regions', () => {
    const left = faceContours(FaceLandmarker.FACE_LANDMARKS_LEFT_EYE.slice().reverse())
    const right = faceContours(FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE)
    const lips = faceContours(FaceLandmarker.FACE_LANDMARKS_LIPS)
    expect(left).toHaveLength(1)
    expect(right).toHaveLength(1)
    expect(lips).toHaveLength(2)
    expect(left[0]).toHaveLength(16)
    expect(right[0]).toHaveLength(16)
    expect(left[0]).toContain(263)
    expect(right[0]).toContain(33)
    expect(() => faceContours([{ start: 0, end: 1 }])).toThrow()
  })
})
