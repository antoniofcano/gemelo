"""NDVI de Sentinel-2 L2A sobre Hituelo (solo lectura; STAC público de Planetary Computer). Rejilla de 10 m alineada a múltiplos de 10 (EPSG:25830).
Por escena con poca nube lee B04, B08 y SCL, enmascara lo malo y guarda NDVI como u8 (0 = sin dato; 1..254 = (NDVI+0,2)/1,2*253+1, ver LEEME)."""
import json, os, sys, math, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling
from img_comun import *
UA = {"User-Agent": "gemelo-ndvi/1.0 (+https://github.com/antoniofcano/gemelo)", "Content-Type": "application/json"}
x0, y0, x1, y1 = caja(60.0); x0 = math.floor(x0 / 10) * 10; y0 = math.floor(y0 / 10) * 10; x1 = math.ceil(x1 / 10) * 10; y1 = math.ceil(y1 / 10) * 10
W, H = (x1 - x0) // 10, (y1 - y0) // 10
FIN = "2026-10-27"
lng0, lat0, lng1, lat1 = transform_bounds("EPSG:25830", "EPSG:4326", x0, y0, x1, y1)
def post(url, body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), UA), timeout=90).read())
busq = post("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
    "collections": ["sentinel-2-l2a"], "bbox": [lng0, lat0, lng1, lat1], "datetime": "2025-10-20T00:00:00Z/%sT23:59:59Z" % FIN,
    "query": {"eo:cloud_cover": {"lt": 12}}, "limit": 200, "sortby": [{"field": "datetime", "direction": "asc"}]})
feats = busq["features"]; print("rejilla", W, "x", H, "· escenas con <12 % de nube:", len(feats))
def token():
    return json.loads(urllib.request.urlopen("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a", timeout=60).read())["token"]
tok = token(); res = []; vistos = set()
for f in feats:
    dia = f["properties"]["datetime"][:10]
    if dia in vistos: continue
    try:
        a = f["assets"]; datos = {}
        for b in ("B04", "B08", "SCL"):
            with rasterio.open(a[b]["href"] + "?" + tok) as r:
                bx = transform_bounds("EPSG:25830", r.crs, x0, y0, x1, y1)
                win = from_bounds(*bx, transform=r.transform)
                datos[b] = r.read(1, window=win, out_shape=(H, W), resampling=Resampling.nearest if b == "SCL" else Resampling.average, boundless=True, fill_value=0)
        red, nir, scl = datos["B04"].astype(float), datos["B08"].astype(float), datos["SCL"]
        off = -1000                                              # línea base de proceso >= 04.00
        red, nir = (red + off) / 10000, (nir + off) / 10000
        ndvi = (nir - red) / np.maximum(nir + red, 1e-6)
        malo = np.isin(scl, [0, 1, 3, 8, 9, 10, 11]) | (red <= -0.05)
        frac = float(malo.mean())
        if frac > 0.15: print("  descarto", dia, "malo", round(frac, 2)); continue
        ndvi = np.where(malo, np.nan, ndvi); vistos.add(dia)
        res.append({"fecha": dia, "nube": round(f["properties"]["eo:cloud_cover"], 1), "malo": round(frac, 3), "tile": f["id"].split("_")[-2] if "_" in f["id"] else "", "ndvi": ndvi.astype("float32")})
        print(dia, "NDVI medio %.3f" % np.nanmean(ndvi), "malo", round(frac, 2))
    except Exception as e:
        print("fallo", dia, str(e)[:100])
        if "403" in str(e) or "expired" in str(e).lower(): tok = token()
np.savez_compressed(os.path.join(BASE, "ndvi", "ndvi_hituelo_float.npz"), fechas=np.array([e["fecha"] for e in res]), ndvi=np.stack([e["ndvi"] for e in res]), bbox=np.array([x0, y0, x1, y1]))
# u8: 0 = sin dato; NDVI -0,2..1,0 -> 1..254
q = np.stack([np.where(np.isnan(e["ndvi"]), 0, np.clip(np.round((e["ndvi"] + 0.2) / 1.2 * 253 + 1), 1, 254)) for e in res]).astype("uint8")
os.makedirs(os.path.join(BASE, "ndvi"), exist_ok=True)
open(os.path.join(BASE, "ndvi", "ndvi_u8.bin"), "wb").write(q.tobytes())
json.dump({"bbox25830": [x0, y0, x1, y1], "w": W, "h": H, "paso_m": 10, "orden": "escena, fila (norte arriba), columna (oeste a este)", "codigo_u8": "0 sin dato; v=1..254 -> ndvi=(v-1)/253*1.2-0.2",
           "fechas": [e["fecha"] for e in res], "nube_escena": [e["nube"] for e in res], "malo": [e["malo"] for e in res], "media": [round(float(np.nanmean(e["ndvi"])), 3) for e in res]},
          open(os.path.join(BASE, "ndvi", "ndvi_hituelo.json"), "w"))
print("guardadas", len(res), "escenas;", q.nbytes // 1024, "KB u8")
