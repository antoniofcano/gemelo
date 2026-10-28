"""Extrae del LiDAR (3.ª cobertura, 2024) lo que rodea a los olivos: edificios (clase 6), el tendido eléctrico y sus postes, el eje del arroyo y los árboles que no son olivos.
Todo en el marco del gemelo: x, y relativos al centro de la ventana y alturas relativas a z0. Escribe finca_paisaje.json y paisaje_resultado.png (control)."""
import json, glob, os
import numpy as np
import rasterio
from rasterio.merge import merge
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt
from PIL import Image
R = __import__("os").environ.get("GEMELO_DATOS", "datos"); DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
V = json.load(open(os.path.join(R, "finca_ventana.json"), encoding="utf-8")); x0, y0, x1, y1, W, H = V["x0"], V["y0"], V["x1"], V["y1"], V["W"], V["H"]
cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
DAT = json.load(open(os.path.join(R, "finca_datos.json"), encoding="utf-8")); z0 = DAT["z0"]
P = np.load(os.path.join(R, "paisaje_puntos.npy")).astype(np.float64); X, Y, Z, Hh, CL = P.T
srcs = [rasterio.open(f) for f in sorted(glob.glob(os.path.join(DL, "MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif")))]
mdt, _ = merge(srcs, bounds=(x0, y0, x1, y1), res=0.5, nodata=np.nan); mdt = mdt[0].astype(float)
if np.isnan(mdt).any():
    idx = ndi.distance_transform_edt(np.isnan(mdt), return_distances=False, return_indices=True); mdt = mdt[tuple(idx)]
orto = np.asarray(Image.open(os.path.join(R, "orto_finca.jpg")).convert("RGB")); oh, ow = orto.shape[:2]
def suelo_en(x, y): return float(mdt[np.clip(int((y1 - y) / 0.5), 0, 2 * H - 1), np.clip(int((x - x0) / 0.5), 0, 2 * W - 1)])
def color_orto(x, y, r=2.0):
    px, py = (x - x0) / (x1 - x0) * ow, (y1 - y) / (y1 - y0) * oh; rr = max(1, int(r / (x1 - x0) * ow))
    t = orto[max(0, int(py) - rr):int(py) + rr + 1, max(0, int(px) - rr):int(px) + rr + 1].reshape(-1, 3); return [int(v) for v in np.median(t, axis=0)]
poligonos = [np.array(p["linde"]) for p in V["parcelas"]]
def en_alguna_parcela(x, y):
    for poly in poligonos:
        ins = False; n = len(poly)
        for i in range(n):
            ax_, ay_ = poly[i]; bx_, by_ = poly[(i + 1) % n]
            if (ay_ > y) != (by_ > y) and x < (bx_ - ax_) * (y - ay_) / (by_ - ay_ + 1e-12) + ax_: ins = not ins
        if ins: return True
    return False
salida = {"fuente": "PNOA-LiDAR 3.ª cobertura (2024), CNIG · © IGN, CC BY 4.0", "centro_utm": [cx, cy], "z0": z0}

# ---------------- edificios (clase 6)
b = P[CL == 6]
g = np.zeros((H, W), np.uint8); g[np.clip((y1 - b[:, 1]).astype(int), 0, H - 1), np.clip((b[:, 0] - x0).astype(int), 0, W - 1)] = 1
lab, n = ndi.label(ndi.binary_dilation(g, iterations=2), structure=np.ones((3, 3)))
edif = []
for k in range(1, n + 1):
    yy, xx = np.nonzero(lab == k); mx_, my_ = x0 + xx.mean() + 0.5, y1 - yy.mean() - 0.5
    pk = b[(np.abs(b[:, 0] - mx_) < (xx.max() - xx.min()) / 2 + 3) & (np.abs(b[:, 1] - my_) < (yy.max() - yy.min()) / 2 + 3)]
    if len(pk) < 60: continue
    xy = pk[:, :2] - pk[:, :2].mean(axis=0); w_, v_ = np.linalg.eigh(np.cov(xy.T)); eje = v_[:, 1]; ang = float(np.arctan2(eje[1], eje[0]))
    u = xy @ eje; s = xy @ np.array([-eje[1], eje[0]]); lo_u, hi_u, lo_s, hi_s = np.percentile(u, 1), np.percentile(u, 99), np.percentile(s, 1), np.percentile(s, 99)
    centro = pk[:, :2].mean(axis=0) + eje * (lo_u + hi_u) / 2 + np.array([-eje[1], eje[0]]) * (lo_s + hi_s) / 2
    zb = float(np.percentile(mdt[np.clip(((y1 - pk[:, 1]) / 0.5).astype(int), 0, 2 * H - 1), np.clip(((pk[:, 0] - x0) / 0.5).astype(int), 0, 2 * W - 1)], 20))
    hA, hC = float(np.percentile(pk[:, 3], 20)), float(np.percentile(pk[:, 3], 95))
    edif.append({"x": round(float(centro[0] - cx), 2), "y": round(float(centro[1] - cy), 2), "largo": round(float(hi_u - lo_u), 1), "ancho": round(float(hi_s - lo_s), 1), "ang": round(ang, 4),
                 "zBase": round(zb - z0, 2), "hAlero": round(hA, 2), "hCumbrera": round(hC, 2), "color": color_orto(centro[0], centro[1], 2.5)})
