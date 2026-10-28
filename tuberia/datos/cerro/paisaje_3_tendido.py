"""El tendido eléctrico: ¿se deja ver como línea en el LiDAR? Ajusta una recta a los puntos altos y estrechos, mira su perfil (alturas a lo largo) y dónde se concentran los puntos (postes)."""
import json, os
import numpy as np
R = __import__("os").environ.get("GEMELO_DATOS", "datos")
P = np.load(os.path.join(R, "paisaje_puntos.npy")).astype(np.float64); x, y, z, h, cl = P.T
alto = (h > 11) & (cl != 6) & (cl != 7)
a = P[alto]; print("puntos >11 m:", len(a))
# quitar los grupos densos (árboles): celdas de 4 m con muchos puntos
cel = (np.floor(a[:, 0] / 4).astype(int) * 100003 + np.floor(a[:, 1] / 4).astype(int))
u, inv, cnt = np.unique(cel, return_inverse=True, return_counts=True)
ralos = a[cnt[inv] <= 25]; print("tras quitar celdas densas:", len(ralos))
# recta por RANSAC
rng = np.random.default_rng(1); mejor = (0, None)
for _ in range(4000):
    i, j = rng.choice(len(ralos), 2, replace=False); p, q = ralos[i, :2], ralos[j, :2]
    d = q - p; L = np.hypot(*d)
    if L < 60: continue
    n = np.array([-d[1], d[0]]) / L; dist = np.abs((ralos[:, :2] - p) @ n); k = int((dist < 2.5).sum())
    if k > mejor[0]: mejor = (k, (p, d / L))
k, (p0, dv) = mejor; print("recta: puntos a <2,5 m:", k, "dirección", dv, "ángulo %.1f°" % np.degrees(np.arctan2(dv[1], dv[0])))
n = np.array([-dv[1], dv[0]])
t = (ralos[:, :2] - p0) @ dv; d = (ralos[:, :2] - p0) @ n
sel = np.abs(d) < 3.0; T = t[sel]; HH = ralos[sel][:, 3]
print("a lo largo de la recta: de %.0f a %.0f m" % (T.min(), T.max()))
# perfil: altura mediana por tramos de 10 m
print("  tramo(m)   puntos  h_mediana  h_max")
for a0 in np.arange(np.floor(T.min() / 10) * 10, T.max(), 10):
    m = (T >= a0) & (T < a0 + 10)
    if m.sum(): print("  %6.0f %8d %8.1f %8.1f" % (a0, m.sum(), np.median(HH[m]), HH[m].max()))
# también TODOS los puntos altos cercanos a la recta (los postes son racimos densos)
todos = P[(h > 6) & (cl != 6) & (cl != 7)]; tt = (todos[:, :2] - p0) @ dv; dd = (todos[:, :2] - p0) @ n
cerca = np.abs(dd) < 4; print("puntos >6 m a <4 m de la recta:", int(cerca.sum()))
hist, e = np.histogram(tt[cerca], bins=np.arange(tt[cerca].min(), tt[cerca].max() + 2, 2))
orden = np.argsort(-hist)[:14]
print("picos de densidad (candidatos a poste): tramo_m, puntos")
for i in sorted(orden): print("  %6.0f %5d" % (e[i], hist[i]))
json.dump({"p0": p0.tolist(), "dv": dv.tolist()}, open(os.path.join(R, "tendido_recta.json"), "w"))
