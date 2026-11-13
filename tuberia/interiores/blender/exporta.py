# Exporta un mundo interior horneado a lo que pide contratos/mundo-interior.md: un glb con materiales estándar y la luz
# EN EL COLOR BASE (el glTF no tiene ranura de mapa de luz), y su mundo.json. Nada se guarda en el .blend.
#   blender --background <mundo.blend> --python exporta.py -- --horneado <carpeta de hornea.py> --salida <carpeta>
#           --manifiesto <mundo.plantilla.json> --perfil pantalla|quest --mb 256 --lado 4096
#           [--exposicion 0.0] [--decima objeto:0.5,…] [--calidad 90] [--glb mundo.glb]
#           [--modo color|aparte]   color (por defecto): lo de abajo; aparte: la luz en un mapa aparte del color (ver «modo aparte» al final)
# Por objeto:
#   1. (--decima) simplifica solo objetos ILUSTRATIVOS; ante un MEDIDO se niega;
#   2. elige el lado de su textura: el del mapa de luz, con el tope --lado, y va bajando a la mitad el objeto con más
#      téxeles por metro hasta que el total cabe en --mb (RGBA8 con mipmaps, como cuenta el validador);
#   3. hornea el color base (emisión, una muestra: sin luz, vale también para los metales) en el UV «luz», lo multiplica
#      por el mapa de luz y lo guarda en JPEG. Los metales no tienen luz difusa en el mapa: reciben la luz difusa de su
#      alrededor (media borrosa de lo no metálico), que es una aproximación y se dice;
#   4. las caras con alfa recortado (hojas) conservan su textura y su UV: su luz va en el color de vértice (COLOR_0);
#      el vidrio queda como un material translúcido simple;
#   5. mueve todo para que el origen sea el umbral de la puerta principal y exporta el glb (sin luces, cámaras ni EFECTOS).
# Escribe además mundo.json (zonas con la cota medida del suelo, puertas y puntos en el marco del glb) y exporta.json con
# lo decidido. Después hay que pasar exporta.mjs (pone KHR_materials_unlit y los modos de alfa) y valida.js.
# La plantilla del manifiesto es privada (cotas del sitio); coordenadas de Blender:
#   {"id": "…", "nombre": "…", "fuente": "mixto", "notas": "…", "licencia": {…}, "origen": [x, y, z], "suelos": ["…"],
#    "zonas": [{"id": "…", "caja": [x0, y0, x1, y1]}], "puertas": [{"id": "…", "a": "…", "en": [x, y, z], "rumbo": 0,
#    "ancho": 1.0, "alto": 2.3, "llegada": [x, y], "llegada_rumbo": 180}], "puntos": [{"id": "…", "titulo": "…", "en": [x, y, z]}],
#    "anclaje": {"pos": [x, y], "giro": 57}}   (opcional, contrato v1.1: dónde cae el origen en el exterior de la finca y el rumbo del +Z del glb; pasa tal cual)
import bpy, sys, json, os, time, math
import numpy as np
from mathutils import Vector

UV_LUZ = "luz"
NODO = "gemelo_exporta"


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"horneado": None, "salida": None, "manifiesto": None, "perfil": "pantalla", "mb": 256.0, "lado": 4096, "exposicion": 0.0,
         "decima": "", "calidad": 90, "glb": "mundo.glb", "modo": "color", "lado-color": 1024, "escala": 1.0, "maquinas-plan": None,
         "sondas": None, "objetos": ""}
    i = 0
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        o[k] = float(v) if k in ("mb", "exposicion", "escala") else int(v) if k in ("lado", "calidad", "lado-color") else v
    for k in ("horneado", "salida", "manifiesto"):
        if not o[k]:
            raise SystemExit("falta --" + k)
    return o


def exportables():
    fuera = set()
    for n in ("AUXILIAR", "DESCARTES", "EFECTOS"):
        c = bpy.data.collections.get(n)
        if c:
            fuera |= {o.name for o in c.all_objects}
    return [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name not in fuera and len(o.data.polygons) and not o.hide_render]


