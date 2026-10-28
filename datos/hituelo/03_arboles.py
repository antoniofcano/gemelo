"""Paso 3: copas de olivo de Hituelo desde el CHM de 0,5 m de las teselas. Mismo detector que producción (functions/logic.js, ADR-0110):
CHM suavizado con σ = 2 m, máximos locales (3x3), supresión de no-máximos con separación = clamp(0,35 × marco, 3, 5) m, altura suavizada entre 0,8 y 9 m,
centroide ponderado por altura y, además, las 8 radios de cada copa (cuenca de la copa + umbral, como en el gemelo de Cerro Velasco).
Salida: arboles.json (olivos dentro de las lindes) y arboles_resumen.json (por parcela: detectados vs declarados) + CHM en mosaico para el paso 4."""
import sys, os, json, time, glob
import numpy as np
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
t0 = time.time()
P = parcelas(); idx = json.load(open(BASE + "/indice.json", encoding="utf-8"))
tes = sorted((v["tx"], v["ty"]) for k, v in idx["teselas"].items() if os.path.exists(f"{TES}/{k}.npz"))
tx0, tx1 = min(t[0] for t in tes), max(t[0] for t in tes); ty0, ty1 = min(t[1] for t in tes), max(t[1] for t in tes)
NX, NY = (tx1 - tx0 + 1) * 512, (ty1 - ty0 + 1) * 512
M = np.zeros((NY, NX), np.uint16)                      # CHM en cm; fila J = norte creciente: N = Y0min + J*0.5 ; I = este creciente
X0m, Y0m = tx0 * T, ty0 * T
hay = np.zeros((NY, NX), bool)
for (tx, ty) in tes:
    z = np.load(f"{TES}/{tx}_{ty}.npz"); c = z["chm"][:512, :512]
    J, I = (ty - ty0) * 512, (tx - tx0) * 512; M[J:J + 512, I:I + 512] = c; hay[J:J + 512, I:I + 512] = True
np.save(BASE + "/_chm_mosaico.npy", M)
json.dump({"X0": X0m, "Y0": Y0m, "nx": NX, "ny": NY, "res": 0.5, "nota": "nodo (J,I) = (E=X0+I*0.5, N=Y0+J*0.5); uint16 en cm"}, open(BASE + "/_chm_mosaico.json", "w"))
print("mosaico CHM", M.shape, "%.0f s" % (time.time() - t0))

chm = M.astype(np.float32) / 100.0
# ---- parcela de cada nodo (para el marco y para asignar copas): rasterizado a 0,5 m solo en el bbox de cada parcela
pid = np.full((NY, NX), -1, np.int16)
for p in P:
    a = p["utm"]; i0 = max(0, int((a[:, 0].min() - X0m) / 0.5) - 1); i1 = min(NX, int((a[:, 0].max() - X0m) / 0.5) + 2)
    j0 = max(0, int((a[:, 1].min() - Y0m) / 0.5) - 1); j1 = min(NY, int((a[:, 1].max() - Y0m) / 0.5) + 2)
    gx = X0m + np.arange(i0, i1) * 0.5; gy = Y0m + np.arange(j0, j1) * 0.5; GX, GY = np.meshgrid(gx, gy)
    m = dentro(a, GX, GY); sub = pid[j0:j1, i0:i1]; sub[m & (sub < 0)] = p["k"]
print("parcelas rasterizadas %.0f s" % (time.time() - t0))

# ---- suavizado exacto de producción: se anula lo que no es 0 < v < 9 antes de promediar; σ = 2 m = 4 px; ndi trunca a 3σ (igual que r = ceil(3σ))
SIG = 2.0 / 0.5
lim = np.where((chm > 0) & (chm < 9), chm, 0).astype(np.float32)
s = ndi.gaussian_filter(lim, SIG, mode="nearest", truncate=3.0)
del lim
print("suavizado %.0f s" % (time.time() - t0))

