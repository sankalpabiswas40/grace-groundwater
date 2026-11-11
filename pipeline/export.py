"""Write the small files the website reads (web/public/data).
Run from the project folder:   python pipeline/export.py     (after process.py)

frames.bin layout (little-endian Int16, millimetres of water, NaN stored as -32768):
  block 0: TWS  (JPL mascons, gain factors applied)  n_months x n_lat x n_lon
  block 1: GWS  (TWS minus GLDAS soil moisture+snow+canopy), same shape
Rows run south to north, columns west to east.
"""
import datetime as dt
import json

import numpy as np

import config as C

SENTINEL = -32768
PROC = C.PIPELINE / "processed"


def pack_mm(cube_cm):
    mm = np.round(cube_cm * 10.0)
    if np.nanmax(np.abs(mm)) > 32000:
        raise SystemExit("Value does not fit Int16 millimetres. Stopping.")
    return np.where(np.isfinite(mm), mm, SENTINEL).astype("<i2")


def r(x, n=3):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def lst(a, n=2):
    return [r(v, n) for v in np.asarray(a, float).ravel()]


def main():
    z = np.load(PROC / "processed.npz")
    s = json.loads((PROC / "summary.json").read_text())
    prov = json.loads(C.PROVENANCE.read_text())
    months = [str(m) for m in z["months"]]
    C.OUT.mkdir(parents=True, exist_ok=True)

    tws, gws = z["tws_jpl_sc"], z["gws_jpl_sc"]
    (C.OUT / "frames.bin").write_bytes(pack_mm(tws).tobytes() + pack_mm(gws).tobytes())

    missing = set(s["jpl"]["missing_months"])
    reason = {}
    for m in months:
        if m in missing:
            reason[m] = ("Mission gap: GRACE ended in 2017 and GRACE-FO began science data in mid-2018"
                         if "2017-07" <= m <= "2018-05" else
                         "No GRACE/GRACE-FO solution for this month")
    gws_missing = {m: "GLDAS land-surface model not yet available for this month"
                   for m in months if m > s["gldas"]["last_month"] and m not in missing}
    grid = {"lat": lst(z["lat"]), "lon": lst(z["lon"]), "months": months,
            "shape": [len(months), int(z["lat"].size), int(z["lon"].size)],
            "frames": {"file": "frames.bin", "dtype": "int16-le", "unit": "mm water equivalent",
                       "nan_sentinel": SENTINEL, "blocks": ["tws", "gws"],
                       "note": "JPL mascons with gain factors applied; rows south to north"},
            "missing_reason": reason, "gws_missing_reason": gws_missing,
            "region_fraction": lst(z["frac"], 2), "cell_area_km2": lst(z["area"][:, 0], 1)}
    (C.OUT / "grid.json").write_text(json.dumps(grid, separators=(",", ":")))

    tm = {"unit": "mm/yr",
          "note": "least-squares slope with annual+semiannual terms, available months only; "
                  "JPL without gain factors (headline) and CSR",
          "tws_jpl": lst(z["trend_tws_jpl"] * 10, 1), "gws_jpl": lst(z["trend_gws_jpl"] * 10, 1),
          "tws_csr": lst(z["trend_tws_csr"] * 10, 1), "gws_csr": lst(z["trend_gws_csr"] * 10, 1)}
    (C.OUT / "trend_map.json").write_text(json.dumps(tm, separators=(",", ":")))

    ser = {"unit": "cm water equivalent", "months": months, "t_decimal_year": lst(z["t"], 4),
           "series": {k[7:]: lst(z[k], 3) for k in z.files if k.startswith("series_")},
           "fits": s["fits"],
           "model": "y(t)=a+b*(t-t0)+c*cos(2*pi*(t-t0))+d*sin(2*pi*(t-t0))"
                    "+e*cos(4*pi*(t-t0))+f*sin(4*pi*(t-t0)); coef=[a,b,c,d,e,f]"}
    (C.OUT / "region_series.json").write_text(json.dumps(ser, separators=(",", ":")))

    A = s["region"]["area_km2_grid_weighted"]
    f = s["fits"]
    head = f["gws_jpl"]["full"]

    def vol(x):
        return x / 100.0 * A * 1e6 / 1e9

    meta = {
        "generated": dt.date.today().isoformat(),
        "provenance": prov,
        "baseline": "2004.0-2009.999 (JPL and CSR product baseline; GLDAS anomalies use Jan 2004-Dec 2009)",
        "region": s["region"], "display_box": [C.LAT_MIN, C.LAT_MAX, C.LON_MIN, C.LON_MAX],
        "jpl": s["jpl"], "csr": s["csr"], "gldas": s["gldas"],
        "headline": {
            "label": "NW India groundwater storage trend (ours; JPL RL06.3Mv04 mascons, "
                     "no gain factors, minus GLDAS-2.1 Noah)",
            "period": [head["first_month"], head["last_month"]], "n_months": head["n_months"],
            "gws_cm_per_yr": r(head["slope_cm_per_yr"]),
            "gws_cm_per_yr_se": r(head["slope_se_cm_per_yr"]),
            "gws_km3_per_yr": r(vol(head["slope_cm_per_yr"]), 2),
            "gws_km3_per_yr_se": r(vol(head["slope_se_cm_per_yr"]), 2),
            "se_note": "Formal least-squares standard error; monthly residuals are autocorrelated, "
                       "so it is a lower bound.",
            "formula_volume": "km3/yr = sum_cells( b_cell[m/yr] * A_cell[m2] * f_cell ) / 1e9, "
                              "A = R^2*dlon*(sin(lat2)-sin(lat1)), R = 6371 km, "
                              "f = fraction of cell inside the region",
            "litres_per_second": r(abs(vol(head["slope_cm_per_yr"])) * 1e12 / (365.25 * 86400), 0),
            "formula_counter": "litres lost = |rate km3/yr| * 1e12 L/km3 * seconds / (365.25*86400 s/yr)",
            "sensitivity": {
                "jpl_with_gain_factors_km3_per_yr": r(vol(f["gws_jpl_sc"]["full"]["slope_cm_per_yr"]), 2),
                "csr_km3_per_yr": r(vol(f["gws_csr"]["full"]["slope_cm_per_yr"]), 2),
                "jpl_with_gain_factors_cm_per_yr": r(f["gws_jpl_sc"]["full"]["slope_cm_per_yr"]),
                "csr_cm_per_yr": r(f["gws_csr"]["full"]["slope_cm_per_yr"])}},
        "tws_trend": {k: {"cm_per_yr": r(f[k]["full"]["slope_cm_per_yr"]),
                          "se": r(f[k]["full"]["slope_se_cm_per_yr"]),
                          "km3_per_yr": r(vol(f[k]["full"]["slope_cm_per_yr"]), 2),
                          "period": [f[k]["full"]["first_month"], f[k]["full"]["last_month"]]}
                      for k in ("tws_jpl", "tws_jpl_sc", "tws_csr")},
        "rodell_crosscheck": {
            "published": {
                "citation": "Rodell, Velicogna & Famiglietti (2009), Nature 460, 999-1002, "
                            "doi:10.1038/nature08238",
                "region": "Rajasthan, Punjab and Haryana (including Delhi), 438,296 km2",
                "period": "August 2002 to October 2008",
                "cm_per_yr": -4.0, "cm_per_yr_unc": 1.0, "km3_per_yr": -17.7, "km3_per_yr_unc": 4.5},
            "ours_same_period": {
                k: {"cm_per_yr": r(f["gws_" + k]["rodell_period"]["slope_cm_per_yr"]),
                    "se": r(f["gws_" + k]["rodell_period"]["slope_se_cm_per_yr"]),
                    "km3_per_yr": r(vol(f["gws_" + k]["rodell_period"]["slope_cm_per_yr"]), 2),
                    "n_months": f["gws_" + k]["rodell_period"]["n_months"]}
                for k in ("jpl", "jpl_sc", "csr")},
            "note": "Different GRACE processing (2009: CSR spherical harmonics; ours: RL06.3 mascons) "
                    "and different land-surface model treatment. Nothing was tuned to match."},
        "limits": [
            "GRACE native resolution is about 300 km (JPL mascons are 3 degrees); the 0.5 degree grid "
            "is a sampling, not sharp pixels.",
            "No data between GRACE (ended 2017) and GRACE-FO (from mid-2018); other months are also "
            "missing. Nothing is interpolated.",
            "Groundwater = TWS minus GLDAS-2.1 Noah soil moisture, snow and canopy water, so it "
            "carries that model's errors.",
            "Surface water and reservoirs are not removed.",
            "Signal leaks between neighbouring mascons; the region touches only about a dozen JPL mascons."],
    }
    (C.OUT / "meta.json").write_text(json.dumps(meta, indent=1))
    total = sum(p.stat().st_size for p in C.OUT.iterdir())
    print(f"Exported to {C.OUT}  total {total/1e6:.2f} MB")
    if total > 3e6:
        raise SystemExit("Output exceeds 3 MB budget.")


if __name__ == "__main__":
    main()
