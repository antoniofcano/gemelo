"""Monta el gemelo v2: cabecera (plantilla) + datos + three.js + los módulos de src/ en orden.

  python montar_v2.py                                   # Cerro Velasco «un solo HTML» (todo embebido): gemelo_cerro_v2.html
  python montar_v2.py --modo ficheros --finca cerro     # página ligera + ficheros de apoyo: publicar/cerro/index.html y publicar/cerro/t/<kx>_<ky>.json|jpg
  python montar_v2.py --finca hituelo --modo ficheros   # lo mismo con Hituelo (salida de finca_8_teselas.py --finca hituelo)

La página lee D.base (por defecto «», es decir, rutas relativas a la propia página) para pedir t/<clave>.json y t/<clave>.jpg."""
import json, glob, os, sys, shutil, argparse
R = os.path.dirname(os.path.abspath(__file__))
def lee(p): return open(os.path.join(R, p), encoding="utf-8").read()

import re

def textos_finca(cab, T):
    """La cabecera está escrita para Cerro Velasco; para otra finca se cambian sus textos (título, entradilla, nota del desfase y pie) y, si no hay historia, se oculta."""
    n, ha, nf, npar, nol = T["finca"], T["ha"], T["fincas"], T["parcelas"], T["olivos"]
    fh = lambda x: ("%.0f" % x).replace(".", ",")
    cab = cab.replace("<title>Gemelo de Cerro Velasco</title>", "<title>Gemelo de %s</title>" % n)
    cab = re.sub(r"<h1>.*?</h1>", "<h1>%s, en 3D</h1>" % n, cab, count=1, flags=re.S)
    cab = re.sub(r"(<h1>.*?</h1>\s*)<p>.*?</p>", lambda m: m.group(1) + "<p>Gemelo de las %d fincas de %s, con sus %d parcelas y %s ha: la forma sale de los puntos del vuelo LiDAR de 2024 y el color, de la ortofoto del PNOA corregida por la altura de cada copa. Cada tesela de 256 m se carga y se dibuja con más o menos detalle según lo cerca que la mires.</p>" % (nf, n, npar, fh(ha)), cab, count=1, flags=re.S)
    cab = cab.replace("Vista 3D de la parcela Cerro Velasco;", "Vista 3D de las fincas de %s;" % n)
    cab = re.sub(r'<p class="nota" style="margin-top:8px">Los puntos guardados.*?</p>', '<p class="nota" style="margin-top:8px">Los puntos guardados en OlivarTrack se marcaron sobre la ortofoto, que muestra las copas desplazadas hacia el este según su altura (%s); el LiDAR está bien georreferenciado.</p>' % T.get("desfase_txt", "unos 1,5 m, medido en Cerro Velasco"), cab, count=1, flags=re.S)
    cab = re.sub(r'<p class="pie">.*?</p>', '<p class="pie">Gemelo de las %d fincas de %s (%d parcelas, %s ha, %d olivos detectados). La copa de cada olivo es medida del LiDAR; sus troncos y ramas son una forma ilustrativa con los 2 o 3 pies habituales, no una medición. Nube PNOA-LiDAR 2024 (3.ª cobertura, unos 6,5 puntos por m²), MDT de 0,5 m del CNIG y ortofoto PNOA del IGN, licencia CC-BY 4.0. La corrección de la ortofoto es un ajuste medido en Cerro Velasco, no una ortorrectificación. El tendido, los cauces y el último tramo de cada cable están deducidos de la geometría, no medidos. Es un modelo de trabajo, no una medición topográfica.</p>' % (nf, n, npar, fh(ha), nol), cab, count=1, flags=re.S)
    if T.get("intro_historia"): cab = re.sub(r'(<p class="nota" id="hIntro">).*?(</p>)', lambda m: m.group(1) + T["intro_historia"] + m.group(2), cab, count=1, flags=re.S)
    if T.get("sin_historia"): cab = cab.replace("</style>", "#historia { display: none !important; }\n</style>", 1)
    return cab

def monta(D, salida, src="src"):
    cab = lee("plantilla_cabecera.html")
    if D.get("textos"): cab = textos_finca(cab, D["textos"])
    js = "".join(lee(f) for f in sorted(glob.glob(os.path.join(R, src, "*.js"))))
    if "<meta charset" not in cab[:400]: cab = '<meta charset="utf-8">\n' + cab
    html = cab + '<script type="application/json" id="datos">' + json.dumps(D) + '</script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>' + js + '</script>\n'
    os.makedirs(os.path.dirname(os.path.join(R, salida)) or R, exist_ok=True)
    open(os.path.join(R, salida), "w", encoding="utf-8").write(html)
    return html

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--src", default="src"); ap.add_argument("--datos", default=None); ap.add_argument("--salida", default=None)
    ap.add_argument("--finca", default="cerro"); ap.add_argument("--modo", choices=["embebido", "ficheros"], default="embebido"); a = ap.parse_args()
    carpeta = os.path.join("salida", a.finca)
    if a.modo == "embebido":
        D = json.load(open(os.path.join(R, a.datos or os.path.join(carpeta, "embebido.json")), encoding="utf-8"))
        h = monta(D, a.salida or ("gemelo_%s_v2.html" % a.finca), a.src)
    else:
        D = json.load(open(os.path.join(R, a.datos or os.path.join(carpeta, "indice.json")), encoding="utf-8"))
        dest = os.path.join("publicar", a.finca)
        h = monta(D, a.salida or os.path.join(dest, "index.html"), a.src)
        os.makedirs(os.path.join(R, dest, "t"), exist_ok=True)
        for f in glob.glob(os.path.join(R, carpeta, "t", "*")): shutil.copy(f, os.path.join(R, dest, "t", os.path.basename(f)))
        print("ficheros de apoyo:", len(glob.glob(os.path.join(R, dest, "t", "*"))), "en", dest)
    print("HTML: %.2f MB" % (len(h.encode()) / 1048576))
