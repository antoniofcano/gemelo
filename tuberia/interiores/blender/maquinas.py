# La fábrica 1.1 en Blender: de las piezas sueltas del inventario (inventario.py --guarda: un objeto «pieza_NNN» por pieza) a un
# objeto por MÁQUINA («maq_<id>», con su pivote en el origen del objeto y colgado de su padre) y uno con todo lo fijo
# («maquinaria_fija»), más los repasos de la maquinaria. El plan (qué piezas, pivote, eje, velocidad o relación) sale de
# maquinas_def.py (Python puro); aquí solo la geometría. Prepara el horneado con la luz aparte (hornea.py --modo aparte).
#   blender --background <inventario.blend> --python maquinas.py -- <carpeta> --identificacion <identificacion.json>
#           --inventario <inventario.json> --maquinas <maquinas.json> --plantilla <mundo.plantilla.json>
#           [--repasos <repasos.json>] [--materiales-de <fabrica.blend>] [--atlas maquinaria] --guarda <salida.blend>
# SIEMPRE sobre una copia: se niega a guardar encima del .blend abierto. Escribe en <carpeta> maquinas.plan.json (el plan con las
# medidas de las correas, los repasos hechos, los avisos y los tiempos). Lo que se quita va a DESCARTES, no se borra.
# --materiales-de: si las piezas perdieron sus ranuras de material (inventario.py antes del arreglo de Blender 5), se devuelven
#   en el orden de «maquinaria_rec» de ese .blend (solo se leen sus nombres).
# repasos.json (privado; marco del mundo):
#   {"soldar": {"distancia": 0.0005, "angulo": 30},            junta los vértices repetidos de cada pieza (las tapas de cilindro
#                                                              son abanicos sin soldar) y marca aristas vivas por ángulo
#    "aleja": [{"grupos": […], "piezas": […], "de": "<grupo>", "metros": 0.15}],   mueve en planta esas piezas, por el eje
#                                                              dominante, alejándolas del centro de <grupo> (las batidoras de las columnas)
#    "flotantes": {"apoya": true, "max_caida": 0.3, "toque": 0.01},   los conjuntos que no tocan nada bajan hasta lo que tienen
#                                                              debajo si está a menos de max_caida; los demás solo se avisan
#    "vagoneta": {"activa": false, "de": "mesa_con_medidas", "modelo": "vagoneta_vacia", "tamano": [x, y, z]}
#                                                              PREPARADA Y APAGADA hasta que Antonio dé el tamaño: copia el
#                                                              modelo, lo escala a tamano y lo pone donde estaba «de» (que va a DESCARTES)
#    "correas_propias": {"activa": true, "motriz": {"en": "bombas", "eje_pieza": "p038", "x": 4.24, "radio": 0.3, "ancho": 0.1},
#                        "movida": {"en": "molino", "eje_pieza": "p019", "y": 3.0, "radio": 0.45, "ancho": 0.1},
#                        "correa": {"ancho": 0.09, "grueso": 0.006, "material": "m_cuero", "teja_m": 0.4, "nombre": "correa_propia_1"},
#                        "metal": "m_hierro", "atlas": "correas_propias", "resolucion": 512}
#                                                              la transmisión del grupo hidráulico a las piedras (opción b de
#                                                              Antonio): una polea nueva en el eje de las bombas (plano x = «x») y otra
#                                                              horizontal en el eje vertical del molino (a la cota «y»), y una correa
#                                                              semicruzada de cuarto de vuelta entre ellas (ilustrativa; medidas
#                                                              [SUPUESTO]); las poleas cuelgan de la máquina «en», la correa es su
#                                                              propio objeto (una máquina «textura» de maquinas.json con «objetos»).
#                                                              Su UV de luz es un atlas propio (no cabe en el de la maquinaria)
#   }
# El pasillo: avisa de las piezas que ocupan una zona de la plantilla entre 5 cm y 2 m sobre su suelo (no mueve nada).
import bpy, bmesh, sys, json, os, time, math
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import maquinas_def  # noqa: E402 (vive junto a este guion)


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"carpeta": a[0], "identificacion": None, "inventario": None, "maquinas": None, "plantilla": None, "repasos": None,
         "materiales-de": None, "atlas": "maquinaria", "guarda": None}
    i = 1
    while i < len(a):
        o[a[i].lstrip("-")] = a[i + 1]; i += 2
    for k in ("identificacion", "inventario", "maquinas", "plantilla", "guarda"):
        if not o[k]:
            raise SystemExit("falta --" + k)
    return o


