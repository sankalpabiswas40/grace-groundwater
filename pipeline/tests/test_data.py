"""Tests on the real processed and exported files (skipped until process.py/export.py have run)."""
import json
import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import config as C

NPZ = C.PIPELINE / "processed" / "processed.npz"
pytestmark = pytest.mark.skipif(
    not NPZ.exists() or not (C.OUT / "frames.bin").exists(),
    reason="run process.py and export.py first")


def frames():
    g = json.loads((C.OUT / "grid.json").read_text())
    nt, ny, nx = g["shape"]
    raw = np.frombuffer((C.OUT / "frames.bin").read_bytes(), dtype="<i2").reshape(2, nt, ny, nx)
    return g, raw


def test_4_gws_is_tws_minus_components():
    z = np.load(NPZ)
    for k in ("jpl", "jpl_sc", "csr"):
        lhs = z["gws_" + k]
        rhs = z["tws_" + k] - (z["sm"] + z["swe"] + z["can"])
        ok = np.isfinite(lhs)
        assert ok.any() and np.array_equal(ok, np.isfinite(rhs))
        assert np.allclose(lhs[ok], rhs[ok], atol=1e-9)


def test_5_no_values_in_missing_months():
    g, raw = frames()
    s = json.loads((C.PIPELINE / "processed" / "summary.json").read_text())
    missing = s["jpl"]["missing_months"]
    assert len(missing) >= 11 and "2017-12" in missing
    for m in missing:
        k = g["months"].index(m)
        assert (raw[:, k] == g["frames"]["nan_sentinel"]).all(), m
        assert m in g["missing_reason"]
    assert (raw[0, g["months"].index("2010-08")] != -32768).any()
    for m in g["gws_missing_reason"]:
        assert (raw[1, g["months"].index(m)] == -32768).all()


def test_int16_roundtrip_matches_processed():
    z = np.load(NPZ)
    g, raw = frames()
    back = np.where(raw[0] == -32768, np.nan, raw[0] / 10.0)
    src = z["tws_jpl_sc"]
    assert np.array_equal(np.isfinite(back), np.isfinite(src))
    assert np.nanmax(np.abs(back - src)) <= 0.0501


def test_region_area_and_headline_formula():
    m = json.loads((C.OUT / "meta.json").read_text())
    a = m["region"]["area_km2_grid_weighted"]
    assert abs(a / m["region"]["area_km2_polygons"] - 1) < 0.005
    h = m["headline"]
    assert abs(h["gws_cm_per_yr"] / 100 * a * 1e6 / 1e9 - h["gws_km3_per_yr"]) < 0.01
