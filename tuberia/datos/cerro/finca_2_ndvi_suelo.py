"""NDVI Sentinel-2 de la ventana de la finca (42 fechas) y SoilGrids de cada parcela (solo lectura)."""
import json, os, time, urllib.request
import numpy as np, rasterio
from rasterio.windows import from_bounds
from rasterio.warp import transform_bounds
from rasterio.enums import Resampling
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8"))
x0, y0, x1, y1 = V["x0"], V["y0"], V["x1"], V["y1"]
UA = {"User-Agent": "gemelo-ndvi/1.0 (+https://github.com/antoniofcano/gemelo)", "Content-Type": "application/json"}
def post(url, body): return json.loads(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), UA), timeout=90).read())

# ---- NDVI
lng0, lat0, lng1, lat1 = transform_bounds("EPSG:25830", "EPSG:4326", x0, y0, x1, y1)
feats = post("https://planetarycomputer.microsoft.com/api/stac/v1/search", {"collections": ["sentinel-2-l2a"], "bbox": [lng0, lat0, lng1, lat1],
    "datetime": "2025-10-20T00:00:00Z/2026-10-25T23:59:59Z", "query": {"eo:cloud_cover": {"lt": 12}}, "limit": 100, "sortby": [{"field": "datetime", "direction": "asc"}]})["features"]
tok = json.loads(urllib.request.urlopen("https://planetarycomputer.microsoft.com/api/sas/v1/token/sentinel-2-l2a", timeout=60).read())["token"]
res, vistos = [], set()
for f in feats:
    dia = f["properties"]["datetime"][:10]
    if dia in vistos: continue
    try:
        datos = {}; forma = None
        for b in ("B04", "B08", "SCL"):
            with rasterio.open(f["assets"][b]["href"] + "?" + tok) as r:
                bx = transform_bounds("EPSG:25830", r.crs, x0, y0, x1, y1); win = from_bounds(*bx, transform=r.transform)
                if forma is None: forma = (int(round(win.height)), int(round(win.width)))   # la de B04 (10 m); SCL viene a 20 m y se remuestrea a la misma
                datos[b] = r.read(1, window=win, out_shape=forma, resampling=Resampling.nearest, boundless=True, fill_value=0)
        red, nir, scl = (datos["B04"].astype(float) - 1000) / 10000, (datos["B08"].astype(float) - 1000) / 10000, datos["SCL"]
        ndvi = (nir - red) / np.maximum(nir + red, 1e-6)
        malo = np.isin(scl, [0, 1, 3, 8, 9, 10, 11]) | (red <= -0.05)
        if malo.mean() > 0.15: continue
        ndvi = np.where(malo, np.nan, ndvi); vistos.add(dia)
        res.append({"fecha": dia, "h": ndvi.shape[0], "w": ndvi.shape[1], "media": round(float(np.nanmean(ndvi)), 3), "ndvi": [None if np.isnan(v) else round(float(v), 3) for v in ndvi.ravel()]})
    except Exception as e:
        print("fallo", dia, str(e)[:80])
json.dump({"escenas": res}, open(R + r"\ndvi_finca.json", "w"))
print("NDVI:", len(res), "fechas,", res[0]["w"], "x", res[0]["h"], "px de 10 m")

# ---- SoilGrids por parcela (centro de la linde; una consulta cada 13 s por el límite del servicio)
sg = {}
for p in V["parcelas"]:
    L = np.array(p["linde"]); cx, cy = L[:, 0].mean(), L[:, 1].mean()
    from rasterio.warp import transform as tr
    lng, lat = [a[0] for a in tr("EPSG:25830", "EPSG:4326", [cx], [cy])]
    url = ("https://rest.isric.org/soilgrids/v2.0/properties/query?lon=%.5f&lat=%.5f&property=clay&property=sand&property=silt&property=phh2o&property=soc&property=nitrogen&property=cec&property=bdod&property=cfvo"
           "&depth=0-5cm&depth=5-15cm&depth=15-30cm&depth=30-60cm&value=mean") % (lng, lat)
    try:
        d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "gemelo-ref/1.0"}), timeout=90).read())
        capas = {l["name"]: l for l in d["properties"]["layers"]}
        val = lambda n, i: capas[n]["depths"][i]["values"]["mean"] / capas[n]["unit_measure"]["d_factor"]
        sg[p["id"]] = {"lng": round(lng, 5), "lat": round(lat, 5), "filas": [{"p": pr, "a": val("sand", i), "l": val("silt", i), "c": val("clay", i), "ph": val("phh2o", i), "mo": val("soc", i) * 1.724 / 10, "cec": val("cec", i), "dens": val("bdod", i), "pedr": val("cfvo", i)} for i, pr in enumerate(["0-5", "5-15", "15-30", "30-60"])]}
        print("suelo", p["nombre"], "arcilla %.0f%%" % sg[p["id"]]["filas"][1]["c"], "pH %.1f" % sg[p["id"]]["filas"][1]["ph"])
    except Exception as e:
        print("suelo fallo", p["nombre"], str(e)[:80])
    time.sleep(13)
json.dump(sg, open(R + r"\soilgrids_finca.json", "w", encoding="utf-8"), ensure_ascii=False)
