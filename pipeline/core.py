"""Pure maths used by the pipeline. Everything here is covered by tests."""
import numpy as np

R_EARTH_KM = 6371.0
G = 6.67430e-11          # m^3 kg^-1 s^-2 (CODATA 2018)
RHO_WATER = 1000.0       # kg m^-3
MICROGAL = 1e-8          # m s^-2


def cell_area_km2(lat_edges_deg, dlon_deg, R=R_EARTH_KM):
    """A = R^2 * dlon * (sin(lat2) - sin(lat1)); returns one area per latitude band."""
    lat = np.deg2rad(np.asarray(lat_edges_deg, dtype=float))
    return R**2 * np.deg2rad(dlon_deg) * (np.sin(lat[1:]) - np.sin(lat[:-1]))


def area_grid_km2(lat_centres, lon_centres):
    """Cell areas (nlat, nlon) for a regular grid given by its cell centres."""
    lat = np.asarray(lat_centres, float); lon = np.asarray(lon_centres, float)
    dlat = abs(lat[1] - lat[0]); dlon = abs(lon[1] - lon[0])
    a = R_EARTH_KM**2 * np.deg2rad(dlon) * (
        np.sin(np.deg2rad(lat + dlat / 2)) - np.sin(np.deg2rad(lat - dlat / 2)))
    return np.repeat(a[:, None], lon.size, axis=1)


def bouguer_microgal(h_m, rho=RHO_WATER):
    """Bouguer slab: delta_g = 2*pi*G*rho*h, returned in microGal."""
    return 2 * np.pi * G * rho * h_m / MICROGAL


def design(t):
    """Columns: 1, t, cos2pi t, sin2pi t, cos4pi t, sin4pi t (t in decimal years)."""
    t = np.asarray(t, float)
    return np.column_stack([np.ones_like(t), t, np.cos(2*np.pi*t), np.sin(2*np.pi*t),
                            np.cos(4*np.pi*t), np.sin(4*np.pi*t)])


def fit_trend(t, y, t0=None):
    """Least squares on available (finite) months only.
    Returns dict with coefficients, slope b, its standard error, annual amplitude, n, rms.
    t0 is subtracted from t for numerical conditioning (slope is unaffected)."""
    t = np.asarray(t, float); y = np.asarray(y, float)
    ok = np.isfinite(y)
    n = int(ok.sum())
    if n < 24:
        return None
    if t0 is None:
        t0 = float(np.round(t[ok].mean()))
    X = design(t[ok] - t0)
    coef, *_ = np.linalg.lstsq(X, y[ok], rcond=None)
    res = y[ok] - X @ coef
    dof = n - X.shape[1]
    s2 = float(res @ res) / dof
    cov = s2 * np.linalg.inv(X.T @ X)
    return {"coef": coef, "t0": t0, "slope": float(coef[1]),
            "slope_se": float(np.sqrt(cov[1, 1])),
            "annual_amp": float(np.hypot(coef[2], coef[3])),
            "semiannual_amp": float(np.hypot(coef[4], coef[5])),
            "n": n, "rms_resid": float(np.sqrt(s2))}


def fit_slopes_grid(t, cube, min_n=24):
    """Per-cell slope for cube (ntime, nlat, nlon); cells need all-or-nothing months
    handled individually. Returns slope array with NaN where not enough data."""
    nt, ny, nx = cube.shape
    out = np.full((ny, nx), np.nan)
    t0 = float(np.round(np.mean(t)))
    for j in range(ny):
        for i in range(nx):
            f = fit_trend(t, cube[:, j, i], t0=t0) if np.isfinite(cube[:, j, i]).sum() >= min_n else None
            if f:
                out[j, i] = f["slope"]
    return out


def weighted_mean(field, weights):
    """Area-weighted mean over cells where field is finite and weight > 0."""
    w = np.where(np.isfinite(field), weights, 0.0)
    s = w.sum()
    return float(np.nansum(field * w) / s) if s > 0 else float("nan")


def volume_rate_km3(slope_cm_per_yr, area_km2, weights=None):
    """km^3/yr = sum(b_cell [m/yr] * A_cell [m^2]) / 1e9."""
    b_m = np.asarray(slope_cm_per_yr, float) / 100.0
    a_m2 = np.asarray(area_km2, float) * 1e6
    if weights is not None:
        a_m2 = a_m2 * weights
    return float(np.nansum(b_m * a_m2) / 1e9)


def water_table_change_m(dgws_cm, sy):
    """delta_h = delta_GWS / Sy  (an estimate, not a measurement)."""
    return (np.asarray(dgws_cm, float) / 100.0) / sy
