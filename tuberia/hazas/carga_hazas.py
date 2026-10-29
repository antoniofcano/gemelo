"""Carga de hazas (y, si se dan, olivos) de GeoJSON a SQL para la api (fase F1a).

Las hazas las dibuja y asigna la oficina (decisión 12): este script solo lleva su GEOMETRÍA y sus datos agronómicos a
la tabla `hazas`; NUNCA toca `hogar_id` (la asignación se hace en el panel, /api/admin/hazas/{id}/hogar), así que
recargar no deshace asignaciones. El SQL es idempotente (ON CONFLICT por `codigo` e `id_estable`).

Entrada (EPSG:25830, la misma que el motor):
  hazas:  FeatureCollection con "srs": "EPSG:25830"; cada Feature Polygon|MultiPolygon con properties
          codigo, nombre, finca, parcelas_ot [{id, ha}], olivos_declarados, olivos_declarados_fuente,
          ndvi_relativo, ndvi_fecha, ndvi_fuente (los cuatro últimos pueden ser null). Nada más: no hay sitio
          para el titular ni para datos de personas (additionalProperties: false).
  olivos: FeatureCollection de Point con properties id_estable, fuente (lidar|dron|campo), tipo (-1 = sin tipo), altura_m.

Uso:
  python tuberia/hazas/carga_hazas.py --hazas hazas.geojson [--olivos olivos.geojson] --salida hazas.sql
  psql -v ON_ERROR_STOP=1 -f hazas.sql        (con el usuario de la api o el dueño)

Los datos reales NO van al repo (CLAUDE.md regla 4): el ejemplo de tuberia/hazas/ejemplo/ es sintético.
"""
import argparse
import json
import os
import sys

from jsonschema import Draft7Validator

SRS = "EPSG:25830"
ETIQUETA = "$gemelo_datos$"

_ANILLO = {"type": "array", "minItems": 4, "items": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "number"}}}
_POLIGONO = {"type": "array", "minItems": 1, "items": _ANILLO}

ESQUEMA_HAZAS = {
    "type": "object",
    "required": ["type", "srs", "features"],
    "properties": {
        "type": {"const": "FeatureCollection"},
        "srs": {"const": SRS},
        "sintetico": {"type": "boolean"},
        "features": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["type", "geometry", "properties"],
                "additionalProperties": False,
                "properties": {
                    "type": {"const": "Feature"},
                    "geometry": {
                        "oneOf": [
                            {"type": "object", "additionalProperties": False, "required": ["type", "coordinates"],
                             "properties": {"type": {"const": "Polygon"}, "coordinates": _POLIGONO}},
                            {"type": "object", "additionalProperties": False, "required": ["type", "coordinates"],
                             "properties": {"type": {"const": "MultiPolygon"}, "coordinates": {"type": "array", "minItems": 1, "items": _POLIGONO}}},
                        ]
                    },
                    "properties": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["codigo", "nombre", "finca", "parcelas_ot"],
                        "properties": {
                            "codigo": {"type": "string", "pattern": "^[A-Za-z0-9_-]{1,32}$"},
                            "nombre": {"type": "string", "minLength": 1, "maxLength": 60},
                            "finca": {"type": "string", "pattern": "^[a-z0-9_-]{1,32}$"},
                            "parcelas_ot": {
                                "type": "array",
                                "items": {
                                    "type": "object", "additionalProperties": False, "required": ["id"],
                                    "properties": {"id": {"type": "string", "pattern": "^[A-Za-z0-9:_.-]{1,64}$"},
                                                   "ha": {"type": ["number", "null"], "exclusiveMinimum": 0}},
                                },
                            },
                            "olivos_declarados": {"type": ["integer", "null"], "minimum": 0},
                            "olivos_declarados_fuente": {"type": ["string", "null"], "maxLength": 80},
                            "ndvi_relativo": {"type": ["number", "null"], "minimum": -1, "maximum": 1},
                            "ndvi_fecha": {"type": ["string", "null"], "pattern": "^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},
                            "ndvi_fuente": {"type": ["string", "null"], "maxLength": 80},
                        },
                    },
                },
            },
        },
    },
}

