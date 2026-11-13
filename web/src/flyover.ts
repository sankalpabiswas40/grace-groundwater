// Chapter 3 in 3D: the GRACE-FO pair flies over a glowing mass beneath north-west India.
// Altitude (500 km) and separation (220 km) are drawn to scale against the globe;
// spacecraft size and the change in separation are hugely exaggerated (schematic).
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { url } from './data';
import { createEarth, earthTexture } from './earth';
import { latLonToVec } from './physics';
import type { SatState } from './sections';

const R_KM = 6371, ALT = 500 / R_KM, SEP = 220 / R_KM; // in Earth radii / radians
const MASS_AT: [number, number] = [29, 76]; // beneath Punjab-Haryana (schematic position)
const EXTRA_SEP = 0.03; // extra separation angle drawn at the largest range change (exaggeration)

export interface FlyHandle { update(s: SatState): void; }

export async function initFlyover(tier: 'full' | 'lite'): Promise<FlyHandle> {
  const stage = document.getElementById('fly-stage')!;
  const canvas = document.getElementById('fly-canvas') as HTMLCanvasElement;
  const labLead = document.getElementById('fly-lab-lead')!, labTrail = document.getElementById('fly-lab-trail')!, labMass = document.getElementById('fly-lab-mass')!;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'full', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  renderer.setClearColor(0x06101f, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 30);

  const [{ GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ]);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [tex, gltf] = await Promise.all([
    earthTexture(tier === 'full' ? 'day_4096.jpg' : 'day_2048.jpg'),
    loader.loadAsync(url('models/grace-fo.glb')),
  ]);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 1.6;
  // Daylight is placed over the pass so the ground is visible; it is not the real Sun position here.
  const planet = createEarth({ day: tex, segments: 192, sun: new THREE.Vector3(...latLonToVec(18, 100)) });
  scene.add(planet.group);
  void planet.loadExtras(tier);
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  scene.add(key);

  // geometry of the pass: a south-to-north track straight over the mass
  const n = new THREE.Vector3(...latLonToVec(MASS_AT[0], MASS_AT[1]));
  const t = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize(); // north along the surface
  const side = new THREE.Vector3().crossVectors(t, n).normalize(); // east
  const radial = (a: number, out: THREE.Vector3) => out.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(t, Math.sin(a));
  const along = (a: number, out: THREE.Vector3) => out.copy(n).multiplyScalar(-Math.sin(a)).addScaledVector(t, Math.cos(a));

  // satellites (NASA model), flying facing each other
  const SAT_SCALE = 0.0095;
  const sats = [new THREE.Group(), new THREE.Group()];
  sats.forEach((g, k) => {
    const m = k === 0 ? gltf.scene : gltf.scene.clone(true);
    if (k === 1) m.rotation.y = Math.PI;
    g.add(m); g.scale.setScalar(SAT_SCALE); scene.add(g);
  });

  // ranging link
  const linkMat = new LineMaterial({ color: 0x7fd0ee, linewidth: 2.6, transparent: true, opacity: 0.95 });
  const linkGeo = new LineGeometry();
  linkGeo.setPositions([0, 0, 0, 0, 0, 1]);
  const link = new Line2(linkGeo, linkMat);
  scene.add(link);

  // faint ground track
  const trackPts: number[] = [];
  const tmp = new THREE.Vector3();
  for (let a = -0.5; a <= 0.5; a += 0.01) { radial(a, tmp).multiplyScalar(1 + ALT); trackPts.push(tmp.x, tmp.y, tmp.z); }
  const trackMat = new LineMaterial({ color: 0x7fd0ee, linewidth: 1, transparent: true, opacity: 0.22 });
  scene.add(new Line2(new LineGeometry().setPositions(trackPts), trackMat));

  // the mass: a glow just under the surface, visible through the ground (schematic)
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const g2 = gc.getContext('2d')!;
  const grad = g2.createRadialGradient(64, 64, 2, 64, 64, 64);
  grad.addColorStop(0, 'rgba(160,230,255,1)'); grad.addColorStop(0.25, 'rgba(92,194,230,0.85)'); grad.addColorStop(1, 'rgba(92,194,230,0)');
  g2.fillStyle = grad; g2.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthTest: false, transparent: true }));
  glow.position.copy(n).multiplyScalar(0.985);
  glow.renderOrder = 3;
  scene.add(glow);

  // gravity pull lines from each satellite to the mass (schematic)
  const pullMat = new LineMaterial({ color: 0x9fe0ff, linewidth: 1.2, transparent: true, opacity: 0.5, depthTest: false, dashed: true, dashSize: 0.012, gapSize: 0.01 });
  const pulls = sats.map(() => {
    const geo = new LineGeometry(); geo.setPositions(new Array(21 * 3).fill(0));
    const l = new Line2(geo, pullMat); l.renderOrder = 2; scene.add(l); return l;
  });

  let state: SatState = { p: 0, x: -1, xFar: 1, massGt: 10, d: 0, dFrac: 0 };
  let visible = false, dirty = true, tPulse = 0;
  const mats = [linkMat, trackMat, pullMat];
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    mats.forEach((m) => m.resolution.set(w, h));
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }, { threshold: 0.02 }).observe(stage);

  const pa = new THREE.Vector3(), pb = new THREE.Vector3(), ra = new THREE.Vector3(), aa = new THREE.Vector3(), mid = new THREE.Vector3(), look = new THREE.Vector3(), ctrl = new THREE.Vector3(), q = new THREE.Vector3();
  const massPos = n.clone().multiplyScalar(0.985);
  const place = (lab: HTMLElement, v: THREE.Vector3, dy: number, dx = 0) => {
    q.copy(v).project(camera);
    const w = stage.clientWidth, h = stage.clientHeight;
    const on = q.z < 1 && Math.abs(q.x) < 1.05 && Math.abs(q.y) < 1.05;
    lab.style.opacity = on ? '1' : '0';
    lab.style.transform = `translate(${((q.x + 1) / 2) * w + dx}px, ${((1 - q.y) / 2) * h + dy}px) translate(${dx > 0 ? '0' : dx < 0 ? '-100%' : '-50%'}, -50%)`;
  };

  function frame() {
    const a = (state.x / state.xFar) * (1800 / R_KM); // track angle of the pair's midpoint, to scale
    const sep = SEP + state.dFrac * EXTRA_SEP;
    const pos = [a + sep / 2, a - sep / 2];
    sats.forEach((s, k) => {
      radial(pos[k], ra); along(pos[k], aa);
      s.position.copy(ra).multiplyScalar(1 + ALT);
      s.up.copy(ra);
      s.lookAt(tmp.copy(s.position).add(aa));
    });
    pa.copy(sats[0].position); pb.copy(sats[1].position);
    linkGeo.setPositions([pb.x, pb.y, pb.z, pa.x, pa.y, pa.z]);
    // pull lines bend towards the mass; stronger (more opaque) when close
    pulls.forEach((l, k) => {
      const from = k === 0 ? pa : pb;
      ctrl.copy(from).multiplyScalar(0.5).addScaledVector(massPos, 0.5).addScaledVector(tmp.copy(from).normalize(), -0.03);
      const arr: number[] = [];
      for (let i = 0; i <= 20; i++) {
        const u = i / 20, w0 = (1 - u) * (1 - u), w1 = 2 * (1 - u) * u, w2 = u * u;
        arr.push(from.x * w0 + ctrl.x * w1 + massPos.x * w2, from.y * w0 + ctrl.y * w1 + massPos.y * w2, from.z * w0 + ctrl.z * w1 + massPos.z * w2);
      }
      (l.geometry as LineGeometry).setPositions(arr);
      l.computeLineDistances();
    });
    const near = Math.max(0, 1 - Math.abs(a) / 0.22);
    pullMat.opacity = 0.12 + 0.6 * near;
    const size = (0.05 + 0.02 * Math.sqrt(state.massGt)) * (1 + 0.06 * Math.sin(tPulse * 3));
    glow.scale.set(size, size, 1);
    linkMat.opacity = 0.7 + 0.3 * Math.sin(tPulse * 7);

    // camera flies beside the pair, a little ahead of it and above
    radial(a, ra); along(a, aa);
    const portrait = camera.aspect < 1.2;
    mid.copy(ra).multiplyScalar(1 + ALT);
    camera.position.copy(ra).multiplyScalar(1 + ALT + (portrait ? 0.1 : 0.06)).addScaledVector(side, portrait ? 0.5 : 0.36).addScaledVector(aa, -0.05);
    camera.up.copy(ra);
    look.copy(ra).multiplyScalar(1 + ALT * 0.35).addScaledVector(aa, 0.02);
    camera.lookAt(look);
    key.position.copy(camera.position).addScaledVector(ra, 0.5);
    renderer.render(scene, camera);
    // the pair flies away from or towards the viewer's left depending on the side we look from
    const leadRight = tmp.copy(pa).project(camera).x > q.copy(pb).project(camera).x;
    place(labLead, pa, -20, leadRight ? 6 : -6); place(labTrail, pb, -20, leadRight ? -6 : 6); place(labMass, massPos, 30);
    labMass.textContent = `extra mass: ${state.massGt} Gt`;
  }

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    tPulse += dt;
    planet.update(dt);
    frame(); dirty = false;
  };
  resize();
  requestAnimationFrame(loop);
  void dirty; void mid;
  (window as unknown as { __flyover: boolean }).__flyover = true;
  return { update(s) { state = s; dirty = true; } };
}
