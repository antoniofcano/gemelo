# Agrupa los trozos sueltos de una malla (los escribe inventario.py en trozos.json) en piezas con sentido y escribe el
# inventario en el marco del mundo interior. Python puro, sin Blender: se puede volver a agrupar con otros umbrales sin
# abrir la escena, y lo vigila pruebas/guardianes/interiores_blender.test.js.
#   python piezas.py -- <trozos.json> <inventario.json> [--pequeno 0.25]
# trozos.json: {"objeto": "…", "origen_blender": [ox, oy, oz], "soldadura_m": 0.0005, "toque_m": 0.01,
#   "trozos": [{"id": 0, "caras": n, "triangulos": n, "min": [x, y, z], "max": [x, y, z], "materiales": ["…"], "toca": [ids]}]}
# (coordenadas de Blender, Z arriba; «toca»: otros trozos a menos de toque_m, medido en Blender con un BVH).
# Criterio (el mismo que se escribe en el inventario):
#   - un trozo es PEQUEÑO si la diagonal de su caja es menor que `pequeno_m` (tornillos, tuercas, arandelas, chavetas, remaches);
#   - los pequeños que se tocan entre sí forman un racimo; el racimo va con el trozo NO pequeño más grande (por diagonal)
#     que toque a alguno de sus trozos: así una tuerca va con la columna en la que está, y una tuerca entre una rueda y su
#     eje va con la rueda, que es lo que se mueve con ella;
#   - un racimo que no toca nada grande es una pieza por sí mismo (lo que está suelto en una mesa, una cartela);
#   - los trozos NO pequeños no se juntan entre sí aunque se toquen: un rulo y su cuba son dos piezas, porque en la 1.1
#     uno gira y la otra no. Juntar máquinas enteras es trabajo de la identificación, no de la geometría.
# Las piezas se numeran por diagonal (de mayor a menor) y, a igualdad, por posición: n = 1 es la más grande.
# Encima, CONJUNTOS (lo que en la sala se ve como una máquina): las piezas que se tocan, salvo las que hacen de PUENTE entre
# máquinas sin ser parte de ninguna, que quedan como conjunto propio: las correas (material de PUENTE_MATERIALES, cuero:
# tocan la polea de arriba y la de abajo) y lo LINEAL (una pieza de ≥ LINEAL_LARGO_M de largo y ≤ LINEAL_GRUESO_M en las
# otras dos medidas: carriles de la vía, el eje largo del techo, que si no unirían todas las máquinas que tocan).
# Los conjuntos se numeran igual que las piezas (C01 el de mayor diagonal).
# Marco del mundo (exporta.py, mundo.json): (x, y, z)_mundo = (x − ox, z − oz, −(y − oy))_blender; tamaños (dx, dz, dy).
import json, math, sys

PUENTE_MATERIALES = ("m_cuero",)
LINEAL_LARGO_M, LINEAL_GRUESO_M = 3.0, 0.12
MARCO = "mundo interior: origen en el umbral de la puerta principal, metros, +Y arriba (como mundo.json)"


def diagonal(t):
    return math.sqrt(sum((t["max"][k] - t["min"][k]) ** 2 for k in range(3)))


class Conjuntos:
    """Unión-búsqueda sobre ids"""
    def __init__(self, ids):
        self.p = {i: i for i in ids}

    def raiz(self, i):
        while self.p[i] != i:
            self.p[i] = self.p[self.p[i]]; i = self.p[i]
        return i

    def une(self, a, b):
        a, b = self.raiz(a), self.raiz(b)
        if a != b:
            self.p[max(a, b)] = min(a, b)


def agrupa(trozos, pequeno_m):
    """Lista de grupos (listas de ids de trozo) según el criterio de la cabecera"""
    por_id = {t["id"]: t for t in trozos}
    diag = {t["id"]: diagonal(t) for t in trozos}
    pequeno = {i for i, d in diag.items() if d < pequeno_m}
    c = Conjuntos(por_id)
    for i in pequeno:
        for j in por_id[i]["toca"]:
            if j in pequeno:
                c.une(i, j)
    racimos = {}
    for i in pequeno:
        racimos.setdefault(c.raiz(i), []).append(i)
    grupos = {i: [i] for i in por_id if i not in pequeno}
    for r, miembros in racimos.items():
        grandes = {j for i in miembros for j in por_id[i]["toca"] if j not in pequeno}
        if grandes:
            dueno = max(grandes, key=lambda j: (diag[j], -j))
            grupos[dueno].extend(miembros)
        else:
            grupos[min(miembros)] = list(miembros)
    return [sorted(g) for g in grupos.values()]


def es_puente(p):
    """Correa o pieza lineal (cabecera): no une conjuntos"""
    if any(m in PUENTE_MATERIALES for m in p["materiales"]):
        return True
    med = sorted(p["_mx"][k] - p["_mn"][k] for k in range(3))
    return med[2] >= LINEAL_LARGO_M and med[1] <= LINEAL_GRUESO_M


