"""Make the poster QR code (error correction H) as SVG and a 2000 px PNG.
Run from the project folder:  python poster/make_qr.py"""
from pathlib import Path

import qrcode
import qrcode.image.svg
from PIL import Image

URL = "https://sankalpabiswas40.github.io/grace-groundwater/"
out = Path(__file__).resolve().parent

qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=10, border=4)
qr.add_data(URL)
qr.make(fit=True)
qr.make_image(image_factory=qrcode.image.svg.SvgPathImage).save(str(out / "qr.svg"))
img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
img.resize((2000, 2000), Image.NEAREST).save(out / "qr_2000px.png")
(out / "qr_url.txt").write_text(URL + "\n")
print("QR for", URL, "modules:", qr.modules_count)
