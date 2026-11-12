// "Inside GRACE-FO": tap the satellite and it comes apart.
// The interior is a reconstruction: unit positions and footprints are traced from the
// Airbus DS layout diagram in NASA/JPL's GRACE-FO press kit and scaled to the press-kit
// dimensions (3.123 m long, 1.943 m wide at the bottom, 0.78 m high). Unit heights and
// fine shapes are estimated. The outer shell is NASA's own 3D model.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { url } from './data';

const PRESS_KIT = 'https://www.jpl.nasa.gov/news/press_kits/grace-fo/mission/spacecraft/';
export const SAT_DIMS = { length: 3.123, widthBottom: 1.943, widthTop: 0.69, height: 0.78, massKg: 600.2 };

type Shape = 'box' | 'tank' | 'cyl' | 'horn' | 'camera' | 'accel' | 'tma' | 'reflector';
interface Part {
  id: string; name: string; group: string; shape: Shape;
  /** diagram coordinates: u = across (-1 port .. +1 starboard), v = along (0 front .. 1 rear) */
  u: number; v: number; size: [number, number, number]; mat: keyof typeof MATS;
  built: string; does: string;
}
const MATS = {
  alu: { color: 0xb9bdc4, metalness: 0.85, roughness: 0.38 },
  dark: { color: 0x30343b, metalness: 0.55, roughness: 0.5 },
  gold: { color: 0xc8962c, metalness: 1.0, roughness: 0.32 },
  white: { color: 0xe4e3dc, metalness: 0.05, roughness: 0.6 },
  copper: { color: 0xb5713a, metalness: 0.9, roughness: 0.4 },
  blue: { color: 0x2f5d8a, metalness: 0.5, roughness: 0.45 },
};
const GROUPS = ['Ranging', 'Laser link', 'Accelerometer', 'Attitude', 'Propulsion', 'Power', 'Data and radio'];

