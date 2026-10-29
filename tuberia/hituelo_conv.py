"""Hituelo: de los .npz de LiDAR (agente 1) y la ortofoto/NDVI/suelo/OlivarTrack (agente 2) a las teselas del motor v2.
Lo llama `python finca_8_teselas.py --finca hituelo`. Lee de $GEMELO_HITUELO (por defecto «hituelo_datos») y escribe en salida/hituelo/ (indice.json y t/<kx>_<ky>.json|jpg).

Convenciones del origen (LEEME.md de lidar/): nodos de 1 m con la fila 0 al sur; chm a 0,5 m en cm; nube en pasos de 5 cm con z0 por tesela; UTM 30N y cotas absolutas.
Convenciones del motor: celdas de 1 m muestreadas en su centro, con una celda de margen; relativo a centro_utm y a z0 de la finca."""
import base64, io, json, math, os
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from finca_8_teselas import R, TS, RES, RS, b64, jpg_bytes
from ids_copas import columnas, empareja, id_de_marca   # copas_id (censo de OlivarTrack o provisional por posición) y copas_tipo: ADR-0012

HD = __import__("os").environ.get("GEMELO_HITUELO", "hituelo_datos")
PARC = __import__("os").environ.get("GEMELO_PARCELAS", "hituelo_parcelas_utm.json")


