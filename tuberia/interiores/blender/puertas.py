# Busca las puertas de un mundo interior en su .blend: agrupa las piezas de la carpintería por cercanía, se queda con las
# que tienen forma de hoja de puerta (sin vidrio, más de 1,8 m de alto, más de 0,7 m de ancho, cerca del suelo) y, para
# cada una, mide el umbral en el suelo con un rayo, y hacia dónde se sale (el lado sin suelo propio del mundo).
# Se le pueden añadir huecos sin hoja (--hueco x,y,ancho,alto,eje) que haya visto una persona en la planta.
#   blender --background <mundo.blend> --python puertas.py -- <salida.json> --carpinteria patio_carp --suelos patio_suelo
#           [--hueco -7.6,-34.1,1.6,2.6,x] …
# Las coordenadas salen en los dos sistemas: «blender» (Z arriba) y «glb» (Y arriba: x, z_b, -y_b), y el rumbo como lo
# pide contratos/mundo-interior.md (grados desde +Z hacia +X del glb, hacia donde se sale).
import bpy, bmesh, sys, json, math
from mathutils import Vector


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": a[0], "carpinteria": [], "suelos": [], "huecos": []}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        if k == "hueco":
            p = v.split(","); o["huecos"].append({"x": float(p[0]), "y": float(p[1]), "ancho": float(p[2]), "alto": float(p[3]), "eje": p[4]})
        else:
            o[k] = v.split(",")
    return o


def piezas(o):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world); bm.faces.ensure_lookup_table()
    vistos, res = set(), []
    for f in bm.faces:
        if f in vistos:
            continue
        pila, caras = [f], []; vistos.add(f)
        while pila:
            g = pila.pop(); caras.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h not in vistos:
                        vistos.add(h); pila.append(h)
        vs = [v.co for c in caras for v in c.verts]
        res.append({"min": [min(v[k] for v in vs) for k in range(3)], "max": [max(v[k] for v in vs) for k in range(3)],
                    "mats": {o.data.materials[c.material_index].name for c in caras}})
    bm.free()
    return res


def agrupa(ps, tol=0.12):
    gs = [dict(min=list(p["min"]), max=list(p["max"]), mats=set(p["mats"])) for p in ps]
    cambio = True
    while cambio:
        cambio = False; out = []
        while gs:
            g = gs.pop(); i = 0
            while i < len(gs):
                h = gs[i]
                if all(g["min"][k] - tol <= h["max"][k] and h["min"][k] - tol <= g["max"][k] for k in range(3)):
                    for k in range(3):
                        g["min"][k] = min(g["min"][k], h["min"][k]); g["max"][k] = max(g["max"][k], h["max"][k])
                    g["mats"] |= h["mats"]; gs.pop(i); cambio = True
                else:
                    i += 1
            out.append(g)
        gs = out
    return gs


def suelo_en(objs, x, y, z0):
    """Cota del primer suelo bajo (x, y, z0) entre los objetos dados, o None"""
    mejor = None
    for o in objs:
        inv = o.matrix_world.inverted()
        ok, p, n, i = o.ray_cast(inv @ Vector((x, y, z0)), (inv.to_3x3() @ Vector((0, 0, -1))).normalized(), distance=6)
        if ok:
            z = (o.matrix_world @ p).z
            if mejor is None or z > mejor:
                mejor = z
    return mejor


def suelo_cerca(objs, c, normal, z0):
    """Cota del suelo en el umbral: el más alto entre el centro y medio metro a cada lado del muro (bajo el muro no suele haber suelo)"""
    zs = [suelo_en(objs, q.x, q.y, z0) for q in (c, c + normal * 0.5, c - normal * 0.5)]
    zs = [z for z in zs if z is not None]
    return max(zs) if zs else None


def describe(c, ancho, alto, eje, suelos, base):
    """eje: 'x' si el muro va a lo largo de X (la puerta mira a ±Y), 'y' si va a lo largo de Y"""
    normal = Vector((0, 1, 0)) if eje == "x" else Vector((1, 0, 0))
    z_suelo = suelo_cerca(suelos, c, normal, base + 1.0)
    lados = {}
    for s in (1, -1):
        q = c + normal * s * 1.2
        lados[s] = suelo_en(suelos, q.x, q.y, base + 1.5)
    # se sale hacia el lado donde no hay suelo propio del mundo (si los dos lo tienen o ninguno, queda por decidir)
    if (lados[1] is None) != (lados[-1] is None):
        sale = normal * (1 if lados[1] is None else -1); seguro = True
    else:
        sale = normal; seguro = False
    zu = z_suelo if z_suelo is not None else base
    glb = [round(c.x, 3), round(zu, 3), round(-c.y, 3)]
    sale_glb = (sale.x, -sale.y)  # (x, z) del glb
    rumbo = round(math.degrees(math.atan2(sale_glb[0], sale_glb[1])) % 360, 1)
    return {"blender": [round(c.x, 3), round(c.y, 3), round(zu, 3)], "glb": glb, "ancho": round(ancho, 2), "alto": round(alto, 2),
            "sale": [round(sale.x, 3), round(sale.y, 3)], "rumbo_glb": rumbo, "salida_segura": seguro,
            "suelo_dentro_y_fuera": {"+": lados[1], "-": lados[-1]}, "hoja_desde_z": round(base, 3)}


def principal():
    a = argumentos()
    suelos = [bpy.data.objects[n] for n in a["suelos"]]
    puertas, otras = [], []
    for n in a["carpinteria"]:
        for g in agrupa(piezas(bpy.data.objects[n])):
            d = [g["max"][k] - g["min"][k] for k in range(3)]
            eje = "x" if d[0] >= d[1] else "y"; ancho = max(d[0], d[1]); alto = d[2]
            c = Vector(((g["min"][0] + g["max"][0]) / 2, (g["min"][1] + g["max"][1]) / 2, g["min"][2]))
            zs = suelo_cerca(suelos, c, Vector((0, 1, 0)) if eje == "x" else Vector((1, 0, 0)), c.z + 1.0)
            cerca = zs is not None and c.z - zs < 0.6
            es_puerta = "vidrio" not in g["mats"] and alto > 1.8 and ancho > 0.7 and cerca
            fila = {"origen": n, "mats": sorted(g["mats"]), "min": [round(v, 3) for v in g["min"]], "max": [round(v, 3) for v in g["max"]]}
            if es_puerta:
                fila.update(describe(c, ancho, alto, eje, suelos, c.z)); puertas.append(fila)
            elif ancho > 0.3:
                fila["suelo_z"] = zs; otras.append(fila)
    for h in a["huecos"]:
        c = Vector((h["x"], h["y"], 0)); zs = suelo_cerca(suelos, c, Vector((0, 1, 0)) if h["eje"] == "x" else Vector((1, 0, 0)), 4.0)
        fila = {"origen": "hueco sin hoja (visto en la planta)"}
        fila.update(describe(Vector((c.x, c.y, zs or 0)), h["ancho"], h["alto"], h["eje"], suelos, zs or 0)); puertas.append(fila)
    for i, p in enumerate(puertas):
        p["n"] = i + 1
    json.dump({"puertas": puertas, "otras_piezas_de_carpinteria": otras}, open(a["salida"], "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for p in puertas:
        print("PUERTA", json.dumps({k: p[k] for k in ("n", "origen", "glb", "ancho", "alto", "rumbo_glb", "salida_segura")}, ensure_ascii=False))


principal()
