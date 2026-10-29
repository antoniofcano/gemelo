"""Factores de corrección del LiDAR medidos en campo (respuesta 2 de Antonio, ADR-0017) y la prueba de si r8 es radio (decisión abierta nº 48).

El sesgo de la medida del LiDAR (p95 de altura, diámetro del contorno) se corrige EN LA TUBERÍA con dos factores de configuración que hoy valen
1,0 (`--factor-altura`, `--factor-copa` de tuberia/parametros_copas.py). Los del simulador (≈ 1,16 y 1,20) NO se aplican a datos reales: los
reales salen de medir unos olivos en campo con esta plantilla.

1) Plantilla (CSV, una fila por olivo, ~10 olivos de tamaños distintos):
     python tuberia/factores_campo.py --plantilla <salida.csv> [--indice <indice.json>] [--n 10]
   Con el índice, la rellena con 10 olivos repartidos por tamaño de copa (id y posición UTM); en campo se apuntan altura (pértiga o
   clinómetro), dos diámetros de copa perpendiculares con cinta (N-S y E-O, de borde a borde de la proyección), fecha y notas.
   Columnas: id_provisional, utm_e, utm_n, altura_m, copa_ns_m, copa_eo_m, fecha, notas
2) Factores:
     python tuberia/factores_campo.py --medidas <campo.csv> --indice <indice.json> [--salida factores.json]
   Empareja cada fila con la copa más cercana del índice (≤ 2 m; o por id), y da:
     factor_altura = mediana(altura de campo / altura del LiDAR)          (copas_param[0] si lo hay; si no, h)
     factor_copa   = mediana(copa de campo / copa del LiDAR)              (copas_param[1] si lo hay; si no, 2 × media de r8)
     r8            = mediana(copa de campo / (2 × media de r8)): ≈ 1 → r8 es RADIO; ≈ 0,5 → r8 sería diámetro. Cierra la cuestión nº 48.
   La copa de campo es la media de los dos diámetros con cinta.
Los CSV de campo son datos de la explotación: NO se versionan (el repo es público).
"""
import argparse
import csv
import json
import math
import os
import statistics
import sys

COLUMNAS = ["id_provisional", "utm_e", "utm_n", "altura_m", "copa_ns_m", "copa_eo_m", "fecha", "notas"]
EMPAREJA_M = 2.0


def plantilla(salida, indice=None, n=10):
    filas = []
    if indice:
        I = json.load(open(indice, encoding="utf-8"))
        cx, cy = I["centro_utm"]; ids = I.get("copas_id")
        orden = sorted(range(len(I["copas"])), key=lambda i: sum(I["copas"][i][3]) / 8)
        elegidos = [orden[int((k + 0.5) * len(orden) / n)] for k in range(min(n, len(orden)))]   # repartidos por tamaño de copa
        for i in elegidos:
            c = I["copas"][i]
            filas.append({"id_provisional": ids[i] if ids else i, "utm_e": round(c[0] + cx, 2), "utm_n": round(c[1] + cy, 2)})
    else:
        filas = [{} for _ in range(n)]
    with open(salida, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLUMNAS); w.writeheader()
        for r in filas:
            w.writerow({k: r.get(k, "") for k in COLUMNAS})
    return len(filas)


def numero(s):
    try:
        return float(str(s).replace(",", "."))
    except (TypeError, ValueError):
        return None


def factores(medidas, indice):
    I = json.load(open(indice, encoding="utf-8"))
    cx, cy = I["centro_utm"]; ids = I.get("copas_id"); par = I.get("copas_param")
    por_id = {k: i for i, k in enumerate(ids)} if ids else {}
    fa, fc, fr, filas, sin = [], [], [], [], []
    for r in csv.DictReader(open(medidas, encoding="utf-8")):
        e, n = numero(r.get("utm_e")), numero(r.get("utm_n"))
        alt, a, b = numero(r.get("altura_m")), numero(r.get("copa_ns_m")), numero(r.get("copa_eo_m"))
        i, d = None, None
        k = numero(r.get("id_provisional"))
        if k is not None and int(k) in por_id:
            i = por_id[int(k)]; d = 0.0
        elif e is not None and n is not None:
            d, i = min((math.hypot(c[0] + cx - e, c[1] + cy - n), j) for j, c in enumerate(I["copas"]))
            if d > EMPAREJA_M:
                i = None
        if i is None or alt is None or a is None or b is None:
            sin.append(r.get("id_provisional") or "?"); continue
        c = I["copas"][i]; p = par[i] if par and par[i] else None
        h_l = p[0] if p else c[2]; copa_l = p[1] if p else 2 * sum(c[3]) / 8; copa_c = (a + b) / 2; r8 = sum(c[3]) / 8
        fa.append(alt / h_l); fc.append(copa_c / copa_l); fr.append(copa_c / (2 * r8))
        filas.append({"copa": i, "distancia_m": round(d, 2), "altura_campo": alt, "altura_lidar": h_l, "copa_campo": round(copa_c, 2), "copa_lidar": round(copa_l, 2), "dos_r8": round(2 * r8, 2)})
    if not filas:
        raise SystemExit("ninguna fila emparejada con una copa del índice")
    med = lambda v: round(statistics.median(v), 3)
    q = med(fr)
    return {"olivos": len(filas), "sin_emparejar": sin, "factor_altura": med(fa), "factor_copa": med(fc),
            "copa_campo_entre_2r8": {"mediana": q, "min": round(min(fr), 3), "max": round(max(fr), 3)},
            "r8_es": "radio" if 0.75 <= q <= 1.35 else "diámetro" if 0.38 <= q <= 0.67 else "no concluyente", "filas": filas}


def principal():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--plantilla"); ap.add_argument("--medidas"); ap.add_argument("--indice", default=os.environ.get("GEMELO_DATOS"))
    ap.add_argument("--n", type=int, default=10); ap.add_argument("--salida")
    a = ap.parse_args()
    if a.plantilla:
        print("plantilla con %d filas en %s" % (plantilla(a.plantilla, a.indice, a.n), a.plantilla)); return 0
    if a.medidas and a.indice:
        F = factores(a.medidas, a.indice)
        if a.salida:
            json.dump(F, open(a.salida, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
        print(json.dumps({k: v for k, v in F.items() if k != "filas"}, ensure_ascii=False)); return 0
    ap.print_help(); return 2


if __name__ == "__main__":
    sys.exit(principal())
