import { describe, expect, it } from 'vitest';
import { decodeFrames, evalFit, makeFrames, type Grid } from '../../src/data';
import { bouguerMicroGal, G, orbitalSpeed, rangeChange, subsolarPoint, waterTableChange } from '../../src/physics';

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
