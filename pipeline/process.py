"""Process the real downloads into regional series, grids and trends.

Run from the project folder:   python pipeline/process.py
Writes pipeline/processed/processed.npz and pipeline/processed/summary.json.
No interpolation is done anywhere: a month without a GRACE solution stays NaN.
"""
import glob
import json

import numpy as np
import xarray as xr

import config as C
import core

PROC = C.PIPELINE / "processed"
RODELL_PERIOD = ("2002-08", "2008-10")


def month_list(first, last):
    y, m = map(int, first.split("-")); y1, m1 = map(int, last.split("-"))
    out = []
    while (y, m) <= (y1, m1):
        out.append(f"{y:04d}-{m:02d}")
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out


def decimal_year(months):
    return np.array([int(s[:4]) + (int(s[5:]) - 0.5) / 12 for s in months])


def target_grid():
    lat = np.arange(C.LAT_MIN + 0.25, C.LAT_MAX, 0.5)
    lon = np.arange(C.LON_MIN + 0.25, C.LON_MAX, 0.5)
    return lat, lon


def coarsen_quarter_to_half(field, lat_q, lon_q, lat, lon):
    """Area-weighted mean of the four 0.25-degree cells inside each 0.5-degree cell.
    field: (..., nlat_q, nlon_q). NaN cells are ignored; all-NaN gives NaN."""
    aq = core.area_grid_km2(lat_q, lon_q)
    out = np.full(field.shape[:-2] + (lat.size, lon.size), np.nan)
    for j, la in enumerate(lat):
        jj = np.where(np.abs(lat_q - la) < 0.2)[0]
        for i, lo in enumerate(lon):
            ii = np.where(np.abs(lon_q - lo) < 0.2)[0]
            assert jj.size == 2 and ii.size == 2, "grid alignment problem"
            blk = field[..., jj[:, None], ii[None, :]]
            w = np.where(np.isfinite(blk), aq[jj[:, None], ii[None, :]], 0.0)
            s = w.sum(axis=(-2, -1))
            with np.errstate(invalid="ignore", divide="ignore"):
                out[..., j, i] = np.where(s > 0, np.nansum(blk * w, axis=(-2, -1)) / s, np.nan)
    return out


def assign_months(times, months, label):
    """Map each solution to the calendar month of its mid-time. Stops on duplicates."""
    idx = {}
    for k, t in enumerate(times):
        key = str(np.datetime64(t, "M"))
        if key in idx:
            raise SystemExit(f"{label}: two solutions fall in calendar month {key}. Stopping.")
        if key in months:
            idx[key] = k
    return idx


def load_jpl(months, lat, lon):
    f = sorted(glob.glob(str(C.RAW / "jpl" / "*.nc")))[-1]
    ds = xr.open_dataset(f)
    sub = ds.sel(lat=slice(C.LAT_MIN, C.LAT_MAX), lon=slice(C.LON_MIN, C.LON_MAX))
    assert np.allclose(sub.lat.values, lat) and np.allclose(sub.lon.values, lon)
    # JPL time stamps are the mid-point of each solution's data span. A few solutions
    # near battery-limited periods have mid-points in a neighbouring calendar month, so
    # we use the product's own list of missing months as the authority.
    missing = set(ds.attrs["months_missing"].split(";"))
    all_m = month_list("2002-04", str(np.datetime64(ds.time.values[-1], "M")))
    have = [m for m in all_m if m not in missing]
    if len(have) != ds.time.size:
        raise SystemExit(f"JPL: {ds.time.size} solutions but {len(have)} non-missing months. Stopping.")
    lwe = np.full((len(months), lat.size, lon.size), np.nan)
    unc = np.full_like(lwe, np.nan)
    pos = {m: k for k, m in enumerate(months)}
    for k, m in enumerate(have):
        if m in pos:
            lwe[pos[m]] = sub.lwe_thickness.values[k]
            unc[pos[m]] = sub.uncertainty.values[k]
    land = sub.land_mask.values
    sf = sub.scale_factor.values
    mascon = sub.mascon_ID.values
    return lwe, unc, land, sf, mascon, sorted(missing), f


