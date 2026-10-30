"""Contorno de una finca a partir de sus parcelas, desde una fuente PÚBLICA oficial (OF3b, decisión 140).

El contorno es la UNIÓN de las parcelas de la finca, en ETRS89 / UTM 30N (EPSG:25830, la de la base, el motor y la oficina). Sustituye a la
«caja de los olivos medidos + 150 m» como límite del editor de hazas (migración 0011, tabla fincas_contorno).

Fuentes (las dos verificadas el 2026-10-30; licencias distintas: cuál se usa la decide Antonio, decisión 140; doc/operacion/DATOS.md):
  sigpac    FEGA, OGC API Features «recintos» (https://sigpac-hubcloud.es/ogcapi), CC BY 4.0. Una parcela SIGPAC son sus recintos
            (provincia, municipio, agregado, zona, polígono, parcela). Devuelve GeoJSON en CRS84 (lon, lat): se proyecta con pyproj.
  catastro  Dirección General del Catastro, WFS INSPIRE de parcelas (https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx, consulta GetParcel
            por referencia catastral de 14 caracteres). Devuelve GML 3.2 ya en EPSG:25830. Licencia propia de la DGC: uso libre, también
            comercial, de información TRANSFORMADA; no permite redifundir la original.

Entrada (NUNCA en el repo; son datos de la explotación): un JSON, por --parcelas o GEMELO_CONTORNO_PARCELAS:
  {"finca": "hituelo", "fuente": "sigpac",   "parcelas": [{"provincia": 23, "municipio": 1, "agregado": 0, "zona": 0, "poligono": 1, "parcela": 1}, …]}
  {"finca": "hituelo", "fuente": "catastro", "parcelas": [{"refcat": "23001A00100001"}, …]}
La fuente es obligatoria: el script no elige por nadie.

Salida (fuera del repo), por --salida o GEMELO_CONTORNO: FeatureCollection con "srs": "EPSG:25830" y UN Feature MultiPolygon con
properties finca, fuente, consultado_en, parcelas (cuántas), recintos (cuántos polígonos llegaron), superficie_ha, atribucion. Sin las
referencias. Con --sql, además el SQL que lo carga con psql (fincas_contorno_carga + su línea de auditoría tuberia.contorno_cargado).

La unión cierra las rendijas entre parcelas vecinas (--cierre, 0,5 m por defecto: ensancha y vuelve a encoger) y redondea al centímetro.

Uso:
  GEMELO_CONTORNO_PARCELAS=<parcelas.json> python tuberia/contorno/contorno_finca.py --salida <contorno.geojson> [--sql <contorno.sql>]
  python tuberia/contorno/contorno_finca.py --parcelas <p.json> --desde <carpeta> --salida <c.geojson>
      (--desde: lee las respuestas grabadas, <clave>.json o <clave>.xml, en vez de pedirlas; lo usan las pruebas, sin red)
Requisitos: tuberia/contorno/requirements.txt (shapely, pyproj, jsonschema; versiones fijadas).
"""
import argparse
import datetime
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from jsonschema import Draft7Validator
from pyproj import Transformer
from shapely import set_precision
from shapely.geometry import MultiPolygon, Polygon, mapping, shape
from shapely.ops import unary_union
from shapely.validation import make_valid

SRS = "EPSG:25830"
ETIQUETA = "$gemelo_contorno$"
URL_SIGPAC = "https://sigpac-hubcloud.es/ogcapi/collections/recintos/items"
URL_CATASTRO = "https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx"
ATRIBUCION = {
    "sigpac": "Recintos SIGPAC © Fondo Español de Garantía Agraria (FEGA), CC BY 4.0. Contorno = unión de recintos, transformada por el gemelo.",
    "catastro": "Parcelas catastrales © Dirección General del Catastro (licencia de uso de la DGC). Contorno = unión de parcelas, transformada por el gemelo.",
}
PAUSA_S = 0.5            # entre peticiones: los dos servicios cortan a quien los satura
LIMITE_PAGINA = 1000     # recintos por página de la OGC API

