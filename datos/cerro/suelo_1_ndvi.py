"""NDVI a 10 m = mezcla de copa y suelo. Por fecha: NDVI ≈ a + b·f, con f la fracción de copa de la celda (del LiDAR). a = el suelo (hierba o desnudo), a+b = la copa.
Aquí se mira si la separación es estable y qué dice de la hierba a lo largo del año."""
import json, glob, os, base64
import numpy as np
from scipy import ndimage as ndi
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8")); x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
nd = json.load(open(R + r"\ndvi_finca.json", encoding="utf-8"))["escenas"] if "escenas" in json.load(open(R + r"\ndvi_finca.json", encoding="utf-8")) else None
print("claves:", list(json.load(open(R + r"\ndvi_finca.json", encoding="utf-8")).keys())[:6])
nd = json.load(open(R + r"\ndvi_finca.json", encoding="utf-8"))["escenas"]
w, h = nd[0]["w"], nd[0]["h"]; print("rejilla", w, h, "escenas", len(nd))
P = np.load(R + r"\paisaje_puntos.npy").astype(np.float64); X, Y, Z, Hh, CL = P.T
# fracción de copa por celda de 10 m: puntos de vegetación a más de 1,2 m sobre el suelo / puntos totales de la celda (proxy de cobertura de dosel)
veg = (Hh > 1.2) & (CL != 6) & (CL != 7); cel = lambda x, y: (np.clip(((y1 - y) / (y1 - y0) * h).astype(int), 0, h - 1), np.clip(((x - x0) / (x1 - x0) * w).astype(int), 0, w - 1))
tot = np.zeros((h, w)); vv = np.zeros((h, w)); np.add.at(tot, cel(X, Y), 1); np.add.at(vv, cel(X[veg], Y[veg]), 1)
f = np.where(tot > 0, vv / np.maximum(tot, 1), 0); print("fracción de copa por celda: p5 %.2f mediana %.2f p95 %.2f" % tuple(np.percentile(f, [5, 50, 95])))
print("fecha       media_NDVI   a(suelo)  a+b(copa)   R²")
for e in nd[::3] + [nd[-1]]:
    v = np.array([np.nan if q is None else q for q in e["ndvi"]]).reshape(h, w); m = np.isfinite(v)
    if m.sum() < 200: continue
    A = np.column_stack([np.ones(m.sum()), f[m]]); coef, *_ = np.linalg.lstsq(A, v[m], rcond=None); pred = A @ coef; r2 = 1 - ((v[m] - pred) ** 2).sum() / ((v[m] - v[m].mean()) ** 2).sum()
    print("%s  %6.3f   %7.3f   %7.3f   %5.2f" % (e["fecha"], np.nanmean(v), coef[0], coef[0] + coef[1], r2))