ESQUEMA_OLIVOS = {
    "type": "object",
    "required": ["type", "srs", "features"],
    "properties": {
        "type": {"const": "FeatureCollection"},
        "srs": {"const": SRS},
        "sintetico": {"type": "boolean"},
        "features": {
            "type": "array",
            "items": {
                "type": "object", "required": ["type", "geometry", "properties"], "additionalProperties": False,
                "properties": {
                    "type": {"const": "Feature"},
                    "geometry": {"type": "object", "additionalProperties": False, "required": ["type", "coordinates"],
                                 "properties": {"type": {"const": "Point"}, "coordinates": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "number"}}}},
                    "properties": {
                        "type": "object", "additionalProperties": False, "required": ["id_estable", "fuente"],
                        "properties": {
                            "id_estable": {"type": "string", "pattern": "^[A-Za-z0-9:_.-]{1,64}$"},
                            "fuente": {"enum": ["lidar", "dron", "campo"]},
                            "tipo": {"type": "integer", "minimum": -1},
                            "altura_m": {"type": ["number", "null"], "minimum": 0, "maximum": 40},
                        },
                    },
                },
            },
        },
    },
}


class ErrorDeEntrada(Exception):
    pass


def lee_y_valida(ruta, esquema, nombre):
    with open(ruta, encoding="utf-8") as f:
        datos = json.load(f)
    errores = sorted(Draft7Validator(esquema).iter_errors(datos), key=lambda e: list(e.absolute_path))
    if errores:
        detalle = "; ".join("/".join(str(p) for p in e.absolute_path) + ": " + e.message for e in errores[:10])
        raise ErrorDeEntrada(nombre + " no cumple el esquema: " + detalle)
    return datos


def comprueba_unicos(features, clave, nombre):
    vistos = set()
    for f in features:
        k = f["properties"][clave]
        if k in vistos:
            raise ErrorDeEntrada(nombre + ": " + clave + " repetido: " + k)
        vistos.add(k)


def literal(datos):
    """JSON como literal de PostgreSQL entre dólares: sin escapes que se puedan equivocar."""
    texto = json.dumps(datos, ensure_ascii=False, separators=(",", ":"))
    if ETIQUETA in texto:
        raise ErrorDeEntrada("la entrada contiene la etiqueta reservada " + ETIQUETA)
    return ETIQUETA + texto + ETIQUETA + "::jsonb"


SQL_HAZAS = """
WITH f AS (SELECT jsonb_array_elements({datos} -> 'features') AS f)
INSERT INTO hazas (codigo, nombre, finca, geom, olivos_declarados, olivos_declarados_fuente, ndvi_relativo, ndvi_fecha, ndvi_fuente)
SELECT f -> 'properties' ->> 'codigo', f -> 'properties' ->> 'nombre', f -> 'properties' ->> 'finca',
       ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON(f -> 'geometry'), 25830)),
       (f -> 'properties' ->> 'olivos_declarados')::int, f -> 'properties' ->> 'olivos_declarados_fuente',
       (f -> 'properties' ->> 'ndvi_relativo')::numeric, (f -> 'properties' ->> 'ndvi_fecha')::date, f -> 'properties' ->> 'ndvi_fuente'
  FROM f
ON CONFLICT (codigo) DO UPDATE SET
  nombre = EXCLUDED.nombre, finca = EXCLUDED.finca, geom = EXCLUDED.geom,
  olivos_declarados = EXCLUDED.olivos_declarados, olivos_declarados_fuente = EXCLUDED.olivos_declarados_fuente,
  ndvi_relativo = EXCLUDED.ndvi_relativo, ndvi_fecha = EXCLUDED.ndvi_fecha, ndvi_fuente = EXCLUDED.ndvi_fuente,
  actualizada_en = now();

-- reparto haza ↔ parcelas de OlivarTrack: lo que ya no figura se quita (y con ello sus eventos, por la FK)
CREATE TEMP TABLE _hp ON COMMIT DROP AS
SELECT h.id AS haza_id, p ->> 'id' AS parcela_ot, (p ->> 'ha')::numeric AS ha
  FROM jsonb_array_elements({datos} -> 'features') AS f
  JOIN hazas h ON h.codigo = f -> 'properties' ->> 'codigo'
  CROSS JOIN LATERAL jsonb_array_elements(f -> 'properties' -> 'parcelas_ot') AS p;
DELETE FROM haza_parcela hp
 USING hazas h
 WHERE hp.haza_id = h.id AND h.codigo IN (SELECT f -> 'properties' ->> 'codigo' FROM jsonb_array_elements({datos} -> 'features') AS f)
   AND NOT EXISTS (SELECT 1 FROM _hp WHERE _hp.haza_id = hp.haza_id AND _hp.parcela_ot = hp.parcela_ot);
INSERT INTO haza_parcela (haza_id, parcela_ot, ha_compartidas)
SELECT haza_id, parcela_ot, ha FROM _hp
ON CONFLICT (haza_id, parcela_ot) DO UPDATE SET ha_compartidas = EXCLUDED.ha_compartidas;
"""

