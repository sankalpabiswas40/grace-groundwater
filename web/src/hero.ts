// Hero: Earth with real day/night line, night lights, atmosphere, and a schematic
// GRACE-FO pair on a polar orbit. three.js is loaded lazily by main.ts.
import * as THREE from 'three';
import { latLonToVec, subsolarPoint } from './physics';

export type Tier = 'full' | 'lite' | 'static';

export interface HeroHandle {
  dispose(): void;
  /** average frame time in ms over the last measuring window */
  frameMs(): number;
  setActive(on: boolean): void;
}

const EARTH_VERT = /* glsl */ `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;

const EARTH_FRAG = /* glsl */ `
uniform sampler2D dayTex; uniform sampler2D nightTex; uniform vec3 sunDir;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  float d = dot(n, sunDir);
  float day = smoothstep(-0.10, 0.18, d);
  vec3 dc = texture2D(dayTex, vUv).rgb;
  vec3 nc = texture2D(nightTex, vUv).rgb;
  float ocean = smoothstep(0.02, 0.10, dc.b - max(dc.r, dc.g) * 0.92);
  vec3 h = normalize(sunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 60.0) * ocean * 0.55;
  vec3 lit = dc * (0.10 + 1.05 * max(d, 0.0)) + vec3(spec);
  vec3 dark = dc * 0.035 + nc * vec3(1.25, 1.1, 0.85);
  vec3 col = mix(dark, lit, day);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.2);
  col += rim * vec3(0.25, 0.52, 1.0) * (0.25 + 0.75 * smoothstep(-0.25, 0.3, d));
  float tw = smoothstep(-0.12, 0.02, d) * (1.0 - smoothstep(0.02, 0.22, d));
  col += tw * vec3(0.35, 0.16, 0.05) * 0.35;
  gl_FragColor = vec4(col, 1.0);
}`;

const ATMO_VERT = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FRAG = /* glsl */ `
uniform vec3 sunDir; varying vec3 vN; varying vec3 vW;
void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
  float f = clamp(-dot(n, v), 0.0, 1.0);            // 0 at the outer limb, 0.29 at Earth's edge
  float edge = pow(clamp(f / 0.29, 0.0, 1.0), 2.5);
  float sun = 0.15 + 0.85 * smoothstep(-0.3, 0.4, dot(normalize(vW), sunDir));
  gl_FragColor = vec4(vec3(0.30, 0.60, 1.0) * edge * sun * 1.3, 1.0); }`;

function makeSatellite(): THREE.Group {
  // Schematic model: trapezoid body with solar cells on the sloping sides.
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.97, 0); shape.lineTo(0.97, 0); shape.lineTo(0.35, 0.72); shape.lineTo(-0.35, 0.72); shape.closePath();
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: 3.1, bevelEnabled: false }),
    [
      new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.85, roughness: 0.35 }), // gold foil ends
      new THREE.MeshStandardMaterial({ color: 0x10214a, metalness: 0.6, roughness: 0.3 }), // solar cells
    ],
  );
  body.geometry.translate(0, -0.3, -1.55);
  g.add(body);
  const horn = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.3 }));
  horn.rotation.x = Math.PI / 2; horn.position.set(0, 0.05, 1.7);
  g.add(horn);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), new THREE.MeshStandardMaterial({ color: 0xbbbbbb }));
  boom.position.set(0, -0.75, 0);
  g.add(boom);
  return g;
}

export function initHero(
  canvas: HTMLCanvasElement,
  tier: Exclude<Tier, 'static'>,
  images: { day: HTMLImageElement; night: HTMLImageElement },
): HeroHandle {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'full', powerPreference: 'high-performance' });
  const maxPR = tier === 'full' ? 2 : 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setClearColor(0x06101f, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);

  const mkTex = (img: HTMLImageElement) => {
    const t = new THREE.Texture(img);
    t.anisotropy = tier === 'full' ? 8 : 2;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.needsUpdate = true;
    return t;
  };
  const sun = new THREE.Vector3();
  const setSun = () => {
    const s = subsolarPoint(new Date());
    sun.set(...latLonToVec(s.lat, s.lon)).normalize();
  };
  setSun();

  const seg = tier === 'full' ? 96 : 56;
  const earthMat = new THREE.ShaderMaterial({
    vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG,
    uniforms: { dayTex: { value: mkTex(images.day) }, nightTex: { value: mkTex(images.night) }, sunDir: { value: sun } },
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, seg, seg / 2), earthMat);
  scene.add(earth);

  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.045, seg, seg / 2),
    new THREE.ShaderMaterial({ vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, uniforms: { sunDir: { value: sun } }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  scene.add(atmo);

  // stars (procedural)
  const nStars = tier === 'full' ? 2600 : 900;
  const sp = new Float32Array(nStars * 3);
  const sc = new Float32Array(nStars * 3);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < nStars; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    sp.set([90 * r * Math.cos(a), 90 * u, 90 * r * Math.sin(a)], i * 3);
    const b = 0.35 + 0.65 * Math.pow(rnd(), 3), w = rnd();
    sc.set([b * (0.85 + 0.15 * w), b * 0.92, b * (1 - 0.15 * w)], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true })));

  // satellites
  scene.add(new THREE.AmbientLight(0xaabbdd, 2.6));
  const dl = new THREE.DirectionalLight(0xffffff, 2.2);
  dl.position.copy(sun).multiplyScalar(10);
  scene.add(dl);
  const sats = [makeSatellite(), makeSatellite()];
  const SAT_SCALE = 0.014;
  sats.forEach((s) => { s.scale.setScalar(SAT_SCALE); scene.add(s); });
  const linkGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const link = new THREE.Line(linkGeo, new THREE.LineBasicMaterial({ color: 0x7fd0ee, transparent: true, opacity: 0.85 }));
  scene.add(link);
  // faint orbit ring (polar orbit through 77E)
  const ORBIT_R = 1.11, ORBIT_LON = 77, GAP = 0.085;
  const eq = new THREE.Vector3(...latLonToVec(0, ORBIT_LON));
  const up = new THREE.Vector3(0, 1, 0);
  const ringPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 180; i++) {
    const a = (i / 180) * Math.PI * 2;
    ringPts.push(eq.clone().multiplyScalar(Math.cos(a) * ORBIT_R).addScaledVector(up, Math.sin(a) * ORBIT_R));
  }
  scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: 0x7fd0ee, transparent: true, opacity: 0.16 })));

  const orbitPos = (a: number, out: THREE.Vector3) => out.copy(eq).multiplyScalar(Math.cos(a) * ORBIT_R).addScaledVector(up, Math.sin(a) * ORBIT_R);
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const wide = w / h > 1.05;
    camera.fov = wide ? 32 : 40;
    if (wide) camera.setViewOffset(w, h, -w * 0.22, 0, w, h);
    else camera.setViewOffset(w, h, 0, -h * 0.2, w, h);
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  let active = true, raf = 0, last = performance.now(), t = 0;
  let acc = 0, frames = 0, avg = 16;
  let sunTick = 0;
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (!active) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now; t += dt;
    acc += dt * 1000; frames++;
    if (acc > 1000) { avg = acc / frames; acc = 0; frames = 0; }
    if ((sunTick += dt) > 30) { sunTick = 0; setSun(); dl.position.copy(sun).multiplyScalar(10); }
    // slow camera drift around north India
    const lon = 77 + 9 * Math.sin(t * 0.045), lat = 21 + 4 * Math.sin(t * 0.03 + 1);
    const dist = (camera.aspect > 1.05 ? 3.55 : 4.3) + 0.08 * Math.sin(t * 0.05);
    camera.position.set(...latLonToVec(lat, lon)).multiplyScalar(dist);
    camera.lookAt(0, 0, 0);
    // satellites: lead and trail
    const a = t * 0.16 + 0.2;
    sats.forEach((s, k) => {
      const ak = a + (k === 0 ? GAP / 2 : -GAP / 2);
      orbitPos(ak, tmp);
      orbitPos(ak + 0.01, tmp2);
      s.position.copy(tmp);
      s.up.copy(tmp).normalize();
      s.lookAt(tmp2);
    });
    const p = linkGeo.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, sats[0].position.x, sats[0].position.y, sats[0].position.z);
    p.setXYZ(1, sats[1].position.x, sats[1].position.y, sats[1].position.z);
    p.needsUpdate = true;
    (link.material as THREE.LineBasicMaterial).opacity = 0.55 + 0.35 * Math.sin(t * 6);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
      renderer.dispose();
    },
    frameMs: () => avg,
    setActive(on: boolean) { active = on; },
  };
}
