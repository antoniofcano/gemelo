"""Avance árbol a árbol (prototipo): qué olivos caen dentro de la zona recorrida de cada tarea. Solo sale un estado por olivo y tarea: ni personas ni polígonos."""
import json
import numpy as np
from rasterio.warp import transform as tr
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
D = json.load(open(R + r"\finca_datos.json", encoding="utf-8")); V = json.load(open(R + r"\finca_ventana.json", encoding="utf-8"))
Z = json.load(open(R + r"\ot_zonas_tareas.json", encoding="utf-8"))
cx, cy = D["centro_utm"]; ids = [p["id"] for p in D["parcelas"]]
def utm(lista): xs, ys = tr("EPSG:4326", "EPSG:25830", [q["lng"] for q in lista], [q["lat"] for q in lista]); return np.column_stack([xs, ys])
def dentro(poly, P):
    ins = np.zeros(len(P), bool); n = len(poly); x, y = P[:, 0], P[:, 1]
    for i in range(n):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % n]
        ins ^= ((ay > y) != (by > y)) & (x < (bx - ax) * (y - ay) / (by - ay + 1e-12) + ax)
    return ins
copas = np.array([[c[0] + cx, c[1] + cy] for c in D["copas"]]); parc_c = np.array([c[4] for c in D["copas"]])
marcas = {k: np.array(p["olivos"]) for k, p in enumerate(V["parcelas"])}
tipos = {"riego": "goteros", "varetas": "varetas"}
marc = D["marcados"]                                   # [x, y, indice de copa o -1, parcela]
estados_marca = {"goteros": ["-"] * len(marc), "varetas": ["-"] * len(marc)}
estados_copa = {"goteros": ["-"] * len(copas), "varetas": ["-"] * len(copas)}
cuentas = {}
for t in Z:
    if t["parcelaId"] not in ids or not t["zonas"] or t["tipo"] not in tipos or not t["titulo"]: continue
    if t["tipo"] == "riego" and "otero" not in t["titulo"]: continue
    k = ids.index(t["parcelaId"]); tipo = tipos[t["tipo"]]
    zonas = [utm(z["pts"]) for z in t["zonas"]]
    # las zonas se dibujaron sobre la ortofoto, igual que las marcas: se comparan en ese mismo marco
    midx = [i for i, m in enumerate(marc) if m[3] == k]; M = np.array([[marc[i][0] + cx, marc[i][1] + cy] for i in midx])
    enZ = np.zeros(len(M), bool)
    for z in zonas: enZ |= dentro(z, M)
    declarados = t["andados"]
    reproduce = declarados is not None and abs(int(enZ.sum()) - int(declarados)) <= 1
    pareadas = set()
    for j, i in enumerate(midx):
        if reproduce: estados_marca[tipo][i] = "1" if enZ[j] else "0"
        c = marc[i][2]
        if c >= 0:
            pareadas.add(c)
            if reproduce: estados_copa[tipo][c] = "1" if enZ[j] else "0"
    es_oliv = lambda c: not (D["copas"][c][2] > 8 or (D["copas"][c][2] > 6.5 and np.mean(D["copas"][c][3]) < 2.2))   # fuera postes y cables
    sin_marca = [c for c in np.nonzero(parc_c == k + 1)[0] if c not in pareadas and es_oliv(c)]
    if reproduce:
        for c in sin_marca: estados_copa[tipo][c] = "2"
    cuentas.setdefault(str(k), {})[tipo] = {"titulo": t["titulo"], "declarados": declarados, "objetivo": t["objetivo"], "marcas": int(len(M)), "marcas_en_zona": int(enZ.sum()),
        "reproduce": bool(reproduce), "copas_sin_marca": int(len(sin_marca)), "no_andadas_con_copa": int(sum(1 for j, i in enumerate(midx) if not enZ[j] and marc[i][2] >= 0))}
    print("%-26s %-8s declarados %s/%s | marcas en zona %d de %d | %s | marcas no andadas con copa LiDAR: %d | copas sin marca: %d" % (t["parcelaId"][:26], tipo, declarados, t["objetivo"], enZ.sum(), len(M), "REPRODUCE" if reproduce else "NO reproduce", cuentas[str(k)][tipo]["no_andadas_con_copa"], len(sin_marca)))
out = {"marcas": {k: "".join(v) for k, v in estados_marca.items()}, "copas": {k: "".join(v) for k, v in estados_copa.items()}, "cuentas": cuentas}
json.dump(out, open(R + r"\finca_avance.json", "w", encoding="utf-8"))
print("guardado: un estado por marca y por copa; sin personas ni polígonos")
