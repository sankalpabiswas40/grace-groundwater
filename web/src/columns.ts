// Chapter 5: the real GRACE grid draped on the globe as 3D columns.
// Height and colour = water storage anomaly for the selected month.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fmt, loadFrames, monthLabel, url } from './data';
import { diverging } from './map';
import { columnHeightUnits, COLUMN_BASE_CM, latLonToVec } from './physics';

const RANGE_CM = 40;
const TARGET: [number, number] = [27.5, 79];

export interface ColumnsHandle { play(): void; pause(): void; }

export async function initColumns(tier: 'full' | 'lite'): Promise<ColumnsHandle> {
  const frames = await loadFrames();
  const { grid, nt, ny, nx } = frames;
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
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === 'full', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  renderer.setClearColor(0x06101f, 1);
  const scene = new THREE.Scene();
  let dirty = true;
  const camera = new THREE.PerspectiveCamera(40, 1, 0.005, 50);

  // Earth (dimmed so the data colours stay readable)
  const tex = await new THREE.TextureLoader().loadAsync(url('textures/day_2048.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = tier === 'full' ? 8 : 2;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), new THREE.MeshBasicMaterial({ map: tex, color: 0x8a94a6 }));
  scene.add(earth);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const normal = new THREE.Vector3(...latLonToVec(TARGET[0], TARGET[1]));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.copy(normal).multiplyScalar(3).add(new THREE.Vector3(...latLonToVec(10, 40)));
  scene.add(sun);

  // columns: one instanced box per grid cell
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0, 0.5); // base on the surface, grows along +z
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), ny * nx);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  const dummy = new THREE.Object3D();
  const pos: THREE.Vector3[] = [], quat: THREE.Quaternion[] = [], sx: number[] = [], sy: number[] = [];
  const zAxis = new THREE.Vector3(0, 0, 1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = new THREE.Vector3(...latLonToVec(grid.lat[j], grid.lon[i]));
    pos.push(n.clone());
    // orient: local z = outward, local y = north
    const north = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    const east = new THREE.Vector3().crossVectors(north, n).normalize();
    const m = new THREE.Matrix4().makeBasis(east, north, n);
    quat.push(new THREE.Quaternion().setFromRotationMatrix(m));
    const d = (0.5 * Math.PI) / 180;
    sx.push(d * Math.cos((grid.lat[j] * Math.PI) / 180) * 0.94); sy.push(d * 0.94);
  }
  void zAxis;
  const color = new THREE.Color();

  // region outline (NW India) as a line just above the surface
  const outline = new THREE.Group();
  scene.add(outline);
  fetch(url('geo/outlines.json')).then((r) => r.json()).then((o: { nw: GeoJSON.Polygon | GeoJSON.MultiPolygon }) => {
    const polys = o.nw.type === 'Polygon' ? [o.nw.coordinates] : o.nw.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => {
      const pts = ring.map(([lo, la]) => new THREE.Vector3(...latLonToVec(la, lo)));
      outline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.9 })));
    }));
    dirty = true;
  }).catch(() => undefined);

  const state = { q: 0 as 0 | 1, t: Math.max(0, grid.months.indexOf('2010-08')), playing: false, kmPerCm: +exag.value };
  slider.max = String(nt - 1);

  function update() {
    const f = frames.frame(state.q, state.t);
    let any = false;
    for (let k = 0; k < ny * nx; k++) {
      const v = f[k];
      if (Number.isNaN(v)) { dummy.scale.set(0, 0, 0); dummy.position.copy(pos[k]); }
      else {
        any = true;
        const h = columnHeightUnits(v, state.kmPerCm);
        dummy.position.copy(pos[k]); dummy.quaternion.copy(quat[k]);
        dummy.scale.set(sx[k], sy[k], Math.max(h, 0.0004));
        const c = d3rgb(diverging(Math.max(0, Math.min(1, 0.5 + v / RANGE_CM / 2))));
        color.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
        mesh.setColorAt(k, color);
      }
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // keep the region outline floating just above the tallest columns
    outline.scale.setScalar(1 + columnHeightUnits(RANGE_CM, state.kmPerCm) + 0.004);
    const month = grid.months[state.t];
    nodata.hidden = any;
    if (!any) document.getElementById('globe-nodata-why')!.textContent =
      grid.missing_reason[month] ?? (state.q === 1 ? grid.gws_missing_reason[month] : '') ?? 'No solution for this month';
    monthOut.textContent = monthLabel(month);
    slider.value = String(state.t);
    slider.setAttribute('aria-valuetext', monthLabel(month));
    exagOut.textContent = `1 cm of water is drawn ${fmt(state.kmPerCm, 0)} km tall (exaggeration ×${(state.kmPerCm * 1e5).toLocaleString('en-IN')})`;
    (window as unknown as { __columns: unknown }).__columns = { kmPerCm: state.kmPerCm, month, baseCm: COLUMN_BASE_CM, sampleHeight: columnHeightUnits(10, state.kmPerCm) };
    dirty = true;
  }

  // camera + controls
  const target = normal.clone();
  camera.up.copy(normal);
  const south = new THREE.Vector3(0, -1, 0).addScaledVector(normal, normal.y).normalize();
  const camAt = (dist: number) => camera.position.copy(target).addScaledVector(normal, dist * 0.72).addScaledVector(south, dist * 0.7);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(target);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 0.18; controls.maxDistance = 3.2; controls.maxPolarAngle = Math.PI * 0.47;
  controls.enabled = false;
  controls.addEventListener('change', () => { dirty = true; });
  const FINAL = stage.clientWidth < stage.clientHeight ? 1.05 : 0.7; // further back on portrait screens
  camAt(reduced ? FINAL : 3.0);
  controls.update();
  canvas.style.touchAction = 'pan-y';
  const setExplore = (on: boolean) => {
    controls.enabled = on;
    canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.setAttribute('aria-pressed', String(on));
    explore.textContent = on ? 'Resume scrolling' : 'Free explore: drag to rotate, pinch to zoom';
    stage.classList.toggle('exploring', on);
  };
  explore.addEventListener('click', () => setExplore(!controls.enabled));

  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();

  // render loop (only draws when something changed and the stage is on screen)
  let visible = false, diveT = reduced ? 1 : 0, last = performance.now(), lastStep = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (!visible) pause(); }, { threshold: 0.05 }).observe(stage);
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    if (diveT < 1) { // dive from orbit
      diveT = Math.min(1, diveT + dt / 2.8);
      const e = 1 - Math.pow(1 - diveT, 3);
      camAt(3.0 + (FINAL - 3.0) * e);
      dirty = true;
    }
    if (state.playing && now - lastStep > 380) { lastStep = now; state.t = state.t >= nt - 1 ? 0 : state.t + 1; update(); }
    if (controls.enabled) controls.update();
    else camera.lookAt(target);
    if (dirty) { renderer.render(scene, camera); dirty = false; }
  };
  requestAnimationFrame(loop);

  function play() { state.playing = true; playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause'); }
  function pause() { state.playing = false; playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play'); }
  playBtn.addEventListener('click', () => (state.playing ? pause() : play()));
  slider.addEventListener('input', () => { pause(); state.t = +slider.value; update(); });
  exag.addEventListener('input', () => { state.kmPerCm = +exag.value; update(); });
  document.querySelectorAll<HTMLButtonElement>('#globe [data-gq]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll<HTMLButtonElement>('#globe [data-gq]').forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
    state.q = b.dataset.gq === 'tws' ? 0 : 1; popup.hidden = true; update();
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
    const hit = ray.intersectObject(mesh)[0];
    if (!hit || hit.instanceId === undefined) { popup.hidden = true; return; }
    const j = Math.floor(hit.instanceId / nx), i = hit.instanceId % nx;
    showPopup(j, i);
  });
  document.getElementById('globe-popup-close')!.addEventListener('click', () => { popup.hidden = true; });
  function showPopup(j: number, i: number) {
    const s = Array.from(frames.cellSeries(state.q, j, i));
    const fin = s.filter((v) => !Number.isNaN(v));
    const lo = Math.min(-1, ...fin), hi = Math.max(1, ...fin);
    const X = (k: number) => 30 + (244 * k) / (nt - 1), Y = (v: number) => 104 - ((v - lo) / (hi - lo)) * 96;
    let d = '', pen = false;
    s.forEach((v, k) => { if (Number.isNaN(v)) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(k).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; });
    document.getElementById('globe-popup-title')!.textContent =
      `${state.q === 0 ? 'Total water' : 'Groundwater'} · ${grid.lat[j].toFixed(2)}°N ${grid.lon[i].toFixed(2)}°E · ${monthLabel(grid.months[state.t])}: ${Number.isNaN(s[state.t]) ? 'no data' : fmt(s[state.t], 1) + ' cm'}`;
    document.getElementById('globe-popup-svg')!.innerHTML =
      `<line x1="30" x2="274" y1="${Y(0)}" y2="${Y(0)}" stroke="var(--line)"/><path d="${d}" fill="none" stroke="var(--jpl)" stroke-width="1.3"/>
       <line x1="${X(state.t)}" x2="${X(state.t)}" y1="8" y2="104" stroke="var(--ink)" stroke-dasharray="2 2"/>
       <text x="26" y="${Y(hi) + 4}" text-anchor="end">${Math.round(hi)}</text><text x="26" y="${Y(lo) + 2}" text-anchor="end">${Math.round(lo)}</text>
       <text x="30" y="117">${grid.months[0].slice(0, 4)}</text><text x="274" y="117" text-anchor="end">${grid.months[nt - 1].slice(0, 4)}</text>`;
    popup.hidden = false;
  }

  update();
  return { play, pause };
}

function d3rgb(s: string): [number, number, number] {
  const m = s.match(/\d+/g)!;
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
}