salida["edificios"] = edif; print("edificios:", [(e["largo"], e["ancho"], e["hAlero"], e["hCumbrera"]) for e in edif])

# ---------------- tendido eléctrico: la recta de los puntos altos y estrechos
rc = json.load(open(os.path.join(R, "tendido_recta.json"))); p0 = np.array(rc["p0"]); dv = np.array(rc["dv"]); nv = np.array([-dv[1], dv[0]])
pa = P[(CL != 2) & (CL != 6) & (CL != 7)]; t = (pa[:, :2] - p0) @ dv; d = (pa[:, :2] - p0) @ nv
cable = (np.abs(d) < 2.5) & (pa[:, 3] > 8.5)
tc, zc, dc = t[cable], pa[cable][:, 2], d[cable]
bins = np.arange(tc.min(), tc.max() + 4, 4.0); linea = []
for a0 in bins:
    m = (tc >= a0) & (tc < a0 + 4)
    if m.sum() >= 2: linea.append((a0 + 2, float(np.median(dc[m])), float(np.median(zc[m]))))
linea = np.array(linea); tt = np.arange(linea[0, 0], linea[-1, 0] + 1, 6.0)
zz = ndi.median_filter(np.interp(tt, linea[:, 0], linea[:, 2]), size=5); zz = ndi.gaussian_filter(zz, 1.5); dd = ndi.gaussian_filter(np.interp(tt, linea[:, 0], linea[:, 1]), 2)
pos = p0[None, :] + tt[:, None] * dv[None, :] + dd[:, None] * nv[None, :]
salida["tendido"] = {"linea": [[round(float(pos[i, 0] - cx), 2), round(float(pos[i, 1] - cy), 2), round(float(zz[i] - z0), 2)] for i in range(len(tt))]}
# postes: racimos densos de puntos a poca distancia de la recta (a lo largo de ella, cada 2 m)
poste = (np.abs(d) < 1.6) & (pa[:, 3] > 3.0) & (pa[:, 3] < 30); tp = t[poste]
hist, e = np.histogram(tp, bins=np.arange(tp.min(), tp.max() + 2, 2.0)); cand = [(hist[i], (e[i] + e[i + 1]) / 2) for i in range(len(hist)) if hist[i] >= 9]
cand.sort(reverse=True); elegidos = []
for c_, tpos in cand:
    if all(abs(tpos - q) > 50 for _, q in elegidos): elegidos.append((c_, tpos))
postes = []
for c_, tpos in sorted(elegidos, key=lambda q: q[1]):
    pt = p0 + tpos * dv; zw = float(np.interp(tpos, tt, zz)); zg = suelo_en(pt[0], pt[1])
    postes.append({"x": round(float(pt[0] - cx), 2), "y": round(float(pt[1] - cy), 2), "zBase": round(zg - z0, 2), "zAlto": round(zw + 0.8 - z0, 2), "puntos": int(c_)})
salida["tendido"]["postes"] = postes; print("tendido: %d tramos, %d postes %s" % (len(tt), len(postes), [(q["x"], q["y"], round(q["zAlto"] - q["zBase"], 1)) for q in postes]))

