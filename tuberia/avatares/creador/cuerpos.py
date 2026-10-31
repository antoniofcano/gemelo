# Creador por piezas (AV3 y AV4): los 12 CUERPOS BASE de la familia (4 edades × 3 complexiones) desde MakeHuman/MPFB, exportados a VRM 1.0, cada uno
# con sus PIEZAS dentro (pelo, vello, ropa de faena y sombreros), ajustadas a él y pesadas a su mismo esqueleto (ADR-0025, contrato `avatares` v2).
# Ver doc/sistema/AVATARES-FAMILIA.md §12-14 (versiones, licencias, valores de los deslizadores y cifras) y las decisiones 128-132 y 141.
#
#   Sin --factory-startup: hace falta el perfil con los complementos instalados (MPFB 2.0.18 y VRM Add-on 4.10.3).
#   blender --background --python-exit-code 1 --python tuberia/avatares/creador/cuerpos.py -- --salida <carpeta fuera del repo> [--solo <id>] [--triangulos 10000]
#     --salida      donde dejar <id>.vrm, <id>.avatar.json y cuerpos.json (por defecto GEMELO_AVATARES_ORIGEN). Los VRM no se versionan (regla 4).
#     --solo        genera solo esos cuerpos, separados por comas (p. ej. cuerpo-adulta-media,cuerpo-mayor-media)
#     --triangulos  tope de triángulos del cuerpo tras reducir (por defecto 9000, AV4: deja sitio a pelo y ropa dentro de los 15.000 por avatar completo)
#   Lánzalo por el banco (no coincide con Chrome/Docker y espera memoria): node pruebas/banco/proceso.js --que "AV3 cuerpos" -- <blender> --background …
#
# Qué hace con cada cuerpo:
#   1. MPFB crea la malla base con los deslizadores «macro» (edad, peso, musculatura; el resto en su valor central: ver CUERPOS) y los hornea.
#   2. Lee de los «targets» de expresión de MPFB el cierre de párpados (blink) y la boca abierta (aa), como desplazamientos por vértice.
#   3. Pone el esqueleto «game_engine» de MPFB con sus pesos, lo lleva a la pose en T de MPFB y la aplica como reposo (VRM pide T).
#   4. Quita la geometría auxiliar (dientes, lengua, pestañas, cubos de articulación, ayudas de ropa) y separa los ojos (malla aparte, al hueso head).
#   5. Reduce el cuerpo (Decimate «collapse» simétrico en X) hasta el tope y le vuelve a poner blink y aa con los 3 vecinos más cercanos de la malla entera.
#   6. Materiales lisos SIN textura, para teñirse en el motor (decisión 128): «piel», «ropa_base» (arriba) y «ropa_abajo» en blanco (el motor multiplica
#      por el color elegido) y «ojos» oscuro. La ropa base (camiseta y pantalón corto) es para que ningún cuerpo vaya desnudo; el cuello, por un plano
#      inclinado (más bajo delante que detrás) que da un borde redondo y limpio (decisión 141: la costura en escalera del cuello de AV3).
#   7. Las PIEZAS (AV4 y AV5, PIEZAS): pelo (de la ayuda «helper-hair» de MakeHuman, recortada, pegada o hinchada; el largo, con dos mechones por delante),
#      vello (copia de la piel de la barbilla o del labio, separada unos mm; la perilla, cortada por planos y con cuerpo), ropa de faena (de la ayuda
#      «helper-tights», hasta muñecas y tobillos) y sombreros (rígidos, al hueso head; la paja, asentada sobre el pelo corto). Cada una, un objeto
#      «pieza_<id>» con los pesos de su esqueleto; el motor enseña las de la receta y tiñe «pelo» y «sombrero».
#   8. VRM 1.0 con el VRM Add-on: huesos humanoides (mapa explícito), expresiones blink/aa, meta CC0 con uso corporativo, redistribución y modificación.
# Determinista: mismos complementos y mismos valores → misma malla (la reducción «collapse» no usa azar).
import bpy
import bmesh
import json
import os
import sys
import math
from mathutils import kdtree, Matrix, Vector

VERSION_MPFB, VERSION_VRM = "2.0.18", "4.10.3"

# ------------------------------------------------------------------------------------------------ los 12 cuerpos
# MPFB (macrodetails) va de 0 a 1. Edad: 0 = 1 año, 0,1875 = 11, 0,5 = 25, 1 = 90 (interpolación lineal por tramos de MakeHuman).
EDADES = {
    "peque":  {"age": 0.13, "anos": 8,  "ofrecer": False},   # decisión 132: se diseñan y NO se ofrecen hasta reabrir la 45
    "joven":  {"age": 0.32, "anos": 17, "ofrecer": True},
    "adulta": {"age": 0.62, "anos": 40, "ofrecer": True},
    "mayor":  {"age": 0.97, "anos": 85, "ofrecer": True},   # AV3 usaba 0,88 (≈ 75): a ojo no se distinguía de «adulta» (decisión 141); más edad y POSTURA
}
# Postura de «mayor» (decisión 141, criterio C1: «algo más baja, leve curvatura»): antes de fijar el reposo se inclina la espalda alta y el cuello hacia
# delante y la cabeza se endereza (la mirada sigue al frente). En radianes; el signo lo comprueba el guion (la cabeza tiene que ir hacia delante, −Y).
POSTURA = {"mayor": {"spine_03": 0.14, "neck_01": 0.12, "head": -0.18}}
# Complexión: peso y musculatura. Medido en la primera tanda (0,25/0,5/0,85 de peso): la cintura solo cambiaba un 6 % de «delgada» a «ancha» y a ojo no
# se distinguían; los «universal» de MakeHuman son suaves, así que se usa el recorrido entero del peso (0/0,5/1). Que «ancha» no parezca un chiste
# (criterio C3) se revisa a ojo en las capturas.
COMPLEXIONES = {
    "delgada": {"weight": 0.0, "muscle": 0.35},
    "media":   {"weight": 0.5, "muscle": 0.5},
    "ancha":   {"weight": 1.0, "muscle": 0.65},
}
# Lo que NO se elige (criterios C8 y C11 de AVATARES-FAMILIA.md):
#  - gender = 0,5 en todos: MPFB tiene un deslizador «gender» de 0 a 1; no se usa como parámetro (ni de cara a la persona ni por cuerpo). El valor
#    central da una figura común sobre la que pelo, vello, ropa y accesorios (AV4, para cualquier cuerpo) dicen quién es cada cual.
#  - cupsize y firmness = 0,5 (su valor central), proportions = 0,5, height = 0,5 (la altura la escala el motor, ±7 %, sin malla nueva).
#  - race: asian = caucasian = african = 1/3 (el valor por defecto de MPFB): ningún rasgo étnico marcado; el tono de piel lo pone el motor.
NEUTRO = {"gender": 0.5, "proportions": 0.5, "height": 0.5, "cupsize": 0.5, "firmness": 0.5}
RAZAS = {"asian": 1 / 3, "caucasian": 1 / 3, "african": 1 / 3}
NOMBRE_EDAD = {"peque": "Peque", "joven": "Persona joven", "adulta": "Persona adulta", "mayor": "Persona mayor"}
NOMBRE_COMPLEXION = {"delgada": "complexión delgada", "media": "complexión media", "ancha": "complexión ancha"}
# Colores del muñeco lejano (contrato v1, `colores_muneco`): neutros; con la receta de AV4 el muñeco se tiñe de lo que elija cada cual.
MUNECO = {"camisa": "#8a8a8a", "piel": "#b07a55", "sombrero": "ninguno"}