def lee(f):
    return json.load(open(f, encoding="utf-8"))


def pieza(pid):
    return bpy.data.objects.get("pieza_%03d" % int(pid[1:]))


def coleccion(nombre):
    c = bpy.data.collections.get(nombre)
    if c is None:
        c = bpy.data.collections.new(nombre); bpy.context.scene.collection.children.link(c)
    return c


def a_descartes(o, nota):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coleccion("DESCARTES").objects.link(o); o.hide_render = True; o["gemelo_nota"] = nota


def repara_materiales(desde):
    """Devuelve a cada pieza las ranuras de «maquinaria_rec» (en su orden) si las perdió"""
    piezas = [o for o in bpy.data.objects if o.name.startswith("pieza_") and o.type == "MESH"]
    falta = [o for o in piezas if len(o.data.materials) <= 1 and len(o.data.polygons) and max(p.material_index for p in o.data.polygons) > 0]
    if not falta:
        return 0
    if not desde:
        raise SystemExit("%d piezas sin sus ranuras de material: pasa --materiales-de <el .blend de origen>" % len(falta))
    with bpy.data.libraries.load(desde, link=False) as (src, dst):
        dst.meshes = [n for n in src.meshes if n == "maquinaria_rec"] or list(src.meshes)
    me = next((m for m in dst.meshes if m and len(m.materials) > 1 and m.name.startswith("maquinaria_rec")), None)
    if me is None:
        raise SystemExit("no encuentro la malla maquinaria_rec en " + desde)
    nombres = [m.name.split(".")[0] if m else None for m in me.materials]
    mats = [bpy.data.materials.get(n) or next((m for m in bpy.data.materials if m.name.split(".")[0] == n), None) for n in nombres]
    for o in falta:
        o.data.materials.clear()
        for m in mats:
            o.data.materials.append(m)
    for m in dst.meshes:
        if m:
            bpy.data.meshes.remove(m)
    return len(falta)


def soldar(objs, dist, angulo):
    antes = despues = 0
    for o in objs:
        bm = bmesh.new(); bm.from_mesh(o.data); antes += len(bm.verts)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist); despues += len(bm.verts)
        bm.to_mesh(o.data); bm.free()
        if hasattr(o.data, "set_sharp_from_angle"):
            o.data.set_sharp_from_angle(angle=math.radians(angulo))
        o.data.update()
    return {"piezas": len(objs), "vertices_antes": antes, "vertices_despues": despues}


def mueve(pids, d_mundo, inv, ident):
    """Mueve piezas d_mundo metros (marco del mundo) y corrige sus cajas en el inventario y en los grupos que se movieron enteros"""
    d_b = Vector((d_mundo[0], -d_mundo[2], d_mundo[1])); pids = set(pids)
    for pid in pids:
        o = pieza(pid)
        if o is not None:
            o.data.transform(Matrix.Translation(d_b)); o.data.update()
    for p in inv["piezas"]:
        if p["id"] in pids:
            p["caja"]["centro"] = [round(a + b, 4) for a, b in zip(p["caja"]["centro"], d_mundo)]
    for g in ident["grupos"].values():
        if g["piezas"] and set(g["piezas"]) <= pids:
            g["caja"]["centro"] = [round(a + b, 4) for a, b in zip(g["caja"]["centro"], d_mundo)]


