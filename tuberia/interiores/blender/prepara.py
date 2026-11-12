# Prepara un .blend de mundo interior (de separa.py) para hornear la luz, sin hornear:
#   blender --background <mundo.blend> --python prepara.py -- [--margen-uv 0.004] [--margen-uv-denso 0.001] [--denso-tri-m2 100]
#           [--objetivo-tm 80] [--angulo-uv 66] [--azimut 210]
#           [--elevacion 50] [--norte 0] [--sol 3.0] [--color-sol r,g,b] [--cielo 1.0] [--nota-sol "…"]
#           [--forma-uv CONCAVE|CONVEX|AABB] [--objetos a,b] [--solo-luz] [--solo-uv] [--guarda <otro.blend>]
#   1. segundo juego de UV «luz» por objeto (Smart UV Project, con margen entre islas; el UV de las texturas no se toca)
#      y, por objeto, su superficie, la ocupación del UV, los téxeles por metro que saldrían a 1024, 2048 y 4096 y la
#      resolución que da --objetivo-tm (en pantalla hasta 4096, en Quest hasta 2048; queda en gemelo_resolucion_*);
#   2. comprueba que cada Principled tiene color, normal y ORM (oclusión/rugosidad/metal) conectados como en el glb;
#   3. sol y cielo parametrizados: la orientación real de la nave NO se sabe ([SUPUESTO]); el azimut se mide en planta
#      desde +Y de Blender (= −Z del glb) hacia +X, y queda en la escena (gemelo_sol_azimut, gemelo_sol_elevacion);
#      --norte N dice hacia dónde cae el norte real (grados en planta desde +Y hacia +X): entonces --azimut es el
#      azimut geográfico del sol y en planta se pone azimut + N; --color-sol tiñe el sol (lineal), para un sol bajo;
#   4. Cycles en CPU con valores de partida para hornear (hornea.py los sustituye por los suyos).
# Con --solo-luz rehace solo el sol y el cielo (no toca los UV); con --solo-uv, solo los UV de --objetos (no toca la luz). Escribe <blend>.prepara.json con lo medido.
import bpy, bmesh, sys, json, math, os, time
from mathutils import Vector

UV_LUZ = "luz"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"margen-uv": 0.004, "angulo-uv": 66.0, "azimut": 210.0, "elevacion": 50.0, "sol": 3.0, "cielo": 1.0, "solo-luz": False, "guarda": None, "forma-uv": "CONCAVE", "objetos": None, "margen-uv-denso": 0.001, "denso-tri-m2": 100.0, "objetivo-tm": 80.0,
         "norte": 0.0, "color-sol": "1,1,1", "solo-uv": False, "nota-sol": None}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-")
        if k in ("solo-luz", "solo-uv"):
            o[k] = True; i += 1; continue
        o[k] = a[i + 1] if k in ("guarda", "forma-uv", "objetos", "color-sol", "nota-sol") else float(a[i + 1]); i += 2
    return o


def horneables():
    """Objetos de malla visibles en el render, fuera de AUXILIAR y DESCARTES"""
    fuera = set()
    for n in ("AUXILIAR", "DESCARTES", "EFECTOS"):
        c = bpy.data.collections.get(n)
        if c:
            fuera |= {o.name for o in c.all_objects}
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in fuera and len(o.data.polygons)]


def superficie_y_uv(o, capa):
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    uv = bm.loops.layers.uv.get(capa)
    a3 = sum(f.calc_area() for f in bm.faces); auv = 0.0
    if uv is not None:
        for f in bm.faces:
            l = f.loops
            for k in range(1, len(l) - 1):
                p0, p1, p2 = l[0][uv].uv, l[k][uv].uv, l[k + 1][uv].uv
                auv += abs((p1.x - p0.x) * (p2.y - p0.y) - (p2.x - p0.x) * (p1.y - p0.y)) / 2
    bm.free()
    return a3, auv


