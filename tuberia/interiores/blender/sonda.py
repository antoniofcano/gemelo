# La sonda de luz de un mundo interior (contratos/mundo-interior.md §1c, `luz.sonda`), en Python puro: de muestras de radiancia
# (dirección en el marco de Blender, color RGB lineal y ángulo sólido) a los 9 coeficientes RGB de armónicos esféricos de orden 2
# en el marco del glb, en el orden y la normalización de three (SphericalHarmonics3 / LightProbeGenerator: proyección de la
# radiancia sobre la base, reescalada a 4π con el peso total). hornea.py la usa con las seis caras de un cubo renderizadas en
# Cycles desde el centro de la sala (y desde el pivote de cada máquina); lo vigila pruebas/guardianes/interiores_blender.test.js.
#   python sonda.py -- <muestras.json> <sonda.json>     muestras.json: [[[dx, dy, dz], [r, g, b], peso], …]
import json, math, sys


def a_glb(d):
    """Dirección de Blender (Z arriba) al marco del glb (Y arriba): (x, z, −y)"""
    return (d[0], d[2], -d[1])


def base(x, y, z):
    """Los 9 armónicos reales de three (SphericalHarmonics3.getBasisAt), dirección unitaria en el marco del glb"""
    return (0.282095, 0.488603 * y, 0.488603 * z, 0.488603 * x, 1.092548 * x * y, 1.092548 * y * z,
            0.315392 * (3 * z * z - 1), 1.092548 * x * z, 0.546274 * (x * x - y * y))


def peso_cubo(u, v):
    """Ángulo sólido de un téxel de una cara de cubo en (u, v) ∈ [−1, 1], sin el área del téxel"""
    return 1.0 / (u * u + v * v + 1.0) ** 1.5


def sh9(muestras):
    """muestras: [(dir_blender, rgb, peso)] → [[r, g, b]] × 9"""
    c = [[0.0, 0.0, 0.0] for _ in range(9)]; total = 0.0
    for d, rgb, w in muestras:
        n = math.sqrt(sum(x * x for x in d))
        if n < 1e-12 or w <= 0:
            continue
        g = a_glb([x / n for x in d]); b = base(*g); total += w
        for i in range(9):
            for k in range(3):
                c[i][k] += b[i] * rgb[k] * w
    if total <= 0:
        raise ValueError("sin muestras")
    k = 4 * math.pi / total
    return [[round(v * k, 5) for v in fila] for fila in c]


def escala(sonda, f):
    return [[round(v * f, 5) for v in fila] for fila in sonda]


if __name__ == "__main__":
    a = sys.argv[sys.argv.index("--") + 1:]
    if len(a) < 2:
        raise SystemExit("uso: python sonda.py -- <muestras.json> <sonda.json>")
    json.dump(sh9(json.load(open(a[0], encoding="utf-8"))), open(a[1], "w", encoding="utf-8"))
