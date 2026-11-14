import { Vector3, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three'
import type { HeadFrame } from '../portrait/headFit'

export type GroomKind = 'scalp' | 'brow' | 'lash' | 'body'
type Patch = (shader: WebGLProgramParametersWithUniforms) => void

// The same two-dimensional follicle coordinates are sampled on every shell.
// Its outward displacement and lean turn those samples into individual fibres.
const common = /* glsl */ `
  varying vec2 vFollicle;
  #if defined(GROOM_BROW) || defined(GROOM_LASH)
    varying vec2 vRibbon;
  #endif
  varying float vHairMask;
  varying float vShellHeight;
  uniform float uUncoveredFace;
`
const vertex = /* glsl */ `
  vec3 root = groomRest-uHeadOrigin;
  float side = root.x < 0.0 ? -1.0 : 1.0;
  float h = shellHeight;
  #if defined(GROOM_BROW) || defined(GROOM_LASH)
    vRibbon = groomRibbon;
  #endif
  vec3 strandDirection;
  float strandLength;
  #ifdef GROOM_SCALP
    float theta=atan(root.x,root.z+uEyeSpan*1.27);
    float arc=theta*uEyeSpan*1.28;
    // A gentle sweep varies with latitude, keeping neighbouring locks together.
    vFollicle=vec2((arc+0.43*root.y+0.004*sin(arc*69.0+root.y*95.0))*1040.0,
                   (root.y-0.25*arc)*410.0);
    vec3 comb=vec3(0.72, -0.18, -0.6);
    comb-=normal*dot(normal,comb);
    strandDirection=normal*(0.74-0.25*h) + comb*(0.43+0.91*h);
    strandLength=mix(0.004,0.016,smoothstep(0.005,0.095,root.y));
  #elif defined(GROOM_BROW)
    vFollicle = vec2((root.y+0.22*side*root.x)*1150.0,root.x*320.0);
    strandDirection=normal*0.24+vec3(0.87*side,0.32,0.12);
    strandLength=0.0035;
  #elif defined(GROOM_LASH)
    vFollicle = root.xy*vec2(1180.0,120.0);
    strandDirection=normal*0.48+vec3(0.21*side,0.48+0.20*h,0.20);
    strandLength=0.0036;
  #else
    // A separate projection around each limb avoids long seams along its flanks.
    float y=groomRest.y/uBodyHeight;
    float xCentre = y < 0.4 ? 0.051 : (y < 0.66 && abs(groomRest.x)/uBodyHeight > 0.105 ? 0.14 : 0.0);
    float zCentre = y < 0.4 ? -0.028 : 0.0;
    vec2 section=vec2(groomRest.x-side*xCentre*uBodyHeight,groomRest.z-zCentre);
    vFollicle=vec2(atan(section.x,section.y)*max(length(section),0.024),groomRest.y)*460.0;
    float flowAngle = 0.86*sin(groomRest.y*21.0+2.0*sin(groomRest.x*41.0));
    strandDirection=normalize(normal*0.32+vec3(side*(0.3+0.42*flowAngle),-0.88,0.16*flowAngle));
    strandLength=mix(0.0028,0.0055,smoothstep(0.48,0.69,y));
  #endif
  vHairMask=groomMask;
  vShellHeight=h;
  transformed+=strandDirection*(h*strandLength*sqrt(groomMask));
`
const fragment = /* glsl */ `
  float rootHash(vec2 p){
    vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));
    p3+=dot(p3,p3.yzx+33.33);
    return fract((p3.x+p3.y)*p3.z);
  }
  float fibreCoverage(vec2 uv,float radius,float density,float h, out float tone){
    vec2 cell=floor(uv), f=fract(uv);
    // Restrict jitter so follicles stay inside their cell. A fibre tapers and
    // ends at an individual height, which breaks a uniform outer silhouette.
    float seed=rootHash(cell);
    tone=rootHash(cell+19.7);
    vec2 centre=0.5+0.38*(vec2(tone,rootHash(cell-8.5))-0.5);
    float strandDistance=length(f-centre);
    float edge=clamp(0.36*max(fwidth(uv.x),fwidth(uv.y)),0.025,0.14);
    float shape=1.0-smoothstep(radius-edge,radius+edge,strandDistance);
    return seed < density && h < 0.57+0.43*tone ? shape:0.0;
  }
`
const coverage = /* glsl */ `
  float strandTone=0.5;
  float h=vShellHeight, mask=clamp(vHairMask,0.0,1.0);
  #ifdef GROOM_SCALP
    // The sparse feathered edge grows into a dense root bed. Clumps shift the
    // transition in anatomical coordinates instead of outlining mesh edges.
    float lockWave=sin(0.11*vFollicle.x+0.19*vFollicle.y);
    float localMask=clamp(mask + 0.042*lockWave + 0.022*sin(0.30*vFollicle.x), 0.0, 1.0);
    float radius=mix(0.46,0.19,h)*mix(0.62,1.0,localMask);
    float spacing=1.0/max(1.0,max(fwidth(vFollicle.x),fwidth(vFollicle.y)));
    float coverage=fibreCoverage(vFollicle, radius, localMask*0.98, h, strandTone);
    // At distant zoom the undercoat carries the silhouette. Fine shells become
    // visible on approach instead of sparkling between subpixel grid cells.
    coverage*=mix(0.58,1.0,smoothstep(0.22,0.8,spacing));
    // Dither follicle occupancy in the transition, with a solid undercoat
    // only where follicles merge. This leaves visible skin at the hairline.
    if(h<0.16) {
      float covered=smoothstep(0.28,0.91,localMask);
      float seed=rootHash(floor(vFollicle*1.38));
      coverage=max(coverage,step(seed + 0.003, covered));
    }
    float strandAlpha=coverage*smoothstep(0.02,0.40,mask);
    float waves=sin(0.16*vFollicle.x+0.31*vFollicle.y);
    float ridges=sin(1.25*vFollicle.x+0.13*vFollicle.y+1.8*waves);
    float diffuseGain=(0.66+0.36*h+0.17*waves+0.17*ridges)*mix(0.83,1.21,strandTone);
    // Fine hairs at the temples transmit more light than the dense interior.
    diffuseColor.rgb *= mix(vec3(2.8,2.3,1.8),vec3(1.0),smoothstep(0.2,0.95,mask));
  #elif defined(GROOM_BROW)
    float radius=mix(0.41,0.19,h);
    float coverage=fibreCoverage(vFollicle, radius, 0.85, h, strandTone);
    float openEdge=1.0-smoothstep(0.56,1.0,abs(vRibbon.y*2.0-1.0));
    if(h<0.035)coverage=max(coverage,0.90*openEdge);
    float strandAlpha=coverage*mask*uUncoveredFace;
    float diffuseGain=mix(0.72,1.18,strandTone);
  #elif defined(GROOM_LASH)
    vec2 coordinates=vec2(vFollicle.x,0.5);
    float radius=mix(0.32,0.10,h);
    float coverage=fibreCoverage(coordinates,radius,0.65,h,strandTone);
    float strandAlpha=coverage*mask*uUncoveredFace;
    float diffuseGain=mix(0.56,1.27,strandTone);
  #else
    float radius=mix(0.22,0.085,h);
    float coverage=fibreCoverage(vFollicle,radius,0.17*mask,h,strandTone);
    float strandAlpha=coverage*mask;
    float diffuseGain=mix(0.70,1.45,strandTone);
  #endif
  diffuseColor.rgb*=diffuseGain;
  diffuseColor.a*=strandAlpha;
`

export function attachStrandShader(
  material: MeshStandardMaterial,
  kind: GroomKind,
  head: HeadFrame,
  bodyHeight: number,
  detail: { value: number },
  patch?: Patch,
) {
  const define = '#define GROOM_' + kind.toUpperCase() + '\n'
  material.customProgramCacheKey = () => 'pulsar-strands-' + kind
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uUncoveredFace: detail,
      uHeadOrigin: { value: new Vector3(head.x, head.y, head.eyeZ) },
      uEyeSpan: { value: head.eyeDistance },
      uBodyHeight: { value: bodyHeight },
    })
    // Apply the same breathing, fluid shift and lens opening as the underlying skin.
    // Insert extrusion after that patch's transformed vertex has been calculated.
    patch?.(shader)
    shader.vertexShader =
      define +
      common +
      '#if defined(GROOM_BROW) || defined(GROOM_LASH)\n attribute vec2 groomRibbon;\n #endif\nattribute vec3 groomRest; attribute float groomMask; attribute float shellHeight; uniform vec3 uHeadOrigin; uniform float uEyeSpan,uBodyHeight;\n' +
      shader.vertexShader.replace('#include <project_vertex>', vertex + '\n#include <project_vertex>')
    shader.fragmentShader =
      define +
      common +
      fragment +
      shader.fragmentShader.replace(
        '#include <alphatest_fragment>',
        coverage + '\n#include <alphatest_fragment>',
      )
    if (kind === 'scalp') {
      // Smooth sparse hairs along the hairline. Interior fibres retain opaque
      // coverage so several shells never repeatedly uncover the same samples.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <opaque_fragment>',
        'diffuseColor.a=mix(diffuseColor.a, 1.0, smoothstep(0.58, 0.88, localMask));\n#include <opaque_fragment>',
      )
    }
  }
}
