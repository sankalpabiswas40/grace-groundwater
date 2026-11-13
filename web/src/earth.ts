// One realistic Earth shared by the 3D scenes.
// Imagery: NASA Blue Marble (day), Black Marble (night lights), Blue Marble clouds, and
// elevation / ocean mask from NASA's Blue Marble topography and bathymetry (GEBCO).
// The clouds are one real cloud mosaic drifting slowly; they are not today's weather.
import * as THREE from 'three';
import { url } from './data';

const VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const FRAG = /* glsl */ `
uniform sampler2D dayTex; uniform sampler2D nightTex; uniform sampler2D cloudTex; uniform sampler2D reliefTex;
uniform vec3 sunDir; uniform float cloudShift; uniform float hasClouds; uniform float hasRelief; uniform float hasNight;
uniform vec2 texel; uniform float dim; uniform mat3 frame; uniform float linearOut;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n0 = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  // local east / north on the sphere (in world space, following the globe's own rotation)
  vec3 axis = normalize(frame * vec3(0.0, 1.0, 0.0));
  vec3 east = normalize(cross(axis, n0)); vec3 north = cross(n0, east);
  vec3 n = n0; float ocean = 0.0;
  vec3 dc = texture2D(dayTex, vUv).rgb;
  if (hasRelief > 0.5) {
    vec3 r = texture2D(reliefTex, vUv).rgb; ocean = r.g;
    float hE = texture2D(reliefTex, vUv + vec2(texel.x, 0.0)).r - texture2D(reliefTex, vUv - vec2(texel.x, 0.0)).r;
    float hN = texture2D(reliefTex, vUv + vec2(0.0, texel.y)).r - texture2D(reliefTex, vUv - vec2(0.0, texel.y)).r;
    n = normalize(n0 - 2.2 * (hE * east + hN * north) * (1.0 - ocean)); // mountains catch the light
  } else {
    ocean = smoothstep(0.02, 0.10, dc.b - max(dc.r, dc.g) * 0.92);
  }
  float d0 = dot(n0, sunDir); float d = dot(n, sunDir);
  float day = smoothstep(-0.10, 0.20, d0);
  float cloud = 0.0; float shadow = 0.0;
  if (hasClouds > 0.5) {
    vec2 cuv = vUv + vec2(cloudShift, 0.0);
    cloud = smoothstep(0.08, 0.85, texture2D(cloudTex, cuv).r);
    // shadow: the cloud a little way towards the Sun
    vec2 toSun = vec2(dot(sunDir, east), dot(sunDir, north)) * 0.0045;
    shadow = smoothstep(0.08, 0.85, texture2D(cloudTex, cuv + toSun).r);
  }
  vec3 h = normalize(sunDir + v);
  float gl = pow(max(dot(n0, h), 0.0), 110.0) * 0.9 + pow(max(dot(n0, h), 0.0), 18.0) * 0.12; // sharp glint + soft sheen
  vec3 spec = vec3(1.0, 0.95, 0.85) * gl * ocean * (1.0 - cloud) * smoothstep(0.0, 0.15, d0);
  vec3 lit = dc * (0.045 + 1.08 * max(d, 0.0)) * (1.0 - 0.5 * shadow) + spec;
  vec3 nightC = hasNight > 0.5 ? texture2D(nightTex, vUv).rgb * vec3(1.25, 1.08, 0.82) * (1.0 - 0.75 * cloud) : vec3(0.0);
  vec3 dark = dc * 0.02 + nightC * smoothstep(0.12, -0.12, d0);
  vec3 col = mix(dark, lit, day);
  // clouds: white in sunlight, warm at the terminator, nearly black at night
  float warm = smoothstep(0.30, 0.0, d0) * smoothstep(-0.12, 0.05, d0);
  vec3 cloudLit = mix(vec3(1.0), vec3(1.0, 0.62, 0.38), warm) * (0.03 + 1.05 * max(d0, 0.0) + 0.25 * warm);
  col = mix(col, cloudLit, cloud * mix(0.55, 0.88, day));
  // air seen edge-on: blue by day, orange along the sunset line, nothing at night
  float rim = pow(1.0 - max(dot(n0, v), 0.0), 3.0);
  vec3 air = mix(vec3(0.62, 0.30, 0.14), vec3(0.28, 0.55, 1.0), smoothstep(-0.04, 0.26, d0));
  col += rim * air * smoothstep(-0.22, 0.12, d0) * 0.85;
  col += dc * 0.0 + vec3(0.30, 0.50, 1.0) * 0.045 * max(d0, 0.0); // thin haze over the day side
  col *= dim;
  if (linearOut > 0.5) col = pow(max(col, 0.0), vec3(2.2)); // when a post-processing chain re-encodes the picture
  gl_FragColor = vec4(col, 1.0);
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 sunDir; uniform float dim; uniform float linearOut; varying vec3 vN; varying vec3 vW;
void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  float f = clamp(-dot(n, v), 0.0, 1.0);                 // 0 at the outer edge, about 0.25 at the Earth's limb
  float edge = pow(clamp(f / 0.25, 0.0, 1.0), 2.2) * (1.0 - smoothstep(0.25, 0.42, f));
  float s = dot(n, sunDir);
  vec3 air = mix(vec3(0.60, 0.28, 0.12), vec3(0.30, 0.58, 1.0), smoothstep(-0.06, 0.24, s));
  float lit = smoothstep(-0.28, 0.10, s);
  vec3 c = air * edge * lit * 1.35 * dim;
  if (linearOut > 0.5) c = pow(c, vec3(2.2));
  gl_FragColor = vec4(c, 1.0); }`;

