import { Vector4, type WebGLProgramParametersWithUniforms } from 'three'
import type { Build } from '../body/anatomy/bodyShape'
import type { ExerciseMotion } from './environmentExercise'

/** Sagittal joint angles in radians, in distal-to-proximal order. Coordinates in
 * the shaders use fractions of standing height, so both atlases use the same pose. */
interface SidePose {
  hip: number
  knee: number
  ankle: number
  shoulder: number
  elbow: number
}
export function exercisePose(
  mode: ExerciseMotion,
  elapsed: number,
  side: -1 | 1,
  reducedMotion: boolean,
): SidePose {
  const seconds = reducedMotion ? 0.27 : elapsed
  const period = { cycle: 1.65, row: 2.9, ankle: 1.8, step: 2.3, march: 1.65 }[mode]
  const phase = (seconds * 2 * Math.PI) / period
  const stride = Math.sin(phase) * side
  switch (mode) {
    case 'cycle':
      return {
        hip: -0.72 - 0.46 * stride,
        knee: 0.94 + 0.57 * Math.cos(phase) * side,
        ankle: -0.13 * stride,
        shoulder: -0.4,
        elbow: -0.65,
      }
    case 'row': {
      const stroke = 0.5 + 0.5 * Math.cos(phase)
      return {
        hip: -0.47 - 0.46 * stroke,
        knee: 0.32 + 1.26 * stroke,
        ankle: -0.06,
        shoulder: -0.99 * stroke,
        elbow: -0.13 - 1.12 * (1 - stroke),
      }
    }
    case 'ankle':
      return { hip: -1.1, knee: 1.16, ankle: 0.42 * stride, shoulder: -0.15, elbow: -0.58 }
    case 'step':
      return {
        hip: -0.16 - 0.48 * Math.max(0, stride),
        knee: 0.13 + 0.85 * Math.max(0, stride),
        ankle: -0.24 * Math.max(0, stride),
        shoulder: 0.21 * stride,
        elbow: -0.42,
      }
    case 'march':
      return {
        hip: -0.07 - 0.41 * stride,
        knee: 0.08 + 0.66 * Math.max(0, -stride),
        ankle: -0.12 * stride,
        shoulder: 0.42 * stride,
        elbow: -0.3 + 0.14 * stride,
      }
  }
}

const vertexCode = /* glsl */ `
#ifdef EXERCISE_ARM_WEIGHTS
attribute vec2 exerciseArms;
#endif
uniform bool uExerciseActive;
uniform float uExerciseHeight;
uniform float uExerciseWideArms;
uniform vec4 uExerciseLegs[2];
uniform vec4 uExerciseArms[2];
vec2 exerciseRotate(vec2 yz, float angle) {
  float c = cos(angle), s = sin(angle);
  return vec2(c * yz.x - s * yz.y, s * yz.x + c * yz.y);
}
vec2 exerciseBend(vec2 point, vec2 pivot, float angle) {
  return pivot + exerciseRotate(point - pivot, angle);
}
void exerciseAngles(vec3 rest, out vec3 leg, out vec2 arm) {
  float h = rest.y/uExerciseHeight;
  float sideMix = smoothstep(-0.018, 0.018, rest.x/uExerciseHeight);
  vec3 a = mix(uExerciseLegs[0].xyz, uExerciseLegs[1].xyz, sideMix);
  vec2 b = mix(uExerciseArms[0].xy, uExerciseArms[1].xy, sideMix);
  // Both hands hang beside the thighs in the source atlas. Separate the lateral
  // arm envelope before bending the knees, and blend into the shoulder girdle.
  // The wider female reference rests its hands farther outside the hips.
  #ifdef EXERCISE_ARM_WEIGHTS
  float armZone = exerciseArms.x;
  arm = b * exerciseArms;
  #else
  float armBorder = mix(0.114 - 0.019 * smoothstep(.52,.75,h),
                        0.165 - 0.066 * smoothstep(.48,.75,h), uExerciseWideArms);
  float lateral = smoothstep(armBorder - .008, armBorder + .008, abs(rest.x)/uExerciseHeight);
  float armZone = lateral * smoothstep(0.355, 0.402, h) * (1.0-smoothstep(0.786, 0.845, h));
  arm = b * armZone * vec2(1.0, 1.0-smoothstep(.60,.66,h));
  #endif
  float legZone = 1.0 - armZone;
  leg = a * legZone * (1.0 - smoothstep(vec3(.47, .26, .035),vec3(.55, .31, .066),vec3(h)));
}
vec2 exercisePosition(vec3 rest, vec2 yz) {
  vec3 leg; vec2 arm;
  exerciseAngles(rest, leg, arm);
  vec2 p = yz / uExerciseHeight;
  p = exerciseBend(p, vec2(.053, .010), leg.z);
  p = exerciseBend(p, vec2(.278, .012), leg.y);
  p = exerciseBend(p, vec2(.51, .000), leg.x);
  p = exerciseBend(p, vec2(.63, .006), arm.y);
  p = exerciseBend(p, vec2(.805, .000), arm.x);
  return p * uExerciseHeight;
}
`

export function createExercisePose() {
  const legs = [new Vector4(), new Vector4()]
  const arms = [new Vector4(), new Vector4()]
  const uniforms = {
    uExerciseActive: { value: false },
    uExerciseHeight: { value: 1.75 },
    uExerciseWideArms: { value: 0 },
    uExerciseLegs: { value: legs },
    uExerciseArms: { value: arms },
  }
  return {
    setBody(height: number, build: Build) {
      uniforms.uExerciseHeight.value = height
      uniforms.uExerciseWideArms.value = build === 'female' ? 1 : 0
    },
    update(mode: ExerciseMotion | null, elapsed: number, reduce: boolean) {
      uniforms.uExerciseActive.value = !!mode
      if (!mode) return
      for (const [i, side] of ([-1, 1] as const).entries()) {
        const p = exercisePose(mode, elapsed, side, reduce)
        legs[i].set(p.hip, p.knee, p.ankle, 0)
        arms[i].set(p.shoulder, p.elbow, 0, 0)
      }
    },
    patch(shader: WebGLProgramParametersWithUniforms, hasArmWeights = false) {
      Object.assign(shader.uniforms, uniforms)
      // Just before projection so groom shell offsets and breathing share the pose.
      shader.vertexShader =
        (hasArmWeights ? '#define EXERCISE_ARM_WEIGHTS\n' : '') +
        vertexCode +
        shader.vertexShader
          .replace(
            '#include <beginnormal_vertex>',
            `#include <beginnormal_vertex>
          if (uExerciseActive) {
            vec3 leg; vec2 arm;
            exerciseAngles(position, leg, arm);
            objectNormal.yz = exerciseRotate(objectNormal.yz, leg.x + leg.y + leg.z + arm.x + arm.y);
          }`,
          )
          .replace(
            '#include <project_vertex>',
            `if (uExerciseActive) transformed.yz = exercisePosition(position, transformed.yz);
          #include <project_vertex>`,
          )
    },
  }
}
