"""Paso 1: reparte las hojas LAZ en ficheros por (hoja, tesela). Idempotente por hoja (salta las ya repartidas; --forzar las rehace).
Uso: python -I 01_particiona.py [hoja ...]   (hoja = 405-4180 ; sin argumentos: todas las PNOA_2024_AND_40x-xxxx de Descargas)"""
import sys, os, glob, time, json
import numpy as np, laspy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
DT = np.dtype([("x", "<f4"), ("y", "<f4"), ("z", "<f4"), ("c", "u1")])
P = parcelas(); obj, parc = teselas_objetivo(P)
anillo = set(obj)
for (a, b) in obj:
    for da in (-1, 0, 1):
        for db in (-1, 0, 1): anillo.add((a + da, b + db))
args = [a for a in sys.argv[1:] if not a.startswith("--")]; forzar = "--forzar" in sys.argv
if args: ficheros = [DL + "/PNOA_2024_AND_" + h + "_H30_NPC01.laz" for h in args]
else: ficheros = [f for f in sorted(glob.glob(DL + r"\PNOA_2024_AND_40[456]-41[78]?_H30_NPC01.laz")) if "(" not in f]
for f in ficheros:
    hx, hy = hoja_de(f); nombre = f"{hx}-{hy}"; carp = RAW + "/" + nombre; marca = carp + "/HECHO.json"
    if os.path.exists(marca) and not forzar: print(nombre, "ya repartida"); continue
    t0 = time.time(); os.makedirs(carp, exist_ok=True); acum = {}; n = 0; clases = {}
    with laspy.open(f) as r:
        for ch in r.chunk_iterator(2_000_000):
            x, y, z, c = np.asarray(ch.x), np.asarray(ch.y), np.asarray(ch.z), np.asarray(ch.classification)
            s = ~np.isin(c, CLASES_FUERA); x, y, z, c = x[s], y[s], z[s], c[s]; n += len(x)
            for k, v in zip(*np.unique(c, return_counts=True)): clases[int(k)] = clases.get(int(k), 0) + int(v)
            tx, ty = tesela_de(x, y); clave = tx * 100000 + ty
            for kk in np.unique(clave):
                t_ = (int(kk // 100000), int(kk % 100000))
                if t_ not in anillo: continue
                m = clave == kk; a = np.empty(m.sum(), DT); a["x"] = x[m] - t_[0] * T; a["y"] = y[m] - t_[1] * T; a["z"] = z[m]; a["c"] = c[m]
                acum.setdefault(t_, []).append(a)
    for (tx, ty), L in acum.items(): np.save(f"{carp}/{tx}_{ty}.npy", np.concatenate(L))
    json.dump({"hoja": nombre, "puntos": n, "clases": clases, "teselas": len(acum), "seg": round(time.time() - t0, 1)}, open(marca, "w"))
    print(nombre, n, "puntos", clases, "->", len(acum), "teselas, %.0f s" % (time.time() - t0))
