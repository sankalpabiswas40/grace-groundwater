// 3D scene for "Inside GRACE-FO": staged opening, camera moves, live instrument effects.
// Where the shell splits, unit heights, thruster positions and the internal beam path are
// our reconstruction (see the section's "Go deeper"); the layout is traced from Airbus DS.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { url } from './data';
import { GROUPS, MATS, PARTS, SAT_DIMS, type Part } from './inside-data';

export interface InsideScene { select(id: string | null): void; }
interface Built { part: Part; obj: THREE.Group; home: THREE.Vector3; out: THREE.Vector3; line: THREE.Line; mats: { m: THREE.MeshStandardMaterial; base: THREE.Color }[] }

const OPEN_SECONDS = 4.4;

export async function buildInside(tier: 'full' | 'lite', onPick: (p: Part | null) => void): Promise<InsideScene> {
  const ui = document.getElementById('inside-ui')!, stage = document.getElementById('inside-stage')!;
  const canvas = document.getElementById('inside-canvas') as HTMLCanvasElement;
  const toggle = document.getElementById('inside-toggle') as HTMLButtonElement;
  const explore = document.getElementById('inside-explore') as HTMLButtonElement, closeBtn = document.getElementById('inside-close') as HTMLButtonElement;
  const label = document.getElementById('inside-label')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const full = tier === 'full';

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, full ? 2 : 1.5));
  renderer.setClearColor(0x050a14, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.localClippingEnabled = true;
  if (full) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 400);
  const [{ GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }, { gsap }, { ScrollTrigger }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'), import('gsap'), import('gsap/ScrollTrigger'),
  ]);
  gsap.registerPlugin(ScrollTrigger);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 0.85;
  const keyL = new THREE.DirectionalLight(0xfff2dc, 2.6); scene.add(keyL);
  if (full) {
    keyL.castShadow = true; keyL.shadow.mapSize.set(1024, 1024); keyL.shadow.bias = -0.0006; keyL.shadow.radius = 5;
    const sc = keyL.shadow.camera; sc.left = -3.2; sc.right = 3.2; sc.top = 3.2; sc.bottom = -3.2; sc.near = 1; sc.far = 24;
  }
  const rim = new THREE.DirectionalLight(0x86b4ff, 1.3); rim.position.set(-4, 2.5, -5); scene.add(rim);
  const sweep = new THREE.PointLight(0xaee4ff, 0, 3.4, 1.6); sweep.position.set(0, 0.25, 1.7); scene.add(sweep);

  // ---- backdrop: stars and the Earth far below
  {
    const n = full ? 1600 : 700, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let s = 99; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const u = rnd() * 2 - 1, a = rnd() * 6.283, r = Math.sqrt(1 - u * u), b = 0.35 + 0.65 * Math.pow(rnd(), 3);
      pos.set([150 * r * Math.cos(a), 150 * u, 150 * r * Math.sin(a)], i * 3); col.set([b, b * 0.95, b * (0.85 + 0.15 * rnd())], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.5, sizeAttenuation: false, vertexColors: true })));
    new THREE.TextureLoader().loadAsync(url('textures/day_2048.jpg')).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      const earth = new THREE.Mesh(new THREE.SphereGeometry(60, 96, 48), new THREE.MeshLambertMaterial({ map: t }));
      earth.position.set(0, -66, -10); earth.rotation.set(0.5, 2.6, 0.2); scene.add(earth);
      const halo = new THREE.Mesh(new THREE.SphereGeometry(61, 64, 32), new THREE.MeshBasicMaterial({ color: 0x4f9dff, transparent: true, opacity: 0.1, side: THREE.BackSide, depthWrite: false }));
      halo.position.copy(earth.position); scene.add(halo);
      dirty = true;
    }).catch(() => undefined);
  }

  const root = new THREE.Group(); scene.add(root);
  const D = SAT_DIMS, FLOOR = -D.height / 2;
  let dirty = true;

  // ---- surface detail shared by the boxes: panel lines and bolts
  const detail = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d')!;
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    c.strokeStyle = 'rgba(0,0,0,.34)'; c.lineWidth = 3; c.strokeRect(12, 12, 232, 232);
    c.lineWidth = 2; c.beginPath(); c.moveTo(12, 96); c.lineTo(244, 96); c.moveTo(150, 96); c.lineTo(150, 244); c.stroke();
    c.fillStyle = 'rgba(0,0,0,.45)';
    [[24, 24], [232, 24], [24, 232], [232, 232], [128, 24], [128, 232], [24, 128], [232, 128]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); });
    c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 6; i++) c.fillRect(30 + i * 18, 118, 10, 46);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  })();
  const baseMat = (k: keyof typeof MATS, withDetail = false) => {
    const m = new THREE.MeshStandardMaterial(MATS[k]);
    if (withDetail) { m.map = detail; if (full) { m.bumpMap = detail; m.bumpScale = 0.6; } }
    return m;
  };

  // equipment platform
  const plate = new THREE.Mesh(new RoundedBoxGeometry(D.widthBottom - 0.08, 0.035, D.length - 0.06, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0x171b21, metalness: 0.35, roughness: 0.5, map: detail }));
  plate.position.y = FLOOR + 0.02; plate.receiveShadow = true; root.add(plate);
  (plate.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 1);
  const rimLine = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(D.widthBottom - 0.08, 0.035, D.length - 0.06)), new THREE.LineBasicMaterial({ color: 0x5b6676 }));
  rimLine.position.copy(plate.position); root.add(rimLine);

  // ---- NASA shell, cut into four panels with clipping planes so it can open
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  interface Piece { pivot: THREE.Group; holder: THREE.Group; local: THREE.Plane[]; world: THREE.Plane[] }
  const pieces: Record<'port' | 'star' | 'front' | 'rear', Piece> = {} as never;
  const zc = D.length / 2 - 0.14, halfW = D.widthBottom / 2;
  try {
    const gltf = await loader.loadAsync(url('models/grace-fo.glb'));
    gltf.scene.scale.setScalar(D.length / 3.254);
    const make = (key: 'port' | 'star' | 'front' | 'rear', local: THREE.Plane[], pivotPos: THREE.Vector3) => {
      const pivot = new THREE.Group(), holder = new THREE.Group();
      pivot.position.copy(pivotPos); holder.position.copy(pivotPos).multiplyScalar(-1); pivot.add(holder);
      const world = local.map((p) => p.clone());
      const model = gltf.scene.clone(true);
      model.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        const conv = (x: THREE.Material) => { const c = x.clone(); c.clippingPlanes = world; c.clipShadows = true; c.side = THREE.DoubleSide; return c; };
        m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
        m.castShadow = full;
      });
      holder.add(model); root.add(pivot);
      pieces[key] = { pivot, holder, local, world };
    };
    const P = (x: number, y: number, z: number, c: number) => new THREE.Plane(new THREE.Vector3(x, y, z), c);
    make('port', [P(-1, 0, 0, 0), P(0, 0, -1, zc), P(0, 0, 1, zc)], new THREE.Vector3(-halfW, FLOOR, 0));
    make('star', [P(1, 0, 0, 0), P(0, 0, -1, zc), P(0, 0, 1, zc)], new THREE.Vector3(halfW, FLOOR, 0));
    make('front', [P(0, 0, 1, -zc)], new THREE.Vector3(0, 0, 0));
    make('rear', [P(0, 0, -1, -zc)], new THREE.Vector3(0, 0, 0));
  } catch (e) { console.warn('NASA shell not loaded', e); }
  const updateClips = () => {
    root.updateMatrixWorld(true);
    (Object.values(pieces) as Piece[]).forEach((pc) => pc.local.forEach((pl, i) => pc.world[i].copy(pl).applyMatrix4(pc.holder.matrixWorld)));
  };

  // ---- units
  const xOf = (u: number) => u * 0.8, zOf = (v: number) => (0.5 - v) * (D.length - 0.25);
  const built: Built[] = [];
  const leaderMat = new THREE.LineBasicMaterial({ color: 0x7fd0ee, transparent: true, opacity: 0 });
  let proof: THREE.Mesh | null = null;
  const camCones: THREE.Mesh[] = [];
  for (const p of PARTS) {
    const g = new THREE.Group(); g.userData.partId = p.id;
    const [w, h, d] = p.size;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, y = 0) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; mesh.castShadow = full; mesh.receiveShadow = full; g.add(mesh); return mesh; };
    let baseY = FLOOR + 0.04 + h / 2;
    switch (p.shape) {
      case 'box': {
        add(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.08), baseMat(p.mat, true));
        add(new RoundedBoxGeometry(w * 0.86, 0.012, d * 0.86, 2, 0.004), baseMat('dark'), h / 2 + 0.004);
        for (let k = 0; k < 3; k++) { const c = add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), baseMat('alu')); c.rotation.x = Math.PI / 2; c.position.set(-w * 0.25 + k * w * 0.25, 0, d / 2 + 0.012); }
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const f = add(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8), baseMat('dark'), -h / 2 + 0.01); f.position.x = sx * (w / 2 + 0.012); f.position.z = sz * (d / 2 - 0.03); }
        break;
      }
      case 'tank': {
        add(new THREE.SphereGeometry(w / 2, 48, 32), baseMat(p.mat));
        const band = add(new THREE.TorusGeometry(w / 2 + 0.004, 0.012, 8, 56), baseMat('alu')); band.rotation.x = Math.PI / 2;
        add(new THREE.CylinderGeometry(w * 0.28, w * 0.34, 0.06, 24), baseMat('dark'), -h / 2 + 0.02);
        const valve = add(new THREE.CylinderGeometry(0.025, 0.025, 0.09, 12), baseMat('alu'), h / 2 + 0.03); void valve;
        break;
      }
      case 'cyl': { add(new THREE.CylinderGeometry(w / 2, w / 2, h, 36), baseMat(p.mat)); add(new THREE.CylinderGeometry(w / 2 + 0.012, w / 2 + 0.012, 0.02, 36), baseMat('dark'), h / 2); add(new THREE.CylinderGeometry(w / 2 + 0.012, w / 2 + 0.012, 0.02, 36), baseMat('dark'), -h / 2); break; }
      case 'horn': {
        const hm = baseMat('alu'); hm.side = THREE.DoubleSide;
        const horn = add(new THREE.CylinderGeometry(w / 2, 0.05, d, 40, 1, true), hm); horn.rotation.x = Math.PI / 2;
        const lip = add(new THREE.TorusGeometry(w / 2, 0.008, 8, 40), baseMat('dark')); lip.position.z = d / 2;
        const throat = add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 20), baseMat('dark')); throat.rotation.x = Math.PI / 2; throat.position.z = -d / 2 - 0.05;
        baseY = 0.02;
        break;
      }
      case 'camera': {
        add(new RoundedBoxGeometry(w * 0.7, h * 0.4, d * 0.7, 2, 0.01), baseMat('alu', true), -h * 0.3);
        const bm = baseMat('dark'); bm.side = THREE.DoubleSide;
        const tilt = p.u < -0.1 ? 0.6 : p.u > 0.1 ? -0.6 : 0;
        const baffle = add(new THREE.CylinderGeometry(w * 0.48, w * 0.26, h * 0.62, 28, 1, true), bm, h * 0.12);
        baffle.rotation.z = tilt; baffle.position.x = -tilt * 0.08;
        // faint cone of view (effect, shown when open)
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.5, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0x8fc8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        cone.geometry.rotateX(Math.PI); cone.geometry.translate(0, 0.75, 0); // apex at the camera, opening upward
        cone.rotation.z = tilt; cone.position.set(-tilt * 0.08, h * 0.4, 0); g.add(cone); camCones.push(cone);
        break;
      }
      case 'accel': {
        add(new RoundedBoxGeometry(w, h * 0.7, d, 3, 0.02), baseMat('alu', true), -h * 0.15);
        add(new THREE.CylinderGeometry(w * 0.36, w * 0.36, h * 0.5, 40, 1, true), (() => { const m = baseMat('gold'); m.side = THREE.DoubleSide; m.transparent = true; m.opacity = 0.55; return m; })(), h * 0.3);
        add(new THREE.TorusGeometry(w * 0.36, 0.008, 8, 40), baseMat('gold'), h * 0.55).rotation.x = Math.PI / 2;
        proof = add(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: 0xe9eef5, metalness: 1, roughness: 0.12 }), h * 0.32);
        break;
      }
      case 'tma': {
        const tube = add(new THREE.CylinderGeometry(0.035, 0.035, w, 20), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.3 })); tube.rotation.z = Math.PI / 2;
        [-1, 1].forEach((s) => { const mir = add(new THREE.OctahedronGeometry(0.075), new THREE.MeshStandardMaterial({ color: 0xa8dcf0, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.8 })); mir.position.x = (s * w) / 2; });
        baseY = FLOOR + 0.36;
        break;
      }
      case 'reflector': {
        const pyr = add(new THREE.ConeGeometry(w / 2, h, 4), new THREE.MeshStandardMaterial({ color: 0xcfe8f5, metalness: 0.4, roughness: 0.1 })); pyr.rotation.x = Math.PI;
        baseY = FLOOR - h / 2 - 0.005;
        break;
      }
    }
    const home = new THREE.Vector3(xOf(p.u), baseY, zOf(p.v));
    const rank = GROUPS.indexOf(p.group);
    const out = p.shape === 'reflector' ? home.clone().add(new THREE.Vector3(0, -0.75, 0))
      : p.shape === 'horn' ? home.clone().add(new THREE.Vector3(0, 0.2, 0.6))
      : new THREE.Vector3(home.x * 1.55, home.y + 0.6 + rank * 0.19, home.z * 1.18);
    g.position.copy(home); root.add(g);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([home.clone(), home.clone()]), leaderMat); root.add(line);
    const mats: Built['mats'] = [];
    g.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && m.isMeshStandardMaterial) mats.push({ m, base: m.color.clone() }); });
    built.push({ part: p, obj: g, home, out, line, mats });
  }
  const byId = (id: string) => built.find((b) => b.part.id === id)!;

  // cable looms on the platform (stay behind when the units lift)
  {
    const cm = new THREE.MeshStandardMaterial({ color: 0x1b1e24, metalness: 0.2, roughness: 0.7 });
    const y = FLOOR + 0.055;
    ([['horn', 'mwa'], ['mwa', 'ipu1'], ['mwa', 'ipu2'], ['uso1', 'ipu2'], ['uso2', 'ipu1'], ['acc', 'icu'], ['laser', 'bench'], ['bench', 'cavity'], ['lrp', 'acc'],
      ['pdu', 'pcu'], ['pcu', 'battery'], ['obc', 'rfea'], ['obc', 'pdu'], ['gyro', 'pcu']] as [string, string][]).forEach(([a, b], k) => {
      const A = byId(a).home, B = byId(b).home;
      const mid = new THREE.Vector3((A.x + B.x) / 2 + (k % 2 ? 0.07 : -0.07), y, (A.z + B.z) / 2 + (k % 3 ? 0.05 : -0.05));
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(A.x, y, A.z), mid, new THREE.Vector3(B.x, y, B.z)]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.011, 6), cm); tube.receiveShadow = full; root.add(tube);
    });
  }

  // ---- live effects (fade in once the satellite is open)
  const fxState = { a: 0 };
  const ringMat = () => new THREE.MeshBasicMaterial({ color: 0x7fd0ee, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  const rings = [0, 1, 2].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.13, 0.15, 48), ringMat()); root.add(r); return r; });
  const beamMat = new LineMaterial({ color: 0xff4a3d, linewidth: 2.4, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamGeo = new LineGeometry(); beamGeo.setPositions(new Array(15).fill(0));
  const beam = new Line2(beamGeo, beamMat); beam.frustumCulled = false; root.add(beam);
  const beamInGeo = new LineGeometry(); beamInGeo.setPositions(new Array(9).fill(0));
  const beamIn = new Line2(beamInGeo, beamMat); beamIn.frustumCulled = false; root.add(beamIn);
  // cold-gas puffs on the side faces (positions approximate: "two on each of the six sides")
  const puffTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d')!; const gr = c.createRadialGradient(32, 32, 1, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
  const puffs = ([[-1, 0.9], [-1, -0.9], [1, 0.9], [1, -0.9]] as [number, number][]).map(([sx, z]) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    sp.position.set(sx * (halfW + 0.02), FLOOR + 0.06, z); root.add(sp);
    return { sp, sx, t: 9, next: 0.6 + Math.random() * 2 };
  });

  // ---- the opening timeline (progress 0 = closed, 1 = open)
  const cam = { dist: 7, ty: 0.1, spin: 0.16 };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } });
  const T = OPEN_SECONDS;
  tl.to(cam, { dist: 4.7, ty: 0.05, spin: 0.02, duration: 0.7 }, 0);
  tl.to(root.position, { y: 0.035, duration: 0.07, ease: 'power1.out' }, 0.62).to(root.position, { y: 0, duration: 0.3, ease: 'elastic.out(1.2, 0.3)' }, 0.69); // unlatch jolt
  if (pieces.port) {
    tl.to(pieces.front.pivot.position, { z: 1.25, y: 0.12, duration: 0.9 }, 0.75);
    tl.to(pieces.rear.pivot.position, { z: -1.05, y: 0.12, duration: 0.9 }, 0.8);
    tl.to(pieces.port.pivot.rotation, { z: 1.2, duration: 1.15, ease: 'back.out(1.1)' }, 0.95);
    tl.to(pieces.port.pivot.position, { x: -halfW - 0.3, duration: 1.0 }, 0.95);
    tl.to(pieces.star.pivot.rotation, { z: -1.2, duration: 1.15, ease: 'back.out(1.1)' }, 1.05);
    tl.to(pieces.star.pivot.position, { x: halfW + 0.3, duration: 1.0 }, 1.05);
  }
  tl.to(sweep, { intensity: 16, duration: 0.25, ease: 'power1.in' }, 1.5).to(sweep.position, { z: -1.7, duration: 0.8, ease: 'none' }, 1.5).to(sweep, { intensity: 0, duration: 0.3 }, 2.15);
  [...built].sort((a, b) => a.part.v - b.part.v).forEach((b, k) => {
    const t0 = 1.75 + k * 0.058;
    tl.to(b.obj.position, { x: b.out.x, y: b.out.y, z: b.out.z, duration: 0.85, ease: 'back.out(1.6)' }, t0);
    tl.to(b.obj.rotation, { y: (k % 2 ? 0.55 : -0.55), duration: 0.4, ease: 'power2.out' }, t0).to(b.obj.rotation, { y: 0, duration: 0.7, ease: 'elastic.out(1, 0.55)' }, t0 + 0.4);
  });
  tl.to(leaderMat, { opacity: 0.5, duration: 0.5 }, 2.6);
  tl.to(cam, { dist: 10.6, ty: 0.55, spin: 0.09, duration: 1.5 }, 2.5);
  tl.to(fxState, { a: 1, duration: 0.5, ease: 'none' }, T - 0.5);
  tl.duration(); // build

  let open = false, manual = false, selected: Built | null = null;
  const publish = () => { (window as unknown as { __inside: unknown }).__inside = { open, parts: PARTS.length, selected: selected?.part.id ?? null, progress: tl.progress() }; };
  const setLabel = () => { toggle.textContent = open ? 'Put it back together' : 'Take it apart'; toggle.setAttribute('aria-pressed', String(open)); };
  let progTween: gsap.core.Tween | null = null;
  function setOpen(on: boolean, byUser = true) {
    if (byUser) manual = true;
    open = on; setLabel();
    progTween?.kill();
    if (reduced) tl.progress(on ? 1 : 0);
    else progTween = gsap.to(tl, { progress: on ? 1 : 0, duration: Math.max(0.3, Math.abs((on ? 1 : 0) - tl.progress()) * (on ? T : T * 0.55)), ease: 'none', onUpdate: () => { dirty = true; } });
    if (!on) pick(null);
    publish(); dirty = true;
  }
  toggle.addEventListener('click', () => setOpen(!open));

  // ---- select and focus
  const focus = { x: 0, y: 0, z: 0, k: 0 };
  const ACCENT = new THREE.Color(0x2aa7e0);
  function pick(b: Built | null) {
    selected = b;
    built.forEach((x) => x.mats.forEach(({ m, base }) => {
      m.color.copy(base).multiplyScalar(b && x !== b ? 0.3 : 1); m.envMapIntensity = b && x !== b ? 0.2 : 1;
      m.emissive.copy(x === b ? ACCENT : new THREE.Color(0)); m.emissiveIntensity = x === b ? 0.5 : 0;
    }));
    onPick(b ? b.part : null);
    label.textContent = b ? b.part.name : '';
    gsap.killTweensOf(focus);
    if (b) gsap.to(focus, { x: b.out.x, y: b.out.y, z: b.out.z, k: 1, duration: reduced ? 0.01 : 0.9, ease: 'power3.inOut', onUpdate: () => { dirty = true; } });
    else gsap.to(focus, { k: 0, duration: reduced ? 0.01 : 0.7, ease: 'power2.inOut', onUpdate: () => { dirty = true; } });
    if (b && !reduced) gsap.fromTo(b.obj.scale, { x: 1.22, y: 1.22, z: 1.22 }, { x: 1, y: 1, z: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
    publish(); dirty = true;
  }

  // ---- camera: turntable in the page, free orbit in full screen
  let yaw = 0.75, exploring = false, idle = 0, dragX: number | null = null, portraitK = 1;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 16; controls.enabled = false;
  controls.addEventListener('change', () => { dirty = true; });
  canvas.style.touchAction = 'pan-y';
  const tgt = new THREE.Vector3();
  const setCam = () => {
    const d = (cam.dist + (4.3 - cam.dist) * focus.k) * portraitK;
    tgt.set(focus.x * focus.k, cam.ty + (focus.y - cam.ty) * focus.k, focus.z * focus.k);
    camera.position.set(tgt.x + Math.sin(yaw) * d, tgt.y + d * 0.4, tgt.z + Math.cos(yaw) * d);
    camera.lookAt(tgt);
  };
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; if (!exploring) { dragX = e.clientX; idle = 6; } });
  window.addEventListener('pointermove', (e) => { if (dragX === null || exploring) return; yaw -= (e.clientX - dragX) * 0.008; dragX = e.clientX; dirty = true; });
  window.addEventListener('pointerup', () => { dragX = null; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!open) { setOpen(true); return; }
    const hit = ray.intersectObjects(built.map((b) => b.obj), true)[0];
    if (!hit) { pick(null); return; }
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.partId) o = o.parent;
    pick(built.find((b) => b.obj === o) ?? null);
  });
  function setExplore(on: boolean) {
    exploring = on; if (on) manual = true;
    ui.classList.toggle('fullscreen', on); document.body.classList.toggle('noscroll', on);
    controls.enabled = on; canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.hidden = on; closeBtn.hidden = !on;
    if (on) { setCam(); controls.target.copy(tgt); controls.update(); }
    requestAnimationFrame(resize);
    if (on) closeBtn.focus(); else explore.focus();
  }
  explore.addEventListener('click', () => setExplore(true));
  closeBtn.addEventListener('click', () => setExplore(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && exploring) setExplore(false); });

  const lineMats = [beamMat];
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; portraitK = w < h ? Math.min(1.9, 0.86 / Math.max(0.45, w / h)) : 1; camera.updateProjectionMatrix();
    lineMats.forEach((m) => m.resolution.set(w, h)); dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- scrolling through the section plays the opening, until the visitor takes over
  let visible = false;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (!visible && !exploring) manual = false; dirty = true; }, { threshold: 0.02 }).observe(stage);
  if (!reduced) {
    ScrollTrigger.create({
      trigger: stage, start: 'top 80%', end: 'top 24%', scrub: 0.6,
      onUpdate: (s) => {
        if (manual || exploring) return;
        progTween?.kill(); tl.progress(s.progress);
        const nowOpen = s.progress > 0.6;
        if (nowOpen !== open) { open = nowOpen; setLabel(); if (!open) pick(null); }
        publish(); dirty = true;
      },
    });
  }

  // ---- frame loop
  const q = new THREE.Vector3(), a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), lightDir = new THREE.Vector3();
  let last = performance.now(), tt = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    tt += dt;
    const fx = fxState.a;
    if (exploring) controls.update();
    else {
      if (idle > 0) idle -= dt; else if (!reduced && dragX === null && focus.k < 0.5) { yaw += dt * cam.spin; dirty = true; }
      setCam();
    }
    if (fx > 0.01 && !reduced) dirty = true;
    if (tl.progress() > 0 && tl.progress() < 1) dirty = true;
    if (!dirty) return;
    // key light circles slowly so metal and foil catch moving highlights
    lightDir.set(Math.sin(tt * 0.18 + 0.6) * 5, 6.5, Math.cos(tt * 0.18 + 0.6) * 5);
    keyL.position.copy(lightDir);
    built.forEach((b) => { const at = b.line.geometry.attributes.position as THREE.BufferAttribute; at.setXYZ(1, b.obj.position.x, b.obj.position.y, b.obj.position.z); at.needsUpdate = true; });
    // effects
    const horn = byId('horn').obj.position;
    rings.forEach((r, k) => {
      const f = (tt * 0.55 + k / 3) % 1;
      r.position.set(horn.x, horn.y, horn.z + 0.2 + f * 1.7); r.scale.setScalar(1 + f * 2.4);
      (r.material as THREE.MeshBasicMaterial).opacity = fx * (1 - f) * 0.75;
    });
    const tma = byId('tma').obj.position, bench = byId('bench').obj.position, laser = byId('laser').obj.position;
    a3.set(tma.x + 0.6, tma.y, tma.z); b3.set(tma.x - 0.6, tma.y, tma.z);
    beamGeo.setPositions([laser.x, laser.y, laser.z, bench.x, bench.y, bench.z, a3.x, a3.y, a3.z, b3.x, b3.y, b3.z, b3.x, b3.y, b3.z + 3.4]);
    beamInGeo.setPositions([a3.x, a3.y, a3.z + 3.4, a3.x, a3.y, a3.z, a3.x, a3.y, a3.z]);
    beamMat.opacity = fx * (0.78 + 0.22 * Math.sin(tt * 11));
    if (proof) { proof.position.x = 0.007 * Math.sin(tt * 7.3) * fx; proof.position.z = 0.007 * Math.cos(tt * 5.1) * fx; proof.rotation.y = tt * 0.6; }
    camCones.forEach((c, k) => { (c.material as THREE.MeshBasicMaterial).opacity = fx * (0.07 + 0.035 * Math.sin(tt * 1.3 + k * 2)); });
    puffs.forEach((pf) => {
      pf.next -= dt;
      if (pf.next <= 0 && fx > 0.9) { pf.t = 0; pf.next = 1.4 + Math.random() * 3.2; }
      pf.t += dt;
      const f = Math.min(1, pf.t / 0.55);
      pf.sp.material.opacity = f < 1 ? fx * 0.6 * (1 - f) : 0;
      pf.sp.scale.setScalar(0.06 + f * 0.34); pf.sp.position.x = pf.sx * (halfW + 0.02 + f * 0.2);
    });
    updateClips();
    renderer.render(scene, camera); dirty = false;
    publish();
    if (selected) {
      q.copy(selected.obj.position).add(new THREE.Vector3(0, 0.32, 0)).project(camera);
      label.style.opacity = '1';
      label.style.transform = `translate(${((q.x + 1) / 2) * stage.clientWidth}px, ${((1 - q.y) / 2) * stage.clientHeight - 10}px) translate(-50%, -100%)`;
    } else label.style.opacity = '0';
  };
  setLabel(); publish();
  requestAnimationFrame(loop);

  return {
    select(id) {
      if (id === null) { pick(null); return; }
      if (!open) setOpen(true);
      pick(built.find((b) => b.part.id === id) ?? null);
      if (!exploring && stage.getBoundingClientRect().top < -40) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    },
  };
}
