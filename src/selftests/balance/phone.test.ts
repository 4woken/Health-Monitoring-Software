import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CONDITIONS } from './balance'
import { allowMotion, measurePhoneHold, probeMotion } from './phone'

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('window', new EventTarget())
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it('offers the iOS motion option before asking for permission on Begin', async () => {
  const sensor = {
    requestPermission: vi.fn(async function (this: unknown) {
      return this === sensor ? 'granted' : 'denied'
    }),
  }
  Object.assign(window, { DeviceMotionEvent: sensor })
  expect(await probeMotion()).toBe(true)
  expect(sensor.requestPermission).not.toHaveBeenCalled()
  expect(await allowMotion()).toBe(true)
  expect(sensor.requestPermission).toHaveBeenCalledTimes(1)
})

it('ends a hold without a score and releases its listener when the sensor freezes or the test closes', async () => {
  const remove = vi.spyOn(window, 'removeEventListener')
  const showLeft = vi.fn()
  const session = new AbortController()
  const attempt = measurePhoneHold(CONDITIONS[0], session.signal, showLeft)
  const motion = Object.assign(new Event('devicemotion'), {
    accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 },
  })
  window.dispatchEvent(motion)
  expect(showLeft).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(2000)
  expect(await attempt).toBeNull()
  expect(remove).toHaveBeenCalledTimes(1)
  const retry = measurePhoneHold(CONDITIONS[0], session.signal, showLeft)
  session.abort()
  expect(await retry).toBeNull()
  expect(remove).toHaveBeenCalledTimes(2)
  window.dispatchEvent(motion)
  expect(showLeft).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})
