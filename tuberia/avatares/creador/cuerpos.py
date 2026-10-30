# Creador por piezas, fase 1 (AV3): los 12 CUERPOS BASE de la familia (4 edades × 3 complexiones) desde MakeHuman/MPFB, exportados a VRM 1.0.
# Ver doc/sistema/AVATARES-FAMILIA.md §12 (versiones, licencias, valores de los deslizadores y cifras) y las decisiones 128-132.
#
#   Sin --factory-startup: hace falta el perfil con los complementos instalados (MPFB 2.0.18 y VRM Add-on 4.10.3).
#   blender --background --python-exit-code 1 --python tuberia/avatares/creador/cuerpos.py -- --salida <carpeta fuera del repo> [--solo <id>] [--triangulos 10000]
#     --salida      donde dejar <id>.vrm, <id>.avatar.json y cuerpos.json (por defecto GEMELO_AVATARES_ORIGEN). Los VRM no se versionan (regla 4).
#     --solo        genera solo ese cuerpo (p. ej. cuerpo-adulta-media)
#     --triangulos  tope de triángulos del cuerpo tras reducir (por defecto 10000; el de la tubería es 15.000/20.000 y 26b admite 3 VRM en el Quest)
#   Lánzalo por el banco (no coincide con Chrome/Docker y espera memoria): node pruebas/banco/proceso.js --que "AV3 cuerpos" -- <blender> --background …
#
# Qué hace con cada cuerpo:
#   1. MPFB crea la malla base con los deslizadores «macro» (edad, peso, musculatura; el resto en su valor central: ver CUERPOS) y los hornea.
#   2. Lee de los «targets» de expresión de MPFB el cierre de párpados (blink) y la boca abierta (aa), como desplazamientos por vértice.
#   3. Pone el esqueleto «game_engine» de MPFB con sus pesos, lo lleva a la pose en T de MPFB y la aplica como reposo (VRM pide T).
#   4. Quita la geometría auxiliar (dientes, lengua, pestañas, cubos de articulación, ayudas de ropa) y separa los ojos (malla aparte, al hueso head).
#   5. Reduce el cuerpo (Decimate «collapse» simétrico en X) hasta el tope y le vuelve a poner blink y aa con los 3 vecinos más cercanos de la malla entera.
#   6. Materiales lisos SIN textura, para teñirse en el motor (decisión 128): «piel» y «ropa_base» en blanco (el motor multiplica por el color elegido)
#      y «ojos» oscuro. «ropa_base» es una capa de ropa sobria (camiseta y pantalón corto) para que ningún cuerpo vaya desnudo; la ropa de verdad, AV4.
#   7. VRM 1.0 con el VRM Add-on: huesos humanoides (mapa explícito), expresiones blink/aa, meta CC0 con uso corporativo, redistribución y modificación.
# Determinista: mismos complementos y mismos valores → misma malla (la reducción «collapse» no usa azar).
import bpy
import bmesh
import json
import os
import sys
import math
from mathutils import kdtree, Vector

VERSION_MPFB, VERSION_VRM = "2.0.18", "4.10.3"

# ------------------------------------------------------------------------------------------------ los 12 cuerpos
# MPFB (macrodetails) va de 0 a 1. Edad: 0 = 1 año, 0,1875 = 11, 0,5 = 25, 1 = 90 (interpolación lineal por tramos de MakeHuman).
EDADES = {
    "peque":  {"age": 0.13, "anos": 8,  "ofrecer": False},   # decisión 132: se diseñan y NO se ofrecen hasta reabrir la 45
    "joven":  {"age": 0.32, "anos": 17, "ofrecer": True},
    "adulta": {"age": 0.62, "anos": 40, "ofrecer": True},
    "mayor":  {"age": 0.88, "anos": 75, "ofrecer": True},
}
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
# «ropa_base»: camiseta de manga corta y pantalón hasta encima de la rodilla, con cortes rectos por planos sacados del esqueleto en T:
# de RODILLA (sobre la cabeza del hueso calf) a CUELLO (bajo la del neck_01) en el tronco, y en el brazo hasta MANGA (fracción del húmero).
# de ESCOTE (fracción de la anchura de hombros) hacia el centro, el corte del cuello baja a CUELLO; hacia fuera, los hombros van vestidos.
RODILLA, CUELLO, MANGA, ESCOTE = 0.035, 0.025, 0.45, 0.6   # RODILLA y CUELLO en fracción de la altura; MANGA, del húmero; ESCOTE, de la anchura de hombros
# Expresiones (targets de MPFB, CC0): blink = los dos párpados; aa = boca abierta. Se promedian las tres variantes que trae MPFB.
EXPRESIONES = {"blink": ["eye-left-closure", "eye-right-closure"], "aa": ["mouth-open"]}
VARIANTES_EXPRESION = ["african", "asian", "caucasian"]

LICENCIA_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
AUTOR = "Cano & Damas Oleicultores (gemelo; generado con MakeHuman/MPFB)"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    o = {"salida": os.environ.get("GEMELO_AVATARES_ORIGEN"), "solo": None, "triangulos": 10000}
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