# Esqueleto «game_engine» de MPFB → huesos humanoides de VRM 1.0 (los de los dedos, también: la mano no queda rígida)
HUESOS_VRM = {
    "hips": "pelvis", "spine": "spine_01", "chest": "spine_02", "upper_chest": "spine_03", "neck": "neck_01", "head": "head",
    "left_shoulder": "clavicle_l", "left_upper_arm": "upperarm_l", "left_lower_arm": "lowerarm_l", "left_hand": "hand_l",
    "right_shoulder": "clavicle_r", "right_upper_arm": "upperarm_r", "right_lower_arm": "lowerarm_r", "right_hand": "hand_r",
    "left_upper_leg": "thigh_l", "left_lower_leg": "calf_l", "left_foot": "foot_l", "left_toes": "ball_l",
    "right_upper_leg": "thigh_r", "right_lower_leg": "calf_r", "right_foot": "foot_r", "right_toes": "ball_r",
}
for lado, l in (("left", "l"), ("right", "r")):
    HUESOS_VRM.update({
        lado + "_thumb_metacarpal": "thumb_01_" + l, lado + "_thumb_proximal": "thumb_02_" + l, lado + "_thumb_distal": "thumb_03_" + l,
        lado + "_index_proximal": "index_01_" + l, lado + "_index_intermediate": "index_02_" + l, lado + "_index_distal": "index_03_" + l,
        lado + "_middle_proximal": "middle_01_" + l, lado + "_middle_intermediate": "middle_02_" + l, lado + "_middle_distal": "middle_03_" + l,
        lado + "_ring_proximal": "ring_01_" + l, lado + "_ring_intermediate": "ring_02_" + l, lado + "_ring_distal": "ring_03_" + l,
        lado + "_little_proximal": "pinky_01_" + l, lado + "_little_intermediate": "pinky_02_" + l, lado + "_little_distal": "pinky_03_" + l,
    })
# Ropa base: camiseta de manga corta («ropa_base») y pantalón hasta encima de la rodilla («ropa_abajo»), con cortes por planos sacados del esqueleto en T:
# de RODILLA (sobre la cabeza del hueso calf) a la cintura (la cabeza del spine_01) el pantalón; de ahí al cuello la camiseta, y en el brazo hasta MANGA
# (fracción del húmero). El cuello (decisión 141): AV3 lo cortaba con planos rectos y clasificaba los triángulos del hombro por su centro, y quedaba una
# escalera visible de cerca. Ahora son TRES planos que se cortan: uno inclinado, z = base del cuello − CUELLO·altura + INCLINA·(y − y del cuello), más bajo
# delante (−Y) que detrás, y dos laterales que suben HOMBRO_SUBE por metro hacia fuera desde el ancho del cuello, para que los hombros queden vestidos.
# La piel es lo que queda por encima de los tres; como la malla se corta por los tres, el borde sigue sus cortes (sin escalera).
RODILLA, CUELLO, MANGA, INCLINA, HOMBRO_SUBE = 0.035, 0.012, 0.45, 0.45, 1.2   # RODILLA y CUELLO en fracción de la altura; MANGA, del húmero
# --------------------------------------------------------------------------------------------------- las piezas (AV4)
# Ids del catálogo (contrato avatares v2: piezas[].id); el objeto se llama «pieza_<id>» (three quita los puntos de los nombres de nodo). Nombres neutros
# (C9), sin compatibilidad por sexo (C4, C5): cualquier pieza vale para cualquier cuerpo. «canoso» y «blanco» son COLORES del pelo (paleta), no peinados.
PIEZAS = {
    "pelo-rapado":    {"tipo": "pelo",  "nombre": "Rapado"},
    "pelo-corto":     {"tipo": "pelo",  "nombre": "Corto"},
    "pelo-afro":      {"tipo": "pelo",  "nombre": "Afro o rizado"},
    "pelo-recogido":  {"tipo": "pelo",  "nombre": "Recogido en moño"},
    "pelo-largo":     {"tipo": "pelo",  "nombre": "Largo"},
    "vello-barba":    {"tipo": "vello", "nombre": "Barba corta"},
    "vello-bigote":   {"tipo": "vello", "nombre": "Bigote"},
    "vello-perilla":  {"tipo": "vello", "nombre": "Perilla"},                                                          # AV5: vello de la barbilla
    "ropa-faena":     {"tipo": "ropa",  "nombre": "Ropa de faena (camisa de manga larga y pantalón largo)", "cubre_ropa_base": True},
    "sombrero-paja":  {"tipo": "accesorio", "nombre": "Sombrero de paja", "sombrero": "paja", "color": "#d9bf6a"},    # colores del sombrero del muñeco
    "sombrero-gorra": {"tipo": "accesorio", "nombre": "Gorra", "sombrero": "gorra", "color": "#2e5d34"},
}
SEPARA = {"rapado": 0.0025, "corto": 0.008, "afro": 0.075, "vello": 0.003, "perilla": 0.004, "faena": 0.006}   # cuánto se separa cada capa de lo que tapa (m)
# AV5 (repaso tras la revisión de Antonio, opción B): el afro sube desde el borde en AFRO_CAIDA metros (antes, en dos aristas: los picos del borde bajo); el largo
# lleva MECHONES por delante (dos tiras que caen de las sienes al pecho, con grosor); el sombrero de paja se ASIENTA: su copa es la elipse más justa que contiene
# pelo corto y cabeza a la altura del ala (antes, un cilindro fijo 5,5 cm bajo la coronilla, que flotaba).
AFRO_CAIDA = 0.06
MECHONES = {"columnas": 5, "filas": 15, "grosor": 0.005, "separa": 0.012}
# la perilla (m, para un cuerpo de 1,66 m: se escala con la altura): de bajo el labio a bajo la barbilla, estrecha arriba y ancha abajo, y más gruesa en la punta
PERILLA = {"bajo_labio": 0.016, "hasta": 0.07, "arriba": 0.016, "abajo": 0.042, "atras": 0.02, "punta": 0.006}
# el sombrero de paja: el ala a ALA_SOBRE_OJOS de la distancia de lo alto de los ojos a la coronilla; holgura de la copa y cuánto más ancha es el ala
PAJA = {"ala_sobre_ojos": 0.38, "holgura": 0.003, "ala": 1.9, "sobre_pelo": 0.02, "estrecha": 0.12}
TRI_FAENA = 2400   # la ayuda de mallas ajustadas tiene ≈ 5.300 triángulos; se reduce
# Expresiones (targets de MPFB, CC0): blink = los dos párpados; aa = boca abierta. Se promedian las tres variantes que trae MPFB.
EXPRESIONES = {"blink": ["eye-left-closure", "eye-right-closure"], "aa": ["mouth-open"]}
VARIANTES_EXPRESION = ["african", "asian", "caucasian"]

LICENCIA_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
AUTOR = "Cano & Damas Oleicultores (gemelo; generado con MakeHuman/MPFB)"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"salida": os.environ.get("GEMELO_AVATARES_ORIGEN"), "solo": None, "triangulos": 9000}
    i = 0
    while i < len(a):
        if a[i] == "--salida": o["salida"] = a[i + 1]; i += 2
        elif a[i] == "--solo": o["solo"] = a[i + 1]; i += 2
        elif a[i] == "--triangulos": o["triangulos"] = int(a[i + 1]); i += 2
        else: raise SystemExit("cuerpos.py: argumento desconocido " + a[i])
    if not o["salida"]: raise SystemExit("cuerpos.py: falta --salida (o GEMELO_AVATARES_ORIGEN): una carpeta fuera del repo")
    raiz = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
    s = os.path.abspath(o["salida"]); rel = os.path.relpath(s, raiz)
    if not rel.startswith("..") and not rel.replace("\\", "/").startswith("pruebas/salida"):
        raise SystemExit("cuerpos.py: la salida está dentro del repo (" + s + "): los VRM no se versionan")
    o["salida"] = s
    return o


def complemento(nombre):
    """El módulo de un complemento instalado como extensión (bl_ext.<repositorio>.<nombre>) o como complemento clásico"""
    import addon_utils
    for m in addon_utils.modules():
        if m.__name__ == nombre or m.__name__.endswith("." + nombre):
            addon_utils.enable(m.__name__, default_set=True)
            return m.__name__
    raise SystemExit("cuerpos.py: falta el complemento «" + nombre + "» (instálalo: ver AVATARES-FAMILIA.md §12)")


