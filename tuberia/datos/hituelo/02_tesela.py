"""Paso 2: por tesela de 256 m -> tesela/<tx>_<ty>.npz con suelo (257x257 @1 m), chm (513x513 @0,5 m) y la nube (pts) de la tesela.
Uso: python -I 02_tesela.py [tx_ty ...] [--pendientes]   (sin argumentos: todas las teselas objetivo; --pendientes: solo las cuyas hojas disponibles han cambiado desde la última vez)
El índice (indice.json) recoge, por tesela, qué hojas faltan. Reejecutar tras bajar más hojas: 01_particiona.py <hoja> y luego 02_tesela.py --pendientes."""
import sys, os, glob, time, json, zlib
import numpy as np
import rasterio
from rasterio.merge import merge
from scipy import ndimage as ndi
from scipy.interpolate import griddata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
P = parcelas(); obj, parc = teselas_objetivo(P)
IDX = BASE + "/indice.json"
indice = json.load(open(IDX, encoding="utf-8")) if os.path.exists(IDX) else {"teselas": {}}
hojas_listas = {os.path.basename(d) for d in glob.glob(RAW + "/*") if os.path.exists(d + "/HECHO.json")}
args = [a for a in sys.argv[1:] if not a.startswith("--")]
CAP_OLIVAR, CAP_MARGEN = 130_000, 40_000
MDTS = sorted(glob.glob(DL + "/MDT50CM-ETRS89-H30-0946-*-COB3-V1.tif"))
MDT_SRC = [(f, rasterio.open(f)) for f in MDTS]


def mdt_nodos(tx, ty):
    """Suelo del MDT 0,5 m del CNIG (3.ª cobertura) en los nodos enteros de la tesela: interpolación bilineal (= media de 2x2 píxeles de 0,5 m). NaN donde ninguna hoja cubre."""
    X0, Y0 = tx * T, ty * T; b = (X0 - 2, Y0 - 2, X0 + T + 2, Y0 + T + 2)
    fs = [r for f, r in MDT_SRC if not (r.bounds.right <= b[0] or r.bounds.left >= b[2] or r.bounds.top <= b[1] or r.bounds.bottom >= b[3])]
    if not fs: return None, []
    a, _ = merge(fs, bounds=b, res=0.5, nodata=-32767.0); a = a[0].astype(np.float64); a[a < -30000] = np.nan
    j, i = np.mgrid[0:T + 1, 0:T + 1]
    rr = 2.0 * (T + 2 - j) - 0.5; cc = 2.0 * (i + 2) - 0.5
    return ndi.map_coordinates(a, [rr, cc], order=1, mode="nearest", cval=np.nan), [os.path.basename(r.name)[24:30] for r in fs]


def carga(tx, ty):
    """Puntos de la tesela y sus 8 vecinas, en coordenadas relativas a la tesela, con 10 m de halo."""
    X, Y, Z, C = [], [], [], []
    for d in glob.glob(RAW + "/*"):
        if not os.path.exists(d + "/HECHO.json"): continue
        for da in (-1, 0, 1):
            for db in (-1, 0, 1):
                f = f"{d}/{tx + da}_{ty + db}.npy"
                if not os.path.exists(f): continue
                a = np.load(f); x = a["x"] + da * T; y = a["y"] + db * T
                m = (x >= -10) & (x < T + 10) & (y >= -10) & (y < T + 10)
                X.append(x[m]); Y.append(y[m]); Z.append(a["z"][m]); C.append(a["c"][m])
    if not X: return None
    return np.concatenate(X).astype(np.float64), np.concatenate(Y).astype(np.float64), np.concatenate(Z).astype(np.float64), np.concatenate(C)


def terreno(x, y, z, c):
    """Suelo a 1 m (nodos enteros 0..256) con la clase 2: media por celda centrada en el nodo, TIN lineal para los huecos, vecino más próximo fuera del casco."""
    g = c == 2; xg, yg, zg = x[g], y[g], z[g]
    n = T + 1
    if len(xg) < 200: return None, None
    ox = 8; N = T + 1 + 2 * ox          # celdas de -8 a 264 (halo)
    ci = np.floor(xg + 0.5).astype(int) + ox; cj = np.floor(yg + 0.5).astype(int) + ox
    ok = (ci >= 0) & (ci < N) & (cj >= 0) & (cj < N)
    lin = cj[ok] * N + ci[ok]; cnt = np.bincount(lin, minlength=N * N); sm = np.bincount(lin, zg[ok], minlength=N * N)
    tiene = (cnt > 0).reshape(N, N); mz = np.where(cnt > 0, sm / np.maximum(cnt, 1), np.nan).reshape(N, N)
    jj, ii = np.nonzero(tiene); pts = np.column_stack([ii, jj]).astype(float)
    gi, gj = np.meshgrid(np.arange(N), np.arange(N))
    try: lin_ = griddata(pts, mz[jj, ii], (gi, gj), method="linear")
    except Exception: lin_ = np.full((N, N), np.nan)       # puntos alineados (borde de una hoja que falta)
    near = griddata(pts, mz[jj, ii], (gi, gj), method="nearest")
    full = np.where(np.isnan(lin_), near, lin_)
    dist = ndi.distance_transform_edt(~tiene)     # metros hasta la celda con suelo más cercana: fiabilidad
    return full[ox:ox + n, ox:ox + n].astype(np.float32), dist[ox:ox + n, ox:ox + n].astype(np.float32)


