# Inventario de una malla que lo junta todo (la maquinaria reconstruida de la fábrica, «maquinaria_rec», es UNA malla):
# la parte en trozos sueltos, los agrupa en piezas (piezas.py) y escribe por pieza sus triángulos, su caja en el marco del
# mundo interior y sus materiales; con láminas, además, renders rápidos (Workbench, sin luz ni horneado) con cada pieza
# coloreada y su número. Prepara la «fábrica 1.1» (piezas con eje y animadas): no cambia el mundo publicado.
#   blender --background <copia.blend> --python inventario.py -- <carpeta> --plantilla <mundo.plantilla.json>
#           [--objeto maquinaria_rec] [--soldadura 0.0005] [--toque 0.01] [--pequeno 0.25] [--grande 1.0]
#           [--px 1600x1000] [--sin-laminas] [--guarda <inventario.blend>]
# SIEMPRE sobre una copia del .blend: el guion no guarda nada salvo con --guarda, y se niega a guardar encima del abierto.
# --plantilla: la plantilla privada del manifiesto (exporta.py) de la que solo se lee «origen» (el umbral de la puerta
# principal, en coordenadas de Blender). Escribe en <carpeta>:
#   trozos.json      cada trozo suelto (tras soldar las costuras de UV a --soldadura m): caras, triángulos, caja de Blender,
#                    materiales y con qué otros trozos se toca (a menos de --toque m o cortándose, medido con un BVH, no por cajas);
#   inventario.json  las piezas (forma y criterio en piezas.py), en el marco del mundo: (x, y, z) = (x − ox, z − oz, −(y − oy));
#   laminas/         vista_planta (con la rejilla de metros del mundo), vista_sureste, vista_noroeste y vista_sur, con los
#                    conjuntos coloreados y numerados, y conjunto_CNN.png por cada conjunto con diagonal ≥ --grande m (sus
#                    piezas en color y numeradas, delante; lo demás en gris);
#   inventario.medida.json  tiempos por fase.
# Con --guarda, la copia queda con una pieza por objeto («pieza_NNN», con sus materiales de origen) para la 1.1.
import bpy, sys, json, math, os, time, colorsys
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recuento import trozos as trozos_sueltos  # noqa: E402 (los módulos viven junto a este guion)
import piezas  # noqa: E402

GRIS = (0.78, 0.78, 0.76, 1.0)


def pico_memoria_mb():
    """Pico de memoria del propio proceso (Windows: PeakWorkingSetSize; si no, ru_maxrss), o None"""
    try:
        import ctypes
        from ctypes import wintypes
        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD)] + [(n, ctypes.c_size_t) for n in (
                "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage",
                "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
        c = PMC(); c.cb = ctypes.sizeof(PMC); k = ctypes.windll.kernel32
        k.GetCurrentProcess.restype = wintypes.HANDLE
        f = k.K32GetProcessMemoryInfo; f.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        return round(c.PeakWorkingSetSize / 2 ** 20) if f(k.GetCurrentProcess(), ctypes.byref(c), c.cb) else None
    except Exception:
        try:
            import resource
            return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024)
        except Exception:
            return None


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"carpeta": a[0], "plantilla": None, "objeto": "maquinaria_rec", "soldadura": 0.0005, "toque": 0.01, "pequeno": 0.25,
         "grande": 1.0, "px": "1600x1000", "sin-laminas": False, "guarda": None}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-")
        if k == "sin-laminas":
            o[k] = True; i += 1; continue
        v = a[i + 1]; i += 2
        o[k] = v if k in ("plantilla", "objeto", "px", "guarda") else float(v)
    if not o["plantilla"]:
        raise SystemExit("falta --plantilla <mundo.plantilla.json> (de ella sale el origen del mundo)")
    return o


