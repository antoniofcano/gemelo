# Luz interior ILUSTRATIVA de un mundo cerrado (la nave de la fábrica), para hornear. El escaneo (MEDIDO) tapa los huecos
# de la obra restaurada y con sol y cielo el interior sale negro; el escaneo NO se abre. Lo que se hace:
#   1. los objetos de «no_tapan» (el muro escaneado) dejan de dar sombra al sol y a las luces de hueco (enlace de sombras
#      de Cycles): siguen ahí, se ven y reciben luz, pero la luz entra por los huecos de la obra como si no estuvieran;
#   2. los materiales de «cristales» dejan pasar los rayos de sombra (el vidrio no hace de pared);
#   3. una luz de área por hueco, fuera, mirando hacia dentro: el cielo que entraría por esa ventana o puerta;
#   4. por cada hueco al que le da el sol, un «haz» de polvo: un prisma barato con transparencia aditiva (colección
#      EFECTOS: no se hornea ni da sombra) desde el hueco, en la dirección del sol, hasta lo primero que toca, con motas.
# El sol es el de prepara.py (gemelo_sol_azimut / gemelo_sol_elevacion); aquí no se mueve.
# Todo lo creado lleva gemelo_procedencia = «ilustrativo»: la luz interior es ilustrativa y así se dice en el mundo.
#   blender --background <mundo.blend> --python luces.py -- <luces.json> [--guarda <otro.blend>]
# luces.json (privado: lleva cotas del sitio). Coordenadas de Blender, metros:
#   {"no_tapan": ["muros"], "cristales": ["vidrio"],
#    "cielo": {"w_m2": 30, "color": [0.8, 0.88, 1.0], "separacion": 0.35},
#    "huecos": [{"nombre": "v_sur_1", "centro": [x, y, z], "ancho": 0.92, "alto": 1.36, "dentro": [dx, dy], "cielo": 1.0}],
#    "haces": {"fuerza": 0.35, "color": [1.0, 0.82, 0.6], "borde": 2.0, "largo_max": 10, "fondo": 0.3, "motas": 250, "mota_m": 0.008,
#              "no_cortan": ["…"]},
#    "puntos": [{"nombre": "…", "en": [x, y, z], "w": 20, "color": [r, g, b], "radio": 0.1}]}
# Se puede repetir: borra lo que creó la vez anterior (colecciones LUCES y EFECTOS).
import bpy, bmesh, sys, json, math, os, random
from mathutils import Vector


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"luces": a[0], "guarda": None}
    i = 1
    while i < len(a):
        o[a[i].lstrip("-")] = a[i + 1]; i += 2
    return o


def coleccion(nombre, vacia=False):
    c = bpy.data.collections.get(nombre)
    if c is None:
        c = bpy.data.collections.new(nombre); bpy.context.scene.collection.children.link(c)
    elif vacia:
        for o in list(c.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    return c


def no_tapan(nombres):
    """Colección de enlace de sombras: lo que hay en ella con estado EXCLUDE no da sombra a la luz que la use"""
    c = bpy.data.collections.get("LUCES_no_tapan")
    if c is not None:
        bpy.data.collections.remove(c)
    c = bpy.data.collections.new("LUCES_no_tapan")
    for n in nombres:
        c.objects.link(bpy.data.objects[n])
    for co in c.collection_objects:
        co.light_linking.link_state = "EXCLUDE"
    return c


def cristal(m):
    """El material deja pasar los rayos de sombra (mezcla con transparente si el rayo es de sombra)"""
    nt = m.node_tree
    if "gemelo_sombra" in nt.nodes:
        return False
    sal = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and n.is_active_output)
    origen = sal.inputs["Surface"].links[0].from_socket
    mez = nt.nodes.new("ShaderNodeMixShader"); mez.name = "gemelo_sombra"
    cam = nt.nodes.new("ShaderNodeLightPath"); tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    nt.links.new(cam.outputs["Is Shadow Ray"], mez.inputs[0]); nt.links.new(origen, mez.inputs[1])
    nt.links.new(tr.outputs[0], mez.inputs[2]); nt.links.new(mez.outputs[0], sal.inputs["Surface"])
    return True


