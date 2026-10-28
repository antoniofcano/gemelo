"""Paso 5: validaciones y láminas de control.
 a) copas del LiDAR (0,5 m) vs el mismo detector sobre el MDS normalizado de 2,5 m del IGN (mdsn_v025) y vs los olivos declarados, por parcela;
 b) altura de vegetación: CHM (LiDAR) vs MDS 2,5 m;
 c) suelo: MDT 0,5 m del CNIG vs clase 2 del LiDAR (resumen del índice);
 d) láminas: sombreado del suelo con copas, parcelas, edificios, tendido, cauces.   Salidas: validacion.json, control_*.png"""
import sys, os, json, time
import numpy as np, rasterio
from scipy import ndimage as ndi
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
t0 = time.time(); P = parcelas(); idx = json.load(open(BASE + "/indice.json", encoding="utf-8"))
res = json.load(open(BASE + "/arboles_resumen.json", encoding="utf-8")); oli = json.load(open(BASE + "/arboles.json"))["arboles"]
M = np.load(BASE + "/_chm_mosaico.npy").astype(np.float32) / 100.0; mj = json.load(open(BASE + "/_chm_mosaico.json")); X0m, Y0m = mj["X0"], mj["Y0"]

# ---- a) detector de producción sobre el MDS 2,5 m (σ=2 m -> 0,8 px)
r = rasterio.open(MDS); a = r.read(1).astype(np.float64); rx = r.res[0]; Hh, Ww = a.shape; L, Tp = r.bounds.left, r.bounds.top
lim = np.where((a > 0) & (a < 9), a, 0); s = ndi.gaussian_filter(lim, 2.0 / rx, mode="nearest", truncate=3.0)
cand = (s > 0.8) & (s < 9) & (s >= ndi.maximum_filter(s, size=3)); pr, pc = np.nonzero(cand); xs = L + (pc + 0.5) * rx; ys = Tp - (pr + 0.5) * rx; v = s[pr, pc]
pid = np.full(len(xs), -1)
for p in P:
    m = dentro(p["utm"], xs, ys) & (pid < 0); pid[m] = p["k"]
