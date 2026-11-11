"""Download the real data. Usage (from the project folder):

    python pipeline/download.py login        # you type your Earthdata login yourself
    python pipeline/download.py csr          # CSR mascons (no login needed)
    python pipeline/download.py boundaries   # state boundary file
    python pipeline/download.py jpl          # JPL mascons (needs login)
    python pipeline/download.py gldas        # GLDAS Noah, display box only (needs login)
    python pipeline/download.py all

Credentials are never written into this code, the logs or Git. earthaccess stores
them in the .netrc file in your home folder when you run "login".
If anything fails this script stops with an error. It never substitutes values.
"""
import datetime as dt
import hashlib
import json
import sys
import urllib.request

import config as C


def today():
    return dt.date.today().isoformat()


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def record(key, info):
    prov = json.loads(C.PROVENANCE.read_text()) if C.PROVENANCE.exists() else {}
    prov[key] = info
    C.PROVENANCE.write_text(json.dumps(prov, indent=2))


def http_get(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    print(f"  {url}")
    with urllib.request.urlopen(url, timeout=120) as r, open(tmp, "wb") as f:
        total = int(r.headers.get("Content-Length", 0)); done = 0
        while True:
            b = r.read(1 << 20)
            if not b:
                break
            f.write(b); done += len(b)
            if total:
                print(f"\r  {done/1e6:7.1f} / {total/1e6:.1f} MB", end="")
        print()
    if total and done != total:
        raise RuntimeError(f"Incomplete download of {url}")
    tmp.replace(dest)


def login():
    import earthaccess
    auth = earthaccess.login(strategy="interactive", persist=True)
    if not auth.authenticated:
        raise SystemExit("Login failed.")
    print("Login OK. Saved to the .netrc file in your home folder.")


def _auth():
    import earthaccess
    auth = earthaccess.login(strategy="netrc")
    if not auth or not auth.authenticated:
        raise SystemExit("Not logged in. Run:  python pipeline/download.py login")
    return earthaccess


def csr():
    d = C.RAW / "csr"
    files = {}
    for name in (C.CSR_FILE, C.CSR_MASK):
        if not (d / name).exists():
            http_get(C.CSR_BASE + name, d / name)
        files[name] = sha256(d / name)
    record("csr_mascon", {
        "product": "CSR GRACE/GRACE-FO RL06.3 Mascon Solutions (RL06 Mascons v02), all corrections",
        "doi": C.CSR_DOI, "source": C.CSR_BASE, "files_sha256": files,
        "download_date": today()})
    print("CSR done.")


def boundaries():
    d = C.RAW / "boundaries"
    files = {}
    for name in C.STATES_FILES:
        if not (d / name).exists():
            http_get(C.STATES_BASE + name, d / name)
        files[name] = sha256(d / name)
    record("state_boundaries", {
        "file": "States/Admin2.shp", "source": "https://github.com/datameet/maps",
        "provider": "DataMeet India community", "licence": "CC BY 4.0",
        "note": "Open file chosen by the author instead of the Survey of India portal "
                "download. Not an official Survey of India product.",
        "analysis_region": C.NW_STATES, "files_sha256": files, "download_date": today()})
    print("Boundaries done.")


def jpl():
    ea = _auth()
    res = ea.search_data(short_name=C.JPL_SHORT_NAME)
    if not res:
        raise SystemExit("JPL collection returned no files. Stopping.")
    res = sorted(res, key=lambda g: g["umm"]["GranuleUR"])[-1:]
    d = C.RAW / "jpl"; d.mkdir(parents=True, exist_ok=True)
    paths = ea.download(res, str(d))
    p = [x for x in map(str, paths) if x.endswith(".nc")]
    if not p:
        raise SystemExit("JPL download failed. Stopping.")
    from pathlib import Path
    record("jpl_mascon", {
        "short_name": C.JPL_SHORT_NAME, "version": "RL06.3Mv04", "doi": C.JPL_DOI,
        "host": "NASA PO.DAAC", "file": Path(p[0]).name, "sha256": sha256(p[0]),
        "download_date": today()})
    print("JPL done:", p[0])


def gldas():
    """Fetch only the display box (plus a 1-degree margin) for each month through
    NASA's cloud OPeNDAP service. The values are the original model values; only the
    area is cut down. One small netCDF file per month."""
    ea = _auth()
    res = ea.search_data(short_name=C.GLDAS_SHORT_NAME, version=C.GLDAS_VERSION,
                         temporal=(C.FIRST_MONTH + "-01", today()))
    if not res:
        raise SystemExit("GLDAS search returned nothing. Stopping.")
    names = sorted({g["umm"]["GranuleUR"].split(":")[-1] for g in res})
    names = [n for n in names if n.endswith(".nc4")]
    print(f"{len(names)} GLDAS months found: {names[0]} ... {names[-1]}")
    # GLDAS 0.25 degree grid: lat -59.875..89.875 (600), lon -179.875..179.875 (1440).
    # The index range is verified against the returned lat/lon in process.py.
    j0 = round((C.LAT_MIN - 1 + 59.875 + 0.125) / 0.25); j1 = round((C.LAT_MAX + 1 + 59.875 - 0.125) / 0.25)
    i0 = round((C.LON_MIN - 1 + 179.875 + 0.125) / 0.25); i1 = round((C.LON_MAX + 1 + 179.875 - 0.125) / 0.25)
    ce = ";".join([f"/{v}[0:1:0][{j0}:1:{j1}][{i0}:1:{i1}]" for v in C.GLDAS_VARS]
                  + [f"/lat[{j0}:1:{j1}]", f"/lon[{i0}:1:{i1}]", "/time"])
    session = ea.get_requests_https_session()
    d = C.RAW / "gldas"; d.mkdir(parents=True, exist_ok=True)
    got = 0
    for k, n in enumerate(names):
        dest = d / n.replace(".nc4", ".subset.nc4")
        if dest.exists() and dest.stat().st_size > 1000:
            continue
        url = (f"https://opendap.earthdata.nasa.gov/collections/{C.GLDAS_CONCEPT}"
               f"/granules/{n}.dap.nc4?dap4.ce={ce}")
        for attempt in range(4):
            r = session.get(url, timeout=180)
            if r.status_code == 200 and r.content[:4] in (b"\x89HDF", b"CDF\x01", b"CDF\x02"):
                break
        else:
            raise SystemExit(f"GLDAS subset failed for {n}: HTTP {r.status_code}\n"
                             f"{r.text[:400]}\nStopping (no values are made up).")
        dest.write_bytes(r.content); got += 1
        print(f"\r  {k+1}/{len(names)} {n}", end="")
    print(f"\nGLDAS done ({got} new files).")
    record("gldas_noah", {
        "short_name": C.GLDAS_SHORT_NAME, "version": C.GLDAS_VERSION, "doi": C.GLDAS_DOI,
        "host": "NASA GES DISC (via opendap.earthdata.nasa.gov)",
        "variables": C.GLDAS_VARS, "subset": "display box plus 1 degree margin, "
        f"lat index {j0}-{j1}, lon index {i0}-{i1}; values unchanged",
        "first_file": names[0], "last_file": names[-1], "n_months": len(names),
        "download_date": today()})


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    steps = {"login": [login], "csr": [csr], "boundaries": [boundaries], "jpl": [jpl],
             "gldas": [gldas], "all": [csr, boundaries, jpl, gldas]}
    if cmd not in steps:
        raise SystemExit(__doc__)
    for f in steps[cmd]:
        f()
