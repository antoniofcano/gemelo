#!/usr/bin/env python3
"""EV-1g «Biodiversidad B0»: aves de GBIF en el cuadro de 10 km alrededor de la finca, por especie y mes (contratos/biodiversidad.schema.json, v 1).

Qué hace: pregunta a la API pública de GBIF (https://api.gbif.org/v1, sin clave) cuántos registros de aves hay en el cuadro, por mes y año, con
LICENCIA DE CADA REGISTRO en CC0, CC BY o CC BY-SA (decisión 198: nada CC BY-NC ni sin licencia clara); agrega especie por mes (nº de registros y
nº de años distintos), guarda de cada conjunto de datos su DOI, su cita y las licencias de lo que se ha contado, y escribe un JSON.

Es DEDUCIDO, no observado en la finca: son registros de ciencia ciudadana y de proyectos de seguimiento en 10 km a la redonda.

Entrada (ninguna coordenada va escrita en el repo):
  --lat y --lon, o --indice <indice.json de la finca> (o GEMELO_DATOS): el centro sale de `centro_utm` (EPSG:25830 -> WGS84, con pyproj).
Salida: --salida o GEMELO_BIODIVERSIDAD (un fichero .json, o una carpeta: dentro va biodiversidad.json). El JSON NO lleva el centro ni el cuadro:
  solo «cuadro_km».
Nombres comunes (opcional): --nombres o GEMELO_BIODIVERSIDAD_NOMBRES = un JSON {"nombre científico": "nombre común"} hecho a mano (GBIF no da
  los nombres comunes con una licencia clara; así no se mezcla nada de licencia dudosa).

Uso:  python tuberia/biodiversidad/gbif_aves.py --indice <indice.json> --salida <carpeta> [--anios 10] [--km 10]
Requisitos: tuberia/biodiversidad/requirements.txt. Hace 12 x años peticiones (120 por defecto) más una por especie y dos por conjunto de datos,
con pausa y reintentos; tarda unos minutos. Las pruebas (prueba_biodiversidad.py) NO tocan la red: inyectan una función `pide` falsa.
"""
import argparse
import datetime
import json
import math
import os
import sys
import time

API = "https://api.gbif.org/v1"
CLASE_AVES = 212                      # classKey de Aves en la columna vertebral de GBIF
LICENCIAS_OK = ("CC0_1_0", "CC_BY_4_0", "CC_BY_SA_4_0")   # decisión 198; GBIF no usa SA hoy, se admite por si aparece. NC fuera
LICENCIAS_CONSULTA = ("CC0_1_0", "CC_BY_4_0")   # lo que la API de GBIF acepta como filtro (CC_BY_SA_4_0 da 400: GBIF no la tiene como licencia); SA sigue admitida al comprobar
BASES = ("HUMAN_OBSERVATION", "OBSERVATION", "MACHINE_OBSERVATION")
UA = "gemelo-biodiversidad/1 (gemelo digital de olivar; lectura de agregados)"
ATRIBUCION = ("Registros de aves de GBIF.org (https://www.gbif.org), de conjuntos de datos con licencia CC0, CC BY o CC BY-SA; "
              "cada conjunto conserva su cita y su DOI en «fuentes». Agregado por especie y mes; no es lo observado en la finca.")


def normaliza_licencia(lic):
    """Valor GBIF (CC_BY_4_0...) o URL de creativecommons -> valor GBIF; lo que no se reconoce, None."""
    if not isinstance(lic, str):
        return None
    s = lic.strip()
    if s in LICENCIAS_OK or s in ("CC_BY_NC_4_0", "UNSPECIFIED", "UNSUPPORTED"):
        return s
    u = s.lower().rstrip("/")
    if "creativecommons.org/publicdomain/zero/1.0" in u:
        return "CC0_1_0"
    if "creativecommons.org/licenses/by-nc" in u:
        return "CC_BY_NC_4_0"
    if "creativecommons.org/licenses/by-sa/" in u:
        return "CC_BY_SA_4_0"
    if "creativecommons.org/licenses/by/" in u:
        return "CC_BY_4_0"
    return None


