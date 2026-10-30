# Capturas de los 12 cuerpos base en fila (AV3), para revisarlos a ojo antes de ofrecerlos (decisión 130).
#   blender --background --python tuberia/avatares/creador/capturas.py -- --origen <carpeta con los cuerpo-*.vrm> --salida pruebas/salida/capturas-avatares-cuerpos
# Importa cada VRM con el VRM Add-on (de paso comprueba que se lee de vuelta), los pone en fila (peque → mayor; delgada, media, ancha) y los tiñe
# como lo haría el motor: un tono de piel de una escala de 10 y un color de ropa con nombre de campo (ILUSTRATIVO: las paletas son de AV4).
# Render con Workbench (sin GPU dedicada; luz de estudio, colores del material): «frente.png», «tres-cuartos.png» y «caras.png».
import bpy
import json
import os
import sys
import math

# escala de 10 tonos de piel, de muy claro a muy oscuro (ilustrativa; la paleta de verdad la fija AV4 con el criterio C2)
PIELES = ["#f6dcc8", "#eac2a2", "#d9a47c", "#c68b62", "#b07a55", "#96603f", "#7d4e33", "#643c27", "#4b2c1d", "#352016"]
# colores de ropa con nombre de campo (C5): verde olivo, tierra, almagra, trigo, cielo, cal, adelfa
ROPAS = ["#6b7a3a", "#8b6a4a", "#9c3d2a", "#d8c27a", "#8fb3cf", "#ecebe4", "#c98aa0"]
EDADES, COMPLEXIONES = ["peque", "joven", "adulta", "mayor"], ["delgada", "media", "ancha"]
PASO = 1.8   # más que la envergadura en T de un adulto (≈ 1,66 m): las manos no tapan al de al lado


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"origen": os.environ.get("GEMELO_AVATARES_ORIGEN"), "salida": None}
    for i in range(0, len(a), 2):
        if a[i] == "--origen": o["origen"] = a[i + 1]
        elif a[i] == "--salida": o["salida"] = a[i + 1]
        else: raise SystemExit("capturas.py: argumento desconocido " + a[i])
    if not o["origen"] or not o["salida"]: raise SystemExit("capturas.py: faltan --origen y --salida")
    return o


