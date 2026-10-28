"""Imagen de control del paisaje: ortofoto + edificios + puntos altos + cauce por acumulación de flujo en el terreno. Solo para mirar."""
import json, glob, os
import numpy as np
import rasterio
from rasterio.merge import merge
from scipy import ndimage as ndi
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
R = __import__("os").environ.get("GEMELO_DATOS", "datos"); DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8")); x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
P = np.load(R + r"\paisaje_puntos.npy").astype(np.float64); x, y, z, h, cl = P.T
srcs = [rasterio.open(f) for f in sorted(glob.glob(os.path.join(DL, "MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif")))]
mdt, _ = merge(srcs, bounds=(x0, y0, x1, y1), res=0.5, nodata=np.nan); mdt = mdt[0].astype(float)
if np.isnan(mdt).any():
    idx = ndi.distance_transform_edt(np.isnan(mdt), return_distances=False, return_indices=True); mdt = mdt[tuple(idx)]
# ---- terreno a 2 m, suavizado, y flujo D8
d2 = mdt.reshape(H, 2, W, 2).mean(axis=(1, 3)) if False else mdt[:2 * H // 4 * 4, :2 * W // 4 * 4].reshape(H // 2, 4, W // 2, 4).mean(axis=(1, 3))
g = ndi.gaussian_filter(d2, 1.0); h2, w2 = g.shape; res = 2.0
orden = np.argsort(-g.ravel()); acc = np.ones(g.size)
dirs = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
flat = g.ravel()
for k in orden:
    r, c = divmod(int(k), w2); mejor = None; pend = 0
    for dr, dc in dirs:
        rr, cc = r + dr, c + dc
        if 0 <= rr < h2 and 0 <= cc < w2:
            s = (g[r, c] - g[rr, cc]) / (res * (1.414 if dr and dc else 1))
            if s > pend: pend = s; mejor = rr * w2 + cc
    if mejor is not None: acc[mejor] += acc[k]
acc = acc.reshape(h2, w2)
np.save(R + r"\paisaje_flujo.npy", acc.astype(np.float32))
print("acumulación máxima (celdas de 4 m2):", acc.max())
orto = np.asarray(Image.open(R + r"\orto_finca.jpg").convert("RGB"))
fig, ax = plt.subplots(figsize=(16, 8.6), dpi=110)
ax.imshow(orto, extent=[x0, x1, y0, y1], origin="upper")
cau = acc > 2500; yy, xx = np.nonzero(cau)
ax.scatter(x0 + (xx + 0.5) * res * 2, y1 - (yy + 0.5) * res * 2, s=3, c="#33aaff", alpha=0.9, label="cauce (acum. > 2500 celdas)")
a = P[(h > 11) & (cl != 6) & (cl != 7)]; ax.scatter(a[:, 0], a[:, 1], s=1.5, c="#ffee00", alpha=0.7, label="puntos > 11 m")
b = P[cl == 6]; ax.scatter(b[:, 0], b[:, 1], s=2, c="#ff2a2a", label="clase 6 (edificio)")
for p in V["parcelas"]:
    l = np.array(p["linde"]); ax.plot(np.r_[l[:, 0], l[0, 0]], np.r_[l[:, 1], l[0, 1]], c="white", lw=1); ax.text(l[:, 0].mean(), l[:, 1].mean(), p["nombre"], color="white", fontsize=8, ha="center")
ax.legend(loc="lower right"); ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); plt.tight_layout(); plt.savefig(R + r"\paisaje_control.png"); print("guardada")