def load_csr(months, lat, lon):
    ds = xr.open_dataset(C.RAW / "csr" / C.CSR_FILE, decode_times=False)
    units = ds.time.attrs.get("units", ds.time.attrs.get("Units", ""))
    assert "days since 2002-01-01" in units, units
    times = np.datetime64("2002-01-01") + (ds.time.values * 86400).astype("timedelta64[s]")
    sub = ds.sel(lat=slice(C.LAT_MIN, C.LAT_MAX), lon=slice(C.LON_MIN, C.LON_MAX))
    mask = xr.open_dataset(C.RAW / "csr" / C.CSR_MASK).sel(
        lat=slice(C.LAT_MIN, C.LAT_MAX), lon=slice(C.LON_MIN, C.LON_MAX)).LO_val.values
    vals = sub.lwe_thickness.values.astype(float)
    vals = np.where(mask[None] > 0.5, vals, np.nan)
    half = coarsen_quarter_to_half(vals, sub.lat.values.astype(float), sub.lon.values.astype(float), lat, lon)
    # CSR mid-times: assign by calendar month, resolving the known cases where two
    # solutions have mid-points in the same month by moving the one nearer the month
    # edge to the adjacent empty month (this only relabels, never changes values).
    keys = [str(np.datetime64(t, "M")) for t in times]
    days = np.array([int(str(np.datetime64(t, "D"))[8:10]) for t in times])
    used = {}
    for k, key in enumerate(keys):
        if key in used:
            j = used[key]
            # earlier solution with small day-of-month belongs to previous month, or
            # later one with large day-of-month belongs to the next month
            prev = str(np.datetime64(key) - 1); nxt = str(np.datetime64(key) + 1)
            if days[j] <= 15 and prev not in used:
                used[prev] = j; used[key] = k
            elif nxt not in used:
                used[nxt] = k
            else:
                raise SystemExit(f"CSR: cannot place duplicate month {key}. Stopping.")
        else:
            used[key] = k
    out = np.full((len(months), lat.size, lon.size), np.nan)
    pos = {m: k for k, m in enumerate(months)}
    for m, k in used.items():
        if m in pos:
            out[pos[m]] = half[k]
    return out, sorted(used)


def load_gldas(months, lat, lon, subdir="gldas"):
    files = sorted(glob.glob(str(C.RAW / subdir / "*.subset.nc4")))
    comp = {k: np.full((len(months), lat.size, lon.size), np.nan) for k in ("sm", "swe", "can")}
    pos = {m: k for k, m in enumerate(months)}
    last = None
    for f in files:
        ds = xr.open_dataset(f)
        m = str(np.datetime64(ds.time.values[0], "M"))
        if m not in pos:
            continue
        lq = ds.lat.values.astype(float); oq = ds.lon.values.astype(float)
        js = (lq > C.LAT_MIN) & (lq < C.LAT_MAX); is_ = (oq > C.LON_MIN) & (oq < C.LON_MAX)
        def get(v):
            return ds[v].values[0][np.ix_(js, is_)].astype(float)
        sm = sum(get(v) for v in C.GLDAS_VARS if v.startswith("SoilMoi"))
        fields = np.stack([sm, get("SWE_inst"), get("CanopInt_inst")])
        half = coarsen_quarter_to_half(fields, lq[js], oq[is_], lat, lon)
        for n, k in enumerate(("sm", "swe", "can")):
            comp[k][pos[m]] = half[n] / 10.0        # kg m-2 = mm  ->  cm
        last = m
    return comp, last


def anomaly(x, months):
    b0, b1 = months.index(C.BASELINE[0]), months.index(C.BASELINE[1])
    return x - np.nanmean(x[b0:b1 + 1], axis=0)


def region_fraction(lat, lon, n=10):
    """Fraction of each 0.5-degree cell inside Punjab+Haryana+Delhi+Rajasthan,
    from n x n sample points per cell tested against the state polygons."""
    import geopandas as gpd
    import shapely
    g = gpd.read_file(C.RAW / "boundaries" / "Admin2.shp")
    sel = g[g["ST_NM"].isin(C.NW_STATES)]
    assert len(sel) == len(C.NW_STATES), list(sel["ST_NM"])
    poly = shapely.union_all(sel.geometry.values)
    off = (np.arange(n) + 0.5) / n * 0.5 - 0.25
    frac = np.zeros((lat.size, lon.size))
    for j, la in enumerate(lat):
        for i, lo in enumerate(lon):
            xx, yy = np.meshgrid(lo + off, la + off)
            frac[j, i] = shapely.contains_xy(poly, xx.ravel(), yy.ravel()).mean()
    # true polygon area on the sphere for comparison
    area_true = float(sel.to_crs("+proj=cea +R=6371000").geometry.area.sum() / 1e6)
    return frac, area_true


