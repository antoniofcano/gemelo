# Obra ILUSTRATIVA sobre un mundo interior ya separado (separa.py): corrige huecos y añade piezas que una persona ha
# confirmado del sitio real (portones, verjas, tapias, un fondo tras una verja). Todo lo que crea va a la colección
# ILUSTRATIVO con gemelo_procedencia = «ilustrativo» y gemelo_obra = su nombre; lo que quita no se borra: va a DESCARTES.
# No toca nada MEDIDO: si una operación nombra un objeto de procedencia «medido», se niega.
#   blender --background <mundo_base.blend> --python obra.py -- <obra.json> [--guarda <mundo.blend>]
# Se ejecuta siempre sobre el .blend de partida (las operaciones «abre» y «aparta» no se pueden repetir encima).
# obra.json (privado: lleva las cotas del sitio, no entra en el repo). Coordenadas de Blender, en metros, Z arriba:
#   {"materiales": {"anil": {"color": [r, g, b], "rugosidad": 0.5, "metal": 0.0},
#                   "hojas": {"textura": "texturas/hojas.png", "alfa": true, "translucido": 0.5},    (de texturas.py; rutas
#                   "chapa": {"textura": "texturas/chapa.png", "textura_rugosidad": "texturas/chapa_rug.png"}},  relativas al json)
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
#     {"op": "arbol", "nombre": "…", "tipo": "copa|naranjo|cipres|adelfa", "en": [x, y, z], "alto": h, "ancho": a,
#      "hojas": "…", "pintado": "…", "tarjetas": n, "frutos": n, "semilla": 1}
#                                                                               vegetación barata: tronco, un relleno
#                                                                               opaco y tarjetas con alfa (atlas 2×2 de
#                                                                               texturas.py: hoja ancha, ciprés, adelfa, flor)
#     {"op": "maceta", "nombre": "…", "en": [x, y, z], "alto": 0.4, "ancho": 0.4, "material": "…", "hojas": "…",
#      "planta": 0.5, "flores": n, "semilla": 1}                               tiesto de barro con su mata
#     {"op": "arriate", "nombre": "…", "en": [x, y, z], "lado": 1.2, "material": "…"}   alcorque de ladrillo con tierra
#    En «en», z = null posa la pieza en el suelo que haya debajo. Un material sin textura multiplica su color por el
#    color de vértice: con un solo material blanco («pintado») y "color": [r, g, b] en cada pieza, todo va en una llamada.
#    ]}
# Una operación con "grupo": "g" se une con las demás del mismo grupo en un solo objeto (una llamada por material).
# Después hay que pasar prepara.py --objetos <los tocados y los nuevos> (los escribe en <mundo>.obra.json) para el UV «luz».
import bpy, bmesh, sys, json, math, os, random
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


CARPETA = "."


