# Recuento de un mundo interior frente al presupuesto del contrato mundo-interior (triángulos, llamadas, materiales,
# texturas y MB en GPU). Lo comparten separa.py y cuenta.py: una sola manera de contar. También las piezas sueltas de una
# malla (separa.py, para apartar grumos; inventario.py, para partir la maquinaria).
import bpy, bmesh


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


def trozos(me, soldadura):
    """Piezas sueltas de la malla `me` tras soldar sus vértices a `soldadura` m (las costuras de UV del glb parten la malla
    sin que la pieza esté partida): lista de listas de índices de cara de la malla original, sin modificarla"""
    bm = bmesh.new(); bm.from_mesh(me)
    capa = bm.faces.layers.int.new("gemelo_idx")
    for f in bm.faces:
        f[capa] = f.index
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=soldadura)
    vistos, salida = set(), []
    for f in bm.faces:
        if f in vistos:
            continue
        pila, caras = [f], []; vistos.add(f)
        while pila:
            g = pila.pop(); caras.append(g[capa])
            for e in g.edges:
                for h in e.link_faces:
                    if h not in vistos:
                        vistos.add(h); pila.append(h)
        salida.append(caras)
    bm.free()
    return salida


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
