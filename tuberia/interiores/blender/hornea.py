# Hornea la luz de un mundo interior preparado (prepara.py) con Cycles en CPU, objeto a objeto.
#   blender --background <mundo.blend> --python hornea.py -- --salida <carpeta>
#       [--objetos todos|a,b,c]        qué objetos (por defecto, todos los horneables: fuera AUXILIAR, DESCARTES y EFECTOS)
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
#       [--reanuda]                    salta los objetos cuyo mapa ya está en <salida> (para seguir tras un corte) y
#                                      va escribiendo hornea.json objeto a objeto
#       [--modo color|aparte]          color (por defecto): lo de siempre, un mapa por objeto; aparte (fábrica 1.1, luz aparte
#                                      del color): un mapa de luz por atlas y la oclusión propia de las máquinas con luz
#                                      propia (ver «modo aparte» al final); [--escala-ao 0.5] lado del atlas de oclusión
#       [--sondas] [--sonda-en x,y,z] [--sonda-px 16] [--sonda-muestras 32]   (aparte) la sonda de luz de la sala y de cada
#                                      máquina con luz propia, en sondas.json
# Escribe en <salida>: <objeto>_<tipo>.exr (y _dn si hay denoise) y hornea.json con lo que tardó cada objeto.
# No toca los materiales: añade un nodo de imagen temporal por material para hornear y lo quita al acabar.
import bpy, sys, json, os, time
import numpy as np
from mathutils import Vector

UV_LUZ = "luz"
NODO = "gemelo_horneado"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": None, "objetos": "todos", "resolucion": "auto", "escala": 1.0, "muestras": 64, "rebotes": 4, "denoise": "oidn",
         "tipo": "luz", "destino": "textura", "margen": 8, "hilos": 0, "guarda-blend": False, "reanuda": False,
         "modo": "color", "escala-ao": 0.5, "sondas": False, "sonda-en": None, "sonda-px": 16, "sonda-muestras": 32}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-")
        if k in ("guarda-blend", "reanuda", "sondas"):
            o[k] = True; i += 1; continue
        v = a[i + 1]; i += 2
        o[k] = float(v) if k in ("escala", "escala-ao") else int(v) if k in ("muestras", "rebotes", "margen", "hilos", "sonda-px", "sonda-muestras") else v
    if not o["salida"]:
        raise SystemExit("falta --salida <carpeta>")
    return o