def material(nombre, defs):
    m = bpy.data.materials.get(nombre)
    if m is not None:
        return m
    if nombre not in defs:
        raise SystemExit("material desconocido y sin definir en la obra: " + nombre)
    d = defs[nombre]; color = d.get("color", (1, 1, 1))
    m = bpy.data.materials.new(nombre); m.use_nodes = True; nt = m.node_tree
    b = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = d.get("rugosidad", 0.7)
    b.inputs["Metallic"].default_value = d.get("metal", 0.0)
    if not d.get("textura"):
        # color = color del material × color de vértice «Color»: un solo material «pintado» blanco sirve para muchas piezas
        v = nt.nodes.new("ShaderNodeVertexColor"); v.layer_name = "Color"; c = nt.nodes.new("ShaderNodeRGB"); c.outputs[0].default_value = (*color, 1)
        mez = nt.nodes.new("ShaderNodeMix"); mez.data_type = "RGBA"; mez.blend_type = "MULTIPLY"; mez.inputs[0].default_value = 1.0
        nt.links.new(c.outputs[0], mez.inputs[6]); nt.links.new(v.outputs["Color"], mez.inputs[7]); nt.links.new(mez.outputs[2], b.inputs["Base Color"])
    else:
        # color = textura × color de vértice «Color» (como los materiales del glb); el alfa, recortado
        img = bpy.data.images.load(os.path.join(CARPETA, d["textura"]), check_existing=True)
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
        v = nt.nodes.new("ShaderNodeVertexColor"); v.layer_name = "Color"
        mez = nt.nodes.new("ShaderNodeMix"); mez.data_type = "RGBA"; mez.blend_type = "MULTIPLY"; mez.inputs[0].default_value = 1.0
        nt.links.new(t.outputs["Color"], mez.inputs[6]); nt.links.new(v.outputs["Color"], mez.inputs[7]); nt.links.new(mez.outputs[2], b.inputs["Base Color"])
        if d.get("alfa"):
            corte = nt.nodes.new("ShaderNodeMath"); corte.operation = "GREATER_THAN"; corte.inputs[1].default_value = 0.5
            nt.links.new(t.outputs["Alpha"], corte.inputs[0]); nt.links.new(corte.outputs[0], b.inputs["Alpha"])
            m["gemelo_alfa"] = "recorte 0.5"
        if d.get("translucido"):
            # la hoja deja pasar la luz: a contraluz se enciende en vez de apagarse, y el mapa de luz horneado lo recoge
            # (en el glTF el material sigue siendo el Principled con su alfa; la translucidez viaja en el mapa de luz)
            sal = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial")
            tl = nt.nodes.new("ShaderNodeBsdfTranslucent"); nt.links.new(mez.outputs[2], tl.inputs["Color"])
            mezcla = nt.nodes.new("ShaderNodeMixShader"); mezcla.name = "gemelo_translucido"; mezcla.inputs[0].default_value = float(d["translucido"])
            if d.get("alfa"):
                tr = nt.nodes.new("ShaderNodeBsdfTransparent"); rec = nt.nodes.new("ShaderNodeMixShader")
                nt.links.new(corte.outputs[0], rec.inputs[0]); nt.links.new(tr.outputs[0], rec.inputs[1]); nt.links.new(tl.outputs[0], rec.inputs[2])
                nt.links.new(rec.outputs[0], mezcla.inputs[2])
            else:
                nt.links.new(tl.outputs[0], mezcla.inputs[2])
            nt.links.new(b.outputs[0], mezcla.inputs[1]); nt.links.new(mezcla.outputs[0], sal.inputs["Surface"])
            m["gemelo_translucido"] = float(d["translucido"])
    if d.get("textura_rugosidad"):
        img = bpy.data.images.load(os.path.join(CARPETA, d["textura_rugosidad"]), check_existing=True); img.colorspace_settings.name = "Non-Color"
        t = nt.nodes.new("ShaderNodeTexImage"); t.image = img; nt.links.new(t.outputs["Color"], b.inputs["Roughness"])
    m.diffuse_color = (*color, 1); m["gemelo_procedencia"] = "ilustrativo"
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
        self.bm = bmesh.new(); self.uv = self.bm.loops.layers.uv.new("UVMap"); self.col = self.bm.loops.layers.color.new("Color"); self.mats = []

    def indice(self, mat):
        if mat not in self.mats:
            self.mats.append(mat)
        return self.mats.index(mat)

    def caras(self, verts, caras, mat, m=None, uvs=None, color=(1, 1, 1)):
        """uvs: una uv por vértice (si no, proyección de caja en metros); color: tinte de vértice de toda la tanda"""
        m = m or Matrix.Identity(4); i = self.indice(mat)
        vs = [self.bm.verts.new(m @ Vector(v)) for v in verts]
        for c in caras:
            f = self.bm.faces.new([vs[k] for k in c]); f.material_index = i
            n = (vs[c[1]].co - vs[c[0]].co).cross(vs[c[2]].co - vs[c[0]].co)
            eje = max(range(3), key=lambda k: abs(n[k])); a, b = [k for k in range(3) if k != eje]
            for l, k in zip(f.loops, c):
                l[self.uv].uv = uvs[k] if uvs else (l.vert.co[a] * UV_M, l.vert.co[b] * UV_M)
                l[self.col] = (*color, 1)

    def prisma(self, mn, mx, mat, m=None, color=(1, 1, 1), uv_local=None):
        """uv_local = (ancho, alto): la uv es (x / ancho, z / alto) en las coordenadas sin transformar (una textura por hoja)"""
        x0, y0, z0 = mn; x1, y1, z1 = mx
        v = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        uvs = [(q[0] / uv_local[0], q[2] / uv_local[1]) for q in v] if uv_local else None
        self.caras(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat, m, uvs=uvs, color=color)

    def objeto(self, nombre, defs, obra):
        me = bpy.data.meshes.new(nombre); self.bm.normal_update(); self.bm.to_mesh(me); self.bm.free()
        for n in self.mats:
            me.materials.append(material(n, defs))
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
        uvl = (ancho, h)
        p.prisma((0, -0.008, 0), (ancho, 0.008, h), mat, m, uv_local=uvl)  # la chapa
        for x0, x1, z0, z1 in ((0, ancho, 0, 0.07), (0, ancho, h - 0.07, h), (0, 0.07, 0, h), (ancho - 0.07, ancho, 0, h),
                               (0, ancho, h * 0.36, h * 0.36 + 0.06), (0, ancho, h * 0.68, h * 0.68 + 0.06)):
            p.prisma((x0, -0.03, z0), (x1, 0.03, z1), mat, m, uv_local=uvl)  # bastidor y travesaños
        n = max(2, round(ancho / 0.28))
        for k in range(1, n):
            x = ancho * k / n
            p.prisma((x - 0.012, -0.02, 0.07), (x + 0.012, 0.02, h - 0.07), mat, m, uv_local=uvl)  # nervios de la chapa
    return p.objeto(op["nombre"], defs, op["nombre"])


