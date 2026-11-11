// Chapter 6: under the ground. A schematic cutaway block of alluvium whose water
// table moves with our real NW India groundwater series: delta_h = delta_GWS / Sy.
import { fmt, getJSON, monthLabel, url, type RegionSeries } from './data';
import { waterTableChange } from './physics';

// Schematic geometry (metres below ground). Only the CHANGE in water level is computed
// from data; the starting depth and the layers are illustrative.
export const BLOCK_DEPTH_M = 30;
export const REF_TABLE_DEPTH_M = 8;
const LAYERS: { name: string; top: number; bottom: number; color: number }[] = [
  { name: 'soil', top: 0, bottom: 1.5, color: 0x6b4f33 },
  { name: 'sand', top: 1.5, bottom: 12, color: 0xd9c08e },
  { name: 'clay', top: 12, bottom: 15, color: 0x8a8f99 },
  { name: 'sand', top: 15, bottom: 26, color: 0xcdb27c },
  { name: 'clay', top: 26, bottom: 30, color: 0x70757f },
];

export async function initUnderground(tier: 'full' | 'lite' | 'static'): Promise<void> {
  const rs = await getJSON<RegionSeries>('data/region_series.json');
  const gws = rs.series['gws_jpl'];
  const slider = document.getElementById('ug-slider') as HTMLInputElement;
  const sy = document.getElementById('ug-sy') as HTMLInputElement;
  const monthOut = document.getElementById('ug-month')!;
  const readout = document.getElementById('ug-readout')!;
  const working = document.getElementById('ug-working')!;
  const syOut = document.getElementById('ug-sy-out')!;
  const n = rs.months.length;
  slider.max = String(n - 1);
  let lastValid = gws.findIndex((v) => v !== null);
  let setLevel: (depthM: number | null) => void = () => undefined;

  function update() {
    const i = +slider.value, s = +sy.value, v = gws[i];
    monthOut.textContent = monthLabel(rs.months[i]);
    slider.setAttribute('aria-valuetext', monthLabel(rs.months[i]));
    syOut.textContent = fmt(s, 2);
    if (v === null) {
      readout.innerHTML = '<span class="mono big">No data</span> <span class="unit">for this month (no satellite solution or no land-model month)</span>';
      working.textContent = '';
      setLevel(null);
    } else {
      lastValid = i;
      const dh = waterTableChange(v, s);
      readout.innerHTML = `<span class="mono big">${dh > 0 ? '+' : '−'}${fmt(Math.abs(dh), 1)} m</span> <span class="unit">estimated change in water-table height since the 2004–2009 average</span>`;
      working.textContent = `Δh = ΔGWS / Sy = ${fmt(v, 1)} cm / ${fmt(s, 2)} = ${fmt(v / 100, 3)} m / ${fmt(s, 2)} = ${fmt(dh, 2)} m`;
      setLevel(REF_TABLE_DEPTH_M - dh);
    }
    (window as unknown as { __ug: unknown }).__ug = { month: rs.months[i], gwsCm: v, sy: s, dh: v === null ? null : waterTableChange(v, s) };
  }
  slider.addEventListener('input', update);
  sy.addEventListener('input', update);
  let timer = 0;
  const playBtn = document.getElementById('ug-play') as HTMLButtonElement;
  const stop = () => { clearInterval(timer); timer = 0; playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play'); };
  playBtn.addEventListener('click', () => {
    if (timer) { stop(); return; }
    playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause');
    timer = window.setInterval(() => { slider.value = String((+slider.value + 1) % n); update(); }, 120);
  });
  slider.addEventListener('pointerdown', stop);
  slider.value = String(lastValid);

  if (tier === 'static') {
    document.getElementById('ug-fallback')!.hidden = false;
    update();
    return;
  }
  try {
    setLevel = await build3D(tier);
  } catch (e) {
    console.warn('3D cutaway unavailable', e);
    document.getElementById('ug-fallback')!.hidden = false;
  }
  update();
  void url;
}

async function build3D(tier: 'full' | 'lite'): Promise<(depthM: number | null) => void> {
  const THREE = await import('three');
  const stage = document.getElementById('ug-stage')!;
  const canvas = document.getElementById('ug-canvas') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const dl = new THREE.DirectionalLight(0xffffff, 1.7);
  dl.position.set(6, 12, 9);
  scene.add(dl);

  // block: 12 wide (x), 7 deep (z); 1 scene unit = 5 m vertically
  const W = 12, D = 7, U = 1 / 5;
  const block = new THREE.Group();
  scene.add(block);
  for (const L of LAYERS) {
    const h = (L.bottom - L.top) * U;
    const m = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), new THREE.MeshLambertMaterial({ color: L.color }));
    m.position.y = -(L.top * U + h / 2);
    block.add(m);
  }
  // grass skin
  const grass = new THREE.Mesh(new THREE.BoxGeometry(W, 0.05, D), new THREE.MeshLambertMaterial({ color: 0x5f8f3e }));
  grass.position.y = 0.025;
  block.add(grass);
  // tube wells with small pump houses
  const steel = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const wellBottom = 22 * U;
  [[-3.6, D / 2 + 0.01], [0.8, D / 2 + 0.01], [4.2, D / 2 + 0.01]].forEach(([x, z]) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, wellBottom + 0.5, 12), steel);
    pipe.position.set(x, -wellBottom / 2 + 0.25, z);
    block.add(pipe);
    const house = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.4, 0.5), new THREE.MeshLambertMaterial({ color: 0xc9ccd2 }));
    house.position.set(x + 0.2, 0.25, z - 0.4);
    block.add(house);
    const screen = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6 * U, 12), new THREE.MeshLambertMaterial({ color: 0x9aa3b0 }));
    screen.position.set(x, -(19 * U), z);
    block.add(screen);
  });
  // saturated zone: translucent water from the table down to the block base, slightly proud of the faces
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x2b7fc2, transparent: true, opacity: 0.55, depthWrite: false });
  const water = new THREE.Mesh(new THREE.BoxGeometry(W + 0.04, 1, D + 0.04), waterMat);
  block.add(water);
  const tableLine = new THREE.Mesh(new THREE.BoxGeometry(W + 0.1, 0.035, D + 0.1), new THREE.MeshBasicMaterial({ color: 0x0b4f8a }));
  block.add(tableLine);
  // reference level (2004-2009 average) as a thin dashed-looking frame
  const ref = new THREE.Mesh(new THREE.BoxGeometry(W + 0.12, 0.02, D + 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
  ref.position.y = -REF_TABLE_DEPTH_M * U;
  block.add(ref);

  block.position.y = (BLOCK_DEPTH_M * U) / 2;
  let yaw = -0.5, targetYaw = -0.5, cur = REF_TABLE_DEPTH_M, goal: number | null = REF_TABLE_DEPTH_M, dirty = true, visible = false;
  const place = () => {
    const d = Math.max(0.2, Math.min(BLOCK_DEPTH_M - 0.2, cur));
    const h = (BLOCK_DEPTH_M - d) * U;
    water.scale.y = h; water.position.y = -(d * U + h / 2);
    tableLine.position.y = -d * U;
  };
  place();

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 46 : 32;
    camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }, { threshold: 0.05 }).observe(stage);

  // drag left/right to turn the block (vertical drags still scroll the page)
  canvas.style.touchAction = 'pan-y';
  let dragX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => { dragX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', (e) => { if (dragX === null) return; targetYaw = Math.max(-1.2, Math.min(1.2, targetYaw + (e.clientX - dragX) * 0.006)); dragX = e.clientX; });
  const end = () => { dragX = null; };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loop = () => {
    requestAnimationFrame(loop);
    if (!visible) return;
    if (Math.abs(targetYaw - yaw) > 0.001) { yaw += (targetYaw - yaw) * 0.15; dirty = true; }
    if (goal !== null && Math.abs(goal - cur) > 0.005) { cur = reduced ? goal : cur + (goal - cur) * 0.2; place(); dirty = true; }
    if (!dirty) return;
    const r = 21;
    camera.position.set(Math.sin(yaw) * r, 7.5, Math.cos(yaw) * r);
    camera.lookAt(0, 0.2, 0);
    renderer.render(scene, camera);
    dirty = false;
  };
  requestAnimationFrame(loop);

  return (depthM) => {
    goal = depthM;
    water.visible = tableLine.visible = depthM !== null;
    dirty = true;
  };
}
