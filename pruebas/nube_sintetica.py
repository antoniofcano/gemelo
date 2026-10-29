"""De un .laz SINTÉTICO a copas_param, de punta a punta, para el guardián pruebas/guardianes/exportadores.test.js (ningún dato real).

  python pruebas/nube_sintetica.py <carpeta>     (necesita numpy, scipy y laspy con lazrs)

Escribe en <carpeta> un índice mínimo (centro_utm, z0, teselas, 4 copas), una tesela t/<kx>_<ky>.json con un dtm en pendiente y tres hojas .laz
(una que toca las copas, otra lejos y un duplicado «(1)» que se ignora). La hoja buena lleva 3 olivos (cilindros de puntos de copa de clase 4/5 con
altura y radio conocidos; dos con retornos de tronco de clase 3), suelo (2), un edificio (6), ruido (7), un punto de 40 m y puntos lejos de las
copas. Ejecuta tuberia/puntos_copas.py y tuberia/parametros_copas.py por su línea de órdenes, con un trozo pequeño para que lea por trozos, y escribe
JSON por stdout con lo esperado y lo obtenido. Determinista (semilla fija)."""
import base64, json, os, subprocess, sys

import numpy as np

AQUI = os.path.dirname(os.path.abspath(__file__))
TUB = os.path.join(os.path.dirname(AQUI), "tuberia")
KX, KY, TS = 1953, 15625, 256
E0, N0 = KX * TS, KY * TS                      # esquina SO de la tesela (UTM inventado)
CX, CY = E0 + 128, N0 + 128                    # centro_utm
Z0 = 90.0
# olivos: (x, y relativos al centro, radio, base, copa arriba, con tronco)
OLIVOS = [(-30.0, -20.0, 2.0, 1.0, 4.0, True), (0.0, 0.0, 2.5, 1.2, 6.0, True), (30.0, 25.0, 3.0, 1.5, 8.0, False)]
VACIA = (60.0, -60.0)                          # copa del índice sin ningún punto cerca


def suelo(ux, uy):
    """Suelo en pendiente (m), plano: la bilineal del dtm lo reproduce salvo el redondeo a cm."""
    return 100.0 + 0.05 * (ux - E0) + 0.02 * (uy - N0)


def dtm():
    i = np.arange(-1, TS + 1) + 0.5            # centros de celda -1..256
    U, V = np.meshgrid(E0 + i, N0 + i)         # filas sur -> norte
    return np.rint((suelo(U, V) - Z0) * 100).astype("<i2")


def escribe_laz(f, x, y, z, c):
    import laspy
    hd = laspy.LasHeader(point_format=6, version="1.4")
    hd.scales = np.array([0.01, 0.01, 0.01]); hd.offsets = np.array([E0, N0, 0.0])
    las = laspy.LasData(hd); las.x = x; las.y = y; las.z = z; las.classification = c.astype(np.uint8)
    las.write(f)


def nube(rng):
    """Puntos (x, y, z UTM, clase, h verdadera, ¿debe conservarse?)."""
    P = []

    def add(x, y, h, c, ok):
        x = np.round(np.asarray(x, float), 2); y = np.round(np.asarray(y, float), 2)
        z = np.round(suelo(x, y) + h, 2)
        P.append((x, y, z, np.full(len(x), c), z - suelo(x, y), np.full(len(x), ok)))
    for (ox, oy, r, base, alto, tronco) in OLIVOS:
        n = 1500
        a = rng.uniform(0, 2 * np.pi, n); d = r * np.sqrt(rng.uniform(0, 1, n)); h = rng.uniform(base, alto, n)
        add(CX + ox + d * np.cos(a), CY + oy + d * np.sin(a), h, 4, True)
        add(CX + ox + rng.uniform(-0.5, 0.5, 200), CY + oy + rng.uniform(-0.5, 0.5, 200), rng.uniform(alto - 0.5, alto, 200), 5, True)
        if tronco:
            add(CX + ox + 0.3 + rng.uniform(-0.1, 0.1, 30), CY + oy - 0.2 + rng.uniform(-0.1, 0.1, 30), rng.uniform(0.4, 1.0, 30), 3, True)
        add(CX + ox + rng.uniform(-3, 3, 200), CY + oy + rng.uniform(-3, 3, 200), np.zeros(200), 2, False)   # suelo
        add(CX + ox + rng.uniform(-r, r, 50), CY + oy + rng.uniform(-r, r, 50), rng.uniform(0.0, 0.2, 50), 3, False)  # hierba, < 0,3 m
    add(CX + 2.0 + rng.uniform(-1, 1, 100), CY + 3.0 + rng.uniform(-1, 1, 100), rng.uniform(1, 5, 100), 6, False)    # edificio pegado
    add([CX + 1.0], [CY + 1.0], [30.0], 7, False)                                                                     # ruido
    add([CX + 0.5], [CY + 0.5], [40.0], 5, False)                                                                     # > 30 m
    add(CX - 60 + rng.uniform(-3, 3, 300), CY + 60 + rng.uniform(-3, 3, 300), rng.uniform(1, 5, 300), 5, False)     # lejos de las copas
    add(CX + 200 + rng.uniform(-3, 3, 100), CY + rng.uniform(-3, 3, 100), rng.uniform(1, 5, 100), 5, False)         # fuera del cuadro
    return tuple(np.concatenate([p[i] for p in P]) for i in range(6))