sep = {x["k"]: x["sep_m"] for x in res}; o = np.argsort(-v); acept = []; hs = {}
for n in o:
    if pid[n] < 0: continue
    sp = sep[pid[n]]; gx, gy = int(xs[n] // 10), int(ys[n] // 10); ok = True
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for q in hs.get((gx + dx, gy + dy), ()):
                if (q[0] - xs[n]) ** 2 + (q[1] - ys[n]) ** 2 < sp * sp: ok = False; break
            if not ok: break
        if not ok: break
    if ok: hs.setdefault((gx, gy), []).append((xs[n], ys[n])); acept.append(n)
cnt_mds = np.bincount(pid[acept], minlength=len(P))
filas = []
for rr_ in res:
    k = rr_["k"]; d = rr_["declarados"]; nl = rr_["detectados"]; nm = int(cnt_mds[k])
    filas.append({"k": k, "finca": rr_["finca"], "nombre": rr_["nombre"], "pasto": rr_["pasto"], "declarados": d, "lidar_0_5m": nl, "mds_2_5m": nm,
                  "lidar_vs_decl_pct": None if not d else round(100 * (nl - d) / d, 1), "mds_vs_decl_pct": None if not d else round(100 * (nm - d) / d, 1)})
d_ = sum(f["declarados"] for f in filas); tl = sum(f["lidar_0_5m"] for f in filas if not f["pasto"]); tm = sum(f["mds_2_5m"] for f in filas if not f["pasto"])
print("TOTAL (sin pastos): declarados %d | LiDAR 0,5 m %d (%+.1f %%) | MDS 2,5 m %d (%+.1f %%)" % (d_, tl, 100 * (tl - d_) / d_, tm, 100 * (tm - d_) / d_))
desv = [f for f in filas if f["declarados"] and abs(f["lidar_vs_decl_pct"]) > 25]; print("parcelas con LiDAR a > ±25 % de lo declarado:", [(f["nombre"], f["lidar_vs_decl_pct"]) for f in desv])
# ---- b) alturas: CHM (máx. por celda 2,5 m) vs MDS 2,5 m, dentro de lindes
c5 = M[:M.shape[0] // 5 * 5, :M.shape[1] // 5 * 5].reshape(M.shape[0] // 5, 5, M.shape[1] // 5, 5).max(axis=(1, 3))   # 2,5 m
gx = (X0m + (np.arange(c5.shape[1]) + 0.5) * 2.5); gy = (Y0m + (np.arange(c5.shape[0]) + 0.5) * 2.5)
jj = np.clip(((Tp - gy) / rx).astype(int), 0, Hh - 1); ii = np.clip(((gx - L) / rx).astype(int), 0, Ww - 1)
mds_en = a[np.ix_(jj, ii)]; ok = (mds_en > 0.5) & (c5 > 0.5) & (mds_en < 20)
mx = np.zeros(c5.shape, bool); GX, GY = np.meshgrid(gx, gy)
for p in P:
    aa = p["utm"]; i0, i1 = np.searchsorted(gx, aa[:, 0].min()), np.searchsorted(gx, aa[:, 0].max()); j0, j1 = np.searchsorted(gy, aa[:, 1].min()), np.searchsorted(gy, aa[:, 1].max())
    sub = dentro(aa, GX[j0:j1 + 1, i0:i1 + 1], GY[j0:j1 + 1, i0:i1 + 1]); mx[j0:j1 + 1, i0:i1 + 1] |= sub
sel = ok & mx; dif = c5[sel] - mds_en[sel]
altura = {"celdas": int(sel.sum()), "media_dif_m": round(float(dif.mean()), 2), "mediana_dif_m": round(float(np.median(dif)), 2), "abs_p95_m": round(float(np.percentile(np.abs(dif), 95)), 2), "r": round(float(np.corrcoef(c5[sel], mds_en[sel])[0, 1]), 3)}
print("alturas LiDAR(max 2,5 m) − MDS:", altura)
# ---- c) suelo
T_ = [v_ for v_ in idx["teselas"].values() if v_.get("contraste_mdt_lidar")]
w = np.array([v_["contraste_mdt_lidar"]["n"] for v_ in T_], float)
def pond(k): return float(np.sum([v_["contraste_mdt_lidar"].get(k, np.nan) * v_["contraste_mdt_lidar"]["n"] for v_ in T_]) / w.sum())
suelo = {"teselas_con_contraste": len(T_), "nodos": int(w.sum()), "media_m": round(pond("media_m"), 3), "abs_p50_m": round(pond("abs_p50_m"), 3), "abs_p95_m_media_ponderada": round(pond("abs_p95_m"), 3),
         "abs_p95_max_tesela_m": max(v_["contraste_mdt_lidar"]["abs_p95_m"] for v_ in T_), "abs_max_m": max(v_["contraste_mdt_lidar"]["abs_max_m"] for v_ in T_)}
peor = sorted(T_, key=lambda v_: -v_["contraste_mdt_lidar"]["abs_p95_m"])[:5]
suelo["teselas_con_mas_diferencia"] = [{"tesela": f'{v_["tx"]}_{v_["ty"]}', "p95_m": v_["contraste_mdt_lidar"]["abs_p95_m"], "max_m": v_["contraste_mdt_lidar"]["abs_max_m"], "media_m": v_["contraste_mdt_lidar"]["media_m"]} for v_ in peor]
cu = [v_["contraste_mdt_lidar"] for v_ in T_ if "abs_p95_bajo_copa_m" in v_["contraste_mdt_lidar"]]; ab = [v_["contraste_mdt_lidar"] for v_ in T_ if "abs_p95_abierto_m" in v_["contraste_mdt_lidar"]]
suelo["abs_p95_bajo_copa_m_medio"] = round(float(np.mean([c["abs_p95_bajo_copa_m"] for c in cu])), 3) if cu else None; suelo["abs_p95_abierto_m_medio"] = round(float(np.mean([c["abs_p95_abierto_m"] for c in ab])), 3) if ab else None
suelo["media_bajo_copa_m"] = round(float(np.mean([c["media_bajo_copa_m"] for c in cu])), 3) if cu else None
print("suelo MDT − LiDAR:", suelo)
json.dump({"copas_por_parcela": filas, "alturas": altura, "suelo": suelo, "total_sin_pastos": {"declarados": d_, "lidar": tl, "mds": tm}}, open(BASE + "/validacion.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)

# ---- d) láminas de control
S = np.load(BASE + "/_suelo_mosaico.npy"); sj = json.load(open(BASE + "/_suelo_mosaico.json")); pj = json.load(open(BASE + "/paisaje.json", encoding="utf-8"))
gy_, gx_ = np.gradient(ndi.gaussian_filter(S, 1.0)); sh = np.clip(0.5 + (-gx_ * np.cos(np.radians(315)) + gy_ * np.sin(np.radians(315))) * 2.0, 0, 1)
ext = [sj["X0"], sj["X0"] + sj["nx"], sj["Y0"], sj["Y0"] + sj["ny"]]
fig, ax = plt.subplots(figsize=(15, 21), dpi=70); ax.imshow(sh, extent=ext, origin="lower", cmap="gray", alpha=0.9)
ax.imshow(np.ma.masked_less(M, 0.8), extent=[X0m, X0m + M.shape[1] * 0.5, Y0m, Y0m + M.shape[0] * 0.5], origin="lower", cmap="YlGn", vmin=0, vmax=8, alpha=0.55)
for p in P: ax.plot(p["utm"][:, 0], p["utm"][:, 1], c="#ff0" if not p["pasto"] else "#0ff", lw=1)
oo = np.array([[a_["x"], a_["y"]] for a_ in oli if a_["olivo"]]); ax.scatter(oo[:, 0], oo[:, 1], s=1.2, c="#e22")
for e in pj["edificios"]:
    c_, s_ = np.cos(e["ang"]), np.sin(e["ang"]); l, a2 = e["largo"] / 2, e["ancho"] / 2; q = np.array([[-l, -a2], [l, -a2], [l, a2], [-l, a2], [-l, -a2]]); ax.plot(e["x"] + q[:, 0] * c_ - q[:, 1] * s_, e["y"] + q[:, 0] * s_ + q[:, 1] * c_, c="#f0f", lw=1.5)
for c in pj["tendido"]["cadenas"]:
    L_ = np.array(c["linea"]); ax.plot(L_[:, 0], L_[:, 1], c="#fa0", lw=1.5); ax.scatter([p["x"] for p in c["postes"]], [p["y"] for p in c["postes"]], s=18, c="#fa0", marker="s")
for c in pj["cauces"]: E_ = np.array(c["eje"]); ax.plot(E_[:, 0], E_[:, 1], c="#39f", lw=1.8)
tc = {"frondosa": "#0c0", "conifera": "#060", "arbusto": "#9e5", "frutal": "#f6c"}
ax.scatter([a_["x"] for a_ in pj["arboles"]], [a_["y"] for a_ in pj["arboles"]], s=[max(2, a_["r"] ** 2 * 6) for a_ in pj["arboles"]], c=[tc.get(a_["tipo"], "#888") for a_ in pj["arboles"]], alpha=0.6, edgecolors="none")
ax.set_xlim(404700, 406800); ax.set_ylim(4177350, 4180250); ax.set_aspect("equal"); ax.set_title("Hituelo · sombreado del suelo (MDT 0,5 m), CHM, olivos (rojo), edificios (magenta), tendido (naranja), cauces (azul), árboles no olivo")
plt.tight_layout(); plt.savefig(BASE + "/control_general.png"); print("lámina %.0f s" % (time.time() - t0))
