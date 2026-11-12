"""Shared settings for the pipeline. No credentials live here."""
import os
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
REPO = PIPELINE.parent

# Raw downloads are large. If the repo sits inside OneDrive we keep them outside it,
# so OneDrive does not try to sync gigabytes. Override with the GRACE_RAW variable.
if os.environ.get("GRACE_RAW"):
    RAW = Path(os.environ["GRACE_RAW"])
elif "onedrive" in str(REPO).lower():
    RAW = Path.home() / "grace-groundwater-raw"
else:
    RAW = PIPELINE / "raw"

PROVENANCE = PIPELINE / "provenance.json"
OUT = REPO / "web" / "public" / "data"
QUICKLOOK = PIPELINE / "quicklook"

# Display box
LAT_MIN, LAT_MAX = 20.0, 38.0
LON_MIN, LON_MAX = 66.0, 92.0

R_EARTH_KM = 6371.0
BASELINE = ("2004-01", "2009-12")   # same as JPL and CSR: 2004.0 - 2009.999
FIRST_MONTH = "2002-04"

JPL_SHORT_NAME = "TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4"
JPL_DOI = "10.5067/TEMSC-3JC634"
GLDAS_SHORT_NAME = "GLDAS_NOAH025_M"
GLDAS_VERSION = "2.1"
GLDAS_DOI = "10.5067/SXAVCZFAQLNO"
GLDAS_CONCEPT = "C1342986036-GES_DISC"
GLDAS_VARS = ["SoilMoi0_10cm_inst", "SoilMoi10_40cm_inst", "SoilMoi40_100cm_inst",
              "SoilMoi100_200cm_inst", "SWE_inst", "CanopInt_inst"]
CSR_BASE = "https://download.csr.utexas.edu/outgoing/grace/RL0603_mascons/"
CSR_FILE = "CSR_GRACE_GRACE-FO_RL0603_Mascons_all-corrections.nc"
CSR_MASK = "CSR_GRACE_GRACE-FO_RL06_Mascons_v02_LandMask.nc"
CSR_DOI = "10.15781/cgq9-nh24"
STATES_BASE = "https://raw.githubusercontent.com/datameet/maps/master/States/"
STATES_FILES = ["Admin2.shp", "Admin2.shx", "Admin2.dbf", "Admin2.prj", "Admin2.cpg"]
NW_STATES = ["Punjab", "Haryana", "Delhi", "Rajasthan"]

# Whole-of-India box for the 3D columns view: lat_min, lat_max, lon_min, lon_max
INDIA_BOX = (6.0, 38.0, 66.0, 98.0)

# Geoid: EGM2008 from the ICGEM service (GFZ), used only up to this spherical-harmonic degree
EGM2008_URL = "https://icgem.gfz.de/getmodel/gfc/c50128797a9cb62e936337c890e4425f03f0461d7329b09a8cc8561504465340/EGM2008.gfc"
GEOID_NMAX = 60