_ENTERO = {"type": "integer", "minimum": 0, "maximum": 99999}
ESQUEMA_PARCELAS = {
    "type": "object",
    "additionalProperties": False,
    "required": ["finca", "fuente", "parcelas"],
    "properties": {
        "finca": {"type": "string", "pattern": "^[a-z0-9_-]{1,32}$"},
        "fuente": {"enum": ["sigpac", "catastro"]},
        "sintetico": {"type": "boolean"},
        "parcelas": {"type": "array", "minItems": 1, "maxItems": 5000},
    },
    "allOf": [
        {"if": {"properties": {"fuente": {"const": "sigpac"}}},
         "then": {"properties": {"parcelas": {"items": {
             "type": "object", "additionalProperties": False,
             "required": ["provincia", "municipio", "poligono", "parcela"],
             "properties": {"provincia": {"type": "integer", "minimum": 1, "maximum": 99}, "municipio": _ENTERO,
                            "agregado": _ENTERO, "zona": _ENTERO, "poligono": _ENTERO, "parcela": _ENTERO}}}}}},
        {"if": {"properties": {"fuente": {"const": "catastro"}}},
         "then": {"properties": {"parcelas": {"items": {
             "type": "object", "additionalProperties": False, "required": ["refcat"],
             "properties": {"refcat": {"type": "string", "pattern": "^[0-9A-Z]{14}$"}}}}}}},
    ],
}


class ErrorDeEntrada(Exception):
    pass


# ---------------------------------------------------------------- entrada
def lee_parcelas(ruta):
    try:
        with open(ruta, encoding="utf-8") as f:
            datos = json.load(f)
    except (OSError, ValueError) as e:
        raise ErrorDeEntrada("no se pudo leer el fichero de parcelas: " + str(e))
    errores = sorted(Draft7Validator(ESQUEMA_PARCELAS).iter_errors(datos), key=lambda e: list(e.path))
    if errores:
        e = errores[0]
        raise ErrorDeEntrada("parcelas no válidas en /" + "/".join(str(p) for p in e.path) + ": " + e.message)
    claves = [clave(datos["fuente"], p) for p in datos["parcelas"]]
    if len(set(claves)) != len(claves):
        raise ErrorDeEntrada("hay parcelas repetidas")
    return datos


def clave(fuente, p):
    """Nombre estable de una parcela (para las respuestas grabadas de --desde)."""
    if fuente == "catastro":
        return "catastro_" + p["refcat"]
    return "sigpac_" + "-".join(str(p.get(k, 0)) for k in ("provincia", "municipio", "agregado", "zona", "poligono", "parcela"))


# ---------------------------------------------------------------- red
def _pide(url):
    req = urllib.request.Request(url, headers={"User-Agent": "gemelo-tuberia-contorno/1", "Accept": "*/*"})
    ultimo = None
    for intento in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read()
        except OSError as e:          # URLError, HTTPError, tiempo agotado
            ultimo = e
            time.sleep(2 * (intento + 1))
    raise ErrorDeEntrada("el servicio no respondió (" + url.split("?")[0] + "): " + str(ultimo))


def url_sigpac(p, desplazamiento=0):
    q = {"f": "json", "limit": LIMITE_PAGINA, "offset": desplazamiento}
    for k in ("provincia", "municipio", "agregado", "zona", "poligono", "parcela"):
        q[k] = p.get(k, 0)
    return URL_SIGPAC + "?" + urllib.parse.urlencode(q)


def url_catastro(refcat):
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "STOREDQUERY_ID": "GetParcel", "refcat": refcat, "srsname": "EPSG::25830"}
    return URL_CATASTRO + "?" + urllib.parse.urlencode(q)


def descarga_sigpac(p):
    """Todos los recintos de una parcela SIGPAC (sigue las páginas), como un FeatureCollection."""
    feats, desp = [], 0
    while True:
        d = json.loads(_pide(url_sigpac(p, desp)))
        trozo = d.get("features") or []
        feats.extend(trozo)
        if len(trozo) < LIMITE_PAGINA:
            return {"type": "FeatureCollection", "features": feats}
        desp += LIMITE_PAGINA
        time.sleep(PAUSA_S)


# ---------------------------------------------------------------- lectura de las respuestas
_A_UTM = Transformer.from_crs("OGC:CRS84", SRS, always_xy=True)


def _a_utm(anillo):
    xs, ys = _A_UTM.transform([q[0] for q in anillo], [q[1] for q in anillo])
    return list(zip(xs, ys))