def limpia_escena():
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    for coleccion in (bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions, bpy.data.images):
        for d in list(coleccion):
            if d.users == 0: coleccion.remove(d)


def activa(obj):
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    for o in bpy.context.view_layer.objects: o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)


def coords_mundo(obj, clave=None):
    m = obj.matrix_world
    datos = obj.data.shape_keys.key_blocks[clave].data if clave else obj.data.vertices
    return [m @ d.co for d in datos]


def deltas_de_expresion(mpfb, malla):
    """Para cada expresión, el desplazamiento por vértice (malla entera, coordenadas de mundo): media de las variantes de MPFB"""
    TS = mpfb.services.TargetService
    base = mpfb.services.LocationService.get_mpfb_data("targets")
    malla.shape_key_add(name="Basis", from_mix=False)
    reposo = coords_mundo(malla, "Basis")
    salida = {}
    for expr, unidades in EXPRESIONES.items():
        claves = []
        for u in unidades:
            for v in VARIANTES_EXPRESION:
                ruta = os.path.join(base, "expression", "units", v, u + ".target.gz")
                claves.append(TS.load_target(malla, ruta, weight=1.0 / len(VARIANTES_EXPRESION), name="t." + u + "." + v))
        for k in malla.data.shape_keys.key_blocks: k.value = (1.0 / len(VARIANTES_EXPRESION)) if k.name.startswith("t.") else k.value
        mezcla = malla.shape_key_add(name="mezcla." + expr, from_mix=True)
        pos = coords_mundo(malla, mezcla.name)
        salida[expr] = [p - r for p, r in zip(pos, reposo)]
        for k in claves + [mezcla]: malla.shape_key_remove(k)
    for k in list(malla.data.shape_keys.key_blocks)[::-1]: malla.shape_key_remove(k)
    return reposo, salida


def vertices_de_grupos(malla, nombres):
    idx = {malla.vertex_groups[n].index for n in nombres if n in malla.vertex_groups}
    return {v.index for v in malla.data.vertices if any(g.group in idx and g.weight > 0 for g in v.groups)}


def deja(obj, quedan):
    bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in quedan], context="VERTS")
    bm.to_mesh(obj.data); bm.free(); obj.data.update()


def copia(obj, nombre):
    c = obj.copy(); c.data = obj.data.copy(); obj.users_collection[0].objects.link(c)
    c.name = c.data.name = nombre
    for m in list(c.modifiers): c.modifiers.remove(m)   # sin el esqueleto: se le vuelve a poner al final (los modificadores se aplican sobre la malla en reposo)
    if c.data.shape_keys:
        for k in list(c.data.shape_keys.key_blocks)[::-1]: c.shape_key_remove(k)
    return c


def separa_ojos_y_limpia(malla):
    """Ojos a un objeto aparte (todo su peso al hueso head); las ayudas de pelo y de ropa ajustada, a otros dos (AV4: de ahí salen las piezas);
    fuera todo lo que no es cuerpo. Devuelve (ojos, ayuda de pelo, ayuda de ropa, centro de la boca)"""
    cuerpo = vertices_de_grupos(malla, ["body"])
    ojos = vertices_de_grupos(malla, ["helper-l-eye", "helper-r-eye"]) - cuerpo
    pelo = vertices_de_grupos(malla, ["helper-hair"]) - cuerpo
    tights = vertices_de_grupos(malla, ["helper-tights"]) - cuerpo
    boca = [malla.matrix_world @ malla.data.vertices[i].co for i in vertices_de_grupos(malla, ["joint-mouth"])]
    boca = sum(boca, Vector((0, 0, 0))) / max(1, len(boca))
    obj_ojos, obj_pelo, obj_tights = copia(malla, "ojos"), copia(malla, "ayuda_pelo"), copia(malla, "ayuda_ropa")
    malla.name = malla.data.name = "cuerpo"
    deja(obj_ojos, ojos); deja(obj_pelo, pelo); deja(obj_tights, tights)
    deja(malla, cuerpo)
    # ojos: todo al hueso head
    for g in list(obj_ojos.vertex_groups):
        if g.name != "head": obj_ojos.vertex_groups.remove(g)
    gh = obj_ojos.vertex_groups.get("head") or obj_ojos.vertex_groups.new(name="head")
    gh.add([v.index for v in obj_ojos.data.vertices], 1.0, "REPLACE")
    return obj_ojos, obj_pelo, obj_tights, boca


def triangulos(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def reduce(malla, tope):
    activa(malla)
    antes = triangulos(malla)
    if antes > tope:
        d = malla.modifiers.new("reduce", "DECIMATE")
        d.decimate_type = "COLLAPSE"; d.ratio = tope / antes * 0.98; d.use_symmetry = True; d.symmetry_axis = "X"; d.use_collapse_triangulate = True
        bpy.ops.object.modifier_move_to_index(modifier="reduce", index=0)
        bpy.ops.object.modifier_apply(modifier="reduce")
    t = malla.modifiers.new("triangula", "TRIANGULATE"); bpy.ops.object.modifier_move_to_index(modifier="triangula", index=0)
    bpy.ops.object.modifier_apply(modifier="triangula")
    return antes, triangulos(malla)


def pon_expresiones(malla, reposo, deltas, solo):
    """blink y aa en la malla reducida: el desplazamiento de los 3 vecinos más cercanos de la malla entera (solo vértices del cuerpo), por inverso de la distancia"""
    arbol = kdtree.KDTree(len(solo))
    for i in solo: arbol.insert(reposo[i], i)
    arbol.balance()
    malla.shape_key_add(name="Basis", from_mix=False)
    m, mi = malla.matrix_world, malla.matrix_world.inverted()
    pesos = []
    for v in malla.data.vertices:
        cerca = arbol.find_n(m @ v.co, 3)
        w = [(i, 1.0 / max(d, 1e-5)) for (_, i, d) in cerca]; s = sum(x for _, x in w)
        pesos.append([(i, x / s) for i, x in w])
    for expr, dl in deltas.items():
        k = malla.shape_key_add(name=expr, from_mix=False)
        for v, pv in zip(malla.data.vertices, pesos):
            dm = Vector((0, 0, 0))
            for i, x in pv: dm += dl[i] * x
            k.data[v.index].co = mi @ (m @ v.co + dm)
        k.value = 0.0


def material(nombre, color, rugosidad=0.9):
    mat = bpy.data.materials.new(nombre)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get("Principled BSDF")
    p.inputs["Base Color"].default_value = (*color, 1.0)
    p.inputs["Roughness"].default_value = rugosidad
    p.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in p.inputs: p.inputs["Specular IOR Level"].default_value = 0.2
    mat.diffuse_color = (*color, 1.0)
    return mat


MATERIALES = {}


def mat(nombre):
    """Un material por nombre para todo el fichero (piezas y cuerpo comparten «ropa_base», «ropa_abajo» y «pelo»): el motor tiñe por nombre"""
    if nombre not in MATERIALES:
        color = {"ojos": (0.06, 0.05, 0.05), "sombrero": (1, 1, 1)}.get(nombre, (1, 1, 1))
        MATERIALES[nombre] = material(nombre, color, 0.4 if nombre == "ojos" else 0.9)
    return MATERIALES[nombre]


def referencias(cuerpo, esqueleto):
    """Las referencias de los cortes, sacadas del esqueleto en reposo (T) y de la malla"""
    em = esqueleto.matrix_world
    cabeza = lambda b: em @ esqueleto.data.bones[b].head_local
    zs = [v.co.z for v in cuerpo.data.vertices]; alto = max(zs) - min(zs)
    hombro = abs(cabeza("upperarm_l").x)
    cu = cabeza("neck_01")
    cuello_x = 0.4 * hombro   # medio ancho del cuello ≈ 0,4 del de los hombros (medirlo a la altura del cuello cogía los trapecios)
    # la cabeza: centro de la caja de los vértices del cuerpo por encima de la base del hueso head
    hz = cabeza("head").z
    cab = [cuerpo.matrix_world @ v.co for v in cuerpo.data.vertices if (cuerpo.matrix_world @ v.co).z > hz]
    lo = Vector((min(p.x for p in cab), min(p.y for p in cab), min(p.z for p in cab))); hi = Vector((max(p.x for p in cab), max(p.y for p in cab), max(p.z for p in cab)))
    return {
        "alto": alto, "hombro": hombro, "rodilla": cabeza("calf_l").z + RODILLA * alto, "cintura": cabeza("spine_01").z,
        "manga": hombro + MANGA * (abs(cabeza("lowerarm_l").x) - hombro),
        "muneca": abs(cabeza("lowerarm_l").x) + 0.9 * (abs(cabeza("hand_l").x) - abs(cabeza("lowerarm_l").x)),
        "tobillo": cabeza("foot_l").z + 0.045,
        # el escote: el plano inclinado (punto y normal) y los dos laterales, desde el ancho del cuello
        "cuello_co": Vector((0, cu.y, cu.z - CUELLO * alto)), "cuello_no": Vector((0, -INCLINA, 1)).normalized(),
        "escote": [(Vector((0, cu.y, cu.z - CUELLO * alto)), Vector((0, -INCLINA, 1)).normalized())]
                  + [(Vector((sx * cuello_x, 0, cu.z - CUELLO * alto)), Vector((-sx * HOMBRO_SUBE, 0, 1)).normalized()) for sx in (1, -1)],
        "brazo_z": (cabeza("upperarm_l").z + cabeza("lowerarm_l").z) / 2,
        "cabeza_z": hz, "cabeza_c": (lo + hi) / 2, "cabeza_lo": lo, "cabeza_hi": hi,
    }


def orienta_caras(bm, fuera):
    """AV5: cada cara hacia fuera por su cuenta (la ayuda de pelo son varias tiras: orienta() vota para todas juntas y alguna quedaba del revés, y el
    motor no dibuja las caras de espaldas: se veían rayas claras en la coronilla)"""
    bm.normal_update()
    malas = [f for f in bm.faces if not fuera(f.calc_center_median(), f.normal)]
    if malas: bmesh.ops.reverse_faces(bm, faces=malas)
    bm.normal_update()


def bajo_cuello(M, p, sube=0.0):
    """Vestido: por debajo de alguno de los tres planos del escote (subidos `sube` metros)"""
    return any((p - co - Vector((0, 0, sube))).dot(no) < 0 for co, no in M["escote"])


def planos_escote(M, sube=0.0):
    return [(co + Vector((0, 0, sube)), no) for co, no in M["escote"]]


def corta(bm, planos, lados=3):
    """Parte la malla por los planos y triangula lo que tenga más de `lados` lados (4: deja los cuadriláteros, para subdividir después)"""
    for co, no in planos:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > lados])


