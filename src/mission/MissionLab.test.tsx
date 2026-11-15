import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import MissionLab from './MissionLab'
import { MISSION_PROFILES, simulateProfile } from './physiology'

function renderProfile(profile: 'iss' | 'mars', cursor: number) {
  const phases = MISSION_PROFILES[profile].phases
  // The active crew mission is on Earth. Its settings must not leak into another profile.
  const input = { gravity: 1, exercise: 1, doseRateMSvDay: 0 }
  return renderToStaticMarkup(
    <MissionLab
      settingName="Earth"
      profile={profile}
      onProfile={() => {}}
      input={input}
      onInput={() => {}}
      linked={false}
      onReset={() => {}}
      phases={phases}
      points={simulateProfile(phases, input.exercise)}
      cursor={cursor}
      onCursor={() => {}}
    />,
  )
}

it.each([
  [180, 'Cruise out', '0 g, weightless', '1.80 mSv/day'],
  [181, 'Mars surface', '0.38 g', '0.67 mSv/day'],
  [680, 'Mars surface', '0.38 g', '0.67 mSv/day'],
  [681, 'Cruise home', '0 g, weightless', '1.80 mSv/day'],
] as const)('displays the active phase and rates on Mars profile day %i', (day, phase, gravity, dose) => {
  const html = renderProfile('mars', day)
  for (const label of [phase, gravity, dose, 'day 592']) expect(html).toContain('>' + label + '<')
})

it('limits milestones to the selected ISS trajectory', () => {
  const html = renderProfile('iss', 180)
  expect(html.match(/>not reached in this profile</g)).toHaveLength(2)
  expect(html).toContain('>day 137<')
  expect(html).toContain('>0.73 mSv/day<')
})
