import { afterEach, expect, it, vi } from 'vitest'
import { startBreathingSession, type BreathPreview } from './breathingSession'

const { detectForVideo, chestFlow } = vi.hoisted(() => ({ detectForVideo: vi.fn(), chestFlow: vi.fn() }))
vi.mock('../face/faceModel', () => ({
  createTracker: async () => ({ detectForVideo, close: vi.fn() }),
}))
vi.mock('./opticalFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./opticalFlow')>()),
  chestFlow,
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps measured time through a brief tracking loss or camera stall and drops it for multiple subjects', async () => {
  const face = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.25 }))
  face[10].y = 0.1
  face[152].y = 0.37
  face[234].x = 0.4
  face[454].x = 0.6
  detectForVideo.mockReturnValue({ faceLandmarks: [face] })
  chestFlow.mockReturnValue({ status: 'tracking', left: 0, right: 0, reference: 0 })
  const pixels = { data: new Uint8ClampedArray(256 * 192 * 4) }
  const ctx = { drawImage: vi.fn(), getImageData: () => pixels }
  vi.stubGlobal(
    'document',
    Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => ctx }) }),
  )
  const track = Object.assign(new EventTarget(), { stop: vi.fn() })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => stream } })
  let tick: FrameRequestCallback
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    tick = cb
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  const camera = Object.assign(new EventTarget(), {
    videoWidth: 640,
    videoHeight: 480,
    readyState: 4,
    currentTime: 0,
    play: async () => {},
    pause: vi.fn(),
  })
  let now = 0
  function advance(frames: number, frozen = false) {
    for (let i = 0; i < frames; i++) {
      now += 100
      if (!frozen) camera.currentTime += 0.1
      tick(now)
    }
  }
  const updates: BreathPreview[] = []
  let ready!: () => void
  const started = new Promise<void>((resolve) => {
    ready = resolve
  })
  const stop = startBreathingSession(camera as unknown as HTMLVideoElement, (preview) => {
    updates.push(preview)
    if (preview.state === 'frame') ready()
  })
  try {
    await started // The UI clock can start even before there are any camera frames.
    advance(60)
    const acquired = updates.at(-1)!.seconds
    expect(acquired).toBeGreaterThan(5)
    detectForVideo.mockReturnValue({ faceLandmarks: [] })
    advance(9)
    expect(updates.at(-1)).toMatchObject({ state: 'frame', rate: null })
    expect(updates.at(-1)!.seconds).toBeGreaterThanOrEqual(acquired)
    detectForVideo.mockReturnValue({ faceLandmarks: [face] })
    advance(20)
    advance(12, true)
    expect(updates.at(-1)!.seconds).toBeGreaterThan(acquired)
    advance(15)
    expect(updates.at(-1)).toMatchObject({ state: 'collect' })
    expect(updates.at(-1)!.seconds).toBeGreaterThan(acquired)
    detectForVideo.mockReturnValue({ faceLandmarks: [face, face] })
    advance(12)
    expect(updates.at(-1)).toMatchObject({ state: 'frame', rate: null, seconds: 0 })
  } finally {
    stop()
  }
  expect(track.stop).toHaveBeenCalledOnce()
})
