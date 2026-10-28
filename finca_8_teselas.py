"""Exporta una finca a teselas de 256 m para el motor v2 del gemelo.

Uso:  python finca_8_teselas.py --finca cerro            (desde datos_cerro_embebido.json, los intermedios de hoy)
      python finca_8_teselas.py --finca hituelo          (desde hituelo_datos/: ver LEEME.md; pendiente de cablear con los datos finales)

Salida en salida/<finca>/ :
  indice.json            lo global (va en la página): extensión, parcelas, copas, NDVI, paisaje, mosaico, relieve grueso, índice de teselas
  t/<kx>_<ky>.json       relieve (Int16 cm, margen de 1 celda), copa (u8 dm), color del suelo (u8 RGB a 2 m con margen) y nube (Int16, barajada)
  t/<kx>_<ky>.jpg        ortofoto de la tesela
  embebido.json          indice + todas las teselas dentro (modo «un solo HTML»)

Convenciones (las mismas que el gemelo de hoy): x este, y norte, en metros relativos a centro_utm; alturas relativas a z0;
las celdas se muestrean en su centro; las filas de cada tesela van de SUR a NORTE (la fila 0 es el borde sur).
Una tesela (kx, ky) cubre en UTM [kx*256, kx*256+256) × [ky*256, ky*256+256)."""
import argparse, base64, io, json, math, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates

R = os.path.dirname(os.path.abspath(__file__))
TS = 256          # lado de la tesela (m)
RES = 1           # paso del relieve y de la copa (m)
N = TS // RES     # celdas por lado
RS = 2            # paso del color del suelo (m)
NS = TS // RS
ORTO_PX = 768     # píxeles por lado de la ortofoto de una tesela (0,33 m/px)

def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()
def deb64(s, dt): return np.frombuffer(base64.b64decode(s), dtype=dt)

def jpg_bytes(arr, q=80):
    b = io.BytesIO(); Image.fromarray(arr).save(b, "JPEG", quality=q, optimize=True); return b.getvalue()

def cerro():
    """Lee los intermedios de Cerro Velasco (el JSON embebido del gemelo de hoy) y los devuelve como rejillas UTM."""
    D = json.load(open(os.path.join(R, "datos_cerro_embebido.json"), encoding="utf-8"))
    cx, cy = D["centro_utm"]
    W, H = D["W"], D["H"]
    ux0 = cx + D["ext"][0]; uyN = cy + D["ext"][1]           # esquina NO de la ventana en UTM (enteros)
    assert ux0 == int(ux0) and uyN == int(uyN)
    ux0 = int(ux0); uyN = int(uyN)
    dtm = deb64(D["dtm"]["b64"], "<i2").reshape(H, W)         # fila 0 = norte
    chm = deb64(D["chm"]["b64"], "<i2").reshape(H, W)
    sw, sh = D["suelo"]["w"], D["suelo"]["h"]
    suelo = deb64(D["suelo"]["b64"], "u1").reshape(sh, sw, 3)
    ortoimg = np.asarray(Image.open(io.BytesIO(base64.b64decode(D["orto"]["jpg"].split(",", 1)[1]))).convert("RGB"))
    pts = deb64(D["puntos"]["b64"], "<i2").reshape(-1, 3)
    return dict(D=D, cx=cx, cy=cy, ux0=ux0, uyN=uyN, W=W, H=H, dtm=dtm, chm=chm, suelo=suelo, srs=D["suelo"]["res"], orto=ortoimg, pts=pts)

