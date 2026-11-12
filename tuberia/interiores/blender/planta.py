# Planta de un mundo interior: render ortográfico cenital (Workbench, con texturas), cortado a una altura para que se
# vean los huecos de los muros, con las puertas numeradas y rotuladas si se le da su lista.
#   blender --background <mundo.blend> --python planta.py -- <salida.png> [--corte 1.6] [--px 2000] [--puertas puertas.json]
#           [--mundo fabrica] [--margen 1.5] [--rejilla 1] [--ocultar AUXILIAR,carpinteria]
# puertas.json: {"puertas": [{"n": 1, "id": "…", "mundo": "patios", "blender": [x, y, z], "ancho": 1.0, "sale": [dx, dy]}…]}
# (coordenadas de Blender, Z arriba). Se dibuja cada puerta como una barra roja del ancho del hueco, una flecha hacia
# donde se sale y su número (todo por debajo del plano de corte, o la cámara lo recorta); la rejilla marca cada metro (y cada 5 m más gruesa). Nada se guarda en el .blend.
import bpy, bmesh, sys, json, math, os
from mathutils import Vector


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": a[0], "corte": 1.6, "px": 2000, "puertas": None, "mundo": None, "margen": 1.5, "rejilla": 1.0, "ocultar": "AUXILIAR"}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        o[k] = v if k in ("puertas", "mundo", "ocultar") else float(v)
    return o


def caja(objetos):
    mn = Vector((1e9, 1e9, 1e9)); mx = -mn
    for o in objetos:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx


def material_plano(nombre, rgb):
    m = bpy.data.materials.new(nombre); m.diffuse_color = (*rgb, 1)
    return m


def malla(nombre, verts, caras, mat):
    me = bpy.data.meshes.new(nombre); me.from_pydata(verts, [], caras); me.materials.append(mat)
    o = bpy.data.objects.new(nombre, me); bpy.context.scene.collection.objects.link(o)
    o.color = (*mat.diffuse_color[:3], 1)
    return o


def texto(cuerpo, pos, tam, mat):
    cu = bpy.data.curves.new("rotulo", "FONT"); cu.body = cuerpo; cu.size = tam; cu.align_x = "CENTER"; cu.align_y = "CENTER"
    o = bpy.data.objects.new("rotulo", cu); o.location = pos; cu.materials.append(mat)
    o.color = (*mat.diffuse_color[:3], 1)
    bpy.context.scene.collection.objects.link(o)
    return o


