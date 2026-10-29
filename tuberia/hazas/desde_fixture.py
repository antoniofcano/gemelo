"""Hazas y olivos SINTÉTICOS que encajan en el mundo del fixture (para el entorno local de infra/dev).

El fixture (pruebas/genera_fixture.py) inventa un Hituelo de dos teselas con dos parcelas y 140 olivos. Este script
lo traduce a lo que carga la api: cada parcela se parte en dos hazas (H-D01…H-D04) y cada copa pasa a ser un olivo
con su id estable. Coordenadas absolutas en EPSG:25830 (centro_utm + las relativas del índice), así las lindes de la
api caen encima del mundo que pinta el motor. Luego genera el SQL idempotente con carga_hazas.py.

Solo acepta un índice SINTÉTICO (paisaje.fuente == "sintético"): las hazas reales las dibuja la oficina (decisión 12)
y nunca salen de un índice ni van al repo (CLAUDE.md regla 4).

Uso:
  python tuberia/hazas/desde_fixture.py --indice pruebas/salida/fixture/hituelo/indice.json --salida <carpeta>
  → <carpeta>/hazas.sintetico.geojson, <carpeta>/olivos.sintetico.geojson y <carpeta>/hazas.sql
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carga_hazas  # noqa: E402  (mismo directorio)

NOMBRES = ["Haza de las Abubillas", "Haza del Pozo", "Haza de la Encina", "Haza del Mirlo"]


def hazas_y_olivos(indice):
    if (indice.get("paisaje") or {}).get("fuente") != "sintético":
        raise carga_hazas.ErrorDeEntrada("el índice no es sintético (paisaje.fuente): este script solo sirve para el fixture")
    cx, cy = indice["centro_utm"]
    finca = indice["finca_id"]
    hazas = []
    for p in indice["parcelas"]:
        xs = [v[0] for v in p["linde"]]
        ys = [v[1] for v in p["linde"]]
        x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
        xm = (x0 + x1) / 2.0
        for a, b in ((x0, xm), (xm, x1)):
            n = len(hazas)
            anillo = [[cx + a, cy + y0], [cx + b, cy + y0], [cx + b, cy + y1], [cx + a, cy + y1], [cx + a, cy + y0]]
            hazas.append({
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [anillo]},
                "properties": {
                    "codigo": "H-D%02d" % (n + 1),
                    "nombre": NOMBRES[n % len(NOMBRES)] + " (sintética)",
                    "finca": finca,
                    "parcelas_ot": [{"id": p["id"], "ha": round(p["ha"] / 2.0, 4)}],
                    "olivos_declarados": int(p["decl"] / 2) if p.get("decl") is not None else None,
                    "olivos_declarados_fuente": "Declaración sintética de ejemplo" if p.get("decl") is not None else None,
                    "ndvi_relativo": round(0.05 * ((n % 3) - 1), 3),
                    "ndvi_fecha": "2026-10-01",
                    "ndvi_fuente": "Sentinel-2 (Copernicus), sintético",
                },
            })
    ids = indice.get("copas_id") or list(range(len(indice["copas"])))
    tipos = indice.get("copas_tipo") or [-1] * len(indice["copas"])
    olivos = [{
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [round(cx + c[0], 2), round(cy + c[1], 2)]},
        "properties": {"id_estable": "%s:%s" % (finca, ids[i]), "fuente": "lidar", "tipo": int(tipos[i]), "altura_m": c[2]},
    } for i, c in enumerate(indice["copas"])]
    col = lambda fs: {"type": "FeatureCollection", "srs": carga_hazas.SRS, "sintetico": True, "features": fs}  # noqa: E731
    return col(hazas), col(olivos)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--indice", required=True, help="indice.json del fixture (sintético)")
    ap.add_argument("--salida", required=True, help="carpeta de salida")
    a = ap.parse_args(argv)
    try:
        with open(a.indice, encoding="utf-8") as f:
            hazas, olivos = hazas_y_olivos(json.load(f))
    except (carga_hazas.ErrorDeEntrada, OSError, KeyError, json.JSONDecodeError) as e:
        print("error: " + str(e), file=sys.stderr)
        return 1
    os.makedirs(a.salida, exist_ok=True)
    rutas = {}
    for nombre, datos in (("hazas", hazas), ("olivos", olivos)):
        rutas[nombre] = os.path.join(a.salida, nombre + ".sintetico.geojson")
        with open(rutas[nombre], "w", encoding="utf-8", newline="\n") as f:
            json.dump(datos, f, ensure_ascii=False, indent=1)
    # el cargador valida con su esquema y escribe el SQL (e imprime su resumen en JSON)
    return carga_hazas.main(["--hazas", rutas["hazas"], "--olivos", rutas["olivos"], "--salida", os.path.join(a.salida, "hazas.sql")])


if __name__ == "__main__":
    sys.exit(main())