def aleja(op, inv, ident):
    G = ident["grupos"]; pids = set(op.get("piezas", []))
    for g in op.get("grupos", []):
        pids |= set(G[g]["piezas"])
    pids -= set(op.get("excluye", []))
    P = {p["id"]: p for p in inv["piezas"]}
    c = maquinas_def.caja([P[i]["caja"] for i in pids])["centro"]; de = G[op["de"]]["caja"]["centro"]
    dx, dz = c[0] - de[0], c[2] - de[2]
    d = [math.copysign(op["metros"], dx), 0, 0] if abs(dx) >= abs(dz) else [0, 0, math.copysign(op["metros"], dz)]
    mueve(pids, d, inv, ident)
    return {"piezas": len(pids), "desplaza_mundo": d, "de": op["de"]}


def arbol(o):
    me = o.data; m = o.matrix_world
    return BVHTree.FromPolygons([m @ v.co for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def flotantes(op, inv, plantilla_objs):
    """Conjuntos que no tocan nada: los baja hasta lo que tienen debajo (si está cerca) o los avisa"""
    toque = op.get("toque", 0.01); hechos = []
    resto = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render and len(o.data.polygons)
             and o.name not in {x.name for c in ("AUXILIAR", "DESCARTES", "EFECTOS") if bpy.data.collections.get(c) for x in bpy.data.collections[c].all_objects}]
    cajas = {o.name: ([min(c[k] for c in [o.matrix_world @ Vector(b) for b in o.bound_box]) for k in range(3)],
                      [max(c[k] for c in [o.matrix_world @ Vector(b) for b in o.bound_box]) for k in range(3)]) for o in resto}
    cache = {}
    def bvh(o):
        if o.name not in cache:
            cache[o.name] = arbol(o)
        return cache[o.name]
    for cand in maquinas_def.candidatos_flotantes(inv):
        mios = [pieza(p) for p in cand["piezas"] if pieza(p) is not None]
        nombres = {o.name for o in mios}
        mn = [min(cajas[o.name][0][k] for o in mios) - toque for k in range(3)]; mx = [max(cajas[o.name][1][k] for o in mios) + toque for k in range(3)]
        vecinos = [o for o in resto if o.name not in nombres and all(cajas[o.name][0][k] <= mx[k] and cajas[o.name][1][k] >= mn[k] for k in range(3))]
        toca = False
        for o in mios:
            vs = [o.matrix_world @ v.co for v in o.data.vertices]; paso = max(1, len(vs) // 300)
            for w in vecinos:
                if any(bvh(w).find_nearest(v, toque)[0] is not None for v in vs[::paso]) or bvh(w).overlap(bvh(o)):
                    toca = True; break
            if toca:
                break
        if toca:
            continue
        # lo que hay debajo: rayos hacia abajo desde los vértices más bajos
        z0 = min(cajas[o.name][0][2] for o in mios); caida = None
        bajos = [(o.matrix_world @ v.co) for o in mios for v in o.data.vertices if (o.matrix_world @ v.co).z < z0 + 0.02]
        for v in bajos[:: max(1, len(bajos) // 50)]:
            for w in resto:
                if w.name in nombres:
                    continue
                h = bvh(w).ray_cast(v, Vector((0, 0, -1)), op.get("max_caida", 0.3) + 0.01)
                if h[0] is not None and (caida is None or h[3] < caida):
                    caida = h[3]
        fila = {"conjunto": cand["conjunto"], "piezas": cand["piezas"], "y_min": cand["y_min"], "caida_m": round(caida, 3) if caida is not None else None}
        if op.get("apoya") and caida is not None and caida > toque:
            for o in mios:
                o.data.transform(Matrix.Translation(Vector((0, 0, -(caida - 0.001))))); o.data.update()
            for p in inv["piezas"]:
                if p["id"] in cand["piezas"]:
                    p["caja"]["centro"][1] = round(p["caja"]["centro"][1] - (caida - 0.001), 4)
            fila["apoyado"] = True
        hechos.append(fila)
    return hechos


def vagoneta(op, inv, ident):
    if not op.get("activa") or not op.get("tamano"):
        return {"hecho": False, "motivo": "preparada y apagada: falta el tamaño de la vagoneta (Antonio)"}
    G = ident["grupos"]; P = {p["id"]: p for p in inv["piezas"]}
    mod = [pieza(p) for p in G[op["modelo"]]["piezas"]]; de = G[op["de"]]
    cm = maquinas_def.caja([P[p]["caja"] for p in G[op["modelo"]]["piezas"]])
    k = [t / max(1e-6, s) for t, s in zip(op["tamano"], cm["tamano"])]
    destino = [de["caja"]["centro"][0], de["caja"]["min"][1], de["caja"]["centro"][2]]
    base_m = [cm["centro"][0], cm["min"][1], cm["centro"][2]]
    nuevos = []
    for o in mod:
        c = o.copy(); c.data = o.data.copy(); c.name = "vagoneta_viga_" + o.name
        bpy.context.scene.collection.objects.link(c)
        org = Vector(maquinas_def.a_blender(base_m, inv["origen_blender"])); dst = Vector(maquinas_def.a_blender(destino, inv["origen_blender"]))
        esc = Matrix.Diagonal((k[0], k[2], k[1], 1.0))
        c.data.transform(Matrix.Translation(dst) @ esc @ Matrix.Translation(-org)); c.data.update(); nuevos.append(c.name)
    for p in de["piezas"]:
        if pieza(p) is not None:
            a_descartes(pieza(p), "la mesa con medidas pasa a vagoneta de la prensa de viga (maquinas.py, vagoneta)")
    return {"hecho": True, "objetos": nuevos, "escala": k}


def b_de(p, origen):
    return Vector(maquinas_def.a_blender(p, origen))


def malla_obj(nombre, bm, material):
    me = bpy.data.meshes.new(nombre); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(nombre, me); coleccion("ILUSTRATIVO").objects.link(o)
    if material is not None:
        me.materials.append(material)
    o["gemelo_procedencia"] = "ilustrativo"
    return o


def polea(nombre, centro, eje, radio, ancho, material):
    bm = bmesh.new(); bm.loops.layers.uv.new("UVMap")
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32, radius1=radio, radius2=radio, depth=ancho, calc_uvs=True)
    rot = Vector((0, 0, 1)).rotation_difference(Vector(eje)).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(centro) @ rot, verts=bm.verts)
    return malla_obj(nombre, bm, material)


def correa_cuarto(nombre, L, al, rl, U, au, ru, ancho, teja, material, n=16):
    """Correa semicruzada de cuarto de vuelta entre una polea (centro L, eje al, radio rl) y otra (U, au, ru): media vuelta en
    cada polea por el lado de fuera y dos ramales rectos que giran su ancho del eje de una al de la otra. UVMap: u a lo ancho,
    v a lo largo, una «teja» de textura cada `teja` metros (así se sabe cuántas unidades de UV hay por metro)"""
    al, au = Vector(al).normalized(), Vector(au).normalized(); d = U - L
    pl = (d - d.dot(al) * al).normalized(); sl = al.cross(pl).normalized()
    pu = (-d - (-d).dot(au) * au).normalized(); su = au.cross(pu).normalized()
    sig = max((1, -1), key=lambda s: ((L + rl * sl + U + s * ru * su) - (L - rl * sl + U - s * ru * su)).length)
    pts = []   # (punto, dirección del ancho)
    for i in range(n + 1):
        f = math.pi * i / n; pts.append((L + rl * (math.cos(f) * -sl + math.sin(f) * -pl), al))
    for (a, b, w0, w1) in ((L + rl * sl, U + sig * ru * su, al, au), (None, None, None, None)):
        if a is None:
            break
        for i in range(1, n):
            k = i / n; dirr = (b - a).normalized(); w = w0 * (1 - k) + w1 * k; w = (w - w.dot(dirr) * dirr).normalized(); pts.append((a.lerp(b, k), w))
    for i in range(n + 1):
        f = math.pi * i / n; pts.append((U + ru * (math.cos(f) * sig * su + math.sin(f) * -pu), au))
    a, b = U - sig * ru * su, L - rl * sl
    for i in range(1, n + 1):
        k = i / n; dirr = (b - a).normalized(); w = au * (1 - k) + al * k; w = (w - w.dot(dirr) * dirr).normalized(); pts.append((a.lerp(b, k), w))
    for i in range(1, len(pts)):   # el ancho no se da la vuelta de un punto al siguiente
        if pts[i][1].dot(pts[i - 1][1]) < 0:
            pts[i] = (pts[i][0], -pts[i][1])
    bm = bmesh.new(); uv = bm.loops.layers.uv.new("UVMap"); filas = []; largo = 0.0
    for i, (p, w) in enumerate(pts):
        if i:
            largo += (p - pts[i - 1][0]).length
        filas.append((bm.verts.new(p - w * ancho / 2), bm.verts.new(p + w * ancho / 2), largo / teja))
    for (a0, a1, v0), (b0, b1, v1) in zip(filas, filas[1:]):
        f = bm.faces.new((a0, b0, b1, a1))
        for l, c in zip(f.loops, ((0, v0), (0, v1), (1, v1), (1, v0))):
            l[uv].uv = c
    return malla_obj(nombre, bm, material), round(largo, 3)


def correas_propias(op, inv, ident):
    """La transmisión propia del grupo hidráulico a las piedras (cabecera): poleas nuevas, correa y sus medidas"""
    if not op.get("activa"):
        return {"hecho": False}
    P = {p["id"]: p for p in inv["piezas"]}; org = inv["origen_blender"]; mo, mv, co = op["motriz"], op["movida"], op["correa"]
    cl = list(P[mo["eje_pieza"]]["caja"]["centro"]); cl[0] = mo["x"]
    cu = list(P[mv["eje_pieza"]]["caja"]["centro"]); cu[1] = mv["y"]
    L, U = b_de(cl, org), b_de(cu, org)
    metal = bpy.data.materials.get(op.get("metal", "m_hierro")); cuero = bpy.data.materials.get(co.get("material", "m_cuero"))
    if metal is None or cuero is None:
        raise SystemExit("correas_propias: faltan los materiales " + op.get("metal", "m_hierro") + " o " + co.get("material", "m_cuero"))
    a_l, a_u = Vector((1, 0, 0)), Vector((0, 0, 1))   # el eje de las bombas va por x; el del molino, vertical (Z de Blender)
    pm = polea("polea_" + mo["en"] + "_nueva", L, a_l, mo["radio"], mo["ancho"], metal); pm["gemelo_en_maquina"] = mo["en"]
    pv = polea("polea_" + mv["en"] + "_nueva", U, a_u, mv["radio"], mv["ancho"], metal); pv["gemelo_en_maquina"] = mv["en"]
    g = co.get("grueso", 0.006) / 2
    c, largo = correa_cuarto(co.get("nombre", "correa_propia_1"), L, a_l, mo["radio"] + g, U, a_u, mv["radio"] + g, co["ancho"], co.get("teja_m", 0.4), cuero)
    c["gemelo_uv_por_metro"] = 1.0 / co.get("teja_m", 0.4); c["gemelo_uv"] = [0.0, 1.0]
    nuevos = [pm, pv, c]
    for o in nuevos:
        o["gemelo_atlas_luz"] = op.get("atlas", "correas_propias"); o["gemelo_resolucion_pantalla"] = o["gemelo_resolucion_quest"] = op.get("resolucion", 512)
        o["gemelo_nota"] = "correas propias del grupo hidráulico al molino (opción b de Antonio, maquinas.py); medidas [SUPUESTO]"
        o.data.uv_layers.new(name="luz")
    # un atlas de luz para las tres (smart_project con las tres en edición); el UV de color sigue siendo el de render
    bpy.ops.object.select_all(action="DESELECT")
    for o in nuevos:
        o.select_set(True); o.data.uv_layers.active = o.data.uv_layers["luz"]; o.data.uv_layers["UVMap"].active_render = True
    bpy.context.view_layer.objects.active = nuevos[0]
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(island_margin=0.02); bpy.ops.object.mode_set(mode="OBJECT")
    area = sum(p.area for o in nuevos for p in o.data.polygons)
    for o in nuevos:
        o["gemelo_area_m2"] = round(area, 3); o["gemelo_uv_ocupacion"] = 0.5
    # holgura: lo más cerca que pasa la correa de lo que ya había (sin contar sus poleas ni los ejes en los que van)
    fuera = {o.name for o in nuevos} | {"pieza_%03d" % int(x[1:]) for x in (mo["eje_pieza"], mv["eje_pieza"])}
    resto = [o for o in bpy.context.scene.objects if o.type == "MESH" and not o.hide_render and o.name not in fuera and len(o.data.polygons)
             and not any(x.name in ("AUXILIAR", "DESCARTES", "EFECTOS") for x in o.users_collection)]
    vs = [c.matrix_world @ v.co for v in c.data.vertices]; mejor = (9e9, None)
    for o in resto:
        bb = [o.matrix_world @ Vector(x) for x in o.bound_box]
        mn = [min(x[k] for x in bb) - 0.3 for k in range(3)]; mx = [max(x[k] for x in bb) + 0.3 for k in range(3)]
        cerca = [v for v in vs if all(mn[k] <= v[k] <= mx[k] for k in range(3))]
        if not cerca:
            continue
        t = arbol(o)
        for v in cerca[:: max(1, len(cerca) // 200)]:
            h = t.find_nearest(v, 0.3)
            if h[0] is not None and h[3] < mejor[0]:
                mejor = (h[3], o.name)
    return {"hecho": True, "objetos": [o.name for o in nuevos], "largo_correa_m": largo, "entre_centros_m": round((U - L).length, 3),
            "polea_motriz": {"centro_mundo": [round(x, 3) for x in cl], "diametro_m": 2 * mo["radio"], "ancho_m": mo["ancho"], "en": mo["en"]},
            "polea_movida": {"centro_mundo": [round(x, 3) for x in cu], "diametro_m": 2 * mv["radio"], "ancho_m": mv["ancho"], "altura_m": mv["y"], "en": mv["en"]},
            "holgura_min_m": round(mejor[0], 3) if mejor[1] else None, "holgura_con": mejor[1],
            "supuesto": "[SUPUESTO] diámetros, anchos, altura y sitio de las poleas; la geometría del cuarto de vuelta es ilustrativa"}


def mide_correas(plan, piezas_de):
    """Por cada máquina «textura»: la dirección en UV (UVMap) en la que corre el material y cuántas unidades de UV hay por metro"""
    medidas = {}
    for q in plan["maquinas"]:
        if q["tipo"] != "textura":
            continue
        base = q["material_base"]; tri = []
        objs = [pieza(p) for p in q["piezas"]] + [bpy.data.objects[n] for n in q.get("objetos", [])]
        dada = next((o for o in objs if "gemelo_uv_por_metro" in o), None)
        if dada is not None:   # la hizo maquinas.py con sus UV: se sabe sin medir
            medidas[q["id"]] = {"uv": list(dada["gemelo_uv"]), "uv_por_metro": round(float(dada["gemelo_uv_por_metro"]), 4), "dada": True}
            continue
        for o in objs:
            me = o.data; me.calc_loop_triangles(); uv = me.uv_layers.get("UVMap") or me.uv_layers[0]
            for t in me.loop_triangles:
                m = me.materials[t.material_index]
                if m is None or m.name.split(".")[0] != base:
                    continue
                P = [o.matrix_world @ me.vertices[v].co for v in t.vertices]; U = [Vector(uv.data[l].uv) for l in t.loops]
                tri.append((P, U))
        if not tri:
            continue
        # el ancho de la correa va por la medida menor de su caja: correr es ir en UV sin cambiar esa coordenada
        tam = q["caja"]["tamano"]; k = min(range(3), key=lambda i: tam[i]); a = Vector([(1.0 if i == k else 0.0) for i in range(3)])
        a = Vector((a[0], -a[2], a[1]))
        ws, upm, pesos = [], [], []
        for P, U in tri:
            e1, e2 = P[1] - P[0], P[2] - P[0]; d1, d2 = U[1] - U[0], U[2] - U[0]
            det = d1.x * d2.y - d2.x * d1.y
            if abs(det) < 1e-12:
                continue
            T = (e1 * d2.y - e2 * d1.y) / det; B = (e2 * d1.x - e1 * d2.x) / det
            w = Vector((-(B.dot(a)), T.dot(a)))
            if w.length < 1e-9:
                continue
            w.normalize(); l3 = (T * w.x + B * w.y).length
            if l3 < 1e-9:
                continue
            area = e1.cross(e2).length / 2
            ws.append(w); upm.append(1.0 / l3); pesos.append(area)
        if not ws:
            continue
        ref = ws[int(np.argmax(pesos))]
        s = sum(((w if w.dot(ref) >= 0 else -w) * p for w, p in zip(ws, pesos)), Vector((0, 0)))
        medidas[q["id"]] = {"uv": [round(s.normalized().x, 4), round(s.normalized().y, 4)],
                            "uv_por_metro": round(float(np.average(upm, weights=pesos)), 4), "triangulos": len(ws)}
    return medidas


def junta(nombre, objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active; o.name = nombre; o.data.name = nombre
    return o


def principal():
    a = argumentos(); t0 = time.time(); med = {}
    abierto = os.path.abspath(bpy.data.filepath) if bpy.data.filepath else None
    if abierto and os.path.abspath(a["guarda"]) == abierto:
        raise SystemExit("--guarda no puede ser el .blend abierto: las máquinas se juntan sobre una copia")
    ident, inv, conf, pl = lee(a["identificacion"]), lee(a["inventario"]), lee(a["maquinas"]), lee(a["plantilla"])
    rep = lee(a["repasos"]) if a["repasos"] else {}
    carpeta = os.path.abspath(a["carpeta"]); os.makedirs(carpeta, exist_ok=True)
    informe = {"repasos": {}, "avisos": []}
    informe["ranuras_devueltas"] = repara_materiales(a["materiales-de"])
    piezas = [pieza(p["id"]) for p in inv["piezas"]]
    if any(o is None for o in piezas):
        raise SystemExit("faltan objetos pieza_NNN: el .blend no es el de inventario.py --guarda")
    # repasos de la maquinaria
    if rep.get("soldar"):
        informe["repasos"]["soldar"] = soldar(piezas, rep["soldar"].get("distancia", 0.0005), rep["soldar"].get("angulo", 30))
    for op in rep.get("aleja", []):
        informe["repasos"].setdefault("aleja", []).append(aleja(op, inv, ident))
    if rep.get("flotantes"):
        informe["repasos"]["flotantes"] = flotantes(rep["flotantes"], inv, None)
    informe["repasos"]["vagoneta"] = vagoneta(rep.get("vagoneta", {}), inv, ident)
    informe["repasos"]["correas_propias"] = correas_propias(rep.get("correas_propias", {}), inv, ident)
    ox, oy, oz = pl["origen"]
    zonas = [{"id": z["id"], "x0": min(z["caja"][0], z["caja"][2]) - ox, "x1": max(z["caja"][0], z["caja"][2]) - ox,
              "z0": min(-(z["caja"][1] - oy), -(z["caja"][3] - oy)), "z1": max(-(z["caja"][1] - oy), -(z["caja"][3] - oy)), "y": 0.0} for z in pl.get("zonas", [])]
    informe["pasillo"] = maquinas_def.obstaculos(inv, zonas)
    med["repasos_s"] = round(time.time() - t0, 1)
    # el plan: una primera vuelta para saber las piezas, las medidas de las correas, y la definitiva
    plan, _ = maquinas_def.resuelve(ident, inv, conf)
    medidas = mide_correas(plan, None)
    plan, errores = maquinas_def.resuelve(ident, inv, conf, medidas)
    if errores:
        raise SystemExit("el plan de máquinas tiene errores:\n  " + "\n  ".join(errores))
    plan["medidas"] = medidas
    # juntar: una máquina por objeto con el origen en su pivote; lo fijo, en uno
    hechos = {}
    for q in plan["maquinas"]:
        o = junta(q["nodo"], [pieza(p) for p in q["piezas"]] + [bpy.data.objects[n] for n in q.get("objetos", [])])
        pv = Vector(q["pivote_blender"]); o.data.transform(Matrix.Translation(-pv)); o.location = pv; o.data.update()
        if q["piezas"] and q.get("objetos"):
            raise SystemExit(q["id"] + ": una máquina es o de piezas del inventario o de objetos nuevos, no de las dos (su UV de luz es de otro atlas)")
        o["gemelo_maquina"] = q["id"]; o["gemelo_luz"] = q["luz"]; o["gemelo_procedencia"] = "ilustrativo"
        if q["piezas"]:   # las piezas comparten el UV «luz» de la malla de la que salieron; los objetos nuevos traen su atlas
            o["gemelo_atlas_luz"] = a["atlas"]
        o["gemelo_nota"] = "máquina de la fábrica 1.1 (maquinas.py): " + q["tipo"] + ", " + q["fuente"]
        if q["tipo"] == "textura":
            for i, m in enumerate(o.data.materials):
                if m and m.name.split(".")[0] == q["material_base"]:
                    c = m.copy(); c.name = q["material"]; o.data.materials[i] = c
        hechos[q["id"]] = o
    for q in plan["maquinas"]:
        if q["padre"]:
            h, p = hechos[q["id"]], hechos[q["padre"]]
            w = h.matrix_world.copy(); h.parent = p; h.matrix_parent_inverse = Matrix.Identity(4); h.location = w.translation - p.matrix_world.translation
    for o in [x for x in bpy.data.objects if "gemelo_en_maquina" in x]:   # piezas nuevas que cuelgan de una máquina (sin juntarse: su UV de luz es otro atlas)
        p = hechos.get(o["gemelo_en_maquina"])
        if p is None:
            raise SystemExit(o.name + " cuelga de una máquina que no está en el plan: " + o["gemelo_en_maquina"])
        o.parent = p; o.matrix_parent_inverse = Matrix.Identity(4); o.location = -p.matrix_world.translation
    fijas = [pieza(p) for p in plan["fijas"] if pieza(p) is not None and pieza(p).name not in {x.name for x in coleccion("DESCARTES").all_objects}]
    f = junta("maquinaria_fija", fijas); f["gemelo_atlas_luz"] = a["atlas"]; f["gemelo_procedencia"] = "ilustrativo"
    f["gemelo_nota"] = "lo fijo de la maquinaria reconstruida (maquinas.py)"
    med["junta_s"] = round(time.time() - t0, 1)
    plan["repasos"] = informe; plan["medida"] = med
    json.dump(plan, open(os.path.join(carpeta, "maquinas.plan.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a["guarda"]), compress=True, copy=True)
    print("MAQUINAS", json.dumps({"maquinas": len(plan["maquinas"]), "fijas": len(plan["fijas"]), "triangulos": plan["triangulos"],
                                  "avisos_pasillo": len(informe["pasillo"]), "segundos": round(time.time() - t0, 1)}), flush=True)


principal()