def luz_de_hueco(h, cielo, col, tapan):
    c = Vector(h["centro"]); d = Vector((h["dentro"][0], h["dentro"][1], 0)).normalized()
    ld = bpy.data.lights.new("cielo_" + h["nombre"], "AREA"); ld.shape = "RECTANGLE"; ld.size = h["ancho"]; ld.size_y = h["alto"]
    ld.energy = cielo["w_m2"] * h["ancho"] * h["alto"] * h.get("cielo", 1.0); ld.color = cielo.get("color", (1, 1, 1))
    o = bpy.data.objects.new(ld.name, ld); col.objects.link(o)
    o.location = c - d * cielo.get("separacion", 0.35)
    o.rotation_euler = d.to_track_quat("-Z", "Z").to_euler()  # el área alumbra hacia su −Z; su Y local queda vertical
    if tapan is not None:
        o.light_linking.blocker_collection = tapan
    o["gemelo_procedencia"] = "ilustrativo"; o["gemelo_nota"] = "cielo que entraría por el hueco " + h["nombre"]
    o.visible_camera = False
    return o


def primer_obstaculo(dg, p, t, saltar, lejos):
    """Distancia desde p en la dirección t a lo primero que no esté en `saltar`"""
    hecho = 0.0; q = p.copy()
    while hecho < lejos:
        ok, loc, n, i, ob, m = bpy.context.scene.ray_cast(dg, q, t, distance=lejos - hecho)
        if not ok:
            return lejos
        hecho += (loc - q).length
        if ob.name not in saltar:
            return hecho
        q = loc + t * 0.02; hecho += 0.02
    return lejos


def material_haz(haces):
    m = bpy.data.materials.get("haz_polvo") or bpy.data.materials.new("haz_polvo")
    m.use_nodes = True; nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    # fuerza = atributo «haz» × fuerza × |N·V|^borde: las caras vistas de canto se apagan y el prisma no enseña sus aristas
    at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_name = "haz"
    cara = nt.nodes.new("ShaderNodeLayerWeight"); cara.inputs["Blend"].default_value = 0.5
    de_frente = nt.nodes.new("ShaderNodeMath"); de_frente.operation = "SUBTRACT"; de_frente.inputs[0].default_value = 1.0
    pot = nt.nodes.new("ShaderNodeMath"); pot.operation = "POWER"; pot.inputs[1].default_value = haces.get("borde", 2.0)
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = haces.get("fuerza", 0.35)
    mul2 = nt.nodes.new("ShaderNodeMath"); mul2.operation = "MULTIPLY"
    em = nt.nodes.new("ShaderNodeEmission"); em.inputs["Color"].default_value = (*haces.get("color", (1, 0.82, 0.6)), 1)
    tr = nt.nodes.new("ShaderNodeBsdfTransparent"); suma = nt.nodes.new("ShaderNodeAddShader"); sal = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(cara.outputs["Facing"], de_frente.inputs[1]); nt.links.new(de_frente.outputs[0], pot.inputs[0])
    nt.links.new(at.outputs["Fac"], mul.inputs[0]); nt.links.new(mul.outputs[0], mul2.inputs[0]); nt.links.new(pot.outputs[0], mul2.inputs[1])
    nt.links.new(mul2.outputs[0], em.inputs["Strength"])
    nt.links.new(tr.outputs[0], suma.inputs[0]); nt.links.new(em.outputs[0], suma.inputs[1]); nt.links.new(suma.outputs[0], sal.inputs["Surface"])
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    m["gemelo_procedencia"] = "ilustrativo"; m["gemelo_nota"] = "aditivo: color = fondo + color × atributo «haz» × fuerza × |N·V|^borde"
    return m