def licencia_admitida(lic):
    """Solo CC0, CC BY y CC BY-SA (decisión 198). Lo demás (NC, sin especificar, desconocido) no."""
    return normaliza_licencia(lic) in LICENCIAS_OK


def cuadro_wkt(lat, lon, km):
    """POLYGON WKT (sentido antihorario, como pide GBIF) de un cuadro de `km` de lado centrado en (lat, lon). La longitud se achica con cos(lat)."""
    if not (-85 < lat < 85 and -180 <= lon <= 180) or km <= 0:
        raise ValueError("centro o lado del cuadro no válidos")
    dlat = (km / 2) / 111.32
    dlon = (km / 2) / (111.32 * math.cos(math.radians(lat)))
    a, b, c, d = lon - dlon, lat - dlat, lon + dlon, lat + dlat
    pts = [(a, b), (c, b), (c, d), (a, d), (a, b)]
    return "POLYGON((" + ",".join("%.5f %.5f" % p for p in pts) + "))"


def centro_desde_indice(ruta):
    """(lat, lon) del centro_utm de un indice.json (EPSG:25830 -> EPSG:4326)."""
    from pyproj import Transformer
    with open(ruta, encoding="utf-8") as f:
        e, n = json.load(f)["centro_utm"]
    lon, lat = Transformer.from_crs("EPSG:25830", "EPSG:4326", always_xy=True).transform(e, n)
    return lat, lon


def facetas(resp, campo):
    """{nombre: n} de una faceta de la respuesta de occurrence/search (el campo puede venir como SPECIES_KEY o speciesKey)."""
    quiero = campo.replace("_", "").lower()
    for f in (resp or {}).get("facets") or []:
        if str(f.get("field", "")).replace("_", "").lower() == quiero:
            return {str(c["name"]): int(c["count"]) for c in f.get("counts") or []}
    return {}


def agrega(filas):
    """filas = [(especie, mes 1-12, año, n)] -> {especie: [{"n", "anios"} x 12]}: registros y años distintos con registros, por mes. Puro y determinista."""
    reg, anios = {}, {}
    for esp, mes, anio, n in filas:
        if not (1 <= int(mes) <= 12) or int(n) <= 0:
            continue
        k = str(esp)
        reg.setdefault(k, [0] * 12)[int(mes) - 1] += int(n)
        anios.setdefault(k, [set() for _ in range(12)])[int(mes) - 1].add(int(anio))
    return {k: [{"n": reg[k][m], "anios": len(anios[k][m])} for m in range(12)] for k in reg}


def documento(*, filas, nombres, fuentes, anio_desde, anio_hasta, km, fecha, nombres_comunes=None):
    """El JSON del contrato (v 1). `nombres` = {especie: nombre científico}; `fuentes` = lista ya hecha (id, titulo, doi, cita, licencias, registros)."""
    comunes = nombres_comunes or {}
    por = agrega(filas)
    esp = []
    for k in sorted(por, key=lambda k: (-sum(m["n"] for m in por[k]), str(nombres.get(k, k)))):
        cien = nombres.get(k)
        if not cien:
            continue
        e = {"taxon_key": int(k), "nombre_cientifico": cien, "meses": por[k]}
        if comunes.get(cien):
            e["nombre_comun"] = comunes[cien]
        esp.append(e)
    fuentes = sorted((dict(f) for f in fuentes), key=lambda f: (-f["registros"], f["id"]))
    consulta = ("classKey=%d; occurrenceStatus=PRESENT; hasCoordinate=true; hasGeospatialIssue=false; basisOfRecord=%s; license=%s; un cuadro de %s km; años %d-%d"
                % (CLASE_AVES, ",".join(BASES), ",".join(LICENCIAS_OK), km, anio_desde, anio_hasta))
    return {
        "v": 1, "origen": "gbif", "grupo": "aves", "generado": fecha, "cuadro_km": km,
        "anios": {"desde": anio_desde, "hasta": anio_hasta},
        "descarga": {"fecha": fecha, "via": "API pública de GBIF (occurrence/search con facetas)", "consulta": consulta,
                     "cita": "GBIF.org (%s), GBIF Occurrence Data, consulta por la API pública; cada conjunto de datos, con su DOI y su cita en «fuentes»." % fecha},
        "atribucion": ATRIBUCION, "fuentes": fuentes, "especies": esp,
    }