def uv_luz(o, margen, angulo, forma):
    me = o.data
    if UV_LUZ not in me.uv_layers:
        me.uv_layers.new(name=UV_LUZ)
    # el UV de las texturas sigue siendo el de render; «luz» se activa solo para editar (y hornea.py la activa al hornear)
    render = next((u for u in me.uv_layers if u.active_render), None)
    me.uv_layers.active = me.uv_layers[UV_LUZ]
    if render is not None:
        render.active_render = True
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(angulo), island_margin=margen, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    # el empaquetado de Smart UV deja mucho hueco en muros largos: se reempaqueta con giro y forma cóncava,
    # y se queda el reempaquetado solo si ocupa más
    capa = me.uv_layers[UV_LUZ]; antes = [0.0] * (2 * len(capa.data)); capa.data.foreach_get("uv", antes)
    ocup0 = superficie_y_uv(o, UV_LUZ)[1]
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=margen, shape_method=forma)
    bpy.ops.object.mode_set(mode="OBJECT")
    capa = me.uv_layers[UV_LUZ]
    if superficie_y_uv(o, UV_LUZ)[1] < ocup0:
        capa.data.foreach_set("uv", antes); me.update()
        return "smart_project"
    return "smart_project + pack_islands"


def resolucion_para(objetivo, ocupacion, area):
    """La menor potencia de 2 (256…4096) que da `objetivo` téxeles por metro con esa ocupación del UV"""
    for n in (256, 512, 1024, 2048, 4096):
        if area > 0 and n * math.sqrt(ocupacion / area) >= objetivo:
            return n
    return 4096