# ---- candidatos: v > minAltura (0,8), v < 9 y no menor que ningún vecino 3x3 (el JS descarta solo si un vecino es estrictamente mayor)
mx3 = ndi.maximum_filter(s, size=3)
cand = (s > 0.8) & (s < 9) & (s >= mx3)
# sólo dentro de lindes (el detector de producción filtra por linde) ; el resto de árboles va al paisaje (paso 4)
cj, ci = np.nonzero(cand & (pid >= 0))
cv = s[cj, ci]; ck = pid[cj, ci].astype(int)
print("candidatos en lindes:", len(cj))

# marco de plantación por parcela: sqrt(superficie / olivos declarados), acotado a 4–20 m (producción: el panel lo pasa; por defecto 10 m)
marco = {}; sep = {}
for p in P:
    m_ = np.sqrt(p["ha"] * 1e4 / p["olivos"]) if p["olivos"] else 10.0
    marco[p["k"]] = float(np.clip(m_, 4, 20)); sep[p["k"]] = float(np.clip(0.35 * marco[p["k"]], 3, 5))
# NMS global por orden de altura con cuadrícula de hashing
orden = np.argsort(-cv, kind="stable"); cj, ci, cv, ck = cj[orden], ci[orden], cv[orden], ck[orden]
cel = 10.0; hash_ = {}; aceptados = []
for n in range(len(cj)):
    x = ci[n] * 0.5; y = cj[n] * 0.5; sp = sep[ck[n]] ; ok = True
    gx, gy = int(x // cel), int(y // cel)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q in hash_.get((gx + dx, gy + dy), ()):
                if (q[0] - x) ** 2 + (q[1] - y) ** 2 < sp * sp: ok = False; break
            if not ok: break
        if not ok: break
    if ok: hash_.setdefault((gx, gy), []).append((x, y)); aceptados.append(n)
aceptados = np.array(aceptados); cj, ci, cv, ck = cj[aceptados], ci[aceptados], cv[aceptados], ck[aceptados]
print("picos aceptados:", len(cj), "%.0f s" % (time.time() - t0))

# ---- centroide ponderado por altura en la ventana de radio sepPx, sobre el CHM ligeramente suavizado (1 px) y por encima de max(0,8; 0,5 v)
ch1 = ndi.gaussian_filter(chm, 1.0, mode="nearest")
cx_ = np.empty(len(cj)); cy_ = np.empty(len(cj)); h_ = np.empty(len(cj))
mxh = ndi.maximum_filter(chm, size=7)                  # altura real de la copa = máximo del CHM en ±1,5 m (como en Cerro)
for n in range(len(cj)):
    r = int(np.ceil(sep[ck[n]] / 0.5)); j, i = cj[n], ci[n]
    j0, j1, i0, i1 = max(0, j - r), min(NY, j + r + 1), max(0, i - r), min(NX, i + r + 1)
    w = ch1[j0:j1, i0:i1]; u = max(0.8, 0.5 * cv[n]); w = np.where(w >= u, w, 0)
    if w.sum() > 0:
        gj, gi = np.mgrid[j0:j1, i0:i1]; cx_[n] = (gi * w).sum() / w.sum(); cy_[n] = (gj * w).sum() / w.sum()
    else: cx_[n], cy_[n] = i, j
    h_[n] = mxh[j, i]
print("centroides %.0f s" % (time.time() - t0))

# ---- radios (8 direcciones): cuenca por watershed sobre la altura suavizada 1 px, y umbral max(1,2; 0,35 × pico); mínimo 0,9 m y suavizado de 3 radios
sm = ch1
mk = np.zeros((NY, NX), np.int32)
jr = np.clip(np.round(cy_).astype(int), 0, NY - 1); ir = np.clip(np.round(cx_).astype(int), 0, NX - 1)
mk[jr, ir] = np.arange(1, len(jr) + 1)
topo = (65535 * (1 - np.clip(sm / max(float(sm.max()), 1.0), 0, 1))).astype(np.uint16)
lab = ndi.watershed_ift(topo, mk); del topo, mk
print("cuencas %.0f s" % (time.time() - t0))
pico = np.maximum(h_, 1.0); umbral = np.maximum(1.2, 0.35 * pico)
ang = np.linspace(0, 2 * np.pi, 8, endpoint=False); R8 = np.zeros((len(cj), 8))
vivos = np.ones((len(cj), 8), bool)
dist8 = np.zeros((len(cj), 8))
for st in range(1, 24):
    for a, th in enumerate(ang):
        xx = cx_ + np.cos(th) * st * 0.25 / 0.5; yy = cy_ + np.sin(th) * st * 0.25 / 0.5      # eje N creciente = J creciente
        c = np.round(xx).astype(int); r = np.round(yy).astype(int); dentro_ = (c >= 0) & (c < NX) & (r >= 0) & (r < NY)
        ok = dentro_.copy(); cc = np.clip(c, 0, NX - 1); rr = np.clip(r, 0, NY - 1)
        ok &= (lab[rr, cc] == np.arange(1, len(cj) + 1)) & (sm[rr, cc] >= umbral)
        vivos[:, a] &= ok; dist8[:, a] = np.where(vivos[:, a], st * 0.25, dist8[:, a])
R8 = np.maximum(dist8, 0.9); R8 = (R8 + np.roll(R8, 1, axis=1) + np.roll(R8, -1, axis=1)) / 3
print("radios %.0f s" % (time.time() - t0))

E = X0m + cx_ * 0.5; N = Y0m + cy_ * 0.5
arboles = []
for n in range(len(cj)):
    tx, ty = int(E[n] // T), int(N[n] // T)
    arboles.append({"x": round(float(E[n]), 2), "y": round(float(N[n]), 2), "h": round(float(h_[n]), 2), "r8": [round(float(v), 2) for v in R8[n]],
                    "parcela": int(ck[n]), "tesela": f"{tx}_{ty}", "olivo": not P[int(ck[n])]["pasto"], "frutal": False})
# ---- resumen por parcela contra lo declarado, y qué parcelas tocan teselas incompletas
inc = {k for k, v in idx["teselas"].items() if not v.get("completa", False)}
res = []
for p in P:
    det = sum(1 for a in arboles if a["parcela"] == p["k"])
    res.append({"k": p["k"], "finca": p["finca"], "nombre": p["nombre"], "id": p["id"], "ha": p["ha"], "pasto": p["pasto"], "declarados": p["olivos"], "detectados": det,
                "desviacion_pct": None if not p["olivos"] else round(100 * (det - p["olivos"]) / p["olivos"], 1), "marco_m": round(marco[p["k"]], 2), "sep_m": round(sep[p["k"]], 2)})
# parcelas con celdas en teselas incompletas: fracción de celdas de la parcela sin nube
sinnube = []
for p in P:
    sel = pid == p["k"]; n_ = int(sel.sum())
    # cobertura real de la nube: tesela completa o nodos con CHM>0 en la parcela (si falta hoja, el CHM es 0 en bloque)
    frac_cero = float((chm[sel] == 0).mean()) if n_ else 1.0
    sinnube.append(round(frac_cero, 3))
for r_, f_ in zip(res, sinnube): r_["celdas_chm_cero"] = f_
json.dump({"fuente": "PNOA-LiDAR 3.ª cobertura (vuelo 2024), CNIG · © IGN, CC BY 4.0", "crs": "EPSG:25830", "detector": "σ=2 m sobre CHM 0,5 m; máximos 3x3; sep=clamp(0,35·marco,3,5) m; 0,8<h<9 m; centroide ponderado; r8 por cuenca",
           "arboles": arboles}, open(BASE + "/arboles.json", "w", encoding="utf-8"), separators=(",", ":"))
json.dump(res, open(BASE + "/arboles_resumen.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
tot_d = sum(r["declarados"] for r in res); tot_n = sum(r["detectados"] for r in res)
print("TOTAL declarados %d, detectados %d (%+.1f %%)" % (tot_d, tot_n, 100 * (tot_n - tot_d) / tot_d))
for r in res: print("%-45s decl %4d det %4d %s  celdas CHM=0: %.0f %%" % ((r["finca"][:8] + " " + r["nombre"])[:45], r["declarados"], r["detectados"], "%+5.0f%%" % r["desviacion_pct"] if r["desviacion_pct"] is not None else "   -  ", 100 * r["celdas_chm_cero"]))
print("total %.0f s" % (time.time() - t0))
