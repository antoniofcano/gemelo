"""Constantes y utilidades comunes del pipeline LiDAR de Hituelo (UTM 30N, ETRS89 / EPSG:25830).
Teselas de 256 m alineadas a múltiplos de 256: tesela (tx, ty) = (floor(E/256), floor(N/256)); origen suroeste = (tx*256, ty*256).
Convención de rejillas: NODOS (no celdas). suelo[j, i] es la cota en (X0 + i*1 m, Y0 + j*1 m); j=0 es el borde SUR; 257 x 257 (el último nodo es el primero de la vecina)."""
import json, os, glob, sys
try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass
import numpy as np
from scipy import ndimage as ndi

DL = __import__("os").environ.get("GEMELO_DESCARGAS", "descargas")
BASE = __import__("os").environ.get("GEMELO_LIDAR", "hituelo_datos/lidar")
RAW = os.path.join(BASE, "raw"); TES = os.path.join(BASE, "tesela")
PARC = __import__("os").environ.get("GEMELO_PARCELAS", "hituelo_parcelas_utm.json")
MDS = __import__("os").environ.get("GEMELO_MDS", "mdsn_v025_hituelo.tif")
T = 256
MARGEN = 60.0
CLASES_FUERA = (7, 18)          # ruido

def arregla(s): return s.replace("\ufffd", "í") if s else s   # el JSON de entrada trae «Polígono» roto

def parcelas():
    d = json.load(open(PARC, encoding="utf-8"))["parcelas"]
    out = []
    for k, p in enumerate(d):
        out.append({"k": k, "finca": arregla(p["finca"]), "id": p["id"], "nombre": arregla(p["nombre"]), "olivos": p["olivos"] or 0, "ha": p["ha"],
                    "pasto": "pasto" in p["nombre"].lower(), "utm": np.array(p["utm"], float)})
    return out

def dentro(poly, X, Y):
    """Punto en polígono (par-impar) vectorizado sobre arrays X, Y."""
    ins = np.zeros(X.shape, bool); n = len(poly)
    for i in range(n):
        ax, ay = poly[i]; bx, by = poly[(i + 1) % n]
        c = (ay > Y) != (by > Y)
        if c.any(): ins ^= c & (X < (bx - ax) * (Y - ay) / (by - ay + 1e-12) + ax)
    return ins

def hoja_de(nombre):
    """PNOA_2024_AND_405-4180_H30_NPC01.laz -> (405, 4180). En el nombre Y es el borde NORTE de la hoja de 1 km."""
    b = os.path.basename(nombre).split("_")[3]; a, c = b.split("-"); return int(a), int(c)

def tesela_de(E, N): return np.floor(E / T).astype(np.int64), np.floor(N / T).astype(np.int64)

def teselas_objetivo(P):
    """Teselas que tocan una parcela + MARGEN, y cuáles tocan una parcela de verdad (olivar)."""
    xs = np.concatenate([p["utm"][:, 0] for p in P]); ys = np.concatenate([p["utm"][:, 1] for p in P])
    x0, x1, y0, y1 = xs.min() - 80, xs.max() + 80, ys.min() - 80, ys.max() + 80
    r = 4.0; gx = np.arange(x0, x1, r) + r / 2; gy = np.arange(y0, y1, r) + r / 2; GX, GY = np.meshgrid(gx, gy)
    m = np.zeros(GX.shape, bool)
    for p in P: m |= dentro(p["utm"], GX, GY)
    dist = ndi.distance_transform_edt(~m) * r
    tx, ty = tesela_de(GX, GY); cerca = dist <= MARGEN
    obj = sorted({(int(a), int(b)) for a, b in zip(tx[cerca], ty[cerca])}); parc = sorted({(int(a), int(b)) for a, b in zip(tx[m], ty[m])})
    return obj, set(parc)

def hojas_que_cubre(tx, ty, con_halo=8.0):
    """Hojas de 1 km (nombre X-Ynorte) que intersectan la tesela con un halo."""
    xa, xb = tx * T - con_halo, (tx + 1) * T + con_halo; ya, yb = ty * T - con_halo, (ty + 1) * T + con_halo
    return sorted({(x, y + 1) for x in range(int(xa // 1000), int(xb // 1000) + 1) for y in range(int(ya // 1000), int(yb // 1000) + 1)})