def horneables():
    fuera = set()
    for n in ("AUXILIAR", "DESCARTES", "EFECTOS"):
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
    ruta_informe = os.path.join(a["salida"], "hornea.json")
    if a["reanuda"] and os.path.exists(ruta_informe):
        informe["objetos"] = json.load(open(ruta_informe, encoding="utf-8")).get("objetos", {})
    for o in objs:
        hecho = os.path.join(a["salida"], "%s_%s%s.exr" % (o.name, a["tipo"], "_dn" if a["denoise"] == "oidn" else ""))
        if a["reanuda"] and a["destino"] == "textura" and os.path.exists(hecho) and o.name in informe["objetos"]:
            print("HORNEA", o.name, "ya estaba: se salta", flush=True); continue
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
        if a["reanuda"]:
            json.dump(informe, open(ruta_informe, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    quita_nodos()
    informe["segundos_total"] = round(sum(f.get("segundos", 0) for f in informe["objetos"].values()), 1)
    informe["segundos_esta_pasada"] = round(time.time() - t0, 1)
    json.dump(informe, open(ruta_informe, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    if a["guarda-blend"]:
        bpy.ops.wm.save_mainfile(compress=True)
    print("HORNEA_TOTAL", informe["segundos_total"])


# ---- modo «aparte» (fábrica 1.1, contrato mundo-interior §1c, ADR-0034) ----
# Un mapa de luz por ATLAS (los objetos con la misma propiedad gemelo_atlas_luz comparten imagen: la maquinaria fija y las
# máquinas que salen de maquinas.py comparten el UV «luz» de la malla de la que salieron): luz difusa sin color (como --tipo luz)
# de lo fijo y de las máquinas con luz «horneada», en <atlas>_luz.exr; y la oclusión PROPIA (solo el objeto, lo demás oculto) de
# las máquinas con luz «propia» y de lo que cuelga de ellas, en <atlas>_ao.exr (a --escala-ao del lado). Reanudable: tras cada
# objeto se guarda el atlas a medias y hornea.json; con --reanuda, el atlas se vuelve a abrir y se sigue sin borrar.
# --sondas: la luz de la sala en armónicos esféricos (sonda.py) desde --sonda-en x,y,z (marco de Blender; por defecto el centro
# de lo horneable a 1,6 m del suelo) y desde el pivote de cada máquina con luz propia (sin ella), con seis caras de cubo de
# --sonda-px px en Cycles: sondas.json. El color (el albedo) no se hornea aquí: lo pone exporta.py --modo aparte.
import math as _m
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sonda as _sonda  # noqa: E402
from recuento import pico_memoria_mb  # noqa: E402


def atlas_de(o):
    return o.get("gemelo_atlas_luz") or o.name


def luz_propia(o):
    """Una máquina con luz propia, o lo que cuelga de ella sin ser máquina (las poleas nuevas)"""
    while o is not None:
        if o.get("gemelo_maquina"):
            return o.get("gemelo_luz") == "propia"
        o = o.parent
    return False


def imagen_atlas(nombre, lado, ruta, reanuda):
    img = bpy.data.images.get(nombre)
    if img is not None:
        return img, False
    if reanuda and os.path.exists(ruta):
        img = bpy.data.images.load(ruta, check_existing=False); img.name = nombre
        return img, False
    return bpy.data.images.new(nombre, lado, lado, alpha=False, float_buffer=True), True


def solo(o, vivos):
    """Oculta en el render todo menos `vivos`; devuelve cómo estaba"""
    antes = {x.name: x.hide_render for x in bpy.context.scene.objects}
    for x in bpy.context.scene.objects:
        if x.type in ("MESH", "CURVE") and x.name not in vivos:
            x.hide_render = True
    return antes


def devuelve(antes):
    for n, h in antes.items():
        bpy.context.scene.objects[n].hide_render = h


def cara_cubo(esc, cam, d, n, ruta):
    cam.rotation_euler = Vector(d).to_track_quat("-Z", "Y").to_euler()
    esc.render.filepath = ruta; bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(ruta, check_existing=False); px = np.empty(n * n * 4, dtype=np.float32); img.pixels.foreach_get(px)
    bpy.data.images.remove(img); px = px.reshape(n, n, 4)
    R = cam.rotation_euler.to_matrix(); sal = []
    for j in range(n):
        for i in range(n):
            x, y = 2 * (i + 0.5) / n - 1, 2 * (j + 0.5) / n - 1
            sal.append((list(R @ Vector((x, y, -1))), [float(v) for v in px[j, i, :3]], _sonda.peso_cubo(x, y)))
    return sal


def sonda_en(punto, n, muestras, carpeta, ocultos=()):
    esc = bpy.context.scene
    g = {"cam": esc.camera, "px": (esc.render.resolution_x, esc.render.resolution_y, esc.render.resolution_percentage),
         "fmt": esc.render.image_settings.file_format, "ruta": esc.render.filepath, "muestras": esc.cycles.samples}
    cd = bpy.data.cameras.new("gemelo_sonda"); cd.angle = _m.pi / 2; cd.clip_start = 0.01
    cam = bpy.data.objects.new("gemelo_sonda", cd); esc.collection.objects.link(cam); cam.location = punto; esc.camera = cam
    esc.render.resolution_x = esc.render.resolution_y = n; esc.render.resolution_percentage = 100
    esc.render.image_settings.file_format = "OPEN_EXR"; esc.cycles.samples = muestras
    antes = {x.name: x.hide_render for x in esc.objects}
    for x in list(ocultos) + [o for c in ("EFECTOS", "AUXILIAR") if bpy.data.collections.get(c) for o in bpy.data.collections[c].all_objects]:
        x.hide_render = True
    m = []
    for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
        m += cara_cubo(esc, cam, d, n, os.path.join(carpeta, "_sonda.exr"))
    devuelve(antes)
    esc.camera = g["cam"]; esc.render.resolution_x, esc.render.resolution_y, esc.render.resolution_percentage = g["px"]
    esc.render.image_settings.file_format = g["fmt"]; esc.render.filepath = g["ruta"]; esc.cycles.samples = g["muestras"]
    bpy.data.objects.remove(cam); bpy.data.cameras.remove(cd)
    try:
        os.remove(os.path.join(carpeta, "_sonda.exr"))
    except OSError:
        pass
    return _sonda.sh9(m)


def principal_aparte(a):
    t0 = time.time(); os.makedirs(a["salida"], exist_ok=True); ajusta_cycles(a)
    objs = horneables()
    if a["objetos"] != "todos":
        pedidos = a["objetos"].split(","); objs = [o for o in objs if o.name in pedidos]
        falta = set(pedidos) - {o.name for o in objs}
        if falta:
            raise SystemExit("no son horneables o no existen: " + ", ".join(sorted(falta)))
    ruta_informe = os.path.join(a["salida"], "hornea.json")
    informe = {"blend": os.path.basename(bpy.data.filepath), "modo": "aparte", "parametros": {k: v for k, v in a.items() if k != "salida"}, "objetos": {}, "atlas": {}}
    if a["reanuda"] and os.path.exists(ruta_informe):
        viejo = json.load(open(ruta_informe, encoding="utf-8")); informe["objetos"] = viejo.get("objetos", {}); informe["atlas"] = viejo.get("atlas", {})
    todos = {o.name for o in bpy.context.scene.objects}
    for o in objs:
        if a["reanuda"] and o.name in informe["objetos"]:
            print("HORNEA", o.name, "ya estaba: se salta", flush=True); continue
        if UV_LUZ not in o.data.uv_layers:
            raise SystemExit(o.name + " no tiene el UV «luz»: pasa antes prepara.py")
        propia = luz_propia(o); at = atlas_de(o); clase = "ao" if propia else "luz"
        lado = resolucion(o, a)
        if propia:
            lado = max(16, int(lado * a["escala-ao"]))
        nombre = "%s_%s" % (at, clase); ruta = os.path.join(os.path.abspath(a["salida"]), nombre + ".exr")
        img, nueva = imagen_atlas(nombre, lado, ruta, a["reanuda"])
        t = time.time(); fila = {"atlas": at, "clase": clase, "lado_px": img.size[0], "triangulos": sum(len(p.vertices) - 2 for p in o.data.polygons)}
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        render = next((u for u in o.data.uv_layers if u.active_render), None); o.data.uv_layers.active = o.data.uv_layers[UV_LUZ]
        pon_nodos(o, img)
        limpia = nueva and not informe["atlas"].get(nombre)
        if propia:
            antes = solo(o, {o.name})
            bpy.ops.object.bake(type="AO", target="IMAGE_TEXTURES", margin=a["margen"], use_clear=limpia)
            devuelve(antes)
        else:
            tipo, filtro = paso_de_horneado("luz")
            bpy.ops.object.bake(type=tipo, pass_filter=filtro, target="IMAGE_TEXTURES", margin=a["margen"], use_clear=limpia)
        if render is not None:
            render.active_render = True
        img.filepath_raw = ruta; img.file_format = "OPEN_EXR"; img.save()
        informe["atlas"][nombre] = {"fichero": nombre + ".exr", "lado_px": img.size[0], "clase": clase}
        fila["segundos"] = round(time.time() - t, 1); informe["objetos"][o.name] = fila
        print("HORNEA", o.name, json.dumps(fila, ensure_ascii=False), flush=True)
        json.dump(informe, open(ruta_informe, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    quita_nodos()
    if a["denoise"] == "oidn":
        for nombre, f in informe["atlas"].items():
            td = time.time(); ruta = os.path.join(os.path.abspath(a["salida"]), f["fichero"])
            denoise(ruta, ruta[:-4] + "_dn.exr", f["lado_px"], f["lado_px"]); f["fichero_denoise"] = nombre + "_dn.exr"; f["segundos_denoise"] = round(time.time() - td, 1)
    if a["sondas"]:
        ts = time.time(); sal = {}; bpy.context.scene.render.use_persistent_data = True   # el BVH de Cycles, una vez para todas las caras
        if a["sonda-en"]:
            p = Vector(map(float, a["sonda-en"].split(",")))
        else:
            cs = [o.matrix_world @ Vector(c) for o in horneables() for c in o.bound_box]
            p = Vector(((min(c.x for c in cs) + max(c.x for c in cs)) / 2, (min(c.y for c in cs) + max(c.y for c in cs)) / 2, min(c.z for c in cs) + 1.6))
        sal["sala"] = {"en_blender": [round(v, 3) for v in p], "sh": sonda_en(p, a["sonda-px"], a["sonda-muestras"], a["salida"])}
        for o in bpy.context.scene.objects:
            if o.get("gemelo_maquina") and o.get("gemelo_luz") == "propia" and (a["objetos"] == "todos" or o.name in a["objetos"].split(",")):
                ocultos = [o] + list(o.children_recursive)
                sal[o["gemelo_maquina"]] = {"en_blender": [round(v, 3) for v in o.matrix_world.translation], "sh": sonda_en(o.matrix_world.translation, a["sonda-px"], a["sonda-muestras"], a["salida"], ocultos)}
        json.dump(sal, open(os.path.join(a["salida"], "sondas.json"), "w", encoding="utf-8"), indent=1)
        informe["sondas"] = {"cuantas": len(sal), "segundos": round(time.time() - ts, 1)}
    informe["segundos_total"] = round(sum(f.get("segundos", 0) for f in informe["objetos"].values()), 1)
    informe["segundos_esta_pasada"] = round(time.time() - t0, 1); informe["pico_memoria_mb"] = pico_memoria_mb()
    json.dump(informe, open(ruta_informe, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("HORNEA_TOTAL", informe["segundos_total"], json.dumps(informe.get("sondas", {})), "pico_memoria_mb", informe["pico_memoria_mb"])


if argumentos()["modo"] == "aparte":
    principal_aparte(argumentos())
else:
    principal()
