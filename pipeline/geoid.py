"""Geoid heights from the EGM2008 gravity model, truncated to a low degree.

Run from the project folder (after download.py geoid):
    python pipeline/geoid.py

Method (first-order, good to well under a metre at this truncation):
    T(r, psi, lam) = GM/r * sum_{n=2..N} (a/r)^n sum_{m=0..n} (dC_nm cos m lam + S_nm sin m lam) P_nm(sin psi)
    N_geoid = T / gamma                                   (Bruns' formula)
where dC_nm are the model coefficients minus the even zonal terms of the GRS80
reference ellipsoid, the point (r, psi) lies on the ellipsoid, P_nm are fully
normalised associated Legendre functions and gamma is normal gravity there.
The degree-0 term and the height-dependent topographic correction are not applied.

Writes web/public/data/geoid.json and geoid.bin (Int16 centimetres, rows south to north).
"""
import json

import numpy as np

import config as C

# GRS80 defining constants (Moritz 2000, Geodetic Reference System 1980)
GRS80_A = 6378137.0
GRS80_GM = 3986005e8
GRS80_J2 = 108263e-8
GRS80_OMEGA = 7292115e-11
GRS80_F = 1 / 298.257222101
GRID_STEP = 2.0


def read_gfc(path, nmax):
    gm = a = None
    Cc = np.zeros((nmax + 1, nmax + 1)); S = np.zeros((nmax + 1, nmax + 1))
    tide = None
    for line in open(path):
        p = line.split()
        if not p:
            continue
        if p[0] == "earth_gravity_constant":
            gm = float(p[1].replace("D", "E").replace("d", "e"))
        elif p[0] == "radius":
            a = float(p[1].replace("D", "E").replace("d", "e"))
        elif p[0] == "tide_system":
            tide = p[1]
        elif p[0].startswith("gfc") and len(p) >= 5:
            n, m = int(p[1]), int(p[2])
            if n <= nmax:
                Cc[n, m] = float(p[3].replace("D", "E").replace("d", "e"))
                S[n, m] = float(p[4].replace("D", "E").replace("d", "e"))
    if gm is None or a is None:
        raise SystemExit("Gravity model header is missing GM or radius. Stopping.")
    return gm, a, Cc, S, tide


def legendre_normalised(nmax, x):
    """Fully normalised associated Legendre functions P[n, m] at x = sin(latitude).
    Normalisation: mean square over the sphere of P_nm * cos/sin(m lam) is 1."""
    x = np.asarray(x, float)
    u = np.sqrt(1 - x * x)
    P = np.zeros((nmax + 1, nmax + 1) + x.shape)
    P[0, 0] = 1.0
    if nmax >= 1:
        P[1, 1] = np.sqrt(3.0) * u
    for n in range(2, nmax + 1):
        P[n, n] = np.sqrt((2 * n + 1) / (2 * n)) * u * P[n - 1, n - 1]
    for m in range(0, nmax):
        P[m + 1, m] = np.sqrt(2 * m + 3) * x * P[m, m]
        for n in range(m + 2, nmax + 1):
            a = np.sqrt((4 * n * n - 1) / ((n - m) * (n + m)))
            b = np.sqrt(((2 * n + 1) * (n + m - 1) * (n - m - 1)) / ((2 * n - 3) * (n + m) * (n - m)))
            P[n, m] = a * x * P[n - 1, m] - b * P[n - 2, m]
    return P