class Gbif:
    """Cliente mínimo de la API de GBIF. `pide(ruta, params) -> dict` se puede inyectar (las pruebas no usan la red)."""

    def __init__(self, pide=None, pausa=0.2, reintentos=4):
        self.pausa, self.reintentos, self._pide = pausa, reintentos, pide

    def pide(self, ruta, params=None):
        if self._pide:
            return self._pide(ruta, params or [])
        import requests          # solo al descargar de verdad
        espera = 1.0
        for intento in range(self.reintentos + 1):
            try:
                r = requests.get(API + ruta, params=params, headers={"User-Agent": UA, "Accept": "application/json"}, timeout=60)
                if r.status_code == 200:
                    time.sleep(self.pausa)
                    return r.json()
                if r.status_code not in (429, 500, 502, 503, 504):
                    r.raise_for_status()
            except requests.RequestException:
                if intento == self.reintentos:
                    raise
            time.sleep(espera)
            espera *= 2
        raise RuntimeError("GBIF no responde: " + ruta)

    def base(self, wkt, **extra):
        p = [("geometry", wkt), ("classKey", CLASE_AVES), ("occurrenceStatus", "PRESENT"), ("hasCoordinate", "true"), ("hasGeospatialIssue", "false"), ("limit", 0)]
        p += [("basisOfRecord", b) for b in BASES] + [("license", lic) for lic in LICENCIAS_CONSULTA]
        return p + list(extra.items())


def descarga(gbif, wkt, anio_desde, anio_hasta, log=lambda s: None):
    """(filas, por_dataset): filas = [(speciesKey, mes, año, n)]; por_dataset = {datasetKey: registros contados}."""
    filas, por_ds = [], {}
    fac = [("facet", "speciesKey"), ("speciesKey.facetLimit", 2000), ("facet", "datasetKey"), ("datasetKey.facetLimit", 500)]
    for anio in range(anio_desde, anio_hasta + 1):
        for mes in range(1, 13):
            r = gbif.pide("/occurrence/search", gbif.base(wkt, year=anio, month=mes) + fac)
            for k, n in facetas(r, "SPECIES_KEY").items():
                filas.append((k, mes, anio, n))
            for k, n in facetas(r, "DATASET_KEY").items():
                por_ds[k] = por_ds.get(k, 0) + n
        log("año %d" % anio)
    return filas, por_ds


def fuentes_de(gbif, wkt, por_ds):
    """Por conjunto de datos: título, DOI, cita y las licencias de los registros contados. Sin licencia admitida, no entra."""
    out = []
    for k, n in por_ds.items():
        d = gbif.pide("/dataset/" + k)
        lic = facetas(gbif.pide("/occurrence/search", gbif.base(wkt, datasetKey=k) + [("facet", "license")]), "LICENSE")
        licencias = sorted({normaliza_licencia(x) for x in lic} & set(LICENCIAS_OK))
        if not licencias:
            continue
        doi = d.get("doi")
        cita = ((d.get("citation") or {}).get("text") or d.get("title") or "").strip()
        out.append({"id": k, "titulo": (d.get("title") or k).strip(), "doi": doi if isinstance(doi, str) and doi else None, "cita": cita,
                    "licencias": licencias, "registros": n})
    return out


