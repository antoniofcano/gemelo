"""Datos del gemelo de la finca Cerro Velasco (5 parcelas): terreno, altura de vegetación, nube de puntos, copas con su forma, marcados y suelo.
Entradas: nubes LAZ y MDT de Descargas (las hojas que haya), ortofoto y ventana de finca_1, SoilGrids de finca_2."""
import json, glob, os, base64, math
import numpy as np
from scipy import ndimage as ndi
from scipy.optimize import linear_sum_assignment
from scipy.spatial import cKDTree
import laspy, rasterio
from rasterio.merge import merge
R = __import__("os").environ.get("GEMELO_DATOS", "datos"); DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8")); x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
P = V["parcelas"]

# ---- parcelas rasterizadas a 1 m: qué parcela es cada celda y a cuántos metros queda de cualquiera
xs = x0 + (np.arange(W) + 0.5); ys = y1 - (np.arange(H) + 0.5); GX, GY = np.meshgrid(xs, ys)
def dentro_de(poligono, X, Y):
    ins = np.zeros(X.shape, bool); n = len(poligono)
    for i in range(n):
        ax, ay = poligono[i]; bx, by = poligono[(i + 1) % n]
        ins ^= ((ay > Y) != (by > Y)) & (X < (bx - ax) * (Y - ay) / (by - ay + 1e-12) + ax)
    return ins
pid = np.zeros((H, W), np.int8)
for k, p in enumerate(P): pid[dentro_de(p["linde"], GX, GY)] = k + 1
dist = ndi.distance_transform_edt(pid == 0)
print("celdas dentro de alguna parcela:", int((pid > 0).sum()), "= %.1f ha" % ((pid > 0).sum() / 1e4))

# ---- MDT 0,5 m (todas las hojas descargadas)
srcs = [rasterio.open(f) for f in sorted(glob.glob(os.path.join(DL, "MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif")))]
mdt, _ = merge(srcs, bounds=(x0, y0, x1, y1), res=0.5, nodata=np.nan); mdt = mdt[0].astype("float64"); mdt[mdt < -1000] = np.nan
if np.isnan(mdt).any():
    idx = ndi.distance_transform_edt(np.isnan(mdt), return_distances=False, return_indices=True); mdt = mdt[tuple(idx)]
assert mdt.shape == (2 * H, 2 * W), (mdt.shape, (2 * H, 2 * W))
z0 = float(np.nanmin(mdt)); zmax = float(np.nanmax(mdt))

# ---- nube de puntos: todas las hojas LiDAR que haya (de 1 x 1 km)
tiles = [f for f in sorted(glob.glob(os.path.join(DL, "PNOA_2024_AND_4*-4177_H30_NPC01.laz"))) if "(" not in os.path.basename(f)]
print("hojas de nube:", [os.path.basename(t) for t in tiles])
X, Y, Z = [], [], []
for f in tiles:
    with laspy.open(f) as r:
        for ch in r.chunk_iterator(2_000_000):
            x, y, z, cl = np.asarray(ch.x), np.asarray(ch.y), np.asarray(ch.z), np.asarray(ch.classification)
            s = (x >= x0) & (x < x1) & (y > y0) & (y <= y1) & ~np.isin(cl, [7, 18])
            X.append(x[s]); Y.append(y[s]); Z.append(z[s])
X, Y, Z = np.concatenate(X), np.concatenate(Y), np.concatenate(Z)
print("puntos en la ventana:", len(X))
ix2 = np.clip(((X - x0) / 0.5).astype(int), 0, 2 * W - 1); iy2 = np.clip(((y1 - Y) / 0.5).astype(int), 0, 2 * H - 1)
Hh = Z - mdt[iy2, ix2]

# ---- superficie y altura de vegetación a 0,5 m
dsm = np.full((2 * H, 2 * W), -np.inf); np.maximum.at(dsm, (iy2, ix2), Z); dsm[~np.isfinite(dsm)] = np.nan
fill = ndi.maximum_filter(np.nan_to_num(dsm, nan=-1e9), size=5); dsm = np.where(np.isnan(dsm) & (fill > -1e8), fill, dsm)
chm = np.where(np.isfinite(dsm - mdt), np.clip(dsm - mdt, 0, None), 0.0)
# donde no hay nube (hoja sin descargar) la altura es 0 y se anota para no dar por vacío lo que no se sabe
hay_nube = ndi.maximum_filter((np.bincount(iy2 * (2 * W) + ix2, minlength=4 * W * H).reshape(2 * H, 2 * W) > 0).astype(np.uint8), size=7) > 0
cobertura_nube = float(hay_nube.mean())
print("cobertura de la nube sobre la ventana: %.0f %%" % (100 * cobertura_nube))

