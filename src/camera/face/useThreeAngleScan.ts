import { useEffect, useRef, useState } from 'react'
import type { AvatarCapture, PortraitView } from './portrait'
import { stopPulse } from '../pulse/pulseSession'
import { readScanPhotos } from './scanPhotos'
import { assembleScan, scanAngles, type ScanAngle, type ScanPhotos } from './scanGuidance'
import type { useFaceTracking } from './useFaceTracking'

type Source = 'camera' | 'files'
type Session = { source: Source; angle: ScanAngle; photos: ScanPhotos }
export function useThreeAngleScan(
  camera: ReturnType<typeof useFaceTracking>,
  review: (capture: AvatarCapture) => void,
) {
  const [session, setSession] = useState<Session | null>(null)
  const [lastSource, setLastSource] = useState<Source>('files')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const epoch = useRef(0)
  useEffect(
    () => () => {
      epoch.current++
    },
    [],
  )

  const cancel = () => {
    epoch.current++
    setSession(null)
    setBusy(false)
    setError('')
    camera.stop()
    camera.aimAt()
  }
  const start = (source: Source, photos: ScanPhotos = {}, angle: ScanAngle = 'front') => {
    cancel()
    stopPulse()
    setLastSource(source)
    setSession({ source, angle, photos })
    camera.aimAt(angle)
    if (source === 'camera') camera.start()
  }
  const select = (angle: ScanAngle) => {
    setError('')
    setSession((current) => current && { ...current, angle })
    camera.aimAt(angle)
  }
  const complete = (photos: ScanPhotos, sample = false) => {
    const capture = assembleScan(photos)
    setSession(null)
    setError('')
    review({ ...capture, sample })
  }
  const keep = (shot: PortraitView) => {
    if (!session) return
    const photos = { ...session.photos, [session.angle]: shot }
    const missing = scanAngles.find((angle) => !photos[angle])
    setSession({ ...session, photos, angle: missing ?? session.angle })
    if (missing) {
      setError('')
      camera.aimAt(missing)
    } else complete(photos)
  }
  const capture = () => {
    try {
      keep(camera.capture())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Capture failed.')
    }
  }
  const read = async (sources: { angle: ScanAngle; url: string }[], onRead: (photos: ScanPhotos) => void) => {
    const request = ++epoch.current
    const isCurrent = () => request === epoch.current
    setBusy(true)
    setError('')
    try {
      const photos = await readScanPhotos(sources, isCurrent)
      if (isCurrent()) onRead(photos)
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'This photo could not be read.')
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }
  const importPhoto = async (file: File) => {
    if (!session) return
    const url = URL.createObjectURL(file)
    try {
      await read([{ angle: session.angle, url }], (photos) => {
        const shot = photos[session.angle]
        if (shot) keep(shot)
      })
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  const sample = () => {
    cancel()
    stopPulse()
    return read(
      scanAngles.map((angle) => ({ angle, url: `/face/multiview/${angle}.jpg` })),
      (photos) => complete(photos, true),
    )
  }
  return { session, lastSource, busy, error, cancel, start, capture, select, sample, importPhoto }
}
