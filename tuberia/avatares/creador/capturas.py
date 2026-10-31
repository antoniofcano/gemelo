# Capturas de los 12 cuerpos base con sus piezas (AV3 y AV4), para revisarlos a ojo antes de ofrecerlos (decisión 130).
#   blender --background --python tuberia/avatares/creador/capturas.py -- --origen <carpeta con los cuerpo-*.vrm> --salida pruebas/salida/capturas-avatares-cuerpos
# Importa cada VRM con el VRM Add-on (de paso comprueba que se lee de vuelta), enseña solo las piezas de una receta (las demás, ocultas) y lo tiñe
# como el motor (por nombre de material, con las paletas de AV4: las de `Aspecto` en apps/web/motor/26_presencia.js y las de construye.mjs).
# Render con Workbench (sin GPU dedicada; luz de estudio, colores del material; los tonos oscuros salen algo más apagados que en el motor):
#   frente.png y tres-cuartos.png  los 12 en fila (peque → mayor; delgada, media, ancha), cada uno con una receta distinta
#   peinados.png                   adulta media con cada peinado, el vello, la ropa de faena y los sombreros
#   cuello.png                     el cuello de cerca, de frente y de tres cuartos (decisión 141: la costura)
#   mayor-adulta.png               perfil de adulta y mayor (media), con la misma ropa (decisión 141: que se distingan)
#   cara-<edad>.png                las caras, de complexión media, con pelo
import bpy
import json
import os
import sys
import math

# paletas de AV4 (iguales a Aspecto.PIELES / Aspecto.ROPA del motor y a PALETAS de tuberia/avatares/creador/catalogo.mjs)
PIELES = ["#f6dcc8", "#eec5a6", "#e0ac86", "#cf9670", "#b97d57", "#a06844", "#855436", "#6b412a", "#523020", "#3b2217"]
ROPAS = ["#6b7f3a", "#2f2a2a", "#8a5a3b", "#a8432f", "#d8b65e", "#6f9fc6", "#d77a9a", "#ece7dc", "#4b5563", "#8b7bb5"]
PELOS = ["#1f1a17", "#3d2a1e", "#6a4a30", "#8f6a45", "#c9a465", "#a5522c", "#9a9690", "#e6e3dc"]
SOMBRERO = {"sombrero-paja": "#d9bf6a", "sombrero-gorra": "#2e5d34"}
EDADES, COMPLEXIONES = ["peque", "joven", "adulta", "mayor"], ["delgada", "media", "ancha"]
PASO = 1.8   # más que la envergadura en T de un adulto (≈ 1,66 m): las manos no tapan al de al lado
# una receta por cuerpo en la fila (tono, arriba, abajo, pelo, color de pelo, vello, ropa, sombrero): variadas a propósito, sin ligar nada al cuerpo
RECETAS = [
    (2, 5, 8, "pelo-corto", 2, None, None, None), (8, 4, 1, "pelo-afro", 0, None, None, None), (5, 6, 2, "pelo-recogido", 5, None, None, "sombrero-paja"),
    (0, 0, 2, "pelo-largo", 4, None, "ropa-faena", None), (9, 3, 8, "pelo-rapado", 0, "vello-barba", None, None), (4, 7, 1, "pelo-afro", 1, None, "ropa-faena", "sombrero-gorra"),
    (6, 2, 9, "pelo-largo", 0, None, None, None), (1, 9, 4, "pelo-rapado", 1, "vello-bigote", "ropa-faena", None), (7, 0, 8, "pelo-recogido", 0, None, None, None),
    (3, 8, 2, "pelo-corto", 6, None, "ropa-faena", "sombrero-paja"), (8, 5, 1, "pelo-recogido", 7, None, None, None), (2, 3, 1, "pelo-rapado", 7, "vello-barba", "ropa-faena", "sombrero-gorra"),
]


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"origen": os.environ.get("GEMELO_AVATARES_ORIGEN"), "salida": None, "solo": False}
    if "--prueba" in a: a.remove("--prueba"); o["solo"] = True   # solo las tomas de adulta y mayor (para iterar con dos cuerpos)
    for i in range(0, len(a), 2):
        if a[i] == "--origen": o["origen"] = a[i + 1]
        elif a[i] == "--salida": o["salida"] = a[i + 1]
        else: raise SystemExit("capturas.py: argumento desconocido " + a[i])
    if not o["origen"] or not o["salida"]: raise SystemExit("capturas.py: faltan --origen y --salida")
    o["salida"] = os.path.abspath(o["salida"])   # Blender lee las rutas relativas desde el .blend (o la raíz del disco), no desde el directorio de trabajo
    return o


