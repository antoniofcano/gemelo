# Recuento de un mundo interior frente al presupuesto del contrato mundo-interior (triángulos, llamadas, materiales,
# texturas y MB en GPU). Lo comparten separa.py y cuenta.py: una sola manera de contar.
import bpy


def triangulos(me):
    return sum(len(p.vertices) - 2 for p in me.polygons)


def recuento(objetos):
    """Triángulos, llamadas (primitivas = objeto × material usado), materiales, texturas y MB en GPU (RGBA8 con mips)"""
    r = {"objetos": {}}; tri = llam = 0; mats = set(); imgs = set()
    for o in objetos:
        t = triangulos(o.data)
        usados = sorted({o.data.materials[p.material_index].name for p in o.data.polygons}) if len(o.data.polygons) else []
        r["objetos"][o.name] = {"procedencia": o.get("gemelo_procedencia"), "triangulos": t, "materiales": usados}
        tri += t; llam += len(usados); mats |= set(usados)
    for n in mats:
        m = bpy.data.materials[n]
        for nd in (m.node_tree.nodes if m.node_tree else []):
            if nd.bl_idname == "ShaderNodeTexImage" and nd.image:
                imgs.add(nd.image.name)
    mb = sum(bpy.data.images[i].size[0] * bpy.data.images[i].size[1] * 4 * 4 / 3 for i in imgs) / 2 ** 20
    r.update({"triangulos": tri, "llamadas": llam, "materiales": len(mats), "texturas": len(imgs),
              "lado_max_px": max([max(bpy.data.images[i].size) for i in imgs] or [0]), "mb_texturas_gpu": round(mb, 1)})
    return r