def orienta(bm, fuera):
    """Normales coherentes y hacia fuera (el motor no dibuja las caras de espaldas): fuera(centro, normal) dice si una cara mira afuera"""
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    voto = sum(1 if fuera(f.calc_center_median(), f.normal) else -1 for f in bm.faces)
    if voto < 0: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.normal_update()


def pon_materiales(cuerpo, ojos, esqueleto, M):
    cuerpo.data.materials.clear()
    for n in ("piel", "ropa_base", "ropa_abajo"): cuerpo.data.materials.append(mat(n))
    ojos.data.materials.clear(); ojos.data.materials.append(mat("ojos"))
    # cortes: se parte la malla por los planos (los pesos y las UV se interpolan) y se vuelve a triangular
    bm = bmesh.new(); bm.from_mesh(cuerpo.data)
    corta(bm, [((0, 0, M["rodilla"]), (0, 0, 1)), ((0, 0, M["cintura"]), (0, 0, 1))] + planos_escote(M)
          + [((sx * M["manga"], 0, 0), (1, 0, 0)) for sx in (1, -1)])
    for f in bm.faces:
        c = f.calc_center_median(); ax = abs(c.x)
        # dentro de la manga y sobre la rodilla; en el tronco, bajo el plano del cuello (los hombros y los brazos en T quedan por debajo)
        vestido = ax < M["manga"] and c.z > M["rodilla"] and (ax >= M["hombro"] or bajo_cuello(M, c))
        f.material_index = (2 if c.z < M["cintura"] else 1) if vestido else 0
    bm.to_mesh(cuerpo.data); bm.free(); cuerpo.data.update()
    for o in (cuerpo, ojos):
        for p in o.data.polygons: p.use_smooth = True
    limpia_grupos((cuerpo, ojos), esqueleto)
    return triangulos(cuerpo)


def limpia_grupos(objs, esqueleto):
    """fuera los grupos que no son huesos (el VRM solo necesita los pesos de los huesos)"""
    for o in objs:
        for g in list(o.vertex_groups):
            if g.name not in esqueleto.data.bones: o.vertex_groups.remove(g)


# ------------------------------------------------------------------------------------------------ piezas
def normales_fuera(bm, d, pesos=None):
    """Separa cada vértice d metros por su normal (× su peso, si se da)"""
    bm.normal_update()
    for v in bm.verts:
        w = pesos[v.index] if pesos is not None else 1.0
        v.co += v.normal * d * w


def saltos_desde_borde(bm):
    """Cuántas aristas separan cada vértice del borde abierto de la malla (0 en el borde)"""
    bm.verts.ensure_lookup_table()
    dist = {v.index: 0 for v in bm.verts if v.is_boundary}
    frente = list(dist)
    while frente:
        sig = []
        for i in frente:
            for e in bm.verts[i].link_edges:
                o = e.other_vert(bm.verts[i]).index
                if o not in dist: dist[o] = dist[i] + 1; sig.append(o)
        frente = sig
    return [dist.get(v.index, 99) for v in bm.verts]


def todo_a(obj, hueso):
    for g in list(obj.vertex_groups): obj.vertex_groups.remove(g)
    obj.vertex_groups.new(name=hueso).add([v.index for v in obj.data.vertices], 1.0, "REPLACE")


def pesos_pelo(obj, M):
    """El pelo, a la cabeza; lo que cuelga por la espalda (el largo) pasa poco a poco al cuello y al pecho alto (sin muslos ni pelvis de la ayuda)"""
    for g in list(obj.vertex_groups): obj.vertex_groups.remove(g)
    gh, gn, gs = obj.vertex_groups.new(name="head"), obj.vertex_groups.new(name="neck_01"), obj.vertex_groups.new(name="spine_03")
    for v in obj.data.vertices:
        z = (obj.matrix_world @ v.co).z
        t = max(0.0, min(1.0, (M["cabeza_z"] - z) / 0.16))
        if t <= 0: gh.add([v.index], 1.0, "REPLACE"); continue
        a = max(0.0, min(1.0, t * 2)) if t < 0.5 else 1.0
        gh.add([v.index], 1 - a * 0.85, "REPLACE"); gn.add([v.index], a * 0.85 * (1 - t), "REPLACE"); gs.add([v.index], a * 0.85 * t, "REPLACE")


def subdivide(obj, niveles=1):
    activa(obj)
    m = obj.modifiers.new("sub", "SUBSURF"); m.levels = niveles; m.render_levels = niveles; m.subdivision_type = "CATMULL_CLARK"
    bpy.ops.object.modifier_apply(modifier="sub")


def envuelve(obj, cuerpo, d):
    """Pega la pieza a la piel, a d metros (Shrinkwrap «sobre la superficie»)"""
    activa(obj)
    m = obj.modifiers.new("pega", "SHRINKWRAP"); m.target = cuerpo; m.wrap_method = "NEAREST_SURFACEPOINT"; m.wrap_mode = "OUTSIDE_SURFACE"; m.offset = d
    bpy.ops.object.modifier_apply(modifier="pega")