def lineal(hexa):
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((x / 12.92) if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)


def importa(f, x, y=0.0, giro=0.0):
    antes = set(bpy.data.objects)
    r = bpy.ops.import_scene.vrm(filepath=f)
    if "FINISHED" not in r: raise SystemExit("capturas.py: el VRM Add-on no importó " + f)
    nuevos = [ob for ob in bpy.data.objects if ob not in antes]
    for ob in nuevos:
        if ob.parent is None: ob.location.x += x; ob.location.y += y; ob.rotation_euler.z += giro
    return nuevos


def viste(objs, receta):
    """Como el motor: oculta las piezas que no están en la receta, y las que tapan la ropa base la ocultan; tiñe por nombre de material"""
    tono, arriba, abajo, pelo, color_pelo, vello, ropa, sombrero = receta
    lleva = {p for p in (pelo, vello, ropa, sombrero) if p}
    for o in objs:
        if o.type != "MESH": continue
        n = o.name.split(".")[0]
        if n.startswith("pieza_"):
            o.hide_render = o.hide_viewport = n[6:] not in lleva
        for slot in o.material_slots:
            m = slot.material
            if not m: continue
            nuevo = m.copy(); slot.material = nuevo
            base = m.name.split(".")[0].lower()
            color = {"piel": PIELES[tono], "ropa_base": ROPAS[arriba], "ropa_abajo": ROPAS[abajo], "pelo": PELOS[color_pelo],
                     "sombrero": SOMBRERO.get(n[6:], "#d9bf6a")}.get(base, "#3b2c25")
            nuevo.diffuse_color = lineal(color); nuevo.roughness = 0.9; nuevo.metallic = 0.0
    # con la ropa de faena, el motor no dibuja la ropa base del cuerpo (va debajo); aquí queda debajo, tapada


def rotulo(texto, x, z, tam=0.07, y=-0.3):
    bpy.ops.object.text_add(location=(x, y, z), rotation=(math.pi / 2, 0, 0))
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


def escena():
    esc = bpy.context.scene   # el motor de render se pone en foto(): con Workbench activo, el VRM Add-on no puede importar (pide la vista «MATERIAL»)
    sh = esc.display.shading
    sh.light = "STUDIO"; sh.color_type = "MATERIAL"; sh.show_cavity = True; sh.cavity_type = "WORLD"; sh.show_shadows = False   # sin sombras: el brazo en T dejaba una raya en el pecho
    sh.show_specular_highlight = False; sh.show_backface_culling = True
    w = bpy.data.worlds[0] if bpy.data.worlds else bpy.data.worlds.new("mundo"); esc.world = w
    w.color = (0.93, 0.92, 0.89)
    esc.render.film_transparent = False; esc.render.resolution_percentage = 100
    return esc


def foto(esc, cam, ruta, rx, ry):
    antes = esc.render.engine
    esc.render.engine = "BLENDER_WORKBENCH"
    esc.camera = cam; esc.render.resolution_x = rx; esc.render.resolution_y = ry; esc.render.filepath = ruta
    bpy.ops.render.render(write_still=True)
    esc.render.engine = antes


def vacia():
    for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)