def tablas(p, m, largo, alto, mat, paso=0.17, ancho=0.09, z0=0.0, color=(1, 1, 1)):
    """Tablas verticales con la punta redondeada (un pentágono extruido) y dos largueros, en el marco m"""
    n = max(1, int(largo / paso))
    x0 = (largo - (n - 1) * paso) / 2
    for k in range(n):
        x = x0 + k * paso; a = ancho / 2; h = alto
        v = [(x - a, -0.01, z0), (x + a, -0.01, z0), (x + a, -0.01, z0 + h - a), (x, -0.01, z0 + h), (x - a, -0.01, z0 + h - a)]
        v += [(q[0], 0.01, q[2]) for q in v]
        p.caras(v, [(0, 1, 2, 3, 4), (9, 8, 7, 6, 5), (0, 5, 6, 1), (1, 6, 7, 2), (2, 7, 8, 3), (3, 8, 9, 4), (4, 9, 5, 0)], mat, m, color=color)
    for z in (z0 + alto * 0.3, z0 + alto * 0.72):
        p.prisma((0, 0.01, z), (largo, 0.035, z + 0.07), mat, m, color=color)


def verja(op, defs):
    a, b = Vector(op["de"]), Vector(op["a"]); u = (b - a).normalized(); largo = (b - a).length
    z = op["z"]; alto = op.get("alto", 1.0); hm = op.get("murete", 0.35); mat = op["material"]
    base = Matrix.Translation((a.x, a.y, z)) @ Matrix.Rotation(math.atan2(u.y, u.x), 4, "Z")
    c = op.get("cancela"); p = Pieza(); col = tuple(op.get("color", (1, 1, 1))); colm = tuple(op.get("color_murete", (1, 1, 1)))
    tramos = [(0, largo)] if not c else [t for t in ((0, c[0]), (c[1], largo)) if t[1] - t[0] > 0.05]
    for t0, t1 in tramos:
        if hm > 0:
            p.prisma((t0, -0.12, 0), (t1, 0.12, hm), op.get("material_murete", mat), base, color=colm)
        tablas(p, base @ Matrix.Translation((t0, 0, hm)), t1 - t0, alto, mat, color=col)
        for x in (t0 + 0.045, t1 - 0.045):
            p.prisma((x - 0.045, -0.045, hm), (x + 0.045, 0.045, hm + alto * 0.95), mat, base, color=col)  # postes
    if c:
        m = giro_hoja(a + u * c[1], -u, c[2], Vector(op.get("dentro", (0, 0))), z + 0.06)
        tablas(p, m, c[1] - c[0] - 0.04, hm + alto - 0.1, mat, color=col)
    return p.objeto(op["nombre"], defs, op["nombre"])