def construye(F, salida):
    D = F["D"]; cx, cy, ux0, uyN, W, H = F["cx"], F["cy"], F["ux0"], F["uyN"], F["W"], F["H"]
    os.makedirs(os.path.join(salida, "t"), exist_ok=True)
    # teselas que tocan la ventana
    kx0, kx1 = ux0 // TS, (ux0 + W - 1) // TS
    ky0, ky1 = (uyN - H) // TS, (uyN - 1) // TS
    # nube: asignada a su tesela (coordenadas UTM absolutas en cm)
    P = F["pts"].astype(np.int64)
    pxu = P[:, 0] / 100.0 + cx; pyu = P[:, 1] / 100.0 + cy
    pkx = np.floor(pxu / TS).astype(int); pky = np.floor(pyu / TS).astype(int)
    rng = np.random.RandomState(12345)
    teselas, carga = {}, {}
    ow, oh = F["orto"].shape[1], F["orto"].shape[0]
    for ky in range(ky0, ky1 + 1):
        for kx in range(kx0, kx1 + 1):
            key = "%d_%d" % (kx, ky)
            # celdas del relieve con margen de 1: u, v de -1 a N (columna u -> X = kx*TS + u; fila v -> Y = ky*TS + v)
            u = np.arange(-1, N + 1); X = kx * TS + u * RES; Y = ky * TS + u * RES   # (X, Y de la celda; su centro está +0,5)
            jj, ii = np.meshgrid(Y, X, indexing="ij")                                # jj: fila (sur->norte), ii: columna
            si = ii - ux0; sj = (uyN - 1) - jj                                       # índice en la rejilla fuente (fila 0 = norte)
            vi = (si >= 0) & (si < W) & (sj >= 0) & (sj < H)
            sic = np.clip(si, 0, W - 1); sjc = np.clip(sj, 0, H - 1)
            dtm = F["dtm"][sjc, sic].astype("<i2")
            chm = np.clip(np.rint(F["chm"][sjc, sic] / 10.0), 0, 255).astype("u1")[1:-1, 1:-1]
            # rectángulo válido (en metros relativos al centro) = celdas interiores con dato
            vin = vi[1:-1, 1:-1]
            if not vin.any(): continue
            vcols = np.where(vin.any(axis=0))[0]; vrows = np.where(vin.any(axis=1))[0]
            vx0 = kx * TS + vcols.min() * RES - cx; vx1 = kx * TS + (vcols.max() + 1) * RES - cx
            vy0 = ky * TS + vrows.min() * RES - cy; vy1 = ky * TS + (vrows.max() + 1) * RES - cy
            # color del suelo a 2 m con margen: se remuestrea (bilinear) la rejilla fuente de 2 m
            us = np.arange(-1, NS + 1); Xc = kx * TS + (us + 0.5) * RS; Yc = ky * TS + (us + 0.5) * RS
            gy, gx = np.meshgrid(Yc, Xc, indexing="ij")
            fx = (gx - ux0) / F["srs"] - 0.5; fy = (uyN - gy) / F["srs"] - 0.5
            suelo = np.zeros(gx.shape + (3,), "u1")
            for c in range(3):
                suelo[..., c] = np.clip(np.rint(map_coordinates(F["suelo"][..., c].astype("f4"), [fy, fx], order=1, mode="nearest")), 0, 255)
            # ortofoto de la tesela (píxeles a 0,33 m; el borde fuera de la ventana repite el último píxel)
            pxs = (np.arange(ORTO_PX) + 0.5) * TS / ORTO_PX
            gxo = kx * TS + pxs; gyo = ky * TS + pxs                                  # columnas (E) y filas (S->N)
            fxo = (gxo[None, :] - ux0) / W * ow - 0.5; fyo = (uyN - gyo[::-1, None]) / H * oh - 0.5   # fila 0 de la imagen = norte
            fxo, fyo = np.broadcast_arrays(fxo, fyo)
            oimg = np.zeros((ORTO_PX, ORTO_PX, 3), "u1")
            for c in range(3):
                oimg[..., c] = np.clip(np.rint(map_coordinates(F["orto"][..., c].astype("f4"), [fyo, fxo], order=1, mode="nearest")), 0, 255)
            # nube de la tesela: x, y en cm relativos a la esquina SO de la tesela; z en cm relativos a z0; orden barajado
            m = (pkx == kx) & (pky == ky)
            pt = np.stack([np.rint((pxu[m] - kx * TS) * 100), np.rint((pyu[m] - ky * TS) * 100), P[m, 2]], axis=1).astype("<i2")
            rng.shuffle(pt)
            carga[key] = dict(dtm=b64(dtm), chm=b64(chm), suelo=b64(suelo), pts=b64(pt), np=int(len(pt)))
            jpg = jpg_bytes(oimg)
            teselas[key] = dict(kx=kx, ky=ky, v=[round(vx0, 2), round(vy0, 2), round(vx1, 2), round(vy1, 2)], np=int(len(pt)))
            json.dump(carga[key], open(os.path.join(salida, "t", key + ".json"), "w"))
            open(os.path.join(salida, "t", key + ".jpg"), "wb").write(jpg)
            carga[key]["orto"] = "data:image/jpeg;base64," + base64.b64encode(jpg).decode()
            print(key, "pts", len(pt), "válida", teselas[key]["v"], "json %.0f KB  jpg %.0f KB" % (os.path.getsize(os.path.join(salida, "t", key + ".json")) / 1024, len(jpg) / 1024))
    # relieve grueso (8 m, media por bloque) y mosaico 1 m/px para el minimapa y la vista de lejos
    G = 8; gw, gh = W // G, H // G
    dg = F["dtm"][:gh * G, :gw * G].astype("f4").reshape(gh, G, gw, G).mean(axis=(1, 3))
    grueso = dict(x0=D["ext"][0], yN=D["ext"][1], res=G, w=int(gw), h=int(gh), b64=b64(np.rint(dg).astype("<i2")))
    mos = Image.fromarray(F["orto"]).resize((W, H), Image.LANCZOS)
    b = io.BytesIO(); mos.save(b, "JPEG", quality=78, optimize=True)
    mosaico = dict(jpg="data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode(), w=W, h=H, x0=D["ext"][0], yN=D["ext"][1], res=1.0)
    # lo global: todo menos las rejillas y la nube, que ahora van en las teselas
    I = {k: v for k, v in D.items() if k not in ("dtm", "chm", "suelo", "orto", "puntos")}
    I.update(v=2, ts=TS, res=RES, srs=RS, orto_px=ORTO_PX, teselas=teselas, grueso=grueso, mosaico=mosaico, finca_id="cerro")
    json.dump(I, open(os.path.join(salida, "indice.json"), "w"))
    E = dict(I); E["t"] = carga
    json.dump(E, open(os.path.join(salida, "embebido.json"), "w"))
    print("teselas:", len(teselas), "| indice %.0f KB | embebido %.1f MB" % (os.path.getsize(os.path.join(salida, "indice.json")) / 1024, os.path.getsize(os.path.join(salida, "embebido.json")) / 1048576))


# ---------------------------------------------------------------------------------------------------------------------------
# Banco de pruebas de presupuesto: Cerro Velasco replicado nx × ny veces en el espacio (mismos datos desplazados un número entero de teselas) para comprobar
# que el coste de dibujo, la memoria y la carga NO crecen con la superficie. Solo modo ficheros. Uso: python finca_8_teselas.py --replica 3x3
def replica(nx, ny, origen="cerro"):
    import shutil
    src = os.path.join(R, "salida", origen); dst = os.path.join(R, "salida", "%s_x%d" % (origen, nx * ny))
    os.makedirs(os.path.join(dst, "t"), exist_ok=True)
    I = json.load(open(os.path.join(src, "indice.json"), encoding="utf-8"))
    kxs = [d["kx"] for d in I["teselas"].values()]; kys = [d["ky"] for d in I["teselas"].values()]
    ax = max(kxs) - min(kxs) + 1; ay = max(kys) - min(kys) + 1; DX, DY = ax * TS, ay * TS       # desplazamiento de una réplica a la siguiente (m)
    ext = I["ext"]; cx0, cy0 = I["centro_utm"]
    O = dict(I); O["teselas"] = {}; O["parcelas"] = []; O["copas"] = []; O["marcados"] = []; O["ot"] = json.loads(json.dumps(I["ot"])); O["ot"]["parcelas"] = {}
    npar = len(I["parcelas"]); ncop = len(I["copas"]); k = 0
    for b in range(ny):
        for a in range(nx):
            for key, d in I["teselas"].items():
                nk = "%d_%d" % (d["kx"] + a * ax, d["ky"] + b * ay)
                v = d["v"]; O["teselas"][nk] = dict(kx=d["kx"] + a * ax, ky=d["ky"] + b * ay, v=[v[0] + a * DX, v[1] + b * DY, v[2] + a * DX, v[3] + b * DY], np=d["np"])
                for ext_ in (".json", ".jpg"): shutil.copy(os.path.join(src, "t", key + ext_), os.path.join(dst, "t", nk + ext_))
            for pr in I["parcelas"]:
                q = json.loads(json.dumps(pr)); q["id"] = "%s#%d_%d" % (pr["id"], a, b); q["nombre"] = pr["nombre"] + " (%d,%d)" % (a, b)
                q["linde"] = [[x + a * DX, y + b * DY] for x, y in pr["linde"]]; q["centro"] = [pr["centro"][0] + a * DX, pr["centro"][1] + b * DY]; O["parcelas"].append(q)
                if pr["id"] in I["ot"]["parcelas"]: O["ot"]["parcelas"][q["id"]] = I["ot"]["parcelas"][pr["id"]]
            for c in I["copas"]:
                O["copas"].append([c[0] + a * DX, c[1] + b * DY, c[2], c[3], (c[4] + k * npar) if c[4] > 0 else 0])
            for m in I["marcados"]:
                O["marcados"].append([m[0] + a * DX, m[1] + b * DY, (m[2] + k * ncop) if m[2] >= 0 else -1, m[3] + k * npar])
            k += 1
    # caja, relieve grueso y mosaico: las réplicas se pegan en su sitio (8 m y 1 m caben exactos en un desplazamiento de teselas enteras)
    O["ext"] = [ext[0], ext[1] + (ny - 1) * DY, ext[2] + (nx - 1) * DX, ext[3]]
    g = I["grueso"]; gw, gh = g["w"], g["h"]; GW, GH = int(math.ceil((O["ext"][2] - O["ext"][0]) / g["res"])), int(math.ceil((O["ext"][1] - O["ext"][3]) / g["res"]))
    base = deb64(g["b64"], "<i2").reshape(gh, gw); big = np.zeros((GH, GW), "<i2")
    for b in range(ny):
        for a in range(nx):
            r0 = (ny - 1 - b) * DY // g["res"]; c0 = a * DX // g["res"]; big[int(r0):int(r0) + gh, int(c0):int(c0) + gw] = base
    O["grueso"] = dict(x0=O["ext"][0], yN=O["ext"][1], res=g["res"], w=GW, h=GH, b64=b64(big))
    m0 = Image.open(io.BytesIO(base64.b64decode(I["mosaico"]["jpg"].split(",", 1)[1]))).convert("RGB"); mw, mh = m0.size
    MW, MH = int(O["ext"][2] - O["ext"][0]), int(O["ext"][1] - O["ext"][3]); mos = Image.new("RGB", (MW, MH), (140, 134, 104))
    for b in range(ny):
        for a in range(nx): mos.paste(m0, (a * DX, (ny - 1 - b) * DY))
    bb = io.BytesIO(); mos.save(bb, "JPEG", quality=70); O["mosaico"] = dict(jpg="data:image/jpeg;base64," + base64.b64encode(bb.getvalue()).decode(), w=MW, h=MH, x0=O["ext"][0], yN=O["ext"][1], res=1.0)
    # NDVI y suelo-NDVI: rejilla de ~10 m; cada réplica en su sitio redondeado a celda, el resto sin dato
    nd = I["ndvi"]; w, h = nd["w"], nd["h"]; nf = len(nd["fechas"]); cel = (ext[2] - ext[0]) / w
    W2, H2 = int(math.ceil((O["ext"][2] - O["ext"][0]) / cel)), int(math.ceil((O["ext"][1] - O["ext"][3]) / (I["ext"][1] - I["ext"][3]) * h))
    q = deb64(nd["b64"], "<i2").reshape(nf, h, w); q2 = np.full((nf, H2, W2), -32768, "<i2")
    sn = I["suelo_ndvi"]; f = deb64(sn["f"], "<i2").reshape(h, w); f2 = np.zeros((H2, W2), "<i2")
    for b in range(ny):
        for a in range(nx):
            r0 = int(round((ny - 1 - b) * DY / ((ext[1] - ext[3]) / h))); c0 = int(round(a * DX / cel))
            q2[:, r0:r0 + h, c0:c0 + w] = q; f2[r0:r0 + h, c0:c0 + w] = f
    O["ndvi"] = dict(nd); O["ndvi"].update(w=W2, h=H2, b64=b64(q2)); O["suelo_ndvi"] = dict(sn); O["suelo_ndvi"]["f"] = b64(f2)
    json.dump(O, open(os.path.join(dst, "indice.json"), "w"))
    print("réplica %dx%d: %d teselas, %d olivos (copas), caja %s m, ext ndvi %dx%d" % (nx, ny, len(O["teselas"]), len(O["copas"]), O["ext"], W2, H2))

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--finca", choices=["cerro", "hituelo"]); ap.add_argument("--replica", help="NxM: Cerro Velasco replicado en el espacio (banco de pruebas de presupuesto)"); a = ap.parse_args()
    if a.replica:
        n, m = a.replica.split("x"); replica(int(n), int(m))
    elif a.finca == "cerro":
        construye(cerro(), os.path.join(R, "salida", "cerro"))
    elif a.finca == "hituelo":
        sys.path.insert(0, R); from hituelo_conv import hituelo
        hituelo()
    else:
        sys.exit("falta --finca cerro|hituelo (o --replica 3x3)")
