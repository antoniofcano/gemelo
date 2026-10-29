"""¿r8 es radio o diámetro? Medidas sobre una finca exportada (decisión abierta nº 48, ADR-0017). Sin datos en el repo: se le pasa la carpeta.

  python pruebas/olivo/r8_medidas.py --finca <carpeta con indice.json y t/> --salida <carpeta> [--desfase 1.25]
  (o GEMELO_DATOS = el indice.json de la finca)

Escribe en --salida un JSON con las cifras y dos PNG (cenital con la ortofoto y las copas a factorR8 = 0,5 y 1; histograma de r8 medio):
  1. CHM: radio de copa medido sobre el CHM de 1 m de las teselas, en 8 direcciones desde el centro (umbral max(1,2 m; 0,35·h), como el
     exportador), frente a r8. Si r8 es radio, el cociente sale ≈ 1; si fuera diámetro, ≈ 0,5.
  2. Ortofoto: brillo medio en el núcleo (< 0,4·r8), en el anillo 0,5-1,0·r8 y fuera (1,1-1,4·r8), con la ortofoto corrida `--desfase` m al
     este (la ortofoto PNOA muestra las copas ~1,1-1,4 m al este, ADR-0006). La copa es más oscura que el suelo: si r8 es radio, el anillo
     0,5-1,0 se parece al núcleo y el de fuera al suelo.
  3. Solapes: % de olivos cuya copa (factorR8 = 1) entra > 0,5 m en la de un vecino (y con 0,5).
Dependencias: numpy y pillow (requirements.txt).
"""
import argparse
import base64
import json
import math
import os

import numpy as np
from PIL import Image, ImageDraw


def radio_en(r8, ang):
    f = (ang % (2 * math.pi)) / (2 * math.pi) * 8
    i0 = int(math.floor(f)) % 8
    t = f - math.floor(f)
    return r8[i0] * (1 - t) + r8[(i0 + 1) % 8] * t


def carga(finca):
    I = json.load(open(os.path.join(finca, "indice.json"), encoding="utf-8"))
    ts = I["ts"]; cx, cy = I["centro_utm"]
    tes = {}
    for k, v in I["teselas"].items():
        f = os.path.join(finca, "t", k + ".json")
        if not os.path.exists(f):
            continue
        T = json.load(open(f, encoding="utf-8"))
        n = int(round(ts / I["res"]))
        chm = np.frombuffer(base64.b64decode(T["chm"]), np.uint8).reshape(n, n) / 10.0      # filas de sur a norte, en m
        jpg = os.path.join(finca, "t", k + ".jpg")
        img = np.asarray(Image.open(jpg).convert("RGB"), np.float32) if os.path.exists(jpg) else None
        tes[(v["kx"], v["ky"])] = dict(ox=v["kx"] * ts - cx, oy=v["ky"] * ts - cy, chm=chm, img=img, n=n)
    return I, tes


def muestra_chm(tes, ts, res, x, y):
    for t in tes.values():
        if t["ox"] <= x < t["ox"] + ts and t["oy"] <= y < t["oy"] + ts:
            i = int((x - t["ox"]) / res); j = int((y - t["oy"]) / res)
            return t["chm"][j, i]
    return None


