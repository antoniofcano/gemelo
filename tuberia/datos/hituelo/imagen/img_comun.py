"""Lo común de los scripts de imagen de Hituelo: parcelas, caja y teselas de 256 m (X=floor(E/256), Y=floor(N/256))."""
import json, math
import numpy as np
from matplotlib.path import Path
BASE = __import__("os").environ.get("GEMELO_IMAGEN", "hituelo_datos/imagen")
PARC = __import__("os").environ.get("GEMELO_PARCELAS", "hituelo_parcelas_utm.json")
T = 256.0
MARGEN = 60.0
def parcelas():
    return json.load(open(PARC, encoding="utf-8"))["parcelas"]
def densifica(a, paso=5.0):
    a = np.asarray(a, float); out = []
    for i in range(len(a)):
        p, q = a[i], a[(i + 1) % len(a)]; n = max(1, int(np.hypot(*(q - p)) / paso))
        out.extend(p + (q - p) * k / n for k in range(n))
    return np.array(out)
def teselas_con_parcela():
    """Teselas (X,Y) cuyo cuadrado ampliado en MARGEN toca alguna parcela."""
    res = set()
    for p in parcelas():
        a = np.asarray(p["utm"], float); b = densifica(a); P = Path(a)
        x0, x1, y0, y1 = a[:, 0].min() - MARGEN, a[:, 0].max() + MARGEN, a[:, 1].min() - MARGEN, a[:, 1].max() + MARGEN
        for X in range(int(x0 // T), int(x1 // T) + 1):
            for Y in range(int(y0 // T), int(y1 // T) + 1):
                rx0, rx1, ry0, ry1 = X * T - MARGEN, (X + 1) * T + MARGEN, Y * T - MARGEN, (Y + 1) * T + MARGEN
                if ((b[:, 0] > rx0) & (b[:, 0] < rx1) & (b[:, 1] > ry0) & (b[:, 1] < ry1)).any() or P.contains_point(((rx0 + rx1) / 2, (ry0 + ry1) / 2)):
                    res.add((X, Y))
    return sorted(res)
def caja(margen=100.0):
    d = json.load(open(PARC, encoding="utf-8"))["bbox"]
    return d[0] - margen, d[1] - margen, d[2] + margen, d[3] + margen