def suelo(ancho, x=0.0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=(x, 0.6, -0.001)); s = bpy.context.object; s.scale = (ancho, 3, 1)
    m = bpy.data.materials.get("suelo") or bpy.data.materials.new("suelo"); m.diffuse_color = lineal("#d9d2bf"); s.data.materials.append(m)


def alto_de(objs):
    zs = [(ob.matrix_world @ v.co).z for ob in objs if ob.type == "MESH" and not ob.hide_render and not ob.name.startswith("pieza_") for v in ob.data.vertices]
    return max(zs) - min(zs)


def main():
    o = argumentos()
    os.makedirs(o["salida"], exist_ok=True)
    import addon_utils
    for m in addon_utils.modules():
        if m.__name__.endswith(".vrm") or m.__name__ == "vrm": addon_utils.enable(m.__name__, default_set=True)
    fich = lambda e, c: os.path.join(o["origen"], "cuerpo-" + e + "-" + c + ".vrm")
    for e in EDADES:
        for c in COMPLEXIONES:
            if not os.path.exists(fich(e, c)) and not (o["solo"] and c == "media" and e in ("adulta", "mayor")): continue
            if not os.path.exists(fich(e, c)): raise SystemExit("capturas.py: falta " + fich(e, c))
    esc = escena()
    if not o["solo"]: fila(o, fich, esc)
    detalle(o, fich, esc)


def fila(o, fich, esc):
    # 1. los 12 en fila
    vacia()
    n, alturas, filas = 0, [], []
    for e in EDADES:
        for c in COMPLEXIONES:
            x = (n - 5.5) * PASO
            nuevos = importa(fich(e, c), x)
            viste(nuevos, RECETAS[n]); bpy.context.view_layer.update()
            alto = alto_de(nuevos); alturas.append(alto)
            rotulo(e + " · " + c, x, -0.16, 0.13)
            rotulo(("%.2f m" % alto) + ("  (no ofrecer)" if e == "peque" else ""), x, -0.32, 0.1)
            filas.append({"id": "cuerpo-" + e + "-" + c, "x": x, "altura_m": round(alto, 3), "receta": RECETAS[n], "objetos": len(nuevos)})
            n += 1
    suelo(12 * PASO)
    alto = max(alturas)
    foto(esc, camara("frente", (0, -12, alto / 2 - 0.05), (math.pi / 2, 0, 0), orto=12 * PASO + 0.4), os.path.join(o["salida"], "frente.png"), 3600, 560)
    foto(esc, camara("tres", (11, -19, 3.2), (math.radians(82), 0, math.radians(30)), lente=40), os.path.join(o["salida"], "tres-cuartos.png"), 3000, 1000)
    for e in EDADES:
        f = [x for x in filas if x["id"] == "cuerpo-" + e + "-media"][0]
        foto(esc, camara("cara-" + e, (f["x"], -1.1, f["altura_m"] - 0.12), (math.pi / 2, 0, 0), orto=0.5), os.path.join(o["salida"], "cara-" + e + ".png"), 600, 600)
    with open(os.path.join(o["salida"], "capturas.json"), "w", encoding="utf-8") as f:
        json.dump({"blender": bpy.app.version_string, "cuerpos": filas, "nota": "paletas de AV4; Workbench apaga algo los tonos oscuros"}, f, ensure_ascii=False, indent=2)
    print("capturas: " + str(n) + " cuerpos en " + o["salida"], flush=True)


