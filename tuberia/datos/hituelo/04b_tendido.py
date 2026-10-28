"""Paso 4b: postes y tendido DEDUCIDOS (el LiDAR de 3.ª cobertura no trae clase de cable ni de poste: casi todo cae en «vegetación alta», clase 5).
Poste = racimo compacto (≤ 3 m de lado) de puntos a más de 5 m sobre el suelo, aislado. Tendido = cadena de ≥ 3 postes casi alineados con 25–110 m entre ellos;
el cable = puntos sueltos a lo largo del tramo entre postes (mediana por tramos de 4 m) o, si no hay, una catenaria estimada. Todo lo que sale de aquí es una DEDUCCIÓN.
Entrada: _alto.npy (04a). Salida: _tendido.json (UTM absoluto)."""
import sys, os, json
import numpy as np
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
A = np.load(BASE + "/_alto.npy"); S = np.load(BASE + "/_suelo_mosaico.npy"); sm = json.load(open(BASE + "/_suelo_mosaico.json"))
X0m, Y0m = sm["X0"], sm["Y0"]
def suelo_en(x, y): return float(S[int(np.clip(round(y - Y0m), 0, S.shape[0] - 1)), int(np.clip(round(x - X0m), 0, S.shape[1] - 1))])
# --- rejilla de 1 m de puntos altos (h > 5)
m = (A[:, 3] > 5.0) & (A[:, 4] != 6); B = A[m]
nx, ny = S.shape[1], S.shape[0]
g = np.zeros((ny, nx), np.int32); np.add.at(g, (np.clip(np.round(B[:, 1] - Y0m).astype(int), 0, ny - 1), np.clip(np.round(B[:, 0] - X0m).astype(int), 0, nx - 1)), 1)
lab, n = ndi.label(ndi.binary_dilation(g > 0, iterations=1), structure=np.ones((3, 3)))
ji = np.clip(np.round(B[:, 1] - Y0m).astype(int), 0, ny - 1); ii = np.clip(np.round(B[:, 0] - X0m).astype(int), 0, nx - 1); L = lab[ji, ii]
cl = []
for k in range(1, n + 1):
    s = B[L == k]
    if len(s) < 4: continue
    ext = max(np.ptp(s[:, 0]), np.ptp(s[:, 1]))
    cl.append({"x": float(np.median(s[:, 0])), "y": float(np.median(s[:, 1])), "n": len(s), "ext": float(ext), "hmax": float(np.percentile(s[:, 3], 98)), "zalto": float(np.percentile(s[:, 2], 98))})
print("racimos de puntos altos:", len(cl))
C = np.array([[c["x"], c["y"]] for c in cl])
from scipy.spatial import cKDTree
tr = cKDTree(C)
postes = []
for i, c in enumerate(cl):
    if c["ext"] > 3.5 or not (5.5 <= c["hmax"] <= 16): continue
    veci = [j for j in tr.query_ball_point(C[i], 12.0) if j != i and cl[j]["n"] >= 4]
    if len(veci) > 1: continue                                     # aislado (no es una copa grande ni un grupo de árboles)
    postes.append(i)
print("candidatos a poste (compactos, aislados, 5,5–16 m):", len(postes))
P_ = C[postes]
# --- cadenas: RANSAC sencillo por pares de candidatos
rest = set(range(len(postes))); cadenas = []
while True:
    mejor = None
    idl = sorted(rest)
    for a in range(len(idl)):
        for b in range(a + 1, len(idl)):
            pa, pb = P_[idl[a]], P_[idl[b]]; d = np.linalg.norm(pb - pa)
            if not (25 <= d <= 400): continue
            u = (pb - pa) / d; nv = np.array([-u[1], u[0]])
            t = (P_[idl] - pa) @ u; s = np.abs((P_[idl] - pa) @ nv)
            cand = [idl[q] for q in range(len(idl)) if s[q] < 4.0 and -600 < t[q] < 600]
            # separaciones razonables entre consecutivos
            tt = sorted((((P_[q] - pa) @ u), q) for q in cand)
            ok = [tt[0]]
            for v in tt[1:]:
                if 25 <= v[0] - ok[-1][0] <= 130: ok.append(v)
            if len(ok) >= 3 and (mejor is None or len(ok) > len(mejor)): mejor = ok
    if not mejor: break
    cadenas.append([q for _, q in mejor]); rest -= set(q for _, q in mejor)
print("cadenas de ≥3 postes:", [len(c) for c in cadenas])
salida = []
for ch in cadenas:
    pts = [P_[q] for q in ch]; ids = [postes[q] for q in ch]
    ps = []
    for q, i in zip(pts, ids):
        zg = suelo_en(q[0], q[1]); ps.append({"x": round(float(q[0]), 2), "y": round(float(q[1]), 2), "zBase": round(zg, 2), "zAlto": round(float(cl[i]["zalto"]), 2), "puntos": cl[i]["n"]})
    # cable: puntos sueltos entre postes (h entre 4 m y la punta, a ≤ 1,5 m de cada tramo)
    linea = []
    for a, b in zip(ps[:-1], ps[1:]):
        pa = np.array([a["x"], a["y"]]); pb = np.array([b["x"], b["y"]]); L_ = np.linalg.norm(pb - pa); u = (pb - pa) / L_; nv = np.array([-u[1], u[0]])
        t = (A[:, :2] - pa) @ u; d = (A[:, :2] - pa) @ nv
        w = (np.abs(d) < 1.5) & (t > 2) & (t < L_ - 2) & (A[:, 3] > 4) & (A[:, 4] != 6)
        nP = int(w.sum()); zt0, zt1 = a["zAlto"], b["zAlto"]
        for s_ in np.linspace(0, 1, max(3, int(L_ // 6) + 1)):
            tt = s_ * L_; zline = zt0 + (zt1 - zt0) * s_ - 4 * 0.012 * L_ * (s_ * (1 - s_))   # catenaria parabólica con flecha ≈ 1,2 % del vano
            q = pa + u * tt; linea.append([round(float(q[0]), 2), round(float(q[1]), 2), round(float(zline - 0.8), 2)])
        a.setdefault("puntos_cable", []).append(nP)
    salida.append({"postes": ps, "linea": linea, "nota": "DEDUCIDO: postes = racimos aislados y compactos de puntos a >5 m del suelo, alineados; el cable es una catenaria estimada entre las puntas (el LiDAR no clasifica cables)."})
    print("cadena de %d postes: %s" % (len(ps), [(p["x"], p["y"], round(p["zAlto"] - p["zBase"], 1)) for p in ps]))
json.dump({"cadenas": salida, "racimos": cl}, open(BASE + "/_tendido.json", "w"))
