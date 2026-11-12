# Obra ILUSTRATIVA sobre un mundo interior ya separado (separa.py): corrige huecos y añade piezas que una persona ha
# confirmado del sitio real (portones, verjas, tapias, un fondo tras una verja). Todo lo que crea va a la colección
# ILUSTRATIVO con gemelo_procedencia = «ilustrativo» y gemelo_obra = su nombre; lo que quita no se borra: va a DESCARTES.
# No toca nada MEDIDO: si una operación nombra un objeto de procedencia «medido», se niega.
#   blender --background <mundo_base.blend> --python obra.py -- <obra.json> [--guarda <mundo.blend>]
# Se ejecuta siempre sobre el .blend de partida (las operaciones «abre» y «aparta» no se pueden repetir encima).
# obra.json (privado: lleva las cotas del sitio, no entra en el repo). Coordenadas de Blender, en metros, Z arriba:
#   {"materiales": {"anil": {"color": [r, g, b], "rugosidad": 0.5, "metal": 0.0}},
#    "operaciones": [
#     {"op": "aparta", "objeto": "…", "caja": [[x0, y0, z0], [x1, y1, z1]]}     caras dentro de la caja → DESCARTES
#     {"op": "abre", "objeto": "…", "caja": [[…], […]]}                         corta el objeto por la caja y vacía el hueco
#     {"op": "caja", "nombre": "…", "min": […], "max": […], "material": "…"}    un prisma (tapia, columna, murete, solera)
#     {"op": "porton", "nombre": "…", "de": [x, y], "a": [x, y], "z": z, "alto": h, "apertura": grados,
#      "dentro": [dx, dy], "material": "…"}                                     dos hojas con bisagra en «de» y en «a»
#     {"op": "verja", "nombre": "…", "de": [x, y], "a": [x, y], "z": z, "alto": 1.0, "murete": 0.35,
#      "material": "…", "material_murete": "…", "cancela": [t0, t1, grados], "dentro": [dx, dy]}
#                                                                               tablas con punta sobre un murete; la
#                                                                               cancela va de t0 a t1 metros desde «de»
#     {"op": "planta", "nombre": "…", "tipo": "cipres|mata", "en": [x, y, z], "alto": h, "ancho": a, "material": "…"}
#    ]}
# Después hay que pasar prepara.py --objetos <los tocados y los nuevos> (los escribe en <mundo>.obra.json) para el UV «luz».
import bpy, bmesh, sys, json, math, os
from mathutils import Vector, Matrix

UV_M = 0.5  # vueltas de textura por metro en lo que se crea aquí


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"obra": a[0], "guarda": None}
    i = 1
    while i < len(a):
        o[a[i].lstrip("-")] = a[i + 1]; i += 2
    return o


def coleccion(nombre):
    c = bpy.data.collections.get(nombre)
    if c is None:
        c = bpy.data.collections.new(nombre); bpy.context.scene.collection.children.link(c)
    return c


def material(nombre, defs):
    m = bpy.data.materials.get(nombre)
    if m is not None:
        return m
    if nombre not in defs:
        raise SystemExit("material desconocido y sin definir en la obra: " + nombre)
    d = defs[nombre]
    m = bpy.data.materials.new(nombre); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*d["color"], 1); b.inputs["Roughness"].default_value = d.get("rugosidad", 0.7)
    b.inputs["Metallic"].default_value = d.get("metal", 0.0)
    m.diffuse_color = (*d["color"], 1); m["gemelo_procedencia"] = "ilustrativo"
    return m


def no_medido(o):
    if o.get("gemelo_procedencia") == "medido":
        raise SystemExit(o.name + " es MEDIDO: la obra ilustrativa no lo toca")


def dentro(p, caja, eps=1e-4):
    return all(caja[0][k] - eps <= p[k] <= caja[1][k] + eps for k in range(3))