def dsm05(x, y, z):
    n = 2 * T + 1
    ci = np.floor(x * 2 + 0.5).astype(int); cj = np.floor(y * 2 + 0.5).astype(int)
    ok = (ci >= 0) & (ci < n) & (cj >= 0) & (cj < n)
    d = np.full(n * n, -np.inf); np.maximum.at(d, cj[ok] * n + ci[ok], z[ok]); return d.reshape(n, n)


def procesa(tx, ty):
    t0 = time.time(); r = carga(tx, ty)
    if r is None: return None
    x, y, z, c = r; npt_all = int(((x >= 0) & (x < T) & (y >= 0) & (y < T)).sum())
    suelo_l, dist = terreno(x, y, z, c)
    suelo_m, hojas_mdt = mdt_nodos(tx, ty)
    if suelo_l is None and suelo_m is None: return None
    if suelo_l is None: suelo_l = np.full((T + 1, T + 1), np.nan, np.float32); dist = np.full((T + 1, T + 1), 99.0, np.float32)
    # el MDT 0,5 m es la fuente principal; la clase 2 del LiDAR contrasta y rellena los huecos del MDT
    if suelo_m is None: suelo = suelo_l.copy(); fuente = 0.0; stats = None
    else:
        usa_m = np.isfinite(suelo_m); suelo = np.where(usa_m, suelo_m, suelo_l).astype(np.float32); fuente = float(usa_m.mean())
        # contraste: nodos con una medida de suelo propia (a ≤1 m de un punto clase 2)
        v = usa_m & np.isfinite(suelo_l) & (dist <= 1.0); dd = (suelo_m - suelo_l)[v]
        stats = None
        if v.sum() > 100:
            stats = {"n": int(v.sum()), "media_m": round(float(dd.mean()), 3), "mediana_m": round(float(np.median(dd)), 3), "abs_p50_m": round(float(np.percentile(np.abs(dd), 50)), 3), "abs_p95_m": round(float(np.percentile(np.abs(dd), 95)), 3),
                     "abs_p99_m": round(float(np.percentile(np.abs(dd), 99)), 3), "abs_max_m": round(float(np.abs(dd).max()), 2), "frac_gt_0_5m": round(float((np.abs(dd) > 0.5).mean()), 4)}
    if np.isnan(suelo).any(): suelo = np.where(np.isnan(suelo), np.nanmean(suelo), suelo).astype(np.float32)
    # CHM a 0,5 m: máximo por celda de todos los puntos, relleno de huecos pequeños y resta del suelo interpolado
    d = dsm05(x, y, z); vacio = ~np.isfinite(d)
    f = ndi.maximum_filter(np.where(vacio, -1e9, d), size=5); d = np.where(vacio & (f > -1e8), f, d)
    jj, ii = np.mgrid[0:2 * T + 1, 0:2 * T + 1]; suelo05 = ndi.map_coordinates(suelo, [jj / 2.0, ii / 2.0], order=1, mode="nearest")
    chm = np.where(np.isfinite(d), np.clip(d - suelo05, 0, 40), 0.0)
    if stats is not None:
        cn = chm[::2, ::2]; vv = (np.isfinite(suelo_m) & np.isfinite(suelo_l) & (dist <= 1.0)); dif = np.abs(suelo_m - suelo_l)
        for nom, mk in (("bajo_copa", vv & (cn > 1.5)), ("abierto", vv & (cn <= 1.5)), ("junto_edificio", vv & ndi.binary_dilation(np.isin(np.round(0), [1]), iterations=1))):
            if nom == "junto_edificio": continue
            if mk.sum() > 100: stats["abs_p95_" + nom + "_m"] = round(float(np.percentile(dif[mk], 95)), 3); stats["media_" + nom + "_m"] = round(float((suelo_m - suelo_l)[mk].mean()), 3)
    # cobertura: nodos de 1 m con algún punto a ≤2 m
    cnt = np.zeros((T + 1, T + 1), np.int32); pi = np.floor(x + 0.5).astype(int); pj = np.floor(y + 0.5).astype(int); ok = (pi >= 0) & (pi <= T) & (pj >= 0) & (pj <= T)
    np.add.at(cnt, (pj[ok], pi[ok]), 1); cob = float((ndi.binary_dilation(cnt > 0, iterations=2)).mean())
    # nube de la tesela: lo que sobresale del suelo (hasta 25 m), edificios completos y un poco de suelo
    mi = (x >= 0) & (x < T) & (y >= 0) & (y < T); xs, ys, zs, cs = x[mi], y[mi], z[mi], c[mi]
    zg = ndi.map_coordinates(suelo, [ys, xs], order=1, mode="nearest"); h = zs - zg
    en_olivar = (tx, ty) in parc; cap = CAP_OLIVAR if en_olivar else CAP_MARGEN
    rng = np.random.default_rng(zlib.crc32(f"{tx}_{ty}".encode()))
    veg = np.nonzero(((h >= 0.35) & (h <= 25)) | (cs == 6))[0]; sue = np.nonzero((h < 0.35) & (cs != 6))[0]
    n_sue = int(min(len(sue) * 0.04, cap * 0.07)); n_veg = min(len(veg), cap - n_sue)
    sel = np.concatenate([rng.choice(veg, n_veg, replace=False) if n_veg < len(veg) else veg, rng.choice(sue, n_sue, replace=False) if n_sue else sue[:0]])
    rng.shuffle(sel)
    z0 = float(np.floor(suelo.min() - 2))
    pts = np.column_stack([np.round(xs[sel] / 0.05), np.round(ys[sel] / 0.05), np.round((zs[sel] - z0) / 0.05)]).clip(0, 65535).astype(np.uint16)
    hs = np.clip(np.round(h[sel] * 10), 0, 255).astype(np.uint8)
    np.savez_compressed(f"{TES}/{tx}_{ty}.npz", suelo=suelo, chm=np.round(chm * 100).clip(0, 4000).astype(np.uint16), pts=pts, clase=cs[sel].astype(np.uint8), h=hs,
                        z0=np.float64(z0), X0=np.float64(tx * T), Y0=np.float64(ty * T))
    return {"tx": tx, "ty": ty, "X0": tx * T, "Y0": ty * T, "olivar": bool(en_olivar), "pts_en_tesela": npt_all, "pts_m2": round(npt_all / T / T, 2), "pts_nube": int(len(sel)),
            "z0": z0, "zmin": round(float(suelo.min()), 2), "zmax": round(float(suelo.max()), 2), "chm_max": round(float(chm.max()), 1), "cobertura": round(cob, 3),
            "fuente_suelo_mdt": round(fuente, 3), "hojas_mdt": hojas_mdt, "contraste_mdt_lidar": stats, "dist_suelo_max": round(float(dist.max()), 1), "dist_suelo_p99": round(float(np.percentile(dist, 99)), 1), "seg": round(time.time() - t0, 1)}


