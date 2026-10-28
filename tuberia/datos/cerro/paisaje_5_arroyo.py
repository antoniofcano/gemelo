"""El arroyo del noroeste: relieve sombreado + curvas de nivel + árboles altos, para ver dónde está el cauce."""
import json, glob, os
import numpy as np
import rasterio
from rasterio.merge import merge
from scipy import ndimage as ndi
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LightSource
R = __import__("os").environ.get("GEMELO_DATOS", "datos"); DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
V = json.load(open(os.path.join(R, "finca_ventana.json"), encoding="utf-8")); x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
P = np.load(os.path.join(R, "paisaje_puntos.npy")).astype(np.float64); x, y, z, h, cl = P.T
srcs = [rasterio.open(f) for f in sorted(glob.glob(os.path.join(DL, "MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif")))]
mdt, _ = merge(srcs, bounds=(x0, y0, x1, y1), res=0.5, nodata=np.nan); mdt = mdt[0].astype(float)
if np.isnan(mdt).any():
    idx = ndi.distance_transform_edt(np.isnan(mdt), return_distances=False, return_indices=True); mdt = mdt[tuple(idx)]
# recorte del noroeste
cx0, cx1, cy0, cy1 = 410713, 411010, 4176370, 4176514
c0, c1 = int((cx0 - x0) / 0.5), int((cx1 - x0) / 0.5); r0, r1 = int((y1 - cy1) / 0.5), int((y1 - cy0) / 0.5)
sub = ndi.gaussian_filter(mdt[r0:r1, c0:c1], 2)
ls = LightSource(azdeg=315, altdeg=40)
fig, ax = plt.subplots(figsize=(16, 7.8), dpi=100)
ax.imshow(ls.hillshade(sub, vert_exag=3, dx=0.5, dy=0.5), extent=[cx0, cx1, cy0, cy1], cmap="gray", origin="upper")
cs = ax.contour(np.linspace(cx0, cx1, sub.shape[1]), np.linspace(cy1, cy0, sub.shape[0]), sub, levels=np.arange(np.floor(sub.min()), sub.max(), 1.0), colors="#2255aa", linewidths=0.5)
ax.clabel(cs, levels=np.arange(np.floor(sub.min()), sub.max(), 4.0), fontsize=7, fmt="%d")
a = P[(h > 6) & (cl == 5) & (x > cx0) & (x < cx1) & (y > cy0) & (y < cy1)]
ax.scatter(a[:, 0], a[:, 1], s=2, c=np.clip(a[:, 3], 6, 20), cmap="YlGn", alpha=0.8)
for p in V["parcelas"]:
    l = np.array(p["linde"]); ax.plot(np.r_[l[:, 0], l[0, 0]], np.r_[l[:, 1], l[0, 1]], c="red", lw=1)
ax.set_xlim(cx0, cx1); ax.set_ylim(cy0, cy1); plt.tight_layout(); plt.savefig(os.path.join(R, "arroyo_control.png")); print("ok", sub.min(), sub.max())
