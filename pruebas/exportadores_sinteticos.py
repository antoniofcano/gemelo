"""Ejecuta de verdad los exportadores de tuberia/ sobre entradas SINTÉTICAS mínimas (ningún dato real) para el guardián
pruebas/guardianes/exportadores.test.js. Deterministas (semilla fija).

  python pruebas/exportadores_sinteticos.py ids                 casos de tuberia/ids_copas.py (Python puro); escribe JSON por stdout
  python pruebas/exportadores_sinteticos.py exporta <carpeta>   (necesita numpy, scipy y pillow) en <carpeta>:
        datos/                 entradas de Hituelo inventadas: 1 tesela (1000_16000), 1 parcela, 13 copas (dos en la misma celda de 1 m) y 11 marcas de OlivarTrack (9 con id del censo, desplazadas ~1,5 m)
        hituelo_a/, hituelo_b/ dos exportaciones de los mismos datos
        hituelo_c/             los mismos árboles en otro orden en arboles.json
        cerro/                 construye() de finca_8_teselas.py (Cerro) con unas rejillas inventadas de 1 tesela"""
import json, os, random, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
TUB = os.path.join(os.path.dirname(AQUI), "tuberia")
sys.path.insert(0, TUB)
KX, KY, TS = 1000, 16000, 256
E0, N0 = KX * TS, KY * TS                              # esquina SO de la tesela sintética (UTM inventado)


def arboles():
    """13 copas en UTM absoluto: rejilla de 7 m y, a propósito, dos copas en la misma celda de 1 m; más un árbol que no es olivo"""
    rng = random.Random(4242); A = []
    for j in range(3):
        for i in range(4):
            A.append(dict(x=E0 + 60 + 7 * i + 0.25, y=N0 + 80 + 7 * j + 0.5, h=round(3 + rng.random(), 2), r8=[round(1.5 + rng.random(), 2) for _ in range(8)], parcela=0, olivo=True))
    A.append(dict(x=E0 + 60 + 0.75, y=N0 + 80 + 0.75, h=2.1, r8=[1.0] * 8, parcela=0, olivo=True))          # misma celda de 1 m que la primera
    A.append(dict(x=E0 + 120.0, y=N0 + 30.0, h=6.0, r8=[2.5] * 8, parcela=-1, olivo=False))
    return A


def marcas_censo():
    """marcas de OlivarTrack sintéticas, en UTM, desplazadas (-1,3, -0,8) m como las de la ortofoto: 8 con [E, N, id], 1 con {x, y, id},
    1 sin id, y una lejos de toda copa. Devuelve (marcas, esperado {índice del árbol: id del censo})"""
    A = arboles(); dx, dy = -1.3, -0.8; M = []; esp = {}
    for n in range(10):
        x, y = A[n]["x"] + dx, A[n]["y"] + dy
        if n < 8: M.append([x, y, 5000 + n]); esp[n] = 5000 + n
        elif n == 8: M.append(dict(x=x, y=y, id=5008)); esp[n] = 5008
        else: M.append([x, y])
    M.append([E0 + 200.0, N0 + 200.0, 9999])
    return M, esp