def aparta(op):
    """Las caras con el centro dentro de la caja pasan a un objeto descartes_<objeto> de DESCARTES"""
    o = bpy.data.objects[op["objeto"]]; no_medido(o); caja = op["caja"]
    bm = bmesh.new(); bm.from_mesh(o.data)
    caras = [f for f in bm.faces if dentro(o.matrix_world @ f.calc_center_median(), caja)]
    if not caras:
        bm.free(); return {"caras": 0}
    bm.faces.index_update(); idx = {f.index for f in caras}
    otro = bm.copy(); otro.faces.ensure_lookup_table()
    bmesh.ops.delete(otro, geom=[f for f in otro.faces if f.index not in idx], context="FACES")
    n = len(caras)
    bmesh.ops.delete(bm, geom=caras, context="FACES"); bm.to_mesh(o.data); bm.free()
    nombre = "descartes_" + o.name; d = bpy.data.objects.get(nombre)
    me = bpy.data.meshes.new(nombre + "_" + str(len(bpy.data.meshes))); otro.to_mesh(me); otro.free()
    for m in o.data.materials:
        me.materials.append(m)
    if d is None:
        d = bpy.data.objects.new(nombre, me); coleccion("DESCARTES").objects.link(d)
        d.matrix_world = o.matrix_world; d.hide_render = True; d.hide_viewport = True
        d["gemelo_procedencia"] = o.get("gemelo_procedencia", "ilustrativo")
        d["gemelo_nota"] = "piezas apartadas por obra.py (lo confirmado del sitio las sustituye); no se borran"
    else:
        bm2 = bmesh.new(); bm2.from_mesh(d.data); bm2.from_mesh(me); bm2.to_mesh(d.data); bm2.free(); bpy.data.meshes.remove(me)
    return {"caras": n}


def abre(op):
    """Corta el objeto por las seis caras de la caja (solo las caras que la tocan) y vacía lo que queda dentro"""
    o = bpy.data.objects[op["objeto"]]; no_medido(o); caja = [Vector(op["caja"][0]), Vector(op["caja"][1])]
    bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
    def toca(f):
        vs = [v.co for v in f.verts]
        return all(min(v[k] for v in vs) <= caja[1][k] and max(v[k] for v in vs) >= caja[0][k] for k in range(3))
    for k in range(3):
        for lado in (0, 1):
            caras = [f for f in bm.faces if toca(f)]
            geom = list({e for f in caras for e in f.edges}) + list({v for f in caras for v in f.verts}) + caras
            n = Vector((0, 0, 0)); n[k] = 1
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=caja[lado], plane_no=n, dist=1e-5)
    fuera = [f for f in bm.faces if dentro(f.calc_center_median(), caja)]
    n = len(fuera)
    bmesh.ops.delete(bm, geom=fuera, context="FACES")
    bm.transform(o.matrix_world.inverted()); bm.to_mesh(o.data); bm.free(); o.data.update()
    return {"caras_quitadas": n}


