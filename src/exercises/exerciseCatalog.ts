import type { ExerciseKind } from './exercisePlan'

export const EXERCISES = {
  breathing: {
    title: 'Take a breathing break',
    description: 'Settle into a comfortable position and breathe gently at your own pace for one minute.',
    unit: 'seconds',
    input: 'Guided timer',
    source: 'NHS · Breathing exercises for stress',
    url: 'https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/',
    adaptation:
      'The NHS guide suggests at least five minutes of comfortable breathing. Pulsar offers a one-minute introduction you can pause or leave at any time.',
  },
  assembly: {
    title: 'Repair the solar panel',
    description: 'Pinch a solar cell, move it to its socket, then open your fingers to release it.',
    unit: 'cells',
    input: 'Hand camera',
    source: 'NASA · Crew Assembly Training, p. 2',
    url: 'https://www.nasa.gov/wp-content/uploads/2018/05/crewassembly_-_adapted.pdf#page=2',
    adaptation:
      'NASA’s educational activity uses a physical puzzle and gloves. Pulsar adapts it to an on-screen assembly task. The camera observes the pinch and release.',
  },
  knee: {
    title: 'Seated knee extension',
    description:
      'Sit on a stable chair, turn side-on to the camera and straighten one knee comfortably, then bend it again.',
    unit: 'repetitions',
    input: 'Movement camera',
    source: 'NASA · Isokinetic Testing (MR079L)',
    url: 'https://nlsp.nasa.gov/search/data/details/IDP-LSDA_DOCUMENT-0000000000003550?dataType=DOCUMENTS',
    adaptation:
      'Page 2 of the preflight protocol describes measuring strength with a dynamometer. Pulsar counts an unloaded bend-and-straighten cycle on Earth. Force measurement requires equipment.',
  },
  reaction: {
    title: 'React to the light',
    description: 'Wait for the light, then tap or press Space. See your median response time and early taps.',
    unit: 'signals',
    input: 'Keyboard or touch',
    source: 'NASA · Reaction Self Test',
    url: 'https://humanresearchroadmap.nasa.gov/Tasks/task.aspx?i=714',
    adaptation:
      'Inspired by the ISS Reaction Self Test. This short game reports your responses on this device. Its score has no clinical or flight-readiness threshold.',
  },
} satisfies Record<
  ExerciseKind,
  {
    title: string
    description: string
    unit: string
    input: string
    source: string
    url: string
    adaptation: string
  }
>