def detalle(o, fich, esc):
    # 2. adulta media con cada pieza
    vacia()
    PIEZA = [("rapado", (4, 0, 8, "pelo-rapado", 0, None, None, None)), ("corto", (2, 5, 8, "pelo-corto", 2, None, None, None)),
             ("afro o rizado", (8, 4, 1, "pelo-afro", 0, None, None, None)), ("recogido", (5, 6, 2, "pelo-recogido", 6, None, None, None)),
             ("largo", (1, 9, 4, "pelo-largo", 4, None, None, None)), ("barba", (6, 3, 8, "pelo-corto", 7, "vello-barba", None, None)),
             ("bigote", (3, 7, 1, "pelo-rapado", 1, "vello-bigote", None, None)), ("faena", (7, 0, 2, "pelo-corto", 0, None, "ropa-faena", None)),
             ("paja", (0, 7, 2, "pelo-corto", 3, None, "ropa-faena", "sombrero-paja")), ("gorra", (9, 4, 8, "pelo-rapado", 0, None, None, "sombrero-gorra"))]
    for i, (rot, rec) in enumerate(PIEZA):
        x = (i - (len(PIEZA) - 1) / 2) * PASO
        viste(importa(fich("adulta", "media"), x), rec); rotulo(rot, x, -0.16, 0.13)
    suelo(len(PIEZA) * PASO)
    foto(esc, camara("piezas", (0, -12, 0.8), (math.pi / 2, 0, 0), orto=len(PIEZA) * PASO + 0.4), os.path.join(o["salida"], "peinados.png"), 3200, 560)
    foto(esc, camara("piezas-cabeza", (0, -6, 1.52), (math.pi / 2, 0, 0), orto=len(PIEZA) * PASO + 0.2), os.path.join(o["salida"], "peinados-cabeza.png"), 3600, 420)
    for i, (rot, rec) in enumerate(PIEZA):   # las cabezas de cerca, de frente y de lado
        x = (i - (len(PIEZA) - 1) / 2) * PASO
        foto(esc, camara("cab-" + rot, (x, -1.5, 1.5), (math.pi / 2, 0, 0), orto=0.6), os.path.join(o["salida"], "cabeza-" + rot.split(" ")[0] + ".png"), 420, 420)
        foto(esc, camara("lado-" + rot, (x + 1.5, 0, 1.45), (math.pi / 2, 0, math.pi / 2), orto=0.75), os.path.join(o["salida"], "lado-" + rot.split(" ")[0] + ".png"), 420, 420)
    foto(esc, camara("piezas-detras", (0, 12, 0.8), (math.pi / 2, 0, math.pi), orto=len(PIEZA) * PASO + 0.4), os.path.join(o["salida"], "peinados-detras.png"), 3200, 560)
    # 3. el cuello de cerca (sin pelo), de frente y de tres cuartos, en piel clara y oscura
    vacia()
    for i, (tono, arriba) in enumerate(((1, 3), (8, 7))):
        nuevos = importa(fich("adulta", "media"), i * PASO); viste(nuevos, (tono, arriba, 8, None, 0, None, None, None))
    foto(esc, camara("cuello", (PASO / 2, -2.2, 1.38), (math.pi / 2, 0, 0), orto=PASO + 0.5), os.path.join(o["salida"], "cuello.png"), 1800, 420)
    foto(esc, camara("cuello-34", (1.1, -0.65, 1.42), (math.radians(88), 0, math.radians(40)), lente=60), os.path.join(o["salida"], "cuello-tres-cuartos.png"), 900, 700)
    # 4. adulta y mayor, de perfil
    vacia()
    for i, e in enumerate(("adulta", "mayor")):   # en fila hacia +Y y la cámara de lado (desde +X): se ven de perfil, uno junto al otro
        nuevos = importa(fich(e, "media"), 0, y=i * 1.0); viste(nuevos, (4, 0, 8, "pelo-corto", 6 if e == "mayor" else 1, None, "ropa-faena", None))
    foto(esc, camara("perfil", (6, 0.5, 0.85), (math.pi / 2, 0, math.pi / 2), orto=2.1), os.path.join(o["salida"], "mayor-adulta.png"), 900, 1000)
    foto(esc, camara("perfil-cab", (6, 0.5, 1.45), (math.pi / 2, 0, math.pi / 2), orto=1.0), os.path.join(o["salida"], "mayor-adulta-cabeza.png"), 900, 450)
    print("capturas: detalle en " + o["salida"], flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        print(str(e), file=sys.stderr); sys.exit(1)
    except Exception:
        import traceback; traceback.print_exc(); sys.exit(1)