def haz(h, haces, t, dg, saltar, col, mat, semilla):
    """Prisma del hueco extruido a lo largo del sol, con el atributo «haz» de 1 (hueco) a 0 (final) y motas dentro"""
    c = Vector(h["centro"]); d = Vector((h["dentro"][0], h["dentro"][1], 0)).normalized(); lado = Vector((-d.y, d.x, 0))
    c0 = c + d * haces.get("fondo", 0.3); a, b = h["ancho"] / 2 * 0.92, h["alto"] / 2 * 0.92
    esq = [c0 + lado * sx * a + Vector((0, 0, sz * b)) for sx, sz in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    lejos = haces.get("largo_max", 10.0)
    largos = [primer_obstaculo(dg, e + t * 0.05, t, saltar, lejos) for e in esq + [c0]]
    largo = max(0.5, sorted(largos)[len(largos) // 2])  # la mediana: un obstáculo fino no corta el haz entero
    bm = bmesh.new(); capa = bm.verts.layers.float.new("haz"); n = 6
    filas = []
    for k in range(n + 1):
        f = k / n
        fila = [bm.verts.new(e + t * largo * f) for e in esq]
        for v in fila:
            v[capa] = (1 - f) ** 1.5 * (0.35 + 0.65 * min(1.0, k / 1.0))  # nace suave en el hueco y se apaga hacia el final
        filas.append(fila)
    for k in range(n):
        for i in range(4):
            bm.faces.new((filas[k][i], filas[k][(i + 1) % 4], filas[k + 1][(i + 1) % 4], filas[k + 1][i]))
        bm.faces.new((filas[k][0], filas[k][2], filas[k + 1][2], filas[k + 1][0]))  # una hoja diagonal: da cuerpo de lado
        bm.faces.new((filas[k][1], filas[k][3], filas[k + 1][3], filas[k + 1][1]))
    rnd = random.Random(semilla); m = haces.get("mota_m", 0.008)
    for _ in range(int(haces.get("motas", 0))):
        f = rnd.random() ** 1.3; u, w = rnd.uniform(-a, a), rnd.uniform(-b, b)
        p = c0 + lado * u + Vector((0, 0, w)) + t * largo * f
        vs = [bm.verts.new(p + Vector((rnd.uniform(-m, m), rnd.uniform(-m, m), rnd.uniform(-m, m)))) for _ in range(3)]
        for v in vs:
            v[capa] = 6.0 * (1 - f)
        bm.faces.new(vs)
    me = bpy.data.meshes.new("haz_" + h["nombre"]); bm.to_mesh(me); bm.free(); me.materials.append(mat)
    o = bpy.data.objects.new(me.name, me); col.objects.link(o)
    for k in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow"):
        setattr(o, k, False)
    o["gemelo_procedencia"] = "ilustrativo"; o["gemelo_efecto"] = "haz"
    return o, largo


def principal():
    a = argumentos(); spec = json.load(open(a["luces"], encoding="utf-8")); esc = bpy.context.scene
    luces = coleccion("LUCES", vacia=True); efectos = coleccion("EFECTOS", vacia=True)
    # sin «no_tapan» no hay enlace de sombras: todo tapa (una colección vacía querría decir que nada tapa)
    tapan = no_tapan(spec["no_tapan"]) if spec.get("no_tapan") else None
    sol = bpy.data.objects.get("sol")
    if sol is None:
        raise SystemExit("la escena no tiene sol: pasa antes prepara.py")
    sol.light_linking.blocker_collection = tapan  # None quita el enlace que hubiera
    hechos = [n for n in spec.get("cristales", []) if n in bpy.data.materials and cristal(bpy.data.materials[n])]
    az, el = math.radians(esc["gemelo_sol_azimut"]), math.radians(esc["gemelo_sol_elevacion"])
    t = -Vector((math.sin(az) * math.cos(el), math.cos(az) * math.cos(el), math.sin(el)))  # hacia donde viaja la luz del sol
    informe = {"blend": os.path.basename(bpy.data.filepath), "no_tapan": spec.get("no_tapan", []), "cristales": hechos, "huecos": {}}
    cielo = spec.get("cielo", {"w_m2": 30}); haces = spec.get("haces")
    mat = material_haz(haces) if haces else None
    dg = bpy.context.evaluated_depsgraph_get(); saltar = set(spec.get("no_tapan", [])) | set(haces.get("no_cortan", []) if haces else [])
    for i, h in enumerate(spec.get("huecos", [])):
        fila = {}
        if h.get("cielo", 1.0) > 0:
            o = luz_de_hueco(h, cielo, luces, tapan); fila["cielo_w"] = round(o.data.energy, 1)
        d = Vector((h["dentro"][0], h["dentro"][1], 0)).normalized()
        fila["le_da_el_sol"] = bool(t.dot(d) > 0.15)
        if haces and fila["le_da_el_sol"] and h.get("haz", True):
            o, largo = haz(h, haces, t, dg, saltar, efectos, mat, 1000 + i); fila["haz_m"] = round(largo, 2)
            fila["haz_triangulos"] = sum(len(p.vertices) - 2 for p in o.data.polygons)
        informe["huecos"][h["nombre"]] = fila; print("LUZ", h["nombre"], json.dumps(fila))
    for p in spec.get("puntos", []):
        ld = bpy.data.lights.new(p["nombre"], "POINT"); ld.energy = p["w"]; ld.color = p.get("color", (1, 1, 1)); ld.shadow_soft_size = p.get("radio", 0.1)
        o = bpy.data.objects.new(p["nombre"], ld); luces.objects.link(o); o.location = p["en"]; o["gemelo_procedencia"] = "ilustrativo"
    esc["gemelo_luz_interior"] = "ilustrativa (luces.py)" + (": " + ", ".join(spec["no_tapan"]) + " no da sombra al sol ni a las luces de hueco" if spec.get("no_tapan") else "")
    destino = os.path.abspath(a["guarda"]) if a["guarda"] else bpy.data.filepath
    bpy.ops.wm.save_as_mainfile(filepath=destino, compress=True)
    json.dump(informe, open(os.path.splitext(destino)[0] + ".luces.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("LUCES_TOTAL", len(informe["huecos"]), "huecos")


principal()