def casos_ids():
    from ids_copas import ids_copas, columnas, empareja, id_de_marca, LADO_E, PROV
    cx, cy = E0 + 128, N0 + 128
    copas = [[round(a["x"] - cx, 2), round(a["y"] - cy, 2), a["h"], a["r8"], a["parcela"] + 1] for a in arboles() if a["olivo"]]
    perm = list(range(len(copas))); random.Random(7).shuffle(perm)
    otra = [copas[k] for k in perm]
    # las mismas copas vistas con otro centro_utm (en Hituelo el centro sale de la caja del NDVI): los ids no deben cambiar
    cx2, cy2 = cx + 37, cy - 11
    movidas = [[round(c[0] + cx - cx2, 2), round(c[1] + cy - cy2, 2), c[2], c[3], c[4]] for c in copas]
    # muchas colisiones: 30 copas en la misma celda de 1 m, y una rejilla de 1 m alrededor ya ocupada
    choque = [[0.1 + 0.02 * k, 0.1, 3.0, [1.0] * 8, 1] for k in range(30)] + [[float(dx) + 0.5, float(dy) + 0.5, 3.0, [1.0] * 8, 1] for dx in range(-2, 3) for dy in range(-2, 3) if (dx, dy) != (0, 0)]
    try: ids_copas([[0.0, 0.0, 1, [1] * 8, 1], [LADO_E + 5.0, 0.0, 1, [1] * 8, 1]], (cx, cy)); grande = "no falló"
    except ValueError as e: grande = str(e)
    # censo: emparejamiento con desfase de ~1,5 m; la copa emparejada toma el id del censo
    M, esp = marcas_censo(); mk = [id_de_marca(o) for o in M]
    par, desfase = empareja([(x - cx, y - cy) for x, y, _ in mk], copas)
    censo = {par[i]: m[2] for i, m in enumerate(mk) if par[i] >= 0 and m[2] is not None}
    col_censo, avisos_censo = columnas(copas, (cx, cy), censo)
    # el mismo censo con las copas en otro orden
    inv = {k: i for i, k in enumerate(perm)}
    par_p, _ = empareja([(x - cx, y - cy) for x, y, _ in mk], otra)
    col_censo_perm, _ = columnas(otra, (cx, cy), {par_p[i]: m[2] for i, m in enumerate(mk) if par_p[i] >= 0 and m[2] is not None})
    _, avisos_malos = columnas(copas[:3], (cx, cy), {0: 7, 1: 7, 2: "abc"})
    out = dict(n=len(copas), prov=PROV, ids=ids_copas(copas, (cx, cy))[0], ids_repetido=ids_copas(copas, (cx, cy))[0], perm=perm, ids_perm=ids_copas(otra, (cx, cy))[0],
               ids_otro_centro=ids_copas(movidas, (cx2, cy2))[0], columnas=columnas(copas, (cx, cy))[0], choque_n=len(choque), choque_ids=ids_copas(choque, (cx, cy))[0],
               vacio=columnas([], (cx, cy))[0], finca_grande=grande,
               par=par, desfase=desfase, esperado={str(k): v for k, v in esp.items()}, ids_censo=col_censo["copas_id"], avisos_censo=avisos_censo,
               ids_censo_perm=col_censo_perm["copas_id"], avisos_malos=avisos_malos)
    json.dump(out, sys.stdout)


def escribe(p, d):
    os.makedirs(os.path.dirname(p), exist_ok=True); json.dump(d, open(p, "w", encoding="utf-8"))


def datos_hituelo(D, orden_arboles=None):
    import numpy as np
    L = os.path.join(D, "lidar"); IM = os.path.join(D, "imagen"); k = "%d_%d" % (KX, KY)
    escribe(os.path.join(L, "indice.json"), dict(teselas={k: {}}))
    yy, xx = np.mgrid[0:257, 0:257]
    suelo = (600 + 0.01 * xx + 0.02 * yy).astype("f4")                        # nodos de 1 m, fila 0 = sur
    chm = np.zeros((513, 513), "f4"); chm[160:200, 120:180] = 350.0         # cm a 0,5 m
    rng = np.random.RandomState(99); pts = np.stack([rng.randint(0, 5120, 400), rng.randint(0, 5120, 400), rng.randint(0, 200, 400)], axis=1).astype("i4")
    os.makedirs(os.path.join(L, "tesela"), exist_ok=True)
    np.savez(os.path.join(L, "tesela", k + ".npz"), suelo=suelo, chm=chm, pts=pts, z0=np.float64(599.0))
    A = arboles()
    if orden_arboles: A = [A[i] for i in orden_arboles]
    escribe(os.path.join(L, "arboles.json"), dict(arboles=A))
    escribe(os.path.join(L, "paisaje.json"), dict(fuente="sintético", edificios=[], tendido=dict(cadenas=[]), cauces=[], arboles=[], honestidad=dict(cauces="sintético")))
    escribe(os.path.join(IM, "ndvi", "ndvi_hituelo.json"), dict(bbox25830=[E0, N0, E0 + TS, N0 + TS], w=4, h=4, fechas=["2026-09-01", "2026-10-01"], media=[0.4, 0.45], codigo_u8="u8: 0 = sin dato"))
    open(os.path.join(IM, "ndvi", "ndvi_u8.bin"), "wb").write(bytes(range(100, 132)))
    escribe(os.path.join(IM, "ndvi", "suelo_ndvi_hituelo.json"), dict(w=4, h=4, a=[0.2, 0.2], b=[0.5, 0.5], f="AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", fechas=["2026-09-01", "2026-10-01"]))
    escribe(os.path.join(IM, "suelo_hituelo.json"), dict(parcelas={}))
    escribe(os.path.join(IM, "ot_hituelo.json"), dict(fecha_consulta="2026-01-01", fincas={"f1": dict(parcelas={"p1": dict(id="sintetica-1", olivos=marcas_censo()[0])}, trabajos=[], fenologia=[])}))
    escribe(os.path.join(D, "parcelas.json"), dict(parcelas=[dict(id="sintetica-1", nombre="Parcela sintética", finca="Finca sintética", olivos=12, ha=0.5,
                                                             utm=[[E0 + 50, N0 + 70], [E0 + 90, N0 + 70], [E0 + 90, N0 + 100], [E0 + 50, N0 + 100]])]))


