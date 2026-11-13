# Las máquinas de la fábrica 1.1, en Python puro (sin Blender): de la identificación de piezas (identificacion.json, grupos de
# piezas del inventario con su caja en el marco del mundo) y de una configuración privada (maquinas.json) sale el PLAN: qué
# piezas forman cada máquina, su nodo, su pivote y su eje, quién cuelga de quién, su velocidad o su relación con otra, y lo que
# queda fijo. Lo usa maquinas.py (Blender) para juntar las piezas y exporta.py para escribir maquinas[] del manifiesto
# (contratos/mundo-interior.md §1d). Lo vigila pruebas/guardianes/interiores_blender.test.js.
#   python maquinas_def.py -- <identificacion.json> <inventario.json> <maquinas.json> <plan.json>    (comprueba la configuración)
# maquinas.json (privado, junto al .blend; el marco es el del mundo: metros, +Y arriba, como mundo.json):
#   {"maquinas": [{"id": "eje_techo", "nombre": "…", "grupos": ["eje_techo"], "piezas": ["p…"], "excluye": ["p…"],
#      "tipo": "giro|vaiven|traslacion|textura", "pivote": "centro" | "centro:<grupo>" | "suelo" | [x, y, z], "ajuste": [dx, dy, dz],
#      "objetos": ["<objeto de Blender>"]  (piezas nuevas que no están en el inventario, p. ej. las de maquinas.py correas_propias;
#                                          con ellas, «caja» {"centro", "tamano"} en el marco del mundo si el pivote es «centro»),
#      "eje": "x|y|z|-x|-y|-z" | "radial:<id>" | [x, y, z], "padre": "<id>",
#      "velocidad": n  |  "relacion": {"con": "<id>", "factor": n | "rodadura" | {"radios": ["p_motriz", "p_movida"]} | {"correa": "p_polea"}
#                                       | {"radios_m": [r_motriz, r_movida]} | {"correa_radio": r},
#                                       "signo": 1|-1},
#      "recorrido": m, "pausa_s": s, "material": "m_cuero", "uv": [u, v], "luz": "propia|horneada", "fuente": "ilustrativo|deducido",
#      "nota": "…"}]}
#   - pivote «centro»: el de la caja de sus piezas; «centro:<grupo>»: el de la caja de un grupo de la identificación; «suelo»: el
#     centro en planta a la cota más baja de sus piezas;
#   - eje «radial:<id>»: horizontal, del pivote de la máquina <id> (su padre, normalmente) hacia el suyo (un rulo);
#   - factor «rodadura»: lo que gira una pieza que rueda sin deslizar mientras su padre la lleva alrededor: −R / r (R, distancia en
#     planta del eje del padre a su pivote; r, su radio); {"radios": [a, b]}: dos poleas con correa, r(a) / r(b); {"correa": p}: una
#     textura que corre con la polea p: 2π r(p) / 60 × UV por metro (lo mide maquinas.py en la malla de la correa). «signo» da la vuelta.
#   El radio de una pieza es la mitad de su mayor medida de caja de las que no van a lo largo del eje.
# Marco: (x, y, z)_mundo = (x − ox, z − oz, −(y − oy))_blender, con «origen_blender» del inventario.
import json, math, sys

EJES = {"x": [1, 0, 0], "y": [0, 1, 0], "z": [0, 0, 1]}
TIPOS = ("giro", "vaiven", "traslacion", "textura")
PREFIJO = "maq_"


def a_blender(p, origen):
    ox, oy, oz = origen
    return [p[0] + ox, oy - p[2], p[1] + oz]


def eje_a_blender(e):
    return [e[0], -e[2], e[1]]


def unitario(v):
    n = math.sqrt(sum(x * x for x in v))
    if n < 1e-9:
        raise ValueError("eje nulo")
    return [x / n for x in v]


