"""Exporta una finca a teselas de 256 m para el motor v2 del gemelo.

Uso:  python finca_8_teselas.py --finca hituelo          (desde hituelo_datos/: ver LEEME.md; lo hace hituelo_conv.py)

construye() es el exportador genérico de unas rejillas UTM ya hechas (relieve, copa, suelo, ortofoto y nube en memoria) a teselas; hoy solo
lo ejercita la prueba sintética (pruebas/exportadores_sinteticos.py). Hituelo, el único mundo (decisión 22; la otra finca salió con la 229),
se exporta con hituelo_conv.py, que reutiliza de aquí las constantes y b64/jpg_bytes.

Salida en salida/<finca>/ :
  indice.json            lo global (va en la página): extensión, parcelas, copas, NDVI, paisaje, mosaico, relieve grueso, índice de teselas
  t/<kx>_<ky>.json       relieve (Int16 cm, margen de 1 celda), copa (u8 dm), color del suelo (u8 RGB a 2 m con margen) y nube (Int16, barajada)
  t/<kx>_<ky>.jpg        ortofoto de la tesela

Convenciones (las mismas que el gemelo de hoy): x este, y norte, en metros relativos a centro_utm; alturas relativas a z0;
las celdas se muestrean en su centro; las filas de cada tesela van de SUR a NORTE (la fila 0 es el borde sur).
Una tesela (kx, ky) cubre en UTM [kx*256, kx*256+256) × [ky*256, ky*256+256)."""
import argparse, base64, io, json, math, os, sys
import numpy as np
from PIL import Image
from scipy.ndimage import map_coordinates
from ids_copas import columnas   # copas_id (censo de OlivarTrack o provisional por posición) y copas_tipo: ADR-0012
from semillas_copas import asigna as asigna_semillas   # copas_semilla (ADR-0017, decisión 50): heredada del índice anterior o = copas_id

R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # raíz del repo: salida/ y los intermedios se leen y escriben desde ahí
TS = 256          # lado de la tesela (m)
RES = 1           # paso del relieve y de la copa (m)
N = TS // RES     # celdas por lado
RS = 2            # paso del color del suelo (m)
NS = TS // RS
# L4-10: los campos del índice son los del contrato (contratos/indice.schema.json): construye() copia del intermedio solo esos, no «todo menos cinco»
CAMPOS_INDICE = frozenset(json.load(open(os.path.join(R, "contratos", "indice.schema.json"), encoding="utf-8"))["properties"])
ORTO_PX = 768     # píxeles por lado de la ortofoto de una tesela (0,33 m/px)

def b64(a): return base64.b64encode(np.ascontiguousarray(a).tobytes()).decode()

def jpg_bytes(arr, q=80):
    b = io.BytesIO(); Image.fromarray(arr).save(b, "JPEG", quality=q, optimize=True); return b.getvalue()

def construye(F, salida, anterior=None):
    """F: rejillas UTM y el intermedio D (ver pruebas/exportadores_sinteticos.py), más finca_id y finca (el nombre que va en la cabecera)."""
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
            teselas[key] = dict(kx=kx, ky=ky, v=[round(float(vx0), 2), round(float(vy0), 2), round(float(vx1), 2), round(float(vy1), 2)], np=int(len(pt)))
            json.dump(carga[key], open(os.path.join(salida, "t", key + ".json"), "w"))
            open(os.path.join(salida, "t", key + ".jpg"), "wb").write(jpg)
            print(key, "pts", len(pt), "válida", teselas[key]["v"], "json %.0f KB  jpg %.0f KB" % (os.path.getsize(os.path.join(salida, "t", key + ".json")) / 1024, len(jpg) / 1024))
    # relieve grueso (8 m, media por bloque) y mosaico 1 m/px para el minimapa y la vista de lejos
    G = 8; gw, gh = W // G, H // G
    dg = F["dtm"][:gh * G, :gw * G].astype("f4").reshape(gh, G, gw, G).mean(axis=(1, 3))
    grueso = dict(x0=D["ext"][0], yN=D["ext"][1], res=G, w=int(gw), h=int(gh), b64=b64(np.rint(dg).astype("<i2")))
    mos = Image.fromarray(F["orto"]).resize((W, H), Image.LANCZOS)
    b = io.BytesIO(); mos.save(b, "JPEG", quality=78, optimize=True)
    mosaico = dict(jpg="data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode(), w=W, h=H, x0=D["ext"][0], yN=D["ext"][1], res=1.0)
    # lo global: todo menos las rejillas y la nube, que ahora van en las teselas
    # (L4-10: lista blanca, la del contrato; lo demás del intermedio se queda fuera y se avisa, por si fuera algo de la explotación)
    I = {k: v for k, v in D.items() if k in CAMPOS_INDICE}
    fuera = sorted(set(D) - CAMPOS_INDICE - {"dtm", "chm", "suelo", "orto", "puntos", "marcados_id"})
    if fuera: print("aviso: claves del intermedio fuera del contrato del índice, no se publican:", ", ".join(fuera))
    I.update(v=2, ts=TS, res=RES, srs=RS, orto_px=ORTO_PX, teselas=teselas, grueso=grueso, mosaico=mosaico, finca_id=F["finca_id"])
    # columnas paralelas de copas (CONTRATOS §1.1). Las marcas pueden no traer id del censo:
    # si el intermedio trae `marcados_id` (paralelo a marcados; None = sin id), la copa emparejada toma ese id; si no, todas provisionales.
    mid = D.get("marcados_id") or []
    censo = {m[2]: mid[i] for i, m in enumerate(D["marcados"]) if i < len(mid) and mid[i] is not None and m[2] >= 0}
    col, avisos = columnas(I["copas"], (cx, cy), censo); I.update(col); I.pop("marcados_id", None)
    for a_ in avisos: print("aviso:", a_)
    # textos de la cabecera de la página (L3-04): salen de los datos, no de la plantilla. Las ha son las declaradas (decisión 221: suma de parcelas[].ha);
    # los olivos, los detectados (decisión 220: len(copas)); el desfase, el rango de las parcelas. Hituelo escribe los suyos en hituelo_conv.py.
    hs = [math.hypot(*p["desfase"]) for p in I["parcelas"] if p.get("desfase")]
    ds = (("entre %.1f y %.1f m al este" % (min(hs), max(hs))) if round(min(hs), 1) != round(max(hs), 1) else ("unos %.1f m al este" % min(hs))).replace(".", ",") if hs else None
    I["textos"] = dict(sin_historia=False, finca=F["finca"], fincas=1, parcelas=len(I["parcelas"]), ha=round(sum(p["ha"] for p in I["parcelas"]), 1), olivos=len(I["copas"]))
    if ds: I["textos"]["desfase_txt"] = ds
    asigna_semillas(I, salida, anterior)   # antes de escribir: el indice.json que haya en salida es la exportación anterior
    json.dump(I, open(os.path.join(salida, "indice.json"), "w"))
    print("teselas:", len(teselas), "| indice %.0f KB" % (os.path.getsize(os.path.join(salida, "indice.json")) / 1024))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--finca", choices=["hituelo"])
    ap.add_argument("--salida", help="carpeta de salida (por defecto salida/<finca> en la raíz del repo)")
    ap.add_argument("--anterior", help="indice.json de la exportación anterior, del que se heredan las semillas (copas_semilla); por defecto $GEMELO_INDICE_ANTERIOR o el indice.json que ya haya en la salida")
    a = ap.parse_args()
    if a.finca == "hituelo":
        sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from hituelo_conv import hituelo
        hituelo(a.salida, a.anterior)
    else:
        sys.exit("falta --finca hituelo")
