import {
  BufferAttribute,
  Color,
  type BufferGeometry,
  type MeshPhysicalMaterial,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import type { Build } from '../anatomy/bodyShape'

/** Four unorm8 region weights per vertex, followed by optional local navel
 * position/normal corrections. Decode before sizing so both follow the body. */
export function attachSkinDetail(geometry: BufferGeometry, bytes: ArrayBuffer) {
  const pos = geometry.getAttribute('position')
  const normal = geometry.getAttribute('normal')
  if (geometry.getAttribute('skinDetail')) return
  if (bytes.byteLength < 12) throw new Error('Truncated skin detail')
  const view = new DataView(bytes)
  const count = view.getUint32(4, true)
  const updates = view.getUint32(8, true)
  const first = 12 + 4 * count
  if (
    view.getUint32(0, true) !== 0x31444b53 ||
    count !== pos.count ||
    bytes.byteLength !== first + 20 * updates
  ) {
    throw new Error('Skin detail does not match this mesh')
  }
  for (let k = first; k < bytes.byteLength; k += 20) {
    if (view.getUint32(k, true) >= count) throw new Error('Invalid navel vertex')
  }
  for (let k = first; k < bytes.byteLength; k += 20) {
    const index = view.getUint32(k, true)
    pos.setZ(index, pos.getZ(index) + view.getFloat32(k + 4, true))
    normal.setXYZ(
      index,
      view.getFloat32(k + 8, true),
      view.getFloat32(k + 12, true),
      view.getFloat32(k + 16, true),
    )
  }
  if (updates) {
    pos.needsUpdate = normal.needsUpdate = true
    geometry.computeBoundingSphere()
    geometry.computeBoundingBox()
  }
  geometry.setAttribute('skinDetail', new BufferAttribute(new Uint8Array(bytes, 12, count * 4), 4, true))
}

export async function loadSkinDetail(
  build: Build,
  geometry: BufferGeometry,
  url = '/anatomy/' + build + '-detail.bin',
) {
  if (geometry.hasAttribute('skinDetail')) return
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error('Skin detail unavailable')
    attachSkinDetail(geometry, await response.arrayBuffer())
  } catch {
    // A missing cosmetic asset must still leave a renderable anatomy.
    geometry.setAttribute(
      'skinDetail',
      new BufferAttribute(new Uint8Array(geometry.getAttribute('position').count * 4), 4, true),
    )
  }
}

export function setSkinFinish(material: MeshPhysicalMaterial) {
  material.sheen = 0.12
  material.sheenColor.copy(new Color('#e1a792'))
  material.sheenRoughness = 0.85
}

/** Skin coordinates remain in metres, independent of UV islands and torso size.
 * fwidth removes pores that are smaller than a pixel at full-body distance. */
export function applySkinShading(shader: WebGLProgramParametersWithUniforms) {
  const portraitAttenuation = shader.fragmentShader.includes('varying float vPortraitEye;')
    ? '(1.0 - max(vPortraitEye, vPortraitWeight * uPortraitEnabled))'
    : '1.0'
  shader.vertexShader =
    'attribute vec4 skinDetail; varying vec4 vSkinRegion; varying vec3 vSkinRest;\n' +
    shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n vSkinRegion = skinDetail; vSkinRest = position;',
    )
  shader.fragmentShader =
    `varying vec4 vSkinRegion;
    varying vec3 vSkinRest;
    float skinHash(vec3 cell) {
      cell = fract(cell * vec3(.1031,.1030,.0973));
      cell += dot(cell, cell.yxz + 33.33);
      return fract((cell.x + cell.y) * cell.z);
    }
    float skinNoise(vec3 p) {
      vec3 i=floor(p), u=fract(p); u=u*u*(3.0-2.0*u);
      return mix(mix(mix(skinHash(i),skinHash(i+vec3(1,0,0)),u.x),
                     mix(skinHash(i+vec3(0,1,0)),skinHash(i+vec3(1,1,0)),u.x),u.y),
                 mix(mix(skinHash(i+vec3(0,0,1)),skinHash(i+vec3(1,0,1)),u.x),
                     mix(skinHash(i+vec3(0,1,1)),skinHash(i+vec3(1,1,1)),u.x),u.y),u.z);
    }\n` + shader.fragmentShader
  // Insert before the portrait blend so photographed colours keep their own lighting.
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
    #ifndef USE_MAP
      diffuseColor.rgb *= mix(vec3(1.),vec3(1.10,.77,.74),vSkinRegion.x);
      diffuseColor.rgb *= mix(vec3(1.),vec3(1.03,.55,.58),vSkinRegion.y);
    #endif
    // Textured skin keeps its photographed albedo. A restrained keratin tint
    // also catches the authored nail islands in the MakeHuman skin.
    diffuseColor.rgb = mix(diffuseColor.rgb,diffuseColor.rgb * vec3(1.12,1.06,1.12)+vec3(.065,.044,.043),vSkinRegion.z*.76);
    diffuseColor.rgb *= 1.0 - .17 * vSkinRegion.w;`,
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <roughnessmap_fragment>',
    `#include <roughnessmap_fragment>
    roughnessFactor=mix(roughnessFactor,.45,vSkinRegion.y);
    roughnessFactor=mix(roughnessFactor,.33,vSkinRegion.z);`,
  )
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    vec3 poreCoordinates = vSkinRest * 1250.0;
    float poreVisibility = (1.0-smoothstep(.55,1.6,max(max(fwidth(poreCoordinates).x,fwidth(poreCoordinates).y),fwidth(poreCoordinates).z)))
       * (1.0-vSkinRegion.z)*(1.0-.8*vSkinRegion.y) * ${portraitAttenuation};
    // Use the screen-space gradient of a 30 micrometre relief. The denominator
    // keeps the micro-surface response independent of zoom and projection.
    float microHeight = skinNoise(poreCoordinates) * .000030;
    vec3 sx=dFdx(-vViewPosition), sy=dFdy(-vViewPosition);
    vec3 rx=cross(sy,normal), ry=cross(normal,sx);
    float det=dot(sx,rx);
    normal = normalize(normal - poreVisibility*(rx*dFdx(microHeight)+ry*dFdy(microHeight))*
                       sign(det)/max(abs(det),1e-12));`,
  )
}
