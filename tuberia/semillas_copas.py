"""Semilla GUARDADA de cada olivo (respuesta 3 de Antonio, contratos/olivo-generado.md §1.2, ADR-0017): columna paralela opcional `copas_semilla`.

La semilla del generador de olivos se asigna UNA vez y viaja en el registro del árbol; así su forma no cambia aunque cambie su id (de provisional
a id del censo) o su índice en `copas`. Solo un cambio de GEN_VERSION cambia la forma de un olivo.

Regla, por cada copa de la exportación nueva:
  1. si en la exportación anterior había una copa con el MISMO id DEL CENSO (< 2^31) y tenía semilla → esa semilla. Los ids provisionales
     (≥ 2^31) no cuentan aquí: salen de la posición y, cuando dos copas caen en la misma celda de 1 m, el id de una puede pasar a la otra
     (si la primera recibe el del censo); para ellos manda la cercanía, que da lo mismo sin ese cruce;
  2. si no, si la copa más cercana de la anterior está a ≤ `umbral` m (1,5 m), nadie más la reclama y tenía semilla → esa semilla (es el caso
     del censo: el id provisional pasa a ser el de OlivarTrack y el árbol hereda su forma; emparejado uno a uno, por distancia creciente);
  3. si no, una nueva: la semilla es su `copas_id` (o, sin id, el id provisional por posición de ids_copas.py).
Python puro (sin numpy), determinista.

Los exportadores (finca_8_teselas.py y hituelo_conv.py) la aplican solos con `asigna()` (decisión 50): el índice anterior es el de `--anterior`,
o el de la variable GEMELO_INDICE_ANTERIOR, o el `indice.json` que ya hubiera en la carpeta de salida (la exportación que se va a sobrescribir);
si no hay ninguno, la semilla es el `copas_id`. Suelto, para un índice ya escrito:

  python tuberia/semillas_copas.py --indice <indice.json nuevo> [--anterior <indice.json anterior>] [--salida <indice.json>]
"""
import argparse
import json
import math
import os
import sys

UMBRAL = 1.5
PROV = 2 ** 31   # desde aquí, ids provisionales del exportador (ids_copas.py)
VAR_ANTERIOR = "GEMELO_INDICE_ANTERIOR"


def semillas(copas, ids, anterior=None, umbral=UMBRAL):
    """copas_semilla de una exportación. `anterior` = {copas, copas_id, copas_semilla} de la anterior (o None)."""
    n = len(copas)
    out = [None] * n
    prev = []
    if anterior and anterior.get("copas_semilla"):
        pid = anterior.get("copas_id") or [-1] * len(anterior["copas"])
        prev = [(c[0], c[1], pid[j], anterior["copas_semilla"][j]) for j, c in enumerate(anterior["copas"])]
    censo = lambda k: k is not None and 0 <= k < PROV
    por_id = {p[2]: (j, p[3]) for j, p in enumerate(prev) if censo(p[2]) and p[3] is not None}
    usadas = set()
    for i in range(n):                                              # 1. mismo id
        k = ids[i] if ids else -1
        if censo(k) and k in por_id:
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


def ruta_anterior(salida=None, anterior=None):
    """El índice anterior que manda: el argumento, la variable GEMELO_INDICE_ANTERIOR o el indice.json que ya haya en `salida` (o None)."""
    for r in (anterior, os.environ.get(VAR_ANTERIOR)):
        if r:
            if not os.path.isfile(r):
                raise SystemExit("índice anterior no encontrado: %s" % r)
            return r
    r = os.path.join(salida, "indice.json") if salida else None
    return r if r and os.path.isfile(r) else None


def en_mi_centro(A, centro):
    """Las copas del índice anterior pasadas al centro_utm del nuevo (si la caja cambió, el centro también: se compara en UTM)."""
    ca = A.get("centro_utm") or centro
    dx, dy = ca[0] - centro[0], ca[1] - centro[1]
    if not dx and not dy:
        return A
    B = dict(A); B["copas"] = [[c[0] + dx, c[1] + dy] + list(c[2:]) for c in A["copas"]]
    return B


def asigna(I, salida=None, anterior=None):
    """Pone I["copas_semilla"] (después de columnas() de ids_copas.py). Devuelve (ruta del anterior o None, cuántas heredadas)."""
    r = ruta_anterior(salida, anterior)
    A = en_mi_centro(json.load(open(r, encoding="utf-8")), I["centro_utm"]) if r else None
    I["copas_semilla"] = semillas(I["copas"], I.get("copas_id"), A)
    if any(s is None for s in I["copas_semilla"]):
        raise SystemExit("hay copas sin copas_id ni semilla anterior: columnas() de ids_copas.py va antes")
    heredadas = sum(1 for s, k in zip(I["copas_semilla"], I.get("copas_id") or []) if s != k)
    print("copas_semilla: %d copas, %d heredadas de %s" % (len(I["copas"]), heredadas, r or "(sin índice anterior: semilla = copas_id)"))
    return r, heredadas


def principal():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", required=True)
    ap.add_argument("--anterior")
    ap.add_argument("--salida")
    a = ap.parse_args()
    I = json.load(open(a.indice, encoding="utf-8"))
    A = en_mi_centro(json.load(open(a.anterior, encoding="utf-8")), I["centro_utm"]) if a.anterior else None
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