def poligonos_sigpac(fc):
    """Polígonos (EPSG:25830) de un FeatureCollection de recintos SIGPAC en CRS84 (lon, lat)."""
    salida = []
    for f in fc.get("features") or []:
        g = f.get("geometry") or {}
        if g.get("type") == "Polygon":
            pols = [g["coordinates"]]
        elif g.get("type") == "MultiPolygon":
            pols = g["coordinates"]
        else:
            continue
        for pol in pols:
            ext = pol[0]
            if not all(-20 < q[0] < 10 and 25 < q[1] < 45 for q in ext):
                raise ErrorDeEntrada("SIGPAC devolvió coordenadas que no son lon/lat de España (¿cambió el CRS por defecto?)")
            salida.append(Polygon(_a_utm(ext), [_a_utm(h) for h in pol[1:]]))
    return salida


NS = {"gml": "http://www.opengis.net/gml/3.2", "cp": "http://inspire.ec.europa.eu/schemas/cp/4.0"}


def _pos(texto, dim):
    v = [float(x) for x in texto.split()]
    return [(v[i], v[i + 1]) for i in range(0, len(v) - dim + 1, dim)]


def _anillo(el):
    pl = el.find(".//gml:posList", NS)
    if pl is None:
        raise ErrorDeEntrada("GML del Catastro sin posList")
    return _pos(pl.text or "", int(pl.get("srsDimension", "2")))


def poligonos_catastro(xml_bytes):
    """Polígonos (EPSG:25830) de la respuesta GML 3.2 del WFS INSPIRE del Catastro (GetParcel)."""
    try:
        raiz = ET.fromstring(xml_bytes)
    except ET.ParseError as e:
        raise ErrorDeEntrada("la respuesta del Catastro no es XML: " + str(e))
    if raiz.tag.endswith("ExceptionReport"):
        raise ErrorDeEntrada("el Catastro devolvió un error: " + " ".join(t.strip() for t in raiz.itertext() if t.strip())[:200])
    salida = []
    for parcela in raiz.iter("{%s}CadastralParcel" % NS["cp"]):
        for sup in parcela.iter():
            if sup.tag not in ("{%s}PolygonPatch" % NS["gml"], "{%s}Polygon" % NS["gml"]):
                continue
            srs = next((e.get("srsName") for e in parcela.iter() if e.get("srsName")), "")
            if not srs.endswith("25830"):
                raise ErrorDeEntrada("el Catastro devolvió otro sistema de coordenadas: " + srs)
            ext = sup.find("gml:exterior", NS)
            salida.append(Polygon(_anillo(ext), [_anillo(i) for i in sup.findall("gml:interior", NS)]))
    return salida


# ---------------------------------------------------------------- unión
def une(poligonos, cierre=0.5):
    """Unión de las parcelas: cierra rendijas de hasta 2·cierre m entre vecinas, válida, al centímetro y siempre MultiPolygon."""
    if not poligonos:
        raise ErrorDeEntrada("no llegó ningún polígono: ¿existen esas parcelas en la fuente?")
    u = unary_union([make_valid(p) for p in poligonos])
    if cierre > 0:
        u = u.buffer(cierre, join_style="mitre").buffer(-cierre, join_style="mitre")
    u = make_valid(set_precision(u, 0.01))
    partes = [g for g in getattr(u, "geoms", [u]) if isinstance(g, Polygon) and not g.is_empty and g.area > 0]
    partes += [h for g in getattr(u, "geoms", []) if isinstance(g, MultiPolygon) for h in g.geoms]
    if not partes:
        raise ErrorDeEntrada("la unión salió vacía")
    return MultiPolygon(partes)


def obtiene(datos, desde=None):
    """Polígonos de todas las parcelas: de la red o, con `desde`, de las respuestas grabadas."""
    fuente, pols = datos["fuente"], []
    for i, p in enumerate(datos["parcelas"]):
        k = clave(fuente, p)
        if fuente == "sigpac":
            if desde:
                with open(os.path.join(desde, k + ".json"), encoding="utf-8") as f:
                    fc = json.load(f)
            else:
                fc = descarga_sigpac(p)
            nuevos = poligonos_sigpac(fc)
        else:
            if desde:
                with open(os.path.join(desde, k + ".xml"), "rb") as f:
                    x = f.read()
            else:
                x = _pide(url_catastro(p["refcat"]))
            nuevos = poligonos_catastro(x)
        if not nuevos:
            raise ErrorDeEntrada("la parcela n.º " + str(i + 1) + " no trae geometría en " + fuente + " (¿referencia mal escrita?)")
        pols.extend(nuevos)
        if not desde:
            time.sleep(PAUSA_S)
    return pols