def pieza(obj, ident, material_nombre, esqueleto):
    obj.name = "pieza_" + ident; obj.data.name = "malla_" + ident   # el nodo lleva el nombre de la pieza (el motor lo busca por el nombre ORIGINAL del nodo: userData.name)
    obj.data.materials.clear(); obj.data.materials.append(mat(material_nombre))
    for p in obj.data.polygons: p.use_smooth = True
    limpia_grupos((obj,), esqueleto)
    return obj


def con_bm(obj, fn):
    bm = bmesh.new(); bm.from_mesh(obj.data); fn(bm); bm.to_mesh(obj.data); bm.free(); obj.data.update()


def suave(t):
    """smoothstep de 0 a 1 (t fuera de 0-1, recortado)"""
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def fuera_de(bvh, p, d):
    """Saca el punto p de la piel hasta quedar a d metros por fuera (por la normal de la cara más cercana); si ya lo está, igual"""
    for _ in range(4):
        loc, n, _i, _dist = bvh.find_nearest(p)
        if loc is None: return p
        s = (p - loc).dot(n)
        if s >= d - 1e-5: return p
        p = p + n * (d - s)
    return p


def junta(destino, otro):
    """Une la malla de `otro` a `destino` (mismo objeto, mismo material)"""
    activa(destino); otro.select_set(True); bpy.ops.object.join()


def mechones(cuerpo, M, boca, coleccion):
    """AV5: el pelo largo, también por delante. Dos tiras que caen de las sienes, junto a la cara y por delante del cuello, hasta el pecho: cada fila
    de la tira va de la sien (y del centro de la cabeza) a la piel de delante (rayo desde −Y) según baja de la barbilla a la base del cuello, y cada
    punto se saca de la piel (más pegado arriba, bajo el casquete, y a MECHONES["separa"] abajo). Grosor con Solidify hacia dentro (por las dos caras)"""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(cuerpo, bpy.context.evaluated_depsgraph_get())
    lo, hi, c = M["cabeza_lo"], M["cabeza_hi"], M["cabeza_c"]
    k, mw = M["alto"] / 1.66, (hi.x - lo.x) / 2   # escala del cuerpo y medio ancho de la cabeza
    z0, z1 = hi.z - 0.075 * k, M["cuello_co"].z - 0.13 * k      # de bajo el casquete (sien) a media altura del pecho
    zb, zh = boca.z - 0.04 * k, M["cuello_co"].z                 # de la barbilla a la base del cuello pasa del lado de la cabeza a delante
    NU, NV = MECHONES["columnas"], MECHONES["filas"]
    me = bpy.data.meshes.new("mechones"); o = bpy.data.objects.new("mechones", me); coleccion.objects.link(o)
    bm = bmesh.new()
    afuera = hacia_fuera(cuerpo)
    for sx in (1, -1):
        filas = []
        for j in range(NV):
            v = j / (NV - 1); z = z0 + (z1 - z0) * v
            arriba = suave(v / 0.35)   # arriba, pegados a la cabeza y bajo el casquete (en la prueba asomaba el canto de arriba en la sien)
            xi = c.x + sx * (0.55 + (0.5 - 0.55) * v) * mw
            xo = c.x + sx * ((0.9 * mw) + (1.3 * mw - 0.9 * mw) * arriba)
            punta = 1 - 0.65 * suave((v - 0.6) / 0.4)   # las puntas se estrechan (no acaban en un corte recto)
            xm = (xi + xo) / 2; xi, xo = xm + (xi - xm) * punta, xm + (xo - xm) * punta
            b = suave((zb - z) / (zb - zh))
            d = 0.003 + (MECHONES["separa"] - 0.003) * suave(v / 0.3)
            fila = []
            for i in range(NU):
                x = xi + (xo - xi) * i / (NU - 1)
                y_lado = c.y - 0.012 * k
                golpe = bvh.ray_cast(Vector((x, lo.y - 0.5, z)), Vector((0, 1, 0)))
                y_del = (golpe[0].y if golpe[0] is not None else y_lado) - d
                fila.append(bm.verts.new(fuera_de(bvh, Vector((x, y_lado + (y_del - y_lado) * b, z)), d)))
            filas.append(fila)
        caras = [bm.faces.new((filas[j][i], filas[j][i + 1], filas[j + 1][i + 1], filas[j + 1][i])) for j in range(NV - 1) for i in range(NU - 1)]
        bm.normal_update()
        if sum(1 if afuera(f.calc_center_median(), f.normal) else -1 for f in caras) < 0: bmesh.ops.reverse_faces(bm, faces=caras)
    bm.normal_update(); bm.to_mesh(me); bm.free(); me.update()
    activa(o)
    s = o.modifiers.new("grosor", "SOLIDIFY"); s.thickness = MECHONES["grosor"]; s.offset = -1.0; s.use_rim = True; s.use_even_offset = True
    bpy.ops.object.modifier_apply(modifier="grosor")
    return o


