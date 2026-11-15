import { Vector2, Vector4, type WebGLProgramParametersWithUniforms } from 'three'
import type { Build } from '../body/anatomy/bodyShape'
import type { ExerciseMotion } from './environmentExercise'
import { createRowingRig } from './rowing'

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
  mode: Exclude<ExerciseMotion, 'row'>,
  elapsed: number,
  side: -1 | 1,
  reducedMotion: boolean,
): SidePose {
  const seconds = reducedMotion ? 0.27 : elapsed
  const period = { cycle: 1.65, ankle: 1.8, step: 2.3, march: 1.65 }[mode]
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
uniform bool uRowActive;
uniform mat4 uRowTorso;
uniform mat4 uRowBones[12];
uniform vec3 uRowLegLevels;
uniform float uRowWristY;
uniform vec3 uRowHandOrigins[2];
#ifdef ROW_HAIR
  uniform vec2 uRowHairMotion;
  // Model-space nape pivot. The smooth tip mask leaves the hairline fixed and
  // rotates free lengths toward the back, away from the face and shoulders.
  float looseHair(vec3 rest) {
    return 1.-smoothstep(.57,.86,rest.y/uExerciseHeight);
  }
  float hairSwing(vec3 rest) {
    float wave = sin(uRowHairMotion.y*1.27 + rest.x*14. + 9.*rest.y/uExerciseHeight);
    return looseHair(rest)*uRowHairMotion.x*(.60+.075*wave);
  }
#endif

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
// In rowing, a foot stays rigid on its stretcher whilst the knee flexes.
// Use the authored shoulder and elbow influences for skin and garments.
mat4 rowingSkin(vec3 rest, int side, out float handWeight) {
  int base = side * 6;
  handWeight = 0.;
  #ifdef ROW_HAIR
    return uRowTorso;
  #elif defined(ROW_TRAINERS)
    return uRowBones[base + 5];
  #else
    float h = uExerciseHeight;
    #ifdef EXERCISE_ARM_WEIGHTS
      vec2 arms = exerciseArms;
    #else
      float lateral = smoothstep(.085, .12, abs(rest.x)/h);
      float upper = lateral * smoothstep(.34,.41,rest.y/h) * (1.-smoothstep(.77,.86,rest.y/h));
      vec2 arms = vec2(upper, upper*(1.-smoothstep(.59,.68,rest.y/h)));
    #endif
    handWeight = arms.y * (1.-smoothstep(uRowWristY-.018*h, uRowWristY+.016*h, rest.y));
    float hipY = uRowLegLevels.x - .024*h*(1.-smoothstep(.018,.065,abs(rest.x)/h));
    float thigh = (1.-arms.x) * (1.-smoothstep(hipY-.032*h, hipY+.038*h, rest.y));
    float shin = thigh * (1.-smoothstep(uRowLegLevels.y-.030*h,uRowLegLevels.y+.030*h,rest.y));
    float foot = shin * (1.-smoothstep(uRowLegLevels.z-.013*h,uRowLegLevels.z+.022*h,rest.y));
    return (1.-arms.x-thigh)*uRowTorso
        + (arms.x-arms.y)*uRowBones[base] + (arms.y-handWeight)*uRowBones[base+1]
        + handWeight*uRowBones[base+2] + (thigh-shin)*uRowBones[base+3]
        + (shin-foot)*uRowBones[base+4] + foot*uRowBones[base+5];
  #endif
}
// Curl the lengths beyond the knuckles around the handle's X axis. At the
// knuckle the tangent is continuous with the palm; the finger pads face in.
float rowingFingerArc(vec3 rest, int side, float handWeight) {
  vec3 localHand = (uRowBones[side*6+2]*vec4(rest,1.)).xyz - uRowHandOrigins[side];
  return min(3.85,max(0.,localHand.z)/(.0125*uExerciseHeight))*handWeight;
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
  let rowing = createRowingRig(1.75, 'male')
  const uniforms = {
    uRowActive: { value: false },
    uRowHairMotion: { value: new Vector2() },
    uRowTorso: { value: rowing.torso },
    uRowBones: { value: rowing.bones },
    uRowHandOrigins: { value: rowing.handOrigins },
    uRowLegLevels: { value: rowing.legLevels },
    uRowWristY: { value: rowing.wristY },
    uExerciseActive: { value: false },
    uExerciseHeight: { value: 1.75 },
    uExerciseWideArms: { value: 0 },
    uExerciseLegs: { value: legs },
    uExerciseArms: { value: arms },
  }
  return {
    setBody(height: number, build: Build, torsoFit?: (y: number) => number) {
      rowing = createRowingRig(height, build, torsoFit)
      uniforms.uRowTorso.value = rowing.torso
      uniforms.uRowBones.value = rowing.bones
      uniforms.uRowHandOrigins.value = rowing.handOrigins
      uniforms.uRowLegLevels.value = rowing.legLevels
      uniforms.uRowWristY.value = rowing.wristY
      uniforms.uExerciseHeight.value = height
      uniforms.uExerciseWideArms.value = build === 'female' ? 1 : 0
    },
    update(mode: ExerciseMotion | null, elapsed: number, reduce: boolean, gravityG = 1) {
      uniforms.uExerciseActive.value = !!mode
      uniforms.uRowActive.value = mode === 'row'
      const gravity = Number.isFinite(gravityG) ? Math.max(0, Math.min(1, gravityG)) : 1
      uniforms.uRowHairMotion.value.set(1 - Math.sqrt(gravity), reduce ? 0 : elapsed)
      if (mode === 'row') return rowing.sample(elapsed, reduce)
      if (!mode) return null
      for (const [i, side] of ([-1, 1] as const).entries()) {
        const p = exercisePose(mode, elapsed, side, reduce)
        legs[i].set(p.hip, p.knee, p.ankle, 0)
        arms[i].set(p.shoulder, p.elbow, 0, 0)
      }
      return null
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
            #ifdef ROW_HAIR
              objectNormal.yz = exerciseRotate(objectNormal.yz,hairSwing(position));
            #endif
          if (uRowActive) {
            int side = position.x < 0. ? 0 : 1;
            float handWeight;
            mat4 pose = rowingSkin(position,side,handWeight);
            objectNormal = mat3(pose)*objectNormal;
            objectNormal.yz = exerciseRotate(objectNormal.yz,rowingFingerArc(position,side,handWeight));
          } else if (uExerciseActive) {
            vec3 leg; vec2 arm;
            exerciseAngles(position, leg, arm);
            objectNormal.yz = exerciseRotate(objectNormal.yz, leg.x + leg.y + leg.z + arm.x + arm.y);
          }`,
          )
          .replace(
            '#include <project_vertex>',
            `            #ifdef ROW_HAIR
              vec2 nape = vec2(.865, -.039)*uExerciseHeight;
              transformed.yz = nape + exerciseRotate(transformed.yz-nape,hairSwing(position));
              float freeLength = looseHair(position)*uRowHairMotion.x;
              transformed.x += uExerciseHeight*freeLength*(.021*clamp(position.x/(.042*uExerciseHeight),-1.,1.)
                + .007*sin(uRowHairMotion.y*.87+position.y*8.));
            #endif
          if (uRowActive) {
            int side = position.x < 0. ? 0 : 1;
            float handWeight;
            mat4 pose = rowingSkin(position,side,handWeight);
            transformed = (pose * vec4(transformed,1.)).xyz;
            float arc = rowingFingerArc(position,side,handWeight);
            if (arc > 0.) {
              float radius = .0125*uExerciseHeight;
              vec3 origin = uRowHandOrigins[side];
              float radial = radius + transformed.y - origin.y;
              transformed.yz = origin.yz + vec2(radial*cos(arc)-radius,radial*sin(arc));
            }
          } else if (uExerciseActive) transformed.yz = exercisePosition(position, transformed.yz);
          #include <project_vertex>`,
          )
    },
  }
}
