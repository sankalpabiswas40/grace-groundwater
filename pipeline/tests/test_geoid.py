import json
import pathlib
import sys

import numpy as np
import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import config as C
import geoid as G


def test_legendre_normalisation_addition_theorem():
    # for fully normalised functions: sum over m of P_nm(x)^2 = 2n + 1 at every x
    x = np.array([-0.9, -0.3, 0.0, 0.41, 0.97])
    P = G.legendre_normalised(40, x)
    for n in (0, 1, 2, 7, 25, 40):
        assert np.allclose((P[n, : n + 1] ** 2).sum(axis=0), 2 * n + 1, rtol=1e-10)
    # closed forms: P_20 = sqrt(5)/2 (3x^2-1), P_22 = sqrt(15)/2 (1-x^2)
    assert np.allclose(P[2, 0], np.sqrt(5) / 2 * (3 * x**2 - 1))
    assert np.allclose(P[2, 2], np.sqrt(15) / 2 * (1 - x**2))


def test_single_coefficient_field():
    # one sectorial coefficient C22 gives N = (GM/(r*gamma)) (a/r)^2 C22 P22 cos(2 lam)
    gm, a = 3.986004415e14, 6378136.3
    Cc = np.zeros((3, 3)); S = np.zeros((3, 3)); Cc[2, 2] = 2.4e-6
    for n, c in G.grs80_normal_zonals().items():      # cancel the normal field so only C22 remains
        if n <= 2:
            Cc[n, 0] = c * (G.GRS80_GM / gm) * (G.GRS80_A / a) ** n
    N = G.geoid_heights(gm, a, Cc, S, [0.0], [0.0, 45.0, 90.0])
    assert abs(N[0, 1]) < 1e-6                         # cos(90 deg) = 0
    assert N[0, 0] > 0 and abs(N[0, 0] + N[0, 2]) < 1e-6
    expect = a * 2.4e-6 * np.sqrt(15) / 2             # about 29.6 m; r ~ a and gamma ~ GM/a^2 on the equator
    assert abs(N[0, 0] / expect - 1) < 0.01


def test_grs80_zonals_from_defining_constants():
    z = G.grs80_normal_zonals()
    assert abs(z[2] + G.GRS80_J2 / np.sqrt(5)) < 1e-15     # C20 = -J2/sqrt(5) exactly
    assert 0 < z[4] < 1e-6 and -1e-8 < z[6] < 0            # signs alternate and shrink fast
    assert abs(z[4] / z[2]) < 2e-3


GFC = C.RAW / "geoid" / f"EGM2008_to_degree_{C.GEOID_NMAX}.gfc"
needs_files = pytest.mark.skipif(not GFC.exists() or not (C.OUT / "geoid.bin").exists(),
                                 reason="run download.py geoid and geoid.py first")


@needs_files
def test_exported_values_come_from_the_model_file():
    meta = json.loads((C.OUT / "geoid.json").read_text())
    lat = np.array(meta["lat"]); lon = np.array(meta["lon"])
    grid = np.frombuffer((C.OUT / "geoid.bin").read_bytes(), dtype="<i2").reshape(lat.size, lon.size) / 100.0
    gm, a, Cc, S, _ = G.read_gfc(GFC, meta["max_degree_used"])
    assert abs(Cc[2, 0] + 0.484165143790815e-03) < 1e-18        # the C20 value printed in the file
    for la, lo in ((4.0, 78.0), (-60.0, 200.0), (50.0, 340.0)):
        direct = G.geoid_heights(gm, a, Cc, S, [la], [lo])[0, 0]
        j, i = int(np.where(lat == la)[0][0]), int(np.where(lon == lo)[0][0])
        assert abs(grid[j, i] - direct) <= 0.006                 # only rounding to centimetres
    # poles: one value for all longitudes
    assert np.ptp(grid[0]) < 0.02 and np.ptp(grid[-1]) < 0.02
    low = meta["indian_ocean_low"]
    assert low["height_m"] == pytest.approx(grid.min(), abs=0.06)   # the Indian Ocean low is the global minimum
    assert -15 <= low["lat"] <= 25 and 55 <= low["lon"] <= 100
