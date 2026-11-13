# Render de comprobación de un mundo interior (no es el horneado): una cámara en un punto mirando a otro.
#   blender --background <mundo.blend> --python vista.py -- <salida.png> --desde x,y,z --hacia x,y,z
#       [--motor eevee|cycles] [--muestras 32] [--px 1280x720] [--lente 18] [--exposicion 0] [--relleno 0]
#       [--ocultar AUXILIAR,…] [--horneado <carpeta>] [--sin-efectos]
# Coordenadas de Blender (Z arriba; glb: x = x, y = z_b, z = -y_b). --relleno W añade, solo para esta vista, una luz de
# área de W vatios en la cámara para ver el interior aunque el sol y el cielo no lleguen: así se distingue «está todo
# en su sitio» de «falta luz», que es cosa del horneado. Escribe <salida>.json con el tiempo de render.
# --horneado <carpeta>: enseña lo que verá el visitante, no lo que calcula Cycles: en cada objeto que tenga su mapa
# <objeto>_luz_dn.exr (o _luz.exr) en la carpeta, el color difuso deja de calcularse y pasa a ser color × mapa de luz
# (emisión, como el lightMap de three); del material quedan solo los brillos (rugosidad, metal y normal) frente a las
# luces de la escena. Los objetos sin mapa se quedan como están. Solo para esta vista: no se guarda nada en el .blend.
# --sin-efectos oculta la colección EFECTOS (haces de polvo).
import bpy, sys, json, os, time
from mathutils import Vector


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": a[0], "desde": None, "hacia": None, "motor": "eevee", "muestras": 32, "px": "1280x720", "lente": 18.0,
         "exposicion": 0.0, "relleno": 0.0, "ocultar": "AUXILIAR", "horneado": None, "sin-efectos": False}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-")
        if k == "sin-efectos":
            o[k] = True; i += 1; continue
        v = a[i + 1]; i += 2
        if k in ("desde", "hacia"):
            o[k] = Vector(map(float, v.split(",")))
        elif k in ("muestras",):
            o[k] = int(v)
        elif k in ("lente", "exposicion", "relleno"):
            o[k] = float(v)
        else:
            o[k] = v
    return o


def aplica_horneado(carpeta):
    """Cada material de cada objeto con mapa pasa a: emisión = color × luz × (1 − metal), más sus brillos"""
    hechos = []
    for o in [x for x in bpy.context.scene.objects if x.type == "MESH" and not x.hide_render]:
        ruta = next((r for r in (os.path.join(carpeta, o.name + s) for s in ("_luz_dn.exr", "_luz.exr")) if os.path.exists(r)), None)
        if ruta is None or "luz" not in o.data.uv_layers:
            continue
        img = bpy.data.images.load(ruta, check_existing=True)
        for i, m in enumerate(o.data.materials):
            if m is None or not m.node_tree:
                continue
            m = m.copy(); o.data.materials[i] = m; nt = m.node_tree
            b = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None)
            sal = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and n.is_active_output), None)
            if b is None or sal is None or not sal.inputs["Surface"].links:
                continue
            uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "luz"
            luz = nt.nodes.new("ShaderNodeTexImage"); luz.image = img; luz.extension = "EXTEND"; nt.links.new(uv.outputs[0], luz.inputs[0])
            def entrada(nombre, tipo):
                """Lo que entra por un zócalo del Principled, como zócalo de salida (un nodo de valor si es constante)"""
                z = b.inputs[nombre]
                if z.is_linked:
                    return z.links[0].from_socket
                n = nt.nodes.new(tipo)
                n.outputs[0].default_value = z.default_value if tipo == "ShaderNodeValue" else tuple(z.default_value)
                return n.outputs[0]
            color = entrada("Base Color", "ShaderNodeRGB"); metal = entrada("Metallic", "ShaderNodeValue")
            def por(x, y):
                n = nt.nodes.new("ShaderNodeMix"); n.data_type = "RGBA"; n.blend_type = "MULTIPLY"; n.inputs[0].default_value = 1.0
                nt.links.new(x, n.inputs[6]); nt.links.new(y, n.inputs[7]); return n.outputs[2]
            inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1.0; nt.links.new(metal, inv.inputs[1])
            em = nt.nodes.new("ShaderNodeEmission"); nt.links.new(por(por(color, luz.outputs["Color"]), inv.outputs[0]), em.inputs["Color"])
            for l in list(b.inputs["Base Color"].links):
                nt.links.remove(l)
            nt.links.new(por(color, metal), b.inputs["Base Color"])  # sin difuso propio: solo queda el color de los metales
            suma = nt.nodes.new("ShaderNodeAddShader"); origen = sal.inputs["Surface"].links[0].from_socket
            if b.inputs["Alpha"].is_linked:
                # material recortado (hojas): el recorte se aplica al final, también a la emisión; la translucidez ya va en el mapa
                alfa = b.inputs["Alpha"].links[0].from_socket
                for l in list(b.inputs["Alpha"].links):
                    nt.links.remove(l)
                tr = nt.nodes.new("ShaderNodeBsdfTransparent"); rec = nt.nodes.new("ShaderNodeMixShader")
                nt.links.new(b.outputs[0], suma.inputs[0]); nt.links.new(em.outputs[0], suma.inputs[1])
                nt.links.new(alfa, rec.inputs[0]); nt.links.new(tr.outputs[0], rec.inputs[1]); nt.links.new(suma.outputs[0], rec.inputs[2])
                nt.links.new(rec.outputs[0], sal.inputs["Surface"])
            else:
                nt.links.new(origen, suma.inputs[0]); nt.links.new(em.outputs[0], suma.inputs[1]); nt.links.new(suma.outputs[0], sal.inputs["Surface"])
            if hasattr(m, "cycles"):
                m.cycles.emission_sampling = "NONE"
        hechos.append(o.name)
    return hechos


