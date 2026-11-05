"""Prueba (sin red, sin claves) de tuberia/biodiversidad/gbif_aves.py: el cuadro, el filtro de licencias, la agregación especie por mes y el documento.

La API de GBIF se sustituye por una función `pide` falsa: nada de esto toca la red. Los datos son inventados.
Uso: python -P -E tuberia/biodiversidad/prueba_biodiversidad.py
"""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbif_aves as g  # noqa: E402


def falsa_api(peticiones):
    """GBIF de mentira: el año 2024 y 2025 traen registros en enero (mes 1); un conjunto tiene una licencia NC y no debe entrar."""
    def pide(ruta, params):
        peticiones.append((ruta, list(params)))
        p = {}
        for k, v in params:
            p.setdefault(k, []).append(v)
        if ruta == "/occurrence/search":
            if "datasetKey" in p:   # la consulta de licencias de un conjunto
                ds = p["datasetKey"][0]
                return {"facets": [{"field": "LICENSE", "counts": [{"name": "CC_BY_NC_4_0" if ds == "ds-nc" else "CC_BY_4_0", "count": 5}]}]}
            if p.get("month") == [1] and p.get("year") in ([2024], [2025]):
                n = 4 if p["year"] == [2024] else 6
                return {"facets": [{"field": "SPECIES_KEY", "counts": [{"name": "111", "count": n}, {"name": "222", "count": 1}]},
                                   {"field": "DATASET_KEY", "counts": [{"name": "ds-ok", "count": n}, {"name": "ds-nc", "count": 1}]}]}
            return {"facets": []}
        if ruta == "/dataset/ds-ok":
            return {"title": "Conjunto bueno", "doi": "10.0000/bueno", "citation": {"text": "Autor (2026). Conjunto bueno."}}
        if ruta == "/dataset/ds-nc":
            return {"title": "Conjunto NC", "doi": None}
        if ruta == "/species/111":
            return {"rank": "SPECIES", "canonicalName": "Parus major"}
        if ruta == "/species/222":
            return {"rank": "GENUS", "canonicalName": "Falco"}
        raise AssertionError("ruta inesperada " + ruta)
    return pide


class Prueba(unittest.TestCase):
    def test_licencias_solo_cc0_by_y_by_sa(self):
        for ok in ("CC0_1_0", "CC_BY_4_0", "CC_BY_SA_4_0", "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
                   "https://creativecommons.org/licenses/by/4.0/", "http://creativecommons.org/licenses/by-sa/4.0/"):
            self.assertTrue(g.licencia_admitida(ok), ok)
        for mal in ("CC_BY_NC_4_0", "UNSPECIFIED", "UNSUPPORTED", "", None, 7, "all rights reserved",
                    "http://creativecommons.org/licenses/by-nc/4.0/", "http://creativecommons.org/licenses/by-nc-sa/4.0/"):
            self.assertFalse(g.licencia_admitida(mal), repr(mal))

    def test_cuadro_de_10_km(self):
        w = g.cuadro_wkt(37.5, -4.0, 10)
        pts = [tuple(map(float, p.split())) for p in w[len("POLYGON(("):-2].split(",")]
        self.assertEqual(pts[0], pts[-1])
        ancho_km = (max(p[0] for p in pts) - min(p[0] for p in pts)) * 111.32 * 0.7934
        alto_km = (max(p[1] for p in pts) - min(p[1] for p in pts)) * 111.32
        self.assertAlmostEqual(alto_km, 10, delta=0.05)
        self.assertAlmostEqual(ancho_km, 10, delta=0.1)
        # antihorario: área con signo positiva
        area = sum(pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1] for i in range(len(pts) - 1))
        self.assertGreater(area, 0)
        with self.assertRaises(ValueError):
            g.cuadro_wkt(95, 0, 10)
        with self.assertRaises(ValueError):
            g.cuadro_wkt(37, -4, 0)

    def test_agrega_por_especie_y_mes(self):
        filas = [("1", 3, 2023, 4), ("1", 3, 2024, 6), ("1", 3, 2024, 2), ("1", 4, 2024, 1), ("2", 3, 2024, 9), ("2", 13, 2024, 5), ("2", 3, 2024, 0)]
        r = g.agrega(filas)
        self.assertEqual(r["1"][2], {"n": 12, "anios": 2})
        self.assertEqual(r["1"][3], {"n": 1, "anios": 1})
        self.assertEqual(r["2"][2], {"n": 9, "anios": 1})
        self.assertEqual(r["1"][0], {"n": 0, "anios": 0})
        self.assertEqual(len(r["1"]), 12)
        self.assertEqual(g.agrega([]), {})

    def test_facetas_acepta_los_dos_nombres(self):
        r = {"facets": [{"field": "SPECIES_KEY", "counts": [{"name": "5", "count": 2}]}, {"field": "datasetKey", "counts": [{"name": "x", "count": 3}]}]}
        self.assertEqual(g.facetas(r, "SPECIES_KEY"), {"5": 2})
        self.assertEqual(g.facetas(r, "DATASET_KEY"), {"x": 3})
        self.assertEqual(g.facetas({}, "SPECIES_KEY"), {})

    def test_descarga_completa_con_api_falsa(self):
        pet = []
        api = g.Gbif(pide=falsa_api(pet))
        wkt = g.cuadro_wkt(37.5, -4.0, 10)
        filas, por_ds = g.descarga(api, wkt, 2024, 2025)
        self.assertEqual(len(pet), 24)           # 12 meses x 2 años
        for _, params in pet:                    # toda consulta pide SOLO las tres licencias y las aves
            self.assertEqual([v for k, v in params if k == "license"], list(g.LICENCIAS_OK))
            self.assertIn(("classKey", g.CLASE_AVES), params)
        fuentes = g.fuentes_de(api, wkt, por_ds)
        self.assertEqual([f["id"] for f in fuentes], ["ds-ok"], "el conjunto con licencia NC no entra")
        self.assertEqual(fuentes[0]["doi"], "10.0000/bueno")
        self.assertEqual(fuentes[0]["licencias"], ["CC_BY_4_0"])
        nombres = g.nombres_de(api, ["111", "222"])
        self.assertEqual(nombres, {"111": "Parus major"}, "solo especies, no géneros")
        doc = g.documento(filas=filas, nombres=nombres, fuentes=fuentes, anio_desde=2024, anio_hasta=2025, km=10, fecha="2026-01-15",
                          nombres_comunes={"Parus major": "Carbonero común"})
        self.assertEqual(doc["v"], 1)
        self.assertEqual(len(doc["especies"]), 1)
        e = doc["especies"][0]
        self.assertEqual((e["nombre_cientifico"], e["nombre_comun"]), ("Parus major", "Carbonero común"))
        self.assertEqual(e["meses"][0], {"n": 10, "anios": 2})
        self.assertEqual(len(e["meses"]), 12)
        txt = json.dumps(doc, ensure_ascii=False)
        self.assertNotIn("POLYGON", txt, "el documento no lleva el cuadro ni el centro")
        self.assertNotIn("geometry", txt)

    def test_el_fixture_del_contrato_es_coherente(self):
        raiz = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        with open(os.path.join(raiz, "contratos", "biodiversidad-ejemplo.json"), encoding="utf-8") as f:
            ej = json.load(f)
        self.assertTrue(ej["sintetico"])
        for f_ in ej["fuentes"]:
            self.assertTrue(all(g.licencia_admitida(x) for x in f_["licencias"]))


if __name__ == "__main__":
    unittest.main(verbosity=1)
