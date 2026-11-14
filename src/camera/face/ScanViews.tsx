import { angleLabels, scanAngles, type ScanAngle, type ScanPhotos } from './scanGuidance'

export function ScanViews({
  photos,
  active,
  disabled,
  onSelect,
}: {
  photos: ScanPhotos
  active?: ScanAngle
  disabled?: boolean
  onSelect: (angle: ScanAngle) => void
}) {
  return (
    <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Face scan views">
      {scanAngles.map((angle) => {
        const shot = photos[angle]
        return (
          <button
            key={angle}
            type="button"
            disabled={disabled}
            aria-pressed={angle === active}
            aria-label={
              shot
                ? `Retake ${angleLabels[angle].toLowerCase()} view`
                : `Select ${angleLabels[angle].toLowerCase()} view`
            }
            className={`overflow-hidden rounded-lg border text-xs ${angle === active ? 'border-accent text-ink' : 'border-line text-muted'}`}
            onClick={() => onSelect(angle)}
          >
            {shot && (
              <img
                src={shot.imageUrl}
                alt=""
                className="h-14 w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
            <span className="block px-1 py-1.5">
              {angleLabels[angle]}
              {shot && ' ✓'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
