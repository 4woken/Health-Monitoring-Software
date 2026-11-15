import { describe, it, expect } from 'vitest'
import { encodeCbor } from './cbor'
import { advanceTransfers, queueTransfer, type Transfer } from './transport'

const hex = (value: Parameters<typeof encodeCbor>[0]) => Buffer.from(encodeCbor(value)).toString('hex')
describe('CBOR interoperability (RFC 8949 Appendix A)', () => {
  it('encodes standard integer, array, map, Unicode and byte-string vectors', () => {
    expect(hex(1000)).toBe('1903e8')
    expect(hex(-1000)).toBe('3903e7')
    expect(hex([1, 2, 3])).toBe('83010203')
    expect(hex({ a: 1, b: [2, 3] })).toBe('a26161016162820203')
    expect(hex('ü')).toBe('62c3bc')
    expect(hex(new Uint8Array([1, 2, 3, 4]))).toBe('4401020304')
    expect(hex(1.1)).toBe('fb3ff199999999999a')
    expect(hex(1_000_000_000_000)).toBe('1b000000e8d4a51000')
  })
  it('rejects invalid telemetry rather than encoding missing values as zero', () => {
    expect(() => encodeCbor(NaN)).toThrow()
    expect(() => encodeCbor(Infinity)).toThrow()
  })
})
describe('delayed store-and-forward delivery', () => {
  const packet: Transfer = { id: 'p1', state: 'archived', priority: 'routine' }
  it('keeps data queued across a blackout, then waits for outward and return light time', () => {
    const q = queueTransfer(packet, 0)
    expect(advanceTransfers([q], { available: false, now: 900, delaySeconds: 1200 })[0].state).toBe('queued')
    const sent = advanceTransfers([q], { available: true, now: 1000, delaySeconds: 1200 })
    expect(advanceTransfers(sent, { available: true, now: 2199, delaySeconds: 1200 })[0].state).toBe(
      'in-flight',
    )
    const received = advanceTransfers(sent, { available: false, now: 2200, delaySeconds: 1200 })
    expect(received[0].state).toBe('received')
    expect(advanceTransfers(received, { available: false, now: 3400, delaySeconds: 1200 })[0].state).toBe(
      'received',
    )
    expect(advanceTransfers(received, { available: true, now: 3400, delaySeconds: 1200 })[0].state).toBe(
      'acknowledged',
    )
  })
  it('sends urgent data first and cannot enqueue a received packet twice', () => {
    const q = queueTransfer(packet, 0)
    const urgent = { ...q, id: 'urgent', priority: 'urgent' as const, queuedAt: 1 }
    const next = advanceTransfers([q, urgent], { available: true, now: 1, delaySeconds: 1200 })
    expect(next.map((p) => p.state)).toEqual(['queued', 'in-flight'])
    expect(queueTransfer({ ...packet, state: 'acknowledged' }, 100).state).toBe('acknowledged')
  })
})