def anillos(p, centro, perfil, n, mat, color=(1, 1, 1), giro=0.37):
    """Sólido de revolución barato: perfil = [(altura, radio)…] desde `centro`; cierra por arriba"""
    x, y, z = centro
    vs = [(x + math.cos(2 * math.pi * (k + giro * i) / n) * r, y + math.sin(2 * math.pi * (k + giro * i) / n) * r, z + h)
          for i, (h, r) in enumerate(perfil) for k in range(n)]
    cs = [(i * n + k, i * n + (k + 1) % n, (i + 1) * n + (k + 1) % n, (i + 1) * n + k) for i in range(len(perfil) - 1) for k in range(n)]
    cs.append(tuple(range((len(perfil) - 1) * n, len(perfil) * n)))
    p.caras(vs, cs, mat, color=color)


def tarjeta(p, c, normal, lado, celda, mat, rnd, color, alto=None):
    """Un cuadrado con alfa mirando hacia `normal`, con la uv de su celda del atlas 2×2 (a veces en espejo)"""
    n = normal.normalized(); arriba = Vector((0, 0, 1))
    u = n.cross(arriba); u = u.normalized() if u.length > 1e-3 else Vector((1, 0, 0))
    v = u.cross(n).normalized(); a, b = lado / 2, (alto or lado) / 2
    i, j = celda; e = 0.004; u0, u1 = i / 2 + e, (i + 1) / 2 - e
    if rnd.random() < 0.5:
        u0, u1 = u1, u0
    p.caras([c - u * a - v * b, c + u * a - v * b, c + u * a + v * b, c - u * a + v * b], [(0, 1, 2, 3)], mat,
            uvs=[(u0, j / 2 + e), (u1, j / 2 + e), (u1, (j + 1) / 2 - e), (u0, (j + 1) / 2 - e)], color=color)


FORMAS = {  # tronco (fracción del alto), celda del atlas, tamaño de tarjeta (fracción del ancho)
    "copa": (0.42, (0, 0), 0.22), "naranjo": (0.38, (0, 0), 0.30), "cipres": (0.06, (1, 0), 0.75), "adelfa": (0.05, (0, 1), 0.34)}


