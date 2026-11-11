// Chapter 5: real GRACE data over all of India as 3D columns on a rotatable globe.
// Height and colour = water storage anomaly for the selected month.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { calendarMonths, fmt, loadIndia3D, monthLabel, url } from './data';
import { diverging } from './map';
import { columnHeightUnits, COLUMN_BASE_CM, latLonToVec } from './physics';

const RANGE_CM = 40;
const TARGET: [number, number] = [22.5, 81]; // centre of India

export interface ColumnsHandle { play(): void; pause(): void; }

export async function initColumns(tier: 'full' | 'lite'): Promise<ColumnsHandle> {
  const d = await loadIndia3D();
  const N = d.nCells;
  const months = calendarMonths(d.months[0], d.months[d.months.length - 1]);
  const stored = new Map(d.months.map((m, k) => [m, k]));
  const ui = document.getElementById('globe-ui')!;
  const stage = document.getElementById('globe-stage')!;
  const canvas = document.getElementById('globe-canvas') as HTMLCanvasElement;
  const slider = document.getElementById('globe-slider') as HTMLInputElement;
  const monthOut = document.getElementById('globe-month')!;
  const playBtn = document.getElementById('globe-play') as HTMLButtonElement;
  const exag = document.getElementById('globe-exag') as HTMLInputElement;
  const exagOut = document.getElementById('globe-exag-out')!;
  const nodata = document.getElementById('globe-nodata')!;
  const popup = document.getElementById('globe-popup')!;
  const explore = document.getElementById('globe-explore') as HTMLButtonElement;
  const closeBtn = document.getElementById('globe-close') as HTMLButtonElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'full', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  renderer.setClearColor(0x06101f, 1);
  const scene = new THREE.Scene();
  let dirty = true;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 50);

  const tex = await new THREE.TextureLoader().loadAsync(url('textures/day_2048.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = tier === 'full' ? 8 : 2;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshBasicMaterial({ map: tex, color: 0x8a94a6 })));
  scene.add(new THREE.AmbientLight(0xffffff, 1.25));
  const normal = new THREE.Vector3(...latLonToVec(TARGET[0], TARGET[1]));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.copy(normal).multiplyScalar(2).add(new THREE.Vector3(...latLonToVec(5, 30)).multiplyScalar(3));
  scene.add(sun);

  // one instanced box per grid cell inside India
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0, 0.5);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const pos: THREE.Vector3[] = [], quat: THREE.Quaternion[] = [], sx: number[] = [], sy: number[] = [];
  for (let c = 0; c < N; c++) {
    const n = new THREE.Vector3(...latLonToVec(d.lat[c], d.lon[c]));
    pos.push(n);
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const east = new THREE.Vector3().crossVectors(north, n).normalize();
    quat.push(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, north, n)));
    const s = (0.5 * Math.PI) / 180;
    sx.push(s * Math.cos((d.lat[c] * Math.PI) / 180) * 0.9); sy.push(s * 0.9);
  }
  const color = new THREE.Color();

  // outlines float just above the tallest columns so they stay visible
  const outline = new THREE.Group();
  scene.add(outline);
  const mats = {
    nwHalo: new LineMaterial({ color: 0xffffff, linewidth: 7, depthTest: false, transparent: true }),
    nwCore: new LineMaterial({ color: 0x111111, linewidth: 3.5, depthTest: false, transparent: true }),
    stHalo: new LineMaterial({ color: 0xffffff, linewidth: 3.2, depthTest: false, transparent: true, opacity: 0.85 }),
    stCore: new LineMaterial({ color: 0x2a2f3a, linewidth: 1.3, depthTest: false, transparent: true }),
  };
  fetch(url('geo/india_states_rings.json')).then((r) => r.json()).then((o: { rings: [number, number][][] }) => {
    const flat: number[] = [];
    for (const ring of o.rings) for (let k = 0; k < ring.length - 1; k++)
      flat.push(...latLonToVec(ring[k][1], ring[k][0]), ...latLonToVec(ring[k + 1][1], ring[k + 1][0]));
    [mats.stHalo, mats.stCore].forEach((m, k) => {
      const l = new LineSegments2(new LineSegmentsGeometry().setPositions(flat), m);
      l.renderOrder = 5 + k; outline.add(l);
    });
    dirty = true;
  }).catch(() => undefined);
  fetch(url('geo/outlines.json')).then((r) => r.json()).then((o: { nw: GeoJSON.Polygon | GeoJSON.MultiPolygon }) => {
    const polys = o.nw.type === 'Polygon' ? [o.nw.coordinates] : o.nw.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => {
      if (ring.length < 12) return;
      const flat = ring.flatMap(([lo, la]) => latLonToVec(la, lo));
      [mats.nwHalo, mats.nwCore].forEach((m, k) => {
        const l = new Line2(new LineGeometry().setPositions(flat), m);
        l.renderOrder = 10 + k; outline.add(l);
      });
    }));
    dirty = true;
  }).catch(() => undefined);

  const state = { q: 0 as 0 | 1, t: Math.max(0, months.indexOf('2010-08')), playing: false, kmPerCm: +exag.value };
  slider.max = String(months.length - 1);
  // displayed value per cell eases towards the real monthly value (animation only)
  const shown = new Float32Array(N).fill(NaN), goal = new Float32Array(N).fill(NaN);
  let hasData = false, settling = true;

  function setTargets() {
    const month = months[state.t];
    const k = stored.get(month);
    hasData = false;
    if (k !== undefined) {
      for (let c = 0; c < N; c++) { goal[c] = d.value(state.q, k, c); if (!Number.isNaN(goal[c])) hasData = true; }
    }
    mesh.visible = hasData;
    nodata.hidden = hasData;
    if (!hasData) {
      document.getElementById('globe-nodata-why')!.textContent = k === undefined
        ? (month >= '2017-07' && month <= '2018-05'
          ? 'Mission gap: GRACE ended in 2017 and GRACE-FO began science data in mid-2018'
          : 'No GRACE/GRACE-FO solution for this month')
        : 'GLDAS land-surface model not yet available for this month';
    }
    monthOut.textContent = monthLabel(month);
    slider.value = String(state.t);
    slider.setAttribute('aria-valuetext', monthLabel(month));
    exagOut.textContent = `1 cm of water is drawn ${fmt(state.kmPerCm, 0)} km tall (exaggeration ×${(state.kmPerCm * 1e5).toLocaleString('en-IN')})`;
    outline.scale.setScalar(1 + columnHeightUnits(RANGE_CM, state.kmPerCm) + 0.004);
    (window as unknown as { __columns: unknown }).__columns = {
      kmPerCm: state.kmPerCm, month, baseCm: COLUMN_BASE_CM, hasData, nCells: N,
      sampleHeight: columnHeightUnits(10, state.kmPerCm),
    };
    settling = true; dirty = true;
  }

  function applyInstances(snap: boolean) {
    let moving = false;
    for (let c = 0; c < N; c++) {
      const g = goal[c];
      if (Number.isNaN(g)) { dummy.position.copy(pos[c]); dummy.scale.set(0, 0, 0); }
      else {
        let v = shown[c];
        if (Number.isNaN(v) || snap) v = g;
        else if (Math.abs(g - v) > 0.05) { v += (g - v) * 0.22; moving = true; } else v = g;
        shown[c] = v;
        dummy.position.copy(pos[c]); dummy.quaternion.copy(quat[c]);
        dummy.scale.set(sx[c], sy[c], Math.max(columnHeightUnits(v, state.kmPerCm), 0.0004));
        const rgb = diverging(Math.max(0, Math.min(1, 0.5 + v / RANGE_CM / 2))).match(/\d+/g)!;
        color.setRGB(+rgb[0] / 255, +rgb[1] / 255, +rgb[2] / 255, THREE.SRGBColorSpace);
        mesh.setColorAt(c, color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(c, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    settling = moving;
  }

  // camera
  const target = normal.clone();
  camera.up.copy(normal);
  const south = new THREE.Vector3(0, -1, 0).addScaledVector(normal, normal.y).normalize();
  const east0 = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
  const camAt = (dist: number, sway = 0) => camera.position.copy(target)
    .addScaledVector(normal, dist * 0.8).addScaledVector(south, dist * 0.6 * Math.cos(sway)).addScaledVector(east0, dist * 0.6 * Math.sin(sway));
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 0.2; controls.maxDistance = 3.5; controls.maxPolarAngle = Math.PI * 0.48;
  controls.enabled = false;
  controls.addEventListener('change', () => { dirty = true; });
  const finalDist = () => (stage.clientWidth < stage.clientHeight ? 1.45 : 0.95);
  camAt(reduced ? finalDist() : 3.0);
  canvas.style.touchAction = 'pan-y';

  // full-screen explore mode
  let exploring = false;
  function setExplore(on: boolean) {
    exploring = on;
    ui.classList.toggle('fullscreen', on);
    document.body.classList.toggle('noscroll', on);
    controls.enabled = on;
    canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.hidden = on; closeBtn.hidden = !on;
    if (!on) { camera.up.copy(normal); camAt(finalDist()); }
    (window as unknown as { __exploring: boolean }).__exploring = on;
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
    camera.aspect = w / h; camera.updateProjectionMatrix();
    Object.values(mats).forEach((m) => m.resolution.set(w, h));
    mats.nwHalo.linewidth = w < 520 ? 5 : 7; mats.nwCore.linewidth = w < 520 ? 2.5 : 3.5;
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  let visible = false, diveT = reduced ? 1 : 0, last = performance.now(), lastStep = 0, swayT = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (!visible) pause(); }, { threshold: 0.05 }).observe(stage);
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    if (!exploring) {
      if (diveT < 1) diveT = Math.min(1, diveT + dt / 2.8);
      const e = 1 - Math.pow(1 - diveT, 3);
      if (!reduced) swayT += dt;
      camAt(3.0 + (finalDist() - 3.0) * e, reduced ? 0 : 0.42 * Math.sin(swayT * 0.22)); // slow sway shows the 3D shape
      camera.lookAt(target);
      if (diveT < 1 || !reduced) dirty = true;
    } else controls.update();
    if (state.playing && now - lastStep > 420) { lastStep = now; state.t = state.t >= months.length - 1 ? 0 : state.t + 1; setTargets(); }
    if (settling && hasData) { applyInstances(reduced); dirty = true; }
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  };
  requestAnimationFrame(loop);

  function play() { state.playing = true; playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause'); }
  function pause() { state.playing = false; playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play'); }
  playBtn.addEventListener('click', () => (state.playing ? pause() : play()));
  slider.addEventListener('input', () => { pause(); state.t = +slider.value; setTargets(); });
  exag.addEventListener('input', () => { state.kmPerCm = +exag.value; setTargets(); });
  document.querySelectorAll<HTMLButtonElement>('#globe [data-gq]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('#globe [data-gq]').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
    state.q = b.dataset.gq === 'tws' ? 0 : 1; popup.hidden = true; setTargets();
  }));

  // tap a column for its time series
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('pointerup', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = mesh.visible ? ray.intersectObject(mesh)[0] : undefined;
    if (!hit || hit.instanceId === undefined) { popup.hidden = true; return; }
    showPopup(hit.instanceId);
  });
  document.getElementById('globe-popup-close')!.addEventListener('click', () => { popup.hidden = true; });
  function showPopup(c: number) {
    const s = months.map((m) => { const k = stored.get(m); return k === undefined ? NaN : d.value(state.q, k, c); });
    const fin = s.filter((v) => !Number.isNaN(v));
    const lo = Math.min(-1, ...fin), hi = Math.max(1, ...fin), nt = months.length;
    const X = (k: number) => 30 + (244 * k) / (nt - 1), Y = (v: number) => 104 - ((v - lo) / (hi - lo)) * 96;
    let path = '', pen = false;
    s.forEach((v, k) => { if (Number.isNaN(v)) { pen = false; return; } path += `${pen ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; });
    const now = s[state.t];
    document.getElementById('globe-popup-title')!.textContent =
      `${state.q === 0 ? 'Total water' : 'Groundwater'} · ${d.lat[c].toFixed(2)}°N ${d.lon[c].toFixed(2)}°E · ${monthLabel(months[state.t])}: ${Number.isNaN(now) ? 'no data' : Math.abs(now) >= 127 ? (now < 0 ? 'below −127 cm' : 'above +127 cm') + ' (file limit)' : fmt(now, 0) + ' cm'}`;
    document.getElementById('globe-popup-svg')!.innerHTML =
      `<line x1="30" x2="274" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/><path d="${path}" fill="none" stroke="var(--jpl)" stroke-width="1.3"/>
       <line x1="${X(state.t)}" x2="${X(state.t)}" y1="8" y2="104" stroke="var(--ink)" stroke-dasharray="2 2"/>
       <text x="26" y="${Y(hi) + 4}" text-anchor="end">${Math.round(hi)}</text><text x="26" y="${Y(lo) + 2}" text-anchor="end">${Math.round(lo)}</text>
       <text x="30" y="117">${months[0].slice(0, 4)}</text><text x="274" y="117" text-anchor="end">${months[nt - 1].slice(0, 4)}</text>`;
    popup.hidden = false;
  }

  setTargets();
  applyInstances(true);
  return { play, pause };
}
