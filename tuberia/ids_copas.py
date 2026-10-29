"""Columnas paralelas del registro de árboles (ADR-0012, CONTRATOS §1.1): `copas_id` (id estable) y `copas_tipo` (olivo-tipo).
Python puro, sin numpy: lo usan los exportadores (finca_8_teselas.py para Cerro y la réplica, hituelo_conv.py) y lo prueba
pruebas/guardianes/exportadores.test.js sin datos reales.

De dónde sale el id (decisión de Antonio, 2026-10-29)
-----------------------------------------------------
**La identidad la da el censo de OlivarTrack; la geometría, el LiDAR.** El id es además la semilla del generador de olivos.

1. **id del censo** — si la copa LiDAR está emparejada con un olivo marcado en OlivarTrack que trae id, `copas_id` = ese id.
   Rango: [0, 2^31). Hoy las marcas de OlivarTrack que llegan a los exportadores NO traen id (Hituelo: `[E, N]`; Cerro: `{lng, lat}`),
   así que hoy no sale ninguno: falta el campo (ver CONTRATOS §1.1, «id del censo»).
2. **id provisional** — si no hay marca con id: un id de reserva sacado de la POSICIÓN UTM ABSOLUTA de la copa,
   en el rango [2^31, 2^32) para que nunca choque con uno del censo (id >= 2^31 ⇔ provisional):

       E_m, N_m = metro UTM entero que contiene la copa (floor, tras redondear la coordenada al centímetro)
       id       = 2^31 + (E_m mod 32768) · 65536 + (N_m mod 65536)        → cabe en un Uint32 (en 3D Tiles se resuelve en CPU: TILES3D.md)

   No depende del orden de `copas` ni de `centro_utm` (en Hituelo se deduce de la caja del NDVI). Único mientras la finca quepa en
   32,7 km (E) × 65,5 km (N); si no, el exportador se para. Resolución de 1 m.
   **Colisiones** (dos copas en la misma celda de 1 m): se ordenan por (E_cm, N_cm, h, r8); la primera se queda el id de su celda; las
   demás, cuando ya están puestas TODAS las primeras de la finca, toman el de la celda libre más cercana en anillos crecientes (orden fijo:
   de sur a norte y de oeste a este dentro de cada anillo). Una colisión nunca mueve el id de otro árbol.

Emparejamiento marca ↔ copa: las marcas se pusieron sobre la ortofoto, que va desplazada ~1,1-1,5 m respecto al LiDAR (ADR-0006).
Primero se estima ese desfase (mediana de los vectores marca → copa más cercana, dentro del umbral) y se corrige; luego se empareja
UNO A UNO por distancia creciente (voraz, determinista: pares ordenados por (distancia, marca, copa)) hasta UMBRAL m. Voraz y no el
óptimo húngaro (`scipy.optimize.linear_sum_assignment`, que usa Cerro en finca_3_datos.py) para que esto siga siendo Python puro y
probable sin numpy; con marcos de plantación de 6-10 m y un umbral de 4 m los dos dan lo mismo salvo en casos patológicos.

Límite honesto: el id provisional es estable ante reexportaciones de los MISMOS datos; si un vuelo nuevo mueve una copa de celda, cambia.
El del censo es estable mientras OlivarTrack no cambie el id del olivo y la marca siga emparejando con la misma copa."""

CENSO_MAX = 2 ** 31   # ids del censo: [0, 2^31)
PROV = 2 ** 31        # ids provisionales: [2^31, 2^32)
LADO_E, LADO_N = 32768, 65536
UMBRAL = 4.0          # m: distancia máxima marca ↔ copa tras corregir el desfase


def _clave(c, cx, cy):
    """(E_cm, N_cm) absolutos en UTM de una copa [x, y, h, r8, parcela+1] relativa a centro_utm"""
    return int(round((c[0] + cx) * 100)), int(round((c[1] + cy) * 100))


def _prov(em, nm):
    return PROV + (em % LADO_E) * LADO_N + (nm % LADO_N)


def es_provisional(k):
    return k >= PROV


def _anillo(d):
    """celdas (de, dn) a distancia de Chebyshev d, en orden fijo: dn de sur a norte, y dentro de cada fila de oeste a este"""
    return [(de, dn) for dn in range(-d, d + 1) for de in range(-d, d + 1) if max(abs(de), abs(dn)) == d]


def _mediana(v):
    v = sorted(v); n = len(v)
    return 0.0 if not n else (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2.0)


