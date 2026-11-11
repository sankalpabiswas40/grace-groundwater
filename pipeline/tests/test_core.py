import sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import core


def test_1_global_area():
    lat = np.arange(-89.75, 90, 0.5); lon = np.arange(0.25, 360, 0.5)
    total = core.area_grid_km2(lat, lon).sum()
    assert abs(total / (4 * np.pi * 6371.0**2) - 1) < 1e-3
    edges = np.arange(-90, 90.01, 0.5)
    assert abs(core.cell_area_km2(edges, 0.5).sum() * 720 / (4*np.pi*6371.0**2) - 1) < 1e-3


def test_2_bouguer():
    assert abs(core.bouguer_microgal(0.01) / 0.419 - 1) < 0.005


def test_3_fit_recovers_synthetic():
    # synthetic data allowed ONLY in tests
    rng = np.random.default_rng(0)
    t = 2002.29 + np.arange(280) / 12
    y = 3 - 1.7 * (t - 2014) + 8 * np.cos(2*np.pi*t - 1.0) + 1.5*np.sin(4*np.pi*t) + rng.normal(0, .3, t.size)
    y[180:192] = np.nan                      # a gap must not matter
    f = core.fit_trend(t, y)
    assert abs(f["slope"] + 1.7) < 0.02
    assert abs(f["annual_amp"] - 8) < 0.1
    assert f["n"] == 268


def test_6_volume_hand_checked_cell():
    # one 0.5 x 0.5 degree cell centred 28.25N: A = R^2*dlon*(sin28.5 - sin28)
    a = 6371.0**2 * np.deg2rad(0.5) * (np.sin(np.deg2rad(28.5)) - np.sin(np.deg2rad(28.0)))
    # by hand: sin28.5=0.477159, sin28=0.469472, diff=0.007687; R^2*dlon=354211.7 -> 2722.9 km^2
    assert abs(a - 2722.9) < 0.5
    area = core.area_grid_km2([27.75, 28.25], [77.25, 77.75])[1, 0]
    assert abs(area - a) < 1e-6
    # -2 cm/yr over that cell = -0.02 m * 2.7229e9 m^2 / 1e9 = -0.05446 km^3/yr
    assert abs(core.volume_rate_km3(-2.0, a) + 0.05446) < 1e-4


def test_water_table():
    assert abs(core.water_table_change_m(-12.0, 0.12) + 1.0) < 1e-12
    assert abs(core.water_table_change_m(-4.0, 0.08) + 0.5) < 1e-12
