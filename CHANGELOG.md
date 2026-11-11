# Changelog

## 2026-11-11
- Wrote PLAN.md after looking up the exact data product names, versions and DOIs.
- Set up Git and a Python environment (kept outside OneDrive, in `C:\Users\sanka\grace-groundwater-venv`).
- Windows Smart App Control blocked the very newest builds of pandas, netCDF4 and pyproj,
  so slightly older releases are pinned in `pipeline/requirements.txt` (pandas 3.1.0, netCDF4 1.7.5.1, pyproj 3.7.2).
- Added the core maths (cell areas, Bouguer slab, trend fit, volume rate, water-table conversion) with 5 passing tests.
- Added `pipeline/download.py`. Downloaded the CSR mascon file and the state boundary file (DataMeet, CC BY 4.0).
- Raw downloads are kept in `C:\Users\sanka\grace-groundwater-raw` so OneDrive does not sync them.
