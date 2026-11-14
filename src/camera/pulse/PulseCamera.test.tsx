import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vitest'
import PulseCamera from './PulseCamera'
import { getPulse, type PulseState } from './pulseSession'
import { usePulseTracking } from './usePulseTracking'

vi.mock('./usePulseTracking', () => ({ usePulseTracking: vi.fn() }))

function render(reference: number | undefined, reading: Partial<PulseState> = {}) {
  vi.mocked(usePulseTracking).mockReturnValue({
    pulse: { ...getPulse(), ...reading },
    running: false,
    streaming: false,
    wireframe: false,
    setWireframe: vi.fn(),
    toggle: vi.fn(),
  })
  return renderToStaticMarkup(<PulseCamera preflightRestingPulseBpm={reference} />)
}

afterEach(() => vi.resetAllMocks())

it('shows a difference only with the selected member’s reference and an accepted, live pulse', () => {
  const good = { phase: 'measuring' as const, bpm: 75.5, quality: 0.8 }
  expect(render(undefined, good)).not.toContain('Preflight resting pulse')
  expect(render(63.5, good)).toContain('Camera is 12 bpm above your reference.')
  expect(render(80, good)).toContain('Camera is 4 bpm below your reference.')
  expect(render(76, good)).toContain('Camera matches your reference to the nearest bpm.')
  for (const low of [
    {},
    { ...good, quality: 0.1 },
    { ...good, phase: 'warming' as const },
    { ...good, bpm: null },
  ]) {
    expect(render(65, low)).toContain('A clear camera reading is needed to compare.')
  }
})
