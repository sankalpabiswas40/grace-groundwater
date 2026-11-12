// Chapter 4: Earth's gravity "potato". A rotatable globe whose shape and colour show
// real geoid heights from EGM2008 (low degrees), exaggerated by a factor that is always shown.
import * as THREE from 'three';
import * as d3 from 'd3';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { fmt, getJSON, url } from './data';
import { geoidRadius, latLonToVec } from './physics';

interface GeoidMeta {
  lat: number[]; lon: number[]; file: string; max_degree_used: number; grid_step_deg: number;
  global_min: { height_m: number; lat: number; lon: number }; global_max: { height_m: number; lat: number; lon: number };
  indian_ocean_low: { height_m: number; lat: number; lon: number };
}
const RANGE_M = 100;
export const geoidColour = (hM: number) => d3.interpolateRdBu(Math.max(0, Math.min(1, 0.5 - hM / RANGE_M / 2))); // blue = low, red = high

export async function loadGeoid(): Promise<{ meta: GeoidMeta; sample: (lat: number, lon: number) => number }> {
  const meta = await getJSON<GeoidMeta>('data/geoid.json');
  const r = await fetch(url('data/' + meta.file));
  if (!r.ok) throw new Error('Could not load geoid.bin');
  const raw = new Int16Array(await r.arrayBuffer());
  const nlat = meta.lat.length, nlon = meta.lon.length, step = meta.grid_step_deg;
  if (raw.length !== nlat * nlon) throw new Error('geoid.bin has an unexpected size');
  const at = (j: number, i: number) => raw[j * nlon + ((i % nlon) + nlon) % nlon] / 100; // metres
  // bilinear interpolation between grid points (longitude wraps)
  const sample = (lat: number, lon: number) => {
    const y = Math.max(0, Math.min(nlat - 1, (lat - meta.lat[0]) / step));
    const x = (((lon % 360) + 360) % 360) / step;
    const j = Math.min(nlat - 2, Math.floor(y)), i = Math.floor(x), fy = y - j, fx = x - i;
    return (at(j, i) * (1 - fx) + at(j, i + 1) * fx) * (1 - fy) + (at(j + 1, i) * (1 - fx) + at(j + 1, i + 1) * fx) * fy;
  };
  return { meta, sample };
}

