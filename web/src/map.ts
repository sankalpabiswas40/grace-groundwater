// The main interactive map: canvas grid + SVG boundaries, D3.
import * as d3 from 'd3';
import { evalFit, fmt, getJSON, loadFrames, monthLabel, type Frames, type TrendMap } from './data';

// Colour-blind-safe diverging scale: brown (loss) - white - blue (gain).
const STOPS = ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f7f7f7', '#d1e5f0', '#92c5de', '#4393c3', '#2166ac', '#053061'];
export const diverging = d3.interpolateRgbBasis(STOPS);
const RANGE_CM = 40; // monthly anomaly colour range, cm
const RANGE_MM = 60; // trend colour range, mm/yr

const CITIES: [string, number, number][] = [
  ['Delhi', 28.61, 77.21], ['Chandigarh', 30.73, 76.78], ['Jaipur', 26.91, 75.79], ['Lucknow', 26.85, 80.95],
];

export interface MapHandle {
  play(): void;
  pause(): void;
  isPlaying(): boolean;
  setMonth(i: number): void;
}

export async function initMap(): Promise<MapHandle> {
  const [frames, trend, states, outlines] = await Promise.all([
    loadFrames(),
    getJSON<TrendMap>('data/trend_map.json'),
    getJSON<GeoJSON.FeatureCollection>('geo/states.geojson'),
    getJSON<{ nw: GeoJSON.Geometry }>('geo/outlines.json'),
  ]);
  const { grid, nt, ny, nx } = frames;
  const stage = document.getElementById('map-stage')!;
  const canvas = document.getElementById('map-canvas') as HTMLCanvasElement;
  const svg = d3.select<SVGSVGElement, unknown>('#map-svg');
  const ctx = canvas.getContext('2d')!;
  const slider = document.getElementById('map-slider') as HTMLInputElement;
  const monthOut = document.getElementById('map-month')!;
  const playBtn = document.getElementById('map-play') as HTMLButtonElement;
  const nodata = document.getElementById('map-nodata')!;
  const nodataWhy = document.getElementById('map-nodata-why')!;
  const popup = document.getElementById('map-popup')!;

  const lat0 = grid.lat[0] - 0.25, lat1 = grid.lat[ny - 1] + 0.25;
  const lon0 = grid.lon[0] - 0.25, lon1 = grid.lon[nx - 1] + 0.25;
  const box: GeoJSON.Feature = {
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[lon0, lat0], [lon0, lat1], [lon1, lat1], [lon1, lat0], [lon0, lat0]]] },
  };
  const proj = d3.geoMercator();
  const path = d3.geoPath(proj);
  let W = 0, H = 0;
  const xs = new Float64Array(nx + 1), ys = new Float64Array(ny + 1);

  const state = { q: 0 as 0 | 1, view: 'month' as 'month' | 'trend', t: 0, speed: 1, playing: false, sel: null as null | [number, number] };
  // start on the first month that has data
  slider.max = String(nt - 1);

  function layout() {
    W = stage.clientWidth;
    proj.fitWidth(W, box);
    const b = path.bounds(box);
    H = Math.ceil(b[1][1] - b[0][1]);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    svg.attr('viewBox', `0 0 ${W} ${H}`).style('height', H + 'px');
    for (let i = 0; i <= nx; i++) xs[i] = proj([lon0 + i * 0.5, 0])![0];
    for (let j = 0; j <= ny; j++) ys[j] = proj([0, lat0 + j * 0.5])![1];
    svg.selectAll('*').remove();
    svg.append('g').selectAll('path').data(states.features).join('path').attr('class', 'state').attr('d', path as never);
    svg.append('path').attr('class', 'nw').attr('d', path(outlines.nw as never));
    const cg = svg.append('g').selectAll('g').data(CITIES).join('g').attr('class', 'city')
      .attr('transform', (d) => { const p = proj([d[2], d[1]])!; return `translate(${p[0]},${p[1]})`; });
    cg.append('circle').attr('r', 3);
    cg.append('text').attr('x', 6).attr('y', (d) => (d[0] === 'Jaipur' ? 12 : -5)).text((d) => d[0]);
    svg.append('rect').attr('class', 'sel').attr('visibility', 'hidden');
    svg.append('rect').attr('class', 'hit').attr('width', W).attr('height', H)
      .on('click', (ev: MouseEvent) => pick(ev))
      .on('mousemove', (ev: MouseEvent) => { if (window.matchMedia('(hover:hover)').matches && !pinned) pick(ev, true); })
      .on('mouseleave', () => { if (!pinned) closePopup(); });
    draw();
  }

  function trendField(): (number | null)[] {
    return trend[state.q === 0 ? 'tws_jpl' : 'gws_jpl'] as (number | null)[];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-alt') || '#eee';
    ctx.fillRect(0, 0, W, H);
    const month = grid.months[state.t];
    let anyData = false;
    const isTrend = state.view === 'trend';
    const f = isTrend ? null : frames.frame(state.q, state.t);
    const tf = isTrend ? trendField() : null;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v = isTrend ? tf![j * nx + i] : f![j * nx + i];
        if (v === null || Number.isNaN(v)) continue;
        anyData = true;
        const s = isTrend ? (v as number) / RANGE_MM : (v as number) / RANGE_CM;
        ctx.fillStyle = diverging(Math.max(0, Math.min(1, 0.5 + s / 2)));
        const x = xs[i], y = ys[j + 1];
        ctx.fillRect(x - 0.3, y - 0.3, xs[i + 1] - x + 0.6, ys[j] - y + 0.6);
      }
    }
    if (!isTrend && !anyData) {
      nodata.hidden = false;
      nodataWhy.textContent = grid.missing_reason[month] ?? (state.q === 1 ? grid.gws_missing_reason[month] : '') ?? 'No solution for this month';
    } else nodata.hidden = true;
    monthOut.textContent = isTrend ? 'trend' : monthLabel(month);
    slider.setAttribute('aria-valuetext', monthLabel(month));
    drawLegend();
  }

  function drawLegend() {
    const lc = document.getElementById('map-legend') as HTMLCanvasElement;
    const c = lc.getContext('2d')!;
    for (let x = 0; x < lc.width; x++) { c.fillStyle = diverging(x / (lc.width - 1)); c.fillRect(x, 0, 1, lc.height); }
    const isTrend = state.view === 'trend';
    const r = isTrend ? RANGE_MM : RANGE_CM;
    document.getElementById('map-legend-ticks')!.innerHTML = [-r, -r / 2, 0, r / 2, r].map((v) => `<span>${v > 0 ? '+' : ''}${v}</span>`).join('');
    const what = state.q === 0 ? 'Total water storage' : 'Groundwater storage';
    document.getElementById('map-legend-title')!.textContent = isTrend
      ? `${what} trend, mm/yr of water (brown = losing). Colours saturate beyond ±${r}.`
      : `${what} anomaly, cm of water vs 2004–2009 (blue = more, brown = less)`;
  }

  // ---- cell popup
  let pinned = false;
  function closePopup() { popup.hidden = true; pinned = false; svg.select('.sel').attr('visibility', 'hidden'); state.sel = null; }
  document.getElementById('popup-close')!.addEventListener('click', closePopup);

  function pick(ev: MouseEvent, hover = false) {
    const r = stage.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const ll = proj.invert!([px, py]);
    if (!ll) return;
    const i = Math.floor((ll[0] - lon0) / 0.5), j = Math.floor((ll[1] - lat0) / 0.5);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return;
    if (!hover) pinned = true;
    showPopup(j, i, px, py);
  }

  function showPopup(j: number, i: number, px: number, py: number) {
    state.sel = [j, i];
    svg.select('.sel').attr('visibility', 'visible').attr('x', xs[i]).attr('y', ys[j + 1]).attr('width', xs[i + 1] - xs[i]).attr('height', ys[j] - ys[j + 1]);
    const series = frames.cellSeries(state.q, j, i);
    const lat = grid.lat[j], lon = grid.lon[i];
    const what = state.q === 0 ? 'Total water' : 'Groundwater';
    document.getElementById('popup-title')!.textContent = `${what} · ${lat.toFixed(2)}°N ${lon.toFixed(2)}°E`;
    const tv = trendField()[j * nx + i];
    const finite = Array.from(series).filter((v) => !Number.isNaN(v));
    const ps = d3.select('#popup-svg');
    ps.selectAll('*').remove();
    if (!finite.length) {
      document.getElementById('popup-trend')!.textContent = 'No data for this cell (ocean or outside the land model).';
    } else {
      const x = d3.scaleLinear([0, nt - 1], [30, 274]);
      const ext = d3.extent(finite) as [number, number];
      const y = d3.scaleLinear([Math.min(ext[0], -1), Math.max(ext[1], 1)], [104, 8]).nice();
      const line = d3.line<number>().defined((d) => !Number.isNaN(d)).x((_, k) => x(k)).y((d) => y(d));
      ps.append('line').attr('x1', 30).attr('x2', 274).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--line)');
      ps.append('path').attr('d', line(Array.from(series))!).attr('fill', 'none').attr('stroke', 'var(--jpl)').attr('stroke-width', 1.3);
      ps.append('line').attr('x1', x(state.t)).attr('x2', x(state.t)).attr('y1', 8).attr('y2', 104).attr('stroke', 'var(--ink)').attr('stroke-dasharray', '2 2');
      y.ticks(3).forEach((v) => ps.append('text').attr('x', 26).attr('y', y(v) + 3).attr('text-anchor', 'end').text(v));
      [0, Math.floor(nt / 2), nt - 1].forEach((k) => ps.append('text').attr('x', x(k)).attr('y', 117).attr('text-anchor', k === 0 ? 'start' : k === nt - 1 ? 'end' : 'middle').text(grid.months[k].slice(0, 4)));
      document.getElementById('popup-trend')!.innerHTML = tv === null || tv === undefined
        ? 'Trend: not available'
        : `Trend: <b class="mono">${(tv as number) > 0 ? '+' : ''}${fmt(tv as number, 1)} mm/yr</b> (cm on the y-axis; this cell shares its ~300 km mascon with its neighbours)`;
    }
    popup.hidden = false;
    const pw = popup.offsetWidth, ph = popup.offsetHeight;
    popup.style.left = Math.max(8, Math.min(W - pw - 8, px + 14)) + 'px';
    popup.style.top = Math.max(8, Math.min(H - ph - 8, py - ph - 10 < 8 ? py + 14 : py - ph - 10)) + 'px';
  }

  // ---- controls
  function setMonth(i: number) {
    state.t = Math.max(0, Math.min(nt - 1, i));
    slider.value = String(state.t);
    draw();
    if (state.sel && !popup.hidden) {
      const [j, i2] = state.sel;
      d3.select('#popup-svg').selectAll('line[stroke-dasharray]').attr('x1', 30 + (244 * state.t) / (nt - 1)).attr('x2', 30 + (244 * state.t) / (nt - 1));
      void j; void i2;
    }
  }
  slider.addEventListener('input', () => { pause(); setMonth(+slider.value); });

  let timer = 0, lastStep = 0;
  function tick(now: number) {
    if (!state.playing) return;
    const interval = 420 / state.speed;
    if (now - lastStep >= interval) {
      lastStep = now;
      setMonth(state.t >= nt - 1 ? 0 : state.t + 1);
    }
    timer = requestAnimationFrame(tick);
  }
  function play() {
    if (state.playing) return;
    if (state.view === 'trend') setView('month');
    state.playing = true; playBtn.innerHTML = '&#10074;&#10074;'; playBtn.setAttribute('aria-label', 'Pause');
    lastStep = 0; timer = requestAnimationFrame(tick);
  }
  function pause() {
    state.playing = false; cancelAnimationFrame(timer);
    playBtn.innerHTML = '&#9654;'; playBtn.setAttribute('aria-label', 'Play');
  }
  playBtn.addEventListener('click', () => (state.playing ? pause() : play()));

  function seg(sel: string, attr: string, fn: (v: string) => void) {
    document.querySelectorAll<HTMLButtonElement>(sel).forEach((b) =>
      b.addEventListener('click', () => {
        document.querySelectorAll<HTMLButtonElement>(sel).forEach((o) => { o.classList.toggle('on', o === b); o.setAttribute('aria-pressed', String(o === b)); });
        fn(b.dataset[attr]!);
      }));
  }
  function setView(v: 'month' | 'trend') {
    state.view = v;
    document.querySelectorAll<HTMLButtonElement>('#map [data-v]').forEach((o) => { o.classList.toggle('on', o.dataset.v === v); o.setAttribute('aria-pressed', String(o.dataset.v === v)); });
    slider.disabled = v === 'trend';
    if (v === 'trend') pause();
    draw();
  }
  seg('#map [data-q]', 'q', (v) => { state.q = v === 'tws' ? 0 : 1; closePopup(); draw(); });
  seg('#map [data-v]', 'v', (v) => setView(v as 'month' | 'trend'));
  seg('#map [data-s]', 's', (v) => { state.speed = +v; });

  new ResizeObserver(() => { if (stage.clientWidth !== W) { closePopup(); layout(); } }).observe(stage);
  layout();
  // open on a monsoon month so the first view is informative
  setMonth(Math.max(0, grid.months.indexOf('2010-08')));
  void evalFit;
  return { play, pause, isPlaying: () => state.playing, setMonth };
}

export type { Frames };
