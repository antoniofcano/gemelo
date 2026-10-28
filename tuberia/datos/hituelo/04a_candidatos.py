"""Paso 4a (exploración): puntos altos y aislados de toda Hituelo (candidatos a cables/postes/árboles grandes), mosaico de suelo y nube de candidatos en disco.
Salidas: _suelo_mosaico.npy, _alto.npy (x,y,z,h,clase, UTM), alto_control.png"""
import sys, os, json, glob, time
import numpy as np
from scipy import ndimage as ndi
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from comun import *
t0 = time.time(); P = parcelas()
idx = json.load(open(BASE + "/indice.json", encoding="utf-8"))
tes = sorted((v["tx"], v["ty"]) for k, v in idx["teselas"].items() if os.path.exists(f"{TES}/{k}.npz"))
tx0, tx1 = min(t[0] for t in tes), max(t[0] for t in tes); ty0, ty1 = min(t[1] for t in tes), max(t[1] for t in tes)
NX, NY = (tx1 - tx0 + 1) * T + 1, (ty1 - ty0 + 1) * T + 1
S = np.full((NY, NX), np.nan, np.float32)
for (tx, ty) in tes:
    z = np.load(f"{TES}/{tx}_{ty}.npz")["suelo"]; J, I = (ty - ty0) * T, (tx - tx0) * T; S[J:J + T + 1, I:I + T + 1] = z
np.save(BASE + "/_suelo_mosaico.npy", S)
json.dump({"X0": tx0 * T, "Y0": ty0 * T, "nx": NX, "ny": NY, "res": 1.0}, open(BASE + "/_suelo_mosaico.json", "w"))
X0m, Y0m = tx0 * T, ty0 * T
sel = set(tes); out = []
for d in sorted(glob.glob(RAW + "/*")):
    if not os.path.exists(d + "/HECHO.json"): continue
    for f in glob.glob(d + "/*.npy"):
        tx, ty = map(int, os.path.basename(f)[:-4].split("_"))
        if (tx, ty) not in sel: continue
        a = np.load(f); E = a["x"].astype(np.float64) + tx * T; N = a["y"].astype(np.float64) + ty * T; Z = a["z"].astype(np.float64)
        j = np.clip(np.round(N - Y0m).astype(int), 0, NY - 1); i = np.clip(np.round(E - X0m).astype(int), 0, NX - 1)
        h = Z - S[j, i]
        m = (h > 3.0) & (h < 40) & (a["c"] != 7)
        out.append(np.column_stack([E[m], N[m], Z[m], h[m], a["c"][m]]))
A = np.concatenate(out); np.save(BASE + "/_alto.npy", A.astype(np.float64))
print("puntos >3 m sobre el suelo:", len(A), "%.0f s" % (time.time() - t0))
cl = np.bincount(A[:, 4].astype(int)); print("clases:", {i: int(v) for i, v in enumerate(cl) if v})
fig, ax = plt.subplots(1, 2, figsize=(20, 14), dpi=70)
m = A[:, 3] > 7.5
for k, (a_, tit) in enumerate(zip(ax, ["h > 7,5 m (cables, postes, árboles altos)", "h > 7,5 m y NO veg. alta (clases 1, 6, 12)"])):
    mm = m if k == 0 else m & np.isin(A[:, 4], [1, 6, 12])
    a_.scatter(A[mm, 0], A[mm, 1], s=0.3, c=A[mm, 3], cmap="turbo", vmin=7.5, vmax=20)
    for p in P: a_.plot(p["utm"][:, 0], p["utm"][:, 1], c="w", lw=0.6)
    a_.set_aspect("equal"); a_.set_title(tit); a_.set_facecolor("#222")
plt.tight_layout(); plt.savefig(BASE + "/alto_control.png"); print("ok %.0f s" % (time.time() - t0))