def cerro(salida):
    import numpy as np
    import finca_8_teselas as F8
    cx, cy = E0 + 128, N0 + 128; W = H = TS
    copas = [[round(a["x"] - cx, 2), round(a["y"] - cy, 2), a["h"], a["r8"], 1] for a in arboles() if a["olivo"]]
    D = dict(centro_utm=[cx, cy], ext=[-128, 128, 128, -128], W=W, H=H, z0=600.0, parcelas=[dict(id="sintetica-1", nombre="Parcela sintética", ha=0.5, linde=[[-78, -58], [-38, -58], [-38, -28], [-78, -28]], centro=[-58, -43], desfase=[0, 0], suelo=None)],
             copas=copas, marcados=[[copas[0][0], copas[0][1], 0, 0], [copas[1][0], copas[1][1], 1, 0]], marcados_id=[7000, None], ot=dict(fuente="instantanea", fecha_consulta="2026-01-01", parcelas={"sintetica-1": dict(tareas=[], fenologia=[])}), avance={})
    yy, xx = np.mgrid[0:H, 0:W]
    Fd = dict(D=D, cx=cx, cy=cy, ux0=E0, uyN=N0 + H, W=W, H=H, dtm=(100 + xx + yy).astype("<i2"), chm=np.zeros((H, W), "<i2"), suelo=np.full((H // 2, W // 2, 3), 120, "u1"), srs=2,
              orto=np.full((H, W, 3), 110, "u1"), pts=np.zeros((10, 3), "<i2"))
    F8.construye(Fd, salida)


def exporta(base):
    for m in ("numpy", "scipy", "PIL"): __import__(m)
    d1 = os.path.join(base, "datos"); datos_hituelo(d1)
    os.environ["GEMELO_HITUELO"] = d1; os.environ["GEMELO_PARCELAS"] = os.path.join(d1, "parcelas.json")
    import hituelo_conv
    hituelo_conv.hituelo(os.path.join(base, "hituelo_a"))
    hituelo_conv.hituelo(os.path.join(base, "hituelo_b"))
    n = len(arboles()); orden = list(range(n))[::-1]                           # los mismos árboles, al revés
    d2 = os.path.join(base, "datos_c"); datos_hituelo(d2, orden)
    hituelo_conv.HD = d2; hituelo_conv.PARC = os.path.join(d2, "parcelas.json")
    hituelo_conv.hituelo(os.path.join(base, "hituelo_c"))
    cerro(os.path.join(base, "cerro"))
    cx, cy = E0 + 128, N0 + 128; A = arboles(); _, esp = marcas_censo()
    escribe(os.path.join(base, "esperado.json"), dict(hituelo={"%s,%s" % (round(A[n]["x"] - cx, 2), round(A[n]["y"] - cy, 2)): k for n, k in esp.items()},
                                                    cerro={"%s,%s" % (round(A[0]["x"] - cx, 2), round(A[0]["y"] - cy, 2)): 7000}))


if __name__ == "__main__":
    if len(sys.argv) >= 2 and sys.argv[1] == "ids": casos_ids()
    elif len(sys.argv) >= 3 and sys.argv[1] == "exporta": exporta(sys.argv[2])
    else: sys.exit(__doc__)
