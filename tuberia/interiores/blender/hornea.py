# Hornea la luz de un mundo interior preparado (prepara.py) con Cycles en CPU, objeto a objeto.
#   blender --background <mundo.blend> --python hornea.py -- --salida <carpeta>
#       [--objetos todos|a,b,c]        qué objetos (por defecto, todos los horneables: fuera AUXILIAR y DESCARTES)
#       [--resolucion 1024|auto|auto-quest]  lado del mapa de luz; auto = gemelo_resolucion_pantalla del objeto,
#                                      auto-quest = gemelo_resolucion_quest (los deja prepara.py)
#       [--escala 1.0]                 multiplica la resolución (0.25 para una prueba rápida con la misma proporción)
#       [--muestras 64] [--rebotes 4]  muestras de Cycles por téxel y rebotes de luz
#       [--denoise oidn|no]            OpenImageDenoise en el compositor, sobre el mapa ya horneado
#       [--tipo luz|color_luz|ao|combinado]  luz = difusa directa + indirecta sin el color del material (mapa de luz);
#                                      color_luz = la misma por el color (para materiales sin luz en el Quest);
#                                      ao = oclusión; combinado = todo (incluye brillos: depende de la cámara, no se usa)
#       [--destino textura|vertice]    textura: imagen en el UV «luz»; vertice: atributo de color «luz_horneada» por vértice
#       [--margen 8] [--hilos 0]       margen de dilatación en píxeles; hilos de CPU (0 = todos)
#       [--guarda-blend]               guarda el .blend con las imágenes o atributos horneados enlazados
# Escribe en <salida>: <objeto>_<tipo>.exr (y _dn si hay denoise) y hornea.json con lo que tardó cada objeto.
# No toca los materiales: añade un nodo de imagen temporal por material para hornear y lo quita al acabar.
import bpy, sys, json, os, time

UV_LUZ = "luz"
NODO = "gemelo_horneado"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": None, "objetos": "todos", "resolucion": "auto", "escala": 1.0, "muestras": 64, "rebotes": 4, "denoise": "oidn",
         "tipo": "luz", "destino": "textura", "margen": 8, "hilos": 0, "guarda-blend": False}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-")
        if k == "guarda-blend":
            o[k] = True; i += 1; continue
        v = a[i + 1]; i += 2
        o[k] = float(v) if k == "escala" else int(v) if k in ("muestras", "rebotes", "margen", "hilos") else v
    if not o["salida"]:
        raise SystemExit("falta --salida <carpeta>")
    return o


def horneables():
    fuera = set()
    for n in ("AUXILIAR", "DESCARTES"):
        c = bpy.data.collections.get(n)
        if c:
            fuera |= {o.name for o in c.all_objects}
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in fuera and len(o.data.polygons) and not o.hide_render]


def ajusta_cycles(a):
    esc = bpy.context.scene
    esc.render.engine = "CYCLES"; esc.cycles.device = "CPU"
    esc.cycles.samples = a["muestras"]; esc.cycles.use_adaptive_sampling = False
    esc.cycles.max_bounces = a["rebotes"]; esc.cycles.diffuse_bounces = a["rebotes"]; esc.cycles.glossy_bounces = min(2, a["rebotes"])
    esc.cycles.transparent_max_bounces = 8
    esc.render.threads_mode = "AUTO" if a["hilos"] == 0 else "FIXED"
    if a["hilos"]:
        esc.render.threads = a["hilos"]
    b = esc.render.bake
    b.margin = a["margen"]; b.margin_type = "EXTEND"; b.use_clear = True
    b.target = "VERTEX_COLORS" if a["destino"] == "vertice" else "IMAGE_TEXTURES"


def paso_de_horneado(tipo):
    if tipo == "luz":
        return "DIFFUSE", {"DIRECT", "INDIRECT"}
    if tipo == "color_luz":
        return "DIFFUSE", {"DIRECT", "INDIRECT", "COLOR"}
    if tipo == "ao":
        return "AO", set()
    if tipo == "combinado":
        return "COMBINED", {"DIRECT", "INDIRECT", "COLOR", "DIFFUSE", "GLOSSY", "TRANSMISSION", "EMIT"}
    raise SystemExit("tipo desconocido: " + tipo)


def resolucion(o, a):
    r = a["resolucion"]
    n = int(o.get("gemelo_resolucion_pantalla", 1024)) if r == "auto" else int(o.get("gemelo_resolucion_quest", 1024)) if r == "auto-quest" else int(r)
    return max(16, int(n * a["escala"]))


def pon_nodos(o, img):
    """Un nodo de imagen activo con `img` en cada material del objeto (Cycles hornea en el nodo activo)"""
    for m in o.data.materials:
        if not m or not m.node_tree:
            continue
        nt = m.node_tree
        n = nt.nodes.get(NODO) or nt.nodes.new("ShaderNodeTexImage")
        n.name = NODO; n.label = NODO; n.image = img; n.location = (-900, 600)
        nt.nodes.active = n


def quita_nodos():
    for m in bpy.data.materials:
        if m.node_tree and NODO in m.node_tree.nodes:
            m.node_tree.nodes.remove(m.node_tree.nodes[NODO])


