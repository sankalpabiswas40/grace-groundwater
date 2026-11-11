"""Quick-look PNGs for Checkpoint 2.  Run:  python pipeline/quicklook.py"""
import json

import matplotlib
matplotlib.use("Agg")
import geopandas as gpd
import matplotlib.pyplot as plt
import numpy as np

import config as C
import core

PROC = C.PIPELINE / "processed"


def main():
    z = np.load(PROC / "processed.npz")
    s = json.loads((PROC / "summary.json").read_text())
    months = [str(m) for m in z["months"]]
    t, lat, lon = z["t"], z["lat"], z["lon"]
    C.QUICKLOOK.mkdir(exist_ok=True)
    states = gpd.read_file(C.RAW / "boundaries" / "Admin2.shp")
    nw = states[states["ST_NM"].isin(C.NW_STATES)]
    ext = [C.LON_MIN, C.LON_MAX, C.LAT_MIN, C.LAT_MAX]

    # 1. regional time series
    fig, ax = plt.subplots(2, 1, figsize=(11, 7), sharex=True)
    for a, kind, title in ((ax[0], "tws", "Total water storage (TWS)"),
                           (ax[1], "gws", "Groundwater storage (TWS minus GLDAS soil moisture, snow, canopy)")):
        for k, col, lab in (("jpl", "#1f5fa8", "JPL (no gain factors)"), ("jpl_sc", "#7fb0e0", "JPL (gain factors)"),
                            ("csr", "#c0392b", "CSR")):
            y = z[f"series_{kind}_{k}"]
            a.plot(t, y, ".-", ms=3, lw=0.8, color=col, label=lab)
        f = s["fits"][f"{kind}_jpl"]["full"]
        X = core.design(t - f["t0"]); c = np.array(f["coef"])
        a.plot(t, c[0] + c[1] * (t - f["t0"]), "k--", lw=1,
               label=f"JPL trend {f['slope_cm_per_yr']:.2f} +/- {f['slope_se_cm_per_yr']:.2f} cm/yr")
        a.axvspan(2017.5, 2018.42, color="0.85", label="GRACE to GRACE-FO gap")
        a.set_ylabel("cm water equivalent"); a.set_title(f"NW India: {title}"); a.grid(alpha=.3)
        a.legend(fontsize=8, ncol=3)
    if kind == "gws":
        pass
    ax[1].plot(t, z["series_sm"], color="#2e8b57", lw=0.7, alpha=.7)
    ax[1].text(2003, np.nanmin(z["series_gws_jpl"]) * 0.95, "green: GLDAS soil-moisture anomaly", color="#2e8b57", fontsize=8)
    fig.tight_layout(); fig.savefig(C.QUICKLOOK / "regional_series.png", dpi=130); plt.close(fig)

    def mapplot(field, title, fname, vmax, unit):
        fig, a = plt.subplots(figsize=(8, 5.6))
        im = a.imshow(field, origin="lower", extent=ext, cmap="RdBu", vmin=-vmax, vmax=vmax, interpolation="nearest")
        states.boundary.plot(ax=a, color="0.35", lw=0.4)
        nw.dissolve().boundary.plot(ax=a, color="k", lw=1.3)
        a.set_xlim(ext[:2]); a.set_ylim(ext[2:]); a.set_title(title, fontsize=10)
        fig.colorbar(im, ax=a, label=unit, shrink=.85)
        fig.tight_layout(); fig.savefig(C.QUICKLOOK / fname, dpi=130); plt.close(fig)

    mapplot(z["trend_gws_jpl"] * 10, "Groundwater trend, JPL minus GLDAS, "
            f"{s['fits']['gws_jpl']['full']['first_month']} to {s['fits']['gws_jpl']['full']['last_month']} (mm/yr)",
            "trend_gws.png", 40, "mm/yr")
    mapplot(z["trend_tws_jpl"] * 10, "TWS trend, JPL (mm/yr)", "trend_tws.png", 40, "mm/yr")
    for m, tag in (("2010-08", "monsoon"), ("2010-05", "premonsoon")):
        k = months.index(m)
        mapplot(z["tws_jpl_sc"][k], f"TWS anomaly {m} ({tag}), JPL with gain factors (cm)",
                f"tws_{tag}_{m}.png", 30, "cm")
    print("Wrote PNGs to", C.QUICKLOOK)


if __name__ == "__main__":
    main()
