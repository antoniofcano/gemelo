"""Fixture SINTÉTICO del gemelo: dos teselas inventadas (sin ningún dato real) con la forma exacta de los contratos (doc/sistema/CONTRATOS.md).
Python puro (sin numpy ni PIL) y determinista (semilla fija): da siempre los mismos bytes. Las dos imágenes JPEG de partida están versionadas en pruebas/fixture/.

  python pruebas/genera_fixture.py [--salida pruebas/salida/fixture]

Escribe:
  hituelo/   modo «ficheros»: indice.json + t/<kx>_<ky>.json|jpg   (finca_id «hituelo»: NDVI en u8; la tesela 2 no lleva nube = calidad Base)
  cerro/     modo «embebido»: embebido.json                         (finca_id «cerro»: NDVI en Int16 b64; sin fincas)
Solo hituelo lleva las columnas opcionales del registro de árboles copas_id, copas_tipo y copas_param (ids estables y algún olivo-tipo 0 del catálogo
sintético de modelos/olivos/fixture/); cerro conserva el formato de antes.
Mundo: centro_utm en la esquina de las dos teselas (1000_16000 y 1001_16000), 512 × 256 m, 2 parcelas, 140 olivos."""
import argparse, base64, json, math, os, random, struct

R = os.path.dirname(os.path.abspath(__file__))
TS, RES, SRS, ORTO_PX = 256, 1, 2, 64
N, N2, NS, NS2 = TS // RES, TS // RES + 2, TS // SRS, TS // SRS + 2
KX0, KY = 1000, 16000
CX, CY = KX0 * TS + TS, KY * TS + TS          # centro_utm: esquina NE de la tesela 1000_16000
Z0 = 600.0

def b64(bs): return base64.b64encode(bs).decode()
def i16(vals): return b64(struct.pack("<%dh" % len(vals), *vals))
def u8(vals): return b64(bytes(vals))
def lee(p): return open(os.path.join(R, "fixture", p), "rb").read()

def relieve(xr, yr):
    """cota (cm sobre z0) en un punto relativo al centro; suave y continua entre teselas"""
    return int(round(100 * (4 + 0.015 * xr + 0.01 * yr + 1.2 * math.sin(xr / 37.0) * math.cos(yr / 41.0))))

def olivos():
    """140 olivos en dos rejillas de 20 m, una por parcela: [x, y, h, r8[8], parcela+1] (relativos al centro)"""
    rng = random.Random(777); out = []
    for p, (xa, xb) in enumerate(((-230, -30), (30, 230))):
        for y in range(-200, -60, 20):
            for x in range(xa, xb, 20):
                h = round(3.2 + rng.random() * 1.6, 1); r = [round(1.7 + rng.random() * 0.9, 1) for _ in range(8)]
                out.append([x + 0.0, y + 0.0, h, r, p + 1])
    return out

def tesela(kx, copas, con_nube, rng):
    ox, oy = kx * TS - CX, KY * TS - CY            # esquina SO de la tesela, relativa al centro
    dtm = [relieve(ox + i + 0.5, oy + j + 0.5) for j in range(-1, N + 1) for i in range(-1, N + 1)]
    chm = [0] * (N * N)
    for c in copas:
        r = max(c[3]);
        for j in range(int(c[1] - r - oy), int(c[1] + r - oy) + 1):
            for i in range(int(c[0] - r - ox), int(c[0] + r - ox) + 1):
                if 0 <= i < N and 0 <= j < N:
                    d = math.hypot(ox + i + 0.5 - c[0], oy + j + 0.5 - c[1])
                    if d < r: chm[j * N + i] = max(chm[j * N + i], int(round(c[2] * 10 * math.sqrt(1 - (d / r) ** 2))))
    suelo = []
    for j in range(-1, NS + 1):
        for i in range(-1, NS + 1): suelo += [150 + (i % 7), 125 + (j % 5), 95]
    pts = []
    if con_nube:
        for _ in range(1500):                         # suelo
            x, y = rng.randrange(0, TS * 100), rng.randrange(0, TS * 100)
            pts += [x, y, relieve(ox + x / 100.0, oy + y / 100.0)]
        for c in copas:                               # copas
            if not (ox <= c[0] < ox + TS): continue
            for _ in range(12):
                a = rng.random() * 6.2832; d = rng.random() * c[3][0]
                x = int(round((c[0] - ox + d * math.cos(a)) * 100)); y = int(round((c[1] - oy + d * math.sin(a)) * 100))
                pts += [x, y, relieve(ox + x / 100.0, oy + y / 100.0) + int(c[2] * 80)]
        trio = [pts[k:k + 3] for k in range(0, len(pts), 3)]; rng.shuffle(trio); pts = [v for t in trio for v in t]   # orden barajado, semilla fija
    d = dict(dtm=i16(dtm), chm=u8(chm), suelo=u8(suelo));
    if con_nube: d["pts"] = i16(pts); d["np"] = len(pts) // 3
    else: d["np"] = 0
    return d

