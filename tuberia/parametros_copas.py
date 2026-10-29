"""Parámetros de cada olivo desde el LiDAR, para el constructor de olivos generados (ADR-0017, contratos/olivo-generado.md §3).

Columna paralela OPCIONAL `copas_param` del índice: por cada copa, [altura_m, copa_m, desplaz_m, rumbo_gr, densidad, base_m, rugosidad, tronco]
(o null si no hay puntos). Todo lo de la fila es MEDIDO; la conversión a parámetros del generador (asimetría, falda, relieve: DEDUCIDOS) la hace
apps/web/olivo/copas.js (parametrosDeCopa), con las fórmulas de la maqueta «Olivos en el gemelo».

  altura_m   percentil 95 de la altura sobre el suelo de los puntos de copa
  copa_m     diámetro del contorno: 2 × la media de los 8 radios del contorno (p95 de la distancia horizontal de los puntos de copa en cada
             octante, desde el centro de copa)
  desplaz_m  distancia horizontal del centro de copa (centroide de los puntos de copa) al tronco
  rumbo_gr   hacia dónde carga la copa: dirección tronco → centro de copa; 0 = norte (+y del índice, −Z del motor), 90 = este (+x, +X)
  densidad   fracción de las celdas de 0,5 m dentro del contorno con algún punto de copa
  base_m     percentil 5 de la altura de los puntos de copa (la falda)
  rugosidad  desviación típica de la superficie superior (máximo por celda de 0,5 m en la mitad alta) dividida por la altura
  tronco     de dónde sale el tronco: 0 = LiDAR (retornos bajos, 0,3-1,2 m, bajo la copa), 1 = marca de OlivarTrack (corregida de su desfase),
             2 = centro de copa (no hay ni lo uno ni lo otro). Manda el LiDAR.

Entrada: los puntos normalizados (x, y relativos al centro de la finca como `copas`, y h = altura sobre el suelo) en un .npz con arrays x, y, h,
y el índice. Nunca rutas fijas: GEMELO_DATOS (índice) y GEMELO_LIDAR (puntos), o argumentos.
  python tuberia/parametros_copas.py --indice <indice.json> --puntos <puntos.npz> [--salida <indice_con_param.json>] [--desfase dx,dy]
Sin datos reales en el repo: la calibración (pruebas/olivo/calibracion.mjs) genera árboles con parámetros conocidos y los mide con `mide()`.
Dependencias: numpy y scipy (versiones fijadas en requirements.txt).
"""
import argparse
import json
import math
import os
import sys

import numpy as np
from scipy.spatial import cKDTree

CAMPOS = ["altura_m", "copa_m", "desplaz_m", "rumbo_gr", "densidad", "base_m", "rugosidad", "tronco"]
CELDA = 0.5
# Corrección del sesgo de la medida (respuesta 2 de Antonio): factores de configuración, 1,0 mientras no se midan en campo con
# tuberia/factores_campo.py (los ≈ 1,16 y 1,20 de la calibración sintética NO se aplican a datos reales).
FACTOR_ALTURA = 1.0
FACTOR_COPA = 1.0


def radio_de_busqueda(xy, tope=6.0):
    """Mitad de la distancia al vecino más cercano de cada árbol (su «parcela» de puntos), con tope; un árbol solo: el tope."""
    if len(xy) < 2:
        return np.full(len(xy), tope)
    d, _ = cKDTree(xy).query(xy, k=2)
    return np.minimum(tope, np.maximum(1.0, d[:, 1] / 2))