def piezas_pelo(ayuda, cuerpo, esqueleto, M, boca):
    """Cinco peinados de la ayuda de pelo de MakeHuman (un casquete que baja por la espalda hasta media espalda)"""
    hecho = {}
    cz, c = M["cabeza_z"], M["cabeza_c"]
    afuera = hacia_fuera(cuerpo)
    con_bm(ayuda, lambda bm: orienta(bm, afuera))
    # AV5: la ayuda trae agujeros en la coronilla (se veía un punto claro arriba en todos los peinados): se tapan los que quedan enteros por encima del
    # centro de la cabeza (el borde de fuera baja a la nuca, así que no se toca)
    def tapa(bm):
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.002)   # tiras sueltas de la ayuda: se cosen (al hinchar el afro se abrían en grietas)
        # y las rajas que deja la ayuda por arriba (bordes abiertos con los dos labios a unos mm): se cosen sus bordes, sin tocar el borde de abajo
        bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v.is_boundary and v.co.z > c.z + 0.02], dist=0.009)
        bordes = [e for e in bm.edges if e.is_boundary and min(v.co.z for v in e.verts) > c.z]
        if bordes:
            r = bmesh.ops.holes_fill(bm, edges=bordes, sides=0)
            bmesh.ops.triangulate(bm, faces=[f for f in r["faces"] if len(f.verts) > 4])
        orienta_caras(bm, afuera)
    con_bm(ayuda, tapa)
    # la frente: la ayuda baja hasta las cejas (un flequillo que tapa los ojos). Un plano que sube hacia delante (z > F + 0,9·(c.y − y)) despeja la frente
    # y las sienes; solo en la mitad de delante, para no tocar lo que cuelga por la espalda
    fco, fno = Vector((0, c.y, M["cabeza_hi"].z - 0.11)), Vector((0, 0.9, 1)).normalized()
    def frente(bm):
        corta(bm, [(fco, fno)], lados=4)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < c.y + 0.01 and (f.calc_center_median() - fco).dot(fno) < 0], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    con_bm(ayuda, frente)
    # LARGO: la ayuda entera, suavizada; lo que cuelga, a cuello y pecho alto
    largo = copia(ayuda, "largo"); subdivide(largo)
    con_bm(largo, lambda bm: normales_fuera(bm, 0.004))
    junta(largo, mechones(cuerpo, M, boca, largo.users_collection[0]))   # AV5: que caiga también por delante
    pesos_pelo(largo, M); hecho["pelo-largo"] = largo
    # CORTO: el casquete por encima de la nuca (un plano algo más bajo detrás que delante)
    co, no = Vector((0, c.y, cz + 0.005)), Vector((0, 0.35, 1)).normalized()
    casco = copia(ayuda, "casco")
    def recorta(bm):
        corta(bm, [(co, no)], lados=4)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if (v.co - co).dot(no) < -1e-5], context="VERTS")
    con_bm(casco, recorta)
    corto = copia(casco, "corto"); subdivide(corto)
    envuelve(corto, cuerpo, SEPARA["corto"])
    # RAPADO: el mismo casquete, pegado a la piel (antes de dar volumen al corto)
    rapado = copia(corto, "rapado"); envuelve(rapado, cuerpo, SEPARA["rapado"]); hecho["pelo-rapado"] = rapado
    def volumen(bm, d):   # un poco de volumen hacia fuera desde el centro de la cabeza, nada en el borde
        sal = saltos_desde_borde(bm); bm.verts.ensure_lookup_table()
        for v in bm.verts: v.co += (v.co - c).normalized() * d * min(1.0, sal[v.index] / 2.0)
    con_bm(corto, lambda bm: volumen(bm, 0.012)); hecho["pelo-corto"] = corto
    # AFRO: el casquete hinchado hacia fuera desde el centro de la cabeza (menos delante, para no tapar la frente) y con rizos leves. AV5: el volumen sube
    # desde el borde con la DISTANCIA en metros al borde (AFRO_CAIDA, curva suave), no con las aristas (en AV4, dos aristas: el borde bajo salía en dientes),
    # lo de delante baja con una curva (no un escalón en y) y se alisa el interior sin mover el borde
    afro = copia(casco, "afro")
    def frente_afro(bm):   # AV5: la raya de la frente, 1,5 cm más arriba y recta (la de la ayuda tiene una muesca que, hinchada, se abría en un hueco)
        co2 = fco + Vector((0, 0, 0.015))
        corta(bm, [(co2, fno)], lados=4)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.calc_center_median().y < c.y + 0.01 and (f.calc_center_median() - co2).dot(fno) < 0], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    con_bm(afro, frente_afro)
    subdivide(afro); envuelve(afro, cuerpo, SEPARA["corto"])
    def hincha(bm):
        orienta_caras(bm, afuera)
        bm.verts.ensure_lookup_table()
        borde = [v.co.copy() for v in bm.verts if v.is_boundary and v.co.z < c.z + 0.5 * (M["cabeza_hi"].z - c.z)]   # el borde de abajo
        arbol = kdtree.KDTree(max(1, len(borde)))
        for i, p in enumerate(borde): arbol.insert(p, i)
        arbol.balance()
        nuevo = []
        for v in bm.verts:
            w = suave(arbol.find(v.co)[2] / AFRO_CAIDA) if borde else 1.0
            frente = 0.45 + 0.55 * suave((v.co.y - (c.y - 0.075)) / 0.06)
            r = 1.0 + 0.04 * math.sin(v.co.x * 90) * math.sin(v.co.y * 80) * math.sin(v.co.z * 95)   # rizos: un relieve leve, ancho y determinista
            d = v.co - c; d.z *= 0.7   # más hacia los lados que hacia arriba: redondo, no una torre
            nuevo.append(v.co + d.normalized() * SEPARA["afro"] * w * frente * r)
        for v, p in zip(bm.verts, nuevo): v.co = p
        dentro = [v for v in bm.verts if not v.is_boundary]
        for _ in range(4): bmesh.ops.smooth_vert(bm, verts=dentro, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.normal_update()
    con_bm(afro, hincha); hecho["pelo-afro"] = afro
    # RECOGIDO: el corto algo más pegado y un moño atrás y arriba
    recogido = copia(corto, "recogido"); envuelve(recogido, cuerpo, 0.004)
    def mono(bm):
        m = bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.05)
        for v in m["verts"]: v.co = Vector((v.co.x, v.co.y * 0.8, v.co.z * 0.9)) + Vector((0, M["cabeza_hi"].y + 0.012, c.z + 0.03))
    con_bm(recogido, mono)
    hecho["pelo-recogido"] = recogido
    bpy.data.objects.remove(casco, do_unlink=True)
    for ident, o in hecho.items():
        if ident != "pelo-largo": todo_a(o, "head")
        con_bm(o, lambda bm: bmesh.ops.triangulate(bm, faces=bm.faces[:]))
        pieza(o, ident, "pelo", esqueleto)
    return hecho


def piezas_vello(cuerpo, esqueleto, boca, M):
    """Barba y bigote: copia de la piel de esa zona, separada unos mm (sin el morph de la boca: al abrirla no la sigue)"""
    c = M["cabeza_c"]
    def zona(p):   # p en coordenadas de mundo
        ax, dz = abs(p.x), p.z - boca.z
        delante = p.y < c.y + 0.005
        # barba: barbilla y mandíbula por debajo de la boca y, a los lados (fuera de las comisuras), hasta su altura; ni labios, ni nariz, ni mejillas altas
        barba = delante and -0.1 < dz and ((ax < 0.035 and dz < -0.018) or (ax >= 0.035 and dz < 0.0)) and p.z > M["cuello_co"].z + 0.04
        bigote = delante and ax < 0.032 and 0.001 < dz < 0.013 and p.y < boca.y - 0.004
        return barba, bigote
    hecho = {}
    for ident, k in (("vello-barba", 0), ("vello-bigote", 1)):
        o = copia(cuerpo, ident)
        mw = o.matrix_world
        quedan = {v.index for v in o.data.vertices if zona(mw @ v.co)[k]}
        def filtra(bm):
            bm.faces.ensure_lookup_table()
            bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in quedan for v in f.verts)], context="FACES")
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
            normales_fuera(bm, SEPARA["vello"])
        con_bm(o, filtra)
        hecho[ident] = pieza(o, ident, "pelo", esqueleto)
    hecho["vello-perilla"] = pieza(perilla(cuerpo, boca, M), "vello-perilla", "pelo", esqueleto)
    return hecho


def perilla(cuerpo, boca, M):
    """AV5: la perilla (vello de la barbilla), copia de la piel de la barbilla como la barba, pero con bordes limpios (la piel se corta por planos, como
    el cuello de la ropa, en vez de quedarse con los triángulos enteros de la malla reducida) y con cuerpo: más gruesa abajo, en la punta de la barbilla.
    Una franja bajo el labio de abajo (PERILLA["arriba"] de ancho) que se abre hasta la barbilla (PERILLA["abajo"]); sin bigote (eso es «vello-bigote»)"""
    k = M["alto"] / 1.66
    zt, zb = boca.z - PERILLA["bajo_labio"] * k, boca.z - PERILLA["hasta"] * k
    wt, wb = PERILLA["arriba"] * k / 2, PERILLA["abajo"] * k / 2
    yb = boca.y + PERILLA["atras"] * k
    pend = (wb - wt) / (zt - zb)
    planos = [((0, 0, zt), (0, 0, -1)), ((0, 0, zb), (0, 0, 1)), ((0, yb, 0), (0, -1, 0))] + [((sx * wt, 0, zt), (-sx, 0, -pend)) for sx in (1, -1)]
    o = copia(cuerpo, "vello-perilla")
    def recorta(bm):
        corta(bm, [(Vector(co), Vector(no).normalized()) for co, no in planos])
        dentro = lambda p: all((p - Vector(co)).dot(Vector(no)) > -1e-6 for co, no in planos) and p.y < M["cabeza_c"].y
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if not dentro(f.calc_center_median())], context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges[:], dist=0.0008)   # los cortes dejan astillas: fuera, para no gastar triángulos
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.normal_update()
        for v in bm.verts:   # más cuerpo en la punta de la barbilla que bajo el labio
            v.co += v.normal * (SEPARA["perilla"] + PERILLA["punta"] * suave((zt - v.co.z) / (zt - zb)))
    con_bm(o, recorta)
    return o


def hacia_fuera(cuerpo):
    """fuera(p, n) para orienta(): la cara mira hacia donde mira la piel más cercana (BVH del cuerpo, en coordenadas de la malla = de mundo: sin transformar)"""
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(cuerpo, bpy.context.evaluated_depsgraph_get())
    def fuera(p, n):
        r = bvh.find_nearest(p)
        return r[1] is None or n.dot(r[1]) > 0
    return fuera