def revisa_material(m):
    """Qué entradas del Principled están conectadas (color, normal, rugosidad, metal) y si hay ORM con oclusión"""
    if not m.use_nodes or not m.node_tree:
        return {"principled": False}
    b = next((n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
    if b is None:
        return {"principled": False}
    r = {"principled": True}
    for k, s in (("color", "Base Color"), ("normal", "Normal"), ("rugosidad", "Roughness"), ("metal", "Metallic"), ("alfa", "Alpha")):
        r[k] = b.inputs[s].is_linked
    r["oclusion"] = any(n.bl_idname == "ShaderNodeTexImage" and n.label == "OCCLUSION" for n in m.node_tree.nodes)
    r["color_vertice"] = any(n.bl_idname == "ShaderNodeVertexColor" for n in m.node_tree.nodes)
    return r


def sol_y_cielo(az_geo, el, fuerza_sol, fuerza_cielo, norte=0.0, color=(1, 1, 1), nota=None):
    esc = bpy.context.scene; az = az_geo + norte
    d = bpy.data.lights.get("sol") or bpy.data.lights.new("sol", "SUN")
    d.energy = fuerza_sol; d.angle = math.radians(0.53); d.color = color
    sol = bpy.data.objects.get("sol") or bpy.data.objects.new("sol", d)
    if sol.name not in esc.collection.objects:
        esc.collection.objects.link(sol)
    # dirección desde la que llega la luz: azimut en planta desde +Y hacia +X; el sol de Blender alumbra hacia su −Z
    azr, elr = math.radians(az), math.radians(el)
    hacia_sol = Vector((math.sin(azr) * math.cos(elr), math.cos(azr) * math.cos(elr), math.sin(elr)))
    sol.rotation_euler = (-hacia_sol).to_track_quat("-Z", "Y").to_euler()
    sol.location = hacia_sol * 30
    w = esc.world or bpy.data.worlds.new("cielo"); esc.world = w
    w.use_nodes = True; nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    cielo = nt.nodes.new("ShaderNodeTexSky")
    tipos = [i.identifier for i in cielo.bl_rna.properties["sky_type"].enum_items]
    cielo.sky_type = "MULTIPLE_SCATTERING" if "MULTIPLE_SCATTERING" in tipos else tipos[0]
    for k, v in (("sun_disc", False), ("sun_elevation", elr), ("sun_rotation", azr)):
        if hasattr(cielo, k):
            setattr(cielo, k, v)
    fondo = nt.nodes.new("ShaderNodeBackground"); fondo.inputs["Strength"].default_value = fuerza_cielo
    sal = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(cielo.outputs["Color"], fondo.inputs["Color"]); nt.links.new(fondo.outputs["Background"], sal.inputs["Surface"])
    esc["gemelo_sol_azimut"] = az; esc["gemelo_sol_elevacion"] = el; esc["gemelo_norte"] = norte
    esc["gemelo_sol_nota"] = nota or "[SUPUESTO] orientación de la nave desconocida: azimut en planta desde +Y de Blender (= −Z del glb) hacia +X"
    return {"azimut_en_planta": az, "azimut_geografico": az_geo, "norte": norte, "elevacion": el, "sol_w_m2": fuerza_sol,
            "color_sol": list(color), "cielo": fuerza_cielo, "tipo_cielo": cielo.sky_type, "nota": esc["gemelo_sol_nota"]}


def cycles_de_partida():
    esc = bpy.context.scene
    esc.render.engine = "CYCLES"
    esc.cycles.device = "CPU"
    esc.cycles.samples = 64
    esc.cycles.use_denoising = True
    esc.render.bake.margin = 8
    esc.render.bake.margin_type = "EXTEND"
    esc.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in esc.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"


def principal():
    a = argumentos(); t0 = time.time(); esc = bpy.context.scene
    informe = {"blend": os.path.basename(bpy.data.filepath)}
    if not a["solo-luz"]:
        objs = horneables(); filas = {}
        if a["objetos"]:
            objs = [o for o in objs if o.name in a["objetos"].split(",")]
        for o in objs:
            t = time.time()
            # en las mallas densas (escaneo, maquinaria) el margen se come el UV: se usa uno menor (4 px a 4096)
            a0 = superficie_y_uv(o, "")[0]; ntri = sum(len(p.vertices) - 2 for p in o.data.polygons)
            denso = a0 > 0 and ntri / a0 > a["denso-tri-m2"]
            margen = a["margen-uv-denso"] if denso else a["margen-uv"]
            metodo = uv_luz(o, margen, a["angulo-uv"], a["forma-uv"])
            a3, auv = superficie_y_uv(o, UV_LUZ)
            dens = {str(n): round(n * math.sqrt(auv / a3), 1) if a3 > 0 else 0 for n in (1024, 2048, 4096)}
            o["gemelo_area_m2"] = round(a3, 2); o["gemelo_uv_ocupacion"] = round(auv, 3)
            sug = resolucion_para(a["objetivo-tm"], auv, a3)
            o["gemelo_resolucion_pantalla"] = sug; o["gemelo_resolucion_quest"] = min(sug, 2048)
            filas[o.name] = {"triangulos": ntri, "area_m2": round(a3, 2), "tri_por_m2": round(ntri / a3, 1) if a3 else None,
                             "margen_uv": margen, "uv_ocupacion": round(auv, 3), "texeles_por_metro": dens, "metodo": metodo,
                             "resolucion_sugerida": {"pantalla": sug, "quest": min(sug, 2048)}, "segundos_uv": round(time.time() - t, 1)}
            print("UV", o.name, json.dumps(filas[o.name]))
        informe["uv_luz"] = filas
        area = sum(f["area_m2"] for f in filas.values())
        informe["area_total_m2"] = round(area, 1)
        mats = {m.name: revisa_material(m) for o in objs for m in o.data.materials if m}
        informe["materiales"] = mats
        if not a["solo-uv"]:
            cycles_de_partida()
    if not a["solo-uv"]:
        informe["sol_y_cielo"] = sol_y_cielo(a["azimut"], a["elevacion"], a["sol"], a["cielo"], a["norte"],
                                             tuple(float(x) for x in a["color-sol"].split(",")), a["nota-sol"])
    destino = os.path.abspath(a["guarda"]) if a["guarda"] else bpy.data.filepath
    bpy.ops.wm.save_as_mainfile(filepath=destino, compress=True)
    informe["segundos"] = round(time.time() - t0, 1)
    # una pasada parcial (--objetos, --solo-luz, --solo-uv) completa el informe que hubiera, no lo pisa
    ruta = os.path.splitext(destino)[0] + ".prepara.json"
    if (a["objetos"] or a["solo-luz"] or a["solo-uv"]) and os.path.exists(ruta):
        previo = json.load(open(ruta, encoding="utf-8"))
        for k in ("uv_luz", "materiales"):
            if k in previo:
                previo[k].update(informe.get(k, {})); informe[k] = previo[k]
        if "uv_luz" in informe:
            informe["area_total_m2"] = round(sum(f["area_m2"] for f in informe["uv_luz"].values()), 1)
        informe = {**previo, **informe}
    json.dump(informe, open(ruta, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("PREPARA", json.dumps({k: v for k, v in informe.items() if k in ("area_total_m2", "sol_y_cielo", "segundos")}, ensure_ascii=False))


principal()