# ---------------- el arroyo: camino de menor cota (el fondo del cauce) entre sus dos extremos
cx0, cx1, cy0, cy1 = 410713, 411010, 4176370, 4176514
c0, c1 = int((cx0 - x0) / 0.5), int((cx1 - x0) / 0.5); r0, r1 = int((y1 - cy1) / 0.5), int((y1 - cy0) / 0.5)
sub = mdt[r0:r1, c0:c1]; sub = sub[:sub.shape[0] // 4 * 4, :sub.shape[1] // 4 * 4].reshape(sub.shape[0] // 4, 4, sub.shape[1] // 4, 4).mean(axis=(1, 3)); gs = ndi.gaussian_filter(sub, 1.0)
hh, ww = gs.shape; zmin = gs.min(); coste = 1 + ((gs - zmin) / 1.2) ** 2.2
ids = np.arange(hh * ww).reshape(hh, ww); fi, co, va = [], [], []
for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
    a = ids[max(0, -dr):hh - max(0, dr), max(0, -dc):ww - max(0, dc)]; bb = ids[max(0, dr):hh - max(0, -dr) if dr >= 0 else hh, max(0, dc):ww - max(0, -dc) if dc >= 0 else ww] if False else None
for r in range(hh):
    for c in range(ww):
        for dr, dc in [(0, 1), (1, 0), (1, 1), (1, -1)]:
            rr, cc = r + dr, c + dc
            if 0 <= rr < hh and 0 <= cc < ww: w_ = (coste[r, c] + coste[rr, cc]) / 2 * (1.414 if dr and dc else 1); fi += [ids[r, c], ids[rr, cc]]; co += [ids[rr, cc], ids[r, c]]; va += [w_, w_]
G = coo_matrix((va, (fi, co)), shape=(hh * ww, hh * ww)).tocsr()
def celda(x, y): return int(np.clip((cy1 - y) / 2.0, 0, hh - 1)) * ww + int(np.clip((x - cx0) / 2.0, 0, ww - 1))
def mas_bajo(x, y, r=12):
    rr, cc = int(np.clip((cy1 - y) / 2.0, 0, hh - 1)), int(np.clip((x - cx0) / 2.0, 0, ww - 1)); ra = int(r / 2)
    win = gs[max(0, rr - ra):rr + ra + 1, max(0, cc - ra):cc + ra + 1]; k = np.unravel_index(np.argmin(win), win.shape); return (max(0, rr - ra) + k[0]) * ww + max(0, cc - ra) + k[1]
ini = mas_bajo(410716, 4176405); fin = mas_bajo(411005, 4176507)
dist, pred = dijkstra(G, directed=False, indices=ini, return_predecessors=True)
camino = []; k = fin
while k != ini and k >= 0: camino.append(k); k = pred[k]
camino.append(ini); camino = camino[::-1]
pts = np.array([[cx0 + (c % ww + 0.5) * 2.0, cy1 - (c // ww + 0.5) * 2.0] for c in camino])
# suavizado del eje y anchura a partir del relieve (la franja que queda a menos de 0,7 m sobre el fondo, hasta 14 m)
sx = ndi.gaussian_filter1d(pts[:, 0], 3, mode="nearest"); sy = ndi.gaussian_filter1d(pts[:, 1], 3, mode="nearest")
eje = []; acum = 0.0
for i in range(0, len(sx), 2):
    zf = suelo_en(sx[i], sy[i]); tang = np.array([sx[min(i + 2, len(sx) - 1)] - sx[max(i - 2, 0)], sy[min(i + 2, len(sx) - 1)] - sy[max(i - 2, 0)]]); tang /= (np.linalg.norm(tang) + 1e-9); nor = np.array([-tang[1], tang[0]])
    anch = []
    for sg in (1, -1):
        dmax = 1.0
        for s in np.arange(1.0, 14.0, 1.0):
            if suelo_en(sx[i] + sg * nor[0] * s, sy[i] + sg * nor[1] * s) - zf <= 0.8: dmax = s
            else: break
        anch.append(dmax)
    eje.append([round(float(sx[i] - cx), 2), round(float(sy[i] - cy), 2), round(float(zf - z0), 2), round(float(anch[0] + anch[1]), 1)])
salida["arroyo"] = {"eje": eje, "nota": "Eje del fondo del cauce deducido del terreno (no hay clase de agua en el LiDAR): se dibuja seco y solo corre con agua cuando llueve."}
print("arroyo: %d puntos, ancho medio %.1f m, desnivel %.1f m" % (len(eje), np.mean([e[3] for e in eje]), eje[0][2] - eje[-1][2]))
cauce_xy = np.array([[e[0] + cx, e[1] + cy] for e in eje]); cauce_z = np.array([e[2] + z0 for e in eje])

# ---------------- árboles que no son olivos: picos altos del dosel
veg = (CL != 2) & (CL != 6) & (CL != 7)
veg &= ~((np.abs((P[:, :2] - p0) @ nv) < 2.8) & (Hh > 5))   # los cables y los postes no son copas
chm = np.zeros((2 * H, 2 * W)); np.maximum.at(chm, (np.clip(((y1 - Y[veg]) / 0.5).astype(int), 0, 2 * H - 1), np.clip(((X[veg] - x0) / 0.5).astype(int), 0, 2 * W - 1)), Hh[veg])
chm = np.clip(chm, 0, 40); sm = ndi.gaussian_filter(chm, 2.4)
pk = (sm == ndi.maximum_filter(sm, size=11)) & (sm >= 2.2); pr, pc = np.nonzero(pk)
edxy = np.array([[e["x"] + cx, e["y"] + cy, max(e["largo"], e["ancho"]) / 2 + 5] for e in edif]) if edif else np.zeros((0, 3))
arb = []
tree = __import__("scipy.spatial", fromlist=["cKDTree"]).cKDTree(cauce_xy)
for r_, c_ in zip(pr, pc):
    x_, y_ = x0 + (c_ + 0.5) * 0.5, y1 - (r_ + 0.5) * 0.5; h_ = float(chm[max(0, r_ - 3):r_ + 4, max(0, c_ - 3):c_ + 4].max())
    if len(edxy) and (np.hypot(edxy[:, 0] - x_, edxy[:, 1] - y_) < edxy[:, 2]).any(): continue
    dcau, ic = tree.query([x_, y_]); zg = suelo_en(x_, y_); en_cauce = dcau < 20 and zg < cauce_z[ic] + 3.0
    if not (h_ >= 6.2 or (en_cauce and h_ >= 2.5 and not en_alguna_parcela(x_, y_))): continue
    # radio de la copa: hasta donde la altura cae al 40 % del pico, en 8 direcciones
    rr = []
    for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        dd_ = 0.5
        for st in range(1, 40):
            xx = c_ + int(round(np.cos(a) * st)); yy = r_ - int(round(np.sin(a) * st))
            if not (0 <= xx < 2 * W and 0 <= yy < 2 * H) or sm[yy, xx] < 0.4 * sm[r_, c_]: break
            dd_ = st * 0.5
        rr.append(dd_)
    rad = float(np.mean(rr)); mid = []
    for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        xx = c_ + int(round(np.cos(a) * rad)); yy = r_ - int(round(np.sin(a) * rad)); mid.append(sm[np.clip(yy, 0, 2 * H - 1), np.clip(xx, 0, 2 * W - 1)] if rad > 0.6 else 0)
    hmid = float(np.mean([sm[np.clip(r_ - int(round(np.sin(a) * rad / 4)), 0, 2 * H - 1), np.clip(c_ + int(round(np.cos(a) * rad / 4)), 0, 2 * W - 1)] for a in np.linspace(0, 2 * np.pi, 8, endpoint=False)]) / max(sm[r_, c_], 0.1))
    tipo = "arbusto" if h_ < 6.2 else ("conifera" if (h_ >= 7 and rad / h_ < 0.3 and hmid < 0.78) else "frondosa")
    arb.append({"x": round(x_ - cx, 2), "y": round(y_ - cy, 2), "h": round(h_, 1), "r": round(max(rad, 1.0), 1), "tipo": tipo, "zBase": round(zg - z0, 2), "enCauce": bool(en_cauce)})

# ---------------- correcciones de Antonio (27-oct-2026): lo que el LiDAR por sí solo no distingue
# · en la finca de la Nave, dos de los «árboles» eran postes de una derivación del tendido que sale del principal hacia la nave;
# · el de 1,6 m de radio junto a la nave es un frutal (peral y manzanos).
CORRECCIONES = {"postes_derivacion": [(411170, 4176332), (411152, 4176355)], "frutales": [(411123, 4176397)]}
def poste_en(x, y):   # el racimo de puntos altos cerca de lo indicado: posición media y cota de la punta
    m = (np.hypot(X - x, Y - y) < 3.0) & (Hh > 6.5) & (CL != 7)
    if m.sum() < 3: return None
    px, py = float(X[m].mean()), float(Y[m].mean()); return px, py, float(np.percentile(Z[m], 98)), float(suelo_en(px, py))
quitar = []; derivados = []
for (ex, ey) in CORRECCIONES["postes_derivacion"]:
    r = poste_en(ex, ey)
    if r: derivados.append({"x": round(r[0] - cx, 2), "y": round(r[1] - cy, 2), "zBase": round(r[3] - z0, 2), "zAlto": round(r[2] + 0.4 - z0, 2)}); quitar.append((r[0], r[1]))
arb = [a for a in arb if not any(np.hypot(a["x"] + cx - qx, a["y"] + cy - qy) < 6.5 for qx, qy in quitar)]
for a in arb:
    if any(np.hypot(a["x"] + cx - fx, a["y"] + cy - fy) < 3.0 for fx, fy in CORRECCIONES["frutales"]): a["tipo"] = "frutal"
salida["arboles"] = arb
if derivados:
    # arranca en el poste del tendido principal más cercano al primero, sigue por los postes y acaba en el tejado de la nave más próxima (acometida: este último tramo es una estimación)
    p0d = derivados[0]; principal = min(salida["tendido"]["postes"], key=lambda q: np.hypot(q["x"] - p0d["x"], q["y"] - p0d["y"]))
    nave = min(salida["edificios"], key=lambda e: np.hypot(e["x"] - derivados[-1]["x"], e["y"] - derivados[-1]["y"]))
    linea = [[principal["x"], principal["y"], principal["zAlto"]]] + [[q["x"], q["y"], q["zAlto"]] for q in derivados] + [[nave["x"], nave["y"], round(nave["zBase"] + nave["hAlero"] + 0.3, 2)]]
    salida["tendido"]["derivaciones"] = [{"postes": derivados, "linea": linea, "nota": "Derivación del tendido hacia la nave: los postes salen del LiDAR (racimos de puntos altos y estrechos) y el último tramo hasta el tejado es una estimación."}]
print("derivación: %d postes nuevos, %d árboles quitados, %d frutal(es)" % (len(derivados), len(quitar), sum(a["tipo"] == "frutal" for a in arb)))
from collections import Counter
print("árboles no olivo: %d" % len(arb), dict(Counter(a["tipo"] for a in arb)), "| en el cauce:", sum(a["enCauce"] for a in arb), "| altura máx %.1f" % max(a["h"] for a in arb))
json.dump(salida, open(os.path.join(R, "finca_paisaje.json"), "w", encoding="utf-8"), ensure_ascii=False)

# ---------------- imagen de control
fig, ax = plt.subplots(figsize=(16, 8.6), dpi=100); ax.imshow(orto, extent=[x0, x1, y0, y1], origin="upper")
for e in edif:
    c, s = np.cos(e["ang"]), np.sin(e["ang"]); l, a_ = e["largo"] / 2, e["ancho"] / 2; q = np.array([[-l, -a_], [l, -a_], [l, a_], [-l, a_], [-l, -a_]])
    ax.plot(e["x"] + cx + q[:, 0] * c - q[:, 1] * s, e["y"] + cy + q[:, 0] * s + q[:, 1] * c, c="#ff2a2a", lw=2)
L = np.array(salida["tendido"]["linea"]); ax.plot(L[:, 0] + cx, L[:, 1] + cy, c="#ffee00", lw=1.2)
for q in postes: ax.scatter([q["x"] + cx], [q["y"] + cy], s=60, c="#ff8800", marker="s", zorder=5)
E = np.array(eje); ax.plot(E[:, 0] + cx, E[:, 1] + cy, c="#33aaff", lw=2.2)
col = {"conifera": "#00aa44", "frondosa": "#88dd33", "arbusto": "#ccff88", "frutal": "#ff66cc"}
for a in arb: ax.add_patch(plt.Circle((a["x"] + cx, a["y"] + cy), a["r"], fc=col[a["tipo"]], ec="black", lw=0.4, alpha=0.7))
ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); plt.tight_layout(); plt.savefig(os.path.join(R, "paisaje_resultado.png")); print("listo")
