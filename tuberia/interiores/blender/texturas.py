# Texturas ILUSTRATIVAS generadas (no son fotos del sitio), para la obra de los mundos interiores:
#   blender --background --python texturas.py -- <carpeta> [--chapa nombre:r,g,b …] [--px 512] [--semilla 7]
#   hojas.png            atlas 2×2 con alfa para las tarjetas de obra.py: (0,0) rama de hoja ancha, (1,0) ciprés,
#                        (0,1) hoja larga de adelfa, (1,1) flores claras (se tiñen con el color de vértice)
#   chapa_<nombre>.png   chapa pintada del color dado (lineal) con desgaste: pintura desvaída a chorreones, desconchones
#                        con óxido (más abajo y en los bordes) y arañazos; y chapa_<nombre>_rug.png con su rugosidad
# Todo sale de una semilla: la misma orden da los mismos ficheros. Los colores los decide quien llama (obra.json).
import bpy, sys, os
import numpy as np


def argumentos():
    a = sys.argv[sys.argv.index("--") + 1:]
    o = {"carpeta": a[0], "chapas": [], "px": 512, "semilla": 7}
    i = 1
    while i < len(a):
        k = a[i].lstrip("-"); v = a[i + 1]; i += 2
        if k == "chapa":
            n, c = v.split(":"); o["chapas"].append((n, [float(x) for x in c.split(",")]))
        else:
            o[k] = int(v)
    return o


def guarda(ruta, px, alfa=True, datos=True):
    """px: (alto, ancho, 4) en 0…1, fila 0 arriba. Los colores se dan lineales y se guardan en sRGB"""
    h, w = px.shape[:2]
    img = bpy.data.images.new(os.path.basename(ruta), w, h, alpha=alfa)
    if not datos:
        img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(np.ascontiguousarray(px[::-1]).astype(np.float32).ravel())
    img.filepath_raw = ruta; img.file_format = "PNG"; img.save(); bpy.data.images.remove(img)


def ruido(rng, n, octavas=5, base=4):
    """Ruido fractal en 0…1 por suma de rejillas aleatorias ampliadas con interpolación"""
    r = np.zeros((n, n)); amp = 1.0; tot = 0.0
    for o in range(octavas):
        m = base * 2 ** o
        g = rng.random((m + 1, m + 1))
        x = np.linspace(0, m, n, endpoint=False); i = x.astype(int); f = x - i; f = f * f * (3 - 2 * f)
        a = g[np.ix_(i, i)] * np.outer(1 - f, 1 - f) + g[np.ix_(i + 1, i)] * np.outer(f, 1 - f) \
            + g[np.ix_(i, i + 1)] * np.outer(1 - f, f) + g[np.ix_(i + 1, i + 1)] * np.outer(f, f)
        r += a * amp; tot += amp; amp *= 0.5
    return r / tot


def pinta_hoja(px, cx, cy, largo, ancho, ang, color, rng):
    """Una hoja elíptica apuntada con su nervio, sobre px (alto, ancho, 4), en píxeles"""
    n = px.shape[0]; r = int(largo) + 2
    x0, x1, y0, y1 = max(0, int(cx) - r), min(n, int(cx) + r), max(0, int(cy) - r), min(n, int(cy) + r)
    if x0 >= x1 or y0 >= y1:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1]
    u = (xx - cx) * np.cos(ang) + (yy - cy) * np.sin(ang); v = -(xx - cx) * np.sin(ang) + (yy - cy) * np.cos(ang)
    t = np.clip(u / largo, -1, 1); perfil = ancho * (1 - t * t) ** 0.8
    dentro = (np.abs(u) <= largo) & (np.abs(v) <= perfil)
    nervio = np.exp(-(v / max(0.6, ancho * 0.12)) ** 2) * 0.35
    luz = 0.85 + 0.3 * (v / max(1e-3, ancho)) * 0.5 + nervio
    for k in range(3):
        c = px[y0:y1, x0:x1, k]; c[dentro] = np.clip(color[k] * luz[dentro], 0, 1)
    a = px[y0:y1, x0:x1, 3]; a[dentro] = 1.0


