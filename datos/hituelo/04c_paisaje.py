"""Paso 4c: paisaje.json de Hituelo = edificios (clase 6, medidos), tendido (deducido, 04b), cauces (deducidos del relieve) y árboles que no son olivos (picos del CHM).
Coordenadas UTM30 absolutas (x, y) y cotas absolutas (z): el motor las re-centra. Mismos nombres de campo que el paisaje de Cerro Velasco."""
import sys, os, json, glob, heapq, time
import numpy as np
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
t0 = time.time(); P = parcelas()
S = np.load(BASE + "/_suelo_mosaico.npy"); sm_ = json.load(open(BASE + "/_suelo_mosaico.json")); X0m, Y0m = sm_["X0"], sm_["Y0"]
idx = json.load(open(BASE + "/indice.json", encoding="utf-8"))
def suelo_en(x, y): return float(S[int(np.clip(round(y - Y0m), 0, S.shape[0] - 1)), int(np.clip(round(x - X0m), 0, S.shape[1] - 1))])
def tesela_str(x, y): return f"{int(x // T)}_{int(y // T)}"
def parcela_de(x, y):
    for p in P:
        a = p["utm"]
        if x < a[:, 0].min() or x > a[:, 0].max() or y < a[:, 1].min() or y > a[:, 1].max(): continue
        if dentro(a, np.array([x]), np.array([y]))[0]: return p["k"]
    return -1
salida = {"fuente": "PNOA-LiDAR 3.ª cobertura (vuelo 2024), CNIG · © IGN, CC BY 4.0", "crs": "EPSG:25830", "cotas": "absolutas (m s. n. m., las del LiDAR)",
          "honestidad": {"edificios": "medidos: clase 6 del LiDAR; huella = rectángulo mínimo orientado, alero y cumbrera = percentiles 20 y 95 de la altura de sus puntos", "tendido": "DEDUCIDO: postes = racimos aislados alineados; el LiDAR no trae clase de cable y no hay retornos de cable entre postes, así que el hilo es una catenaria estimada",
                         "cauces": "DEDUCIDOS del relieve (acumulación de flujo D8 sobre el terreno a 4 m): no hay clase de agua; se dibujan secos", "arboles": "medidos: picos del CHM de 0,5 m; el tipo (conífera/frondosa/arbusto) es una regla de forma, no una identificación"}}

# ---------------- edificios (clase 6)
pts6 = []
for d in sorted(glob.glob(RAW + "/*")):
    if not os.path.exists(d + "/HECHO.json"): continue
    for f in glob.glob(d + "/*.npy"):
        tx, ty = map(int, os.path.basename(f)[:-4].split("_"))
        if f"{tx}_{ty}" not in idx["teselas"]: continue
        a = np.load(f); m = a["c"] == 6
        if m.any(): pts6.append(np.column_stack([a["x"][m].astype(float) + tx * T, a["y"][m].astype(float) + ty * T, a["z"][m].astype(float)]))