def estadisticas(o, grupos):
    """Por trozo: caras, triángulos, caja (coordenadas de Blender) y materiales, con numpy sobre la malla original"""
    me = o.data; nf = len(me.polygons)
    co = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
    m = np.array(o.matrix_world); co = co @ m[:3, :3].T + m[:3, 3]
    lt = np.empty(nf, np.int32); me.polygons.foreach_get("loop_total", lt)
    mi = np.empty(nf, np.int32); me.polygons.foreach_get("material_index", mi)
    vi = np.empty(len(me.loops), np.int32); me.loops.foreach_get("vertex_index", vi)
    et = np.full(nf, -1, np.int64)
    for k, caras in enumerate(grupos):
        et[caras] = k
    sueltas = np.nonzero(et < 0)[0].tolist()   # caras que la soldadura dejó degeneradas: cada una, un trozo (no se pierden)
    for f in sueltas:
        et[f] = len(grupos); grupos.append([f])
    por_lazo = np.repeat(et, lt); orden = np.argsort(por_lazo, kind="stable")
    pts = co[vi[orden]]; cortes = np.searchsorted(por_lazo[orden], np.arange(len(grupos)))
    mn = np.minimum.reduceat(pts, cortes); mx = np.maximum.reduceat(pts, cortes)
    tri = np.bincount(et, weights=lt - 2, minlength=len(grupos)).astype(int)
    caras = np.bincount(et, minlength=len(grupos))
    nombres = [s.material.name if s.material else "(sin material)" for s in o.material_slots]
    mats = [set() for _ in grupos]
    for k, j in set(zip(et.tolist(), mi.tolist())):
        mats[k].add(nombres[j] if j < len(nombres) else "(sin material)")
    salida = []
    for k in range(len(grupos)):
        salida.append({"id": k, "caras": int(caras[k]), "triangulos": int(tri[k]), "min": [round(float(v), 4) for v in mn[k]],
                       "max": [round(float(v), 4) for v in mx[k]], "materiales": sorted(mats[k]), "toca": []})
    return salida, co, vi, lt, et


