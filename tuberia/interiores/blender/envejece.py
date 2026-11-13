# Envejece la cal de los muros ILUSTRATIVOS de un mundo interior, para que no salgan lisos: escribe en el color de
# vértice «Color» (el que los materiales del glb ya multiplican por la textura, y que viaja en el glTF como COLOR_0)
#   - un zócalo de salpicadura y humedad: más oscuro y terroso cuanto más cerca del suelo;
#   - chorreones verticales y manchas grandes de ruido (parches de encalado de distintos años);
#   - un punto cálido general (la cal vieja no es blanco puro).
# No toca geometría ni texturas, y se niega ante un objeto MEDIDO. Multiplica sobre el color que hubiera, una sola vez
# (deja gemelo_envejecido en el objeto). La finura la da la malla: en un muro de pocos vértices solo se verá lo grande.
#   blender --background <mundo.blend> --python envejece.py -- --objetos a,b --suelos patio_suelo
#           [--zocalo 0.5] [--fuerza 1.0] [--semilla 3] [--tinte 1,0.975,0.93] [--guarda <otro.blend>]
import bpy, sys, json, math, os
from mathutils import Vector, noise


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"objetos": "", "suelos": "", "zocalo": 0.5, "fuerza": 1.0, "semilla": 3, "tinte": "1,0.975,0.93", "guarda": None}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        o[k] = float(v) if k in ("zocalo", "fuerza") else int(v) if k == "semilla" else v
    return o


def suelo_bajo(suelos, p):
    """Cota del suelo bajo p (o a 25 cm a los lados: un muro suele pisar justo el borde del suelo), o None"""
    mejor = None
    for dx, dy in ((0, 0), (0.25, 0), (-0.25, 0), (0, 0.25), (0, -0.25)):
        for s in suelos:
            inv = s.matrix_world.inverted()
            ok, q, n, i = s.ray_cast(inv @ Vector((p.x + dx, p.y + dy, p.z + 0.3)), inv.to_3x3() @ Vector((0, 0, -1)), distance=12)
            if ok:
                z = (s.matrix_world @ q).z
                if mejor is None or z > mejor:
                    mejor = z
        if mejor is not None:
            return mejor
    return None


def principal():
    a = argumentos(); suelos = [bpy.data.objects[n] for n in a["suelos"].split(",") if n]
    tinte = [float(x) for x in a["tinte"].split(",")]; f = a["fuerza"]; sem = Vector((a["semilla"] * 13.1, a["semilla"] * 7.7, a["semilla"] * 3.3))
    informe = {}
    for nombre in [n for n in a["objetos"].split(",") if n]:
        o = bpy.data.objects[nombre]
        if o.get("gemelo_procedencia") == "medido":
            raise SystemExit(nombre + " es MEDIDO: no se envejece")
        if o.get("gemelo_envejecido"):
            print("ENVEJECE", nombre, "ya estaba: se deja"); continue
        me = o.data; col = me.color_attributes.get("Color")
        if col is None:
            col = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER"); col.data.foreach_set("color", [1.0] * (4 * len(col.data)))
        if col.domain != "CORNER":
            raise SystemExit(nombre + ": «Color» no es por esquina")
        # un factor por vértice (se calcula una vez) y se reparte a sus esquinas
        fac = []
        for v in me.vertices:
            p = o.matrix_world @ v.co
            zs = suelo_bajo(suelos, p); h = (p.z - zs) if zs is not None else 9.0
            zoc = math.exp(-max(0.0, h) / a["zocalo"])                                    # 1 a ras de suelo, 0 arriba
            mancha = noise.noise((p + sem) * 0.35) * 0.5 + noise.noise((p + sem) * 1.3) * 0.25   # −0,75…0,75
            chorro = noise.noise(Vector((p.x * 2.6, p.y * 2.6, p.z * 0.18)) + sem)        # rayas verticales
            osc = 1.0 - f * (0.30 * zoc + 0.10 * max(0.0, mancha) + 0.09 * max(0.0, chorro) + 0.05 * max(0.0, -mancha))
            tierra = f * (0.55 * zoc + 0.18 * max(0.0, chorro))                           # cuánto vira a terroso
            fac.append((max(0.35, osc) * (tinte[0] * (1 - tierra) + 0.86 * tierra),
                        max(0.35, osc) * (tinte[1] * (1 - tierra) + 0.76 * tierra),
                        max(0.35, osc) * (tinte[2] * (1 - tierra) + 0.60 * tierra)))
        d = [0.0] * (4 * len(col.data)); col.data.foreach_get("color", d)
        for l in me.loops:
            r, g, b = fac[l.vertex_index]; k = 4 * l.index
            d[k] *= r; d[k + 1] *= g; d[k + 2] *= b
        col.data.foreach_set("color", d); me.update()
        o["gemelo_envejecido"] = "envejece.py: zócalo %.2f m, fuerza %.2f, semilla %d (ilustrativo)" % (a["zocalo"], f, a["semilla"])
        informe[nombre] = {"vertices": len(me.vertices), "factor_min": round(min(min(x) for x in fac), 3), "factor_max": round(max(max(x) for x in fac), 3)}
        print("ENVEJECE", nombre, json.dumps(informe[nombre]))
    destino = os.path.abspath(a["guarda"]) if a["guarda"] else bpy.data.filepath
    bpy.ops.wm.save_as_mainfile(filepath=destino, compress=True)


principal()
