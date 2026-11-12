# Render de comprobación de un mundo interior (no es el horneado): una cámara en un punto mirando a otro.
#   blender --background <mundo.blend> --python vista.py -- <salida.png> --desde x,y,z --hacia x,y,z
#       [--motor eevee|cycles] [--muestras 32] [--px 1280x720] [--lente 18] [--exposicion 0] [--relleno 0]
#       [--ocultar AUXILIAR,…]
# Coordenadas de Blender (Z arriba; glb: x = x, y = z_b, z = -y_b). --relleno W añade, solo para esta vista, una luz de
# área de W vatios en la cámara para ver el interior aunque el sol y el cielo no lleguen: así se distingue «está todo
# en su sitio» de «falta luz», que es cosa del horneado. Escribe <salida>.json con el tiempo de render.
import bpy, sys, json, os, time
from mathutils import Vector


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"salida": a[0], "desde": None, "hacia": None, "motor": "eevee", "muestras": 32, "px": "1280x720", "lente": 18.0,
         "exposicion": 0.0, "relleno": 0.0, "ocultar": "AUXILIAR"}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        if k in ("desde", "hacia"):
            o[k] = Vector(map(float, v.split(",")))
        elif k in ("muestras",):
            o[k] = int(v)
        elif k in ("lente", "exposicion", "relleno"):
            o[k] = float(v)
        else:
            o[k] = v
    return o


def principal():
    a = argumentos(); esc = bpy.context.scene
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
    esc.view_settings.exposure = a["exposicion"]
    esc.render.image_settings.file_format = "PNG"; esc.render.filepath = os.path.abspath(a["salida"])
    t = time.time()
    bpy.ops.render.render(write_still=True)
    info = {"salida": os.path.basename(a["salida"]), "motor": esc.render.engine, "muestras": a["muestras"], "px": [w, h],
            "desde": list(a["desde"]), "hacia": list(a["hacia"]), "relleno_w": a["relleno"], "segundos_render": round(time.time() - t, 1)}
    json.dump(info, open(os.path.splitext(a["salida"])[0] + ".json", "w"), indent=1)
    print("VISTA", json.dumps(info))


principal()
