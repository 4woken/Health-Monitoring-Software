import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

export async function createTracker(mode: 'IMAGE' | 'VIDEO', numFaces = 1) {
  const files = await FilesetResolver.forVisionTasks('/face/wasm')
  return FaceLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: '/face/face_landmarker.task', delegate: 'CPU' },
    runningMode: mode,
    numFaces,
  })
}