def principal():
    a = argumentos(); esc = bpy.context.scene
    # --ocultar: nombres de objetos o de colecciones separados por comas (por defecto, las sombras pintadas)
    for n in [x for x in a["ocultar"].split(",") if x]:
        c = bpy.data.collections.get(n)
        for o in (list(c.all_objects) if c else [bpy.data.objects.get(n)]):
            if o is not None and o.type in ("MESH", "FONT"):
                o.hide_render = True; o.hide_viewport = True
    objetos = [o for o in esc.objects if o.type == "MESH" and o.visible_get()]
    mn, mx = caja(objetos)
    m = a["margen"]; mn.x -= m; mn.y -= m; mx.x += m; mx.y += m
    ancho, alto = mx.x - mn.x, mx.y - mn.y
    z_cam = mx.z + 20
    cam_d = bpy.data.cameras.new("planta"); cam_d.type = "ORTHO"; cam_d.ortho_scale = max(ancho, alto)
    cam_d.clip_start = z_cam - a["corte"]; cam_d.clip_end = z_cam - mn.z + 5
    cam = bpy.data.objects.new("planta", cam_d); esc.collection.objects.link(cam)
    cam.location = ((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, z_cam); cam.rotation_euler = (0, 0, 0)
    esc.camera = cam
    px = int(a["px"]); esc.render.resolution_x = px if ancho >= alto else int(px * ancho / alto)
    esc.render.resolution_y = px if alto > ancho else int(px * alto / ancho); esc.render.resolution_percentage = 100
    esc.render.engine = "BLENDER_WORKBENCH"
    s = esc.display.shading; s.light = "FLAT"; s.color_type = "TEXTURE"; s.show_cavity = True
    s.cavity_type = "BOTH"; s.show_object_outline = True; s.object_outline_color = (0, 0, 0)
    s.show_backface_culling = False
    s.background_type = "VIEWPORT"; s.background_color = (0.55, 0.55, 0.55)
    esc.render.film_transparent = False
    esc.display_settings.display_device = "sRGB"; esc.view_settings.view_transform = "Standard"
    # rejilla de metros (una cota bajo el corte, por encima de todo lo demás no: se dibuja a la altura del corte - 2 cm)
    zr = a["corte"] - 0.02
    gris = material_plano("rejilla", (0.15, 0.15, 0.6)); gris5 = material_plano("rejilla5", (0.05, 0.05, 0.35))
    paso = a["rejilla"]
    def linea(x0, y0, x1, y1, g, mat):
        d = Vector((x1 - x0, y1 - y0, 0)); n = Vector((-d.y, d.x, 0)).normalized() * g / 2
        p0 = Vector((x0, y0, zr)); p1 = Vector((x1, y1, zr))
        malla("linea", [p0 - n, p0 + n, p1 + n, p1 - n], [(0, 1, 2, 3)], mat)
    x = math.floor(mn.x)
    while x <= mx.x:
        linea(x, mn.y, x, mx.y, 0.05 if x % 5 == 0 else 0.015, gris5 if x % 5 == 0 else gris); x += paso
    y = math.floor(mn.y)
    while y <= mx.y:
        linea(mn.x, y, mx.x, y, 0.05 if y % 5 == 0 else 0.015, gris5 if y % 5 == 0 else gris); y += paso
    for x in range(math.ceil(mn.x / 5) * 5, int(mx.x) + 1, 5):
        texto("x=%d" % x, (x, mn.y + 0.5, zr), 0.45, gris5)
    for y in range(math.ceil(mn.y / 5) * 5, int(mx.y) + 1, 5):
        texto("y=%d" % y, (mn.x + 0.8, y + 0.3, zr), 0.45, gris5)
    # sección: lo que corta el plano z = corte, dibujado como trazo negro de 7 cm (los muros de una sola cara no se verían)
    negro = material_plano("seccion", (0.02, 0.02, 0.02))
    vs, cs = [], []
    for o in objetos:
        bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
        r = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, a["corte"]), plane_no=(0, 0, 1))
        for e in [g for g in r["geom_cut"] if isinstance(g, bmesh.types.BMEdge)]:
            p0, p1 = e.verts[0].co.copy(), e.verts[1].co.copy(); d = p1 - p0; d.z = 0
            if d.length < 1e-5:
                continue
            n = Vector((-d.y, d.x, 0)).normalized() * 0.035; ext = d.normalized() * 0.035
            p0.z = p1.z = zr + 0.005; k = len(vs)
            vs += [p0 - n - ext, p0 + n - ext, p1 + n + ext, p1 - n + ext]; cs.append((k, k + 1, k + 2, k + 3))
        bm.free()
    if vs:
        malla("seccion", vs, cs, negro)
    # puertas
    if a["puertas"]:
        rojo = material_plano("puerta", (0.9, 0.05, 0.05)); blanco = material_plano("fondo", (1, 1, 1))
        for p in json.load(open(a["puertas"], encoding="utf-8"))["puertas"]:
            if a["mundo"] and a["mundo"] not in p.get("mundos", [p.get("mundo")]):
                continue
            c = Vector((p["blender"][0], p["blender"][1], zr + 0.004)); s_ = Vector((p["sale"][0], p["sale"][1], 0)).normalized()
            t = Vector((-s_.y, s_.x, 0)) * p["ancho"] / 2
            n = s_ * 0.12
            malla("hueco", [c - t - n, c + t - n, c + t + n, c - t + n], [(0, 1, 2, 3)], rojo)
            f0 = c + s_ * 0.2; f1 = c + s_ * 1.3; lat = Vector((-s_.y, s_.x, 0)) * 0.1
            malla("flecha", [f0 - lat, f1 - lat, f1 + lat, f0 + lat], [(0, 1, 2, 3)], rojo)
            malla("punta", [f1 + lat * 3, f1 + s_ * 0.45, f1 - lat * 3], [(0, 1, 2)], rojo)
            e = c - s_ * 1.0
            malla("disco", [e + Vector((math.cos(k * math.pi / 12) * 0.55, math.sin(k * math.pi / 12) * 0.55, 0.003)) for k in range(24)], [tuple(range(24))], blanco)
            texto(str(p["n"]), e + Vector((0, 0, 0.008)), 0.8, rojo)
            if p.get("rotulo"):
                texto(p["rotulo"], e - Vector((0, 0.9, -0.008)), 0.42, rojo)
    esc.render.filepath = os.path.abspath(a["salida"])
    esc.render.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
    info = {"salida": a["salida"], "min": list(mn), "max": list(mx), "px": [esc.render.resolution_x, esc.render.resolution_y],
            "m_por_px": max(ancho, alto) / max(esc.render.resolution_x, esc.render.resolution_y), "corte_z": a["corte"]}
    json.dump(info, open(os.path.splitext(a["salida"])[0] + ".json", "w"), indent=1)
    print("PLANTA", json.dumps(info))


principal()