// Positions read off the Airbus DS diagram (top view, front of the satellite at v = 0).
export const PARTS: Part[] = [
  { id: 'horn', name: 'K/Ka-band ranging horn', group: 'Ranging', shape: 'horn', u: 0, v: 0.02, size: [0.3, 0.3, 0.34], mat: 'alu', built: 'Microwave assembly: SSL, USA',
    does: 'Sends and receives microwave signals at 24 GHz (K-band) and 32 GHz (Ka-band) to the other satellite. From these the pair tracks changes in their separation to about one micron. Two frequencies are used so the effect of the ionosphere can be corrected.' },
  { id: 'mwa', name: 'Microwave assembly', group: 'Ranging', shape: 'box', u: 0, v: 0.12, size: [0.26, 0.14, 0.2], mat: 'dark', built: 'SSL, USA',
    does: 'The radio-frequency front end of the ranging instrument: waveguide feeds and redundant transceivers that connect to the horn.' },
  { id: 'uso1', name: 'Ultra-stable oscillator', group: 'Ranging', shape: 'box', u: -0.56, v: 0.06, size: [0.24, 0.14, 0.14], mat: 'copper', built: 'Johns Hopkins APL, USA',
    does: 'One of a redundant pair. It is the frequency and clock reference for the ranging measurement, so the whole experiment depends on its stability.' },
  { id: 'uso2', name: 'Ultra-stable oscillator (spare)', group: 'Ranging', shape: 'box', u: 0.58, v: 0.06, size: [0.24, 0.14, 0.14], mat: 'copper', built: 'Johns Hopkins APL, USA',
    does: 'The second of the redundant pair of frequency references.' },
  { id: 'ipu1', name: 'Instrument processing unit', group: 'Ranging', shape: 'box', u: 0.58, v: 0.145, size: [0.28, 0.2, 0.26], mat: 'blue', built: 'JPL, USA',
    does: 'Does the digital signal processing for the K/Ka-band ranging and GPS signals, and provides timing.' },
  { id: 'ipu2', name: 'Instrument processing unit (second)', group: 'Ranging', shape: 'box', u: -0.45, v: 0.145, size: [0.28, 0.2, 0.26], mat: 'blue', built: 'JPL, USA',
    does: 'The matching unit on the port side of the diagram.' },

  { id: 'laser', name: 'Laser', group: 'Laser link', shape: 'box', u: 0.5, v: 0.25, size: [0.32, 0.12, 0.18], mat: 'gold', built: 'Tesat, Germany',
    does: 'Emits about 25 mW of infrared light at 1064 nm for the laser ranging interferometer, an experimental instrument that could improve ranging precision by at least ten times.' },
  { id: 'bench', name: 'Optical bench and electronics', group: 'Laser link', shape: 'box', u: 0.28, v: 0.3, size: [0.2, 0.1, 0.16], mat: 'alu', built: 'AEI / DLR / STI, Germany',
    does: 'Routes, detects and points the laser beams, using a steering mirror and photoreceivers.' },
  { id: 'cavity', name: 'Laser reference cavity', group: 'Laser link', shape: 'cyl', u: 0.6, v: 0.37, size: [0.17, 0.26, 0.17], mat: 'alu', built: 'Ball Aerospace, USA',
    does: 'An optical cavity that stabilises the wavelength of the laser, so that tiny changes in distance are not confused with changes in the light itself.' },
  { id: 'lrp', name: 'Laser ranging processor', group: 'Laser link', shape: 'box', u: -0.44, v: 0.26, size: [0.15, 0.2, 0.26], mat: 'gold', built: 'JPL, USA',
    does: 'Measures the phase of the laser interferometer, controls the laser frequency, steers the mirror and establishes the optical link.' },
  { id: 'tma', name: 'Triple mirror assembly', group: 'Laser link', shape: 'tma', u: 0.05, v: 0.42, size: [1.2, 0.1, 0.1], mat: 'alu', built: 'AEI / STI, Germany',
    does: 'Three mirrors arranged like the corner of a cube. They carry the laser beam around the microwave instrument and send it back exactly parallel to the incoming beam.' },

  { id: 'acc', name: 'Accelerometer', group: 'Accelerometer', shape: 'accel', u: 0.04, v: 0.42, size: [0.3, 0.26, 0.3], mat: 'gold', built: 'ONERA, France',
    does: 'A three-axis electrostatic accelerometer placed at the centre of gravity. It measures the forces that are not gravity, such as air drag and sunlight pressure, so they can be separated from the gravity signal.' },
  { id: 'icu', name: 'Accelerometer control unit', group: 'Accelerometer', shape: 'box', u: -0.5, v: 0.37, size: [0.18, 0.18, 0.32], mat: 'white', built: 'ONERA, France',
    does: 'The electronics that operate the accelerometer and read out its measurements.' },

  { id: 'cam1', name: 'Star camera', group: 'Attitude', shape: 'camera', u: -0.52, v: 0.655, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'One of three camera heads that find the satellite’s orientation by tracking the stars.' },
  { id: 'cam2', name: 'Star camera', group: 'Attitude', shape: 'camera', u: 0.6, v: 0.655, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'The second of three star camera heads.' },
  { id: 'cam3', name: 'Star camera', group: 'Attitude', shape: 'camera', u: 0, v: 0.585, size: [0.2, 0.24, 0.2], mat: 'dark', built: 'Technical University of Denmark',
    does: 'The third star camera head. The original GRACE satellites had two.' },
  { id: 'gyro', name: 'Gyro unit', group: 'Attitude', shape: 'box', u: 0.6, v: 0.74, size: [0.16, 0.14, 0.16], mat: 'copper', built: 'Astrium SAS, France',
    does: 'Provides rotation-rate information on three axes.' },

  { id: 'tank1', name: 'Nitrogen tank', group: 'Propulsion', shape: 'tank', u: 0.04, v: 0.31, size: [0.5, 0.5, 0.5], mat: 'gold', built: 'Part of the cold-gas system',
    does: 'Holds part of the 31.3 kg of nitrogen gas used by the cold-gas thrusters: twelve small ones for pointing and two on the rear panel for adjusting the orbit.' },
  { id: 'tank2', name: 'Nitrogen tank', group: 'Propulsion', shape: 'tank', u: 0.04, v: 0.69, size: [0.5, 0.5, 0.5], mat: 'gold', built: 'Part of the cold-gas system',
    does: 'The second nitrogen tank. In the layout diagram the two tanks sit in front of and behind the accelerometer.' },

  { id: 'pdu', name: 'Power distribution unit', group: 'Power', shape: 'box', u: -0.38, v: 0.55, size: [0.34, 0.2, 0.3], mat: 'alu', built: 'Airbus, Germany',
    does: 'Part of the power system. Solar cells covering the top and sides of the satellite supply about 355 W on average.' },
  { id: 'pcu', name: 'Power conditioning unit', group: 'Power', shape: 'box', u: 0.48, v: 0.55, size: [0.34, 0.2, 0.3], mat: 'alu', built: 'Airbus, Germany',
    does: 'Part of the power system, built by Airbus together with the power distribution unit.' },
  { id: 'battery', name: 'Battery', group: 'Power', shape: 'box', u: 0.5, v: 0.885, size: [0.32, 0.22, 0.4], mat: 'white', built: 'ABSL, England',
    does: 'A 78 Ah lithium-ion battery that stores surplus energy from the solar panels.' },

  { id: 'obc', name: 'On-board computer', group: 'Data and radio', shape: 'box', u: -0.2, v: 0.885, size: [0.74, 0.2, 0.4], mat: 'dark', built: 'TASI, Italy',
    does: 'The central processor. It manages science and housekeeping data and detects and recovers from faults.' },
  { id: 'rfea', name: 'Radio electronics', group: 'Data and radio', shape: 'box', u: -0.44, v: 0.735, size: [0.2, 0.16, 0.22], mat: 'blue', built: 'STT, Germany',
    does: 'The S-band radio, with two redundant transceivers, that links the satellite to ground stations.' },
  { id: 'lrr', name: 'Laser retro-reflector', group: 'Data and radio', shape: 'reflector', u: 0, v: 0.5, size: [0.12, 0.08, 0.12], mat: 'alu', built: 'GFZ, Germany',
    does: 'Four corner-cube prisms in a small pyramid on the underside. Ground stations bounce laser pulses off it to check the orbit independently.' },
];