def nombres_de(gbif, claves):
    out = {}
    for k in claves:
        s = gbif.pide("/species/" + str(k))
        if s.get("rank") == "SPECIES" and (s.get("canonicalName") or s.get("scientificName")):
            out[str(k)] = s.get("canonicalName") or s["scientificName"]
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--lat", type=float)
    ap.add_argument("--lon", type=float)
    ap.add_argument("--indice", default=os.environ.get("GEMELO_DATOS"), help="indice.json de la finca (o GEMELO_DATOS)")
    ap.add_argument("--marca-indice", action="store_true", help="anota en el indice.json el fichero escrito (indice.biodiversidad); sin esa marca el motor no lo pide")
    ap.add_argument("--salida", default=os.environ.get("GEMELO_BIODIVERSIDAD"), help="fichero .json o carpeta (o GEMELO_BIODIVERSIDAD)")
    ap.add_argument("--nombres", default=os.environ.get("GEMELO_BIODIVERSIDAD_NOMBRES"), help="JSON {científico: común} (o GEMELO_BIODIVERSIDAD_NOMBRES)")
    ap.add_argument("--km", type=float, default=10.0)
    ap.add_argument("--anios", type=int, default=10, help="cuántos años hacia atrás, el actual incluido")
    a = ap.parse_args(argv)
    if not a.salida:
        ap.error("falta --salida (o GEMELO_BIODIVERSIDAD)")
    if a.lat is not None and a.lon is not None:
        lat, lon = a.lat, a.lon
    elif a.indice:
        lat, lon = centro_desde_indice(a.indice)
    else:
        ap.error("falta el centro: --lat y --lon, o --indice (o GEMELO_DATOS)")
    hoy = datetime.date.today()
    desde, hasta = hoy.year - a.anios + 1, hoy.year
    wkt = cuadro_wkt(lat, lon, a.km)
    g = Gbif()

    def log(s):
        print(s, file=sys.stderr)

    filas, por_ds = descarga(g, wkt, desde, hasta, log)
    log("%d especies; %d conjuntos de datos" % (len({f[0] for f in filas}), len(por_ds)))
    nombres = nombres_de(g, sorted({f[0] for f in filas}))
    fuentes = fuentes_de(g, wkt, por_ds)
    comunes = None
    if a.nombres:
        with open(a.nombres, encoding="utf-8") as f:
            comunes = json.load(f)
    km = int(a.km) if a.km == int(a.km) else a.km
    doc = documento(filas=filas, nombres=nombres, fuentes=fuentes, anio_desde=desde, anio_hasta=hasta, km=km, fecha=hoy.isoformat(), nombres_comunes=comunes)
    dest = a.salida if a.salida.lower().endswith(".json") else os.path.join(a.salida, "biodiversidad.json")
    os.makedirs(os.path.dirname(os.path.abspath(dest)), exist_ok=True)
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    log("escrito %s (%d especies)" % (dest, len(doc["especies"])))
    if a.marca_indice:
        if not a.indice:
            ap.error("--marca-indice necesita --indice (o GEMELO_DATOS)")
        marca_indice(a.indice, dest)
        log("anotado en %s: biodiversidad = %s" % (a.indice, os.path.basename(dest)))
    return 0


def marca_indice(ruta_indice, dest):
    """Anota en el indice.json el nombre del fichero (debe estar en la misma carpeta, que es la que sirve D.base)."""
    if os.path.dirname(os.path.abspath(dest)) != os.path.dirname(os.path.abspath(ruta_indice)):
        raise SystemExit("--marca-indice: el fichero debe ir junto al indice.json (misma carpeta)")
    with open(ruta_indice, encoding="utf-8") as f:
        ind = json.load(f)
    ind["biodiversidad"] = os.path.basename(dest)
    with open(ruta_indice, "w", encoding="utf-8", newline="\n") as f:
        json.dump(ind, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    sys.exit(main())
