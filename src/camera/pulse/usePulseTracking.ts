import { useEffect, useRef, useState, type RefObject } from 'react'
import { FaceLandmarker } from '@mediapipe/tasks-vision'
import { getPulseVideo, startPulse, stopPulse, subscribeFrames, usePulse } from './pulseSession'
import { createFaceStage } from '../face/faceStage'

/**
 * Draws the pulse experiment's mesh from its shared camera session. Portrait fitting releases
 * this session before opening its own camera, so the two workflows never capture together.
 */
export function usePulseTracking(host: RefObject<HTMLDivElement | null>) {
  const pulse = usePulse()
  const [wireframe, setWireframe] = useState(false)
  const stage = useRef<ReturnType<typeof createFaceStage> | null>(null)
  const wireframeValue = useRef(wireframe)
  const streaming = pulse.phase === 'searching' || pulse.phase === 'warming' || pulse.phase === 'measuring'
  const running = pulse.phase !== 'off' && pulse.phase !== 'error'

  useEffect(() => {
    wireframeValue.current = wireframe
    stage.current?.setWireframe(wireframe)
  }, [wireframe])

  useEffect(() => {
    if (!streaming || !host.current) return
    const mount = host.current
    let raf = 0
    let off = () => {}
    let created: ReturnType<typeof createFaceStage> | null = null
    const loop = () => {
      if (!created) {
        // The video can need a frame or two before it has data to texture.
        const video = getPulseVideo()
        if (video) {
          try {
            created = createFaceStage(mount, video, FaceLandmarker.FACE_LANDMARKS_TESSELATION)
          } catch {
            return // No WebGL: the numbers and the waveform still work.
          }
          stage.current = created
          created.setWireframe(wireframeValue.current)
          const s = created
          off = subscribeFrames((points) => s.update(points ?? undefined))
        }
      } else if (!document.hidden) created.render()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      off()
      created?.dispose()
      stage.current = null
    }
  }, [streaming, host])

  const toggle = () => {
    if (running) stopPulse()
    else void startPulse()
  }
  return { pulse, running, streaming, wireframe, setWireframe, toggle }
}