def pieza_faena(ayuda, cuerpo, esqueleto, M):
    """Camisa de manga larga y pantalón largo: la ayuda de mallas ajustadas de MakeHuman, reducida, cortada en muñecas, tobillos y cuello y separada
    unos mm; arriba «ropa_base» y abajo «ropa_abajo» (los mismos materiales, y por tanto los mismos colores, que la ropa base del cuerpo)"""
    o = copia(ayuda, "faena")
    reduce(o, TRI_FAENA)
    def recorta(bm):
        corta(bm, [((sx * M["muneca"], 0, 0), (1, 0, 0)) for sx in (1, -1)] + [((0, 0, M["tobillo"]), (0, 0, 1)), ((0, 0, M["cintura"]), (0, 0, 1))] + planos_escote(M, 0.008))
        fuera = [f for f in bm.faces if abs(f.calc_center_median().x) > M["muneca"] or f.calc_center_median().z < M["tobillo"]
                 or not bajo_cuello(M, f.calc_center_median(), 0.008)]
        bmesh.ops.delete(bm, geom=fuera, context="FACES")
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        for f in bm.faces: f.material_index = 1 if f.calc_center_median().z < M["cintura"] else 0
    o.data.materials.clear(); o.data.materials.append(mat("ropa_base")); o.data.materials.append(mat("ropa_abajo"))
    con_bm(o, recorta)
    # pegada a la piel a SEPARA mm (la ayuda de MakeHuman se cruza con la piel en los hombros) y con las caras hacia fuera, como la piel de debajo
    envuelve(o, cuerpo, SEPARA["faena"])
    fuera = hacia_fuera(cuerpo)
    con_bm(o, lambda bm: orienta(bm, fuera))
    for p in o.data.polygons: p.use_smooth = True
    o.name = "pieza_ropa-faena"; o.data.name = "malla_ropa-faena"
    limpia_grupos((o,), esqueleto)
    return {"ropa-faena": o}


def asiento_paja(cuerpo, ojos, corto, M):
    """AV5: dónde va el sombrero de paja para que se ASIENTE sobre el pelo corto: el ala a PAJA["ala_sobre_ojos"] de lo alto de los ojos a la coronilla;
    la copa, la elipse más justa que contiene (con su estrechamiento hacia arriba) la cabeza y el pelo corto por encima del ala, más la holgura; su
    techo, sobre lo más alto del pelo. Devuelve (centro x, centro y, z del ala, z del techo, semieje x, semieje y)"""
    hi, c = M["cabeza_hi"], M["cabeza_c"]
    zo = max((ojos.matrix_world @ v.co).z for v in ojos.data.vertices)
    base = zo + PAJA["ala_sobre_ojos"] * (hi.z - zo)
    pts = [corto.matrix_world @ v.co for v in corto.data.vertices] + [cuerpo.matrix_world @ v.co for v in cuerpo.data.vertices]
    pts = [p for p in pts if p.z >= base - 0.003]
    techo = max(p.z for p in pts) + PAJA["sobre_pelo"]
    banda = [p for p in pts if p.z < base + 0.012]
    yc = (min(p.y for p in banda) + max(p.y for p in banda)) / 2
    a = max(abs(p.x - c.x) for p in banda); b = (max(p.y for p in banda) - min(p.y for p in banda)) / 2
    f = lambda z: 1 - PAJA["estrecha"] * (z - base) / (techo - base)
    s = max(math.sqrt(((p.x - c.x) / a) ** 2 + ((p.y - yc) / b) ** 2) / f(p.z) for p in pts)
    return c.x, yc, base, techo, a * s / math.cos(math.pi / 16) + PAJA["holgura"], b * s / math.cos(math.pi / 16) + PAJA["holgura"]   # el polígono de 16 lados, por fuera de la elipse


def piezas_sombrero(esqueleto, M, coleccion, asiento):
    """Sombrero de paja y gorra, rígidos al hueso head. La paja, asentada sobre el pelo corto (asiento_paja; con el afro o el moño se cruzan); la gorra, como en AV4"""
    lo, hi, c = M["cabeza_lo"], M["cabeza_hi"], M["cabeza_c"]
    r = max(hi.x - lo.x, hi.y - lo.y) / 2 + 0.012
    hecho = {}
    for ident, forma in (("sombrero-paja", "paja"), ("sombrero-gorra", "gorra")):
        me = bpy.data.meshes.new(ident); o = bpy.data.objects.new(ident, me); coleccion.objects.link(o)
        bm = bmesh.new()
        base = hi.z - 0.055
        if forma == "paja":
            cx, cy, zb, zt, ax, ay = asiento
            copa = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=1.0, radius2=1.0 - PAJA["estrecha"], depth=zt - zb)
            for v in copa["verts"]: v.co = Vector((cx + v.co.x * ax, cy + v.co.y * ay, (zb + zt) / 2 + v.co.z))
            ala = bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=1.0, radius2=1.0, depth=0.008)
            for v in ala["verts"]: v.co = Vector((cx + v.co.x * ax * PAJA["ala"], cy + v.co.y * ay * PAJA["ala"], zb + v.co.z))
        else:
            cas = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=r * 1.02)
            bmesh.ops.delete(bm, geom=[v for v in cas["verts"] if v.co.z < -1e-4], context="VERTS")
            for v in bm.verts: v.co = Vector((v.co.x, v.co.y, v.co.z * 0.85)) + Vector((c.x, c.y, base))
            vis = bmesh.ops.create_cube(bm, size=1)
            for v in vis["verts"]: v.co = Vector((v.co.x * r * 1.5, v.co.y * r * 0.9, v.co.z * 0.012)) + Vector((c.x, lo.y - r * 0.3, base + 0.01))
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(me); bm.free(); me.update()
        o.parent = esqueleto
        todo_a(o, "head")
        hecho[ident] = pieza(o, ident, "sombrero", esqueleto)
        for p in o.data.polygons: p.use_smooth = False
    return hecho


def configura_vrm(vrm_mod, esqueleto, cuerpo, ident, nombre, cfg):
    ext = esqueleto.data.vrm_addon_extension
    ext.spec_version = "1.0"
    v1 = ext.vrm1
    meta = v1.meta
    meta.vrm_name = nombre
    meta.version = "AV5"
    while len(meta.authors): meta.authors.remove(0)
    meta.authors.add().value = AUTOR
    meta.copyright_information = "CC0-1.0. Cuerpo base de MakeHuman/MPFB " + VERSION_MPFB + " (malla y targets del núcleo, CC0)."
    meta.third_party_licenses = "MakeHuman/MPFB: activos del núcleo CC0 (https://static.makehumancommunity.org/mpfb/faq/is_it_really_free.html)"
    meta.avatar_permission = "everyone"
    meta.commercial_usage = "corporation"
    meta.credit_notation = "unnecessary"
    meta.allow_redistribution = True
    meta.modification = "allowModificationRedistribution"
    meta.allow_excessively_violent_usage = False
    meta.allow_excessively_sexual_usage = False
    meta.allow_political_or_religious_usage = False
    meta.allow_antisocial_or_hate_usage = False
    meta.other_license_url = LICENCIA_URL
    hb = v1.humanoid.human_bones
    for vrm, hueso in HUESOS_VRM.items():
        getattr(hb, vrm).node.bone_name = hueso
    v1.humanoid.pose = "restPositionPose"   # el reposo YA es la T de MPFB (aplicada en el paso 3)
    v1.look_at.type = "expression"           # el esqueleto game_engine no tiene huesos de ojos; la mirada por expresión (vacía) no mueve nada
    pre = v1.expressions.preset
    for expr in EXPRESIONES:
        e = getattr(pre, expr)
        while len(e.morph_target_binds): e.morph_target_binds.remove(0)
        b = e.morph_target_binds.add(); b.node.mesh_object_name = cuerpo.name; b.index = expr; b.weight = 1.0
    pre.blink.is_binary = False