export async function initInside(tier: 'full' | 'lite' | 'static'): Promise<void> {
  const list = document.getElementById('inside-list')!;
  const card = document.getElementById('inside-card')!;
  const showCard = (p: Part | null) => {
    card.innerHTML = p
      ? `<p class="card-tag">${p.group}</p><h3>${p.name}</h3><p>${p.does}</p><p class="small muted">Built by: ${p.built}. Source: <a href="${PRESS_KIT}" rel="noopener">NASA/JPL GRACE-FO press kit</a>.</p>`
      : '<p class="card-tag">How to use</p><h3>Tap the satellite to open it</h3><p>Then tap any unit, or a name in the list, to see what it does.</p>';
    list.querySelectorAll('button').forEach((b) => b.classList.toggle('on', !!p && b.dataset.id === p.id));
  };
  // list of parts, grouped (works without 3D too)
  GROUPS.forEach((g) => {
    const row = document.createElement('div'); row.className = 'inside-group';
    row.innerHTML = `<span class="inside-gname">${g}</span>`;
    PARTS.filter((p) => p.group === g).forEach((p) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.id = p.id; b.textContent = p.name;
      b.addEventListener('click', () => select(p.id));
      row.appendChild(b);
    });
    list.appendChild(row);
  });
  let select = (id: string) => showCard(PARTS.find((p) => p.id === id) ?? null);
  showCard(null);
  if (tier === 'static') { document.getElementById('inside-fallback')!.hidden = false; return; }

  const ui = document.getElementById('inside-ui')!, stage = document.getElementById('inside-stage')!;
  const canvas = document.getElementById('inside-canvas') as HTMLCanvasElement;
  const toggle = document.getElementById('inside-toggle') as HTMLButtonElement;
  const explore = document.getElementById('inside-explore') as HTMLButtonElement, closeBtn = document.getElementById('inside-close') as HTMLButtonElement;
  const label = document.getElementById('inside-label')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  renderer.setClearColor(0x0a1220, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const [{ GLTFLoader }, { MeshoptDecoder }, { RoomEnvironment }, { gsap }] = await Promise.all([
    import('three/examples/jsm/loaders/GLTFLoader.js'), import('three/examples/jsm/libs/meshopt_decoder.module.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'), import('gsap'),
  ]);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environmentIntensity = 1.1;
  const keyL = new THREE.DirectionalLight(0xffffff, 2.2); keyL.position.set(3, 6, 4); scene.add(keyL);
  const rim = new THREE.DirectionalLight(0x8fb8ff, 1.2); rim.position.set(-4, 2, -5); scene.add(rim);

  const root = new THREE.Group(); scene.add(root);
  const D = SAT_DIMS, FLOOR = -D.height / 2;
  const mats = Object.fromEntries(Object.entries(MATS).map(([k, v]) => [k, new THREE.MeshStandardMaterial(v)])) as Record<keyof typeof MATS, THREE.MeshStandardMaterial>;

  // equipment platform (carbon-fibre panel) with the satellite's trapezoid footprint
  const plate = new THREE.Mesh(new RoundedBoxGeometry(D.widthBottom - 0.08, 0.035, D.length - 0.06, 3, 0.012), new THREE.MeshStandardMaterial({ color: 0x15181d, metalness: 0.3, roughness: 0.55 }));
  plate.position.y = FLOOR + 0.02; root.add(plate);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(D.widthBottom - 0.08, 0.035, D.length - 0.06)), new THREE.LineBasicMaterial({ color: 0x4b5563 }));
  frame.position.copy(plate.position); root.add(frame);

  // NASA's shell
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const shell = new THREE.Group(); root.add(shell);
  const shellMats: THREE.Material[] = [];
  try {
    const gltf = await loader.loadAsync(url('models/grace-fo.glb'));
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const arr = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => { const c = x.clone(); c.transparent = true; shellMats.push(c); return c; });
      m.material = Array.isArray(m.material) ? arr : arr[0];
    });
    gltf.scene.scale.setScalar(D.length / 3.254); // model length to the press-kit length
    shell.add(gltf.scene);
  } catch (e) { console.warn('NASA shell not loaded', e); }

  // ---- build the units
  const xOf = (u: number) => u * 0.8, zOf = (v: number) => (0.5 - v) * (D.length - 0.25);
  interface Built { part: Part; obj: THREE.Group; home: THREE.Vector3; out: THREE.Vector3; line: THREE.Line; meshes: THREE.Mesh[] }
  const built: Built[] = [];
  const leaderMat = new THREE.LineBasicMaterial({ color: 0x7fd0ee, transparent: true, opacity: 0 });
  for (const p of PARTS) {
    const g = new THREE.Group(); g.userData.partId = p.id;
    const [w, h, d] = p.size; const m = mats[p.mat];
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material = m, y = 0) => { const mesh = new THREE.Mesh(geo, mat); mesh.position.y = y; g.add(mesh); return mesh; };
    let baseY = FLOOR + 0.04 + h / 2;
    switch (p.shape) {
      case 'box': {
        add(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.08));
        const lid = add(new RoundedBoxGeometry(w * 0.86, 0.012, d * 0.86, 2, 0.004), mats.dark, h / 2 + 0.004); void lid;
        // connector row for a machined-box look
        for (let k = 0; k < 3; k++) { const c = add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 10), mats.alu); c.rotation.x = Math.PI / 2; c.position.set(-w * 0.25 + k * w * 0.25, 0, d / 2 + 0.012); }
        break;
      }
      case 'tank': {
        add(new THREE.SphereGeometry(w / 2, 40, 28));
        const band = add(new THREE.TorusGeometry(w / 2 + 0.004, 0.012, 8, 48), mats.alu); band.rotation.x = Math.PI / 2;
        const cradle = add(new THREE.CylinderGeometry(w * 0.28, w * 0.34, 0.06, 24), mats.dark, -h / 2 + 0.02); void cradle;
        break;
      }
      case 'cyl': { add(new THREE.CylinderGeometry(w / 2, w / 2, h, 32)); add(new THREE.CylinderGeometry(w / 2 + 0.012, w / 2 + 0.012, 0.02, 32), mats.dark, h / 2); add(new THREE.CylinderGeometry(w / 2 + 0.012, w / 2 + 0.012, 0.02, 32), mats.dark, -h / 2); break; }
      case 'horn': {
        const horn = add(new THREE.CylinderGeometry(w / 2, 0.05, d, 36, 1, true), new THREE.MeshStandardMaterial({ ...MATS.alu, side: THREE.DoubleSide }));
        horn.rotation.x = Math.PI / 2; // opens towards +z (the other satellite)
        const throat = add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 20), mats.dark); throat.rotation.x = Math.PI / 2; throat.position.z = -d / 2 - 0.05;
        baseY = 0.02;
        break;
      }
      case 'camera': {
        const body = add(new RoundedBoxGeometry(w * 0.7, h * 0.4, d * 0.7, 2, 0.01), mats.alu, -h * 0.3); void body;
        const baffle = add(new THREE.CylinderGeometry(w * 0.48, w * 0.26, h * 0.62, 28, 1, true), new THREE.MeshStandardMaterial({ ...MATS.dark, side: THREE.DoubleSide }), h * 0.12);
        baffle.rotation.z = p.u < -0.1 ? 0.6 : p.u > 0.1 ? -0.6 : 0; baffle.position.x = p.u < -0.1 ? -0.05 : p.u > 0.1 ? 0.05 : 0;
        break;
      }
      case 'accel': {
        add(new RoundedBoxGeometry(w, h * 0.7, d, 3, 0.02), mats.alu, -h * 0.15);
        add(new THREE.CylinderGeometry(w * 0.36, w * 0.36, h * 0.5, 36), mats.gold, h * 0.3);
        add(new THREE.CylinderGeometry(w * 0.2, w * 0.2, h * 0.56, 36), mats.dark, h * 0.3);
        add(new THREE.BoxGeometry(0.04, 0.04, 0.04), new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 1, roughness: 0.15 }), h * 0.6); // proof mass (symbolic)
        break;
      }
      case 'tma': {
        const tube = add(new THREE.CylinderGeometry(0.035, 0.035, w, 20), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: 0.7, roughness: 0.3 })); tube.rotation.z = Math.PI / 2;
        const glass = new THREE.MeshStandardMaterial({ color: 0xa8dcf0, metalness: 0.3, roughness: 0.05, transparent: true, opacity: 0.75 });
        [-1, 1].forEach((s) => { const mir = add(new THREE.OctahedronGeometry(0.075), glass); mir.position.x = (s * w) / 2; });
        baseY = FLOOR + 0.36;
        break;
      }
      case 'reflector': {
        const pyr = add(new THREE.ConeGeometry(w / 2, h, 4), new THREE.MeshStandardMaterial({ color: 0xcfe8f5, metalness: 0.4, roughness: 0.1 })); pyr.rotation.x = Math.PI;
        baseY = FLOOR - h / 2 - 0.005; // on the underside
        break;
      }
    }
    const home = new THREE.Vector3(xOf(p.u), baseY, zOf(p.v));
    const rank = GROUPS.indexOf(p.group);
    const out = p.shape === 'reflector'
      ? home.clone().add(new THREE.Vector3(0, -0.7, 0))
      : p.shape === 'horn' ? home.clone().add(new THREE.Vector3(0, 0.15, 0.9))
      : new THREE.Vector3(home.x * 1.75, home.y + 0.55 + rank * 0.2, home.z * 1.22);
    g.position.copy(home);
    root.add(g);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([home.clone(), home.clone()]), leaderMat);
    root.add(line);
    const meshes: THREE.Mesh[] = []; g.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    meshes.forEach((mm) => { mm.material = (mm.material as THREE.Material).clone(); });
    built.push({ part: p, obj: g, home, out, line, meshes });
  }

  // ---- take apart / put back
  let dirty = true, open = false, selected: Built | null = null;
  const st = { shell: 0 }; // 0 closed .. 1 lifted
  const applyShell = () => {
    shell.position.y = st.shell * 1.55;
    shellMats.forEach((m) => { m.opacity = 1 - 0.86 * st.shell; m.depthWrite = st.shell < 0.5; });
    dirty = true;
  };
  const setLine = (b: Built) => { const a = b.line.geometry.attributes.position as THREE.BufferAttribute; a.setXYZ(1, b.obj.position.x, b.obj.position.y, b.obj.position.z); a.needsUpdate = true; };
  function setOpen(on: boolean) {
    open = on;
    toggle.textContent = on ? 'Put it back together' : 'Take it apart';
    toggle.setAttribute('aria-pressed', String(on));
    gsap.killTweensOf(st); built.forEach((b) => gsap.killTweensOf(b.obj.position));
    const dur = reduced ? 0.01 : 1;
    if (on) {
      gsap.to(st, { shell: 1, duration: 1.1 * dur, ease: 'power3.inOut', onUpdate: applyShell });
      built.forEach((b, k) => gsap.to(b.obj.position, {
        x: b.out.x, y: b.out.y, z: b.out.z, duration: 0.95 * dur, delay: (0.55 + GROUPS.indexOf(b.part.group) * 0.13 + (k % 4) * 0.035) * dur,
        ease: 'back.out(1.5)', onUpdate: () => { setLine(b); dirty = true; },
      }));
      gsap.to(leaderMat, { opacity: 0.55, duration: 0.6 * dur, delay: 0.9 * dur, onUpdate: () => { dirty = true; } });
    } else {
      gsap.to(leaderMat, { opacity: 0, duration: 0.3 * dur, onUpdate: () => { dirty = true; } });
      built.forEach((b, k) => gsap.to(b.obj.position, {
        x: b.home.x, y: b.home.y, z: b.home.z, duration: 0.7 * dur, delay: ((GROUPS.length - GROUPS.indexOf(b.part.group)) * 0.07 + (k % 4) * 0.02) * dur,
        ease: 'power2.inOut', onUpdate: () => { setLine(b); dirty = true; },
      }));
      gsap.to(st, { shell: 0, duration: 0.9 * dur, delay: 0.75 * dur, ease: 'power3.inOut', onUpdate: applyShell });
      pick(null);
    }
    (window as unknown as { __inside: unknown }).__inside = { open: on, parts: PARTS.length, selected: selected?.part.id ?? null };
  }
  toggle.addEventListener('click', () => setOpen(!open));

  const ACCENT = new THREE.Color(0x1f9bd1);
  function pick(b: Built | null) {
    selected = b;
    built.forEach((x) => x.meshes.forEach((m) => { const mm = m.material as THREE.MeshStandardMaterial; if (mm.emissive) { mm.emissive.copy(x === b ? ACCENT : new THREE.Color(0)); mm.emissiveIntensity = x === b ? 0.55 : 0; } }));
    showCard(b ? b.part : null);
    if (b && !reduced) gsap.fromTo(b.obj.scale, { x: 1.18, y: 1.18, z: 1.18 }, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', onUpdate: () => { dirty = true; } });
    label.textContent = b ? b.part.name : '';
    (window as unknown as { __inside: unknown }).__inside = { open, parts: PARTS.length, selected: b?.part.id ?? null };
    dirty = true;
  }
  select = (id: string) => { if (!open) setOpen(true); pick(built.find((b) => b.part.id === id) ?? null); };

  // ---- camera: slow turntable in the page, free orbit in full screen
  let yaw = 0.75, dist = 7, exploring = false, idle = 0, dragX: number | null = null;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2.2; controls.maxDistance = 14; controls.enabled = false;
  controls.target.set(0, 0.35, 0);
  controls.addEventListener('change', () => { dirty = true; });
  canvas.style.touchAction = 'pan-y';
  const camFromYaw = () => { const ty = open ? 0.55 : 0.1; camera.position.set(Math.sin(yaw) * dist, ty + dist * 0.42, Math.cos(yaw) * dist); camera.lookAt(0, ty, 0); };
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; if (!exploring) { dragX = e.clientX; idle = 5; } });
  window.addEventListener('pointermove', (e) => { if (dragX === null || exploring) return; yaw -= (e.clientX - dragX) * 0.008; dragX = e.clientX; dirty = true; });
  window.addEventListener('pointerup', () => { dragX = null; });
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return; // a drag, not a tap
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
    exploring = on;
    ui.classList.toggle('fullscreen', on); document.body.classList.toggle('noscroll', on);
    controls.enabled = on; canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.hidden = on; closeBtn.hidden = !on;
    if (on) controls.update(); else camFromYaw();
    requestAnimationFrame(resize);
    if (on) closeBtn.focus(); else explore.focus();
  }
  explore.addEventListener('click', () => setExplore(true));
  closeBtn.addEventListener('click', () => setExplore(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && exploring) setExplore(false); });

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; dist = w < h ? 7.2 / Math.max(0.5, w / h) * 0.82 : 7; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize(); applyShell();
  let visible = false, last = performance.now();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }, { threshold: 0.05 }).observe(stage);
  const q = new THREE.Vector3();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    if (exploring) controls.update();
    else { if (idle > 0) idle -= dt; else if (!reduced && dragX === null) { yaw += dt * 0.16; dirty = true; } camFromYaw(); }
    if (!dirty) return;
    renderer.render(scene, camera); dirty = false;
    if (selected) {
      q.copy(selected.obj.position).add(new THREE.Vector3(0, 0.3, 0)).project(camera);
      label.style.opacity = '1';
      label.style.transform = `translate(${((q.x + 1) / 2) * stage.clientWidth}px, ${((1 - q.y) / 2) * stage.clientHeight - 14}px) translate(-50%, -100%)`;
    } else label.style.opacity = '0';
  };
  requestAnimationFrame(loop);
  (window as unknown as { __inside: unknown }).__inside = { open: false, parts: PARTS.length, selected: null };
}
