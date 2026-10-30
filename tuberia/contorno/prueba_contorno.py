"""Prueba SINTÉTICA de contorno_finca.py, sin red: fabrica las respuestas de SIGPAC (GeoJSON en CRS84) y del Catastro (GML 3.2 en
EPSG:25830) de unas parcelas inventadas (provincia 99, que no existe) alrededor de un punto de mentira y comprueba la unión, la proyección,
el cierre de rendijas, el SQL y los rechazos. La lanza pruebas/guardianes/contorno.test.js; imprime «ok» y sale con 0 si todo va bien.

Uso: python tuberia/contorno/prueba_contorno.py
"""
import json
import os
import shutil
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import contorno_finca as C  # noqa: E402

from pyproj import Transformer  # noqa: E402
from shapely.geometry import shape  # noqa: E402

AQUI = os.path.dirname(os.path.abspath(__file__))
EJEMPLO = os.path.join(AQUI, "ejemplo")
E0, N0 = 430000.0, 4180000.0          # nada de esto es real
A_LONLAT = Transformer.from_crs("EPSG:25830", "OGC:CRS84", always_xy=True)


def rect(x0, y0, x1, y1):
    return [(E0 + x0, N0 + y0), (E0 + x1, N0 + y0), (E0 + x1, N0 + y1), (E0 + x0, N0 + y1), (E0 + x0, N0 + y0)]


def lonlat(anillo):
    xs, ys = A_LONLAT.transform([q[0] for q in anillo], [q[1] for q in anillo])
    return [[x, y] for x, y in zip(xs, ys)]


def fc_sigpac(*anillos):
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"recinto": i + 1}, "geometry": {"type": "Polygon", "coordinates": [lonlat(a)]}} for i, a in enumerate(anillos)]}


def gml(refcat, exterior, interior=None):
    pl = lambda an: " ".join("%.2f %.2f" % q for q in an)  # noqa: E731
    hueco = "<gml:interior><gml:LinearRing><gml:posList srsDimension=\"2\">%s</gml:posList></gml:LinearRing></gml:interior>" % pl(interior) if interior else ""
    return ("""<?xml version="1.0" encoding="ISO-8859-1"?>
<FeatureCollection xmlns:gml="http://www.opengis.net/gml/3.2" xmlns:cp="http://inspire.ec.europa.eu/schemas/cp/4.0" xmlns="http://www.opengis.net/wfs/2.0" numberMatched="1" numberReturned="1">
<member><cp:CadastralParcel gml:id="ES.SDGC.CP.%s"><cp:geometry>
<gml:MultiSurface srsName="http://www.opengis.net/def/crs/EPSG/0/25830"><gml:surfaceMember><gml:Surface srsName="http://www.opengis.net/def/crs/EPSG/0/25830"><gml:patches><gml:PolygonPatch>
<gml:exterior><gml:LinearRing><gml:posList srsDimension="2">%s</gml:posList></gml:LinearRing></gml:exterior>%s
</gml:PolygonPatch></gml:patches></gml:Surface></gml:surfaceMember></gml:MultiSurface>
</cp:geometry><cp:nationalCadastralReference>%s</cp:nationalCadastralReference></cp:CadastralParcel></member></FeatureCollection>"""
            % (refcat, pl(exterior), hueco, refcat)).encode("iso-8859-1")


def corre(*args):
    return C.main(list(args))


