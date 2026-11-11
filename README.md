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
