"""¿Qué clasifica el LiDAR de 3.ª cobertura en la ventana de la finca? Cuenta puntos por clase y altura sobre el terreno."""
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
cuentas = {}; alturas = {}
for f in sorted(glob.glob(os.path.join(DL, "PNOA_2024_AND_4*-4177_H30_NPC01.laz"))):
    if "(" in os.path.basename(f): continue
    with laspy.open(f) as r:
        for ch in r.chunk_iterator(2_000_000):
            x, y, z, cl = np.asarray(ch.x), np.asarray(ch.y), np.asarray(ch.z), np.asarray(ch.classification)
            s = (x >= x0) & (x < x1) & (y > y0) & (y <= y1)
            x, y, z, cl = x[s], y[s], z[s], cl[s]
            h = z - mdt[np.clip(((y1 - y) / 0.5).astype(int), 0, 2 * H - 1), np.clip(((x - x0) / 0.5).astype(int), 0, 2 * W - 1)]
            for c in np.unique(cl):
                m = cl == c; cuentas[int(c)] = cuentas.get(int(c), 0) + int(m.sum()); alturas.setdefault(int(c), []).append(h[m][::20])
print("clase  puntos   h_p5  h_mediana  h_p95  h_max")
for c in sorted(cuentas):
    hh = np.concatenate(alturas[c]); print("%5d %8d  %6.1f %9.1f %6.1f %6.1f" % (c, cuentas[c], np.percentile(hh, 5), np.median(hh), np.percentile(hh, 95), hh.max()))