B = np.concatenate(pts6) if pts6 else np.zeros((0, 3)); print("puntos de edificio:", len(B))
bx, by = B[:, 0], B[:, 1]; hB = B[:, 2] - np.array([suelo_en(x, y) for x, y in zip(bx, by)])
nx, ny = S.shape[1], S.shape[0]; g = np.zeros((ny, nx), np.uint8); g[np.clip(np.round(by - Y0m).astype(int), 0, ny - 1), np.clip(np.round(bx - X0m).astype(int), 0, nx - 1)] = 1
lab, n = ndi.label(ndi.binary_dilation(g, iterations=2), structure=np.ones((3, 3)))
Lb = lab[np.clip(np.round(by - Y0m).astype(int), 0, ny - 1), np.clip(np.round(bx - X0m).astype(int), 0, nx - 1)]
edif = []
for k in range(1, n + 1):
    sel = Lb == k
    if sel.sum() < 60: continue
    pk = np.column_stack([bx[sel], by[sel]]); hh = hB[sel]
    xy = pk - pk.mean(axis=0); w_, v_ = np.linalg.eigh(np.cov(xy.T)); eje = v_[:, 1]; ang = float(np.arctan2(eje[1], eje[0]))
    u = xy @ eje; s = xy @ np.array([-eje[1], eje[0]]); lo_u, hi_u, lo_s, hi_s = np.percentile(u, 1), np.percentile(u, 99), np.percentile(s, 1), np.percentile(s, 99)
    centro = pk.mean(axis=0) + eje * (lo_u + hi_u) / 2 + np.array([-eje[1], eje[0]]) * (lo_s + hi_s) / 2
    zb = float(np.percentile([suelo_en(x, y) for x, y in pk[::max(1, len(pk) // 200)]], 20)); hA, hC = float(np.percentile(hh, 20)), float(np.percentile(hh, 95))
    largo, ancho = float(hi_u - lo_u), float(hi_s - lo_s)
    if largo * ancho < 8 or hC < 2.2: continue
    edif.append({"x": round(float(centro[0]), 2), "y": round(float(centro[1]), 2), "largo": round(largo, 1), "ancho": round(ancho, 1), "ang": round(ang, 4), "zBase": round(zb, 2),
                 "hAlero": round(hA, 2), "hCumbrera": round(hC, 2), "puntos": int(sel.sum()), "tesela": tesela_str(centro[0], centro[1]), "parcela": parcela_de(centro[0], centro[1]), "color": None})
salida["edificios"] = edif; print("edificios:", [(e["x"], e["y"], e["largo"], e["ancho"], e["hAlero"], e["hCumbrera"]) for e in edif])

# ---------------- tendido (04b): solo se queda lo que parece un tendido de verdad; el resto va a «descartados» con su motivo
td = json.load(open(BASE + "/_tendido.json")); cad = []; desc = []
for c in td["cadenas"]:
    ps = c["postes"]; hmed = np.mean([p["zAlto"] - p["zBase"] for p in ps]); sep = np.mean([np.hypot(a["x"] - b["x"], a["y"] - b["y"]) for a, b in zip(ps[:-1], ps[1:])])
    if hmed >= 7.5 and sep >= 35: cad.append(c)
    else: desc.append({"postes": [[p["x"], p["y"]] for p in ps], "altura_media_m": round(float(hmed), 1), "vano_medio_m": round(float(sep), 1), "motivo": "poco alto o demasiado corto el vano para un tendido: más probable una hilera de árboles"})
salida["tendido"] = {"cadenas": [{"postes": [{k: v for k, v in p.items() if k != "puntos_cable"} for p in c["postes"]], "linea": c["linea"], "nota": c["nota"]} for c in cad], "descartados": desc}
postes_xy = np.array([[p["x"], p["y"]] for c in cad for p in c["postes"]]) if cad else np.zeros((0, 2))
print("tendido: %d cadenas, %d postes; %d descartadas" % (len(cad), len(postes_xy), len(desc)))

# ---------------- cauces: flujo D8 sobre el terreno a 4 m (relleno de depresiones por inundación con prioridad)
G = 4
sg = ndi.gaussian_filter(S[:S.shape[0] // G * G, :S.shape[1] // G * G].reshape(S.shape[0] // G, G, S.shape[1] // G, G).mean(axis=(1, 3)), 1.0)
h, w = sg.shape; fill = sg.copy(); vis = np.zeros((h, w), bool); hp = []
for r in range(h):
    for c in (0, w - 1):
        heapq.heappush(hp, (fill[r, c], r, c)); vis[r, c] = True
for c in range(1, w - 1):
    for r in (0, h - 1):
        heapq.heappush(hp, (fill[r, c], r, c)); vis[r, c] = True
D8 = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
while hp:
    z_, r, c = heapq.heappop(hp)
    for dr, dc in D8:
        rr, cc = r + dr, c + dc
        if 0 <= rr < h and 0 <= cc < w and not vis[rr, cc]:
            vis[rr, cc] = True; fill[rr, cc] = max(fill[rr, cc], z_ + 1e-4); heapq.heappush(hp, (fill[rr, cc], rr, cc))
print("relleno de depresiones %.0f s" % (time.time() - t0))
orden = np.argsort(-fill, axis=None); acc = np.ones((h, w)); dest = np.full(h * w, -1, np.int64)
for k in orden:
    r, c = divmod(int(k), w); best = None; bz = fill[r, c]
    for dr, dc in D8:
        rr, cc = r + dr, c + dc
        if 0 <= rr < h and 0 <= cc < w:
            sl = (fill[r, c] - fill[rr, cc]) / (1.414 if dr and dc else 1.0)
            if sl > 0 and (best is None or sl > best[0]): best = (sl, rr, cc)
    if best: acc[best[1], best[2]] += acc[r, c]; dest[k] = best[1] * w + best[2]
ha = acc * G * G / 1e4
UMBRAL_HA = 6.0
cauce_m = ha >= UMBRAL_HA; lab2, n2 = ndi.label(cauce_m, structure=np.ones((3, 3)))
cauces = []
for k in range(1, n2 + 1):
    cells = np.argwhere(lab2 == k)
    if len(cells) * G < 120: continue
    # eje: de la celda de cabecera (menor acumulación del tramo) siguiendo el destino D8 mientras siga en el tramo
    cabeza = min(map(tuple, cells), key=lambda rc: acc[rc]); camino = [cabeza]; cur = cabeza[0] * w + cabeza[1]
    while dest[cur] >= 0 and lab2[dest[cur] // w, dest[cur] % w] == k:
        cur = int(dest[cur]); camino.append((cur // w, cur % w))
        if len(camino) > 5000: break
    if len(camino) * G < 120: continue
    px = np.array([[X0m + (c + 0.5) * G, Y0m + (r + 0.5) * G] for r, c in camino]); sx = ndi.gaussian_filter1d(px[:, 0], 2, mode="nearest"); sy = ndi.gaussian_filter1d(px[:, 1], 2, mode="nearest")
    eje = []
    for i in range(0, len(sx), 2):
        a_ = ha[camino[i]]; anch = float(np.clip(1.2 + 1.5 * np.log10(max(a_, 1)), 1.5, 6.0))
        eje.append([round(float(sx[i]), 2), round(float(sy[i]), 2), round(suelo_en(sx[i], sy[i]), 2), round(anch, 1)])
    cauces.append({"eje": eje, "cuenca_ha_final": round(float(ha[camino[-1]]), 1), "longitud_m": int(len(camino) * G),
                   "nota": "DEDUCIDO del relieve (flujo D8 a 4 m, cuenca ≥ %.0f ha): cauce seco que solo correría con agua cuando llueve; sin medición ni clase de agua en el LiDAR." % UMBRAL_HA})
salida["cauces"] = cauces; print("cauces:", [(c["longitud_m"], c["cuenca_ha_final"]) for c in cauces], "%.0f s" % (time.time() - t0))
cau_xy = np.array([[q[0], q[1]] for c in cauces for q in c["eje"]]) if cauces else np.zeros((0, 2))

# ---------------- árboles que no son olivos: picos del CHM no emparejados con un olivo detectado
M = np.load(BASE + "/_chm_mosaico.npy"); mj = json.load(open(BASE + "/_chm_mosaico.json")); chm = M.astype(np.float32) / 100.0
oli = json.load(open(BASE + "/arboles.json"))["arboles"]
OX = np.array([[a["x"], a["y"]] for a in oli if a["olivo"]])
from scipy.spatial import cKDTree
tOl = cKDTree(OX); smc = ndi.gaussian_filter(np.clip(chm, 0, 40), 2.4)
pk = (smc == ndi.maximum_filter(smc, size=11)) & (smc >= 2.2); pr, pc = np.nonzero(pk)
print("picos del CHM (≥2,2 m):", len(pr))
pastos = {p["k"] for p in P if p["pasto"]}
edxy = np.array([[e["x"], e["y"], max(e["largo"], e["ancho"]) / 2 + 5] for e in edif]) if edif else np.zeros((0, 3))
tPoste = cKDTree(postes_xy) if len(postes_xy) else None; tCau = cKDTree(cau_xy) if len(cau_xy) else None
arb = []
for r_, c_ in zip(pr, pc):
    x_, y_ = X0m + c_ * 0.5, Y0m + r_ * 0.5; h_ = float(chm[max(0, r_ - 3):r_ + 4, max(0, c_ - 3):c_ + 4].max())
    if h_ < 2.5: continue
    k = parcela_de(x_, y_)
    d_ol, _ = tOl.query([x_, y_])
    if k >= 0 and k not in pastos and d_ol < 3.0 and h_ <= 9.0: continue            # es uno de los olivos ya registrados
    if k >= 0 and k not in pastos and h_ <= 9.0: continue                            # dentro de olivar y no sobresale: copa de olivo no emparejada
    if len(edxy) and (np.hypot(edxy[:, 0] - x_, edxy[:, 1] - y_) < edxy[:, 2]).any(): continue
    if tPoste is not None and tPoste.query([x_, y_])[0] < 4.0: continue
    en_cauce = bool(tCau is not None and tCau.query([x_, y_])[0] < 12)
    if k < 0 and not (h_ >= 6.2 or (en_cauce and h_ >= 2.5)): continue                # fuera de lindes: solo lo alto (lo bajo suelen ser olivos de la finca vecina) o el ribazo del cauce
    if k in pastos and h_ < 2.5: continue
    rr = []
    for a in np.linspace(0, 2 * np.pi, 8, endpoint=False):
        dd_ = 0.5
        for st in range(1, 40):
            xx = c_ + int(round(np.cos(a) * st)); yy = r_ + int(round(np.sin(a) * st))
            if not (0 <= xx < M.shape[1] and 0 <= yy < M.shape[0]) or smc[yy, xx] < 0.4 * smc[r_, c_]: break
            dd_ = st * 0.5
        rr.append(dd_)
    rad = float(np.mean(rr)); hmid = float(np.mean([smc[np.clip(r_ + int(round(np.sin(a) * rad / 4)), 0, M.shape[0] - 1), np.clip(c_ + int(round(np.cos(a) * rad / 4)), 0, M.shape[1] - 1)] for a in np.linspace(0, 2 * np.pi, 8, endpoint=False)]) / max(smc[r_, c_], 0.1))
    grupo = rad > 8.0; rad = min(rad, 8.0)      # un radio mayor es una masa de árboles (soto, ribazo), no un individuo
    tipo = "arbusto" if h_ < 6.2 else ("conifera" if (h_ >= 7 and rad / h_ < 0.3 and hmid < 0.78) else "frondosa")
    arb.append({"x": round(x_, 2), "y": round(y_, 2), "h": round(h_, 1), "r": round(max(rad, 1.0), 1), "tipo": tipo, "zBase": round(suelo_en(x_, y_), 2), "enCauce": en_cauce, "grupo": bool(grupo), "parcela": k, "tesela": tesela_str(x_, y_)})
salida["arboles"] = arb
from collections import Counter
print("árboles no olivo:", len(arb), dict(Counter(a["tipo"] for a in arb)), "| en pasto:", sum(1 for a in arb if a["parcela"] in pastos), "| fuera de lindes:", sum(1 for a in arb if a["parcela"] < 0), "| altura máx %.1f" % max([a["h"] for a in arb] or [0]))
json.dump(salida, open(BASE + "/paisaje.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("listo %.0f s" % (time.time() - t0))
