// Physics used on the site. Every formula here is checked numerically in tests.

export const G = 6.6743e-11; // m^3 kg^-1 s^-2
export const RHO_WATER = 1000; // kg m^-3
export const MICROGAL = 1e-8; // m s^-2
export const GM_EARTH = 3.986004418e14; // m^3 s^-2
export const R_EARTH = 6371e3; // m

/** Bouguer slab: delta_g = 2*pi*G*rho*h, in microGal, for a water layer h metres thick. */
export function bouguerMicroGal(hMetres: number): number {
  return (2 * Math.PI * G * RHO_WATER * hMetres) / MICROGAL;
}

/** Circular orbital speed at altitude h (m): v = sqrt(GM/(R+h)). */
export function orbitalSpeed(hMetres: number): number {
  return Math.sqrt(GM_EARTH / (R_EARTH + hMetres));
}

/**
 * Simplified along-track model of the range change between two satellites that
 * fly a straight line at height h above a point mass M (kg), separated by L.
 * x is the along-track position of the pair's midpoint relative to the mass (m).
 *
 * Each satellite's along-track speed changes by dv = GM/(v*sqrt(s^2+h^2)) (energy),
 * so its along-track displacement is dx(s) = (GM/v^2)*asinh(s/h) + const.
 * Range change = dx(lead) - dx(trail) minus its value far away (which is zero).
 * Returns metres. Flat Earth, point mass, no orbit dynamics: schematic only.
 */
export function rangeChange(x: number, M: number, h: number, L: number, v: number): number {
  const k = (G * M) / (v * v);
  return k * (Math.asinh((x + L / 2) / h) - Math.asinh((x - L / 2) / h));
}

/** Far-field value subtracted so the curve starts at zero at x = -xFar. */
export function rangeChangeRel(x: number, M: number, h: number, L: number, v: number, xFar: number): number {
  return rangeChange(x, M, h, L, v) - rangeChange(-xFar, M, h, L, v);
}

/** Water-table change (m) from a groundwater storage change (cm): dh = dGWS / Sy. */
export function waterTableChange(dGwsCm: number, sy: number): number {
  return dGwsCm / 100 / sy;
}

/**
 * Sub-solar point (latitude, longitude in degrees) for a date, from the
 * low-precision solar position formulas of the Astronomical Almanac
 * (accuracy about 0.01 degree between 1950 and 2050).
 */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days from J2000.0
  const Lm = 280.46 + 0.9856474 * n; // mean longitude
  const g = (357.528 + 0.9856003 * n) * rad; // mean anomaly
  const lambda = (Lm + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad; // ecliptic longitude
  const eps = (23.439 - 0.0000004 * n) * rad; // obliquity
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = 280.46061837 + 360.98564736629 * n; // Greenwich mean sidereal time, degrees
  let lon = (ra - gmst) % 360;
  if (lon > 180) lon -= 360;
  if (lon < -180) lon += 360;
  return { lat: dec / rad, lon };
}

/** Unit vector for (lat, lon) in the three.js sphere convention used on this site. */
export function latLonToVec(latDeg: number, lonDeg: number): [number, number, number] {
  const p = (latDeg * Math.PI) / 180;
  const l = (lonDeg * Math.PI) / 180;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), -Math.cos(p) * Math.sin(l)];
}
