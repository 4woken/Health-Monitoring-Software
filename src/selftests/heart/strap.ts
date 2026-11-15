// A Bluetooth heart-rate chest strap, read with Web Bluetooth (Chrome and Edge on computers and
// Android). It uses the standard Heart Rate service that every strap offers, so no brand is needed.
// NASA follows heart rate with a monitor in every exercise session (MR019L); the camera pulse cannot
// follow someone who moves, a strap can. The connection lasts until the page closes or the person
// disconnects; nothing is stored.

import { useSyncExternalStore } from 'react'

/** Reads a Heart Rate Measurement value (Bluetooth GATT characteristic 0x2A37). */
export function parseHeartRate(view: DataView): { bpm: number; rrMs: number[] } {
  const flags = view.getUint8(0)
  const wide = (flags & 0x01) !== 0
  let offset = 1
  const bpm = wide ? view.getUint16(offset, true) : view.getUint8(offset)
  offset += wide ? 2 : 1
  if (flags & 0x08) offset += 2 // energy expended
  const rrMs: number[] = []
  if (flags & 0x10)
    for (; offset + 1 < view.byteLength; offset += 2)
      rrMs.push(Math.round((view.getUint16(offset, true) / 1024) * 1000))
  return { bpm, rrMs }
}

// The few Web Bluetooth types used here; TypeScript's DOM library does not declare them.
interface Characteristic extends EventTarget {
  value?: DataView
  startNotifications(): Promise<Characteristic>
  stopNotifications(): Promise<Characteristic>
}
interface Server {
  connected: boolean
  disconnect(): void
  getPrimaryService(name: string): Promise<{ getCharacteristic(name: string): Promise<Characteristic> }>
}
interface Device extends EventTarget {
  name?: string
  gatt?: { connect(): Promise<Server> }
}
interface Bluetooth {
  requestDevice(options: { filters: { services: string[] }[] }): Promise<Device>
}

export type StrapStatus = 'unsupported' | 'idle' | 'connecting' | 'connected' | 'error'

export interface StrapState {
  status: StrapStatus
  bpm: number | null
  /** performance.now() of the last reading. */
  at: number | null
  name: string
  message: string
}

const bluetooth = () =>
  typeof navigator !== 'undefined'
    ? (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth
    : undefined

let state: StrapState = {
  status: bluetooth() ? 'idle' : 'unsupported',
  bpm: null,
  at: null,
  name: '',
  message: bluetooth()
    ? ''
    : 'This browser cannot use Bluetooth. Chrome or Edge on a computer or on Android can.',
}
const listeners = new Set<() => void>()
let server: Server | null = null
let characteristic: Characteristic | null = null

function set(next: Partial<StrapState>) {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

function onValue(event: Event) {
  const value = (event.target as Characteristic).value
  if (!value) return
  const { bpm } = parseHeartRate(value)
  if (bpm > 0) set({ bpm, at: performance.now() })
}

function onDisconnected() {
  characteristic?.removeEventListener('characteristicvaluechanged', onValue)
  characteristic = null
  server = null
  set({ status: 'idle', bpm: null, at: null, message: 'The strap disconnected.' })
}

/** Asks the browser to pick a strap, then listens to it. Needs a click. */
export async function connectStrap(): Promise<void> {
  const bt = bluetooth()
  if (!bt) return
  set({ status: 'connecting', message: 'Choose your heart-rate strap in the browser window.' })
  try {
    const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] })
    device.addEventListener('gattserverdisconnected', onDisconnected)
    if (!device.gatt) throw new Error('This device cannot be read.')
    server = await device.gatt.connect()
    const service = await server.getPrimaryService('heart_rate')
    characteristic = await service.getCharacteristic('heart_rate_measurement')
    characteristic.addEventListener('characteristicvaluechanged', onValue)
    await characteristic.startNotifications()
    set({
      status: 'connected',
      name: device.name ?? 'Heart-rate strap',
      message: 'Wear the strap snugly, moistened.',
    })
  } catch (cause) {
    server?.disconnect()
    server = null
    const cancelled = cause instanceof DOMException && cause.name === 'NotFoundError'
    set({
      status: cancelled ? 'idle' : 'error',
      message: cancelled
        ? 'No strap chosen.'
        : cause instanceof Error
          ? cause.message
          : 'The strap could not connect.',
    })
  }
}

export function disconnectStrap() {
  if (server?.connected) server.disconnect()
  else onDisconnected()
}

/** A reading no older than 5 seconds, or null. */
export const freshStrapBpm = (s: StrapState, now = performance.now()) =>
  s.status === 'connected' && s.bpm !== null && s.at !== null && now - s.at < 5000 ? s.bpm : null

export function useStrap(): StrapState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
}