def main():
    tmp = tempfile.mkdtemp(prefix="gemelo-contorno-")
    try:
        return prueba(tmp)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def prueba(tmp):
    resp = os.path.join(tmp, "respuestas")
    os.makedirs(resp)

    # --- SIGPAC: la parcela 1 (200 × 100) y la 2 (dos recintos, 200 × 100 en total) separadas por una rendija de 0,3 m; la 3, aparte
    sig = json.load(open(os.path.join(EJEMPLO, "parcelas.sigpac.sintetico.json"), encoding="utf-8"))
    k = [C.clave("sigpac", p) for p in sig["parcelas"]]
    json.dump(fc_sigpac(rect(0, 0, 200, 100)), open(os.path.join(resp, k[0] + ".json"), "w"))
    json.dump(fc_sigpac(rect(200.3, 0, 300, 100), rect(300, 0, 400.3, 100)), open(os.path.join(resp, k[1] + ".json"), "w"))
    json.dump(fc_sigpac(rect(1000, 1000, 1050, 1040)), open(os.path.join(resp, k[2] + ".json"), "w"))
    salida, sql = os.path.join(tmp, "c.geojson"), os.path.join(tmp, "c.sql")
    assert corre("--parcelas", os.path.join(EJEMPLO, "parcelas.sigpac.sintetico.json"), "--desde", resp, "--salida", salida, "--sql", sql, "--fecha", "2026-10-30") == 0
    fc = json.load(open(salida, encoding="utf-8"))
    assert fc["srs"] == "EPSG:25830" and fc["sintetico"] is True and len(fc["features"]) == 1
    f = fc["features"][0]
    g = shape(f["geometry"])
    assert f["geometry"]["type"] == "MultiPolygon"
    assert len(g.geoms) == 2, "la rendija de 0,3 m se cierra (un polígono) y la parcela 3 queda aparte: %d" % len(g.geoms)
    grande = max(g.geoms, key=lambda p: p.area)
    assert len(grande.interiors) == 0, "sin rendija como hueco"
    assert abs(grande.area - 400.3 * 100) < 5, "superficie de la unión %.1f" % grande.area
    bx = grande.bounds
    assert abs(bx[0] - E0) < 0.05 and abs(bx[1] - N0) < 0.05 and abs(bx[2] - (E0 + 400.3)) < 0.05, "proyección CRS84 → 25830 al centímetro: %r" % (bx,)
    for an in f["geometry"]["coordinates"][0]:
        for q in an:
            assert round(q[0], 2) == q[0] and round(q[1], 2) == q[1], "al centímetro"
    p = f["properties"]
    assert p == {**p, "finca": "prueba", "fuente": "sigpac", "consultado_en": "2026-10-30", "parcelas": 3, "recintos": 4}
    assert "FEGA" in p["atribucion"] and "CC BY 4.0" in p["atribucion"]
    assert abs(p["superficie_ha"] - (40030 + 2000) / 10000) < 0.001
    texto = open(salida, encoding="utf-8").read()
    assert "999" not in json.dumps(p) and "poligono" not in texto, "la salida no lleva las referencias de las parcelas"
    s = open(sql, encoding="utf-8").read()
    assert "SELECT fincas_contorno_carga('prueba', $gemelo_contorno${\"type\":\"MultiPolygon\"" in s
    assert "'sigpac', DATE '2026-10-30', 3, NULL);" in s and "'tuberia.contorno_cargado'" in s and s.startswith("--") and "BEGIN;" in s and "COMMIT;" in s

    # --- sin cierre, la rendija sigue (tres polígonos)
    assert corre("--parcelas", os.path.join(EJEMPLO, "parcelas.sigpac.sintetico.json"), "--desde", resp, "--salida", salida, "--cierre", "0") == 0
    assert len(json.load(open(salida, encoding="utf-8"))["features"][0]["geometry"]["coordinates"]) == 3

    # --- Catastro: dos parcelas que comparten linde, una con un hueco de 10 × 10
    cat = json.load(open(os.path.join(EJEMPLO, "parcelas.catastro.sintetico.json"), encoding="utf-8"))
    kc = [C.clave("catastro", p) for p in cat["parcelas"]]
    open(os.path.join(resp, kc[0] + ".xml"), "wb").write(gml(cat["parcelas"][0]["refcat"], rect(0, 0, 100, 100), rect(40, 40, 50, 50)))
    open(os.path.join(resp, kc[1] + ".xml"), "wb").write(gml(cat["parcelas"][1]["refcat"], rect(100, 0, 150, 100)))
    assert corre("--parcelas", os.path.join(EJEMPLO, "parcelas.catastro.sintetico.json"), "--desde", resp, "--salida", salida, "--sql", sql, "--fecha", "2026-10-30") == 0
    f = json.load(open(salida, encoding="utf-8"))["features"][0]
    g = shape(f["geometry"])
    assert len(g.geoms) == 1 and len(g.geoms[0].interiors) == 1, "una pieza con su hueco"
    assert abs(g.area - (15000 - 100)) < 1, "superficie %.1f" % g.area
    assert "Catastro" in f["properties"]["atribucion"]

    # --- rechazos (salida 2, sin traza)
    def mal(datos, *extra):
        r = os.path.join(tmp, "mal.json")
        json.dump(datos, open(r, "w", encoding="utf-8"))
        return corre("--parcelas", r, "--desde", resp, "--salida", salida, *extra)
    assert mal({"finca": "prueba", "parcelas": sig["parcelas"]}) == 2, "sin fuente no se elige por nadie"
    assert mal({"finca": "prueba", "fuente": "osm", "parcelas": sig["parcelas"]}) == 2
    assert mal({"finca": "prueba", "fuente": "catastro", "parcelas": [{"refcat": "corta"}]}) == 2
    assert mal({"finca": "prueba", "fuente": "catastro", "parcelas": sig["parcelas"]}) == 2, "parcelas SIGPAC con fuente catastro"
    assert mal({"finca": "Prueba Mala", "fuente": "sigpac", "parcelas": sig["parcelas"]}) == 2
    assert mal({"finca": "prueba", "fuente": "sigpac", "parcelas": [sig["parcelas"][0], sig["parcelas"][0]]}) == 2, "repetidas"
    assert mal({"finca": "prueba", "fuente": "sigpac", "parcelas": [{**sig["parcelas"][0], "parcela": 77}]}) == 2, "sin respuesta grabada"
    assert mal(sig, "--fecha", "2026-13-01") == 2
    assert corre("--salida", salida) == 2 or os.environ.get("GEMELO_CONTORNO_PARCELAS"), "sin parcelas"
    # una respuesta del Catastro con error
    open(os.path.join(resp, kc[0] + ".xml"), "wb").write(b'<?xml version="1.0"?><ExceptionReport><Exception><ExceptionText>no existe</ExceptionText></Exception></ExceptionReport>')
    assert mal(cat) == 2
    # SIGPAC con coordenadas que no son lon/lat (otro CRS por defecto)
    json.dump({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [[[E0, N0], [E0 + 1, N0], [E0, N0 + 1], [E0, N0]]]}}]},
              open(os.path.join(resp, k[0] + ".json"), "w"))
    assert mal(sig) == 2
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
