// 3D scene for the "Under the ground" chapter. Geometry is illustrative: layers, wells
// and the starting depth are not measured. Only the change in water level comes from data.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export const BLOCK_DEPTH_M = 30;
export const REF_TABLE_DEPTH_M = 8;
export const SHALLOW_WELL_M = 11; // illustrative depth of the one shallow well
const LAYERS: { name: string; top: number; bottom: number; kind: 'soil' | 'sand' | 'clay' }[] = [
  { name: 'soil', top: 0, bottom: 1.5, kind: 'soil' },
  { name: 'sand', top: 1.5, bottom: 12, kind: 'sand' },
  { name: 'clay', top: 12, bottom: 15, kind: 'clay' },
  { name: 'sand', top: 15, bottom: 26, kind: 'sand' },
  { name: 'clay', top: 26, bottom: 30, kind: 'clay' },
];

export interface UgScene { setLevel(depthM: number | null, rising: boolean): void; }

function tex(draw: (c: CanvasRenderingContext2D, s: number) => void, repeatX = 1, repeatY = 1, size = 256): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeatX, repeatY); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const speckle = (base: string, dots: string[], n: number, r: [number, number]) => (c: CanvasRenderingContext2D, s: number) => {
  c.fillStyle = base; c.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { c.fillStyle = dots[i % dots.length]; c.globalAlpha = 0.35 + rnd() * 0.5; c.beginPath(); c.arc(rnd() * s, rnd() * s, r[0] + rnd() * (r[1] - r[0]), 0, 7); c.fill(); }
  c.globalAlpha = 1;
};
const bands = (base: string, lines: string[]) => (c: CanvasRenderingContext2D, s: number) => {
  c.fillStyle = base; c.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 5 + rnd() * 9) { c.fillStyle = lines[Math.floor(rnd() * lines.length)]; c.globalAlpha = 0.25 + rnd() * 0.3; c.fillRect(0, y, s, 1 + rnd() * 3); }
  c.globalAlpha = 1;
};

function textSprite(text: string, color = '#14202e', bg = 'rgba(255,255,255,.86)'): THREE.Sprite {
  const cv = document.createElement('canvas'); const c = cv.getContext('2d')!;
  const fs = 44; c.font = `600 ${fs}px system-ui, sans-serif`;
  const w = Math.ceil(c.measureText(text).width) + 28; cv.width = w; cv.height = fs + 22;
  c.font = `600 ${fs}px system-ui, sans-serif`;
  c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
  c.fillStyle = color; c.textBaseline = 'middle'; c.fillText(text, 14, cv.height / 2 + 2);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  const h = 0.5; sp.scale.set((h * cv.width) / cv.height, h, 1); sp.renderOrder = 20;
  return sp;
}

