# PLAN: "Weighing Delhi's Water from Space"

Status: **CHECKPOINT 1, waiting for approval.** Nothing has been built or downloaded yet.
Written 2026-11-11. Everything marked "verified" was looked up today, not recalled.
Everything marked "to fetch" has NOT been checked yet and will be fetched at that step.

---

## 1. Data products (verified by searching NASA's catalog, CMR, today)

### 1.1 JPL mascon TWS (main product)
| Item | Value |
|---|---|
| Collection short name | `TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4` |
| Version | RL06.3Mv04 (status ACTIVE; no newer CRI release found in CMR) |
| DOI | 10.5067/TEMSC-3JC634 |
| Host | NASA PO.DAAC (concept id C3195527175-POCLOUD) |
| Current file | `GRCTellus.JPL.200204_202609.GLO.RL06.3M.MSCNv04CRI.nc` (one file, about 44 MB, April 2002 to September 2026) |
| Variable | `lwe_thickness` (cm). Gain factors and land mask: JPL says they are inside the netCDF file; exact variable names to be confirmed from file metadata after download |
| Baseline | "All reported data are anomalies relative to the 2004.0-2009.999 time-mean baseline." (JPL mascon page) |
| Grid | 0.5 degree, but: "the native resolution is the size of a single mascon, which are 3 degrees in size." (JPL mascon page) |

**What the documentation says about gain factors.** There is no single "handbook" PDF
for this release. The official guidance is the JPL mascon page
(https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/) plus a change-log
("release notes") file. Quoted from the JPL page:

- "the gain factors can be used for hydrology-related signals, but should not be used
  for mountain glaciers or ice sheets"
- The page says the land scaling has not yet been applied to the data, that the factors
  are meant for the CRI-filtered version only, and that the corrected value is the grid
  value multiplied by the gain factor at the same cell.
- The page also cautions that the gain factors are dominated by the annual cycle, so
  they should be used with care for trends. (My tool returned this as a paraphrase;
  I will copy the exact sentence into the methods section after opening the page in a
  browser at the pipeline step.) **This matters, see Open Question 3.**

Release note to record in provenance (dated 21 October 2026): two minor bugs were
fixed and "an updated scale factor grid now accompanies the solution". We will use the
current file, which includes the fix.

Citations required by JPL: Watkins et al. (2015) doi:10.1002/2014JB011547;
Wiese, Landerer and Watkins (2016) doi:10.1002/2016WR019344; plus the dataset DOI.