def arbol(op, defs):
    """Tronco, relleno opaco oscuro (para que no se vea a través) y tarjetas con alfa repartidas por la copa.
    El tinte de vértice oscurece lo de dentro y lo de abajo: es la poca sombra propia que tendrá sin horneado."""
    p = Pieza(); rnd = random.Random(op.get("semilla", 1)); tipo = op["tipo"]; ft, celda, fs = FORMAS[tipo]
    x, y, z = op["en"]; h = op["alto"]; w = op.get("ancho", h * 0.3); r = w / 2
    hojas = op["hojas"]; tronco = relleno = op["pintado"]; n = int(op.get("tarjetas", 120))
    c_tronco = tuple(op.get("color_tronco", (0.20, 0.155, 0.11))); c_relleno = tuple(op.get("color_relleno", (0.05, 0.10, 0.035)))
    ht = h * ft; hc = h - ht; cz = z + ht + hc / 2  # copa: elipsoide de semiejes (r, r, hc/2) centrado en cz
    if tipo in ("copa", "naranjo"):
        rt = max(0.05, w * 0.045)
        anillos(p, (x, y, z), [(0, rt * 1.5), (ht * 0.5, rt), (ht + hc * 0.35, rt * 0.7)], 6, tronco, color=c_tronco)
        e = 0.62 if tipo == "copa" else 1.0  # la copa de lóbulos es más hueca: el relleno, más pequeño, no debe asomar
        anillos(p, (x, y, cz - hc * 0.3 * e), [(0, r * 0.35 * e), (hc * 0.25 * e, r * 0.72 * e), (hc * 0.5 * e, r * 0.6 * e), (hc * 0.66 * e, r * 0.2 * e)], 7, relleno, color=c_relleno)
    elif tipo == "cipres":
        anillos(p, (x, y, z), [(0, 0.09), (ht, 0.08)], 5, tronco, color=c_tronco)
        anillos(p, (x, y, z + ht), [(0, r * 0.45), (hc * 0.12, r * 0.8), (hc * 0.4, r * 0.72), (hc * 0.75, r * 0.42), (hc * 0.97, r * 0.05)], 7, relleno, color=c_relleno)
    else:
        anillos(p, (x, y, z), [(0, r * 0.25), (h * 0.35, r * 0.6), (h * 0.6, r * 0.45)], 6, relleno, color=c_relleno)
    lobulos = [(0.0, 0.0, hc * 0.12, r * 0.62)] + [(math.cos(q) * r * 0.5, math.sin(q) * r * 0.5, rnd.uniform(-0.16, 0.06) * hc, r * rnd.uniform(0.42, 0.55))
                                               for q in (rnd.uniform(0, 6.28) + 2.1 * i for i in range(3))]
    for k in range(n):
        if tipo == "cipres":
            t = rnd.random() ** 0.85; ang = rnd.uniform(0, 2 * math.pi)
            rr = r * (0.55 + 0.5 * math.sin(min(1.0, t * 1.9 + 0.12) * math.pi / 2)) * (1 - t) ** 0.55 + 0.03
            c = Vector((x + math.cos(ang) * rr, y + math.sin(ang) * rr, z + ht + hc * t))
            nor = Vector((math.cos(ang), math.sin(ang), 0.25)); lado = w * fs * rnd.uniform(0.8, 1.2) * (1 - 0.45 * t)
            tinte = 0.62 + 0.38 * t + rnd.uniform(-0.08, 0.08)
            tarjeta(p, c, nor, lado, celda, hojas, rnd, (tinte * 0.9, tinte, tinte * 0.9), alto=lado * 1.9)
        else:
            d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 1) * (0.8 if tipo != "adelfa" else 0.5) + (0.25 if tipo != "adelfa" else 0.5))).normalized()
            f = rnd.uniform(0.72, 1.0)
            if tipo == "adelfa":
                c = Vector((x + d.x * r * f, y + d.y * r * f, z + h * 0.12 + abs(d.z) * h * 0.82 * f))
            elif tipo == "copa":
                # copa de varios lóbulos (no una bola): cada tarjeta va a la piel de uno de ellos
                lx, ly, lz, lr = lobulos[k % len(lobulos)]
                c = Vector((x + lx + d.x * lr * f, y + ly + d.y * lr * f, cz + lz + d.z * lr * 0.62 * f))
            else:
                c = Vector((x + d.x * r * f, y + d.y * r * f, cz + d.z * hc / 2 * f))
            nor = d + Vector((rnd.uniform(-0.5, 0.5), rnd.uniform(-0.5, 0.5), rnd.uniform(-0.2, 0.5)))
            tinte = 0.68 + 0.32 * (0.5 + 0.5 * d.z) * f + rnd.uniform(-0.07, 0.07)
            flor = tipo == "adelfa" and rnd.random() < op.get("flor", 0.22) and d.z > -0.1
            tarjeta(p, c, nor, w * fs * rnd.uniform(0.75, 1.25) * (0.6 if flor else 1), (1, 1) if flor else celda, hojas, rnd,
                    (1, 1, 1) if flor else (tinte, tinte, tinte * 0.92))
    for k in range(int(op.get("frutos", 0))):
        d = Vector((rnd.gauss(0, 1), rnd.gauss(0, 1), rnd.gauss(0, 0.6) - 0.2)).normalized()
        c = Vector((x + d.x * r * 0.97, y + d.y * r * 0.97, cz + d.z * hc / 2 * 0.95)); q = 0.045
        vs = [c + Vector(v) * q for v in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1))]
        p.caras(vs, [(0, 2, 4), (2, 1, 4), (1, 3, 4), (3, 0, 4), (2, 0, 5), (1, 2, 5), (3, 1, 5), (0, 3, 5)], tronco, color=tuple(op.get("color_fruto", (1.0, 0.33, 0.02))))
    return p.objeto(op["nombre"], defs, op["nombre"])


def arriate(op, defs):
    """Alcorque cuadrado de ladrillo: cuatro bordillos y la tierra dentro, un poco más baja"""
    p = Pieza(); x, y, z = op["en"]; a = op.get("lado", 1.2) / 2; h = op.get("alto", 0.14); g = op.get("grueso", 0.12); mat = op["material"]
    col = tuple(op.get("color", (0.50, 0.13, 0.055))); tierra = tuple(op.get("color_tierra", (0.10, 0.07, 0.045)))
    for x0, y0, x1, y1 in ((-a, -a, a, -a + g), (-a, a - g, a, a), (-a, -a + g, -a + g, a - g), (a - g, -a + g, a, a - g)):
        p.prisma((x + x0, y + y0, z), (x + x1, y + y1, z + h), mat, color=col)
    p.prisma((x - a + g, y - a + g, z), (x + a - g, y + a - g, z + h * 0.6), mat, color=tierra)
    return p.objeto(op["nombre"], defs, op["nombre"])