def caja(cajas):
    """{centro, tamano} de varias cajas {centro, tamano} → {min, max, centro, tamano}"""
    mn = [min(c["centro"][k] - c["tamano"][k] / 2 for c in cajas) for k in range(3)]
    mx = [max(c["centro"][k] + c["tamano"][k] / 2 for c in cajas) for k in range(3)]
    return {"min": mn, "max": mx, "centro": [(a + b) / 2 for a, b in zip(mn, mx)], "tamano": [b - a for a, b in zip(mn, mx)]}


def radio(tamano, eje):
    """La mitad de la mayor medida que no va a lo largo del eje"""
    return max(t for t, e in zip(tamano, eje) if abs(e) < 0.9) / 2


def r(v, n=4):
    return [round(x, n) for x in v] if isinstance(v, list) else round(v, n)


def resuelve(ident, inv, conf, medidas=None):
    """→ (plan, errores). medidas: {id: {"uv_por_metro": n, "uv": [u, v]}} de maquinas.py (para las texturas)."""
    medidas = medidas or {}
    P = {p["id"]: p for p in inv["piezas"]}; G = ident["grupos"]; errores = []
    tomadas, maqs, por_id = {}, [], {}
    for c in conf["maquinas"]:
        mid = c["id"]
        if mid in por_id:
            errores.append("máquina repetida: " + mid); continue
        if c.get("tipo") not in TIPOS:
            errores.append(mid + ": tipo desconocido " + str(c.get("tipo"))); continue
        ids = set(c.get("piezas", []))
        for g in c.get("grupos", []):
            if g not in G:
                errores.append(mid + ": grupo desconocido " + g)
            else:
                ids |= set(G[g]["piezas"])
        ids -= set(c.get("excluye", []))
        ids = sorted(ids)
        for i in ids:
            if i not in P:
                errores.append(mid + ": pieza desconocida " + i)
            elif i in tomadas:
                errores.append(mid + ": la pieza " + i + " ya es de " + tomadas[i])
            else:
                tomadas[i] = mid
        objetos = list(c.get("objetos", []))
        if (not ids and not objetos) or any(i not in P for i in ids):
            if not ids and not objetos:
                errores.append(mid + ": sin piezas")
            continue
        cajas = [P[i]["caja"] for i in ids] + ([c["caja"]] if c.get("caja") else [])
        cj = caja(cajas) if cajas else {"min": [0, 0, 0], "max": [0, 0, 0], "centro": [0, 0, 0], "tamano": [0, 0, 0]}
        pv = c.get("pivote", "centro")
        if pv == "centro":
            piv = list(cj["centro"])
        elif pv == "suelo":
            piv = [cj["centro"][0], cj["min"][1], cj["centro"][2]]
        elif isinstance(pv, str) and pv.startswith("centro:"):
            g = pv.split(":", 1)[1]
            if g not in G:
                errores.append(mid + ": pivote en un grupo desconocido " + g); continue
            piv = list(G[g]["caja"]["centro"])
        elif isinstance(pv, list) and len(pv) == 3:
            piv = [float(x) for x in pv]
        else:
            errores.append(mid + ": pivote no válido " + str(pv)); continue
        piv = [a + b for a, b in zip(piv, c.get("ajuste", [0, 0, 0]))]
        q = {"id": mid, "nombre": c.get("nombre", mid), "nodo": PREFIJO + mid, "tipo": c["tipo"], "piezas": ids, "objetos": objetos, "caja": {k: r(v) for k, v in cj.items()},
             "pivote": piv, "padre": c.get("padre"), "luz": c.get("luz", "propia" if c["tipo"] in ("giro", "traslacion") else "horneada"),
             "fuente": c.get("fuente", "ilustrativo"), "_c": c}
        for k in ("recorrido", "pausa_s", "nota"):
            if k in c:
                q[k] = c[k]
        if q["luz"] not in ("propia", "horneada") or q["fuente"] not in ("ilustrativo", "deducido"):
            errores.append(mid + ": luz o fuente no válidas"); continue
        maqs.append(q); por_id[mid] = q
    # ejes, padres y velocidades (pueden mirar a otras máquinas)
    for q in maqs:
        c = q["_c"]; mid = q["id"]
        if q["padre"] is not None and q["padre"] not in por_id:
            errores.append(mid + ": padre desconocido " + str(q["padre"])); q["padre"] = None
        e = c.get("eje")
        try:
            if q["tipo"] == "textura":
                q["eje"] = None
            elif isinstance(e, str) and e.lstrip("-") in EJES:
                q["eje"] = [(-1 if e.startswith("-") else 1) * x for x in EJES[e.lstrip("-")]]
            elif isinstance(e, str) and e.startswith("radial:"):
                o = por_id[e.split(":", 1)[1]]["pivote"]
                q["eje"] = unitario([q["pivote"][0] - o[0], 0, q["pivote"][2] - o[2]])
            elif isinstance(e, list):
                q["eje"] = unitario(e)
            else:
                raise ValueError("eje no válido " + str(e))
        except (KeyError, ValueError) as x:
            errores.append(mid + ": " + str(x)); q["eje"] = [0, 1, 0]
        if q["tipo"] == "textura":
            m = medidas.get(mid, {})
            mats = sorted({x for i in q["piezas"] for x in P[i]["materiales"]}) or [c.get("material", "?")]
            base = c.get("material") or (mats[0] if len(mats) == 1 else None)
            if base is None:
                errores.append(mid + ": la textura tiene varios materiales " + str(mats) + ": di cuál corre"); base = mats[0]
            q["material_base"] = base; q["material"] = base + "__" + q["nodo"]
            q["uv"] = r(unitario(m.get("uv") or c.get("uv") or [0, 1]))
    for q in maqs:
        c = q["_c"]; mid = q["id"]
        if ("velocidad" in c) == ("relacion" in c):
            errores.append(mid + ": velocidad o relacion, una sola"); continue
        if "velocidad" in c:
            q["velocidad"] = float(c["velocidad"]); continue
        rel = c["relacion"]; con = por_id.get(rel.get("con"))
        if con is None:
            errores.append(mid + ": relación con una máquina desconocida " + str(rel.get("con"))); continue
        f = rel.get("factor"); signo = rel.get("signo", 1)
        try:
            if isinstance(f, (int, float)):
                k = float(f)
            elif f == "rodadura":
                pa = por_id[q["padre"]]["pivote"] if q["padre"] else con["pivote"]
                R = math.hypot(q["pivote"][0] - pa[0], q["pivote"][2] - pa[2])
                k = -R / radio(q["caja"]["tamano"], q["eje"])
            elif isinstance(f, dict) and "radios" in f:
                a, b = f["radios"]
                k = radio(P[a]["caja"]["tamano"], con["eje"]) / radio(P[b]["caja"]["tamano"], q["eje"])
            elif isinstance(f, dict) and "radios_m" in f:
                k = float(f["radios_m"][0]) / float(f["radios_m"][1])
            elif isinstance(f, dict) and ("correa" in f or "correa_radio" in f):
                upm = medidas.get(mid, {}).get("uv_por_metro") or c.get("uv_por_metro")
                if not upm:
                    raise ValueError("falta la medida uv_por_metro (la da maquinas.py)")
                rp = float(f["correa_radio"]) if "correa_radio" in f else radio(P[f["correa"]]["caja"]["tamano"], con["eje"])
                k = 2 * math.pi * rp / 60 * upm
            else:
                raise ValueError("factor no válido " + str(f))
        except (KeyError, ValueError, TypeError) as x:
            errores.append(mid + ": " + str(x)); continue
        q["relacion"] = {"con": con["id"], "factor": round(k * signo, 4)}
    # relaciones y padres sin ciclos
    for clave in ("padre", "relacion"):
        sig = {q["id"]: (q.get(clave) if clave == "padre" else (q.get("relacion") or {}).get("con")) for q in maqs}
        for q in maqs:
            vistos, k = {q["id"]}, sig[q["id"]]
            while k is not None and k not in vistos:
                vistos.add(k); k = sig.get(k)
            if k is not None:
                errores.append(q["id"] + ": su " + clave + " forma un ciclo")
    for q in maqs:
        q.pop("_c")
    fijas = sorted(i for i in P if i not in tomadas)
    origen = inv["origen_blender"]
    for q in maqs:
        q["pivote_blender"] = r(a_blender(q["pivote"], origen)); q["pivote"] = r(q["pivote"])
        q["eje_blender"] = r(eje_a_blender(q["eje"])) if q.get("eje") else None
        if q.get("eje"):
            q["eje"] = r(q["eje"])
    plan = {"v": 1, "origen_blender": origen, "maquinas": maqs, "fijas": fijas,
            "triangulos": {"moviles": sum(P[i]["triangulos"] for q in maqs for i in q["piezas"]), "fijas": sum(P[i]["triangulos"] for i in fijas)}}
    return plan, errores


