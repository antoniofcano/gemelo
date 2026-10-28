"""NDVI de Sentinel-2 L2A sobre Cerro Velasco (solo lectura; Planetary Computer, catálogo STAC público).
Para cada escena con poca nube del último año lee B04 (rojo) y B08 (infrarrojo cercano) a 10 m en una ventana de ~330 m y guarda el NDVI."""
import json, urllib.request, os, sys
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling
OUT = __import__("os").environ.get("GEMELO_DATOS", "datos")
UA = {"User-Agent": "gemelo-ndvi/1.0 (+https://github.com/antoniofcano/gemelo)", "Content-Type": "application/json"}
g = json.load(open(os.path.join(OUT, "chm_05m.json"))); H, W = g["shape"]
x0, y1 = g["xmin"], g["ymax"]; x1 = x0 + W*0.5; y0 = y1 - H*0.5          # ventana del gemelo (EPSG:25830)
lng0, lat0, lng1, lat1 = transform_bounds("EPSG:25830", "EPSG:4326", x0, y0, x1, y1)
def post(url, body):
    return json.loads(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), UA), timeout=90).read())
busq = post("https://planetarycomputer.microsoft.com/api/stac/v1/search", {
    "collections": ["sentinel-2-l2a"], "bbox": [lng0, lat0, lng1, lat1], "datetime": "2025-10-20T00:00:00Z/2026-10-25T23:59:59Z",
    "query": {"eo:cloud_cover": {"lt": 12}}, "limit": 100, "sortby": [{"field": "datetime", "direction": "asc"}]})
feats = busq["features"]; print("escenas con <12 % de nube:", len(feats))
tok = json.loads(urllib.request.urlopen("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a", timeout=60).read())["token"]
res = []; vistos = set()
for f in feats:
    dia = f["properties"]["datetime"][:10]
    if dia in vistos: continue
    try:
        a = f["assets"]; datos = {}
        for b in ("B04", "B08", "SCL"):
            with rasterio.open(a[b]["href"] + "?" + tok) as r:
                bx = transform_bounds("EPSG:25830", r.crs, x0, y0, x1, y1)
                win = from_bounds(*bx, transform=r.transform)
                shape = (int(round(win.height)) , int(round(win.width)))
                arr = r.read(1, window=win, out_shape=shape, resampling=Resampling.nearest, boundless=True, fill_value=0)
                datos[b] = (arr, r)
        red, nir, scl = datos["B04"][0].astype(float), datos["B08"][0].astype(float), datos["SCL"][0]
        if scl.shape != red.shape:
            from scipy.ndimage import zoom
            scl = zoom(scl, (red.shape[0]/scl.shape[0], red.shape[1]/scl.shape[1]), order=0)
        off = f["assets"]["B04"].get("raster:bands", [{}])[0].get("offset", -1000) if False else -1000   # processing baseline >= 04.00
        red, nir = (red + off) / 10000, (nir + off) / 10000
        ndvi = (nir - red) / np.maximum(nir + red, 1e-6)
        malo = np.isin(scl, [0, 1, 3, 8, 9, 10, 11]) | (red <= -0.05)
        frac = float(malo.mean())
        if frac > 0.15: continue
        ndvi = np.where(malo, np.nan, ndvi)
        vistos.add(dia); res.append({"fecha": dia, "nube": round(f["properties"]["eo:cloud_cover"], 1), "malo": round(frac, 2), "h": ndvi.shape[0], "w": ndvi.shape[1],
                                     "media": round(float(np.nanmean(ndvi)), 3), "ndvi": [None if np.isnan(v) else round(float(v), 3) for v in ndvi.ravel()]})
        print(dia, "NDVI medio", res[-1]["media"], ndvi.shape)
    except Exception as e:
        print("fallo", dia, str(e)[:90])
json.dump({"bbox25830": [x0, y0, x1, y1], "escenas": res}, open(os.path.join(OUT, "ndvi_sentinel2.json"), "w"))
print("guardadas", len(res), "escenas")