class Pieza:
    """Acumula prismas en un bmesh, con UV por proyección de caja (en metros) y color de vértice blanco"""

    def __init__(self):
        self.bm = bmesh.new(); self.uv = self.bm.loops.layers.uv.new("UVMap"); self.mats = []

    def indice(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def caras(self, verts, caras, mat, m=None):
        m = m or Matrix.Identity(4); i = self.indice(mat)
        vs = [self.bm.verts.new(m @ Vector(v)) for v in verts]
        for c in caras:
            f = self.bm.faces.new([vs[k] for k in c]); f.material_index = i
            n = (vs[c[1]].co - vs[c[0]].co).cross(vs[c[2]].co - vs[c[0]].co)
            eje = max(range(3), key=lambda k: abs(n[k])); a, b = [k for k in range(3) if k != eje]
            for l in f.loops:
                l[self.uv].uv = (l.vert.co[a] * UV_M, l.vert.co[b] * UV_M)

    def prisma(self, mn, mx, mat, m=None):
        x0, y0, z0 = mn; x1, y1, z1 = mx
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        self.caras(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat, m)

    def objeto(self, nombre, defs, obra):
        me = bpy.data.meshes.new(nombre); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for n in self.mats:
            me.materials.append(material(n, defs))
        col = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")  # los materiales del glb multiplican por «Color»
        col.data.foreach_set("color", [1.0] * (4 * len(col.data)))
        o = bpy.data.objects.new(nombre, me); coleccion("ILUSTRATIVO").objects.link(o)
        o["gemelo_procedencia"] = "ilustrativo"; o["gemelo_obra"] = obra
        return o


def giro_hoja(bisagra, u, grados, hacia, z):
    """+X de la hoja = u girado `grados` en planta, en el sentido que la lleva hacia `hacia`"""
    ang = math.atan2(u.y, u.x)
    for s in (1, -1):
        d = Vector((math.cos(ang + s * math.radians(grados)), math.sin(ang + s * math.radians(grados))))
        if d.dot(hacia) >= -1e-9:
            return Matrix.Translation((bisagra[0], bisagra[1], z)) @ Matrix.Rotation(ang + s * math.radians(grados), 4, "Z")
    return Matrix.Translation((bisagra[0], bisagra[1], z)) @ Matrix.Rotation(ang, 4, "Z")


def porton(op, defs):
    """Dos hojas de chapa con bastidor y nervios, cada una media luz, con la bisagra en los extremos"""
    a, b = Vector(op["de"]), Vector(op["a"]); luz = (b - a).length; h = op["alto"]; mat = op["material"]
    hacia = Vector(op.get("dentro", (0, 0))); p = Pieza(); ancho = luz / 2 - 0.01
    for bis, u in ((a, (b - a).normalized()), (b, (a - b).normalized())):
        m = giro_hoja(bis, u, op.get("apertura", 0), hacia, op["z"] + 0.04)
        p.prisma((0, -0.008, 0), (ancho, 0.008, h), mat, m)  # la chapa
        for x0, x1, z0, z1 in ((0, ancho, 0, 0.07), (0, ancho, h - 0.07, h), (0, 0.07, 0, h), (ancho - 0.07, ancho, 0, h),
                               (0, ancho, h * 0.36, h * 0.36 + 0.06), (0, ancho, h * 0.68, h * 0.68 + 0.06)):
            p.prisma((x0, -0.03, z0), (x1, 0.03, z1), mat, m)  # bastidor y travesaños
        n = max(2, round(ancho / 0.28))
        for k in range(1, n):
            x = ancho * k / n
            p.prisma((x - 0.012, -0.02, 0.07), (x + 0.012, 0.02, h - 0.07), mat, m)  # nervios de la chapa
    return p.objeto(op["nombre"], defs, op["nombre"])


def tablas(p, m, largo, alto, mat, paso=0.17, ancho=0.09, z0=0.0):
    """Tablas verticales con la punta redondeada (un pentágono extruido) y dos largueros, en el marco m"""
    n = max(1, int(largo / paso))
    x0 = (largo - (n - 1) * paso) / 2
    for k in range(n):
        x = x0 + k * paso; a = ancho / 2; h = alto
        v = [(x - a, -0.01, z0), (x + a, -0.01, z0), (x + a, -0.01, z0 + h - a), (x, -0.01, z0 + h), (x - a, -0.01, z0 + h - a)]
        v += [(q[0], 0.01, q[2]) for q in v]
        p.caras(v, [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5), (0, 5, 6, 1), (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4), (4, 9, 5, 0)], mat, m)
    for z in (z0 + alto * 0.3, z0 + alto * 0.72):
        p.prisma((0, 0.01, z), (largo, 0.035, z + 0.07), mat, m)


def verja(op, defs):
    a, b = Vector(op["de"]), Vector(op["a"]); u = (b - a).normalized(); largo = (b - a).length
    z = op["z"]; alto = op.get("alto", 1.0); hm = op.get("murete", 0.35); mat = op["material"]
    base = Matrix.Translation((a.x, a.y, z)) @ Matrix.Rotation(math.atan2(u.y, u.x), 4, "Z")
    c = op.get("cancela"); p = Pieza()
    tramos = [(0, largo)] if not c else [t for t in ((0, c[0]), (c[1], largo)) if t[1] - t[0] > 0.05]
    for t0, t1 in tramos:
        if hm > 0:
            p.prisma((t0, -0.12, 0), (t1, 0.12, hm), op.get("material_murete", mat), base)
        tablas(p, base @ Matrix.Translation((t0, 0, hm)), t1 - t0, alto, mat)
        for x in (t0 + 0.045, t1 - 0.045):
            p.prisma((x - 0.045, -0.045, hm), (x + 0.045, 0.045, hm + alto * 0.95), mat, base)  # postes
    if c:
        m = giro_hoja(a + u * c[1], -u, c[2], Vector(op.get("dentro", (0, 0))), z + 0.06)
        tablas(p, m, c[1] - c[0] - 0.04, hm + alto - 0.1, mat)
    return p.objeto(op["nombre"], defs, op["nombre"])


