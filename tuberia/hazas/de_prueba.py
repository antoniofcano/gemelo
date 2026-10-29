"""Hazas INVENTADAS «de prueba» dentro de la caja de una finca real (para ver lindes en la prueba en aparatos).

La siembra normal (desde_fixture.py) pone hazas sobre el Hituelo sintético del fixture; con Hituelo real caen fuera del
mundo. Este script lee el `indice.json` de la finca que se sirve (real o no) y coloca unas pocas hazas rectangulares
(por defecto 4: H-D01…H-D04, para que casen con los hogares de prueba de la siembra) DENTRO de la zona de copas, de forma
determinista: cada una centrada en la copa más cercana a un punto fijo del reparto de las copas (cuantiles).

Qué es y qué no es (CLAUDE.md regla 4 y 5):
  - Las geometrías son INVENTADAS: rectángulos de 90 x 60 m. No son las hazas de la oficina (decisión 12), ni parcelas
    del catastro, ni nada de la explotación. Los nombres dicen «(de prueba, inventada)» y el GeoJSON lleva "sintetico": true.
  - Solo se usa del índice el contorno de las copas (posiciones LiDAR ya publicables) para saber DÓNDE caen; nada de él se copia.
  - No se generan olivos ni datos agronómicos: sin recuentos declarados ni NDVI (null). La ficha lo dirá.
  - La salida va a una carpeta fuera del repo o a pruebas/salida/ (ignorada); nunca se versiona.

Uso:
  python tuberia/hazas/de_prueba.py --indice <indice.json> --salida <carpeta> [--n 4]
  → <carpeta>/hazas.prueba.geojson y <carpeta>/hazas.sql (idempotente; no toca hogar_id ni olivos)
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carga_hazas  # noqa: E402  (mismo directorio)

ANCHO, ALTO = 90.0, 60.0
# puntos fijos (fracción del reparto de x e y de las copas) donde se intenta poner cada haza; se salta la que solape otra
CUANTILES = [(0.35, 0.35), (0.65, 0.35), (0.35, 0.65), (0.65, 0.65), (0.5, 0.5), (0.2, 0.5), (0.8, 0.5), (0.5, 0.2), (0.5, 0.8)]
NOMBRES = ["Haza de prueba uno", "Haza de prueba dos", "Haza de prueba tres", "Haza de prueba cuatro", "Haza de prueba cinco"]


def _cuantil(valores, q):
    v = sorted(valores)
    return v[min(len(v) - 1, int(q * len(v)))]


def _solapa(a, b):
    return not (a[1] <= b[0] or b[1] <= a[0] or a[3] <= b[2] or b[3] <= a[2])


def hazas_de_prueba(indice, n=4):
    copas = indice.get("copas") or []
    if len(copas) < 10:
        raise carga_hazas.ErrorDeEntrada("el índice no trae copas (¿es de una finca con LiDAR?): no hay dónde colocar hazas de prueba")
    cx, cy = indice["centro_utm"]
    finca = indice["finca_id"]
    xs, ys = [c[0] for c in copas], [c[1] for c in copas]
    cajas = []                      # (x0, x1, y0, y1) relativas a centro_utm
    for qx, qy in CUANTILES:
        if len(cajas) >= n:
            break
        px, py = _cuantil(xs, qx), _cuantil(ys, qy)
        # la copa más cercana a ese punto: la haza se centra en un olivo medido, no en un claro
        c = min(copas, key=lambda k: (k[0] - px) ** 2 + (k[1] - py) ** 2)
        caja = (c[0] - ANCHO / 2, c[0] + ANCHO / 2, c[1] - ALTO / 2, c[1] + ALTO / 2)
        if any(_solapa(caja, o) for o in cajas):
            continue
        cajas.append(caja)
    if len(cajas) < n:
        raise carga_hazas.ErrorDeEntrada("no caben %d hazas de prueba sin solaparse (caben %d)" % (n, len(cajas)))
    feats = []
    for i, (x0, x1, y0, y1) in enumerate(cajas):
        a, b, c, d = round(cx + x0, 1), round(cx + x1, 1), round(cy + y0, 1), round(cy + y1, 1)
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [[[a, c], [b, c], [b, d], [a, d], [a, c]]]},
            "properties": {
                "codigo": "H-D%02d" % (i + 1),
                "nombre": NOMBRES[i % len(NOMBRES)] + " (de prueba, inventada)",
                "finca": finca,
                "parcelas_ot": [],
                "olivos_declarados": None,
                "olivos_declarados_fuente": None,
                "ndvi_relativo": None,
                "ndvi_fecha": None,
                "ndvi_fuente": None,
            },
        })
    return {"type": "FeatureCollection", "srs": carga_hazas.SRS, "sintetico": True, "features": feats}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", required=True, help="indice.json de la finca que se sirve (real o no)")
    ap.add_argument("--salida", required=True, help="carpeta de salida (fuera del repo o pruebas/salida/)")
    ap.add_argument("--n", type=int, default=4, help="cuántas hazas (1-5)")
    a = ap.parse_args(argv)
    if not 1 <= a.n <= 5:
        print("error: --n entre 1 y 5", file=sys.stderr)
        return 1
    try:
        with open(a.indice, encoding="utf-8") as f:
            hazas = hazas_de_prueba(json.load(f), a.n)
    except (carga_hazas.ErrorDeEntrada, OSError, KeyError, json.JSONDecodeError) as e:
        print("error: " + str(e), file=sys.stderr)
        return 1
    os.makedirs(a.salida, exist_ok=True)
    ruta = os.path.join(a.salida, "hazas.prueba.geojson")
    with open(ruta, "w", encoding="utf-8", newline="\n") as f:
        json.dump(hazas, f, ensure_ascii=False, indent=1)
    return carga_hazas.main(["--hazas", ruta, "--salida", os.path.join(a.salida, "hazas.sql")])


if __name__ == "__main__":
    sys.exit(main())
