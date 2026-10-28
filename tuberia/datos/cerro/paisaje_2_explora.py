"""Explora qué hay en la ventana de la finca más allá de los olivos: edificios (clase 6), objetos altos y estrechos (postes), árboles grandes y el cauce del arroyo.
Guarda un resumen y una imagen de control. No toca nada del gemelo."""
import json, glob, os
import numpy as np
import laspy, rasterio
from rasterio.merge import merge
from scipy import ndimage as ndi
R = __import__("os").environ.get("GEMELO_DATOS", "datos"); DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
V = json.load(open(os.path.join(R, "finca_ventana.json"), encoding="utf-8"))
x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
srcs = [rasterio.open(f) for f in sorted(glob.glob(os.path.join(DL, "MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif")))]
mdt, _ = merge(srcs, bounds=(x0, y0, x1, y1), res=0.5, nodata=np.nan); mdt = mdt[0].astype(float)
if np.isnan(mdt).any():
    idx = ndi.distance_transform_edt(np.isnan(mdt), return_distances=False, return_indices=True); mdt = mdt[tuple(idx)]
P = []
for f in sorted(glob.glob(os.path.join(DL, "PNOA_2024_AND_4*-4177_H30_NPC01.laz"))):
    if "(" in os.path.basename(f): continue
    with laspy.open(f) as r:
        for ch in r.chunk_iterator(2_000_000):
            x, y, z, cl = np.asarray(ch.x), np.asarray(ch.y), np.asarray(ch.z), np.asarray(ch.classification)
            s = (x >= x0) & (x < x1) & (y > y0) & (y <= y1)
            x, y, z, cl = x[s], y[s], z[s], cl[s]
            h = z - mdt[np.clip(((y1 - y) / 0.5).astype(int), 0, 2 * H - 1), np.clip(((x - x0) / 0.5).astype(int), 0, 2 * W - 1)]
            P.append(np.column_stack([x, y, z, h, cl]))
P = np.concatenate(P); print("puntos:", len(P))
np.save(os.path.join(R, "paisaje_puntos.npy"), P.astype(np.float32))
x, y, z, h, cl = P.T

# ---- edificios (clase 6)
b = P[cl == 6]; print("clase 6:", len(b))
g = np.zeros((H, W), np.uint8)
ix = np.clip(((b[:, 0] - x0)).astype(int), 0, W - 1); iy = np.clip(((y1 - b[:, 1])).astype(int), 0, H - 1); g[iy, ix] = 1
g = ndi.binary_dilation(g, iterations=2); lab, n = ndi.label(g, structure=np.ones((3, 3)))
print("componentes de edificio:", n)
for k in range(1, n + 1):
    m = lab == k; yy, xx = np.nonzero(m); area = m.sum()
    pk = (np.abs(b[:, 0] - (x0 + xx.mean() + 0.5)) < (xx.max() - xx.min()) / 2 + 3) & (np.abs(b[:, 1] - (y1 - yy.mean() - 0.5)) < (yy.max() - yy.min()) / 2 + 3)
    print("  edificio %d: centro (%.0f, %.0f) área~%d m2  alto p50 %.1f p90 %.1f  puntos %d" % (k, x0 + xx.mean(), y1 - yy.mean(), area, np.median(b[pk][:, 3]), np.percentile(b[pk][:, 3], 90), pk.sum()))

# ---- objetos altos (candidatos a postes y árboles grandes): puntos a más de 7,5 m que no son edificio
a = P[(h > 7.5) & (cl != 6) & (cl != 7)]; print("puntos >7,5 m:", len(a), "por clase:", {int(c): int((a[:, 4] == c).sum()) for c in np.unique(a[:, 4])})
g2 = np.zeros((H, W), np.uint8); ix = np.clip(((a[:, 0] - x0)).astype(int), 0, W - 1); iy = np.clip(((y1 - a[:, 1])).astype(int), 0, H - 1); np.add.at(g2, (iy, ix), 1)
lab2, n2 = ndi.label(g2 > 0, structure=np.ones((3, 3))); print("componentes altos:", n2)
filas = []
for k in range(1, n2 + 1):
    yy, xx = np.nonzero(lab2 == k); sel = np.isin(np.arange(len(a)), [])  # placeholder
    mx = x0 + xx.mean(); my = y1 - yy.mean(); ext = max(xx.max() - xx.min(), yy.max() - yy.min()) + 1
    pk = (np.abs(a[:, 0] - mx) < ext / 2 + 1.5) & (np.abs(a[:, 1] - my) < ext / 2 + 1.5)
    filas.append((k, mx, my, ext, a[pk][:, 3].max(), int(pk.sum())))
filas.sort(key=lambda f: -f[4])
print("  id  x_utm    y_utm  extensión_m  h_max  puntos")
for f in filas[:40]: print("%4d %8.0f %8.0f %6d %8.1f %6d" % f)