def conjuntos(filas, por_id):
    """Grupos de índices de `filas` (piezas) que se tocan, sin pasar por los puentes"""
    de_trozo = {t: i for i, f in enumerate(filas) for t in f["trozos"]}
    puente = [es_puente(f) for f in filas]
    c = Conjuntos(range(len(filas)))
    for i, f in enumerate(filas):
        if puente[i]:
            continue
        for t in f["trozos"]:
            for u in por_id[t]["toca"]:
                j = de_trozo[u]
                if not puente[j]:
                    c.une(i, j)
    g = {}
    for i in range(len(filas)):
        g.setdefault(c.raiz(i), []).append(i)
    return list(g.values()), puente


def caja(ts):
    mn = [min(t["min"][k] for t in ts) for k in range(3)]
    mx = [max(t["max"][k] for t in ts) for k in range(3)]
    return mn, mx


def a_mundo(mn, mx, origen):
    """Caja de Blender (mín, máx) → {centro, tamano} en el marco del mundo interior"""
    ox, oy, oz = origen; r = lambda v: round(v, 3)
    cx, cy, cz = ((mn[k] + mx[k]) / 2 for k in range(3))
    return {"centro": [r(cx - ox), r(cz - oz), r(-(cy - oy))], "tamano": [r(mx[0] - mn[0]), r(mx[2] - mn[2]), r(mx[1] - mn[1])]}


def inventario(datos, pequeno_m):
    trozos = datos["trozos"]; por_id = {t["id"]: t for t in trozos}
    filas = []
    for g in agrupa(trozos, pequeno_m):
        ts = [por_id[i] for i in g]; mn, mx = caja(ts)
        filas.append({"trozos": g, "_mn": mn, "_mx": mx, "_diag": math.dist(mn, mx),
                      "triangulos": sum(t["triangulos"] for t in ts), "caras": sum(t["caras"] for t in ts),
                      "materiales": sorted({m for t in ts for m in t["materiales"]})})
    filas.sort(key=lambda f: (-round(f["_diag"], 4), f["_mn"][0], f["_mn"][1], f["_mn"][2]))
    grupos, puente = conjuntos(filas, por_id)
    cajas = []
    for g in grupos:
        mn = [min(filas[i]["_mn"][k] for i in g) for k in range(3)]; mx = [max(filas[i]["_mx"][k] for i in g) for k in range(3)]
        cajas.append((g, mn, mx))
    cajas.sort(key=lambda c: (-round(math.dist(c[1], c[2]), 4), c[1][0], c[1][1], c[1][2]))
    de_fila = {i: k + 1 for k, (g, _, _) in enumerate(cajas) for i in g}
    piezas = []
    for n, f in enumerate(filas, 1):
        piezas.append({"id": "p%03d" % n, "n": n, "conjunto": "C%02d" % de_fila[n - 1], "triangulos": f["triangulos"], "caras": f["caras"],
                       "trozos": len(f["trozos"]), "caja": a_mundo(f["_mn"], f["_mx"], datos["origen_blender"]),
                       "caja_blender": {"min": [round(v, 4) for v in f["_mn"]], "max": [round(v, 4) for v in f["_mx"]]},
                       "materiales": f["materiales"], "ids_trozo": f["trozos"]})
    conj = []
    for k, (g, mn, mx) in enumerate(cajas, 1):
        ps = sorted(i + 1 for i in g)
        conj.append({"id": "C%02d" % k, "n": k, "piezas": ["p%03d" % n for n in ps], "puente": len(g) == 1 and puente[g[0]],
                     "triangulos": sum(filas[i]["triangulos"] for i in g), "caja": a_mundo(mn, mx, datos["origen_blender"]),
                     "caja_blender": {"min": [round(v, 4) for v in mn], "max": [round(v, 4) for v in mx]},
                     "materiales": sorted({m for i in g for m in filas[i]["materiales"]})})
    return {
        "v": 1, "objeto": datos["objeto"], "marco": MARCO, "origen_blender": datos["origen_blender"],
        "criterio": {"soldadura_m": datos["soldadura_m"], "toque_m": datos["toque_m"], "pequeno_m": pequeno_m,
                     "puente_materiales": list(PUENTE_MATERIALES), "lineal_largo_m": LINEAL_LARGO_M, "lineal_grueso_m": LINEAL_GRUESO_M,
                     "texto": "trozos sueltos tras soldar a soldadura_m; los de diagonal < pequeno_m que tocan (a menos de toque_m) "
                              "a uno mayor van con el mayor que tocan; los demás trozos son piezas por sí mismos. Conjuntos: piezas "
                              "que se tocan, sin pasar por las correas ni por lo lineal (carriles, ejes largos), que son conjunto propio"},
        "trozos": len(trozos), "triangulos": sum(t["triangulos"] for t in trozos), "piezas": piezas, "conjuntos": conj}


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    if len(a) < 2:
        raise SystemExit("uso: python piezas.py -- <trozos.json> <inventario.json> [--pequeno 0.25]")
    o = {"trozos": a[0], "salida": a[1], "pequeno": 0.25}
    i = 2
    while i < len(a):
        o[a[i].lstrip("-")] = float(a[i + 1]); i += 2
    return o


if __name__ == "__main__":
    a = argumentos()
    inv = inventario(json.load(open(a["trozos"], encoding="utf-8")), a["pequeno"])
    json.dump(inv, open(a["salida"], "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("PIEZAS", json.dumps({"trozos": inv["trozos"], "piezas": len(inv["piezas"]), "conjuntos": len(inv["conjuntos"]), "triangulos": inv["triangulos"]}))
