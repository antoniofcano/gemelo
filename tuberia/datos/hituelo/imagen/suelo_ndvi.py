"""Desmezcla del NDVI de 10 m en suelo y copa, igual que Cerro Velasco (suelo_2_export.py): por fecha, NDVI = a + b·f, con f la fracción de copa de la celda;
a es el suelo (hierba o desnudo) y b lo que añade la copa. Escribe suelo_ndvi_hituelo.json con la misma forma que suelo_ndvi.json.
f PROVISIONAL: fracción de píxeles de 2,5 m con altura de vegetación > 1,2 m (MDS normalizado del IGN). Cuando haya LiDAR de 3.ª cobertura se rehace con
   python -I suelo_ndvi.py --f f_lidar.npy      (npy float32 H x W de la misma rejilla, norte arriba, valores 0..1: puntos de vegetación > 1,2 m / puntos de la celda)."""
import json, os, sys, base64
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, rasterio
from img_comun import BASE
M = json.load(open(os.path.join(BASE, "ndvi", "ndvi_hituelo.json"))); W, H = M["w"], M["h"]; x0, y0, x1, y1 = M["bbox25830"]
N = np.frombuffer(open(os.path.join(BASE, "ndvi", "ndvi_u8.bin"), "rb").read(), dtype="uint8").reshape(len(M["fechas"]), H, W)
if "--f" in sys.argv:
    f = np.load(sys.argv[sys.argv.index("--f") + 1]).astype("float64"); origen = "LiDAR 3.ª cobertura (puntos de vegetación > 1,2 m sobre el total de la celda)"
else:
    r = rasterio.open(__import__("os").environ.get("GEMELO_MDS", "mdsn_v025_hituelo.tif")); a = r.read(1); b = r.bounds; print("MDS", r.crs, b, a.shape, r.res)
    f = np.zeros((H, W)); veg = (a > 1.2).astype(float)
    res = r.res[0]
    for j in range(H):
        for i in range(W):
            ex0, ex1, ey1, ey0 = x0 + i * 10, x0 + (i + 1) * 10, y1 - j * 10, y1 - (j + 1) * 10
            c0, c1 = int((ex0 - b.left) / res), int(np.ceil((ex1 - b.left) / res)); r0, r1 = int((b.top - ey1) / res), int(np.ceil((b.top - ey0) / res))
            if c0 < 0 or r0 < 0 or c1 > a.shape[1] or r1 > a.shape[0]: f[j, i] = 0.3; continue
            f[j, i] = veg[r0:r1, c0:c1].mean()
    origen = "PROVISIONAL: MDS normalizado de 2,5 m del IGN (píxeles > 1,2 m)"
print("f: p5 %.2f mediana %.2f p95 %.2f" % tuple(np.percentile(f, [5, 50, 95])))
A, B = [], []
for k, fecha in enumerate(M["fechas"]):
    v = np.where(N[k] == 0, np.nan, (N[k].astype(float) - 1) / 253 * 1.2 - 0.2); m = np.isfinite(v)
    if m.sum() < 200: A.append(round(float(np.nanmean(v)), 3) if m.any() else 0.3); B.append(0.0); continue
    X = np.column_stack([np.ones(m.sum()), f[m]]); coef, *_ = np.linalg.lstsq(X, v[m], rcond=None)
    A.append(round(float(coef[0]), 3)); B.append(round(float(np.clip(coef[1], 0.0, 0.8)), 3))
q = np.round(f * 1000).astype("<i2")
json.dump({"w": W, "h": H, "bbox25830": [x0, y0, x1, y1], "f": base64.b64encode(q.tobytes()).decode(), "a": A, "b": B, "fechas": M["fechas"], "f_origen": origen}, open(os.path.join(BASE, "ndvi", "suelo_ndvi_hituelo.json"), "w"))
i0, i1 = int(np.argmin(A)), int(np.argmax(A))
print("%d fechas · suelo NDVI mínimo %.2f (%s) máximo %.2f (%s) · último %.2f (%s) · b mediana %.2f" % (len(A), A[i0], M["fechas"][i0], A[i1], M["fechas"][i1], A[-1], M["fechas"][-1], np.median(B)))
