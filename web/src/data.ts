// Data loading. All numbers shown as data come from files written by the pipeline.

export interface Grid {
  lat: number[];
  lon: number[];
  months: string[];
  shape: [number, number, number];
  frames: { file: string; nan_sentinel: number; blocks: string[] };
  missing_reason: Record<string, string>;
  gws_missing_reason: Record<string, string>;
  region_fraction: number[];
  cell_area_km2: number[];
}
export interface Fit {
  slope_cm_per_yr: number;
  slope_se_cm_per_yr: number;
  annual_amp_cm: number;
  n_months: number;
  t0: number;
  coef: number[];
  first_month: string;
  last_month: string;
}
export interface RegionSeries {
  months: string[];
  t_decimal_year: number[];
  series: Record<string, (number | null)[]>;
  fits: Record<string, { full: Fit; rodell_period: Fit }>;
}
export interface TrendMap {
  [k: string]: (number | null)[] | string;
}
/* eslint-disable @typescript-eslint/no-explicit-any */
export type Meta = any;

const base = import.meta.env.BASE_URL;
export const url = (p: string) => base + p.replace(/^\//, '');

const cache = new Map<string, Promise<unknown>>();
export function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(url(path)).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${path} (${r.status})`);
        return r.json();
      }),
    );
  }
  return cache.get(path) as Promise<T>;
}

/** Decode Int16 millimetres to Float32 centimetres; the sentinel becomes NaN. */
export function decodeFrames(buf: ArrayBuffer, sentinel: number): Float32Array {
  const view = new DataView(buf);
  const n = buf.byteLength / 2;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const v = view.getInt16(i * 2, true);
    out[i] = v === sentinel ? NaN : v / 10;
  }
  return out;
}

export interface Frames {
  grid: Grid;
  data: Float32Array;
  nt: number;
  ny: number;
  nx: number;
  /** value in cm for block (0 = TWS, 1 = GWS), month index, row (south to north), column */
  at(block: number, t: number, j: number, i: number): number;
  frame(block: number, t: number): Float32Array;
  cellSeries(block: number, j: number, i: number): Float32Array;
}

let framesPromise: Promise<Frames> | null = null;
export function loadFrames(): Promise<Frames> {
  if (!framesPromise) {
    framesPromise = (async () => {
      const grid = await getJSON<Grid>('data/grid.json');
      const r = await fetch(url('data/' + grid.frames.file));
      if (!r.ok) throw new Error('Could not load frames.bin');
      const data = decodeFrames(await r.arrayBuffer(), grid.frames.nan_sentinel);
      return makeFrames(grid, data);
    })();
  }
  return framesPromise;
}

export function makeFrames(grid: Grid, data: Float32Array): Frames {
  const [nt, ny, nx] = grid.shape;
  if (data.length !== 2 * nt * ny * nx) throw new Error('frames.bin has an unexpected size');
  const size = ny * nx;
  return {
    grid,
    data,
    nt,
    ny,
    nx,
    at: (b, t, j, i) => data[(b * nt + t) * size + j * nx + i],
    frame: (b, t) => data.subarray((b * nt + t) * size, (b * nt + t + 1) * size),
    cellSeries: (b, j, i) => {
      const out = new Float32Array(nt);
      for (let t = 0; t < nt; t++) out[t] = data[(b * nt + t) * size + j * nx + i];
      return out;
    },
  };
}

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function monthLabel(m: string): string {
  return `${MONTH_NAMES[parseInt(m.slice(5), 10) - 1]} ${m.slice(0, 4)}`;
}

/** Evaluate the fitted model. parts: which terms to include. */
export function evalFit(fit: Fit, t: number, parts: { trend?: boolean; seasonal?: boolean } = { trend: true, seasonal: true }): number {
  const [a, b, c, d, e, f] = fit.coef;
  const x = t - fit.t0;
  let y = 0;
  if (parts.trend) y += a + b * x;
  if (parts.seasonal)
    y += c * Math.cos(2 * Math.PI * x) + d * Math.sin(2 * Math.PI * x) + e * Math.cos(4 * Math.PI * x) + f * Math.sin(4 * Math.PI * x);
  return y;
}

export function fmt(x: number, digits = 1): string {
  return x.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Every calendar month from first to last (YYYY-MM), inclusive. */
export function calendarMonths(first: string, last: string): string[] {
  let y = +first.slice(0, 4), m = +first.slice(5);
  const y1 = +last.slice(0, 4), m1 = +last.slice(5), out: string[] = [];
  while (y < y1 || (y === y1 && m <= m1)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m === 13) { m = 1; y++; }
  }
  return out;
}

/** Decode Int8 whole centimetres; the sentinel becomes NaN. */
export function decodeInt8(buf: ArrayBuffer, sentinel: number): Float32Array {
  const src = new Int8Array(buf), out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] === sentinel ? NaN : src[i];
  return out;
}

export interface India3D {
  months: string[]; // only months that have a satellite solution
  nCells: number;
  lat: number[];
  lon: number[];
  gldasLast: string;
  /** cm for block (0 = TWS, 1 = GWS), stored-month index, cell */
  value(block: number, m: number, c: number): number;
}
export function makeIndia3D(meta: { months: string[]; n_cells: number; cell_lat: number[]; cell_lon: number[]; gldas_last_month: string }, data: Float32Array): India3D {
  const nm = meta.months.length, n = meta.n_cells;
  if (data.length !== 2 * nm * n) throw new Error('india3d.bin has an unexpected size');
  return { months: meta.months, nCells: n, lat: meta.cell_lat, lon: meta.cell_lon, gldasLast: meta.gldas_last_month, value: (b, m, c) => data[(b * nm + m) * n + c] };
}
let indiaPromise: Promise<India3D> | null = null;
export function loadIndia3D(): Promise<India3D> {
  if (!indiaPromise) {
    indiaPromise = (async () => {
      const meta = await getJSON<{ months: string[]; n_cells: number; cell_lat: number[]; cell_lon: number[]; gldas_last_month: string; file: string; nan_sentinel: number }>('data/india3d.json');
      const r = await fetch(url('data/' + meta.file));
      if (!r.ok) throw new Error('Could not load india3d.bin');
      return makeIndia3D(meta, decodeInt8(await r.arrayBuffer(), meta.nan_sentinel));
    })();
  }
  return indiaPromise;
}
