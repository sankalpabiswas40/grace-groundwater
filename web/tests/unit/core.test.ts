import { describe, expect, it } from 'vitest';
import { calendarMonths, decodeFrames, decodeInt8, evalFit, makeFrames, makeIndia3D, type Grid } from '../../src/data';
import { bouguerMicroGal, columnHeightUnits, COLUMN_BASE_CM, G, geoidRadius, orbitalSpeed, rangeChange, subsolarPoint, waterTableChange } from '../../src/physics';

describe('data loader', () => {
  it('decodes Int16 millimetres to cm and maps the sentinel to NaN', () => {
    const buf = new ArrayBuffer(8);
    const dv = new DataView(buf);
    dv.setInt16(0, 123, true); dv.setInt16(2, -32768, true); dv.setInt16(4, -456, true); dv.setInt16(6, 0, true);
    const out = decodeFrames(buf, -32768);
    expect(out[0]).toBeCloseTo(12.3, 5);
    expect(Number.isNaN(out[1])).toBe(true);
    expect(out[2]).toBeCloseTo(-45.6, 5);
    expect(out[3]).toBe(0);
  });
  it('indexes blocks, months and cells correctly', () => {
    const grid = { shape: [2, 2, 3] } as unknown as Grid;
    const data = new Float32Array(2 * 2 * 2 * 3).map((_, i) => i);
    const f = makeFrames(grid, data);
    expect(f.at(0, 0, 0, 0)).toBe(0);
    expect(f.at(0, 1, 1, 2)).toBe(11);
    expect(f.at(1, 0, 0, 0)).toBe(12);
    expect(Array.from(f.cellSeries(1, 1, 2))).toEqual([17, 23]);
    expect(f.frame(1, 1).length).toBe(6);
    expect(() => makeFrames(grid, new Float32Array(5))).toThrow();
  });
  it('decodes the India 3D file (Int8 cm, sentinel to NaN) and indexes it', () => {
    const raw = new Int8Array([1, -128, 3, 4, 5, 6, 7, 8]); // 2 blocks x 2 months x 2 cells
    const f = decodeInt8(raw.buffer, -128);
    expect(Number.isNaN(f[1])).toBe(true);
    const d = makeIndia3D({ months: ['2002-04', '2002-05'], n_cells: 2, cell_lat: [10, 11], cell_lon: [77, 78], gldas_last_month: '2002-05' }, f);
    expect(d.value(0, 0, 0)).toBe(1);
    expect(d.value(0, 1, 1)).toBe(4);
    expect(d.value(1, 0, 0)).toBe(5);
    expect(d.value(1, 1, 1)).toBe(8);
    expect(() => makeIndia3D({ months: ['a'], n_cells: 3, cell_lat: [], cell_lon: [], gldas_last_month: '' }, f)).toThrow();
  });
  it('builds a calendar month list across year ends', () => {
    expect(calendarMonths('2017-11', '2018-02')).toEqual(['2017-11', '2017-12', '2018-01', '2018-02']);
    expect(calendarMonths('2002-04', '2026-09').length).toBe(294);
  });
  it('evaluates the fitted model parts', () => {
    const fit = { coef: [1, -2, 3, 0, 0, 0], t0: 2014 } as never;
    expect(evalFit(fit, 2015, { trend: true })).toBeCloseTo(-1, 9);
    expect(evalFit(fit, 2015, { seasonal: true })).toBeCloseTo(3, 9);
    expect(evalFit(fit, 2014.5)).toBeCloseTo(1 - 1 - 3, 9);
  });
});

describe('physics', () => {
  it('Bouguer slab: 1 cm of water = 0.419 microGal', () => {
    expect(bouguerMicroGal(0.01) / 0.419).toBeCloseTo(1, 2);
  });
  it('orbital speed at 500 km is about 7.6 km/s', () => {
    expect(orbitalSpeed(500e3) / 1000).toBeCloseTo(7.61, 1);
  });
  it('range-change formula matches direct numerical integration', () => {
    const M = 1e13, h = 500e3, L = 220e3, v = orbitalSpeed(h), X = 2e8; // start very far away so both start at rest
    // integrate along-track acceleration twice for each satellite along a straight path
    const dt = 0.5;
    const sim = (offset: number) => {
      let dv = 0, dx = 0;
      const out: number[] = [];
      for (let xm = -X; xm <= X; xm += v * dt) {
        const s = xm + offset;
        dv += (-G * M * s) / Math.pow(s * s + h * h, 1.5) * dt;
        dx += dv * dt;
        out.push(dx);
      }
      return out;
    };
    const lead = sim(L / 2), trail = sim(-L / 2);
    const n = Math.floor(lead.length / 2);
    const numeric = lead[n] - trail[n];
    const analytic = rangeChange(0, M, h, L, v) - rangeChange(-X, M, h, L, v);
    expect(numeric / analytic).toBeCloseTo(1, 2);
    expect(analytic * 1e6).toBeGreaterThan(1); // micrometres, plausible size
    expect(analytic * 1e6).toBeLessThan(20);
  });
  it('3D column height matches the displayed exaggeration', () => {
    // at 8 km per cm: average cell = 60 cm * 8 km = 480 km = 480/6371 Earth radii
    expect(COLUMN_BASE_CM).toBe(60);
    expect(columnHeightUnits(0, 8)).toBeCloseTo(480 / 6371, 12);
    expect(columnHeightUnits(10, 8) - columnHeightUnits(0, 8)).toBeCloseTo(80 / 6371, 12); // +10 cm = +80 km
    expect(columnHeightUnits(-60, 8)).toBe(0);
    expect(columnHeightUnits(-90, 8)).toBe(0); // never negative
    expect(columnHeightUnits(5, 20) / columnHeightUnits(5, 10)).toBeCloseTo(2, 12);
  });
  it('geoid globe radius matches the displayed exaggeration', () => {
    expect(geoidRadius(0, 5000)).toBe(1);
    expect(geoidRadius(-100, 1)).toBeCloseTo(1 - 100 / 6371000, 12); // true scale: invisible
    expect(geoidRadius(-100, 10000)).toBeCloseTo(1 - 1000 / 6371, 12); // 100 m drawn as 1000 km
    expect((geoidRadius(80, 5000) - 1) / (geoidRadius(80, 1000) - 1)).toBeCloseTo(5, 9);
  });
  it('water-table conversion dh = dGWS / Sy', () => {
    expect(waterTableChange(-12, 0.12)).toBeCloseTo(-1, 12);
  });
  it('Sun position matches reference values', () => {
    // March equinox 2024: 20 March 03:06 UTC, declination ~ 0
    expect(Math.abs(subsolarPoint(new Date(Date.UTC(2024, 2, 20, 3, 6))).lat)).toBeLessThan(0.05);
    // June solstice 2024: 20 June 20:51 UTC, declination ~ +23.44
    expect(subsolarPoint(new Date(Date.UTC(2024, 5, 20, 20, 51))).lat).toBeCloseTo(23.44, 1);
    // 3 Nov 2024 12:00 UTC: equation of time +16.5 min -> subsolar longitude ~ -4.1 deg, declination ~ -15.1
    const p = subsolarPoint(new Date(Date.UTC(2024, 10, 3, 12, 0)));
    expect(p.lon).toBeGreaterThan(-4.4); expect(p.lon).toBeLessThan(-3.8);
    expect(p.lat).toBeGreaterThan(-15.5); expect(p.lat).toBeLessThan(-14.8);
  });
});