def principal():
    out = sys.argv[1]
    os.makedirs(os.path.join(out, "t"), exist_ok=True); os.makedirs(os.path.join(out, "laz"), exist_ok=True)
    rng = np.random.default_rng(2024)
    copas = [[o[0], o[1], o[4], [o[2] / 2] * 8, 0] for o in OLIVOS] + [[VACIA[0], VACIA[1], 3.0, [1.0] * 8, 0]]
    k = "%d_%d" % (KX, KY)
    I = {"centro_utm": [CX, CY], "z0": Z0, "copas": copas, "marcados": [],
         "teselas": {k: {"kx": KX, "ky": KY, "v": [-128, -128, 128, 128], "np": 0}}}
    fi = os.path.join(out, "indice.json"); json.dump(I, open(fi, "w", encoding="utf-8"))
    json.dump({"dtm": base64.b64encode(dtm().tobytes()).decode()}, open(os.path.join(out, "t", k + ".json"), "w", encoding="utf-8"))
    x, y, z, c, h, ok = nube(rng)
    e, n = int(CX // 1000), int(CY // 1000) + 1          # la hoja que contiene las copas (N = borde norte)
    escribe_laz(os.path.join(out, "laz", "PNOA_2024_AND_%d-%d_H30_NPC01.laz" % (e, n)), x, y, z, c)
    escribe_laz(os.path.join(out, "laz", "PNOA_2024_AND_%d-%d_H30_NPC01 (1).laz" % (e, n)), x[:10], y[:10], z[:10], c[:10])
    escribe_laz(os.path.join(out, "laz", "PNOA_2024_AND_%d-%d_H30_NPC01.laz" % (e + 5, n)), np.array([E0 + 5000.5]), np.array([N0 + 10.5]), np.array([200.0]), np.array([5]))
    fp = os.path.join(out, "puntos.npz"); fs = os.path.join(out, "indice_param.json")
    r1 = subprocess.run([sys.executable, "-P", "-E", os.path.join(TUB, "puntos_copas.py"), "--indice", fi, "--laz", os.path.join(out, "laz"),
                         "--salida", fp, "--trozo", "1000"], capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r1.returncode != 0:
        print(r1.stdout + r1.stderr, file=sys.stderr); return 1
    r2 = subprocess.run([sys.executable, "-P", "-E", os.path.join(TUB, "parametros_copas.py"), "--indice", fi, "--puntos", fp, "--salida", fs],
                        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r2.returncode != 0:
        print(r2.stdout + r2.stderr, file=sys.stderr); return 1
    P = np.load(fp); info = json.load(open(os.path.splitext(fp)[0] + ".json", encoding="utf-8"))
    # h verdadera de los conservados, emparejados por posición redondeada a cm
    verdad = {}
    for a, b, hh, o in zip(x, y, h, ok):
        if o:
            verdad.setdefault((round(a - CX, 2), round(b - CY, 2)), []).append(float(hh))
    err = max((min(abs(float(hh) - v) for v in verdad.get((round(float(a), 2), round(float(b), 2)), [99.0]))
               for a, b, hh in zip(P["x"], P["y"], P["h"])), default=None)
    print(json.dumps({
        "esperados": int(ok.sum()), "conservados": int(len(P["x"])), "clases": sorted({int(v) for v in P["clase"]}),
        "h_err_max": err, "dtype": [str(P[k].dtype) for k in ("x", "y", "h")], "hojas": sorted(info["hojas"]),
        "leidos": sum(v["leidos"] for v in info["hojas"].values()), "trozo_ok": info["hojas"][next(iter(info["hojas"]))]["leidos"] > 1000,
        "olivos": [{"base": o[3], "alto": o[4], "radio": o[2], "tronco": o[5]} for o in OLIVOS],
        "copas_param": json.load(open(fs, encoding="utf-8"))["copas_param"]}))
    return 0


if __name__ == "__main__":
    sys.exit(principal())
