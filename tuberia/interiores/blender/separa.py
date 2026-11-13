# Separa el glb descomprimido (descomprime.mjs) en un .blend por mundo interior, según capas.json.
# Blender 5.2 en segundo plano:
#   blender --background --factory-startup --python separa.py -- <glb> <capas.json> <mundo> <salida.blend> [--sin-limpieza]
# Qué hace, en este orden:
#   1. importa el glb (el importador de glTF de Blender conserva COLOR_0 como «Color» y `_LIGHT` como atributo de color);
#   2. aplica la transformación de cada nodo (la cuantización dejaba escalas de ~7): la malla queda en metros, con la
#      transformación identidad, en el sistema de Blender (Z arriba; el del glb es x = x, y = z_blender, z = -y_blender);
#   3. borra lo que no es del mundo y reparte el resto en colecciones por procedencia (MEDIDO, ILUSTRATIVO, AUXILIAR);
#   4. aparta (no borra) los grumos sueltos del escaneo a «descartes_<objeto>», en la colección DESCARTES, excluida;
#   5. pasa los materiales sin luz del escaneo (escaneo_*) a Principled BSDF para que reciban luz al hornear
#      (queda la marca «gemelo_unlit» en el material); los «auxiliar» (sombras pintadas) se quedan como estaban;
#   6. guarda el .blend con las imágenes empaquetadas y escribe <salida>.json con el recuento.
import bpy, bmesh, sys, json, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from recuento import recuento, triangulos, trozos  # noqa: E402 (el módulo vive junto a este guion)


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    if len(a) < 4:
        raise SystemExit("uso: … -- <glb> <capas.json> <mundo> <salida.blend> [--sin-limpieza]")
    return {"glb": a[0], "capas": a[1], "mundo": a[2], "salida": a[3], "limpia": "--sin-limpieza" not in a}


def coleccion(nombre, padre):
    c = bpy.data.collections.get(nombre) or bpy.data.collections.new(nombre)
    if c.name not in padre.children:
        padre.children.link(c)
    return c


def grumos(o, cfg):
    """Índices (de la malla original) de las caras de piezas sueltas pequeñas, tras soldar las costuras de UV"""
    co = o.data.vertices; fuera = []
    for caras in trozos(o.data, cfg["soldadura_m"]):
        if len(caras) >= cfg["caras_max"]:
            continue
        vs = [co[v].co for c in caras for v in o.data.polygons[c].vertices]
        diag = sum((max(v[k] for v in vs) - min(v[k] for v in vs)) ** 2 for k in range(3)) ** 0.5
        if diag < cfg["diagonal_max_m"]:
            fuera.extend(caras)
    return sorted(set(fuera))


def aparta(o, indices, coleccion_destino):
    """Mueve las caras `indices` de o a un objeto nuevo «descartes_<o>» (misma lista de materiales)"""
    if not indices:
        return None
    sel = set(indices)
    me = o.data.copy(); me.name = "descartes_" + o.name
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in sel], context="FACES")
    bm.to_mesh(me); bm.free()
    d = bpy.data.objects.new(me.name, me); coleccion_destino.objects.link(d)
    d["gemelo_procedencia"] = "medido"
    d["gemelo_nota"] = "grumos sueltos del escaneo apartados por separa.py; se devuelven uniéndolos a " + o.name
    bm = bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.faces[i] for i in indices], context="FACES")
    bm.to_mesh(o.data); bm.free()
    return d


def a_principled(m):
    """escaneo_*: emisión sin luz → Principled con la misma textura de color (rugoso, sin metal)"""
    nt = m.node_tree
    tex = next((n for n in nt.nodes if n.bl_idname == "ShaderNodeTexImage"), None)
    if tex is None:
        return False
    m["gemelo_unlit"] = True
    nombre = tex.name
    for n in [n for n in nt.nodes if n.name != nombre]:
        nt.nodes.remove(n)
    tex = nt.nodes[nombre]  # la referencia anterior puede quedar inválida al borrar nodos
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled"); bsdf.location = (300, 0)
    out = nt.nodes.new("ShaderNodeOutputMaterial"); out.location = (600, 0)
    bsdf.inputs["Roughness"].default_value = 0.9
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.2
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    m.surface_render_method = "DITHERED"
    return True


def principal():
    a = argumentos(); t0 = time.time()
    capas = json.load(open(a["capas"], encoding="utf-8"))
    mundo = capas["mundos"][a["mundo"]]
    propios = {n: proc for proc, ns in mundo.items() if not proc.startswith("_") for n in ns}
    otra_coleccion = {n: c for c, ns in mundo.get("_colecciones", {}).items() for n in ns}
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=a["glb"])
    raiz = bpy.context.scene.collection
    tri_import = 0
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o); continue
        tri_import += triangulos(o.data)
        if o.name not in propios:
            bpy.data.objects.remove(o); continue
        o.data.transform(o.matrix_world); o.matrix_world.identity()
        c = coleccion(otra_coleccion.get(o.name, propios[o.name].upper()), raiz)
        for c0 in list(o.users_collection):
            c0.objects.unlink(o)
        c.objects.link(o)
        o["gemelo_procedencia"] = propios[o.name]
    faltan = [n for n in propios if n not in bpy.data.objects]
    if faltan:
        raise SystemExit("faltan en el glb: " + ", ".join(faltan))
    informe = {"mundo": a["mundo"], "glb": os.path.basename(a["glb"]), "triangulos_importados_glb_entero": tri_import, "limpieza": {}}
    cfg = capas["limpieza"]
    if a["limpia"] and any(n in propios for n in cfg["objetos"]):
        cd = coleccion("DESCARTES", raiz)
        for n in cfg["objetos"]:
            if n not in propios:
                continue
            o = bpy.data.objects[n]; antes = triangulos(o.data)
            idx = grumos(o, cfg); d = aparta(o, idx, cd)
            informe["limpieza"][n] = {"caras_apartadas": len(idx), "triangulos_antes": antes, "triangulos_despues": triangulos(o.data),
                                      "objeto": d.name if d else None}
        cd.hide_render = True
        bpy.context.view_layer.layer_collection.children["DESCARTES"].exclude = True
    convertidos = []
    for o in bpy.data.objects:
        if o.type != "MESH" or o.get("gemelo_procedencia") == "auxiliar":
            continue
        for m in o.data.materials:
            if m and m.name.startswith("escaneo_") and not m.get("gemelo_unlit") and a_principled(m):
                convertidos.append(m.name)
    informe["materiales_convertidos_a_principled"] = convertidos
    visibles = [o for o in bpy.data.objects if o.type == "MESH" and not o.name.startswith("descartes_")]
    informe["recuento"] = recuento(visibles)
    bpy.ops.outliner.orphans_purge(do_recursive=True)
    for im in bpy.data.images:
        if im.packed_file is None and im.source == "FILE":
            im.pack()
    esc = bpy.context.scene
    esc["gemelo_mundo"] = a["mundo"]
    esc["gemelo_ejes"] = "Blender Z arriba; glb: x = x, y = z_blender, z = -y_blender"
    os.makedirs(os.path.dirname(os.path.abspath(a["salida"])), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(a["salida"]), compress=True)
    informe["segundos"] = round(time.time() - t0, 1)
    json.dump(informe, open(os.path.splitext(a["salida"])[0] + ".json", "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("SEPARA", json.dumps({k: v for k, v in informe.items() if k != "recuento"}, ensure_ascii=False))
    print("RECUENTO", json.dumps({k: v for k, v in informe["recuento"].items() if k != "objetos"}))


principal()