def celda_hojas(n, rng, tipo):
    px = np.zeros((n, n, 4)); c = n / 2
    if tipo == "ancha":      # un ramillete: hojas ovaladas en todas direcciones, más densas en el centro
        for k in range(46):
            d = abs(rng.normal(0, 0.24)) * n; a = rng.uniform(0, 2 * np.pi)
            v = rng.uniform(0.7, 1.15); col = (0.075 * v, 0.21 * v * rng.uniform(0.85, 1.2), 0.045 * v)
            pinta_hoja(px, c + np.cos(a) * d, c + np.sin(a) * d, n * rng.uniform(0.07, 0.11), n * rng.uniform(0.028, 0.045), a + rng.normal(0, 0.6), col, rng)
    elif tipo == "cipres":   # ramillas cortas y apretadas apuntando arriba, con el borde deshilachado
        for k in range(800):
            x = c + rng.normal(0, 0.2) * n; y = rng.uniform(0.03, 0.97) * n
            if abs(x - c) > n * 0.46 * (0.55 + 0.45 * np.sin(np.pi * y / n)):
                continue
            v = rng.uniform(0.6, 1.2); col = (0.04 * v, 0.11 * v, 0.045 * v)
            pinta_hoja(px, x, y, n * rng.uniform(0.03, 0.055), n * rng.uniform(0.008, 0.014), -np.pi / 2 + rng.normal(0, 0.45), col, rng)
    elif tipo == "adelfa":   # hojas largas y estrechas en abanico desde abajo
        for k in range(30):
            a = -np.pi / 2 + rng.normal(0, 0.75); l = n * rng.uniform(0.2, 0.33)
            v = rng.uniform(0.7, 1.15); col = (0.07 * v, 0.18 * v, 0.06 * v)
            bx = c + rng.normal(0, 0.07) * n; by = n * 0.78 + rng.normal(0, 0.06) * n
            pinta_hoja(px, bx + np.cos(a) * l * 0.9, by + np.sin(a) * l * 0.9, l, n * rng.uniform(0.016, 0.026), a, col, rng)
    else:                    # flores: cinco pétalos claros con el centro amarillo, sueltas
        for k in range(9):
            fx, fy = c + rng.normal(0, 0.22) * n, c + rng.normal(0, 0.22) * n; r = n * rng.uniform(0.07, 0.1); g = rng.uniform(0, 2 * np.pi)
            for q in range(5):
                a = g + q * 2 * np.pi / 5; v = rng.uniform(0.85, 1.0)
                pinta_hoja(px, fx + np.cos(a) * r * 0.55, fy + np.sin(a) * r * 0.55, r * 0.55, r * 0.34, a, (v, v, v), rng)
            pinta_hoja(px, fx, fy, r * 0.16, r * 0.16, 0, (0.9, 0.6, 0.05), rng)
    # el color sale un poco fuera del alfa para que el filtrado no meta un borde negro
    vacio = px[..., 3] < 0.5
    if (~vacio).any():
        media = px[~vacio][:, :3].mean(axis=0); px[vacio, :3] = media
    return px


def atlas_hojas(n, rng):
    m = n // 2; px = np.zeros((n, n, 4))
    # la celda (i, j) de la uv tiene v hacia arriba: j = 0 es la mitad de abajo de la imagen
    for (i, j), tipo in (((0, 0), "ancha"), ((1, 0), "cipres"), ((0, 1), "adelfa"), ((1, 1), "flor")):
        px[(1 - j) * m:(2 - j) * m, i * m:(i + 1) * m] = celda_hojas(m, rng, tipo)
    return px


def chapa(n, rng, color):
    """Chapa pintada vieja: color y rugosidad. El desgaste se junta abajo y en los bordes de cada vuelta de 2 m"""
    base = np.array(color); f = ruido(rng, n, 5, 3); fino = ruido(rng, n, 4, 24); y = np.linspace(0, 1, n)[:, None]
    chorreon = ruido(rng, n, 3, 2)[:1].repeat(n, 0) * 0.5 + ruido(rng, n, 2, 12)[:1].repeat(n, 0) * 0.5   # rayas verticales de agua
    px = np.ones((n, n, 4))
    desvaido = 0.7 * (f - 0.5) + 0.8 * (chorreon - 0.5) * (0.4 + 0.6 * y)
    gris = base.mean()
    for k in range(3):
        px[..., k] = np.clip((base[k] * (1 - 0.35 * np.clip(desvaido + 0.2, 0, 1)) + gris * 0.35 * np.clip(desvaido + 0.2, 0, 1)) * (1 + 0.5 * desvaido), 0, 1)
    # desconchones: donde el ruido fino cruza un umbral que baja hacia el suelo
    umbral = 0.72 - 0.22 * y ** 3 - 0.14 * (f - 0.5)
    oxido = np.clip((fino * 0.6 + f * 0.4 - umbral) * 14, 0, 1)
    tono = ruido(rng, n, 3, 16)
    herrumbre = np.stack([0.09 + 0.08 * tono, 0.032 + 0.025 * tono, 0.012 + 0.006 * tono], -1)
    px[..., :3] = px[..., :3] * (1 - oxido[..., None]) + herrumbre * oxido[..., None]
    rug = 0.42 + 0.2 * np.clip(desvaido + 0.3, 0, 1) + 0.45 * oxido
    for k in range(14):   # arañazos claros
        x0, y0 = rng.integers(0, n, 2); l = int(rng.integers(n // 30, n // 6)); a = rng.normal(0.2, 0.5)
        t = np.arange(l); xs = (x0 + t * np.cos(a)).astype(int) % n; ys = (y0 + t * np.sin(a)).astype(int) % n
        px[ys, xs, :3] = np.clip(px[ys, xs, :3] * 1.25 + 0.01, 0, 1); rug[ys, xs] = 0.7
    r4 = np.ones((n, n, 4)); r4[..., :3] = np.clip(rug, 0, 1)[..., None]
    return px, r4


def lineal_a_srgb(px):
    c = px[..., :3]; px[..., :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(np.clip(c, 1e-6, 1), 1 / 2.4) - 0.055)
    return px


def principal():
    a = argumentos(); os.makedirs(a["carpeta"], exist_ok=True); n = a["px"]
    guarda(os.path.join(a["carpeta"], "hojas.png"), lineal_a_srgb(atlas_hojas(n, np.random.default_rng(a["semilla"]))))
    print("TEXTURA hojas.png", n)
    for nombre, color in a["chapas"]:
        c, r = chapa(n, np.random.default_rng(a["semilla"] + 1), color)
        guarda(os.path.join(a["carpeta"], "chapa_%s.png" % nombre), lineal_a_srgb(c), alfa=False)
        guarda(os.path.join(a["carpeta"], "chapa_%s_rug.png" % nombre), r, alfa=False, datos=False)
        print("TEXTURA chapa_%s.png" % nombre, n)


principal()