def brillo(tes, ts, x, y):
    for t in tes.values():
        if t["img"] is not None and t["ox"] <= x < t["ox"] + ts and t["oy"] <= y < t["oy"] + ts:
            H, W = t["img"].shape[:2]
            u = int((x - t["ox"]) / ts * W); v = int((ts - (y - t["oy"])) / ts * H)
            if 0 <= u < W and 0 <= v < H:
                return float(t["img"][v, u].mean())
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--finca", default=os.path.dirname(os.environ.get("GEMELO_DATOS", "")) or None)
    ap.add_argument("--salida", required=True)
    ap.add_argument("--desfase", type=float, default=1.25)
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    I, tes = carga(a.finca)
    ts, res = I["ts"], I["res"]
    C = [c for c in I["copas"]]
    r8m = np.array([np.mean(c[3]) for c in C])
    # 1. CHM
    cocientes, rchm = [], []
    for c in C:
        umbral = max(1.2, 0.35 * c[2]); rr = []
        for k in range(8):
            th = k * math.pi / 4; d = 0.0
            for st in range(1, 41):
                s = st * 0.25
                v = muestra_chm(tes, ts, res, c[0] + math.cos(th) * s, c[1] + math.sin(th) * s)
                if v is None or v < umbral:
                    break
                d = s
            rr.append(d)
        m = float(np.mean(rr)); rchm.append(m)
        if np.mean(c[3]) > 0:
            cocientes.append(m / np.mean(c[3]))
    # 2. ortofoto
    nucleo, anillo, fuera = [], [], []
    for c in C:
        def media(f0, f1):
            v = []
            for k in range(16):
                th = k * math.pi / 8; r = radio_en(c[3], th)
                for f in np.linspace(f0, f1, 4):
                    b = brillo(tes, ts, c[0] + math.cos(th) * r * f + a.desfase, c[1] + math.sin(th) * r * f)
                    if b is not None:
                        v.append(b)
            return float(np.mean(v)) if v else None
        n_, an, fu = media(0.0, 0.4), media(0.5, 1.0), media(1.1, 1.4)
        if None not in (n_, an, fu):
            nucleo.append(n_); anillo.append(an); fuera.append(fu)
    # 3. solapes
    xy = np.array([[c[0], c[1]] for c in C])
    sol = {0.5: set(), 1.0: set()}
    for i in range(len(C)):
        d = np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1])
        for j in np.nonzero((d > 0) & (d < 14))[0]:
            th = math.atan2(xy[j, 1] - xy[i, 1], xy[j, 0] - xy[i, 0])
            for f in sol:
                if f * (radio_en(C[i][3], th) + radio_en(C[j][3], th + math.pi)) - d[j] > 0.5:
                    sol[f].add(i)
    vecino = []
    for i in range(len(C)):
        d = np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1]); d[i] = 1e9; vecino.append(float(d.min()))
    hist, bordes = np.histogram(r8m, bins=np.arange(0, 7.01, 0.5))
    out = dict(
        copas=len(C), r8_medio=dict(media=round(float(r8m.mean()), 2), p5=round(float(np.percentile(r8m, 5)), 2), p50=round(float(np.percentile(r8m, 50)), 2), p95=round(float(np.percentile(r8m, 95)), 2)),
        altura_media=round(float(np.mean([c[2] for c in C])), 2),
        vecino_mas_cercano=dict(p5=round(float(np.percentile(vecino, 5)), 2), p50=round(float(np.percentile(vecino, 50)), 2)),
        chm=dict(radio_medio=round(float(np.mean(rchm)), 2), cociente_radio_chm_entre_r8=dict(media=round(float(np.mean(cocientes)), 3), p50=round(float(np.median(cocientes)), 3))),
        ortofoto=dict(desfase_m=a.desfase, copas=len(nucleo), brillo_nucleo=round(float(np.mean(nucleo)), 1), brillo_anillo_05_10=round(float(np.mean(anillo)), 1), brillo_fuera_11_14=round(float(np.mean(fuera)), 1)),
        solapes_05m=dict(factor_05=round(100 * len(sol[0.5]) / len(C), 1), factor_1=round(100 * len(sol[1.0]) / len(C), 1)),
        histograma_r8_medio=dict(bordes=[float(b) for b in bordes], cuentas=[int(h) for h in hist]))
    json.dump(out, open(os.path.join(a.salida, "r8_medidas.json"), "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    # cenital: ventana de 80 m alrededor de la copa con más vecinos
    dens = [(np.sum(np.hypot(xy[:, 0] - x, xy[:, 1] - y) < 40), x, y) for x, y in xy]
    _, X0, Y0 = max(dens)
    L, ESC = 80.0, 10           # m, px por m
    lienzo = Image.new("RGB", (int(L * ESC), int(L * ESC)), (128, 128, 128)); px = lienzo.load()
    for u in range(lienzo.width):
        for v in range(lienzo.height):
            x = X0 - L / 2 + (u + 0.5) / ESC + a.desfase; y = Y0 + L / 2 - (v + 0.5) / ESC
            for t in tes.values():
                if t["img"] is not None and t["ox"] <= x < t["ox"] + ts and t["oy"] <= y < t["oy"] + ts:
                    H, W = t["img"].shape[:2]; p = t["img"][min(H - 1, int((ts - (y - t["oy"])) / ts * H)), min(W - 1, int((x - t["ox"]) / ts * W))]
                    px[u, v] = (int(p[0]), int(p[1]), int(p[2])); break
    g = ImageDraw.Draw(lienzo)
    for c in C:
        if abs(c[0] - X0) > L / 2 + 6 or abs(c[1] - Y0) > L / 2 + 6:
            continue
        for f, col in ((0.5, (255, 220, 0)), (1.0, (230, 30, 30))):
            pts = [((c[0] + math.cos(k * math.pi / 16) * radio_en(c[3], k * math.pi / 16) * f - (X0 - L / 2)) * ESC,
                    ((Y0 + L / 2) - (c[1] + math.sin(k * math.pi / 16) * radio_en(c[3], k * math.pi / 16) * f)) * ESC) for k in range(33)]
            g.line(pts, fill=col, width=2)
    lienzo.save(os.path.join(a.salida, "r8_cenital.png"))
    hi = Image.new("RGB", (560, 260), (250, 250, 248)); gh = ImageDraw.Draw(hi); mx = max(hist)
    for k, h in enumerate(hist):
        x0 = 30 + k * 36; gh.rectangle([x0, 230 - h / mx * 200, x0 + 30, 230], fill=(95, 107, 60)); gh.text((x0, 235), "%.1f" % bordes[k], fill=(40, 40, 40)); gh.text((x0, 215 - h / mx * 200), str(int(h)), fill=(40, 40, 40))
    gh.text((30, 8), "r8 medio por olivo (m), %d copas" % len(C), fill=(40, 40, 40))
    hi.save(os.path.join(a.salida, "r8_histograma.png"))
    print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
