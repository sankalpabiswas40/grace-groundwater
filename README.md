# Weighing Delhi's Water from Space

Poster companion site: how GRACE and GRACE-FO measure groundwater loss in northwest India.
See PLAN.md for the data products and method. Full rerun instructions are added as each stage is finished.

## Set up Python (once), from this folder in PowerShell
    python -m venv $HOME\grace-groundwater-venv
    & $HOME\grace-groundwater-venv\Scripts\python.exe -m pip install -r pipeline\requirements.txt

## Download data
    & $HOME\grace-groundwater-venv\Scripts\python.exe pipeline\download.py login
    & $HOME\grace-groundwater-venv\Scripts\python.exe pipeline\download.py all

## Run the tests
    & $HOME\grace-groundwater-venv\Scripts\python.exe -m pytest pipeline\tests

## Process and export (after downloading)
    & $HOME\grace-groundwater-venv\Scripts\python.exe pipeline\process.py
    & $HOME\grace-groundwater-venv\Scripts\python.exe pipeline\export.py
    & $HOME\grace-groundwater-venv\Scripts\python.exe pipeline\quicklook.py

## Website (needs Node.js)
Run these inside the `web` folder.

    npm install          # once
    npm run dev          # then open http://localhost:5173
    npm run test         # unit tests
    npm run build        # makes web\dist
    npx playwright test  # browser tests at phone and laptop sizes

Note: `web\node_modules` is a junction to `C:\Users\sanka\grace-nm\node_modules` so OneDrive does not sync it.
On another computer just run `npm install` in `web` (delete the junction first if it was copied).