if args: lista = [tuple(map(int, a.split("_"))) for a in args]
else: lista = obj
os.makedirs(TES, exist_ok=True)
for (tx, ty) in lista:
    nec = ["%d-%d" % h for h in hojas_que_cubre(tx, ty)]; pres = [h for h in nec if h in hojas_listas]
    k = f"{tx}_{ty}"; prev = indice["teselas"].get(k)
    if "--pendientes" in sys.argv and prev and sorted(prev.get("hojas_presentes", [])) == sorted(pres) and os.path.exists(f"{TES}/{k}.npz"): continue
    if not pres:
        print(k, "sin ninguna hoja"); indice["teselas"][k] = {"tx": tx, "ty": ty, "hojas_necesarias": nec, "hojas_presentes": [], "hojas_faltan": nec, "completa": False, "olivar": (tx, ty) in parc}; continue
    r = procesa(tx, ty)
    if r is None: print(k, "sin datos"); continue
    r.update({"hojas_necesarias": nec, "hojas_presentes": pres, "hojas_faltan": [h for h in nec if h not in pres]}); r["completa"] = not r["hojas_faltan"]
    indice["teselas"][k] = r; print(k, r["pts_en_tesela"], "pts;", r["pts_nube"], "en nube; cob %.2f;" % r["cobertura"], "falta" if r["hojas_faltan"] else "ok", r["hojas_faltan"], "%.1f s" % r["seg"])
    json.dump(indice, open(IDX, "w", encoding="utf-8"), indent=1)
indice["tamano_tesela_m"] = T; indice["crs"] = "EPSG:25830"; indice["hojas_descargadas"] = sorted(hojas_listas)
json.dump(indice, open(IDX, "w", encoding="utf-8"), indent=1)