def denoise(ruta_in, ruta_out, ancho, alto):
    """OIDN del compositor de Blender 5 sobre una imagen ya horneada (sin pasar por la escena)"""
    esc = bpy.context.scene
    guardado = {"engine": esc.render.engine, "x": esc.render.resolution_x, "y": esc.render.resolution_y, "pct": esc.render.resolution_percentage,
                "fmt": esc.render.image_settings.file_format, "ruta": esc.render.filepath, "grupo": esc.compositing_node_group,
                "ocultos": {o.name: o.hide_render for o in esc.objects}, "comp": esc.render.use_compositing}
    for o in esc.objects:
        o.hide_render = True
    esc.render.engine = "BLENDER_WORKBENCH"
    esc.render.resolution_x, esc.render.resolution_y, esc.render.resolution_percentage = ancho, alto, 100
    ng = bpy.data.node_groups.new("gemelo_denoise", "CompositorNodeTree")
    ng.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    im = bpy.data.images.load(ruta_in, check_existing=False)
    ni = ng.nodes.new("CompositorNodeImage"); ni.image = im
    nd = ng.nodes.new("CompositorNodeDenoise")
    for k, v in (("prefilter", "NONE"), ("use_hdr", True)):
        if hasattr(nd, k):
            setattr(nd, k, v)
        elif k in nd.inputs:
            nd.inputs[k].default_value = v
    no = ng.nodes.new("NodeGroupOutput")
    ng.links.new(ni.outputs["Image"], nd.inputs["Image"]); ng.links.new(nd.outputs["Image"], no.inputs[0])
    esc.compositing_node_group = ng; esc.render.use_compositing = True
    esc.render.image_settings.file_format = "OPEN_EXR"; esc.render.image_settings.color_depth = "16"
    esc.view_settings.view_transform = esc.view_settings.view_transform  # las EXR se guardan lineales
    esc.render.filepath = ruta_out
    bpy.ops.render.render(write_still=True)
    # deja la escena como estaba
    esc.render.engine = guardado["engine"]; esc.render.resolution_x = guardado["x"]; esc.render.resolution_y = guardado["y"]
    esc.render.resolution_percentage = guardado["pct"]; esc.render.image_settings.file_format = guardado["fmt"]
    esc.render.filepath = guardado["ruta"]; esc.compositing_node_group = guardado["grupo"]; esc.render.use_compositing = guardado["comp"]
    for n, h in guardado["ocultos"].items():
        esc.objects[n].hide_render = h
    bpy.data.node_groups.remove(ng); bpy.data.images.remove(im)


def principal():
    a = argumentos(); t0 = time.time(); esc = bpy.context.scene
    os.makedirs(a["salida"], exist_ok=True)
    ajusta_cycles(a)
    tipo, filtro = paso_de_horneado(a["tipo"])
    objs = horneables()
    if a["objetos"] != "todos":
        pedidos = a["objetos"].split(","); objs = [o for o in objs if o.name in pedidos]
        falta = set(pedidos) - {o.name for o in objs}
        if falta:
            raise SystemExit("no son horneables o no existen: " + ", ".join(sorted(falta)))
    informe = {"blend": os.path.basename(bpy.data.filepath), "parametros": {k: v for k, v in a.items() if k != "salida"}, "objetos": {}}
    for o in objs:
        t = time.time(); fila = {"triangulos": sum(len(p.vertices) - 2 for p in o.data.polygons)}
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        if a["destino"] == "vertice":
            at = o.data.color_attributes.get("luz_horneada") or o.data.color_attributes.new("luz_horneada", "FLOAT_COLOR", "POINT")
            o.data.color_attributes.active_color = at
            bpy.ops.object.bake(type=tipo, pass_filter=filtro, target="VERTEX_COLORS")
            fila.update({"destino": "vertice", "vertices": len(o.data.vertices)})
        else:
            if UV_LUZ not in o.data.uv_layers:
                raise SystemExit(o.name + " no tiene el UV «luz»: pasa antes prepara.py")
            render = next((u for u in o.data.uv_layers if u.active_render), None)
            o.data.uv_layers.active = o.data.uv_layers[UV_LUZ]
            n = resolucion(o, a)
            nombre = "%s_%s" % (o.name, a["tipo"])
            img = bpy.data.images.get(nombre)
            if img is not None:
                bpy.data.images.remove(img)
            img = bpy.data.images.new(nombre, n, n, alpha=False, float_buffer=True)
            pon_nodos(o, img)
            bpy.ops.object.bake(type=tipo, pass_filter=filtro, target="IMAGE_TEXTURES", margin=a["margen"], use_clear=True)
            if render is not None:
                render.active_render = True
            ruta = os.path.join(os.path.abspath(a["salida"]), nombre + ".exr")
            img.filepath_raw = ruta; img.file_format = "OPEN_EXR"; img.save()
            fila.update({"destino": "textura", "lado_px": n, "fichero": os.path.basename(ruta), "segundos_horneado": round(time.time() - t, 1)})
            if a["denoise"] == "oidn":
                td = time.time(); ruta_dn = ruta[:-4] + "_dn.exr"
                denoise(ruta, ruta_dn, n, n)
                fila.update({"fichero_denoise": os.path.basename(ruta_dn), "segundos_denoise": round(time.time() - td, 1)})
            if not a["guarda-blend"]:
                quita_nodos(); bpy.data.images.remove(img)  # una imagen de 4096² en float ocupa ~270 MB: se suelta al guardarla
        fila["segundos"] = round(time.time() - t, 1)
        informe["objetos"][o.name] = fila
        print("HORNEA", o.name, json.dumps(fila, ensure_ascii=False), flush=True)
    quita_nodos()
    informe["segundos_total"] = round(time.time() - t0, 1)
    json.dump(informe, open(os.path.join(a["salida"], "hornea.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    if a["guarda-blend"]:
        bpy.ops.wm.save_mainfile(compress=True)
    print("HORNEA_TOTAL", informe["segundos_total"])


principal()