def mide(px, py, ph, cx, cy, radio, marca=None, umbral_rel=0.35):
    """Mide un árbol con los puntos (px, py, ph) de su entorno (ya recortados a `radio` de (cx, cy)). Devuelve la fila de copas_param o None."""
    if len(ph) < 10:
        return None
    hmax = float(np.percentile(ph, 99))
    copa = ph >= max(1.2, umbral_rel * hmax)                        # puntos de copa (como el umbral de los exportadores)
    if copa.sum() < 10:
        return None
    qx, qy, qh = px[copa], py[copa], ph[copa]
    altura = float(np.percentile(qh, 95))
    ccx, ccy = float(qx.mean()), float(qy.mean())                    # centro de copa
    # tronco: retornos bajos bajo la copa (0,3-1,2 m) cerca del centro; si no, la marca; si no, el centro
    bajos = (ph >= 0.3) & (ph <= 1.2) & (np.hypot(px - ccx, py - ccy) <= 0.45 * radio)
    if bajos.sum() >= 5:
        tx, ty, origen = float(px[bajos].mean()), float(py[bajos].mean()), 0
    elif marca is not None:
        tx, ty, origen = float(marca[0]), float(marca[1]), 1
    else:
        tx, ty, origen = ccx, ccy, 2
    # contorno: p95 de la distancia por octante (0 = este, antihorario, como r8)
    ang = np.arctan2(qy - ccy, qx - ccx) % (2 * math.pi)
    dist = np.hypot(qx - ccx, qy - ccy)
    oct_ = np.minimum(7, (ang / (math.pi / 4)).astype(int))
    radios = np.array([np.percentile(dist[oct_ == k], 95) if (oct_ == k).sum() >= 3 else 0.0 for k in range(8)])
    if (radios > 0).sum() < 4:
        return None
    radios[radios == 0] = radios[radios > 0].mean()
    copa_m = 2 * float(radios.mean())
    # densidad: celdas de 0,5 m dentro del contorno con algún punto de copa
    r_med = float(radios.mean())
    gx = np.arange(ccx - r_med, ccx + r_med + CELDA, CELDA)
    gy = np.arange(ccy - r_med, ccy + r_med + CELDA, CELDA)
    GX, GY = np.meshgrid(gx, gy)
    ga = np.arctan2(GY - ccy, GX - ccx) % (2 * math.pi)
    gk = np.minimum(7, (ga / (math.pi / 4)).astype(int))
    dentro = np.hypot(GX - ccx, GY - ccy) <= radios[gk]
    ix = np.floor((qx - gx[0]) / CELDA + 0.5).astype(int)
    iy = np.floor((qy - gy[0]) / CELDA + 0.5).astype(int)
    ok = (ix >= 0) & (ix < len(gx)) & (iy >= 0) & (iy < len(gy))
    ocup = np.zeros(GX.shape, bool)
    ocup[iy[ok], ix[ok]] = True
    densidad = float((ocup & dentro).sum() / max(1, dentro.sum()))
    # rugosidad de la superficie de arriba: máximo por celda en la mitad alta
    sup = np.full(GX.shape, np.nan)
    for a, b, h in zip(iy[ok], ix[ok], qh[ok]):
        if not (sup[a, b] >= h):
            sup[a, b] = h
    alta = sup[np.isfinite(sup) & (sup >= 0.5 * altura)]
    rugosidad = float(np.std(alta) / altura) if len(alta) >= 4 else 0.0
    dx, dy = ccx - tx, ccy - ty
    desplaz = float(math.hypot(dx, dy))
    rumbo = float(math.degrees(math.atan2(dx, dy)) % 360)          # 0 = norte (+y), 90 = este (+x)
    base = float(np.percentile(qh, 5))
    return [round(altura, 2), round(copa_m, 2), round(desplaz, 2), round(rumbo, 1), round(densidad, 3), round(base, 2), round(rugosidad, 3), origen]


def parametros(copas, x, y, h, marcas=None, desfase=(0.0, 0.0), factor_altura=FACTOR_ALTURA, factor_copa=FACTOR_COPA):
    """copas_param de todas las copas. `marcas` = {índice de copa: (x, y)} de OlivarTrack, a las que se suma `desfase` (≈ 1,5 m medido).
    `factor_altura` y `factor_copa` corrigen la altura (p95) y la copa (diámetro del contorno); 1,0 = sin corregir."""
    xy = np.array([[c[0], c[1]] for c in copas], float)
    rb = radio_de_busqueda(xy)
    arbol = cKDTree(np.column_stack([x, y]))
    out = []
    for i, c in enumerate(copas):
        idx = np.array(arbol.query_ball_point([c[0], c[1]], rb[i]), int)
        m = None
        if marcas and i in marcas:
            m = (marcas[i][0] + desfase[0], marcas[i][1] + desfase[1])
        f = mide(x[idx], y[idx], h[idx], c[0], c[1], rb[i], m) if len(idx) else None
        if f and (factor_altura != 1.0 or factor_copa != 1.0):
            f[0] = round(f[0] * factor_altura, 2); f[1] = round(f[1] * factor_copa, 2)
        out.append(f)
    return out


def principal():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", default=os.environ.get("GEMELO_DATOS"))
    ap.add_argument("--puntos", default=os.environ.get("GEMELO_LIDAR"))
    ap.add_argument("--salida")
    ap.add_argument("--desfase", default="0,0", help="desfase de las marcas de OlivarTrack (dx,dy en m)")
    ap.add_argument("--factor-altura", type=float, default=FACTOR_ALTURA, help="corrección de la altura (de tuberia/factores_campo.py; 1,0 = sin corregir)")
    ap.add_argument("--factor-copa", type=float, default=FACTOR_COPA, help="corrección de la copa (de tuberia/factores_campo.py; 1,0 = sin corregir)")
    ap.add_argument("--calibracion", help="JSON de pruebas/olivo/calibracion.mjs: mide sus árboles y escribe el resultado junto a él")
    a = ap.parse_args()
    if a.calibracion:
        C = json.load(open(a.calibracion, encoding="utf-8"))
        x, y, h = (np.array(C["puntos"][k], float) for k in ("x", "y", "h"))
        filas = parametros([[t["x"], t["y"]] for t in C["arboles"]], x, y, h)
        json.dump({"campos": CAMPOS, "filas": filas}, open(os.path.splitext(a.calibracion)[0] + ".medido.json", "w", encoding="utf-8"))
        return 0
    if not a.indice or not a.puntos:
        print("faltan --indice y --puntos (o GEMELO_DATOS y GEMELO_LIDAR)", file=sys.stderr)
        return 2
    I = json.load(open(a.indice, encoding="utf-8"))
    P = np.load(a.puntos)
    marcas = {m[2]: (m[0], m[1]) for m in I.get("marcados", []) if m[2] >= 0}
    dx, dy = (float(v) for v in a.desfase.split(","))
    I["copas_param"] = parametros(I["copas"], P["x"], P["y"], P["h"], marcas, (dx, dy), a.factor_altura, a.factor_copa)
    json.dump(I, open(a.salida or a.indice, "w", encoding="utf-8"), separators=(",", ":"), ensure_ascii=False)
    n = sum(1 for f in I["copas_param"] if f)
    print("copas_param: %d de %d copas medidas" % (n, len(I["copas"])))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
