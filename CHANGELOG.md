# Changelog

## 2026-11-11
- Wrote PLAN.md after looking up the exact data product names, versions and DOIs.
- Set up Git and a Python environment (kept outside OneDrive, in `C:\Users\sanka\grace-groundwater-venv`).
- Windows Smart App Control blocked the very newest builds of pandas, netCDF4 and pyproj,
  so slightly older releases are pinned in `pipeline/requirements.txt` (pandas 3.1.0, netCDF4 1.7.5.1, pyproj 3.7.2).
- Added the core maths (cell areas, Bouguer slab, trend fit, volume rate, water-table conversion) with 5 passing tests.
- Added `pipeline/download.py`. Downloaded the CSR mascon file and the state boundary file (DataMeet, CC BY 4.0).
- Raw downloads are kept in `C:\Users\sanka\grace-groundwater-raw` so OneDrive does not sync them.
- Logged in to NASA Earthdata; downloaded the JPL mascon file and 292 months of GLDAS (map area only, through NASA's cloud subsetting service).
- Processed everything (process.py), exported the website data (export.py, 2.3 MB) and made quick-look plots. Checkpoint 2 approved.
- Built the first full website: 3D Earth hero with the real day/night line, gravity slider, satellite fly-over, method bar chart,
  interactive map, trend curve with cycle/trend separation, sourced "why" section, quiz, methods with equations, poster mode,
  Full/Lite/Static quality tiers, light and dark mode.
- Tests: 9 Python tests, 8 unit tests and 16 browser tests (phone and laptop sizes) all pass.
- Not yet built: the Part 5 scroll-driven 3D chapters (3D columns on the globe, geoid, underground cutaway), NASA GRACE-FO 3D model,
  compressed KTX2 textures, sound, tilt-to-look. Current Central Ground Water Board figures could not be fetched (their server refused the connection).
- Deployed to GitHub Pages with a GitHub Actions workflow: https://sankalpabiswas40.github.io/grace-groundwater/
- All 16 browser tests pass against the live address at phone (390 x 844) and laptop (1440 x 900) sizes.
- Made the poster QR code (error correction H) as poster/qr.svg and poster/qr_2000px.png.