def separa_ojos_y_limpia(malla):
    """Ojos a un objeto aparte (todo su peso al hueso head); fuera todo lo que no es cuerpo"""
    cuerpo = vertices_de_grupos(malla, ["body"])
    ojos = vertices_de_grupos(malla, ["helper-l-eye", "helper-r-eye"]) - cuerpo
    obj_ojos = malla.copy(); obj_ojos.data = malla.data.copy()
    malla.users_collection[0].objects.link(obj_ojos)
    obj_ojos.name = obj_ojos.data.name = "ojos"
    malla.name = malla.data.name = "cuerpo"

    def deja(obj, quedan):
        bm = bmesh.new(); bm.from_mesh(obj.data); bm.verts.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in quedan], context="VERTS")
        bm.to_mesh(obj.data); bm.free(); obj.data.update()
    deja(obj_ojos, ojos)
    deja(malla, cuerpo)
    # ojos: todo al hueso head
    for g in list(obj_ojos.vertex_groups):
        if g.name != "head": obj_ojos.vertex_groups.remove(g)
    gh = obj_ojos.vertex_groups.get("head") or obj_ojos.vertex_groups.new(name="head")
    gh.add([v.index for v in obj_ojos.data.vertices], 1.0, "REPLACE")
    return obj_ojos


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


def pon_materiales(cuerpo, ojos, esqueleto):
    piel, ropa, mo = material("piel", (1, 1, 1)), material("ropa_base", (1, 1, 1)), material("ojos", (0.06, 0.05, 0.05), 0.4)
    cuerpo.data.materials.clear(); cuerpo.data.materials.append(piel); cuerpo.data.materials.append(ropa)
    ojos.data.materials.clear(); ojos.data.materials.append(mo)
    em = esqueleto.matrix_world
    cabeza = lambda b: em @ esqueleto.data.bones[b].head_local
    zs = [v.co.z for v in cuerpo.data.vertices]; alto = max(zs) - min(zs)
    z_min = cabeza("calf_l").z + RODILLA * alto
    z_max = cabeza("neck_01").z - CUELLO * alto
    hombro = abs(cabeza("upperarm_l").x)
    manga = hombro + MANGA * (abs(cabeza("lowerarm_l").x) - hombro)
    # cortes rectos: se parte la malla por los planos (los pesos y las UV se interpolan) y se vuelve a triangular
    bm = bmesh.new(); bm.from_mesh(cuerpo.data)
    cuello_z, escote = cabeza("neck_01").z, ESCOTE * hombro
    planos = [((0, 0, z_min), (0, 0, 1)), ((0, 0, z_max), (0, 0, 1))] + [((sx * x, 0, 0), (1, 0, 0)) for x in (manga, escote) for sx in (1, -1)]
    for co, no in planos:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    for f in bm.faces:
        c = f.calc_center_median(); ax = abs(c.x)
        # dentro de la manga y sobre la rodilla: el brazo; los hombros hasta poco más arriba de la base del cuello; el centro, hasta el escote
        f.material_index = 1 if (ax < manga and c.z > z_min and (ax >= hombro or (ax >= escote and c.z < cuello_z + 0.02 * alto) or c.z < z_max)) else 0
    bm.to_mesh(cuerpo.data); bm.free(); cuerpo.data.update()
    for o in (cuerpo, ojos):
        for p in o.data.polygons: p.use_smooth = True
    # fuera los grupos que no son huesos (el VRM solo necesita los pesos de los huesos)
    for o in (cuerpo, ojos):
        for g in list(o.vertex_groups):
            if g.name not in esqueleto.data.bones: o.vertex_groups.remove(g)
    return triangulos(cuerpo)


def configura_vrm(vrm_mod, esqueleto, cuerpo, ident, nombre, cfg):
    ext = esqueleto.data.vrm_addon_extension
    ext.spec_version = "1.0"
    v1 = ext.vrm1
    meta = v1.meta
    meta.vrm_name = nombre
    meta.version = "AV3"
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


def genera(mpfb, edad, complexion, opc):
    ident = "cuerpo-" + edad + "-" + complexion
    nombre = NOMBRE_EDAD[edad] + ", " + NOMBRE_COMPLEXION[complexion]
    macro = dict(NEUTRO); macro["age"] = EDADES[edad]["age"]; macro.update(COMPLEXIONES[complexion]); macro["race"] = dict(RAZAS)
    limpia_escena()
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
    bpy.ops.object.mode_set(mode="OBJECT")
    RS.apply_pose_as_rest_pose(esqueleto)
    activa(malla)
    ojos = separa_ojos_y_limpia(malla)
    tri_entera, tri = reduce(malla, opc["triangulos"])
    tri = pon_materiales(malla, ojos, esqueleto)
    pon_expresiones(malla, reposo, deltas, solo_cuerpo)
    for o in (malla, ojos):
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
        "descripcion": nombre + ", sin pelo ni ropa de faena (cuerpo base del creador; la piel y la ropa se tiñen en el motor)"
                       + ("; no se ofrece (decisión 132)" if not cfg["ofrecer"] else ""),
        "autor": AUTOR, "licencia": {"spdx": "CC0-1.0", "url": LICENCIA_URL},
        "fuente": {"nombre": "MakeHuman/MPFB " + VERSION_MPFB + " (núcleo CC0) + tuberia/avatares/creador/cuerpos.py", "url": "https://static.makehumancommunity.org/mpfb.html"},
        "colores_muneco": MUNECO, "cuerpo": cfg,
    }
    with open(os.path.join(opc["salida"], ident + ".avatar.json"), "w", encoding="utf-8") as f: json.dump(lado, f, ensure_ascii=False, indent=2); f.write("\n")
    medida = {"id": ident, "triangulos_malla_entera": tri_entera, "triangulos_cuerpo": tri, "triangulos_ojos": triangulos(ojos),
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
            if opc["solo"] and opc["solo"] != ident: continue
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