SQL_OLIVOS = """
WITH f AS (SELECT jsonb_array_elements({datos} -> 'features') AS f)
INSERT INTO olivos (id_estable, geom, tipo, fuente, altura_m)
SELECT f -> 'properties' ->> 'id_estable',
       ST_SetSRID(ST_MakePoint((f -> 'geometry' -> 'coordinates' ->> 0)::float8, (f -> 'geometry' -> 'coordinates' ->> 1)::float8), 25830),
       coalesce((f -> 'properties' ->> 'tipo')::smallint, -1), f -> 'properties' ->> 'fuente', (f -> 'properties' ->> 'altura_m')::numeric
  FROM f
ON CONFLICT (id_estable) DO UPDATE SET geom = EXCLUDED.geom, tipo = EXCLUDED.tipo, fuente = EXCLUDED.fuente, altura_m = EXCLUDED.altura_m;
"""


def genera_sql(hazas, olivos=None):
    comprueba_unicos(hazas["features"], "codigo", "hazas")
    partes = ["-- generado por tuberia/hazas/carga_hazas.py; idempotente", "BEGIN;", SQL_HAZAS.format(datos=literal(hazas))]
    if olivos is not None:
        comprueba_unicos(olivos["features"], "id_estable", "olivos")
        if olivos["features"]:
            partes.append(SQL_OLIVOS.format(datos=literal(olivos)))
    partes.append("COMMIT;\n")
    return "\n".join(partes)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--hazas", required=True, help="GeoJSON de hazas en EPSG:25830")
    ap.add_argument("--olivos", help="GeoJSON de olivos (puntos) en EPSG:25830")
    ap.add_argument("--salida", required=True, help="fichero .sql de salida")
    a = ap.parse_args(argv)
    try:
        hazas = lee_y_valida(a.hazas, ESQUEMA_HAZAS, "hazas")
        olivos = lee_y_valida(a.olivos, ESQUEMA_OLIVOS, "olivos") if a.olivos else None
        sql = genera_sql(hazas, olivos)
    except (ErrorDeEntrada, OSError, json.JSONDecodeError) as e:
        print("error: " + str(e), file=sys.stderr)
        return 1
    carpeta = os.path.dirname(os.path.abspath(a.salida))
    os.makedirs(carpeta, exist_ok=True)
    with open(a.salida, "w", encoding="utf-8", newline="\n") as f:
        f.write(sql)
    n_ol = len(olivos["features"]) if olivos else 0
    print(json.dumps({"hazas": len(hazas["features"]), "olivos": n_ol, "salida": os.path.basename(a.salida)}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