def principal():
    a = argumentos(); esc = bpy.context.scene
    if a["sin-efectos"]:
        a["ocultar"] += ",EFECTOS"
    for n in [x for x in a["ocultar"].split(",") if x]:
        c = bpy.data.collections.get(n)
        for ob in (list(c.all_objects) if c else [bpy.data.objects.get(n)]):
            if ob is not None:
                ob.hide_render = True
    cd = bpy.data.cameras.new("vista"); cd.lens = a["lente"]; cd.clip_start = 0.05; cd.clip_end = 200
    cam = bpy.data.objects.new("vista", cd); esc.collection.objects.link(cam)
    cam.location = a["desde"]; cam.rotation_euler = (a["hacia"] - a["desde"]).to_track_quat("-Z", "Y").to_euler(); esc.camera = cam
    if a["relleno"] > 0:
        ld = bpy.data.lights.new("relleno_vista", "AREA"); ld.energy = a["relleno"]; ld.size = 2.0
        lo = bpy.data.objects.new("relleno_vista", ld); esc.collection.objects.link(lo)
        lo.location = a["desde"] + Vector((0, 0, 0.6)); lo.rotation_euler = cam.rotation_euler
    w, h = (int(x) for x in a["px"].split("x"))
    esc.render.resolution_x, esc.render.resolution_y, esc.render.resolution_percentage = w, h, 100
    if a["motor"] == "cycles":
        esc.render.engine = "CYCLES"; esc.cycles.device = "CPU"; esc.cycles.samples = a["muestras"]; esc.cycles.use_denoising = True
    else:
        esc.render.engine = "BLENDER_EEVEE"
        if hasattr(esc.eevee, "taa_render_samples"):
            esc.eevee.taa_render_samples = a["muestras"]
    horneados = aplica_horneado(os.path.abspath(a["horneado"])) if a["horneado"] else None
    esc.view_settings.exposure = a["exposicion"]
    esc.render.image_settings.file_format = "PNG"; esc.render.filepath = os.path.abspath(a["salida"])
    t = time.time()
    bpy.ops.render.render(write_still=True)
    info = {"salida": os.path.basename(a["salida"]), "motor": esc.render.engine, "muestras": a["muestras"], "px": [w, h],
            "desde": list(a["desde"]), "hacia": list(a["hacia"]), "relleno_w": a["relleno"], "exposicion": a["exposicion"], "con_horneado": horneados, "segundos_render": round(time.time() - t, 1)}
    json.dump(info, open(os.path.splitext(a["salida"])[0] + ".json", "w"), indent=1)
    print("VISTA", json.dumps(info))


principal()
