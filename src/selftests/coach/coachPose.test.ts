import { describe, expect, it } from 'vitest'
import { poseAt } from './coachPose'

describe('coach demonstrations', () => {
  it('holds a seated right angle, extends both legs fully and returns to the same seat', () => {
    const seated = poseAt('sitToStand', 0)
    expect(seated.hip).toEqual(seated.knee)
    expect(seated.hip[0]).toBeCloseTo(Math.PI / 2, 1)
    expect(poseAt('sitToStand', 2.3)).toMatchObject({ hip: [0, 0], knee: [0, 0], arms: 'crossed' })
    expect(poseAt('sitToStand', 3.6)).toEqual(seated)
  })
  it('lifts the requested opposite foot during single-leg balance', () => {
    expect(poseAt('leftLeg', 0).knee).toEqual([0, 1.35])
    expect(poseAt('rightLeg', 0).knee).toEqual([1.35, 0])
  })
  it('keeps both soles level through the squat and heel-to-toe stance', () => {
    for (const [mode, time] of [
      ['squat', 1.5],
      ['tandem', 0],
    ] as const) {
      const pose = poseAt(mode, time)
      for (const i of [0, 1]) expect(-pose.hip[i] + pose.knee[i] + pose.ankle[i]).toBeCloseTo(0)
    }
  })
  it('uses the pulse recovery cadence of 30 squats in 45 seconds', () => {
    expect(poseAt('pacedSquat', 0.75)).toEqual(poseAt('squat', 1.5))
    expect(poseAt('pacedSquat', 1.5)).toEqual(poseAt('pacedSquat', 0))
  })
})