def principled(m):
    return next((n for n in m.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"), None) if m and m.node_tree else None


def clase(m):
    """«tarjeta» (alfa recortado: conserva su textura), «vidrio» o «horneado»"""
    if m is None:
        return "horneado"
    if m.get("gemelo_alfa"):
        return "tarjeta"
    return "vidrio" if m.name.split(".")[0] == "vidrio" else "horneado"


def a_emision(m, que):
    """El material emite su color base (que = «color») o su metal (que = «metal»): se hornea con EMIT, sin luz"""
    nt = m.node_tree; b = principled(m); sal = next(n for n in nt.nodes if n.bl_idname == "ShaderNodeOutputMaterial" and n.is_active_output)
    em = nt.nodes.get(NODO + "_em") or nt.nodes.new("ShaderNodeEmission"); em.name = NODO + "_em"
    for l in list(em.inputs["Color"].links):
        nt.links.remove(l)
    z = b.inputs["Base Color" if que == "color" else "Metallic"] if b else None
    if z is not None and z.is_linked:
        nt.links.new(z.links[0].from_socket, em.inputs["Color"])
    elif z is not None:
        v = z.default_value; em.inputs["Color"].default_value = tuple(v) if que == "color" else (v, v, v, 1)
    nt.links.new(em.outputs[0], sal.inputs["Surface"])


def con_metal(m):
    b = principled(m)
    return b is not None and (b.inputs["Metallic"].is_linked or b.inputs["Metallic"].default_value > 0.01)


def hornea_emision(o, lado, margen):
    """Hornea EMIT del objeto en su UV «luz» y devuelve (lado, lado, 3) lineal, fila 0 abajo"""
    img = bpy.data.images.new(NODO, lado, lado, alpha=False, float_buffer=True)
    for m in o.data.materials:
        if m and m.node_tree:
            n = m.node_tree.nodes.get(NODO) or m.node_tree.nodes.new("ShaderNodeTexImage"); n.name = NODO; n.image = img; m.node_tree.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    o.data.uv_layers.active = o.data.uv_layers[UV_LUZ]
    bpy.ops.object.bake(type="EMIT", target="IMAGE_TEXTURES", margin=margen, use_clear=True)
    px = np.empty(lado * lado * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
    return px.reshape(lado, lado, 4)[..., :3].copy()


def lee_luz(ruta, lado):
    """El mapa de luz (EXR lineal) reducido a `lado` por medias de bloques"""
    img = bpy.data.images.load(ruta, check_existing=False); n = img.size[0]
    px = np.empty(n * n * 4, dtype=np.float32); img.pixels.foreach_get(px); bpy.data.images.remove(img)
    px = px.reshape(n, n, 4)[..., :3]
    if n > lado:
        k = n // lado; px = px.reshape(lado, k, lado, k, 3).mean(axis=(1, 3))
    return np.nan_to_num(px.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)


def luz_de_alrededor(luz, metal):
    """Media borrosa de la luz de lo no metálico (convolución normalizada a 64 px): lo que «ve» un metal cerca"""
    n = luz.shape[0]; k = max(1, n // 64); m = n // k
    peso = (1.0 - metal) * (luz.sum(axis=2) > 1e-5)
    w = peso.reshape(m, k, m, k).mean(axis=(1, 3)); l = (luz * peso[..., None]).reshape(m, k, m, k, 3).mean(axis=(1, 3))
    for _ in range(6):
        w = (w + np.roll(w, 1, 0) + np.roll(w, -1, 0) + np.roll(w, 1, 1) + np.roll(w, -1, 1)) / 5
        l = (l + np.roll(l, 1, 0) + np.roll(l, -1, 0) + np.roll(l, 1, 1) + np.roll(l, -1, 1)) / 5
    amb = l / np.maximum(w, 1e-4)[..., None]
    media = (luz * peso[..., None]).sum(axis=(0, 1)) / max(peso.sum(), 1e-4)
    amb = np.where((w > 1e-3)[..., None], amb, media)
    return np.repeat(np.repeat(amb, k, axis=0), k, axis=1)


def suave(x):
    """Rodilla por encima de 0,8 para que el sol no se queme en 8 bits (la textura sale ya «revelada»)"""
    return np.where(x < 0.8, x, 0.8 + 0.2 * np.tanh((x - 0.8) / 0.2))


def a_srgb(c):
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 1e-6, 1), 1 / 2.4) - 0.055)


def guarda_jpeg(ruta, px, calidad):
    n = px.shape[0]; img = bpy.data.images.new(os.path.basename(ruta), n, n, alpha=False)
    rgba = np.ones((n, n, 4), dtype=np.float32); rgba[..., :3] = a_srgb(np.clip(px, 0, 1))
    img.pixels.foreach_set(rgba.ravel()); img.filepath_raw = ruta; img.file_format = "JPEG"
    try:
        img.save(quality=calidad)
    except TypeError:
        img.save()
    bpy.data.images.remove(img)
    return bpy.data.images.load(ruta, check_existing=False)


def material_horneado(nombre, img):
    m = bpy.data.materials.new(nombre); m.use_nodes = True; nt = m.node_tree; b = principled(m)
    uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = UV_LUZ; t = nt.nodes.new("ShaderNodeTexImage"); t.image = img
    nt.links.new(uv.outputs[0], t.inputs[0]); nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Roughness"].default_value = 1.0; b.inputs["Metallic"].default_value = 0.0
    m["gemelo_luz"] = "horneada en el color base"
    return m


def material_vidrio():
    m = bpy.data.materials.get("vidrio_exporta")
    if m is None:
        m = bpy.data.materials.new("vidrio_exporta"); m.use_nodes = True; b = principled(m)
        b.inputs["Base Color"].default_value = (0.55, 0.68, 0.72, 1); b.inputs["Alpha"].default_value = 0.35; b.inputs["Roughness"].default_value = 0.1
        if hasattr(m, "surface_render_method"):
            m.surface_render_method = "BLENDED"
    return m


def suelo_en(suelos, x, y):
    mejor = None
    for s in suelos:
        inv = s.matrix_world.inverted()
        ok, p, n, i = s.ray_cast(inv @ Vector((x, y, 30.0)), inv.to_3x3() @ Vector((0, 0, -1)), distance=60)
        if ok:
            # el suelo más bajo de los que hay en esa vertical no: el que pisa una persona es el más alto por debajo de 2,5 m
            z = (s.matrix_world @ p).z
            if mejor is None or z > mejor:
                mejor = z
    return mejor


def manifiesto(pl, glb, perfil):
    """mundo.json en el marco del glb: (x, y, z)_glb = (x − ox, z − oz, −(y − oy))_blender"""
    ox, oy, oz = pl["origen"]; suelos = [bpy.data.objects[n] for n in pl["suelos"]]; r = lambda v: round(v, 3)
    g = lambda x, y, z: [r(x - ox), r(z - oz), r(-(y - oy))]
    zonas = []; medidas = {}
    for z in pl["zonas"]:
        x0, y0, x1, y1 = z["caja"]
        zs = [suelo_en(suelos, x0 + (x1 - x0) * (i + 0.5) / 6, y0 + (y1 - y0) * (j + 0.5) / 6) for i in range(6) for j in range(6)]
        zs = sorted(v for v in zs if v is not None)
        if not zs:
            raise SystemExit("la zona " + z["id"] + " no tiene suelo debajo")
        cota = z.get("cota", zs[len(zs) // 2])
        medidas[z["id"]] = {"suelo_min": r(zs[0]), "suelo_mediana": r(zs[len(zs) // 2]), "suelo_max": r(zs[-1]), "puntos_con_suelo": len(zs)}
        zonas.append({"id": z["id"], "anillo": [[r(x0 - ox), r(-(y0 - oy))], [r(x1 - ox), r(-(y0 - oy))], [r(x1 - ox), r(-(y1 - oy))], [r(x0 - ox), r(-(y1 - oy))]], "y": r(cota - oz),
                      "_caja": z["caja"], "_cota": cota})
    def zona_de(x, y):
        return next((z for z in zonas if z["_caja"][0] <= x <= z["_caja"][2] and z["_caja"][1] <= y <= z["_caja"][3]), None)
    puertas = []
    for p in pl["puertas"]:
        lx, ly = p["llegada"]; z = zona_de(lx, ly)
        if z is None:
            raise SystemExit("la llegada de la puerta " + p["id"] + " no cae en ninguna zona")
        puertas.append({"id": p["id"], "a": p["a"], "pos": g(*p["en"]), "rumbo": p["rumbo"], "ancho": p["ancho"], "alto": p["alto"],
                        "llegada": {"pos": g(lx, ly, z["_cota"]), "rumbo": p["llegada_rumbo"]}})
    m = {"v": 1, "id": pl["id"], "nombre": pl["nombre"], "fuente": pl["fuente"], "notas": pl["notas"], "licencia": pl["licencia"], "glb": glb,
         "unidades": "m", "arriba": "+Y"}
    if pl.get("aforo"):
        m["aforo"] = pl["aforo"]
    m["zonas"] = [{k: v for k, v in z.items() if not k.startswith("_")} for z in zonas]; m["puertas"] = puertas
    if pl.get("puntos"):
        m["puntos"] = [{"id": p["id"], "titulo": p["titulo"], "pos": g(*p["en"])} for p in pl["puntos"]]
    if pl.get("anclaje"):   # v1.1: ya va en el marco de la finca (no en el de Blender); solo pos y giro (la plantilla puede llevar su _nota)
        m["anclaje"] = {"pos": [float(pl["anclaje"]["pos"][0]), float(pl["anclaje"]["pos"][1])], "giro": float(pl["anclaje"]["giro"])}
    return m, medidas


def principal():
    a = argumentos(); t0 = time.time(); esc = bpy.context.scene
    pl = json.load(open(a["manifiesto"], encoding="utf-8")); os.makedirs(a["salida"], exist_ok=True)
    tex = os.path.join(a["salida"], "_texturas"); os.makedirs(tex, exist_ok=True)
    objs = exportables(); informe = {"blend": os.path.basename(bpy.data.filepath), "perfil": a["perfil"], "parametros": {k: v for k, v in a.items() if k not in ("horneado", "salida", "manifiesto")}, "objetos": {}}
    man, medidas_zonas = manifiesto(pl, a["glb"], a["perfil"])  # antes de mover nada
    # 1. simplificar (solo lo ilustrativo)
    for par in [x for x in a["decima"].split(",") if x]:
        n, ratio = par.split(":"); o = bpy.data.objects[n]
        if o.get("gemelo_procedencia") == "medido":
            raise SystemExit(n + " es MEDIDO: no se simplifica")
        antes = sum(len(p.vertices) - 2 for p in o.data.polygons)
        md = o.modifiers.new("decima", "DECIMATE"); md.ratio = float(ratio); md.use_collapse_triangulate = True
        bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=md.name)
        informe.setdefault("decimados", {})[n] = {"ratio": float(ratio), "antes": antes, "despues": sum(len(p.vertices) - 2 for p in o.data.polygons)}
        print("DECIMA", n, json.dumps(informe["decimados"][n]))
    # 2. lado de cada textura
    lados = {}; dens = {}
    for o in objs:
        ruta = next((r for r in (os.path.join(a["horneado"], o.name + s) for s in ("_luz_dn.exr", "_luz.exr")) if os.path.exists(r)), None)
        if ruta is None or UV_LUZ not in o.data.uv_layers:
            raise SystemExit(o.name + " no tiene mapa de luz en " + a["horneado"])
        img = bpy.data.images.load(ruta, check_existing=False); nat = img.size[0]; bpy.data.images.remove(img)
        tiene_horneado = any(clase(o.data.materials[p.material_index]) == "horneado" for p in o.data.polygons)
        lados[o.name] = {"ruta": ruta, "nativo": nat, "lado": min(nat, a["lado"]) if tiene_horneado else 0}
        dens[o.name] = math.sqrt(max(1e-6, o.get("gemelo_uv_ocupacion", 0.5)) / max(1e-3, o.get("gemelo_area_m2", 1.0)))
    otras = {}
    for o in objs:
        for m in o.data.materials:
            if clase(m) == "tarjeta":
                for n in m.node_tree.nodes:
                    if n.bl_idname == "ShaderNodeTexImage" and n.image and n.outputs["Color"].is_linked:
                        otras[n.image.name] = n.image.size[0] * n.image.size[1]
    mb = lambda: (sum(v["lado"] ** 2 for v in lados.values()) + sum(otras.values())) * 4 * 4 / 3 / 2 ** 20
    while mb() > a["mb"]:
        cand = [n for n, v in lados.items() if v["lado"] > 64]
        if not cand:
            break
        n = max(cand, key=lambda k: lados[k]["lado"] * dens[k]); lados[n]["lado"] //= 2
    informe["texturas_mb_estimado"] = round(mb(), 1)
    # 3. color base × luz
    esc.render.engine = "CYCLES"; esc.cycles.device = "CPU"; esc.cycles.samples = 1; esc.cycles.use_denoising = False
    k_exp = 2.0 ** a["exposicion"]; vidrio = material_vidrio()
    mats = {m for o in objs for m in o.data.materials if m and m.node_tree and clase(m) == "horneado"}
    for o in objs:
        t = time.time(); me = o.data; lado = lados[o.name]["lado"]; fila = {"lado_nativo": lados[o.name]["nativo"], "lado": lado, "texeles_por_metro": round(lado * dens[o.name], 1)}
        clases = [clase(m) for m in me.materials]
        luz_nat = None
        if lado:
            for m in me.materials:
                if m in mats:
                    a_emision(m, "color")
            color = hornea_emision(o, lado, max(2, lado // 256))
            luz = lee_luz(lados[o.name]["ruta"], lado)
            if any(con_metal(m) for m in me.materials if m in mats):
                for m in me.materials:
                    if m in mats:
                        a_emision(m, "metal")
                metal = np.clip(hornea_emision(o, lado, max(2, lado // 256))[..., 0], 0, 1)
                luz = luz * (1 - metal[..., None]) + luz_de_alrededor(luz, metal) * metal[..., None]
                fila["metal_medio"] = round(float(metal.mean()), 3)
            ruta = os.path.join(tex, "%s_%s.jpg" % (o.name, a["perfil"]))
            img = guarda_jpeg(ruta, suave(color * luz * k_exp), a["calidad"]); fila["jpeg_kb"] = round(os.path.getsize(ruta) / 1024)
            nuevo = material_horneado(o.name + "_luz", img)
        # 4. tarjetas: la luz al color de vértice
        if "tarjeta" in clases:
            luz_t = lee_luz(lados[o.name]["ruta"], min(lados[o.name]["nativo"], 1024)); n = luz_t.shape[0]
            col = me.color_attributes["Color"]; d = np.empty(4 * len(col.data), dtype=np.float32); col.data.foreach_get("color", d); d = d.reshape(-1, 4)
            uvl = me.uv_layers[UV_LUZ].data
            for p in me.polygons:
                if clases[p.material_index] != "tarjeta":
                    continue
                u = sum(uvl[i].uv.x for i in p.loop_indices) / p.loop_total; v = sum(uvl[i].uv.y for i in p.loop_indices) / p.loop_total
                l = suave(luz_t[min(n - 1, max(0, int(v * n))), min(n - 1, max(0, int(u * n)))] * k_exp)
                for i in p.loop_indices:
                    d[i, :3] = np.clip(d[i, :3] * l, 0, 1)
            col.data.foreach_set("color", d.ravel()); me.color_attributes.render_color_index = me.color_attributes.find("Color")
            for m in {me.materials[i] for i, c in enumerate(clases) if c == "tarjeta"}:
                # para el exportador: el Principled directo a la salida y el alfa de la textura sin nodos por medio
                nt = m.node_tree; b = principled(m); sal = next(x for x in nt.nodes if x.bl_idname == "ShaderNodeOutputMaterial" and x.is_active_output)
                nt.links.new(b.outputs[0], sal.inputs["Surface"])
                ti = next(x for x in nt.nodes if x.bl_idname == "ShaderNodeTexImage" and x.outputs["Color"].is_linked)
                nt.links.new(ti.outputs["Alpha"], b.inputs["Alpha"]); b.inputs["Roughness"].default_value = 1.0
            fila["tarjetas"] = int(sum(1 for p in me.polygons if clases[p.material_index] == "tarjeta"))
        # materiales finales: uno horneado por objeto, las tarjetas como estaban y el vidrio simple
        finales = [nuevo if c == "horneado" else vidrio if c == "vidrio" else me.materials[i] for i, c in enumerate(clases)]
        indice = [p.material_index for p in me.polygons]; unicos = []
        for m in finales:
            if m not in unicos:
                unicos.append(m)
        me.materials.clear()
        for m in unicos:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", [unicos.index(finales[i]) for i in indice]); me.update()
        if "tarjeta" not in clases:
            for u in [u for u in me.uv_layers if u.name != UV_LUZ]:
                me.uv_layers.remove(u)   # sin tarjetas, el UV «luz» pasa a ser el único (TEXCOORD_0)
        fila["triangulos"] = sum(len(p.vertices) - 2 for p in me.polygons); fila["llamadas"] = len({p.material_index for p in me.polygons})
        fila["segundos"] = round(time.time() - t, 1); informe["objetos"][o.name] = fila
        print("EXPORTA", o.name, json.dumps(fila), flush=True)
    # 5. origen en el umbral de la puerta principal y glb
    ox, oy, oz = pl["origen"]
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.location = o.location - Vector((ox, oy, oz)); o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    ruta_glb = os.path.join(a["salida"], a["glb"])
    pide = {"filepath": ruta_glb, "export_format": "GLB", "use_selection": True, "export_apply": True, "export_yup": True, "export_cameras": False,
            "export_lights": False, "export_animations": False, "export_vertex_color": "MATERIAL", "export_image_format": "AUTO", "export_normals": False,
            "export_tangents": False, "export_extras": False, "export_attributes": False, "export_skins": False, "export_morph": False}
    admite = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in pide.items() if k in admite})
    json.dump(man, open(os.path.join(a["salida"], "mundo.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    informe.update({"glb": a["glb"], "glb_mb": round(os.path.getsize(ruta_glb) / 2 ** 20, 1), "zonas": medidas_zonas, "origen_blender": pl["origen"],
                    "triangulos": sum(f["triangulos"] for f in informe["objetos"].values()), "llamadas": sum(f["llamadas"] for f in informe["objetos"].values()),
                    "segundos": round(time.time() - t0, 1)})
    json.dump(informe, open(os.path.join(a["salida"], "exporta.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("EXPORTA_TOTAL", json.dumps({k: informe[k] for k in ("perfil", "glb_mb", "triangulos", "llamadas", "texturas_mb_estimado", "segundos")}))


# ---- modo «aparte» (fábrica 1.1, contrato mundo-interior §1c y §1d, ADR-0034) ----
#   blender --background <maquinas.blend> --python exporta.py -- --modo aparte --horneado <carpeta de hornea.py --modo aparte>
#           --salida … --manifiesto <plantilla> --perfil quest --mb 92 --lado 2048 [--lado-color 1024] [--escala 1]
# (--escala 1: la rodilla de suave() ya deja la luz en [0, 1]; una escala mayor gastaría bits del JPEG en lo que nunca se usa)
#           [--maquinas-plan <maquinas.plan.json>] [--sondas <sondas.json>] [--objetos a,b,c] [--exposicion 0.0]
# El color base es el ALBEDO: la textura de color de cada material tal cual (en mosaico, UVMap = TEXCOORD_0, con lado tope
# --lado-color) y el color de vértice «Color» (el envejecido, COLOR_0, multiplica). La luz va aparte, un JPEG por atlas
# (<atlas>_luz: la luz × 2^exposición con la rodilla de siempre, entre --escala; <atlas>_ao: la oclusión propia de las máquinas
# con luz propia), en el UV «luz» (TEXCOORD_1). Aquí el mapa se cuelga de la ranura de oclusión (grupo «glTF Material Output»)
# para que el exportador escriba TEXCOORD_1 y texCoord 1; exporta.mjs --luz luz_aparte.json pone después la imagen RGB de
# verdad, KHR_materials_unlit en lo que no tiene luz propia y deja COLOR_0. Un material por material de origen y atlas (y por
# máquina en las correas, que corren solas). Los metales de lo fijo reciben la luz de su alrededor, como en el modo color.
# El manifiesto gana luz (modo mapa, escala, la sonda de la sala × 2^exposición) y maquinas[] (maquinas_def.manifiesto).
# Sin tarjetas con alfa todavía (la fábrica no tiene): si las hay, se niega.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _luz_propia(o):
    while o is not None:
        if o.get("gemelo_maquina"):
            return o.get("gemelo_luz") == "propia"
        o = o.parent
    return False


def _imagen_color(m):
    """La textura de imagen que da el color base del material (buscando aguas arriba del Principled), o None"""
    b = principled(m)
    if b is None:
        return None
    pila, vistos = [b.inputs["Base Color"]], set()
    while pila:
        z = pila.pop()
        for l in z.links:
            n = l.from_node
            if n.name in vistos:
                continue
            vistos.add(n.name)
            if n.bl_idname == "ShaderNodeTexImage" and n.image:
                return n.image
            pila.extend(i for i in n.inputs if i.is_linked)
    return None


def _grupo_gltf():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def _material_aparte(nombre, m, color_img, mapa_img, propia):
    n = bpy.data.materials.new(nombre); n.use_nodes = True; nt = n.node_tree; b = principled(n); ob = principled(m)
    if color_img is not None:
        uv = nt.nodes.new("ShaderNodeUVMap"); uv.uv_map = "UVMap"; t = nt.nodes.new("ShaderNodeTexImage"); t.image = color_img
        nt.links.new(uv.outputs[0], t.inputs[0]); nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    elif ob is not None:
        z = ob.inputs["Base Color"]
        b.inputs["Base Color"].default_value = tuple(z.default_value)
    if propia and ob is not None:
        for k in ("Metallic", "Roughness"):
            z = ob.inputs[k]; b.inputs[k].default_value = z.default_value if not z.is_linked else (0.5 if k == "Metallic" else 0.6)
    else:
        b.inputs["Metallic"].default_value = 0.0; b.inputs["Roughness"].default_value = 1.0
    uvl = nt.nodes.new("ShaderNodeUVMap"); uvl.uv_map = UV_LUZ; tl = nt.nodes.new("ShaderNodeTexImage"); tl.image = mapa_img
    nt.links.new(uvl.outputs[0], tl.inputs[0])
    gr = nt.nodes.new("ShaderNodeGroup"); gr.node_tree = _grupo_gltf(); nt.links.new(tl.outputs["Color"], gr.inputs["Occlusion"])
    n["gemelo_luz"] = "mapa aparte (UV luz)"
    return n


def _color_reducido(img, lado, carpeta, cache):
    if img.name in cache:
        return cache[img.name]
    w, h = img.size; k = max(1, max(w, h) // lado) if max(w, h) > lado else 1
    c = img.copy(); c.name = img.name + "_exp"
    if k > 1:
        c.scale(max(1, w // k), max(1, h // k))
    ruta = os.path.join(carpeta, "color_" + "".join(ch if ch.isalnum() or ch in "_-" else "_" for ch in img.name) + ".jpg")
    c.filepath_raw = ruta; c.file_format = "JPEG"; c.save(); bpy.data.images.remove(c)
    cache[img.name] = bpy.data.images.load(ruta, check_existing=False)
    return cache[img.name]


def principal_aparte(a):
    import maquinas_def
    t0 = time.time(); pl = json.load(open(a["manifiesto"], encoding="utf-8")); os.makedirs(a["salida"], exist_ok=True)
    tex = os.path.join(a["salida"], "_texturas"); os.makedirs(tex, exist_ok=True)
    objs = exportables()
    if a["objetos"]:
        pedidos = a["objetos"].split(","); objs = [o for o in objs if o.name in pedidos]
        if set(pedidos) - {o.name for o in objs}:
            raise SystemExit("no se exportan o no existen: " + ", ".join(sorted(set(pedidos) - {o.name for o in objs})))
    if any(clase(m) == "tarjeta" for o in objs for m in o.data.materials):
        raise SystemExit("hay tarjetas con alfa: el modo aparte aún no las lleva (usa --modo color)")
    man, medidas_zonas = manifiesto(pl, a["glb"], a["perfil"])
    informe = {"blend": os.path.basename(bpy.data.filepath), "modo": "aparte", "perfil": a["perfil"], "parametros": {k: v for k, v in a.items() if k not in ("horneado", "salida", "manifiesto")}, "objetos": {}, "atlas": {}}
    # 1. qué atlas pide cada objeto y de qué lado
    atlas = {}
    for o in objs:
        at = (o.get("gemelo_atlas_luz") or o.name) + ("_ao" if _luz_propia(o) else "_luz")
        if at not in atlas:
            ruta = next((r for r in (os.path.join(a["horneado"], at + s) for s in ("_dn.exr", ".exr")) if os.path.exists(r)), None)
            if ruta is None:
                raise SystemExit(o.name + ": no está horneado el atlas " + at + " en " + a["horneado"])
            img = bpy.data.images.load(ruta, check_existing=False); nat = img.size[0]; bpy.data.images.remove(img)
            atlas[at] = {"ruta": ruta, "nativo": nat, "lado": min(nat, a["lado"]), "objetos": []}
        atlas[at]["objetos"].append(o)
    colores = {}
    for o in objs:
        for m in o.data.materials:
            im = _imagen_color(m) if m and clase(m) == "horneado" else None
            if im is not None:
                w, h = im.size; k = max(1, max(w, h) // a["lado-color"]) if max(w, h) > a["lado-color"] else 1
                colores[im.name] = (w // k) * (h // k)
    mb = lambda: (sum(v["lado"] ** 2 for v in atlas.values()) + sum(colores.values())) * 4 * 4 / 3 / 2 ** 20
    while mb() > a["mb"]:
        cand = [n for n, v in atlas.items() if v["lado"] > 64]
        if not cand:
            break
        atlas[max(cand, key=lambda n: atlas[n]["lado"])]["lado"] //= 2
    informe["texturas_mb_estimado"] = round(mb(), 1)
    # 2. los mapas: luz (con los metales a la luz de alrededor) o la oclusión propia
    esc = bpy.context.scene; esc.render.engine = "CYCLES"; esc.cycles.device = "CPU"; esc.cycles.samples = 1; esc.cycles.use_denoising = False
    k_exp = 2.0 ** a["exposicion"]; mapas = {}
    for at, v in atlas.items():
        t = time.time(); lado = v["lado"]; mapa = lee_luz(v["ruta"], lado)
        if at.endswith("_luz"):
            metal = np.zeros((lado, lado), np.float32)
            for o in v["objetos"]:
                ms = [m for m in o.data.materials if m and m.node_tree and clase(m) == "horneado"]
                if any(con_metal(m) for m in ms):
                    copias = []
                    for i, m in enumerate(o.data.materials):
                        if m in ms:
                            c = m.copy(); o.data.materials[i] = c; a_emision(c, "metal"); copias.append((i, m, c))
                    metal = np.maximum(metal, np.clip(hornea_emision(o, lado, max(2, lado // 256))[..., 0], 0, 1))
                    for i, m, c in copias:
                        o.data.materials[i] = m; bpy.data.materials.remove(c)
            if metal.max() > 0:
                mapa = mapa * (1 - metal[..., None]) + luz_de_alrededor(mapa, metal) * metal[..., None]
            px = np.clip(suave(mapa * k_exp) / a["escala"], 0, 1)
            v["metal_medio"] = round(float(metal.mean()), 3)
        else:
            px = np.clip(mapa, 0, 1)
        ruta = os.path.join(tex, "%s_%s.jpg" % (at, a["perfil"])); mapas[at] = guarda_jpeg(ruta, px, a["calidad"])
        v.update({"jpeg": os.path.basename(ruta), "jpeg_kb": round(os.path.getsize(ruta) / 1024), "segundos": round(time.time() - t, 1)})
    # 3. materiales
    hechos, sidecar, cache = {}, {}, {}
    for o in objs:
        me = o.data; propia = _luz_propia(o); base_at = o.get("gemelo_atlas_luz") or o.name; at = base_at + ("_ao" if propia else "_luz")
        if me.uv_layers[0].name == UV_LUZ:
            raise SystemExit(o.name + ": el primer UV es «luz»: el de color tiene que ir primero (TEXCOORD_0)")
        for u in [u for u in me.uv_layers if u.name not in ("UVMap", UV_LUZ)]:
            me.uv_layers.remove(u)
        for i, m in enumerate(list(me.materials)):
            if clase(m) == "vidrio":
                me.materials[i] = material_vidrio(); continue
            nombre = m.name if "__" in m.name else m.name.split(".")[0] + "__" + base_at + ("_propia" if propia else "")
            if nombre not in hechos:
                im = _imagen_color(m)
                if nombre in bpy.data.materials:   # la correa ya trae su material con este nombre (maquinas.py): el de origen se aparta
                    bpy.data.materials[nombre].name = nombre + "__origen"
                hechos[nombre] = _material_aparte(nombre, m, _color_reducido(im, a["lado-color"], tex, cache) if im else None, mapas[at], propia)
                sidecar[nombre] = {"mapa": os.path.relpath(os.path.join(tex, "%s_%s.jpg" % (at, a["perfil"])), a["salida"]).replace("\\", "/"), "unlit": not propia}
            me.materials[i] = hechos[nombre]
        if "Color" in me.color_attributes:
            me.color_attributes.active_color = me.color_attributes["Color"]
        informe["objetos"][o.name] = {"atlas": at, "triangulos": sum(len(p.vertices) - 2 for p in me.polygons), "llamadas": len({p.material_index for p in me.polygons}), "propia": propia}
    informe["atlas"] = {k: {x: y for x, y in v.items() if x not in ("objetos", "ruta")} for k, v in atlas.items()}
    json.dump(sidecar, open(os.path.join(a["salida"], "luz_aparte.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    # 4. el origen en el umbral (solo se mueven las raíces: lo que cuelga de otro va con él) y el glb
    ox, oy, oz = pl["origen"]; nombres = {o.name for o in objs}
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        if o.parent is None or o.parent.name not in nombres:
            o.location = o.location - Vector((ox, oy, oz))
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    ruta_glb = os.path.join(a["salida"], a["glb"])
    pide = {"filepath": ruta_glb, "export_format": "GLB", "use_selection": True, "export_apply": True, "export_yup": True, "export_cameras": False,
            "export_lights": False, "export_animations": False, "export_vertex_color": "ACTIVE", "export_image_format": "AUTO", "export_normals": True,
            "export_tangents": False, "export_extras": False, "export_attributes": False, "export_skins": False, "export_morph": False}
    admite = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k: v for k, v in pide.items() if k in admite})
    # 5. el manifiesto: luz y máquinas
    sondas = json.load(open(a["sondas"] or os.path.join(a["horneado"], "sondas.json"), encoding="utf-8")) if (a["sondas"] or os.path.exists(os.path.join(a["horneado"], "sondas.json"))) else {}
    man["luz"] = {"modo": "mapa", "escala": a["escala"], "nota": "horneada en Blender (Cycles), ilustrativa; luz × 2^%g" % a["exposicion"]}
    if sondas.get("sala"):
        man["luz"]["sonda"] = sondas["sala"]["sh"] if k_exp == 1 else [[round(x * k_exp, 5) for x in f] for f in sondas["sala"]["sh"]]
    if a["maquinas-plan"]:
        plan = json.load(open(a["maquinas-plan"], encoding="utf-8")); exportados = nombres
        todas = maquinas_def.manifiesto(plan); dentro = {q["id"] for q in todas if q["nodo"] in exportados}
        quedan = []
        for q in todas:
            if q["id"] not in dentro:
                continue
            if "relacion" in q and q["relacion"]["con"] not in dentro:
                informe.setdefault("maquinas_fuera", []).append(q["id"]); continue
            if q["id"] in sondas and q["luz"] == "propia":
                # una sonda puesta dentro de otra pieza (el pivote de un rulo cae dentro de la solera) sale casi negra: entonces vale la de la sala
                ls, lm = sum(sondas.get("sala", {}).get("sh", [[0, 0, 0]])[0]), sum(sondas[q["id"]]["sh"][0])
                if ls and lm < 0.1 * ls:
                    informe.setdefault("sondas_descartadas", []).append(q["id"])
                else:
                    q["sonda"] = [[round(x * k_exp, 5) for x in f] for f in sondas[q["id"]]["sh"]]
            quedan.append(q)
        man["maquinas"] = quedan
    json.dump(man, open(os.path.join(a["salida"], "mundo.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    informe.update({"glb": a["glb"], "glb_mb": round(os.path.getsize(ruta_glb) / 2 ** 20, 2), "zonas": medidas_zonas, "origen_blender": pl["origen"],
                    "triangulos": sum(f["triangulos"] for f in informe["objetos"].values()), "llamadas": sum(f["llamadas"] for f in informe["objetos"].values()),
                    "maquinas": len(man.get("maquinas", [])), "segundos": round(time.time() - t0, 1)})
    json.dump(informe, open(os.path.join(a["salida"], "exporta.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    from recuento import pico_memoria_mb
    informe["pico_memoria_mb"] = pico_memoria_mb(); json.dump(informe, open(os.path.join(a["salida"], "exporta.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("EXPORTA_TOTAL", json.dumps({k: informe[k] for k in ("modo", "pico_memoria_mb", "perfil", "glb_mb", "triangulos", "llamadas", "texturas_mb_estimado", "maquinas", "segundos")}))


if argumentos()["modo"] == "aparte":
    principal_aparte(argumentos())
else:
    principal()