def maceta(op, defs):
    """Tiesto de barro (tronco de cono con labio) y su mata de tarjetas; con «flores», algunas son flor"""
    p = Pieza(); rnd = random.Random(op.get("semilla", 1)); x, y, z = op["en"]; h = op.get("alto", 0.4); r = op.get("ancho", 0.4) / 2
    anillos(p, (x, y, z), [(0, r * 0.68), (h * 0.86, r * 0.96), (h * 0.86, r * 1.08), (h, r * 1.08), (h, r * 0.9), (h * 0.9, r * 0.85)], 9, op["material"], giro=0.0, color=tuple(op.get("color", (0.55, 0.20, 0.09))))
    hp = op.get("planta", 0.5)
    if hp > 0 and op.get("hojas"):
        n = int(op.get("tarjetas", 9)); nf = int(op.get("flores", 0))
        for k in range(n):
            ang = rnd.uniform(0, 2 * math.pi); t = rnd.uniform(0.25, 1.0); rr = r * rnd.uniform(0.2, 1.25)
            c = Vector((x + math.cos(ang) * rr, y + math.sin(ang) * rr, z + h + hp * t * 0.75))
            nor = Vector((math.cos(ang), math.sin(ang), rnd.uniform(0.0, 0.8))); tinte = rnd.uniform(0.7, 1.0)
            flor = k < nf
            tarjeta(p, c, nor, hp * rnd.uniform(0.7, 1.0) * (0.45 if flor else 1), (1, 1) if flor else tuple(op.get("celda", (0, 1))), op["hojas"], rnd,
                    tuple(op.get("color_flor", (1, 1, 1))) if flor else (tinte, tinte, tinte * 0.9))
    return p.objeto(op["nombre"], defs, op["nombre"])


def principal():
    global CARPETA
    a = argumentos(); obra = json.load(open(a["obra"], encoding="utf-8")); defs = obra.get("materiales", {})
    CARPETA = os.path.dirname(os.path.abspath(a["obra"]))
    hecho = []; tocados = set(); nuevos = []
    dg = bpy.context.evaluated_depsgraph_get()
    for op in obra["operaciones"]:
        t = op["op"]
        if "en" in op and op["en"][2] is None:
            # sin cota: se posa en lo primero que haya bajo el punto, mirando desde 2 m (por debajo de los tejados)
            ok, loc, *_ = bpy.context.scene.ray_cast(dg, Vector((op["en"][0], op["en"][1], op.get("desde_z", 2.0))), Vector((0, 0, -1)), distance=8)
            if not ok:
                raise SystemExit("no hay suelo bajo " + op.get("nombre", "?"))
            op["en"] = [op["en"][0], op["en"][1], loc.z]
        if t == "aparta":
            r = aparta(op); tocados.add(op["objeto"])
        elif t == "abre":
            r = abre(op); tocados.add(op["objeto"])
        elif t == "caja":
            p = Pieza(); p.prisma(op["min"], op["max"], op["material"], color=tuple(op.get("color", (1, 1, 1)))); o = p.objeto(op["nombre"], defs, op["nombre"]); r = {}
        elif t == "arriate":
            o = arriate(op, defs); r = {}
        elif t == "porton":
            o = porton(op, defs); r = {}
        elif t == "verja":
            o = verja(op, defs); r = {}
        elif t == "arbol":
            o = arbol(op, defs); r = {}
        elif t == "maceta":
            o = maceta(op, defs); r = {}
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
               "llamadas_nuevas": sum(len({f.material_index for f in bpy.data.objects[n].data.polygons}) for n in finales),
               "por_objeto": {n: {"triangulos": sum(len(f.vertices) - 2 for f in bpy.data.objects[n].data.polygons),
                                  "llamadas": len({f.material_index for f in bpy.data.objects[n].data.polygons})} for n in finales},
               "para_prepara": ",".join(sorted(tocados) + finales)}
    json.dump(informe, open(os.path.splitext(destino)[0] + ".obra.json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("OBRA_TOTAL", json.dumps({k: informe[k] for k in ("objetos_nuevos", "objetos_tocados", "triangulos_nuevos", "llamadas_nuevas", "para_prepara")}, ensure_ascii=False))


principal()