# ---- puntos exportados: vegetación entre 0,35 y 7,5 m, +4 % del suelo; a ≤35 m de una parcela; tope 650.000
d1 = dist[np.clip(((y1 - Y)).astype(int), 0, H - 1), np.clip(((X - x0)).astype(int), 0, W - 1)]
veg = (Hh >= 0.35) & (Hh <= 7.5) & (d1 <= 35)
rng = np.random.default_rng(7)
suelo_ = (Hh < 0.35) & (d1 <= 35) & (rng.random(len(Hh)) < 0.04)
iv = np.nonzero(veg)[0]
if len(iv) > 650_000: iv = np.sort(rng.choice(iv, 650_000, replace=False))
sel = np.concatenate([iv, np.nonzero(suelo_)[0]])
pts = np.column_stack([(X[sel] - cx) * 100, (Y[sel] - cy) * 100, (Z[sel] - z0) * 100]).round().astype("<i2")
print("puntos exportados:", len(sel), "(vegetación %d)" % len(iv))

# ---- copas: máximos locales sobre el CHM suavizado; altura real = máximo del CHM en ±1,5 m
sm35 = ndi.gaussian_filter(chm, 3.5)
pk = (sm35 == ndi.maximum_filter(sm35, size=13)) & (sm35 >= 1.5)
pr, pc = np.nonzero(pk)
mx = ndi.maximum_filter(chm, size=7)
cu = np.column_stack([x0 + (pc + 0.5) * 0.5, y1 - (pr + 0.5) * 0.5, mx[pr, pc]])
ci1 = np.clip((y1 - cu[:, 1]).astype(int), 0, H - 1); cj1 = np.clip((cu[:, 0] - x0).astype(int), 0, W - 1)
ok = (dist[ci1, cj1] <= 30) & (cu[:, 0] > x0 + 1.5) & (cu[:, 0] < x1 - 1.5) & (cu[:, 1] > y0 + 1.5) & (cu[:, 1] < y1 - 1.5)
cu, ci1, cj1 = cu[ok], ci1[ok], cj1[ok]
parc_c = pid[ci1, cj1].astype(int)                       # 0 = fuera de las parcelas; k+1 = parcela k
print("copas detectadas:", len(cu), "| dentro de alguna parcela:", int((parc_c > 0).sum()))
mk = np.zeros(chm.shape, np.int32)
for k, c in enumerate(cu): mk[int((y1 - c[1]) / 0.5), int((c[0] - x0) / 0.5)] = k + 1
sm = ndi.gaussian_filter(chm, 1.0)
lab = ndi.watershed_ift((65535 * (1 - np.clip(sm / max(sm.max(), 1), 0, 1))).astype(np.uint16), mk)
perfiles = []
for k, c in enumerate(cu):
    pico = max(c[2], 1.0); umbral = max(1.2, 0.35 * pico); rr = []
    for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        d = 0.0
        for st in range(1, 24):
            xx = c[0] + np.cos(a) * st * 0.25; yy = c[1] + np.sin(a) * st * 0.25
            r_, c_ = int((y1 - yy) / 0.5), int((xx - x0) / 0.5)
            if not (0 <= r_ < 2 * H and 0 <= c_ < 2 * W) or lab[r_, c_] != k + 1 or sm[r_, c_] < umbral: break
            d = st * 0.25
        rr.append(max(d, 0.9))
    rr = np.array(rr); rr = (rr + np.roll(rr, 1) + np.roll(rr, -1)) / 3
    perfiles.append([round(float(v), 2) for v in rr])
copas = [[round(c[0] - cx, 2), round(c[1] - cy, 2), round(float(c[2]), 2), perfiles[k], int(parc_c[k])] for k, c in enumerate(cu)]

# ---- marcados de OlivarTrack por parcela, con su propio desfase medio
marcados, desfases = [], []
for k, p in enumerate(P):
    m = np.array(p["olivos"]) if p["olivos"] else np.zeros((0, 2)); cand = np.nonzero(parc_c == k + 1)[0]
    mejor = (-1, -1.5, -0.25)
    if len(m) >= 15 and len(cand) >= 15:
        t = cKDTree(cu[cand][:, :2])
        for dx in np.arange(-3, 3.01, 0.25):
            for dy in np.arange(-3, 3.01, 0.25):
                n = int((t.query(m + [dx, dy])[0] <= 1.5).sum())
                if n > mejor[0]: mejor = (n, dx, dy)
    dx, dy = mejor[1], mejor[2]; desfases.append([dx, dy])
    par = [-1] * len(m)
    if len(m) and len(cand):
        Dm = np.linalg.norm((m + [dx, dy])[:, None, :] - cu[cand][None, :, :2], axis=2); a_, b_ = linear_sum_assignment(Dm)
        for i, j in zip(a_, b_):
            if Dm[i, j] <= 3: par[i] = int(cand[j])
    marcados += [[round(float(q[0] - cx), 2), round(float(q[1] - cy), 2), par[i], k] for i, q in enumerate(m)]
    print("  %-22s marcados %3d | copas %3d | emparejados %3d | desfase de los marcados (%.2f, %.2f) m" % (p["nombre"], len(m), len(cand), sum(1 for v in par if v >= 0), dx, dy))

