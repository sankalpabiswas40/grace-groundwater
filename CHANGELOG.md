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
- Added the first Part 5 chapter: a 3D view (#globe) where the real GRACE grid stands on the globe as columns, with play/pause, month slider,
  total water vs groundwater, height exaggeration (always displayed), tap-a-column time series, free explore and a Flat map button.
- Added the underground chapter (#underground): a schematic 3D cutaway of alluvium whose water table follows our real NW India groundwater series,
  using delta_h = delta_GWS / Sy. Default Sy = 0.12 (Rodell et al. 2009); slider range 0.03-0.32 from Johnson (1967), USGS Water-Supply Paper 1662-D.
- 3D columns view rebuilt: columns now cover all of India (new pipeline step process_india.py and an India-wide GLDAS download),
  glide smoothly between months, sway gently in the page, and open in a full-screen explore mode where you can rotate and zoom the globe.
  All Indian state outlines are drawn. The compact 3D file stores whole centimetres and flags values beyond +/-127 cm.
- Removed the quiz section and the About section (name and college details) at the author's request; the methods section is now titled "Behind the numbers" and carries the image and data credits.
- Typography changed to locally bundled IBM Plex Sans / IBM Plex Mono and Source Serif 4 headings, with plainer corners and labels.
- Hero satellites now use NASA's official GRACE-FO 3D model (compressed from 7 MB to 254 KB), flying facing each other as the real pair does.
- Added an A1 print poster built from the real data (poster/poster_A1.pdf, poster_A1_300dpi.png, poster_preview.jpg) with the five authors and the QR code.
  Rebuild with: npm run build, npm run preview, then node scripts/make-poster.mjs (inside web).
- The site now always opens at the top: the browser no longer restores an old scroll position, and a refresh drops any #section left in the address. Fresh links that name a section still open there.
- The satellite section now has a 3D fly-over: NASA's GRACE-FO pair flies over a glowing mass beneath north-west India, driven by scrolling, with the separation graph underneath. Altitude and separation are to scale; the rest is labelled schematic. The flat diagram remains as the fallback.
- Added the geoid chapter (#geoid): a rotatable globe whose shape and colour show geoid heights computed in the pipeline (pipeline/geoid.py)
  from the EGM2008 gravity model (ICGEM, GFZ), degrees 2 to 60, with an exaggeration slider from 1x to 10,000x and the Indian Ocean low marked.
- New section 'Inside GRACE-FO' (#inside): tap the satellite and it comes apart. The interior is reconstructed from the Airbus DS layout diagram and the dimensions in the NASA/JPL press kit; each unit has a sourced description.
- Underground section upgraded: textured layers and fields, a depth scale, the drained zone and a labelled change arrow, pumping wells, a shallow well that runs dry, recharge in months when our data rise, a camera dive, a timeline strip and full-screen explore.
- Inside GRACE-FO rebuilt with a staged opening: the camera pushes in, the shell unlatches and splits into panels that swing open, a light sweeps the platform, units lift out in order, and the camera pulls back. Scrolling plays it; the button and taps still work.
  Once open: microwave rings from the horn, the laser beam through the bench and triple mirror, a floating proof mass, star-camera view cones and gas puffs. Added shadows (Full quality), panel detail, cable looms, stars and the Earth below, focus-on-part camera moves and small diagrams in the part cards.
- Fixed a layout bug where the 3D stage of that section kept growing taller on wide screens.