def lineal(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def tine(objs, piel, ropa):
    for o in objs:
        if o.type != "MESH": continue
        for slot in o.material_slots:
            m = slot.material
            if not m: continue
            nuevo = m.copy(); slot.material = nuevo
            base = m.name.split(".")[0].lower()
            if "piel" in base: nuevo.diffuse_color = lineal(piel)
            elif "ropa" in base: nuevo.diffuse_color = lineal(ropa)
            else: nuevo.diffuse_color = lineal("#3b2c25")
            nuevo.roughness = 0.9; nuevo.metallic = 0.0


def rotulo(texto, x, z, tam=0.07):
    bpy.ops.object.text_add(location=(x, -0.3, z), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.object; t.data.body = texto; t.data.align_x = "CENTER"; t.data.size = tam
    t.data.materials.append(bpy.data.materials.get("rotulo") or bpy.data.materials.new("rotulo"))
    t.data.materials[0].diffuse_color = (0.05, 0.05, 0.05, 1)
    return t


def camara(nombre, pos, rot, orto=None, lente=50):
    d = bpy.data.cameras.new(nombre)
    if orto: d.type = "ORTHO"; d.ortho_scale = orto
    else: d.lens = lente
    c = bpy.data.objects.new(nombre, d); bpy.context.scene.collection.objects.link(c)
    c.location = pos; c.rotation_euler = rot
    return c


def main():
    o = argumentos()
    os.makedirs(o["salida"], exist_ok=True)
    import addon_utils
    for m in addon_utils.modules():
        if m.__name__.endswith(".vrm") or m.__name__ == "vrm": addon_utils.enable(m.__name__, default_set=True)
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
    n, alturas, filas = 0, [], []
    for e in EDADES:
        for c in COMPLEXIONES:
            ident = "cuerpo-" + e + "-" + c
            f = os.path.join(o["origen"], ident + ".vrm")
            if not os.path.exists(f): raise SystemExit("capturas.py: falta " + f)
            antes = set(bpy.data.objects)
            r = bpy.ops.import_scene.vrm(filepath=f)
            if "FINISHED" not in r: raise SystemExit("capturas.py: el VRM Add-on no importó " + f)
            nuevos = [ob for ob in bpy.data.objects if ob not in antes]
            raiz = [ob for ob in nuevos if ob.parent is None]
            x = (n - 5.5) * PASO
            for ob in raiz: ob.location.x += x
            tine(nuevos, PIELES[(n * 7) % len(PIELES)], ROPAS[n % len(ROPAS)])
            bpy.context.view_layer.update()
            zs = [(ob.matrix_world @ v.co).z for ob in nuevos if ob.type == "MESH" for v in ob.data.vertices]
            alto = max(zs) - min(zs); alturas.append(alto)
            rotulo(e + " · " + c, x, -0.16, 0.13)
            rotulo(("%.2f m" % alto) + ("  (no ofrecer)" if e == "peque" else ""), x, -0.32, 0.1)
            filas.append({"id": ident, "x": x, "altura_m": round(alto, 3), "piel": PIELES[(n * 7) % len(PIELES)], "ropa": ROPAS[n % len(ROPAS)], "objetos": len(nuevos)})
            n += 1
    # suelo y escena
    bpy.ops.mesh.primitive_plane_add(size=1, location=(0, 0.6, -0.001)); s = bpy.context.object; s.scale = (12 * PASO, 3, 1)
    s.data.materials.append(bpy.data.materials.new("suelo")); s.data.materials[0].diffuse_color = lineal("#d9d2bf")
    esc = bpy.context.scene
    esc.render.engine = "BLENDER_WORKBENCH"
    sh = esc.display.shading
    sh.light = "STUDIO"; sh.color_type = "MATERIAL"; sh.show_cavity = True; sh.cavity_type = "WORLD"; sh.show_shadows = True
    sh.show_specular_highlight = False
    if bpy.data.worlds: w = bpy.data.worlds[0]
    else: w = bpy.data.worlds.new("mundo"); esc.world = w
    w.color = (0.93, 0.92, 0.89)
    esc.render.film_transparent = False
    esc.render.resolution_percentage = 100
    alto = max(alturas)
    tomas = [
        ("frente.png", camara("frente", (0, -12, alto / 2 - 0.05), (math.pi / 2, 0, 0), orto=12 * PASO + 0.4), (3600, 560)),
        ("tres-cuartos.png", camara("tres", (11, -19, 3.2), (math.radians(82), 0, math.radians(30)), lente=40), (3000, 1000)),
    ]
    for nombre, cam, (rx, ry) in tomas:
        esc.camera = cam; esc.render.resolution_x = rx; esc.render.resolution_y = ry
        esc.render.filepath = os.path.join(o["salida"], nombre)
        bpy.ops.render.render(write_still=True)
    # caras: las 4 edades de complexión media, de cerca
    for e in EDADES:
        fila = [f for f in filas if f["id"] == "cuerpo-" + e + "-media"][0]
        cam = camara("cara-" + e, (fila["x"], -1.1, fila["altura_m"] - 0.12), (math.pi / 2, 0, 0), orto=0.42)
        esc.camera = cam; esc.render.resolution_x = 600; esc.render.resolution_y = 600
        esc.render.filepath = os.path.join(o["salida"], "cara-" + e + ".png")
        bpy.ops.render.render(write_still=True)
    with open(os.path.join(o["salida"], "capturas.json"), "w", encoding="utf-8") as f:
        json.dump({"blender": bpy.app.version_string, "cuerpos": filas, "nota": "tonos y colores ILUSTRATIVOS (paletas de AV4)"}, f, ensure_ascii=False, indent=2)
    print("capturas: " + str(n) + " cuerpos en " + o["salida"], flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        print(str(e), file=sys.stderr); sys.exit(1)
    except Exception:
        import traceback; traceback.print_exc(); sys.exit(1)