export async function buildUnderground(tier: 'full' | 'lite'): Promise<UgScene> {
  const ui = document.getElementById('ug-ui')!, stage = document.getElementById('ug-stage')!;
  const canvas = document.getElementById('ug-canvas') as HTMLCanvasElement;
  const explore = document.getElementById('ug-explore') as HTMLButtonElement, closeBtn = document.getElementById('ug-close') as HTMLButtonElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a60, 1.5));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.9); sun.position.set(7, 12, 9); scene.add(sun);

  // block: 12 wide (x), 7 deep (z); 1 scene unit = 5 m vertically
  const W = 12, D = 7, U = 1 / 5, H = BLOCK_DEPTH_M * U;
  const block = new THREE.Group(); block.position.y = H / 2; scene.add(block);
  const mk = {
    soil: () => tex(speckle('#6b4f33', ['#4f3a25', '#86694a', '#3d2c1c'], 900, [0.6, 2]), 6, 1),
    sand: () => tex(speckle('#d6bd8a', ['#b89c63', '#e8d6ad', '#a98f5c', '#f2e6c8'], 1600, [0.5, 1.8]), 6, 1),
    clay: () => tex(bands('#858b96', ['#6c727c', '#9aa0aa', '#5d636d']), 3, 1),
  };
  for (const L of LAYERS) {
    const h = (L.bottom - L.top) * U;
    const t = mk[L.kind](); t.repeat.set(6, Math.max(0.4, h / 0.9));
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), new THREE.MeshLambertMaterial({ map: t }));
    m.position.y = -(L.top * U + h / 2);
    block.add(m);
  }
  // fields on top: crop rows in two shades, with field boundaries
  const fieldTex = tex((c, s) => {
    c.fillStyle = '#5c8a3c'; c.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 6) { c.fillStyle = y % 12 ? '#4f7a33' : '#6b9a48'; c.fillRect(0, y, s, 3); }
    c.fillStyle = '#7aa653'; c.fillRect(0, 0, s / 2, s / 2); for (let x = 0; x < s / 2; x += 6) { c.fillStyle = '#5f8d40'; c.fillRect(x, 0, 3, s / 2); }
    c.strokeStyle = '#3f5f2a'; c.lineWidth = 3; c.strokeRect(1, 1, s - 2, s - 2); c.beginPath(); c.moveTo(s / 2, 0); c.lineTo(s / 2, s / 2); c.lineTo(0, s / 2); c.stroke();
  }, 3, 2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshLambertMaterial({ map: fieldTex }));
  top.position.y = 0.025; block.add(top);

  // wells: three deep tube wells and one shallow well (illustrative depths)
  const steel = new THREE.MeshStandardMaterial({ color: 0x3f454e, metalness: 0.6, roughness: 0.45 });
  const zFront = D / 2 + 0.02;
  const wells: { x: number; bottomM: number; pulses: THREE.Mesh[]; pipe: THREE.Mesh; tag?: THREE.Sprite }[] = [];
  const pulseGeo = new THREE.SphereGeometry(0.075, 12, 8), pulseMat = new THREE.MeshBasicMaterial({ color: 0x6fc7f0 });
  ([[-4.2, 22], [-0.6, 22], [4.4, 22], [2.2, SHALLOW_WELL_M]] as [number, number][]).forEach(([x, bottomM]) => {
    const len = bottomM * U + 0.45;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, len, 14), bottomM < 15 ? steel.clone() : steel);
    pipe.position.set(x, -(bottomM * U) / 2 + 0.22, zFront); block.add(pipe);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 0.5), new THREE.MeshLambertMaterial({ color: 0xd3d6db }));
    house.position.set(x + 0.22, 0.26, zFront - 0.45); block.add(house);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.6), new THREE.MeshLambertMaterial({ color: 0x9b4a35 }));
    roof.position.set(x + 0.22, 0.5, zFront - 0.45); block.add(roof);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5, 10), steel); spout.rotation.z = Math.PI / 2; spout.position.set(x - 0.2, 0.38, zFront); block.add(spout);
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3 * U * 2, 14), new THREE.MeshStandardMaterial({ color: 0xa6afbb, metalness: 0.7, roughness: 0.35 }));
    screen.position.set(x, -((bottomM - 3) * U), zFront); block.add(screen);
    const pulses = [0, 1, 2].map(() => { const p = new THREE.Mesh(pulseGeo, pulseMat); p.visible = false; block.add(p); return p; });
    wells.push({ x, bottomM, pulses, pipe });
  });
  const dryTag = textSprite('dry well', '#fff', 'rgba(150,60,30,.92)'); dryTag.visible = false; block.add(dryTag);
  const shallow = wells[3];
  dryTag.position.set(shallow.x + 0.9, -(SHALLOW_WELL_M * U) + 0.1, zFront + 0.2);

  // saturated zone and the two levels
  const water = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 1, D + 0.04), new THREE.MeshLambertMaterial({ color: 0x2b7fc2, transparent: true, opacity: 0.56, depthWrite: false }));
  block.add(water);
  const rippleTex = tex((c, s) => {
    c.clearRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(255,255,255,${0.1 + rnd() * 0.18})`; c.lineWidth = 1 + rnd() * 2; c.beginPath(); c.ellipse(rnd() * s, rnd() * s, 10 + rnd() * 34, 3 + rnd() * 8, 0, 0, 7); c.stroke(); }
  }, 4, 2);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.04, D + 0.04), new THREE.MeshBasicMaterial({ color: 0x9fd4f2, map: rippleTex, transparent: true, opacity: 0.75, depthWrite: false }));
  surface.rotation.x = -Math.PI / 2; block.add(surface);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.06, 0.001, D + 0.06)), new THREE.LineBasicMaterial({ color: 0x0b4f8a }));
  block.add(edge);
  const refEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W + 0.1, 0.001, D + 0.1)), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.22, gapSize: 0.14 }));
  refEdge.computeLineDistances(); refEdge.position.y = -REF_TABLE_DEPTH_M * U; block.add(refEdge);
  const refTag = textSprite('2004–2009 level'); refTag.position.set(-W / 2 + 1.5, -REF_TABLE_DEPTH_M * U + 0.26, zFront + 0.25); block.add(refTag);
  // drained zone: sand that used to be saturated
  const drained = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 1, D + 0.05), new THREE.MeshBasicMaterial({ color: 0xe0902a, transparent: true, opacity: 0.3, depthWrite: false }));
  drained.visible = false; block.add(drained);
  // change arrow and label on the right-hand front edge
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x14202e, depthTest: false });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 8), arrowMat), head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 12), arrowMat);
  shaft.renderOrder = head.renderOrder = 19; block.add(shaft, head);
  let changeTag = textSprite('0.0 m'); block.add(changeTag);
  const AX = W / 2 + 0.3;

  // depth ruler on the left-hand front edge
  const ruler = new THREE.Group(); block.add(ruler);
  const rMat = new THREE.LineBasicMaterial({ color: 0x14202e });
  const pts: THREE.Vector3[] = [new THREE.Vector3(-W / 2 - 0.3, 0, zFront), new THREE.Vector3(-W / 2 - 0.3, -H, zFront)];
  for (let m = 0; m <= BLOCK_DEPTH_M; m += 5) {
    pts.push(new THREE.Vector3(-W / 2 - 0.3, -m * U, zFront), new THREE.Vector3(-W / 2 - 0.55, -m * U, zFront));
    const s = textSprite(`${m} m`, '#14202e', 'rgba(255,255,255,0)'); s.scale.multiplyScalar(0.8); s.position.set(-W / 2 - 1.05, -m * U, zFront); ruler.add(s);
  }
  ruler.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), rMat));

  // recharge droplets (shown in months when our data show storage rising)
  const ND = tier === 'full' ? 140 : 80;
  const dropPos = new Float32Array(ND * 3), dropPhase = new Float32Array(ND);
  for (let i = 0; i < ND; i++) { dropPos[i * 3] = (rnd() - 0.5) * W; dropPos[i * 3 + 2] = zFront + 0.03; dropPhase[i] = rnd(); }
  const dropGeo = new THREE.BufferGeometry(); dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3));
  const drops = new THREE.Points(dropGeo, new THREE.PointsMaterial({ color: 0x3b9be0, size: 0.11, transparent: true, opacity: 0.9, depthTest: false }));
  drops.visible = false; drops.renderOrder = 18; block.add(drops);

  // ---- state
  let cur = REF_TABLE_DEPTH_M, goal: number | null = REF_TABLE_DEPTH_M, rising = false, dirty = true, visible = false, lastTag = '';
  const place = () => {
    const d = Math.max(0.3, Math.min(BLOCK_DEPTH_M - 0.3, cur));
    const h = (BLOCK_DEPTH_M - d) * U;
    water.scale.y = h; water.position.y = -(d * U + h / 2);
    surface.position.y = edge.position.y = -d * U + 0.004;
    const fell = d - REF_TABLE_DEPTH_M;
    drained.visible = fell > 0.15 && water.visible;
    if (drained.visible) { drained.scale.y = fell * U; drained.position.y = -(REF_TABLE_DEPTH_M * U + (fell * U) / 2); }
    // arrow from the reference level to the current level
    const y0 = -REF_TABLE_DEPTH_M * U, y1 = -d * U, len = Math.abs(y1 - y0);
    const show = len > 0.12 && water.visible;
    shaft.visible = head.visible = changeTag.visible = show;
    if (show) {
      shaft.scale.y = Math.max(0.01, len - 0.2); shaft.position.set(AX, (y0 + y1) / 2 + (y1 < y0 ? 0.1 : -0.1), zFront);
      head.position.set(AX, y1 + (y1 < y0 ? 0.12 : -0.12), zFront); head.rotation.z = y1 < y0 ? Math.PI : 0;
      const txt = `${fell > 0 ? '−' : '+'}${Math.abs(fell).toFixed(1)} m`;
      if (txt !== lastTag) { block.remove(changeTag); changeTag.material.map?.dispose(); changeTag = textSprite(txt, '#fff', 'rgba(20,32,46,.92)'); block.add(changeTag); lastTag = txt; }
      changeTag.position.set(W / 2 - 1.1, (y0 + y1) / 2, zFront + 0.3); // on the block face, so it is never cut off
    }
    const dry = d > SHALLOW_WELL_M && water.visible;
    dryTag.visible = dry;
    (shallow.pipe.material as THREE.MeshStandardMaterial).color.set(dry ? 0x9a8f85 : 0x3f454e);
  };
  place();

  // ---- camera: dive in on first view, slow sway, drag to turn, full screen to explore
  let yaw = -0.5, targetYaw = -0.5, dive = reduced ? 1 : 0, exploring = false, swayT = 0, dragX: number | null = null, idle = 0;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 8; controls.maxDistance = 45; controls.maxPolarAngle = Math.PI * 0.62; controls.enabled = false;
  controls.target.set(0, 0.2, 0);
  controls.addEventListener('change', () => { dirty = true; });
  canvas.style.touchAction = 'pan-y';
  canvas.addEventListener('pointerdown', (e) => { if (!exploring) { dragX = e.clientX; idle = 5; } });
  window.addEventListener('pointermove', (e) => { if (dragX === null || exploring) return; targetYaw = Math.max(-1.25, Math.min(1.25, targetYaw + (e.clientX - dragX) * 0.006)); dragX = e.clientX; });
  window.addEventListener('pointerup', () => { dragX = null; });
  const baseR = () => (camera.aspect < 1 ? 28 : 20.5);
  const setCam = () => {
    const e = 1 - Math.pow(1 - dive, 3), r = baseR();
    const yy = 26 - (26 - 7.5) * e, rr = r * (0.35 + 0.65 * e); // starts high above the fields, ends beside the block
    camera.position.set(Math.sin(yaw) * rr, yy, Math.cos(yaw) * rr);
    camera.lookAt(0, 0.2 + (1 - e) * 2.4, 0);
  };
  function setExplore(on: boolean) {
    exploring = on;
    ui.classList.toggle('fullscreen', on); document.body.classList.toggle('noscroll', on);
    controls.enabled = on; canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.hidden = on; closeBtn.hidden = !on;
    if (on) { dive = 1; setCam(); controls.update(); } else setCam();
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
    camera.aspect = w / h; camera.fov = w / h < 1 ? 40 : 32; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }, { threshold: 0.05 }).observe(stage);

  let last = performance.now(), tt = 0;
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    tt += dt;
    if (goal !== null && Math.abs(goal - cur) > 0.004) { cur = reduced ? goal : cur + (goal - cur) * Math.min(1, dt * 9); place(); dirty = true; }
    if (!reduced && water.visible) {
      rippleTex.offset.x = tt * 0.012; rippleTex.offset.y = tt * 0.007;
      // water pulses climbing the pipes of wells that still reach water (pumping)
      const dNow = cur;
      wells.forEach((w, wi) => {
        const reaches = w.bottomM > dNow;
        w.pulses.forEach((p, k) => {
          p.visible = reaches;
          if (!reaches) return;
          const f = (tt * 0.45 + k / 3 + wi * 0.17) % 1; // 0 at the water table, 1 at the surface
          p.position.set(w.x, -(dNow * U) * (1 - f) + 0.3 * f, zFront);
        });
      });
      // recharge trickling down from the surface to the water table
      drops.visible = rising;
      if (rising) {
        for (let i = 0; i < ND; i++) { const f = (tt * 0.35 + dropPhase[i]) % 1; dropPos[i * 3 + 1] = -(dNow * U) * f; }
        (dropGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      }
      dirty = true;
    }
    if (exploring) controls.update();
    else {
      if (dive < 1) { dive = Math.min(1, dive + dt / 2.6); dirty = true; }
      if (idle > 0) idle -= dt; else if (!reduced && dragX === null) { swayT += dt; targetYaw = -0.5 + 0.28 * Math.sin(swayT * 0.25); }
      if (Math.abs(targetYaw - yaw) > 0.0008) { yaw += (targetYaw - yaw) * Math.min(1, dt * 6); dirty = true; }
      setCam();
    }
    if (!dirty) return;
    renderer.render(scene, camera); dirty = false;
  };
  requestAnimationFrame(loop);

  return {
    setLevel(depthM, isRising) {
      goal = depthM; rising = isRising && depthM !== null;
      const on = depthM !== null;
      water.visible = surface.visible = edge.visible = on;
      if (!on) { drained.visible = shaft.visible = head.visible = changeTag.visible = dryTag.visible = drops.visible = false; wells.forEach((w) => w.pulses.forEach((p) => { p.visible = false; })); }
      else place();
      (window as unknown as { __ug3d: unknown }).__ug3d = { depthM, rising, dryWell: on && depthM! > SHALLOW_WELL_M };
      dirty = true;
    },
  };
}
