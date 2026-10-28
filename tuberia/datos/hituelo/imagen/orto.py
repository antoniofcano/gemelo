"""Ortofoto PNOA (WMS del IGN) de Hituelo: una imagen de 512x512 (0,5 m/px) por tesela de 256 m y un mosaico de toda la caja a 1 m/px."""
import io, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
from img_comun import *
URL = ("https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:25830"
       "&BBOX={x0},{y0},{x1},{y1}&WIDTH={w}&HEIGHT={h}&FORMAT=image/jpeg")
def pide(x0, y0, x1, y1, w, h, intentos=6):
    for k in range(intentos):
        try:
            d = urllib.request.urlopen(urllib.request.Request(URL.format(x0=x0, y0=y0, x1=x1, y1=y1, w=w, h=h), headers={"User-Agent": "OlivarTrack-orto/1.0"}), timeout=120).read()
            return Image.open(io.BytesIO(d)).convert("RGB")
        except Exception as e:
            print("  reintento", k, str(e)[:80]); time.sleep(2)
    raise SystemExit("WMS no responde")
def pide_s(x0, y0, x1, y1, w, h):
    """El WMS devuelve 502 de forma caprichosa según el tamaño pedido (512 sí o no según la zona): se prueba con tamaños algo mayores y se reduce al pedido."""
    for k in (1.0, 1.05, 1.1, 1.17, 1.25, 1.4, 1.5, 2.0):
        ww, hh = int(round(w * k)), int(round(h * k))
        try:
            im = pide(x0, y0, x1, y1, ww, hh, intentos=1)
            return im if (ww, hh) == (w, h) else im.resize((w, h), Image.LANCZOS)
        except SystemExit:
            continue
    raise SystemExit("WMS no responde a ningún tamaño")
os.makedirs(BASE + r"\ort", exist_ok=True)
tot_j = tot_w = 0
for X, Y in teselas_con_parcela():
    f = BASE + r"\ort\%d_%d" % (X, Y)
    if os.path.exists(f + ".jpg") and os.path.exists(f + ".webp"): tot_j += os.path.getsize(f + ".jpg"); tot_w += os.path.getsize(f + ".webp"); continue
    # el WMS responde 502 a ciertas peticiones con 0,5 m/px justos (o algo peores): se pide a ~0,49 m/px (524 px) y se reduce a 512
    im = pide_s(X * T, Y * T, (X + 1) * T, (Y + 1) * T, 512, 512)
    im.save(f + ".jpg", quality=75, optimize=True, progressive=False); im.save(f + ".webp", quality=75, method=6)
    tot_j += os.path.getsize(f + ".jpg"); tot_w += os.path.getsize(f + ".webp"); print(X, Y, os.path.getsize(f + ".jpg") // 1024, "KB jpg", os.path.getsize(f + ".webp") // 1024, "KB webp")
print("teselas: jpg %.1f MB, webp %.1f MB" % (tot_j / 1e6, tot_w / 1e6))
# mosaico 1 m/px de toda la caja (trozos de 1000 px para no tocar el límite del WMS)
x0, y0, x1, y1 = caja(100.0); x0 = math.floor(x0); y0 = math.floor(y0); x1 = math.ceil(x1); y1 = math.ceil(y1)
W, H = x1 - x0, y1 - y0; mos = Image.new("RGB", (W, H)); C = 1000
for xi in range(0, W, C):
    for yi in range(0, H, C):
        w, h = min(C, W - xi), min(C, H - yi)
        # fila de imagen: el norte arriba; yi cuenta desde el sur
        im = pide_s(x0 + xi, y0 + yi, x0 + xi + w, y0 + yi + h, w, h)
        mos.paste(im, (xi, H - yi - h))
mos.save(BASE + r"\mosaico_1m.jpg", quality=75, optimize=True)
json.dump({"bbox": [x0, y0, x1, y1], "w": W, "h": H, "m_por_px": 1.0}, open(BASE + r"\mosaico_1m.json", "w"))
print("mosaico", W, "x", H, os.path.getsize(BASE + r"\mosaico_1m.jpg") // 1024, "KB")
