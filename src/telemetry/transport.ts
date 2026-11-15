/** Application-level DTN demonstration. These records are not RFC 9171 BPv7 bundles. */
export type TransferState = 'archived' | 'queued' | 'in-flight' | 'received' | 'acknowledged'
export interface Transfer {
  id: string
  state: TransferState
  priority: 'urgent' | 'routine'
  queuedAt?: number
  sentAt?: number
  receivedAt?: number
  acknowledgedAt?: number
  delaySeconds?: number
}
export interface Link {
  available: boolean
  now: number
  delaySeconds: number
}

export function queueTransfer<T extends Transfer>(transfer: T, now: number): T {
  return transfer.state === 'archived' ? { ...transfer, state: 'queued', queuedAt: now } : transfer
}

/** Origin contact controls departure and ACK reception; an already sent packet keeps travelling. */
export function advanceTransfers<T extends Transfer>(items: T[], link: Link): T[] {
  if (!Number.isFinite(link.now) || !Number.isFinite(link.delaySeconds) || link.delaySeconds < 0)
    throw new Error('Invalid simulated link clock')
  const ready = items
    .filter((t) => t.state === 'queued')
    .sort(
      (a, b) =>
        Number(b.priority === 'urgent') - Number(a.priority === 'urgent') ||
        (a.queuedAt ?? 0) - (b.queuedAt ?? 0),
    )
  // One departure per tick makes the priority queue observable; throughput is not a physical link model.
  const next = link.available ? ready[0]?.id : undefined
  return items.map((item) => {
    let t = item
    if (t.id === next) t = { ...t, state: 'in-flight', sentAt: link.now, delaySeconds: link.delaySeconds }
    if (t.state === 'in-flight' && link.now >= t.sentAt! + t.delaySeconds!)
      t = { ...t, state: 'received', receivedAt: t.sentAt! + t.delaySeconds! }
    if (t.state === 'received' && link.available && link.now >= t.receivedAt! + t.delaySeconds!)
      t = { ...t, state: 'acknowledged', acknowledgedAt: link.now }
    return t
  })
}