def manifiesto(plan, desplaza=(0, 0, 0)):
    """maquinas[] del contrato (§1d). desplaza: lo que se resta al pivote si el origen del glb no es el del inventario"""
    sal = []
    for q in plan["maquinas"]:
        m = {"id": q["id"], "nombre": q["nombre"][:60], "nodo": q["nodo"], "tipo": q["tipo"]}
        if q["tipo"] != "textura":
            m["pivote"] = [round(a - b, 3) for a, b in zip(q["pivote"], desplaza)]; m["eje"] = q["eje"]
        for k in ("recorrido", "pausa_s", "material", "uv", "velocidad", "relacion"):
            if k in q:
                m[k] = q[k]
        m["luz"] = q["luz"]; m["fuente"] = q["fuente"]
        if q.get("nota"):
            m["nota"] = q["nota"][:200]
        sal.append(m)
    return sal


def obstaculos(inv, zonas, alto=(0.05, 2.0), excluye=()):
    """Piezas que ocupan una zona por donde se anda (zonas: [{id, x0, z0, x1, z1, y}] en el marco del mundo) entre alto[0] y alto[1]
    metros sobre su suelo: un aviso para el repaso del pasillo, no se mueve nada"""
    sal = []
    for p in inv["piezas"]:
        if p["id"] in excluye:
            continue
        c, t = p["caja"]["centro"], p["caja"]["tamano"]
        for z in zonas:
            if c[0] + t[0] / 2 > z["x0"] and c[0] - t[0] / 2 < z["x1"] and c[2] + t[2] / 2 > z["z0"] and c[2] - t[2] / 2 < z["z1"] \
                    and c[1] - t[1] / 2 < z["y"] + alto[1] and c[1] + t[1] / 2 > z["y"] + alto[0]:
                sal.append({"pieza": p["id"], "zona": z["id"], "conjunto": p["conjunto"]})
    return sal


