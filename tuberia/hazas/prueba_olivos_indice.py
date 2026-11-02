"""Prueba (sin base de datos, sin red) de la carga de olivos desde el indice.json de una finca (OF3e).

Cubre: parseo del índice a filas con (finca, copas_id), posición UTM y altura; idempotencia (misma entrada, mismo SQL, y SQL con
upsert por id_estable); errores claros (sin copas_id, repetidos, longitudes, fuera de rango); y, si existe, el fixture sintético
(`npm run fixture` → pruebas/salida/fixture/hituelo/indice.json; ruta por GEMELO_FIXTURE si se quiere otra).
La carga real a PostGIS está en apps/api/pruebas/integracion/olivos_indice.test.ts (necesita Docker).

Uso: python -P -E tuberia/hazas/prueba_olivos_indice.py
"""
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import carga_hazas  # noqa: E402

MINI = {
    "finca_id": "sint", "centro_utm": [500000, 4100000],
    "copas": [[1.5, 2.25, 4.0, [1] * 8, 1], [10.0, -3.0, 5.126, [1] * 8, 0], [0.0, 0.0, 3.0, [1] * 8, 1]],
    "copas_id": [7, 4294967295, 2147483650], "copas_tipo": [-1, 0, -1],
}


def falla(indice, texto, **kw):
    try:
        carga_hazas.olivos_desde_indice(indice, **kw)
    except carga_hazas.ErrorDeEntrada as e:
        assert texto in str(e), "mensaje inesperado: " + str(e)
        return
    raise AssertionError("debía fallar con «" + texto + "»")


def main():
    o = carga_hazas.olivos_desde_indice(MINI)
    f = o["features"]
    assert o["srs"] == "EPSG:25830" and len(f) == 3
    assert f[0]["properties"] == {"id_estable": "sint:7", "fuente": "lidar", "tipo": -1, "altura_m": 4.0}
    assert f[0]["geometry"]["coordinates"] == [500001.5, 4100002.25]
    assert f[1]["properties"]["id_estable"] == "sint:4294967295" and f[1]["properties"]["tipo"] == 0 and f[1]["properties"]["altura_m"] == 5.13
    assert f[2]["properties"]["id_estable"] == "sint:2147483650"
    # el resultado cumple el esquema de la carga
    from jsonschema import Draft7Validator
    assert not list(Draft7Validator(carga_hazas.ESQUEMA_OLIVOS).iter_errors(o))

    # idempotente: la misma entrada da el mismo SQL, y el SQL es un upsert por id_estable que rellena finca y copas_id
    assert json.dumps(carga_hazas.olivos_desde_indice(MINI)) == json.dumps(o)
    s1, s2 = carga_hazas.genera_sql(None, o), carga_hazas.genera_sql(None, carga_hazas.olivos_desde_indice(MINI))
    assert s1 == s2
    assert "ON CONFLICT (id_estable) DO UPDATE" in s1 and "INSERT INTO olivos (id_estable, finca, copas_id," in s1
    assert "INSERT INTO hazas" not in s1, "solo olivos: no toca las hazas"
    assert "(regexp_match(" in s1 and "{1,32}" in s1, "las llaves del regex no se han escapado mal"

    # errores
    sin = {k: v for k, v in MINI.items() if k != "copas_id"}
    falla(sin, "no tiene copas_id")
    assert len(carga_hazas.olivos_desde_indice(sin, exige_ids=False)["features"]) == 3  # solo el fixture sintético
    falla(dict(MINI, copas_id=[1, 1, 2]), "repetidos")
    falla(dict(MINI, copas_id=[1, 2]), "misma longitud")
    falla(dict(MINI, copas_id=[1, 2, 4294967296]), "fuera de [0, 2^32)")
    falla(dict(MINI, copas_id=[1, 2, -1]), "fuera de [0, 2^32)")
    falla(dict(MINI, copas_id=[1, 2, 1.5]), "fuera de [0, 2^32)")
    falla(dict(MINI, copas_tipo=[-1]), "copas_tipo")
    falla(dict(MINI, finca_id="Mal Id"), "finca_id no válido")
    falla({"copas": []}, "finca_id")

    # de punta a punta por la línea de órdenes
    with tempfile.TemporaryDirectory() as d:
        ruta, sal = os.path.join(d, "indice.json"), os.path.join(d, "o.sql")
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(MINI, fh)
        assert carga_hazas.main(["--olivos-indice", ruta, "--salida", sal]) == 0
        with open(sal, encoding="utf-8") as fh:
            assert fh.read() == s1
        with open(ruta, "w", encoding="utf-8") as fh:
            json.dump(sin, fh)
        assert carga_hazas.main(["--olivos-indice", ruta, "--salida", sal]) == 1

    # el fixture sintético, si está generado
    raiz = os.environ.get("GEMELO_RAIZ") or os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    fx = os.environ.get("GEMELO_FIXTURE") or os.path.join(raiz, "pruebas", "salida", "fixture", "hituelo", "indice.json")
    if os.path.exists(fx):
        with open(fx, encoding="utf-8") as fh:
            ind = json.load(fh)
        assert ind.get("copas_id"), "el fixture de Hituelo debe llevar copas_id (CONTRATOS §1.1)"
        r = carga_hazas.olivos_desde_indice(ind)["features"]
        assert len(r) == len(ind["copas"]) == len(ind["copas_id"])
        assert len({x["properties"]["id_estable"] for x in r}) == len(r)
        print("fixture: %d olivos con copas_id" % len(r))
    else:
        print("fixture no generado (npm run fixture): esa parte NO se ha comprobado")
    print("ok")


if __name__ == "__main__":
    main()
