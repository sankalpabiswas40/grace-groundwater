"""India-wide grid for the 3D columns view.

Run from the project folder (after download.py gldas_india):
    python pipeline/process_india.py

Same method as process.py (JPL mascons with gain factors, minus GLDAS soil moisture,
snow and canopy, anomalies vs 2004-2009), but over the whole of India, and only for
grid cells that are at least half inside India. Nothing is interpolated.

Writes web/public/data/india3d.json and india3d.bin:
  Int8, whole centimetres of water, NaN stored as -128. Values beyond +/-127 cm are
  stored as +/-127 and counted in the json (they occur at Himalayan snow cells in GWS).
  Layout: block 0 = TWS, block 1 = GWS; each block is n_months x n_cells.
  Only months that have a JPL solution are stored (the json lists them).
"""
import glob
import json

import numpy as np
import xarray as xr

import config as C

# use the India box for every loader in process.py
C.LAT_MIN, C.LAT_MAX, C.LON_MIN, C.LON_MAX = C.INDIA_BOX
import process as P  # noqa: E402  (must come after the box is set)

SENTINEL = -128
CLIP = 127  # values beyond +/-127 cm are stored as +/-127 (the 3D view shows them as 'beyond 127 cm')


def india_fraction(lat, lon, n=10):
    import geopandas as gpd
    import shapely
    g = gpd.read_file(C.RAW / "boundaries" / "Admin2.shp")
    poly = shapely.union_all(g.geometry.values)
    off = (np.arange(n) + 0.5) / n * 0.5 - 0.25
    frac = np.zeros((lat.size, lon.size))
    for j, la in enumerate(lat):
        for i, lo in enumerate(lon):
            xx, yy = np.meshgrid(lo + off, la + off)
            frac[j, i] = shapely.contains_xy(poly, xx.ravel(), yy.ravel()).mean()
    return frac


def main():
    lat, lon = P.target_grid()
    jf = sorted(glob.glob(str(C.RAW / "jpl" / "*.nc")))[-1]
    last_jpl = str(np.datetime64(xr.open_dataset(jf).time.values[-1], "M"))
    months = P.month_list(C.FIRST_MONTH, last_jpl)
    jpl, _unc, land, sf, _mascon, missing, _ = P.load_jpl(months, lat, lon)
    comp, gldas_last = P.load_gldas(months, lat, lon, subdir="gldas_india")
    n_gldas = int(np.isfinite(comp["sm"]).any(axis=(1, 2)).sum())
    if n_gldas < 290:
        raise SystemExit(f"Only {n_gldas} GLDAS months found for India. Run download.py gldas_india first. Stopping.")

    tws = np.where((land > 0.5)[None], jpl, np.nan) * sf[None]
    lsm = sum(P.anomaly(comp[k], months) for k in ("sm", "swe", "can"))
    gws = tws - lsm

    frac = india_fraction(lat, lon)
    keep = frac >= 0.5
    jj, ii = np.where(keep)
    have = [k for k, m in enumerate(months) if m not in set(missing)]
    out_months = [months[k] for k in have]

    clipped = {}

    def pack(cube, name):
        v = cube[have][:, jj, ii]
        cm = np.round(v)
        big = np.abs(cm) > CLIP
        if big.any():
            cells = np.unique(np.where(big)[1])
            print(f"  {name}: {int(big.sum())} values beyond +/-{CLIP} cm in {cells.size} cells "
                  f"(lat {lat[jj][cells].min()}-{lat[jj][cells].max()}, lon {lon[ii][cells].min()}-{lon[ii][cells].max()}); "
                  f"largest {np.nanmax(np.abs(cm)):.0f} cm. Stored as +/-{CLIP} and flagged.")
        cm = np.clip(cm, -CLIP, CLIP)
        clipped[name] = int(big.sum())
        return np.where(np.isfinite(cm), cm, SENTINEL).astype(np.int8)

    t8, g8 = pack(tws, "tws"), pack(gws, "gws")
    C.OUT.mkdir(parents=True, exist_ok=True)
    (C.OUT / "india3d.bin").write_bytes(t8.tobytes() + g8.tobytes())
    meta = {
        "months": out_months, "n_cells": int(jj.size),
        "cell_lat": [round(float(x), 2) for x in lat[jj]], "cell_lon": [round(float(x), 2) for x in lon[ii]],
        "file": "india3d.bin", "dtype": "int8", "unit": "cm water equivalent (whole centimetres)",
        "nan_sentinel": SENTINEL, "blocks": ["tws", "gws"], "clip_cm": CLIP, "n_clipped": clipped,
        "gldas_last_month": gldas_last, "box": list(C.INDIA_BOX),
        "note": "JPL RL06.3Mv04 mascons with gain factors; GWS = TWS minus GLDAS-2.1 Noah soil moisture, snow, canopy; "
                "anomalies vs 2004-2009; cells at least half inside India; months without a JPL solution are not stored.",
    }
    (C.OUT / "india3d.json").write_text(json.dumps(meta, separators=(",", ":")))
    total = sum(p.stat().st_size for p in C.OUT.iterdir())
    print(f"cells {jj.size}, months {len(out_months)}, TWS range {np.nanmin(tws[have][:, jj, ii]):.1f}..{np.nanmax(tws[have][:, jj, ii]):.1f} cm, "
          f"GWS range {np.nanmin(gws[have][:, jj, ii]):.1f}..{np.nanmax(gws[have][:, jj, ii]):.1f} cm")
    print(f"data folder total {total/1e6:.2f} MB")
    if total > 3e6:
        raise SystemExit("Output exceeds the 3 MB budget. Stopping.")
    # consistency check against the north-India product where the two grids overlap
    z = np.load(C.PIPELINE / "processed" / "processed.npz")
    zl, zo = z["lat"], z["lon"]
    k = months.index("2010-08")
    a = tws[k][np.ix_(np.isin(lat, zl), np.isin(lon, zo))]
    b = z["tws_jpl_sc"][list(z["months"]).index("2010-08")][np.ix_(np.isin(zl, lat), np.isin(zo, lon))]
    ok = np.isfinite(a) & np.isfinite(b)
    print("overlap check, max |difference| in Aug 2010 TWS:", float(np.max(np.abs(a[ok] - b[ok]))), "cm over", int(ok.sum()), "cells")


if __name__ == "__main__":
    main()
