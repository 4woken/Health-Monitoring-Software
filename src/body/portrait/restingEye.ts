import { Mesh, MeshPhysicalMaterial, SphereGeometry } from 'three'
import type { Build, Vec3 } from '../anatomy/bodyShape'

/** The corneal reflection follows the scene lights. The iris stays fixed in the globe's local frame. */
export function createRestingEye(eye: { center: Vec3; radius: number }, build: Build) {
  const sphere = new SphereGeometry(eye.radius, 48, 32).translate(...eye.center)
  const material = new MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.31,
    clearcoat: 0.85,
    clearcoatRoughness: 0.08,
    ior: 1.38,
  })
  // The neutral male lids sit slightly lower on the globe than the female lids.
  const gazeY = build === 'male' ? -0.09 : -0.035
  material.customProgramCacheKey = () => 'pulsar-resting-eye-v1'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.restingGazeY = { value: gazeY }
    shader.vertexShader =
      'varying vec3 eyeDirection;\n' +
      shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        '#include <beginnormal_vertex>\n eyeDirection = normal;',
      )
    shader.fragmentShader =
      'varying vec3 eyeDirection; uniform float restingGazeY;\n' +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec3 nEye = normalize(eyeDirection);
        vec2 irisXY = nEye.xy - vec2(0.0, restingGazeY);
        float r = length(irisXY);
        float angle = atan(irisXY.y, irisXY.x);
        float edge = max(fwidth(r), 0.002);
        float iris = (1.0 - smoothstep(0.37 - edge, 0.37 + edge, r)) * step(0.0, nEye.z);
        float pupil = 1.0 - smoothstep(0.137 - edge, 0.137 + edge, r);
        // Antialias radial fibres when the face is small on screen.
        float detail = 1.0 - smoothstep(0.007, 0.025, edge);
        float grain = 0.5 + detail * (0.16 * sin(45.0 * angle + 17.0 * r)
          + 0.12 * sin(91.0 * angle - 38.0 * r) + 0.08 * sin(157.0 * angle + 20.0 * r));
        vec3 hazel = mix(vec3(0.059, 0.033, 0.016), vec3(0.19, 0.12, 0.052), grain);
        hazel *= mix(1.0, 0.39, smoothstep(0.30, 0.37, r));
        vec3 sclera = mix(vec3(0.76, 0.73, 0.68), vec3(0.62, 0.47, 0.43), smoothstep(0.45, 0.98, abs(nEye.x)));
        diffuseColor.rgb *= mix(sclera, mix(hazel, vec3(0.0035, 0.0028, 0.0025), pupil), iris);`,
      )
  }
  return new Mesh(sphere, material)
}
