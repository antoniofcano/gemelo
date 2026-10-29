"""Puntos normalizados de las copas desde las hojas LiDAR (.laz), para tuberia/parametros_copas.py (ADR-0017, contratos/olivo-generado.md §3).

De cada hoja PNOA que toca el cuadro de las copas del índice (más un margen) se quedan los puntos de VEGETACIÓN cerca de alguna copa, con su altura
sobre el suelo, y se guardan en un .npz con arrays float32 x, y (relativos a `centro_utm`, como `copas`) y h (m sobre el suelo), más `clase` (u1).

  Suelo: el `dtm` de las teselas exportadas (t/<kx>_<ky>.json: celdas de 1 m, cm sobre z0, una celda de margen), interpolado como lo interpola el
  motor (bilineal entre centros de celda, 02_mundo.js). Es MEDIDO: el MDT 0,5 m del CNIG (3.ª cobertura, del propio LiDAR) con la clase 2 del PNOA
  para los huecos (tuberia/datos/hituelo/02_tesela.py). Se usa ese y no otro suelo hecho aquí con la clase 2 para que la altura de copas_param y la
  altura `h` de `copas` (y el terreno que se dibuja) salgan del mismo suelo, y para no rehacer un modelo de terreno que ya existe.
  Puntos: clases 3, 4 y 5 del PNOA (vegetación baja, media y alta) con 0,3 m ≤ h ≤ 30 m. Por debajo de 0,3 m está el suelo y la hierba (parametros_copas
  busca el tronco en 0,3-1,2 m). Cerca de las copas de Hituelo, en una muestra de la hoja 405-4179, todo punto de 0,3 m o más es de clase 3, 4 o 5
  (la 1 solo aparece por debajo de 0,3 m). El tope no es de olivo (ninguno pasa de ~11 m) sino de árbol: entre las copas del índice hay árboles
  altos que no son olivo (uno de 21 m); con un tope de 15 m su altura quedaba truncada en ~14,8 m. Por encima de 30 m solo queda ruido. El ruido
  (7, 18), el suelo (2), los edificios (6) y lo que no es vegetación (1, 12…) quedan fuera por clase, y con ellos el tendido. Solo se guardan los puntos a ≤ RADIO_COPA (6,5 m: el tope de radio_de_busqueda,
  6 m, más medio metro) del centro de alguna copa: es lo único que parametros_copas mira.
  Memoria: una hoja cada vez, por trozos (`chunk_iterator`), float32, y lo que cae fuera del cuadro se descarta en el trozo.

Nunca rutas fijas (CLAUDE.md regla 4): las hojas por --laz o GEMELO_LIDAR (carpeta), el índice por --indice o GEMELO_DATOS, las teselas por --teselas
(por defecto, la carpeta t/ junto al índice).
  python tuberia/puntos_copas.py --indice <indice.json> --laz <carpeta de .laz> --salida <puntos.npz> [--hojas 405-4179,406-4179] [--trozo 500000]
y luego
  python tuberia/parametros_copas.py --indice <indice.json> --puntos <puntos.npz> --salida <otra carpeta>/indice.json
Dependencias: numpy, scipy y laspy con lazrs (versiones fijadas en requirements.txt). psutil, si está, solo para informar de la memoria.
"""
import argparse
import base64
import glob
import json
import math
import os
import sys
import time

import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

TS = 256                     # lado de la tesela (m)
RES = 1.0                    # celda del dtm (m)
N2 = TS + 2                  # 258: celdas -1..256
CLASES = (3, 4, 5)           # vegetación baja, media y alta (ASPRS / PNOA)
H_MIN, H_MAX = 0.3, 30.0
RADIO_COPA = 6.5
MARGEN = 10.0                # margen del cuadro alrededor de las copas (m)


def memoria_mb():
    """Memoria máxima del proceso (MB) o None si no hay psutil."""
    try:
        import psutil
        mi = psutil.Process().memory_info()
        return round(getattr(mi, "peak_wset", mi.rss) / 2 ** 20, 1)
    except Exception:
        return None


def hoja_de(nombre):
    """PNOA_2024_AND_405-4180_H30_NPC01.laz -> (405, 4180). En el nombre la segunda cifra es el borde NORTE de la hoja de 1 km."""
    b = os.path.basename(nombre).split("_")[3]
    a, c = b.split("-")
    return int(a), int(c)


