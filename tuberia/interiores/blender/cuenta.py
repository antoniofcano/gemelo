# Cuenta lo que dibujaría un mundo interior tal como está en su .blend (tras la obra, la luz…), con la misma cuenta que
# separa.py: triángulos, llamadas (objeto × material usado), materiales, texturas y MB en GPU. Deja fuera AUXILIAR,
# DESCARTES y lo oculto al render; los EFECTOS (haces) se cuentan aparte porque también se dibujan.
#   blender --background <mundo.blend> --python cuenta.py -- <salida.json>
# No compara con el presupuesto: los topes viven en el contrato (contratos/mundo-interior.md) y los mira valida.js.
import bpy, sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recuento import recuento  # noqa: E402


def principal():
    a = sys.argv[sys.argv.index("--") + 1:]
    de = lambda n: {o.name for o in bpy.data.collections[n].all_objects} if n in bpy.data.collections else set()
    fuera = de("AUXILIAR") | de("DESCARTES"); efectos = de("EFECTOS")
    mallas = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in fuera and not o.hide_render and len(o.data.polygons)]
    r = {"blend": os.path.basename(bpy.data.filepath), "mundo": recuento([o for o in mallas if o.name not in efectos]),
         "efectos": recuento([o for o in mallas if o.name in efectos])}
    r["total"] = {k: r["mundo"][k] + r["efectos"][k] for k in ("triangulos", "llamadas")}
    if a:
        json.dump(r, open(a[0], "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("CUENTA", json.dumps({"mundo": {k: v for k, v in r["mundo"].items() if k != "objetos"},
                                "efectos": {k: v for k, v in r["efectos"].items() if k != "objetos"}, "total": r["total"]}))
    for n, f in r["mundo"]["objetos"].items():
        print("CUENTA_OBJETO", n, f["procedencia"], f["triangulos"], len(f["materiales"]))


principal()