def _cercanas(pts, umbral):
    """rejilla de celdas de `umbral` m para buscar vecinos sin numpy"""
    g = {}
    for j, (x, y) in enumerate(pts): g.setdefault((int(x // umbral), int(y // umbral)), []).append(j)
    def vecinos(x, y):
        cx, cy = int(x // umbral), int(y // umbral)
        for a in (cx - 1, cx, cx + 1):
            for b in (cy - 1, cy, cy + 1): yield from g.get((a, b), ())
    return vecinos


def empareja(marcas, copas, umbral=UMBRAL):
    """marcas [(x, y)] y copas [[x, y, ...]] en el mismo sistema (relativo a centro_utm). Devuelve (par, desfase): par[i] = índice
    de la copa de la marca i o -1, uno a uno; desfase = (dx, dy) estimado y aplicado a las marcas."""
    cp = [(c[0], c[1]) for c in copas]; vec = _cercanas(cp, umbral)
    dxs, dys = [], []
    for x, y in marcas:                                   # desfase: mediana de los vectores marca → copa más cercana
        mejor = None
        for j in vec(x, y):
            d2 = (cp[j][0] - x) ** 2 + (cp[j][1] - y) ** 2
            if d2 <= umbral * umbral and (mejor is None or d2 < mejor[0]): mejor = (d2, j)
        if mejor: dxs.append(cp[mejor[1]][0] - x); dys.append(cp[mejor[1]][1] - y)
    dx, dy = _mediana(dxs), _mediana(dys)
    pares = []
    for i, (x, y) in enumerate(marcas):
        x, y = x + dx, y + dy
        for j in vec(x, y):
            d = ((cp[j][0] - x) ** 2 + (cp[j][1] - y) ** 2) ** 0.5
            if d <= umbral: pares.append((round(d, 6), i, j))
    pares.sort(); par = [-1] * len(marcas); libre = [True] * len(copas)
    for d, i, j in pares:
        if par[i] < 0 and libre[j]: par[i] = j; libre[j] = False
    return par, (round(dx, 3), round(dy, 3))


def ids_copas(copas, centro_utm, censo=None):
    """Lista de ids paralela a `copas`. `censo` = {índice en copas: id del censo}. Devuelve (ids, avisos)."""
    cx, cy = centro_utm; avisos = []
    ids = [None] * len(copas); usados = set()
    for i, k in sorted((censo or {}).items()):
        if not (isinstance(k, int) and not isinstance(k, bool) and 0 <= k < CENSO_MAX):
            avisos.append("id del censo no válido (debe ser entero en [0, 2^31)): %r, queda provisional" % (k,)); continue
        if k in usados: avisos.append("id del censo repetido %d: la segunda copa queda provisional" % k); continue
        ids[i] = k; usados.add(k)
    resto = [i for i in range(len(copas)) if ids[i] is None]
    claves = {i: _clave(copas[i], cx, cy) for i in resto}
    if resto:
        es = [claves[i][0] // 100 for i in resto]; ns = [claves[i][1] // 100 for i in resto]
        if max(es) - min(es) >= LADO_E or max(ns) - min(ns) >= LADO_N:
            raise ValueError("la finca mide más de %d m (E) o %d m (N): el id provisional dejaría de ser único" % (LADO_E, LADO_N))
    orden = sorted(resto, key=lambda i: (claves[i], copas[i][2], list(copas[i][3]), i))
    sobran = []
    for i in orden:                                        # 1.ª pasada: cada celda para la primera copa que cae en ella
        k = _prov(claves[i][0] // 100, claves[i][1] // 100)
        if k in usados: sobran.append(i)
        else: ids[i] = k; usados.add(k)
    for i in sobran:                                       # 2.ª pasada: las que chocaron, a la celda libre más cercana
        em, nm = claves[i][0] // 100, claves[i][1] // 100; d = 0
        while ids[i] is None:
            d += 1
            for de, dn in _anillo(d):
                k = _prov(em + de, nm + dn)
                if k not in usados: ids[i] = k; usados.add(k); break
    return ids, avisos


def asigna_tipos(copas):
    """ÚNICO punto donde se decide el olivo-tipo de cada árbol (`copas_tipo`, id del catálogo de contratos/olivos-tipo.md).
    Hoy no hay catálogo real: todos son -1 (sin asignar), que el motor dibuja con la geometría por procedimiento de siempre.
    Aquí entrará la regla (por altura, radios y parcela) o la lectura de lo que asigne el constructor de olivos-tipo (ADR-0012)."""
    return [-1] * len(copas)


def comprueba(copas, ids, tipos):
    """Las dos columnas cumplen el contrato: misma longitud que copas, ids enteros en [0, 2^32) y únicos, tipos enteros >= -1."""
    assert len(ids) == len(copas) == len(tipos), "copas_id/copas_tipo con otra longitud que copas"
    assert all(isinstance(k, int) and 0 <= k < 2 ** 32 for k in ids), "copas_id fuera de [0, 2^32)"
    assert len(set(ids)) == len(ids), "copas_id repetidos"
    assert all(isinstance(t, int) and t >= -1 for t in tipos), "copas_tipo < -1"


def columnas(copas, centro_utm, censo=None, tipos=None):
    """{copas_id, copas_tipo} listas para meter en el índice, y la lista de avisos.
    `censo` = {índice en copas: id del censo}; `tipos` permite conservar los de un índice anterior (la réplica)."""
    ids, avisos = ids_copas(copas, centro_utm, censo)
    tipos = list(tipos) if tipos is not None else asigna_tipos(copas)
    comprueba(copas, ids, tipos)
    return dict(copas_id=ids, copas_tipo=tipos), avisos


def id_de_marca(o):
    """(x, y, id o None) de una marca de OlivarTrack. Formas aceptadas: [E, N] (la de hoy, sin id), [E, N, id] o {x|E, y|N, id}."""
    if isinstance(o, dict):
        return float(o.get("x", o.get("E"))), float(o.get("y", o.get("N"))), o.get("id")
    return float(o[0]), float(o[1]), (o[2] if len(o) > 2 else None)