def grs80_normal_zonals(nmax_even=8):
    """Fully normalised even zonal coefficients C_{2k,0} of the GRS80 normal field,
    from its defining constants (closed formula, e.g. Heiskanen & Moritz)."""
    e2 = GRS80_F * (2 - GRS80_F)
    out = {}
    for k in range(1, nmax_even // 2 + 1):
        n = 2 * k
        J = (-1) ** (k + 1) * 3 * e2 ** k / ((2 * k + 1) * (2 * k + 3)) * (1 - k + 5 * k * GRS80_J2 / e2)
        out[n] = -J / np.sqrt(2 * n + 1)
    return out


def geoid_heights(gm, a, Cc, S, lat_deg, lon_deg):
    """Geoid height (m) on a lat/lon grid (geodetic latitude). Returns (nlat, nlon)."""
    nmax = Cc.shape[0] - 1
    dC = Cc.copy()
    for n, c in grs80_normal_zonals().items():
        if n <= nmax:
            dC[n, 0] -= c * (GRS80_GM / gm) * (GRS80_A / a) ** n   # rescale to the model's GM and a
    lat = np.deg2rad(np.asarray(lat_deg, float)); lon = np.deg2rad(np.asarray(lon_deg, float))
    e2 = GRS80_F * (2 - GRS80_F)
    Nprime = GRS80_A / np.sqrt(1 - e2 * np.sin(lat) ** 2)
    xy = Nprime * np.cos(lat); z = Nprime * (1 - e2) * np.sin(lat)
    r = np.hypot(xy, z); psi = np.arctan2(z, xy)                   # geocentric radius and latitude
    P = legendre_normalised(nmax, np.sin(psi))                      # (n, m, nlat)
    m = np.arange(nmax + 1)
    cosml = np.cos(np.outer(m, lon)); sinml = np.sin(np.outer(m, lon))   # (m, nlon)
    T = np.zeros((lat.size, lon.size))
    for n in range(2, nmax + 1):
        # sum over m of P[n, m, lat] * (dC cos + S sin)[m, lon]
        term = np.einsum("ml,mk->lk", P[n, : n + 1] * dC[n, : n + 1, None], cosml[: n + 1]) \
            + np.einsum("ml,mk->lk", P[n, : n + 1] * S[n, : n + 1, None], sinml[: n + 1])
        T += ((a / r) ** n)[:, None] * term
    T *= (gm / r)[:, None]
    # normal gravity on the ellipsoid, to about 0.1 per cent (enough for N to the centimetre level here)
    gamma = GRS80_GM / r**2 * (1 - 1.5 * GRS80_J2 * (GRS80_A / r) ** 2 * (3 * np.sin(psi) ** 2 - 1)) \
        - GRS80_OMEGA**2 * r * np.cos(psi) ** 2
    return T / gamma[:, None]


def main():
    nmax = C.GEOID_NMAX
    path = C.RAW / "geoid" / f"EGM2008_to_degree_{nmax}.gfc"
    if not path.exists():
        raise SystemExit("Gravity model not downloaded. Run: python pipeline/download.py geoid")
    gm, a, Cc, S, tide = read_gfc(path, nmax)
    lat = np.arange(-90, 90 + 1e-9, GRID_STEP); lon = np.arange(0, 360, GRID_STEP)
    N = geoid_heights(gm, a, Cc, S, lat, lon)

    def extreme(mask, fn):
        v = np.where(mask, N, np.nan)
        j, i = np.unravel_index(fn(v), v.shape)
        return {"height_m": round(float(N[j, i]), 1), "lat": float(lat[j]), "lon": float(lon[i])}
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    everywhere = np.ones_like(N, bool)
    indian = (LAT >= -15) & (LAT <= 25) & (LON >= 55) & (LON <= 100)
    cm = np.round(N * 100)
    if np.abs(cm).max() > 32000:
        raise SystemExit("Geoid height does not fit Int16 centimetres. Stopping.")
    C.OUT.mkdir(parents=True, exist_ok=True)
    (C.OUT / "geoid.bin").write_bytes(cm.astype("<i2").tobytes())
    meta = {
        "model": "EGM2008", "max_degree_used": nmax, "tide_system": tide, "grid_step_deg": GRID_STEP,
        "lat": [float(x) for x in lat], "lon": [float(x) for x in lon],
        "file": "geoid.bin", "dtype": "int16-le", "unit": "cm",
        "global_min": extreme(everywhere, np.nanargmin), "global_max": extreme(everywhere, np.nanargmax),
        "indian_ocean_low": extreme(indian, np.nanargmin),
        "reference_ellipsoid": "GRS80",
        "citation": "Pavlis, Holmes, Kenyon & Factor (2012), J. Geophys. Res. 117, B04406, doi:10.1029/2011JB008916; "
                    "coefficients from the ICGEM service, GFZ Potsdam",
        "method": "T/gamma (Bruns) on the GRS80 ellipsoid, degrees 2 to %d, sampled every %g degrees; "
                  "values at this truncation are smoother than the full model" % (nmax, GRID_STEP),
    }
    (C.OUT / "geoid.json").write_text(json.dumps(meta, separators=(",", ":")))
    total = sum(p.stat().st_size for p in C.OUT.iterdir())
    print(json.dumps({k: meta[k] for k in ("max_degree_used", "tide_system", "global_min", "global_max", "indian_ocean_low")}, indent=1))
    print(f"data folder total {total/1e6:.2f} MB")
    if total > 3e6:
        raise SystemExit("Output exceeds the 3 MB budget. Stopping.")


if __name__ == "__main__":
    main()