def planta(op, defs):
    p = Pieza(); x, y, z = op["en"]; h = op["alto"]; r = op.get("ancho", h * 0.25) / 2; mat = op["material"]; n = 9
    if op["tipo"] == "cipres":
        anillos = [(0.0, 0.25), (0.08, 0.85), (0.3, 1.0), (0.65, 0.7), (1.0, 0.03)]
    else:
        anillos = [(0.0, 0.5), (0.2, 0.95), (0.55, 1.0), (0.85, 0.65), (1.0, 0.1)]
    vs = [(x + math.cos(2 * math.pi * (k + 0.37 * i) / n) * r * f, y + math.sin(2 * math.pi * (k + 0.37 * i) / n) * r * f, z + h * t)
          for i, (t, f) in enumerate(anillos) for k in range(n)]
    cs = [(i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k) for i in range(len(anillos) - 1) for k in range(n)]
    cs.append(tuple(range((len(anillos) - 1) * n, len(anillos) * n)))
    p.caras(vs, cs, mat)
    return p.objeto(op["nombre"], defs, op["nombre"])


def principal():
    a = argumentos(); obra = json.load(open(a["obra"], encoding="utf-8")); defs = obra.get("materiales", {})
    hecho = []; tocados = set(); nuevos = []
    for op in obra["operaciones"]:
        t = op["op"]
        if t == "aparta":
            r = aparta(op); tocados.add(op["objeto"])
        elif t == "abre":
            r = abre(op); tocados.add(op["objeto"])
        elif t == "caja":
            p = Pieza(); p.prisma(op["min"], op["max"], op["material"]); o = p.objeto(op["nombre"], defs, op["nombre"]); r = {}
        elif t == "porton":
            o = porton(op, defs); r = {}
        elif t == "verja":
            o = verja(op, defs); r = {}
        elif t == "planta":
            o = planta(op, defs); r = {}
        else:
            raise SystemExit("operación desconocida: " + t)
        if t not in ("aparta", "abre"):
            if op.get("grupo"):
                o["gemelo_grupo"] = op["grupo"]
            nuevos.append(o); r["triangulos"] = sum(len(f.vertices) - 2 for f in o.data.polygons)
        hecho.append({"op": t, "que": op.get("nombre", op.get("objeto")), **r}); print("OBRA", json.dumps(hecho[-1], ensure_ascii=False))
    # las piezas de un mismo grupo se unen en un solo objeto (una llamada de dibujo y un mapa de luz por grupo)
    grupos = {}
    for o in nuevos:
        grupos.setdefault(o.get("gemelo_grupo", o.name), []).append(o)
    finales = []
    for g, objs in grupos.items():
        if len(objs) > 1:
            bpy.ops.object.select_all(action="DESELECT")
            for o in objs:
                o.select_set(True)
            bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join()
        objs[0].name = g; objs[0].data.name = g; objs[0]["gemelo_obra"] = g; finales.append(g)
    destino = os.path.abspath(a["guarda"]) if a["guarda"] else bpy.data.filepath
    bpy.ops.wm.save_as_mainfile(filepath=destino, compress=True)
    informe = {"blend": os.path.basename(destino), "operaciones": hecho, "objetos_nuevos": finales, "objetos_tocados": sorted(tocados),
               "triangulos_nuevos": sum(sum(len(f.vertices) - 2 for f in bpy.data.objects[n].data.polygons) for n in finales),
               "para_prepara": ",".join(sorted(tocados) + finales)}
    json.dump(informe, open(os.path.splitext(destino)[0] + ".obra.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("OBRA_TOTAL", json.dumps({k: informe[k] for k in ("objetos_nuevos", "objetos_tocados", "triangulos_nuevos", "para_prepara")}, ensure_ascii=False))


principal()