def fit_summary(t, y, months, period=None):
    yy = np.array(y, float)
    if period:
        a, b = months.index(period[0]), months.index(period[1])
        keep = np.zeros(len(months), bool); keep[a:b + 1] = True
        yy = np.where(keep, yy, np.nan)
    f = core.fit_trend(t, yy, t0=2014.0)
    ok = np.isfinite(yy)
    first = months[int(np.argmax(ok))]; last = months[len(months) - 1 - int(np.argmax(ok[::-1]))]
    return {"slope_cm_per_yr": f["slope"], "slope_se_cm_per_yr": f["slope_se"],
            "annual_amp_cm": f["annual_amp"], "semiannual_amp_cm": f["semiannual_amp"],
            "n_months": f["n"], "rms_resid_cm": f["rms_resid"], "t0": f["t0"],
            "coef": [float(c) for c in f["coef"]], "first_month": first, "last_month": last,
            "min_cm": float(np.nanmin(yy)), "max_cm": float(np.nanmax(yy))}


def main():
    lat, lon = target_grid()
    area = core.area_grid_km2(lat, lon)
    jf = sorted(glob.glob(str(C.RAW / "jpl" / "*.nc")))[-1]
    last_jpl = str(np.datetime64(xr.open_dataset(jf).time.values[-1], "M"))
    months = month_list(C.FIRST_MONTH, last_jpl)
    t = decimal_year(months)

    jpl, jpl_unc, land, sf, mascon, jpl_missing, jpl_file = load_jpl(months, lat, lon)
    csr, csr_have = load_csr(months, lat, lon)
    comp, gldas_last = load_gldas(months, lat, lon)

    landmask = land > 0.5
    jpl = np.where(landmask[None], jpl, np.nan)
    jpl_sc = jpl * sf[None]                       # gain factors applied (JPL instruction)
    sm, swe, can = (anomaly(comp[k], months) for k in ("sm", "swe", "can"))
    lsm = sm + swe + can                          # GLDAS storage anomaly, cm
    gws = {"jpl": jpl - lsm, "jpl_sc": jpl_sc - lsm, "csr": csr - lsm}
    tws = {"jpl": jpl, "jpl_sc": jpl_sc, "csr": csr}

    frac, area_true = region_fraction(lat, lon)
    w = area * frac
    region_area = float(w.sum())

    def reg(cube):
        return np.array([core.weighted_mean(c, w) if np.isfinite(c[frac > 0]).all() else np.nan
                         for c in cube])

    series = {"sm": reg(sm), "swe": reg(swe), "can": reg(can), "lsm": reg(lsm)}
    for k in tws:
        series[f"tws_{k}"] = reg(tws[k]); series[f"gws_{k}"] = reg(gws[k])
    series["tws_jpl_unc"] = reg(jpl_unc)

    fits = {}
    for k, y in series.items():
        if k.endswith("_unc"):
            continue
        fits[k] = {"full": fit_summary(t, y, months), "rodell_period": fit_summary(t, y, months, RODELL_PERIOD)}

    # per-cell trends (cm/yr) on the unscaled JPL fields, plus CSR
    trend = {"tws_jpl": core.fit_slopes_grid(t, tws["jpl"]), "gws_jpl": core.fit_slopes_grid(t, gws["jpl"]),
             "tws_jpl_sc": core.fit_slopes_grid(t, tws["jpl_sc"]), "gws_jpl_sc": core.fit_slopes_grid(t, gws["jpl_sc"]),
             "tws_csr": core.fit_slopes_grid(t, tws["csr"]), "gws_csr": core.fit_slopes_grid(t, gws["csr"])}
    rodell_trend = {}
    a, b = months.index(RODELL_PERIOD[0]), months.index(RODELL_PERIOD[1])
    for k in ("jpl", "jpl_sc", "csr"):
        cube = np.full_like(gws[k], np.nan); cube[a:b + 1] = gws[k][a:b + 1]
        rodell_trend[k] = core.fit_slopes_grid(t, cube)

    vol = {}
    for k, v in trend.items():
        vol[k] = {"km3_per_yr_cell_sum": core.volume_rate_km3(np.where(frac > 0, v, np.nan), area, frac),
                  "km3_per_yr_from_regional_slope": fits[k]["full"]["slope_cm_per_yr"] / 100 * region_area * 1e6 / 1e9,
                  "km3_per_yr_se": fits[k]["full"]["slope_se_cm_per_yr"] / 100 * region_area * 1e6 / 1e9}
    for k, v in rodell_trend.items():
        f = fits[f"gws_{k}"]["rodell_period"]
        vol[f"gws_{k}_rodell_period"] = {
            "km3_per_yr_cell_sum": core.volume_rate_km3(np.where(frac > 0, v, np.nan), area, frac),
            "km3_per_yr_from_regional_slope": f["slope_cm_per_yr"] / 100 * region_area * 1e6 / 1e9,
            "km3_per_yr_se": f["slope_se_cm_per_yr"] / 100 * region_area * 1e6 / 1e9}

    gap = [m for m in months if "2017-07" <= m <= "2018-05"]
    summary = {
        "months": [months[0], months[-1]], "n_calendar_months": len(months),
        "jpl": {"file": jpl_file.split("\\")[-1].split("/")[-1],
                "n_solutions": int(np.isfinite(series["tws_jpl"]).sum()),
                "missing_months": [m for m in jpl_missing if m in months],
                "mission_gap_months": [m for m in gap if m in jpl_missing]},
        "csr": {"n_solutions": int(np.isfinite(series["tws_csr"]).sum()),
                "missing_months": [m for m in months if not np.isfinite(series["tws_csr"][months.index(m)])]},
        "gldas": {"last_month": gldas_last, "baseline": list(C.BASELINE)},
        "region": {"states": C.NW_STATES, "area_km2_grid_weighted": region_area,
                   "area_km2_polygons": area_true, "n_cells_touched": int((frac > 0).sum()),
                   "n_jpl_mascons_touched": int(np.unique(mascon[frac > 0]).size)},
        "fits": fits, "volume": vol, "rodell_period": list(RODELL_PERIOD),
    }
    PROC.mkdir(exist_ok=True)
    (PROC / "summary.json").write_text(json.dumps(summary, indent=1))
    np.savez_compressed(
        PROC / "processed.npz", lat=lat, lon=lon, months=np.array(months), t=t, area=area, frac=frac,
        land=land, scale_factor=sf, mascon=mascon, jpl_unc=jpl_unc,
        sm=sm, swe=swe, can=can,
        **{f"tws_{k}": v for k, v in tws.items()}, **{f"gws_{k}": v for k, v in gws.items()},
        **{f"trend_{k}": v for k, v in trend.items()},
        **{f"series_{k}": v for k, v in series.items()})
    return summary


if __name__ == "__main__":
    s = main()
    print(json.dumps({k: s[k] for k in ("months", "n_calendar_months", "region", "gldas")}, indent=1))
    print("JPL solutions:", s["jpl"]["n_solutions"], " CSR solutions:", s["csr"]["n_solutions"])
    print(f"{'series':12s} {'period':17s} {'n':>4s} {'slope cm/yr':>12s} {'se':>6s} {'km3/yr':>8s} {'ann amp':>8s} {'min':>7s} {'max':>7s}")
    A = s["region"]["area_km2_grid_weighted"]
    for k, f in s["fits"].items():
        for p in ("full", "rodell_period"):
            r = f[p]
            print(f"{k:12s} {r['first_month']}..{r['last_month']} {r['n_months']:4d} {r['slope_cm_per_yr']:12.3f} "
                  f"{r['slope_se_cm_per_yr']:6.3f} {r['slope_cm_per_yr']/100*A*1e6/1e9:8.2f} {r['annual_amp_cm']:8.2f} "
                  f"{r['min_cm']:7.1f} {r['max_cm']:7.1f}")