def pon_postura(esqueleto, giros):
    """Inclina huesos de la pose (en su eje X local) antes de fijar el reposo; el signo se elige para que la cabeza vaya hacia delante (−Y).
    Devuelve lo aplicado (para el informe) o None"""
    if not giros: return None
    pb = esqueleto.pose.bones
    def cabeza_y():
        bpy.context.view_layer.update(); return (esqueleto.matrix_world @ pb["head"].tail).y
    y0 = cabeza_y()
    antes = pb["spine_03"].matrix_basis.copy()
    pb["spine_03"].matrix_basis = antes @ Matrix.Rotation(0.1, 4, "X")
    signo = 1 if cabeza_y() < y0 else -1
    pb["spine_03"].matrix_basis = antes
    hecho = {}
    for n, a in giros.items():
        b = pb[n]; b.matrix_basis = b.matrix_basis @ Matrix.Rotation(signo * a, 4, "X"); hecho[n] = round(signo * a, 3)
    bpy.context.view_layer.update()
    hecho["cabeza_adelante_m"] = round(y0 - cabeza_y(), 3)
    return hecho


def genera(mpfb, edad, complexion, opc):
    ident = "cuerpo-" + edad + "-" + complexion
    nombre = NOMBRE_EDAD[edad] + ", " + NOMBRE_COMPLEXION[complexion]
    macro = dict(NEUTRO); macro["age"] = EDADES[edad]["age"]; macro.update(COMPLEXIONES[complexion]); macro["race"] = dict(RAZAS)
    limpia_escena(); MATERIALES.clear()
    HS, TS, RS = mpfb.services.HumanService, mpfb.services.TargetService, mpfb.services.RigService
    malla = HS.create_human(mask_helpers=False, detailed_helpers=True, extra_vertex_groups=True, feet_on_ground=True, scale=0.1, macro_detail_dict=macro)
    TS.bake_targets(malla)
    solo_cuerpo = sorted(vertices_de_grupos(malla, ["body"]))
    reposo, deltas = deltas_de_expresion(mpfb, malla)
    esqueleto = HS.add_builtin_rig(malla, "game_engine", import_weights=True)
    esqueleto.name = "esqueleto"; esqueleto.data.name = "esqueleto"
    activa(esqueleto); bpy.ops.object.mode_set(mode="POSE")
    with open(os.path.join(mpfb.services.LocationService.get_mpfb_data("poses"), "game_engine_fk", "t-pose.json"), encoding="utf-8") as f:
        RS.set_pose_from_dict(esqueleto, json.load(f))
    postura = pon_postura(esqueleto, POSTURA.get(edad))
    bpy.ops.object.mode_set(mode="OBJECT")
    RS.apply_pose_as_rest_pose(esqueleto)
    activa(malla)
    ojos, ayuda_pelo, ayuda_ropa, boca = separa_ojos_y_limpia(malla)
    tri_entera, tri = reduce(malla, opc["triangulos"])
    M = referencias(malla, esqueleto)
    piezas = {}
    piezas.update(piezas_vello(malla, esqueleto, boca, M))   # de la piel ya reducida, antes de los cortes de la ropa
    tri = pon_materiales(malla, ojos, esqueleto, M)
    pon_expresiones(malla, reposo, deltas, solo_cuerpo)
    piezas.update(piezas_pelo(ayuda_pelo, malla, esqueleto, M, boca))
    piezas.update(pieza_faena(ayuda_ropa, malla, esqueleto, M))
    asiento = asiento_paja(malla, ojos, piezas["pelo-corto"], M)
    piezas.update(piezas_sombrero(esqueleto, M, malla.users_collection[0], asiento))
    for o in (ayuda_pelo, ayuda_ropa): bpy.data.objects.remove(o, do_unlink=True)
    for o in [malla, ojos] + list(piezas.values()):
        o.parent = esqueleto
        if not any(m.type == "ARMATURE" for m in o.modifiers):
            am = o.modifiers.new("esqueleto", "ARMATURE"); am.object = esqueleto
    altura = max(v.co.z for v in malla.data.vertices) - min(v.co.z for v in malla.data.vertices)
    configura_vrm(None, esqueleto, malla, ident, nombre, macro)
    activa(esqueleto)
    fichero = os.path.join(opc["salida"], ident + ".vrm")
    r = bpy.ops.export_scene.vrm(filepath=fichero, armature_object_name=esqueleto.name, ignore_warning=True)
    if "FINISHED" not in r or not os.path.exists(fichero): raise SystemExit("cuerpos.py: el VRM Add-on no exportó " + ident + ": " + str(r))
    cfg = {"edad": edad, "complexion": complexion, "ofrecer": EDADES[edad]["ofrecer"], "anos_aprox": EDADES[edad]["anos"],
           "mpfb": {k: round(v, 4) for k, v in macro.items() if k != "race"}, "mpfb_race": {k: round(v, 4) for k, v in RAZAS.items()}}
    lado = {
        "id": ident, "nombre": nombre,
        "descripcion": nombre + " (cuerpo base del creador, con sus piezas dentro; la piel, el pelo y la ropa se tiñen en el motor)"
                       + ("; no se ofrece (decisión 132)" if not cfg["ofrecer"] else ""),
        "autor": AUTOR, "licencia": {"spdx": "CC0-1.0", "url": LICENCIA_URL},
        "fuente": {"nombre": "MakeHuman/MPFB " + VERSION_MPFB + " (núcleo CC0) + tuberia/avatares/creador/cuerpos.py", "url": "https://static.makehumancommunity.org/mpfb.html"},
        "colores_muneco": MUNECO, "cuerpo": cfg,
        # AV4 (contrato avatares v2): las piezas que trae este VRM, con el nombre de su malla y sus triángulos; la mirada va por expresión (vacía): sin huesos de ojos
        "piezas": [dict(PIEZAS[k], id=k, malla="pieza_" + k, triangulos=triangulos(o)) for k, o in sorted(piezas.items())],
        "mirada": "ninguna", "postura": postura,
    }
    with open(os.path.join(opc["salida"], ident + ".avatar.json"), "w", encoding="utf-8") as f: json.dump(lado, f, ensure_ascii=False, indent=2); f.write("\n")
    medida = {"id": ident, "triangulos_malla_entera": tri_entera, "triangulos_cuerpo": tri, "triangulos_ojos": triangulos(ojos),
              "piezas": {k: triangulos(o) for k, o in sorted(piezas.items())}, "postura": postura,
              "paja": {"ala_z": round(asiento[2], 3), "techo_z": round(asiento[3], 3), "semiejes": [round(asiento[4], 3), round(asiento[5], 3)]},
              "altura_m": round(altura, 3), "bytes": os.path.getsize(fichero), **cfg}
    print("cuerpos: " + json.dumps(medida, ensure_ascii=False), flush=True)
    return medida


def main():
    opc = argumentos()
    os.makedirs(opc["salida"], exist_ok=True)
    nombre_mpfb, nombre_vrm = complemento("mpfb"), complemento("vrm")
    import importlib
    mpfb = importlib.import_module(nombre_mpfb)
    importlib.import_module(nombre_mpfb + ".services")
    medidas = []
    for edad in EDADES:
        for complexion in COMPLEXIONES:
            ident = "cuerpo-" + edad + "-" + complexion
            if opc["solo"] and ident not in opc["solo"].split(","): continue
            medidas.append(genera(mpfb, edad, complexion, opc))
    if not opc["solo"]:
        with open(os.path.join(opc["salida"], "cuerpos.json"), "w", encoding="utf-8") as f:
            json.dump({"blender": bpy.app.version_string, "mpfb": VERSION_MPFB, "vrm_addon": VERSION_VRM, "tope_triangulos": opc["triangulos"], "cuerpos": medidas},
                      f, ensure_ascii=False, indent=2); f.write("\n")
    print("cuerpos: hechos " + str(len(medidas)), flush=True)


if __name__ == "__main__":
    try:
        main()
    except SystemExit as e:
        print(str(e), file=sys.stderr); sys.exit(1)
    except Exception:
        import traceback; traceback.print_exc(); sys.exit(1)
