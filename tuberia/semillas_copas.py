"""Semilla GUARDADA de cada olivo (respuesta 3 de Antonio, contratos/olivo-generado.md §1.2, ADR-0017): columna paralela opcional `copas_semilla`.

La semilla del generador de olivos se asigna UNA vez y viaja en el registro del árbol; así su forma no cambia aunque cambie su id (de provisional
a id del censo) o su índice en `copas`. Solo un cambio de GEN_VERSION cambia la forma de un olivo.

Regla, por cada copa de la exportación nueva:
  1. si en la exportación anterior había una copa con el MISMO id y tenía semilla → esa semilla;
  2. si no, si la copa más cercana de la anterior está a ≤ `umbral` m (1,5 m), nadie más la reclama y tenía semilla → esa semilla (es el caso
     del censo: el id provisional pasa a ser el de OlivarTrack y el árbol hereda su forma; emparejado uno a uno, por distancia creciente);
  3. si no, una nueva: la semilla es su `copas_id` (o, sin id, el id provisional por posición de ids_copas.py).
Python puro (sin numpy), determinista.

  python tuberia/semillas_copas.py --indice <indice.json nuevo> [--anterior <indice.json anterior>] [--salida <indice.json>]
"""
import argparse
import json
import math
import sys

UMBRAL = 1.5


def semillas(copas, ids, anterior=None, umbral=UMBRAL):
    """copas_semilla de una exportación. `anterior` = {copas, copas_id, copas_semilla} de la anterior (o None)."""
    n = len(copas)
    out = [None] * n
    prev = []
    if anterior and anterior.get("copas_semilla"):
        pid = anterior.get("copas_id") or [-1] * len(anterior["copas"])
        prev = [(c[0], c[1], pid[j], anterior["copas_semilla"][j]) for j, c in enumerate(anterior["copas"])]
    por_id = {p[2]: (j, p[3]) for j, p in enumerate(prev) if p[2] is not None and p[2] >= 0 and p[3] is not None}
    usadas = set()
    for i in range(n):                                              # 1. mismo id
        k = ids[i] if ids else -1
        if k is not None and k >= 0 and k in por_id:
            j, s = por_id[k]; out[i] = s; usadas.add(j)
    pares = []                                                      # 2. por cercanía, uno a uno
    for i in range(n):
        if out[i] is not None:
            continue
        for j, p in enumerate(prev):
            if j in usadas or p[3] is None:
                continue
            d = math.hypot(copas[i][0] - p[0], copas[i][1] - p[1])
            if d <= umbral:
                pares.append((d, i, j))
    for d, i, j in sorted(pares):
        if out[i] is None and j not in usadas:
            out[i] = prev[j][3]; usadas.add(j)
    for i in range(n):                                              # 3. nuevas
        if out[i] is None:
            k = ids[i] if ids else -1
            out[i] = int(k) if k is not None and k >= 0 else None
    return out


def principal():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", required=True)
    ap.add_argument("--anterior")
    ap.add_argument("--salida")
    a = ap.parse_args()
    I = json.load(open(a.indice, encoding="utf-8"))
    A = json.load(open(a.anterior, encoding="utf-8")) if a.anterior else None
    I["copas_semilla"] = semillas(I["copas"], I.get("copas_id"), A)
    if any(s is None for s in I["copas_semilla"]):
        print("hay copas sin copas_id ni semilla anterior: pasa antes ids_copas.py", file=sys.stderr)
        return 1
    json.dump(I, open(a.salida or a.indice, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    heredadas = sum(1 for s, k in zip(I["copas_semilla"], I.get("copas_id") or []) if s != k)
    print("copas_semilla: %d copas, %d con semilla heredada de la exportación anterior" % (len(I["copas"]), heredadas))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
