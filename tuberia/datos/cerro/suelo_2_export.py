"""Exporta lo necesario para separar el suelo de la copa en cada imagen de NDVI: la fracción de copa f de cada celda de 10 m (del LiDAR) y, por fecha,
la recta NDVI = a + b·f (a: el suelo; b: lo que añade la copa). El gemelo calcula con ellas el NDVI del suelo: g = NDVI − b·f. Escribe suelo_ndvi.json."""
import json, base64
import numpy as np
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8")); x0, y0, x1, y1 = V["x0"], V["y0"], V["x1"], V["y1"]
nd = json.load(open(R + r"\ndvi_finca.json", encoding="utf-8"))["escenas"]; w, h = nd[0]["w"], nd[0]["h"]
P = np.load(R + r"\paisaje_puntos.npy").astype(np.float64); X, Y, Z, Hh, CL = P.T
veg = (Hh > 1.2) & (CL != 6) & (CL != 7)
cel = lambda x, y: (np.clip(((y1 - y) / (y1 - y0) * h).astype(int), 0, h - 1), np.clip(((x - x0) / (x1 - x0) * w).astype(int), 0, w - 1))
tot = np.zeros((h, w)); vv = np.zeros((h, w)); np.add.at(tot, cel(X, Y), 1); np.add.at(vv, cel(X[veg], Y[veg]), 1)
f = np.where(tot > 0, vv / np.maximum(tot, 1), 0.3)
A, B = [], []
for e in nd:
    v = np.array([np.nan if q is None else q for q in e["ndvi"]]).reshape(h, w); m = np.isfinite(v)
    if m.sum() < 200: A.append(float(np.nanmean(v)) if m.any() else 0.3); B.append(0.0); continue
    M = np.column_stack([np.ones(m.sum()), f[m]]); coef, *_ = np.linalg.lstsq(M, v[m], rcond=None)
    A.append(round(float(coef[0]), 3)); B.append(round(float(np.clip(coef[1], 0.0, 0.8)), 3))
q = np.round(f * 1000).astype("<i2")
json.dump({"w": w, "h": h, "f": base64.b64encode(q.tobytes()).decode(), "a": A, "b": B, "fechas": [e["fecha"] for e in nd]}, open(R + r"\suelo_ndvi.json", "w"))
print("suelo_ndvi.json:", len(A), "fechas · suelo NDVI mínimo %.2f (%s) máximo %.2f (%s) · hoy %.2f" % (min(A), nd[int(np.argmin(A))]["fecha"], max(A), nd[int(np.argmax(A))]["fecha"], A[-1]))