export interface Earth {
  group: THREE.Group;
  /** direction to the Sun in world space (unit vector); mutate and it updates */
  sun: THREE.Vector3;
  /** call every frame with the time step in seconds: drifts the clouds */
  update(dt: number): void;
  /** load clouds and relief (and night lights if not given) in the background */
  loadExtras(tier: 'full' | 'lite', onReady?: () => void): Promise<void>;
  setDim(v: number): void;
  setLinearOut(on: boolean): void;
}

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();
export function earthTexture(name: string): Promise<THREE.Texture> {
  if (!cache.has(name)) cache.set(name, loader.loadAsync(url('textures/' + name)).then((t) => { t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8; return t; }));
  return cache.get(name)!;
}

export function createEarth(opts: { day: THREE.Texture; night?: THREE.Texture; radius?: number; segments?: number; sun?: THREE.Vector3; atmosphere?: boolean; dim?: number; linearOut?: boolean }): Earth {
  const R = opts.radius ?? 1, seg = opts.segments ?? 96;
  const sun = (opts.sun ?? new THREE.Vector3(1, 0.3, 0.5)).clone().normalize();
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); blank.needsUpdate = true;
  opts.day.wrapS = THREE.RepeatWrapping;
  const uniforms = {
    dayTex: { value: opts.day }, nightTex: { value: opts.night ?? blank }, cloudTex: { value: blank as THREE.Texture }, reliefTex: { value: blank as THREE.Texture },
    sunDir: { value: sun }, cloudShift: { value: 0 }, hasClouds: { value: 0 }, hasRelief: { value: 0 }, hasNight: { value: opts.night ? 1 : 0 },
    texel: { value: new THREE.Vector2(1 / 2048, 1 / 1024) }, dim: { value: opts.dim ?? 1 }, frame: { value: new THREE.Matrix3() }, linearOut: { value: opts.linearOut ? 1 : 0 },
  };
  const group = new THREE.Group();
  const surface = new THREE.Mesh(new THREE.SphereGeometry(R, seg, seg / 2), new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms }));
  group.add(surface);
  const atmoU = { sunDir: { value: sun }, dim: uniforms.dim, linearOut: uniforms.linearOut };
  if (opts.atmosphere !== false) {
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.035, seg, seg / 2),
      new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: atmoU, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    group.add(atmo);
  }
  const m4 = new THREE.Matrix4();
  return {
    group, sun,
    update(dt) {
      uniforms.cloudShift.value = (uniforms.cloudShift.value + dt * 0.0006) % 1;
      group.updateMatrixWorld();
      uniforms.frame.value.setFromMatrix4(m4.copy(group.matrixWorld));
    },
    async loadExtras(tier, onReady) {
      const jobs: Promise<void>[] = [
        earthTexture(tier === 'full' ? 'clouds_2048.jpg' : 'clouds_1024.jpg').then((t) => { uniforms.cloudTex.value = t; uniforms.hasClouds.value = 1; onReady?.(); }),
        earthTexture(tier === 'full' ? 'relief_4096.jpg' : 'relief_2048.jpg').then((t) => {
          t.wrapS = THREE.RepeatWrapping; uniforms.reliefTex.value = t; uniforms.hasRelief.value = 1;
          const w = tier === 'full' ? 4096 : 2048; uniforms.texel.value.set(1.5 / w, 1.5 / (w / 2)); onReady?.();
        }),
      ];
      if (!opts.night) jobs.push(earthTexture('night_2048.jpg').then((t) => { uniforms.nightTex.value = t; uniforms.hasNight.value = 1; onReady?.(); }));
      await Promise.all(jobs.map((j) => j.catch((e) => console.warn('Earth detail texture not loaded', e))));
    },
    setDim(v) { uniforms.dim.value = v; },
    setLinearOut(on) { uniforms.linearOut.value = on ? 1 : 0; },
  };
}