def hituelo(salida=None):
    L = os.path.join(HD, "lidar"); IM = os.path.join(HD, "imagen")
    salida = salida or os.path.join(R, "salida", "hituelo"); os.makedirs(os.path.join(salida, "t"), exist_ok=True)
    idx = json.load(open(os.path.join(L, "indice.json"), encoding="utf-8"))["teselas"]
    claves = sorted((k for k in idx if os.path.exists(os.path.join(L, "tesela", "%s.npz" % k))), key=lambda k: tuple(map(int, k.split("_"))))
    kxs = [int(k.split("_")[0]) for k in claves]; kys = [int(k.split("_")[1]) for k in claves]
    kx0, kx1, ky0, ky1 = min(kxs), max(kxs), min(kys), max(kys); NKX, NKY = kx1 - kx0 + 1, ky1 - ky0 + 1
    nd = json.load(open(os.path.join(IM, "ndvi", "ndvi_hituelo.json"), encoding="utf-8")); bb = nd["bbox25830"]                  # [x0, y0, x1, y1] UTM
    cx = int(round((bb[0] + bb[2]) / 2)); cy = int(round((bb[1] + bb[3]) / 2))
    ext = [bb[0] - cx, bb[3] - cy, bb[2] - cx, bb[1] - cy]                                                         # [xmin, ymax, xmax, ymin] relativo al centro

    # ---- nodos de suelo de todas las teselas en una sola rejilla (con 4 m de margen) para dar a cada tesela su celda de margen
    M = 4; Gz = np.full((NKY * TS + 1 + 2 * M, NKX * TS + 1 + 2 * M), np.nan, "f4"); zmin = 1e9; datos = {}
    for k in claves:
        z = np.load(os.path.join(L, "tesela", "%s.npz" % k)); kx, ky = map(int, k.split("_")); datos[k] = z
        j0 = (ky - ky0) * TS + M; i0 = (kx - kx0) * TS + M; Gz[j0:j0 + 257, i0:i0 + 257] = z["suelo"]; zmin = min(zmin, float(z["suelo"].min()))
    z0 = float(math.floor(zmin) - 2)
    ok = np.isfinite(Gz); ii = ndi.distance_transform_edt(~ok, return_distances=False, return_indices=True); Gz = Gz[ii[0], ii[1]]
    celdas = (Gz[:-1, :-1] + Gz[:-1, 1:] + Gz[1:, :-1] + Gz[1:, 1:]) / 4.0                                         # cota en el centro de cada celda de 1 m (filas sur->norte)

    # ---- parcelas, fincas y árboles
    P = json.load(open(PARC, encoding="utf-8"))["parcelas"]
    def arr(s): return s.replace("\ufffd", "\u00ed") if s else s
    fincas = []; parcelas = []
    for k, p in enumerate(P):
        fn = arr(p["finca"]); fi = next((i for i, f in enumerate(fincas) if f["nombre"] == fn), None)
        if fi is None: fincas.append(dict(nombre=fn, parcelas=[], ha=0.0, olivos=0)); fi = len(fincas) - 1
        u = np.array(p["utm"], float); linde = [[round(float(x) - cx, 2), round(float(y) - cy, 2)] for x, y in u]
        parcelas.append(dict(id=p["id"], nombre=arr(p["nombre"]), ha=p["ha"], linde=linde, centro=[round(float(u[:, 0].mean()) - cx, 2), round(float(u[:, 1].mean()) - cy, 2)], desfase=[0, 0], suelo=None, finca=fi,
                             decl=p["olivos"] or 0, pasto="pasto" in p["nombre"].lower()))
        fincas[fi]["parcelas"].append(k); fincas[fi]["ha"] += p["ha"]; fincas[fi]["olivos"] += p["olivos"] or 0
    for f in fincas: f["ha"] = round(f["ha"], 1)
    sg = json.load(open(os.path.join(IM, "suelo_hituelo.json"), encoding="utf-8"))["parcelas"]
    for k, p in enumerate(P):
        e = next((v for key, v in sg.items() if key.endswith("__" + p["id"])), None)
        if e: parcelas[k]["suelo"] = [dict(p=r["prof"], a=r["arena"], l=r["limo"], c=r["arcilla"], ph=r["ph"], mo=r["mo"], cec=r["cic"], dens=r["dens"], pedr=r["pedr"]) for r in e["perfil"]]
    A = json.load(open(os.path.join(L, "arboles.json"), encoding="utf-8"))["arboles"]
    copas = [[round(a["x"] - cx, 2), round(a["y"] - cy, 2), a["h"], a["r8"], a["parcela"] + 1] for a in A if a["olivo"]]
    O = json.load(open(os.path.join(IM, "ot_hituelo.json"), encoding="utf-8"))
    pid2k = {p["id"]: k for k, p in enumerate(P)}
    ot = dict(fuente="instantanea", fecha_consulta=O.get("fecha_consulta"), pases_finca=0, entregas_finca=0, analiticas_finca=0, parcelas={}); marcas = []
    for fid, f in O["fincas"].items():
        for pid, pp in f["parcelas"].items():
            k = pid2k.get(pp["id"]); ot["parcelas"][pp["id"]] = dict(tareas=[], fenologia=[])
            if k is None: continue
            for o in pp.get("olivos") or []:
                x, y, cid = id_de_marca(o); marcas.append((x - cx, y - cy, cid, k))
        for t in f["trabajos"]:
            if t["parcelaId"] in ot["parcelas"]:
                ot["parcelas"][t["parcelaId"]]["tareas"].append(dict(tipo=t["tipo"], titulo=t["titulo"], fecha=t["fecha"], estado=t["estado"], avance=t["avance"], fuente=t.get("avanceFuente"), andados=t.get("olivosAndados"), objetivo=t.get("objetivoOlivos")))
        for fe in f["fenologia"]:
            if fe["parcelaId"] in ot["parcelas"]: ot["parcelas"][fe["parcelaId"]]["fenologia"].append(dict(fecha=fe["fecha"], bbch=fe["bbch"]))
    # marca de OlivarTrack ↔ copa LiDAR: corrige el desfase de la ortofoto (~1,5 m) y empareja uno a uno hasta 4 m (ids_copas.empareja).
    # La copa emparejada con una marca que trae id del censo toma ese id; las demás, uno provisional por posición (>= 2^31).
    par, desfase = empareja([(m[0], m[1]) for m in marcas], copas)
    marcados = [[round(m[0], 2), round(m[1], 2), par[i], m[3]] for i, m in enumerate(marcas)]
    censo = {par[i]: m[2] for i, m in enumerate(marcas) if par[i] >= 0 and m[2] is not None}

    # ---- teselas
    teselas, carga = {}, {}
    for k in claves:
        kx, ky = map(int, k.split("_")); z = datos[k]
        jb = (ky - ky0) * TS + M; ib = (kx - kx0) * TS + M
        dtm = np.rint((celdas[jb - 1:jb + TS + 1, ib - 1:ib + TS + 1] - z0) * 100).astype("<i2")                    # 258×258: celdas -1..256
        chm = z["chm"].astype(np.float32)                                                                          # 513×513 a 0,5 m (cm), nodos
        c1 = np.maximum.reduce([chm[0:512:2, 0:512:2], chm[0:512:2, 1:512:2], chm[1:512:2, 0:512:2], chm[1:512:2, 1:512:2]])   # 256×256 a 1 m (máx. de los 4 nodos de la celda)
        chm_dm = np.clip(np.rint(c1 / 10.0), 0, 255).astype("u1")
        ofile = os.path.join(IM, "ort", "%s.jpg" % k)
        if os.path.exists(ofile): oim = np.asarray(Image.open(ofile).convert("RGB")); jpgb = open(ofile, "rb").read()
        else: oim = np.full((512, 512, 3), 128, "u1"); jpgb = jpg_bytes(oim)
        # color del suelo a 2 m: la ortofoto sin la copa (mismo método que en Cerro Velasco), con una celda de margen
        s2 = oim.reshape(128, 4, 128, 4, 3).mean(axis=(1, 3))[::-1]                                                 # 128×128, filas sur->norte
        ch2 = np.maximum.reduce([c1[0:256:2, 0:256:2], c1[0:256:2, 1:256:2], c1[1:256:2, 0:256:2], c1[1:256:2, 1:256:2]]) / 100.0
        mask = ndi.binary_dilation(ch2 > 0.4, iterations=2)
        s2 = ndi.uniform_filter(s2, size=(3, 3, 1))
        if mask.any() and not mask.all():
            i2 = ndi.distance_transform_edt(mask, return_distances=False, return_indices=True); sf = s2[i2[0], i2[1]]
        else: sf = s2
        sf = ndi.uniform_filter(sf, size=(3, 3, 1)); lum = sf.mean(axis=2, keepdims=True); med = np.median(lum[~mask]) if (~mask).any() else lum.mean()
        sf = np.clip(sf * np.clip(0.85 * med / np.maximum(lum, 1), 1.0, 1.6), 0, 255).astype("u1"); suelo = np.pad(sf, ((1, 1), (1, 1), (0, 0)), mode="edge")
        # nube: x, y en cm sobre la esquina SO de la tesela; z en cm sobre z0 de la finca (el .npz ya viene barajado)
        pt = z["pts"].astype(np.int64); zz = float(z["z0"]) + pt[:, 2] * 0.05
        q = np.stack([pt[:, 0] * 5, pt[:, 1] * 5, np.rint((zz - z0) * 100)], axis=1).clip(-32768, 32767).astype("<i2")
        carga[k] = dict(dtm=b64(dtm), chm=b64(chm_dm), suelo=b64(suelo), pts=b64(q), np=int(len(q)))
        teselas[k] = dict(kx=kx, ky=ky, v=[kx * TS - cx, ky * TS - cy, kx * TS - cx + TS, ky * TS - cy + TS], np=int(len(q)))
        json.dump(carga[k], open(os.path.join(salida, "t", k + ".json"), "w")); open(os.path.join(salida, "t", k + ".jpg"), "wb").write(jpgb)

    # ---- relieve grueso (8 m) y mosaico de ortofoto (2 m/px) sobre la caja de teselas
    G8 = 8; zc = celdas[M:M + NKY * TS, M:M + NKX * TS]; gh, gw = NKY * TS // G8, NKX * TS // G8
    dg = zc[:gh * G8, :gw * G8].reshape(gh, G8, gw, G8).mean(axis=(1, 3))[::-1]
    grueso = dict(x0=kx0 * TS - cx, yN=(ky1 + 1) * TS - cy, res=G8, w=gw, h=gh, b64=b64(np.rint((dg - z0) * 100).astype("<i2")))
    MR = 2; mw, mh = NKX * TS // MR, NKY * TS // MR; mos = np.full((mh, mw, 3), 128, "u1")
    for k in claves:
        kx, ky = map(int, k.split("_")); ofile = os.path.join(IM, "ort", "%s.jpg" % k)
        if not os.path.exists(ofile): continue
        oim = np.asarray(Image.open(ofile).convert("RGB")).reshape(128, 4, 128, 4, 3).mean(axis=(1, 3)).astype("u1"); r0 = (ky1 - ky) * 128; c0 = (kx - kx0) * 128; mos[r0:r0 + 128, c0:c0 + 128] = oim
    bbm = io.BytesIO(); Image.fromarray(mos).save(bbm, "JPEG", quality=74, optimize=True)
    mosaico = dict(jpg="data:image/jpeg;base64," + base64.b64encode(bbm.getvalue()).decode(), w=mw, h=mh, x0=kx0 * TS - cx, yN=(ky1 + 1) * TS - cy, res=float(MR))

    # ---- NDVI (u8 tal cual, 48 fechas) y suelo-NDVI
    u8 = np.fromfile(os.path.join(IM, "ndvi", "ndvi_u8.bin"), dtype="u1")
    sn = json.load(open(os.path.join(IM, "ndvi", "suelo_ndvi_hituelo.json"), encoding="utf-8"))
    ndvi = dict(w=nd["w"], h=nd["h"], fechas=nd["fechas"], media=nd["media"], u8=base64.b64encode(u8.tobytes()).decode(), codigo=nd["codigo_u8"])
    suelo_ndvi = dict(w=sn["w"], h=sn["h"], a=sn["a"], b=sn["b"], f=sn["f"], fechas=sn["fechas"])

    # ---- paisaje (UTM y cotas absolutas -> relativas)
    PS = json.load(open(os.path.join(L, "paisaje.json"), encoding="utf-8"))
    def col_en(x, y):
        c = int((x - kx0 * TS) / MR); r = int(((ky1 + 1) * TS - y) / MR); c = max(0, min(mw - 1, c)); r = max(0, min(mh - 1, r)); return [int(v) for v in mos[r, c]]
    edif = [dict(x=round(e["x"] - cx, 2), y=round(e["y"] - cy, 2), largo=e["largo"], ancho=e["ancho"], ang=e["ang"], zBase=round(e["zBase"] - z0, 2), hAlero=e["hAlero"], hCumbrera=e["hCumbrera"], color=col_en(e["x"], e["y"])) for e in PS["edificios"]]
    def cadena(c):
        return dict(postes=[dict(x=round(p["x"] - cx, 2), y=round(p["y"] - cy, 2), zBase=round(p["zBase"] - z0, 2), zAlto=round(p["zAlto"] - z0, 2), puntos=p.get("puntos", 0)) for p in c["postes"]],
                    linea=[[round(q[0] - cx, 2), round(q[1] - cy, 2), round(q[2] - z0, 2)] for q in c["linea"]])
    cads = [cadena(c) for c in PS["tendido"]["cadenas"]]
    tend = dict(linea=cads[0]["linea"] if cads else [], postes=cads[0]["postes"] if cads else [], derivaciones=[dict(postes=c["postes"], linea=c["linea"], nota="Cadena de postes del LiDAR; el hilo es una catenaria estimada.") for c in cads[1:]])
    ejes = [[[round(q[0] - cx, 2), round(q[1] - cy, 2)] + list(q[2:]) for q in c["eje"]] for c in PS["cauces"]]
    arb = [dict(x=round(a["x"] - cx, 2), y=round(a["y"] - cy, 2), h=a["h"], r=a["r"], tipo=a["tipo"], zBase=round(a["zBase"] - z0, 2), enCauce=a.get("enCauce", False)) for a in PS["arboles"]]
    paisaje = dict(fuente=PS["fuente"], centro_utm=[cx, cy], z0=z0, edificios=edif, tendido=tend, arroyo=dict(ejes=ejes, nota=PS["honestidad"]["cauces"]), arboles=arb)

    I = dict(v=2, ts=TS, res=RES, srs=RS, orto_px=512, finca_id="hituelo", centro_utm=[cx, cy], z0=z0, zmax=0, ext=ext, cobertura_nube=1.0, parcelas=parcelas, fincas=fincas, copas=copas, marcados=marcados,
             ndvi=ndvi, suelo_ndvi=suelo_ndvi, ot=ot, avance={}, paisaje=paisaje, teselas=teselas, grueso=grueso, mosaico=mosaico,
             textos=dict(sin_historia=False, finca="Hituelo", fincas=len(fincas), parcelas=len(parcelas), ha=round(sum(p["ha"] for p in P), 1), olivos=len(copas)))
    col, avisos = columnas(copas, (cx, cy), censo); I.update(col)          # columnas paralelas de copas (CONTRATOS §1.1)
    for a in avisos: print("aviso:", a)
    print("ids: %d del censo, %d provisionales (sin marca con id); desfase marcas->copas (%.2f, %.2f) m, %d de %d marcas emparejadas"
          % (len(copas) - sum(1 for v in col["copas_id"] if v >= 2 ** 31), sum(1 for v in col["copas_id"] if v >= 2 ** 31), desfase[0], desfase[1], sum(1 for v in par if v >= 0), len(marcas)))
    json.dump(I, open(os.path.join(salida, "indice.json"), "w"))
    print("Hituelo: %d teselas (%d×%d), %d olivos, %d parcelas, %d fincas, %d marcas, centro %s, z0 %.0f, ext %s" % (len(teselas), NKX, NKY, len(copas), len(parcelas), len(fincas), len(marcados), (cx, cy), z0, ext))
    print("indice %.0f KB · teselas %.1f MB" % (os.path.getsize(os.path.join(salida, "indice.json")) / 1024, sum(os.path.getsize(os.path.join(salida, "t", f)) for f in os.listdir(os.path.join(salida, "t"))) / 1048576))