def cuadro_hoja(nombre):
    e, n = hoja_de(nombre)
    return e * 1000.0, (n - 1) * 1000.0, (e + 1) * 1000.0, n * 1000.0


def hojas(carpeta, cuadro, pedidas=None):
    """Hojas .laz de `carpeta` que tocan `cuadro` (x0, y0, x1, y1 en UTM). Se ignoran los duplicados «(1)»."""
    fs = [f for f in sorted(glob.glob(os.path.join(carpeta, "PNOA_*_H30_*.laz"))) if "(" not in os.path.basename(f)]
    if pedidas:
        fs = [f for f in fs if "%d-%d" % hoja_de(f) in pedidas]
    x0, y0, x1, y1 = cuadro
    return [f for f in fs if not (cuadro_hoja(f)[2] <= x0 or cuadro_hoja(f)[0] >= x1 or cuadro_hoja(f)[3] <= y0 or cuadro_hoja(f)[1] >= y1)]


class Suelo:
    """Cota del suelo desde el dtm de las teselas (Int16 LE, cm sobre z0, 258 × 258, filas sur → norte, celdas -1..256)."""

    def __init__(self, indice, carpeta_t):
        self.z0 = float(indice["z0"])
        self.t = {}
        for k in indice["teselas"]:
            f = os.path.join(carpeta_t, k + ".json")
            if not os.path.exists(f):
                continue
            d = np.frombuffer(base64.b64decode(json.load(open(f, encoding="utf-8"))["dtm"]), "<i2")
            if d.size != N2 * N2:
                raise ValueError("dtm de %s con %d celdas (se esperan %d)" % (k, d.size, N2 * N2))
            self.t[tuple(int(v) for v in k.split("_"))] = (d.reshape(N2, N2).astype(np.float32) / 100.0 + self.z0)

    def cota(self, ux, uy):
        """Cota en (ux, uy) UTM; NaN fuera de las teselas. Bilineal entre centros de celda, como el motor."""
        kx = np.floor(ux / TS).astype(np.int64)
        ky = np.floor(uy / TS).astype(np.int64)
        z = np.full(len(ux), np.nan, np.float32)
        clave = kx * 100000 + ky
        for kk in np.unique(clave):
            t = (int(kk // 100000), int(kk % 100000))
            if t not in self.t:
                continue
            m = clave == kk
            fx = (ux[m] - t[0] * TS) / RES - 0.5 + 1
            fy = (uy[m] - t[1] * TS) / RES - 0.5 + 1
            z[m] = ndi.map_coordinates(self.t[t], [fy, fx], order=1, mode="nearest")
        return z


def lee_hoja(f, suelo, cx, cy, cuadro, arbol, trozo, clases=CLASES):
    """Puntos de vegetación cerca de las copas en una hoja. Devuelve (x, y, h, clase) en float32/u1 y su recuento."""
    import laspy
    x0, y0, x1, y1 = cuadro
    out, cuenta = [], {"leidos": 0, "en_cuadro": 0, "vegetacion": 0, "con_suelo": 0, "en_rango": 0, "conservados": 0}
    por_clase = {}
    with laspy.open(f) as r:
        for ch in r.chunk_iterator(trozo):
            cuenta["leidos"] += len(ch)
            x = np.asarray(ch.x)
            y = np.asarray(ch.y)
            m = (x >= x0) & (x < x1) & (y >= y0) & (y < y1)
            if not m.any():
                continue
            x, y = x[m], y[m]
            z = np.asarray(ch.z)[m]
            c = np.asarray(ch.classification)[m].astype(np.uint8)
            cuenta["en_cuadro"] += len(x)
            for k, v in zip(*np.unique(c, return_counts=True)):
                por_clase[int(k)] = por_clase.get(int(k), 0) + int(v)
            m = np.isin(c, clases)
            x, y, z, c = x[m], y[m], z[m], c[m]
            cuenta["vegetacion"] += len(x)
            g = suelo.cota(x, y)
            m = np.isfinite(g)
            x, y, z, c, g = x[m], y[m], z[m], c[m], g[m]
            cuenta["con_suelo"] += len(x)
            h = (z - g).astype(np.float32)
            m = (h >= H_MIN) & (h <= H_MAX)
            x, y, h, c = x[m], y[m], h[m], c[m]
            cuenta["en_rango"] += len(x)
            rx = (x - cx).astype(np.float32)
            ry = (y - cy).astype(np.float32)
            if len(rx):
                d, _ = arbol.query(np.column_stack([rx, ry]), k=1, distance_upper_bound=RADIO_COPA)
                m = np.isfinite(d)
                rx, ry, h, c = rx[m], ry[m], h[m], c[m]
            cuenta["conservados"] += len(rx)
            out.append((rx, ry, h, c))
    if out:
        res = tuple(np.concatenate([o[i] for o in out]) for i in range(4))
    else:
        res = (np.zeros(0, np.float32),) * 3 + (np.zeros(0, np.uint8),)
    cuenta["clases_en_cuadro"] = dict(sorted(por_clase.items()))
    return res, cuenta


def puntos(indice, carpeta_laz, carpeta_t, trozo=500000, pedidas=None, informe=print):
    """Todo el proceso: devuelve (x, y, h, clase) y el informe por hoja."""
    cx, cy = (float(v) for v in indice["centro_utm"])
    xy = np.array([[c[0], c[1]] for c in indice["copas"]], float)
    if not len(xy):
        raise ValueError("el índice no trae copas")
    cuadro = (xy[:, 0].min() + cx - MARGEN, xy[:, 1].min() + cy - MARGEN, xy[:, 0].max() + cx + MARGEN, xy[:, 1].max() + cy + MARGEN)
    suelo = Suelo(indice, carpeta_t)
    if not suelo.t:
        raise ValueError("no hay ninguna tesela con dtm en " + carpeta_t)
    arbol = cKDTree(xy)
    fs = hojas(carpeta_laz, cuadro, pedidas)
    if not fs:
        raise ValueError("ninguna hoja .laz de la carpeta toca el cuadro de las copas")
    partes, por_hoja = [], {}
    for f in fs:
        t0 = time.time()
        p, cuenta = lee_hoja(f, suelo, cx, cy, cuadro, arbol, trozo)
        cuenta["seg"] = round(time.time() - t0, 1)
        cuenta["memoria_max_mb"] = memoria_mb()
        nombre = "%d-%d" % hoja_de(f)
        por_hoja[nombre] = cuenta
        informe("%s: %d leídos, %d en el cuadro, %d conservados, %.0f s, memoria máx. %s MB" % (
            nombre, cuenta["leidos"], cuenta["en_cuadro"], cuenta["conservados"], cuenta["seg"], cuenta["memoria_max_mb"]))
        partes.append(p)
    res = tuple(np.concatenate([p[i] for p in partes]) for i in range(4))
    return res, {"cuadro_utm": [round(v, 2) for v in cuadro], "teselas_con_dtm": len(suelo.t), "hojas": por_hoja,
                 "clases": list(CLASES), "h": [H_MIN, H_MAX], "radio_copa_m": RADIO_COPA}


def principal():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", default=os.environ.get("GEMELO_DATOS"))
    ap.add_argument("--laz", default=os.environ.get("GEMELO_LIDAR"), help="carpeta con las hojas PNOA_*.laz")
    ap.add_argument("--teselas", help="carpeta de las teselas t/<kx>_<ky>.json (por defecto, t/ junto al índice)")
    ap.add_argument("--salida", required=True, help="fichero .npz de salida (x, y, h, clase); el informe va junto, en .json")
    ap.add_argument("--hojas", help="solo estas hojas, p. ej. 405-4179,406-4179")
    ap.add_argument("--trozo", type=int, default=500000, help="puntos por trozo de lectura (menos = menos memoria)")
    a = ap.parse_args()
    if not a.indice or not a.laz:
        print("faltan --indice y --laz (o GEMELO_DATOS y GEMELO_LIDAR)", file=sys.stderr)
        return 2
    I = json.load(open(a.indice, encoding="utf-8"))
    t0 = time.time()
    (x, y, h, c), info = puntos(I, a.laz, a.teselas or os.path.join(os.path.dirname(os.path.abspath(a.indice)), "t"),
                                a.trozo, set(a.hojas.split(",")) if a.hojas else None)
    np.savez_compressed(a.salida, x=x, y=y, h=h, clase=c)
    info.update(puntos=int(len(x)), seg=round(time.time() - t0, 1), memoria_max_mb=memoria_mb())
    json.dump(info, open(os.path.splitext(a.salida)[0] + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("%d puntos en %.0f s; memoria máx. %s MB" % (len(x), info["seg"], info["memoria_max_mb"]))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
