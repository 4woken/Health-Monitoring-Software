import type { AvatarCapture } from './portrait'
import { Button } from '../../ui'
import { angleLabels } from './scanGuidance'
import { ScanViews } from './ScanViews'
import type { useFaceTracking } from './useFaceTracking'
import type { useThreeAngleScan } from './useThreeAngleScan'

export function ThreeAngleControls({
  scan,
  draft,
  camera,
}: {
  scan: ReturnType<typeof useThreeAngleScan>
  draft: AvatarCapture | null
  camera: ReturnType<typeof useFaceTracking>
}) {
  const { session, busy } = scan
  if (!session) {
    const photos = draft?.sideViews && { front: draft, ...draft.sideViews }
    return (
      <>
        {photos && (
          <>
            <p className="text-xs text-muted">
              {draft.sample ? 'Three views of the reference head.' : 'Select a view to retake it.'}
            </p>
            <ScanViews
              photos={photos}
              disabled={busy || draft.sample}
              onSelect={(angle) => scan.start(scan.lastSource, photos, angle)}
            />
          </>
        )}
        <Button kind="primary" onClick={() => scan.start('camera')} disabled={busy}>
          Start three-angle webcam scan
        </Button>
        <Button onClick={() => scan.start('files')} disabled={busy}>
          Use three photos
        </Button>
        <Button onClick={scan.sample} disabled={busy}>
          {busy ? 'Checking sample angles…' : 'Try a three-angle sample'}
        </Button>
      </>
    )
  }
  const { angle, source, photos } = session
  const direction = angle === 'left' ? 'right' : 'left'
  const guidance =
    source === 'files'
      ? angle === 'front'
        ? 'Choose a front-facing photo.'
        : `Choose a photo where your nose points to the ${direction} edge of the image.`
      : angle === 'front'
        ? 'Look straight into the camera.'
        : `Turn to your ${angle}, keeping both eyes visible.`
  return (
    <>
      <ScanViews photos={photos} active={angle} onSelect={scan.select} disabled={busy} />
      <p className="text-sm" role="status">
        {guidance}
      </p>
      {source === 'files' ? (
        <label className="text-sm">
          <span className="block font-medium">
            {busy ? 'Checking photo…' : `Choose ${angleLabels[angle].toLowerCase()} photo`}
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            className="mt-2 w-full text-xs text-muted"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0]
              event.currentTarget.value = ''
              if (file) void scan.importPhoto(file)
            }}
          />
        </label>
      ) : camera.enabled ? (
        <Button kind="primary" disabled={!camera.quality.ready} onClick={scan.capture}>
          Capture {angleLabels[angle].toLowerCase()} view
        </Button>
      ) : (
        <Button
          onClick={() => {
            camera.aimAt(angle)
            camera.start()
          }}
        >
          Restart webcam
        </Button>
      )}
      <Button onClick={scan.cancel}>Cancel scan</Button>
    </>
  )
}
