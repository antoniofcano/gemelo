"""SoilGrids por parcela de Hituelo: no se consulta nada nuevo, se reutiliza la carga de producción preparada el 26-oct-2026
(suelo-parcelas-2026-10-26.json en la raíz del repo; clave «lat,lng» del centro de la parcela a 4 decimales) y se indexa por finca/parcela."""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from img_comun import BASE
S = json.load(open(__import__("os").environ.get("GEMELO_SUELO", "suelo-parcelas.json"), encoding="utf-8"))
OT = json.load(open(os.path.join(BASE, "ot_hituelo.json"), encoding="utf-8"))
out = {"fuente": "SoilGrids 2.0 (ISRIC), CC BY 4.0, modelo a 250 m: no es un análisis", "consultadoEn": S["consultadoEn"], "parcelas": {}}; falta = []
for fid, f in OT["fincas"].items():
    for pid, p in f["parcelas"].items():
        c = p.get("centro"); k = "%.4f,%.4f" % (c["lat"], c["lng"]) if c else None
        if k in S["suelos"]: out["parcelas"]["%s__%s" % (fid, pid)] = {"finca": f["nombre"], "parcela": p.get("nombre"), "clave": k, **{x: S["suelos"][k][x] for x in ("punto", "perfil", "tipos", "resolucion")}}
        else: falta.append((f["nombre"], pid))
json.dump(out, open(os.path.join(BASE, "suelo_hituelo.json"), "w", encoding="utf-8"), ensure_ascii=False)
print(len(out["parcelas"]), "parcelas con suelo; sin suelo:", falta)