def contactos(ts, co, vi, lt, et, toque):
    """Rellena «toca»: dos trozos se tocan si algún vértice del menor (hasta 400, repartidos) está a menos de `toque`
    de la superficie del mayor, o si sus superficies se cortan (un eje que atraviesa una pala por el centro no tiene
    vértices cerca de ella). Solo se mira entre trozos cuyas cajas, ensanchadas `toque`, se cortan."""
    mn = np.array([t["min"] for t in ts]) - toque; mx = np.array([t["max"] for t in ts]) + toque
    inicio = np.concatenate([[0], np.cumsum(lt)[:-1]])
    caras_de = {}
    for f, k in enumerate(et.tolist()):
        caras_de.setdefault(k, []).append(f)
    bvh = {}
    def arbol(k):
        if k not in bvh:
            fs = caras_de[k]; vs = sorted({int(v) for f in fs for v in vi[inicio[f]:inicio[f] + lt[f]]}); idx = {v: i for i, v in enumerate(vs)}
            bvh[k] = (BVHTree.FromPolygons([tuple(co[v]) for v in vs], [[idx[int(v)] for v in vi[inicio[f]:inicio[f] + lt[f]]] for f in fs]), vs)
        return bvh[k]
    diag = np.linalg.norm(mx - mn, axis=1); pares = 0
    for a in range(len(ts)):
        cand = np.nonzero(np.all(mn[a] <= mx, axis=1) & np.all(mx[a] >= mn, axis=1))[0]
        for b in cand[cand > a].tolist():
            pares += 1
            menor, mayor = (a, b) if diag[a] <= diag[b] else (b, a)
            arb, _ = arbol(mayor); vs = arbol(menor)[1]
            paso = max(1, len(vs) // 400)
            if any(arb.find_nearest(Vector(co[v].tolist()), toque)[0] is not None for v in vs[::paso]) or arb.overlap(arbol(menor)[0]):
                ts[a]["toca"].append(b); ts[b]["toca"].append(a)
    return pares


def separa_piezas(o, inv, et):
    """Una pieza por objeto «pieza_NNN» con sus materiales de origen: cada pieza toma un material provisional, se separa por
    material (una sola operación) y luego cada cara recupera el suyo (guardado en el atributo «gemelo_mat»)"""
    me = o.data; nf = len(me.polygons); k = len(me.materials)
    de_trozo = {t: p["n"] for p in inv["piezas"] for t in p["ids_trozo"]}
    pieza_cara = np.array([de_trozo[int(t)] for t in et.tolist()], np.int32)
    mi = np.empty(nf, np.int32); me.polygons.foreach_get("material_index", mi)
    me.attributes.new("gemelo_mat", "INT", "FACE").data.foreach_set("value", mi)
    me.attributes.new("gemelo_pieza", "INT", "FACE").data.foreach_set("value", pieza_cara)
    provisionales = []
    for p in inv["piezas"]:
        m = bpy.data.materials.new("_pieza_%03d" % p["n"]); me.materials.append(m); provisionales.append(m)
    me.polygons.foreach_set("material_index", (k + pieza_cara - 1).astype(np.int32)); me.update()
    bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = o; o.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL"); bpy.ops.object.mode_set(mode="OBJECT")
    objetos = {}
    for ob in list(bpy.context.selected_objects):
        m = ob.data; n = len(m.polygons)
        if n == 0:
            continue
        v = np.empty(n, np.int32); m.attributes["gemelo_pieza"].data.foreach_get("value", v); pn = int(v[0])
        m.attributes["gemelo_mat"].data.foreach_get("value", v); m.polygons.foreach_set("material_index", v)
        while len(m.materials) > k:
            m.materials.pop(index=len(m.materials) - 1)
        m.attributes.remove(m.attributes["gemelo_mat"]); m.update()
        ob.name = m.name = "pieza_%03d" % pn; objetos[pn] = ob
        ob["gemelo_procedencia"] = "ilustrativo"; ob["gemelo_pieza"] = "p%03d" % pn
        ob["gemelo_nota"] = "pieza del inventario de la maquinaria (inventario.py); identificación aparte"
    for m in provisionales:
        bpy.data.materials.remove(m)
    faltan = [p["n"] for p in inv["piezas"] if p["n"] not in objetos]
    if faltan:
        raise SystemExit("piezas sin objeto tras separar: %s" % faltan[:10])
    return objetos


def color(n):
    h = (n * 0.618034) % 1.0; s = 0.55 + 0.35 * ((n * 7) % 3) / 2; v = 0.95 - 0.25 * ((n * 5) % 2)
    return (*colorsys.hsv_to_rgb(h, s, v), 1.0)


def rotulo(cuerpo, pos, tam, rot, coleccion, delante=True):
    cu = bpy.data.curves.new("rotulo", "FONT"); cu.body = cuerpo; cu.size = tam; cu.align_x = "CENTER"; cu.align_y = "CENTER"
    t = bpy.data.objects.new("rotulo_" + cuerpo, cu); t.location = pos; t.rotation_euler = rot; t.color = (0, 0, 0, 1); t.show_in_front = delante
    coleccion.objects.link(t)
    k = 0.42 * tam * max(1, len(cuerpo)) + 0.25 * tam
    me = bpy.data.meshes.new("fondo"); me.from_pydata([(-k, -0.62 * tam, -0.002), (k, -0.62 * tam, -0.002), (k, 0.62 * tam, -0.002), (-k, 0.62 * tam, -0.002)], [], [(0, 1, 2, 3)])
    f = bpy.data.objects.new("fondo_" + cuerpo, me); f.parent = t; f.color = (1, 1, 1, 1); f.show_in_front = delante
    coleccion.objects.link(f)
    return t


def camara(esc, nombre, desde, hacia, orto=None, lente=24):
    cd = bpy.data.cameras.new(nombre); cd.clip_start = 0.05; cd.clip_end = 300
    if orto:
        cd.type = "ORTHO"; cd.ortho_scale = orto
    else:
        cd.lens = lente
    c = bpy.data.objects.new(nombre, cd); esc.collection.objects.link(c)
    c.location = desde; c.rotation_euler = (Vector(hacia) - Vector(desde)).to_track_quat("-Z", "Y").to_euler(); esc.camera = c
    return c


def render(esc, ruta):
    esc.render.filepath = ruta; t = time.time(); bpy.ops.render.render(write_still=True); return round(time.time() - t, 1)


def diag_caja(c):
    return math.dist(c["min"], c["max"])


def laminas(a, inv, objetos, carpeta):
    """Vistas generales con los CONJUNTOS coloreados y numerados (C01…), y una lámina por conjunto grande con sus PIEZAS
    coloreadas y numeradas (las de diagonal ≥ 0,3 m; las más grandes primero, hasta 60 rótulos)"""
    esc = bpy.context.scene; w, h = (int(x) for x in a["px"].split("x"))
    esc.render.engine = "BLENDER_WORKBENCH"; esc.render.resolution_x, esc.render.resolution_y, esc.render.resolution_percentage = w, h, 100
    esc.render.image_settings.file_format = "PNG"; esc.render.film_transparent = False
    s = esc.display.shading; s.light = "STUDIO"; s.color_type = "OBJECT"; s.show_cavity = True; s.cavity_type = "WORLD"
    s.show_object_outline = True; s.object_outline_color = (0, 0, 0); s.background_type = "VIEWPORT"; s.background_color = (0.97, 0.97, 0.95)
    s.show_backface_culling = False; s.show_shadows = False
    esc.display_settings.display_device = "sRGB"; esc.view_settings.view_transform = "Standard"
    propias = set(objetos.values())
    for ob in esc.objects:
        if ob.type in ("MESH", "CURVE", "FONT", "LIGHT") and ob not in propias:
            ob.hide_render = True
    mn = Vector([min(p["caja_blender"]["min"][k] for p in inv["piezas"]) for k in range(3)])
    mx = Vector([max(p["caja_blender"]["max"][k] for p in inv["piezas"]) for k in range(3)])
    ce = (mn + mx) / 2; tam = mx - mn; R = tam.length / 2
    # suelo de referencia con rejilla de metros del MUNDO (x y z del mundo.json), a la cota del origen
    ox, oy, oz = inv["origen_blender"]
    ref = bpy.data.collections.new("INVENTARIO_REF"); esc.collection.children.link(ref)
    def caja_plana(nombre, x0, y0, x1, y1, z, rgb):
        me = bpy.data.meshes.new(nombre); me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
        ob = bpy.data.objects.new(nombre, me); ob.color = rgb; ref.objects.link(ob); return ob
    caja_plana("suelo_ref", mn.x - 1, mn.y - 1, mx.x + 1, mx.y + 1, oz - 0.01, (0.9, 0.9, 0.88, 1))
    for x in range(math.floor(mn.x - 1 - ox), math.ceil(mx.x + 1 - ox) + 1):
        g = 0.03 if x % 5 == 0 else 0.01
        caja_plana("rejilla", ox + x - g, mn.y - 1, ox + x + g, mx.y + 1, oz - 0.005, (0.55, 0.6, 0.75, 1))
    for z in range(math.floor(-(mx.y + 1 - oy)), math.ceil(-(mn.y - 1 - oy)) + 1):
        g = 0.03 if z % 5 == 0 else 0.01
        caja_plana("rejilla", mn.x - 1, oy - z - g, mx.x + 1, oy - z + g, oz - 0.004, (0.55, 0.6, 0.75, 1))
    rot = bpy.data.collections.new("INVENTARIO_ROTULOS"); esc.collection.children.link(rot)
    ejes = []
    for x in range(math.ceil(mn.x - 1 - ox), int(mx.x + 1 - ox) + 1):
        ejes.append(rotulo("x=%d" % x, (ox + x, mn.y - 0.6, oz), 0.22, (0, 0, 0), rot, delante=False))
    for z in range(math.ceil(-(mx.y + 1 - oy)), int(-(mn.y - 1 - oy)) + 1):
        ejes.append(rotulo("z=%d" % z, (mn.x - 0.7, oy - z, oz), 0.22, (0, 0, 0), rot, delante=False))
    por_n = {p["n"]: p for p in inv["piezas"]}

    def pinta(conjunto=None):
        for c in inv["conjuntos"]:
            for pid in c["piezas"]:
                n = int(pid[1:]); ob = objetos[n]
                ob.color = (color(c["n"]) if conjunto is None else (color(n) if c is conjunto else GRIS))
                ob.show_in_front = conjunto is not None and c is conjunto

    def rotula(cosas, cam, escala):
        hechos = []
        for cuerpo, cb in cosas:
            arriba = Vector(((cb["min"][0] + cb["max"][0]) / 2, (cb["min"][1] + cb["max"][1]) / 2, cb["max"][2] + 0.05))
            d = diag_caja(cb); t = (0.12 if d < 0.6 else (0.17 if d < 2 else 0.24)) * escala
            hechos.append(rotulo(cuerpo, arriba, t, cam.rotation_euler, rot))
        return hechos

    def borra(hechos):
        for t in hechos:
            for f in list(t.children):
                bpy.data.objects.remove(f)
            bpy.data.objects.remove(t)

    def ver(cosas, oculto):
        for e in cosas:
            e.hide_render = oculto
            for f in e.children:
                f.hide_render = oculto
    tiempos = {}
    vistas = [("vista_planta", ce + Vector((0, 0, 40)), ce, max(tam.x + 3, (tam.y + 3) * w / h)),
              ("vista_sureste", ce + Vector((0.75, -1, 0.9)).normalized() * R * 2.1, ce, None),
              ("vista_noroeste", ce + Vector((-0.75, 1, 0.9)).normalized() * R * 2.1, ce, None),
              ("vista_sur", ce + Vector((0, -40, 0)), ce, max(tam.x + 1.5, (tam.z + 1.5) * w / h))]
    pinta()
    for nombre, desde, hacia, orto in vistas:
        cam = camara(esc, nombre, desde, hacia, orto)
        if nombre == "vista_planta":
            cam.rotation_euler = (0, 0, 0)
        ver(ejes, nombre != "vista_planta")
        hechos = rotula([(c["id"], c["caja_blender"]) for c in inv["conjuntos"]], cam, 1.0 if orto is None else orto / 13)
        tiempos[nombre] = render(esc, os.path.join(carpeta, nombre + ".png")); borra(hechos)
    ver(ejes, True)
    for c in inv["conjuntos"]:
        cb = c["caja_blender"]; d = diag_caja(cb)
        if d < a["grande"]:
            continue
        pinta(c)
        pmn, pmx = Vector(cb["min"]), Vector(cb["max"]); pc = (pmn + pmx) / 2
        dist = (d / 2) / math.sin(math.radians(26)) * 1.05
        cam = camara(esc, "lamina", pc + Vector((0.55, -1, 0.6)).normalized() * dist, pc, None, lente=35)
        grandes = sorted((por_n[int(pid[1:])] for pid in c["piezas"]), key=lambda p: -diag_caja(p["caja_blender"]))
        grandes = [p for p in grandes if diag_caja(p["caja_blender"]) >= 0.3][:60]
        hechos = rotula([(str(p["n"]), p["caja_blender"]) for p in grandes], cam, max(0.5, d / 6))
        mc = c["caja"]
        texto = "%s  %d piezas  %d tri  centro %.2f, %.2f, %.2f  tamano %.2f x %.2f x %.2f" % (c["id"], len(c["piezas"]), c["triangulos"], *mc["centro"], *mc["tamano"])
        t = rotulo(texto, (0, 0, 0), 0.026, (0, 0, 0), rot); t.parent = cam; t.location = (0, 0.29, -1); t.rotation_euler = (0, 0, 0)
        tiempos[c["id"]] = render(esc, os.path.join(carpeta, "conjunto_%s.png" % c["id"])); borra(hechos + [t])
    return tiempos


def principal():
    a = argumentos(); t0 = time.time(); med = {}
    abierto = os.path.abspath(bpy.data.filepath) if bpy.data.filepath else None
    if a["guarda"] and abierto and os.path.abspath(a["guarda"]) == abierto:
        raise SystemExit("--guarda no puede ser el .blend abierto: el inventario se hace sobre una copia")
    origen = json.load(open(a["plantilla"], encoding="utf-8"))["origen"]
    o = bpy.data.objects.get(a["objeto"])
    if o is None or o.type != "MESH":
        raise SystemExit("no hay malla " + a["objeto"])
    carpeta = os.path.abspath(a["carpeta"]); os.makedirs(os.path.join(carpeta, "laminas"), exist_ok=True)
    grupos = trozos_sueltos(o.data, a["soldadura"]); med["trozos_s"] = round(time.time() - t0, 1)
    ts, co, vi, lt, et = estadisticas(o, grupos); med["estadisticas_s"] = round(time.time() - t0, 1)
    pares = contactos(ts, co, vi, lt, et, a["toque"]); med["contactos_s"] = round(time.time() - t0, 1); med["pares_mirados"] = pares
    datos = {"objeto": a["objeto"], "origen_blender": origen, "soldadura_m": a["soldadura"], "toque_m": a["toque"], "trozos": ts}
    json.dump(datos, open(os.path.join(carpeta, "trozos.json"), "w", encoding="utf-8"), ensure_ascii=False)
    inv = piezas.inventario(datos, a["pequeno"])
    json.dump(inv, open(os.path.join(carpeta, "inventario.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("INVENTARIO", json.dumps({"trozos": inv["trozos"], "piezas": len(inv["piezas"]), "conjuntos": len(inv["conjuntos"]), "triangulos": inv["triangulos"]}), flush=True)
    if not a["sin-laminas"] or a["guarda"]:
        objetos = separa_piezas(o, inv, et); med["separa_s"] = round(time.time() - t0, 1)
        if a["guarda"]:
            bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a["guarda"]), compress=True, copy=True)
        if not a["sin-laminas"]:
            med["render_s"] = laminas(a, inv, objetos, os.path.join(carpeta, "laminas"))
    med["total_s"] = round(time.time() - t0, 1); med["pico_memoria_mb"] = pico_memoria_mb()
    json.dump(med, open(os.path.join(carpeta, "inventario.medida.json"), "w", encoding="utf-8"), indent=1)
    print("MEDIDA", json.dumps({k: v for k, v in med.items() if k != "render_s"}))


principal()
