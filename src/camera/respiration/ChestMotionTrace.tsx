export function ChestMotionTrace({ wave }: { wave: number[] }) {
  if (wave.length < 2) return null
  const amplitude = Math.max(0.28, ...wave.map(Math.abs))
  const trace = wave
    .map(
      (value, i) =>
        ((i * 360) / Math.max(1, wave.length - 1)).toFixed(1) +
        ',' +
        (36 - (value * 30) / amplitude).toFixed(1),
    )
    .join(' ')
  return (
    <figure className="mt-4">
      <svg viewBox="0 0 360 72" aria-hidden="true" className="h-16 w-full">
        <polyline fill="none" stroke="currentColor" strokeWidth="2" className="text-holo" points={trace} />
      </svg>
      <figcaption className="text-xs text-dim">Chest movement · last 12 s</figcaption>
    </figure>
  )
}