# ---------------------------------------------------------------- salida
def coleccion(datos, mp, recintos, consultado_en):
    g = mapping(mp)
    g = {"type": "MultiPolygon", "coordinates": [[[[round(x, 2), round(y, 2)] for x, y in an] for an in pol] for pol in g["coordinates"]]}
    fc = {
        "type": "FeatureCollection",
        "srs": SRS,
        "features": [{
            "type": "Feature",
            "geometry": g,
            "properties": {
                "finca": datos["finca"], "fuente": datos["fuente"], "consultado_en": consultado_en,
                "parcelas": len(datos["parcelas"]), "recintos": recintos,
                "superficie_ha": round(mp.area / 10000.0, 4), "atribucion": ATRIBUCION[datos["fuente"]],
            },
        }],
    }
    if datos.get("sintetico"):
        fc["sintetico"] = True
    return fc


def genera_sql(fc):
    f = fc["features"][0]
    p = f["properties"]
    geo = json.dumps(f["geometry"], separators=(",", ":"))
    if ETIQUETA in geo:
        raise ErrorDeEntrada("la geometría contiene la etiqueta reservada")
    detalle = json.dumps({"finca": p["finca"], "fuente": p["fuente"], "consultado_en": p["consultado_en"], "parcelas": p["parcelas"],
                          "superficie_ha": p["superficie_ha"]}, separators=(",", ":"))
    return "\n".join([
        "-- generado por tuberia/contorno/contorno_finca.py (OF3b); retira el contorno vigente de la finca y carga este",
        "BEGIN;",
        "SELECT fincas_contorno_carga('%s', %s%s%s, '%s', DATE '%s', %d, NULL);" % (p["finca"], ETIQUETA, geo, ETIQUETA, p["fuente"], p["consultado_en"], p["parcelas"]),
        "INSERT INTO auditoria (hogar_id, accion, detalle) VALUES (NULL, 'tuberia.contorno_cargado', %s%s%s::jsonb);" % (ETIQUETA, detalle, ETIQUETA),
        "COMMIT;",
        "",
    ])


def main(argv=None):
    ap = argparse.ArgumentParser(description="Contorno de una finca (unión de sus parcelas SIGPAC o catastrales) en EPSG:25830")
    ap.add_argument("--parcelas", default=os.environ.get("GEMELO_CONTORNO_PARCELAS"), help="JSON de parcelas (fuera del repo); o GEMELO_CONTORNO_PARCELAS")
    ap.add_argument("--salida", default=os.environ.get("GEMELO_CONTORNO"), help="GeoJSON de salida (fuera del repo); o GEMELO_CONTORNO")
    ap.add_argument("--sql", help="además, el SQL que lo carga con psql")
    ap.add_argument("--desde", help="carpeta con las respuestas grabadas (sin red; para pruebas)")
    ap.add_argument("--cierre", type=float, default=0.5, help="m para cerrar rendijas entre parcelas vecinas (0: sin cierre)")
    ap.add_argument("--fecha", help="fecha de consulta AAAA-MM-DD (por defecto, hoy)")
    a = ap.parse_args(argv)
    try:
        if not a.parcelas or not a.salida:
            raise ErrorDeEntrada("faltan --parcelas (o GEMELO_CONTORNO_PARCELAS) y --salida (o GEMELO_CONTORNO)")
        if not 0 <= a.cierre <= 5:
            raise ErrorDeEntrada("--cierre entre 0 y 5 m")
        fecha = a.fecha or datetime.date.today().isoformat()
        datetime.date.fromisoformat(fecha)
        datos = lee_parcelas(a.parcelas)
        pols = obtiene(datos, a.desde)
        mp = une(pols, a.cierre)
        fc = coleccion(datos, mp, len(pols), fecha)
        with open(a.salida, "w", encoding="utf-8", newline="\n") as f:
            json.dump(fc, f, ensure_ascii=False, separators=(",", ":"))
        if a.sql:
            with open(a.sql, "w", encoding="utf-8", newline="\n") as f:
                f.write(genera_sql(fc))
    except (ErrorDeEntrada, ValueError, OSError) as e:
        print("contorno_finca: " + str(e), file=sys.stderr)
        return 2
    p = fc["features"][0]["properties"]
    print("contorno de %s (%s): %d parcelas, %d recintos, %d polígono(s), %.4f ha" % (p["finca"], p["fuente"], p["parcelas"], p["recintos"], len(mp.geoms), p["superficie_ha"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