export async function initGeoid(tier: 'full' | 'lite' | 'static'): Promise<void> {
  const { meta, sample } = await loadGeoid();
  const low = meta.indian_ocean_low, high = meta.global_max;
  // numbers on the page come from the data file
  document.getElementById('geoid-low')!.textContent = `${fmt(Math.abs(low.height_m), 0)} m`;
  document.getElementById('geoid-facts')!.innerHTML =
    `Lowest point of the geoid in our calculation: <b class="mono">${fmt(low.height_m, 1)} m</b> at ${Math.abs(low.lat)}°${low.lat >= 0 ? 'N' : 'S'}, ${low.lon}°E, in the Indian Ocean south of India. ` +
    `Highest: <b class="mono">+${fmt(high.height_m, 1)} m</b> at ${Math.abs(high.lat)}°${high.lat >= 0 ? 'N' : 'S'}, ${high.lon}°E. ` +
    `Computed from EGM2008 up to degree ${meta.max_degree_used}, sampled every ${meta.grid_step_deg}°, so sharp local features are smoothed out.`;
  { // colour bar
    const lc = document.getElementById('geoid-legend') as HTMLCanvasElement, c = lc.getContext('2d')!;
    for (let x = 0; x < lc.width; x++) { c.fillStyle = geoidColour(-RANGE_M + (2 * RANGE_M * x) / (lc.width - 1)); c.fillRect(x, 0, 1, lc.height); }
    document.getElementById('geoid-legend-ticks')!.innerHTML = [-100, -50, 0, 50, 100].map((v) => `<span>${v > 0 ? '+' : ''}${v}</span>`).join('');
  }
  const slider = document.getElementById('geoid-exag') as HTMLInputElement;
  const out = document.getElementById('geoid-exag-out')!;
  const exagOf = () => Math.round(Math.pow(10, +slider.value)); // slider is log10: 0 .. 4
  const label = () => {
    const e = exagOf();
    out.textContent = `Shape exaggerated ×${e.toLocaleString('en-IN')}: 1 m of geoid height is drawn as ${e >= 1000 ? fmt(e / 1000, e % 1000 ? 1 : 0) + ' km' : e + ' m'}`;
    slider.setAttribute('aria-valuetext', `exaggeration ${e}`);
    (window as unknown as { __geoid: unknown }).__geoid = { exag: e, lowM: low.height_m, lowRadius: geoidRadius(low.height_m, e), degree: meta.max_degree_used };
  };
  label();
  slider.addEventListener('input', label);
  if (tier === 'static') { document.getElementById('geoid-fallback')!.hidden = false; return; }

  const ui = document.getElementById('geoid-ui')!, stage = document.getElementById('geoid-stage')!;
  const canvas = document.getElementById('geoid-canvas') as HTMLCanvasElement;
  const explore = document.getElementById('geoid-explore') as HTMLButtonElement, closeBtn = document.getElementById('geoid-close') as HTMLButtonElement;
  const lab = document.getElementById('geoid-lab-low')!;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier === 'full' ? 2 : 1.5));
  renderer.setClearColor(0x06101f, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 50);
  scene.add(new THREE.AmbientLight(0xffffff, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  scene.add(sun);

  // globe mesh: every vertex is pushed in or out by its geoid height times the exaggeration
  const seg = tier === 'full' ? 240 : 160;
  const geo = new THREE.SphereGeometry(1, seg, seg / 2);
  const base = (geo.attributes.position.array as Float32Array).slice();
  const nv = base.length / 3;
  const h = new Float32Array(nv), colors = new Float32Array(nv * 3), col = new THREE.Color();
  for (let k = 0; k < nv; k++) {
    const x = base[k * 3], y = base[k * 3 + 1], z = base[k * 3 + 2];
    const lat = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI, lon = (Math.atan2(-z, x) * 180) / Math.PI;
    h[k] = sample(lat, lon);
    col.set(geoidColour(h[k]));
    colors.set([col.r, col.g, col.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const globe = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  scene.add(globe);
  // faint continents on the same deformed surface, for orientation
  const tex = await new THREE.TextureLoader().loadAsync(url('textures/day_2048.jpg'));
  tex.colorSpace = THREE.SRGBColorSpace;
  const land = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
  land.scale.setScalar(1.001);
  scene.add(land);

  // India outline riding on the deformed surface
  const lineMat = new LineMaterial({ color: 0x111111, linewidth: 2, transparent: true, opacity: 0.9 });
  const rings: { pts: [number, number][]; line: Line2 }[] = [];
  getJSON<{ india: GeoJSON.Polygon | GeoJSON.MultiPolygon }>('geo/outlines.json').then((o) => {
    const polys = o.india.type === 'Polygon' ? [o.india.coordinates] : o.india.coordinates;
    polys.forEach((poly) => { const ring = poly[0] as [number, number][]; if (ring.length < 20) return; const line = new Line2(new LineGeometry(), lineMat); scene.add(line); rings.push({ pts: ring, line }); });
    deform();
  }).catch(() => undefined);
  const lowMarker = new THREE.Mesh(new THREE.RingGeometry(0.018, 0.026, 32), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide, depthTest: false }));
  lowMarker.renderOrder = 5;
  scene.add(lowMarker);
  const lowDir = new THREE.Vector3(...latLonToVec(low.lat, low.lon));

  let dirty = true;
  function deform() {
    const e = exagOf(), pos = geo.attributes.position.array as Float32Array;
    for (let k = 0; k < nv; k++) {
      const r = geoidRadius(h[k], e);
      pos[k * 3] = base[k * 3] * r; pos[k * 3 + 1] = base[k * 3 + 1] * r; pos[k * 3 + 2] = base[k * 3 + 2] * r;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    rings.forEach(({ pts, line }) => {
      const flat: number[] = [];
      pts.forEach(([lo, la]) => { const v = latLonToVec(la, lo), r = geoidRadius(sample(la, lo), e) * 1.003; flat.push(v[0] * r, v[1] * r, v[2] * r); });
      line.geometry.dispose(); line.geometry = new LineGeometry().setPositions(flat);
    });
    lowMarker.position.copy(lowDir).multiplyScalar(geoidRadius(low.height_m, e) * 1.004);
    lowMarker.lookAt(lowDir.clone().multiplyScalar(3));
    dirty = true;
  }
  slider.addEventListener('input', deform);
  deform();

  // camera: slow turn in the page; free rotate and zoom in full screen
  let yaw = (low.lon * Math.PI) / 180 - 0.25, dist = 3.6, exploring = false;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 1.6; controls.maxDistance = 12; controls.enabled = false;
  controls.addEventListener('change', () => { dirty = true; });
  canvas.style.touchAction = 'pan-y';
  const camFromYaw = () => { camera.position.set(Math.cos(yaw) * dist * 0.97, 0.24 * dist, -Math.sin(yaw) * dist * 0.97); camera.lookAt(0, 0, 0); };
  let dragX: number | null = null, idle = 0;
  canvas.addEventListener('pointerdown', (e) => { if (!exploring) { dragX = e.clientX; idle = 4; } });
  window.addEventListener('pointermove', (e) => { if (dragX === null || exploring) return; yaw -= (e.clientX - dragX) * 0.008; dragX = e.clientX; dirty = true; });
  window.addEventListener('pointerup', () => { dragX = null; });
  function setExplore(on: boolean) {
    exploring = on;
    ui.classList.toggle('fullscreen', on); document.body.classList.toggle('noscroll', on);
    controls.enabled = on; canvas.style.touchAction = on ? 'none' : 'pan-y';
    explore.hidden = on; closeBtn.hidden = !on;
    if (!on) camFromYaw(); else controls.update();
    requestAnimationFrame(resize);
    if (on) closeBtn.focus(); else explore.focus();
  }
  explore.addEventListener('click', () => setExplore(true));
  closeBtn.addEventListener('click', () => setExplore(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && exploring) setExplore(false); });

  const resize = () => {
    const w = stage.clientWidth, hh = stage.clientHeight;
    if (!w || !hh) return;
    renderer.setSize(w, hh, false);
    camera.aspect = w / hh; dist = w < hh ? 3.5 / (w / hh) : 3.6; camera.updateProjectionMatrix(); // fit the globe to the narrow side
    lineMat.resolution.set(w, hh);
    dirty = true;
  };
  new ResizeObserver(resize).observe(stage);
  resize();
  let visible = false, last = performance.now();
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; dirty = true; }, { threshold: 0.05 }).observe(stage);
  const q = new THREE.Vector3();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!visible) return;
    if (exploring) controls.update();
    else {
      if (idle > 0) idle -= dt; else if (!reduced && dragX === null) { yaw += dt * 0.12; dirty = true; }
      camFromYaw();
    }
    if (!dirty) return;
    sun.position.copy(camera.position).add(new THREE.Vector3(2, 3, 1));
    renderer.render(scene, camera);
    dirty = false;
    // label for the Indian Ocean low (hidden when it is on the far side)
    q.copy(lowMarker.position);
    const facing = q.clone().normalize().dot(camera.position.clone().normalize()) > 0.15;
    q.project(camera);
    lab.style.opacity = facing ? '1' : '0';
    const lx = ((q.x + 1) / 2) * stage.clientWidth, flip = lx > stage.clientWidth * 0.5; // keep the label inside the stage
    lab.style.transform = `translate(${lx + (flip ? -14 : 14)}px, ${((1 - q.y) / 2) * stage.clientHeight}px) translate(${flip ? '-100%' : '0'}, -50%)`;
  };
  lab.textContent = `Indian Ocean low: ${fmt(low.height_m, 1)} m`;
  requestAnimationFrame(loop);
}