### 1.2 CSR mascon TWS (independent comparison)
| Item | Value |
|---|---|
| Name | CSR GRACE/GRACE-FO RL06.3 Mascon Solutions (citation: "CSR GRACE and GRACE-FO RL06 Mascon Solutions v02") |
| DOI | 10.15781/cgq9-nh24; method paper Save, Bettadpur and Tapley (2016) doi:10.1002/2016JB013007 |
| Host | University of Texas CSR (not in NASA's CMR, so downloaded by plain HTTPS, not earthaccess) |
| File | `CSR_GRACE_GRACE-FO_RL0603_Mascons_all-corrections.nc` |
| Land mask | `CSR_GRACE_GRACE-FO_RL06_Mascons_v02_LandMask.nc` |
| Grid | 0.25 degree; native grid about 1 degree equal-area |
| Baseline | 2004.0 to 2009.999 mean (same as JPL) |
| Scaling | "The users should not apply any additional filtering or scaling factors to these solutions." |
| Span | April 2002 to August 2026 (page updated 2026-10-07) |

### 1.3 GLDAS Noah (land-surface model to subtract)
| Item | Value |
|---|---|
| Collection short name | `GLDAS_NOAH025_M`, version 2.1 |
| DOI | 10.5067/SXAVCZFAQLNO |
| Host | NASA GES DISC (concept id C1342986036-GES_DISC) |
| Files | one per month, e.g. `GLDAS_NOAH025_M.A202607.021.nc4`, about 23 MB each |
| Span | January 2000 to July 2026 (latest in catalog today) |
| Variables (from the GLDAS-2 README; to be re-confirmed from file metadata) | `SoilMoi0_10cm_inst`, `SoilMoi10_40cm_inst`, `SoilMoi40_100cm_inst`, `SoilMoi100_200cm_inst`, `SWE_inst`, `CanopInt_inst`, all kg m-2 |

Download size: about 290 months x 23 MB = roughly **6.5 GB** of raw GLDAS files.
I will try a regional subset request first so we only download the display box; if
that is not available through earthaccess, we download the full files.

### 1.4 Consequence for the time span
GLDAS currently ends July 2026, CSR ends August 2026, JPL ends September 2026.
So TWS runs to September 2026 (JPL) but **groundwater can only run to July 2026**.
The site will state each series' own end month.

### 1.5 Rodell et al. (2009), verified from the paper PDF today
Rodell, Velicogna and Famiglietti, Nature 460, 999-1002, doi:10.1038/nature08238.
- Region: Rajasthan, Punjab and Haryana (including Delhi), 438,296 km2.
- Period: August 2002 to October 2008.
- Value: 4.0 +/- 1.0 cm/yr equivalent water height = 17.7 +/- 4.5 km3/yr; net loss 109 km3.
- Their GRACE input: 73 monthly solutions from the Center for Space Research
  (a different, older processing than today's mascons).

Good news: their region is the same four administrative units as ours, so the
cross-check in pipeline step 8 compares like with like in area. It still differs in
GRACE processing and in the land model, and we will say so.

### 1.6 Other sources
| Need | Status |
|---|---|
| GRACE-FO 3D model | **Verified: exists.** `GRACE-FO.glb`, 6.66 MB, on gracefo.jpl.nasa.gov/resources/86/grace-fo-3d-model, credit "NASA Visualization Technology Applications and Development (VTAD)". JPL's image policy allows use without prior permission, with credit "Courtesy NASA/JPL-Caltech", no NASA/JPL logos and no implied endorsement. The policy text talks about images and video, not 3D models explicitly; I will credit it the same way and note this. |
| GRACE-FO separation | Verified: "separated by about 137 miles (220 km)" (gracefo.jpl.nasa.gov mission overview). |
| GRACE-FO altitude, ranging precision, dimensions | To fetch from NASA/GFZ pages at Chapter 2. |
| Geoid model | EGM2008 from ICGEM (GFZ); paper Pavlis et al. (2012) doi:10.1029/2011JB008916. File link, licence and chosen truncation degree to fetch at Chapter 4. |
| State boundaries | **Not settled, see Open Question 4.** |
| Earth textures (Blue Marble day, Black Marble night, clouds, specular, bump) | To fetch from NASA Visible Earth, with source URLs in provenance.json. |
| Specific yield range for alluvium | To fetch (candidate: CGWB aquifer/GEC methodology reports). |
| "Why" section figures | To fetch from CGWB's latest Dynamic Ground Water Resources assessment. |

---

## 2. Folder structure
```
grace-groundwater/
  pipeline/
    download.py        earthaccess login + downloads, writes provenance.json
    process.py         subset, anomalies, GWS, regional means, trend fits
    geoid.py           EGM2008 to low-degree geoid grid
    export.py          writes the small files the website reads
    quicklook.py       PNG plots + summary table for Checkpoint 2
    tests/             pytest (tests 1-6, sun position, geoid, water table)
    raw/               downloads (git-ignored)
    provenance.json
    requirements.txt   pinned versions
  web/
    index.html
    src/               TypeScript: tiers, loader, scene, chapters, map, charts, quiz
    public/data/       grid.json, frames.bin, trend_map.json, region_series.json, meta.json, geoid
    public/textures/   Earth textures (KTX2), satellite model
    public/static/     pre-rendered chapter images for the STATIC tier
    tests/             Vitest + Playwright
  poster/              QR code SVG + PNG
  .github/workflows/   GitHub Pages deploy
  PLAN.md  README.md  CHANGELOG.md  .gitignore
```

## 3. Processing steps (as in your Part 2, with my concrete choices)
1. Download JPL, CSR, GLDAS. Record version, DOI, file name, checksum and date in provenance.json.
2. Subset to 20-38 N, 66-92 E. Calendar-month axis from 2002-04 to the latest month; absent months stay NaN. No interpolation anywhere.
3. JPL: apply land mask; gain factors handled per Open Question 3.
4. CSR (0.25 degree) and GLDAS (0.25 degree) are averaged onto the JPL 0.5 degree grid with spherical cell-area weights.
5. GLDAS storage = 4 soil layers + SWE + canopy (kg m-2 = mm), converted to cm, then anomaly relative to the GLDAS mean over January 2004 to December 2009.
6. GWS = TWS - GLDAS storage anomaly. Surface water and reservoirs are not removed (stated in methods).
7. NW India mask from state polygons; area-weighted regional series with A = R^2 * dlon * (sin lat2 - sin lat1), R = 6371 km.
8. Six-parameter least-squares fit on available months; slope, standard error (stated as a lower bound because of autocorrelation); per-cell trend maps.
9. km3/yr = sum(b_cell [m/yr] * A_cell [m2]) / 1e9.
10. Rodell cross-check: same fit over August 2002 to October 2008, reported next to their 4.0 +/- 1.0 cm/yr, no tuning.
11. Export: Int16 millimetres, sentinel -32768 for NaN; total under 3 MB.
12. Quick-look PNGs and summary table. **CHECKPOINT 2.**

## 4. Site
One fixed three.js canvas, scroll-driven camera (GSAP ScrollTrigger), seven chapters
as in Part 5, with the precise 2D sections from Part 3 (#map, #curve, #method,
#gravity, #why, #quiz, #methods, #about) reachable from the chapters and by plain
hash links. Three quality tiers (FULL / LITE / STATIC), real byte-based loading bar,
light and dark mode, #poster loop, "Go deeper" toggles everywhere.

Build order (yours): tiers + loading screen, Chapters 1-2, Chapter 5, then 3, 6, 4, 7.
I show you each chapter running before starting the next.

Libraries (exact versions pinned when installed): vite, typescript, three, d3, gsap,
katex, vitest, @playwright/test. Asset tools: gltf-transform (meshopt) and a KTX2
encoder. Python: xarray, netCDF4, numpy, pandas, earthaccess, geopandas, regionmask,
matplotlib, pytest, qrcode.

## 5. Things about your computer I found
- Python 3.14.6, Node 24.19.0, npm 11.17.0, Git 2.56.1 are installed. Good.
- **GitHub CLI (`gh`) is not installed.** We need it (or the website) at Checkpoint 4.
- **No `.netrc` file yet.** You will need a free NASA Earthdata account. You will type
  the login yourself; I never see or store the password.
- Python 3.14 is very new. If a science library has no ready-made build for it, I will
  stop and ask you to install Python 3.12 alongside it rather than work around it.
- The folder is inside **OneDrive**. See Open Question 1.

## 6. Open questions for you
1. **Move the project out of OneDrive?** The website tooling creates tens of thousands
   of small files (`node_modules`) and 6+ GB of raw data. OneDrive will try to sync
   them, which is slow and often causes "file locked" errors. I recommend moving the
   folder to `C:\Users\sanka\grace-groundwater`. OK?
2. **Do you have a NASA Earthdata login?** (https://urs.earthdata.nasa.gov, free.)
   GLDAS also needs a one-time "authorize NASA GESDISC DATA ARCHIVE" click in your
   Earthdata profile. I will give step-by-step instructions when we get there.
3. **Gain factors and the trend.** JPL says gain factors are for hydrology signals but
   cautions about using them for trends. My recommendation: show monthly maps with
   gain factors applied (as JPL intends), and compute the headline trend **both ways**
   (with and without gain factors), reporting the unscaled value as the headline and
   the scaled one as a sensitivity range next to the JPL-vs-CSR difference. Agree, or
   do you want the gain-scaled value as the headline?
4. **Boundary file.** Survey of India offers a free Administrative Boundary Database on
   its online-maps portal, but it needs a registered account and its redistribution
   terms are unclear. Options: (a) you register and download the official file, and we
   use it for both analysis and display (most defensible); (b) I use an open file whose
   outer boundary follows the Survey of India depiction and whose licence clearly
   allows reuse, named exactly in provenance.json. I recommend (a) if you can spare
   10 minutes; otherwise (b). Which?
5. **GLDAS download size**: about 6.5 GB if regional subsetting is not available. Is
   your disk space and internet connection fine with that?
6. **Poster date and event name** for the #about section, and the exact poster title
   if different from "Weighing Delhi's Water from Space".
7. **GitHub**: do you have an account, and what username? Is a public repository
   acceptable (needed for free GitHub Pages)?
8. **Scope warning, plainly**: Parts 3 + 5 together are a large build (seven 3D
   chapters plus the full 2D site, three tiers, tests at two viewports). It will take
   many sessions. If your poster date is close, tell me, and I will propose which
   chapters to finish first so you always have a working site.