# ---- terreno (1 m), altura de vegetación (1 m), suelo sin vegetación (2 m) y ortofoto
q16 = lambda a: base64.b64encode(np.round(a * 100).astype("<i2").tobytes()).decode()
dtm1 = mdt.reshape(H, 2, W, 2).mean(axis=(1, 3)); chm1 = chm.reshape(H, 2, W, 2).max(axis=(1, 3))
jpg = open(R + r"\orto_finca.jpg", "rb").read()
with rasterio.open(R + r"\orto_finca.jpg") as r: ort = r.read()
oh, ow = ort.shape[1:]; S = 2
chm2 = chm1[:(H // S) * S, :(W // S) * S].reshape(H // S, S, W // S, S).max(axis=(1, 3))
mask = ndi.binary_dilation(chm2 > 0.4, iterations=2)
gy2, gx2 = np.mgrid[0:H // S, 0:W // S]
py = np.clip(((gy2 + 0.5) * S / (H / oh)).astype(int), 0, oh - 1); px = np.clip(((gx2 + 0.5) * S / (W / ow)).astype(int), 0, ow - 1)
soil = np.stack([ort[c][py, px] for c in range(3)], axis=-1).astype(float)
soil = ndi.uniform_filter(soil, size=(3, 3, 1)); soil_crudo = soil.copy(); idx = ndi.distance_transform_edt(mask, return_distances=False, return_indices=True)
soil = ndi.uniform_filter(soil[idx[0], idx[1]], size=(3, 3, 1)); lum = soil.mean(axis=2, keepdims=True); med = np.median(lum[~mask]) if (~mask).any() else lum.mean()
soil = (soil * np.clip(0.85 * med / np.maximum(lum, 1), 1.0, 1.6)).clip(0, 255).astype(np.uint8)
# lejos de las parcelas (>30 m) no hay árboles en 3D: se deja la ortofoto tal cual, como fondo de contexto
lejos = dist[:(H // S) * S:S, :(W // S) * S:S] > 30
soil[lejos] = soil_crudo[lejos].clip(0, 255).astype(np.uint8)

sg = json.load(open(R + r"\soilgrids_finca.json", encoding="utf-8")) if os.path.exists(R + r"\soilgrids_finca.json") else {}
parcelas = []
for k, p in enumerate(P):
    L = np.array(p["linde"])
    parcelas.append({"id": p["id"], "nombre": p["nombre"], "ha": p["ha"], "linde": [[round(a - cx, 2), round(b - cy, 2)] for a, b in L],
                     "centro": [round(float(L[:, 0].mean() - cx), 2), round(float(L[:, 1].mean() - cy), 2)], "desfase": desfases[k],
                     "suelo": sg.get(p["id"], {}).get("filas")})
D = {"W": W, "H": H, "res": 1.0, "z0": z0, "zmax": zmax, "ext": [x0 - cx, y1 - cy, x1 - cx, y0 - cy], "centro_utm": [cx, cy], "cobertura_nube": round(cobertura_nube, 2),
     "dtm": {"w": W, "h": H, "res": 1.0, "b64": q16(dtm1 - z0)}, "chm": {"w": W, "h": H, "res": 1.0, "b64": q16(np.clip(chm1, 0, 30))},
     "suelo": {"w": soil.shape[1], "h": soil.shape[0], "res": float(S), "b64": base64.b64encode(soil.tobytes()).decode()},
     "orto": {"jpg": "data:image/jpeg;base64," + base64.b64encode(jpg).decode(), "w": ow, "h": oh},
     "puntos": {"n": len(sel), "b64": base64.b64encode(pts.tobytes()).decode()}, "parcelas": parcelas, "copas": copas, "marcados": marcados}
json.dump(D, open(R + r"\finca_datos.json", "w"))
print("finca_datos.json: %.1f MB" % (os.path.getsize(R + r"\finca_datos.json") / 1048576))