def candidatos_flotantes(inv, sobre=0.03):
    """Conjuntos (no puentes) cuyo punto más bajo está a más de `sobre` m del suelo del mundo (y = 0): los que maquinas.py mira si
    tocan algo (la obra, otra máquina); lo que no toca nada, flota"""
    sal = []
    for c in inv["conjuntos"]:
        y0 = c["caja"]["centro"][1] - c["caja"]["tamano"][1] / 2
        if not c["puente"] and y0 > sobre:
            sal.append({"conjunto": c["id"], "piezas": c["piezas"], "y_min": round(y0, 3)})
    return sal


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    if len(a) < 4:
        raise SystemExit("uso: python maquinas_def.py -- <identificacion.json> <inventario.json> <maquinas.json> <plan.json>")
    return a


if __name__ == "__main__":
    a = argumentos()
    lee = lambda f: json.load(open(f, encoding="utf-8"))
    plan, errores = resuelve(lee(a[0]), lee(a[1]), lee(a[2]))
    plan["errores"] = errores
    json.dump(plan, open(a[3], "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    print("MAQUINAS", json.dumps({"maquinas": len(plan["maquinas"]), "fijas": len(plan["fijas"]), "triangulos": plan["triangulos"], "errores": len(errores)}))
    for e in errores:
        print("  x", e)
    sys.exit(1 if errores else 0)
