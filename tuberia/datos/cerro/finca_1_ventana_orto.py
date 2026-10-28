"""Finca Cerro Velasco (5 parcelas): ventana que las abarca (+35 m), linde y olivos en UTM30, y ortofoto PNOA de toda la ventana."""
import json, math, os, urllib.request
import numpy as np
from rasterio.warp import transform as tr
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
F = json.load(open(os.path.join(R, "finca_cerro_velasco.json"), encoding="utf-8"))
ORDEN = ["cerro", "nave", "arroyo/abuelo", "polígono-65-parcela-254", "polígono-65-parcela-254-2"]
NOMBRES = {"cerro": "Cerro Velasco", "nave": "Nave / Cien olivos", "arroyo/abuelo": "Canario", "polígono-65-parcela-254": "Cerro Velasco Arriba", "polígono-65-parcela-254-2": "Pol. 65 Parc. 254-2"}
def utm(lista):
    if not lista: return []
    xs, ys = tr("EPSG:4326", "EPSG:25830", [q["lng"] for q in lista], [q["lat"] for q in lista])
    return [[round(a, 2), round(b, 2)] for a, b in zip(xs, ys)]
por_id = {p["id"]: p for p in F["parcelas"]}
parcelas = []
for pid in ORDEN:
    p = por_id[pid]
    parcelas.append({"id": pid, "nombre": NOMBRES[pid], "ha": p["ha"], "linde": utm(p["geometria"]), "olivos": utm(p["olivos"])})
M = 35
xs = [q[0] for p in parcelas for q in p["linde"]]; ys = [q[1] for p in parcelas for q in p["linde"]]
x0 = math.floor(min(xs) - M); y0 = math.floor(min(ys) - M); x1 = math.ceil(max(xs) + M); y1 = math.ceil(max(ys) + M)
if (x1 - x0) % 2: x1 += 1
if (y1 - y0) % 2: y1 += 1
W, H = x1 - x0, y1 - y0
out = {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "W": W, "H": H, "parcelas": parcelas}
json.dump(out, open(os.path.join(R, "finca_ventana.json"), "w", encoding="utf-8"))
print("ventana UTM30: X %d-%d  Y %d-%d  (%d x %d m)" % (x0, x1, y0, y1, W, H))
for p in parcelas: print(" ", p["nombre"], "| %.2f ha | linde %d pts | olivos %d" % (p["ha"], len(p["linde"]), len(p["olivos"])))
PX = 0.35
w, h = int(W / PX), int(H / PX)
url = ("https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:25830"
       f"&BBOX={x0},{y0},{x1},{y1}&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg")
data = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "gemelo-ref/1.0"}), timeout=180).read()
open(os.path.join(R, "orto_finca.jpg"), "wb").write(data)
json.dump({"w": w, "h": h, "px": PX}, open(os.path.join(R, "orto_finca.json"), "w"))
print("ortofoto", w, "x", h, "px,", len(data) // 1024, "KB")