def indice(finca, copas, tes):
    ext = [-TS, 0, TS, -TS]
    pars = []
    for p, (xa, xb) in enumerate(((-230, -30), (30, 230))):
        linde = [[xa - 10, -210], [xb, -210], [xb, -50], [xa - 10, -50]]
        pars.append(dict(id="sintetica-%d" % (p + 1), nombre="Parcela sintética %s" % "AB"[p], ha=round((xb - xa + 10) * 160 / 10000.0, 2), linde=linde, centro=[(xa + xb) / 2.0, -130.0],
                         desfase=[0, 0], suelo=None if p else [dict(p="0-5", a=40.0, l=30.0, c=30.0, ph=7.8, mo=1.2, cec=18.0, dens=1.3, pedr=10.0), dict(p="5-15", a=41.0, l=30.0, c=29.0, ph=7.9, mo=1.0, cec=17.0, dens=1.35, pedr=12.0)],
                         finca=0, decl=70, pasto=False))
    marcados = [[c[0] + 0.4, c[1] - 0.3, i, c[4] - 1] for i, c in enumerate(copas) if i % 10 == 0]
    W, H = 4, 2; fechas = ["2026-09-01", "2026-10-01"]
    valores = [120, 130, 140, 150, 160, 170, 180, 0, 110, 125, 135, 145, 155, 165, 175, 0]      # 2 fechas × 4 × 2; 0 = sin dato
    if finca == "hituelo":
        ndvi = dict(w=W, h=H, fechas=fechas, media=[0.42, 0.47], u8=u8(valores), codigo="u8: 0 = sin dato; 1..254 = -0,2..1,0")
    else:
        mil = [-32768 if v == 0 else int(round(((v - 1) / 253 * 1.2 - 0.2) * 1000)) for v in valores]
        ndvi = dict(w=W, h=H, fechas=fechas, media=[0.42, 0.47], b64=i16(mil))
    suelo_ndvi = dict(w=W, h=H, a=[0.22, 0.25], b=[0.5, 0.5], f=i16([300, 320, 340, 360, 380, 400, 420, 440]), fechas=fechas)
    gz = [relieve(-TS + 4 + 8 * i, -4 - 8 * j) for j in range(TS // 8) for i in range(2 * TS // 8)]
    grueso = dict(x0=-TS, yN=0, res=8, w=2 * TS // 8, h=TS // 8, b64=i16(gz))
    mosaico = dict(jpg="data:image/jpeg;base64," + b64(lee("mosaico.jpg")), w=2 * TS, h=TS, x0=-TS, yN=0, res=1.0)
    paisaje = dict(fuente="sintético", centro_utm=[CX, CY], z0=Z0,
                   edificios=[dict(x=-120.0, y=-30.0, largo=12.0, ancho=8.0, ang=0.3, zBase=0.5, hAlero=3.0, hCumbrera=4.5, color=[180, 170, 150])],
                   tendido=dict(linea=[[-250.0, -20.0, 9.0], [250.0, -25.0, 9.5]], postes=[dict(x=-250.0, y=-20.0, zBase=0.0, zAlto=9.0, puntos=40), dict(x=250.0, y=-25.0, zBase=0.0, zAlto=9.5, puntos=40)], derivaciones=[]),
                   arroyo=dict(ejes=[[[-250.0, -240.0], [0.0, -235.0], [250.0, -240.0]]], nota="sintético"),
                   arboles=[dict(x=-100.0, y=-20.0, h=6.0, r=2.5, tipo="frutal", zBase=0.0, enCauce=False), dict(x=100.0, y=-238.0, h=4.0, r=2.0, tipo="arbusto", zBase=0.0, enCauce=True)])
    ot = dict(fuente="instantanea", fecha_consulta="2026-01-01", pases_finca=0, entregas_finca=0, analiticas_finca=0, parcelas={p["id"]: dict(tareas=[], fenologia=[]) for p in pars})
    I = dict(v=2, ts=TS, res=RES, srs=SRS, orto_px=ORTO_PX, finca_id=finca, centro_utm=[CX, CY], z0=Z0, zmax=0, ext=ext, cobertura_nube=0.5, parcelas=pars, copas=copas, marcados=marcados,
             ndvi=ndvi, suelo_ndvi=suelo_ndvi, ot=ot, avance={}, paisaje=paisaje, teselas=tes, grueso=grueso, mosaico=mosaico)
    if finca == "hituelo":
        # columnas paralelas OPCIONALES del registro de árboles (CONTRATOS §1.1, ADR-0012): id estable y olivo-tipo (-1 = sin asignar).
        # Solo Hituelo las lleva: Cerro conserva el formato de antes y las dos cargas deben dibujar lo mismo (el catálogo por defecto no conoce el tipo 0).
        I["copas_id"] = [1000 + 3 * i for i in range(len(copas))]
        I["copas_tipo"] = [0 if i % 7 == 0 else -1 for i in range(len(copas))]
        # copas_semilla (ADR-0017): la semilla guardada; aquí la del primer id, salvo una copa que la «heredó» de una exportación anterior
        I["copas_semilla"] = [I["copas_id"][i] if i != 4 else 2 ** 31 + 4242 for i in range(len(copas))]
        # copas_param (ADR-0017, contratos/olivo-generado.md): SINTÉTICO, derivado de h y r8 del propio fixture (r8 es radio); una fila de cada 11 sin medir (null)
        I["copas_param"] = [None if i % 11 == 5 else [round(c[2] * 0.95, 2), round(2 * sum(c[3]) / 8, 2), 0.0 if i % 3 == 2 else round(0.25 * (i % 5), 2), float((i * 45) % 360), 0.85, round(c[2] * 0.3, 2), 0.12, i % 3]
                            for i, c in enumerate(copas)]
        I["fincas"] = [dict(nombre="Finca sintética", parcelas=[0, 1], ha=round(sum(p["ha"] for p in pars), 1), olivos=len(copas))]
        I["textos"] = dict(sin_historia=False, finca="Finca sintética", fincas=1, parcelas=2, ha=round(sum(p["ha"] for p in pars), 1), olivos=len(copas))
    else:
        for p in pars: del p["finca"]
    return I

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--salida", default=os.path.join(R, "salida", "fixture")); a = ap.parse_args()
    copas = olivos(); rng = random.Random(12345)
    t1 = tesela(KX0, copas, True, rng); t2 = tesela(KX0 + 1, copas, False, rng)
    claves = ["%d_%d" % (KX0, KY), "%d_%d" % (KX0 + 1, KY)]
    tes = {claves[0]: dict(kx=KX0, ky=KY, v=[-TS, -TS, 0, 0], np=t1["np"]), claves[1]: dict(kx=KX0 + 1, ky=KY, v=[0, -TS, TS, 0], np=0)}
    orto = lee("orto.jpg")
    # modo ficheros (hituelo)
    h = os.path.join(a.salida, "hituelo"); os.makedirs(os.path.join(h, "t"), exist_ok=True)
    json.dump(indice("hituelo", copas, tes), open(os.path.join(h, "indice.json"), "w"), separators=(",", ":"))
    for k, t in zip(claves, (t1, t2)):
        json.dump(t, open(os.path.join(h, "t", k + ".json"), "w"), separators=(",", ":")); open(os.path.join(h, "t", k + ".jpg"), "wb").write(orto)
    # modo embebido (cerro)
    c = os.path.join(a.salida, "cerro"); os.makedirs(c, exist_ok=True)
    E = indice("cerro", copas, tes); E["t"] = {}
    for k, t in zip(claves, (t1, t2)): E["t"][k] = dict(t, orto="data:image/jpeg;base64," + b64(orto))
    json.dump(E, open(os.path.join(c, "embebido.json"), "w"), separators=(",", ":"))
    print("fixture en", a.salida, "| teselas", len(tes), "| olivos", len(copas), "| nube", t1["np"], "puntos")

if __name__ == "__main__":
    main()
