// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====
// Expone: Mundo, suelo, copaAlta, orto, kcor, desp, tinte, ndLo, ndHi, aviva, colorEn, copas, cIn, marc, med
// Consume: 01_datos (D, b64, i16, RES), 05_nube (nube), 09_camara (suelta), 10_ndvi (rampa, ndviRel), 14_historia (marca, lista, carga),
//   16_vida (mira)
// ===============================================================================
  // ---------- el mundo: teselas de 256 m con relieve, copa, color del suelo, nube y ortofoto. Todo lo demás pregunta aquí (suelo, copaAlta, colorSuelo, orto).
  // Una tesela (kx, ky) cubre en UTM [kx·256, kx·256+256) × [ky·256, ky·256+256). Las filas de cada rejilla van de sur a norte; el relieve y el color del suelo llevan una celda de margen
  // (la de la tesela vecina) para que la interpolación no tenga costura. Lo que aún no ha llegado se contesta con el relieve grueso de 8 m (o la ortofoto gruesa), nunca con un hueco.
  var Mundo = (function () {
    var TS = D.ts, N = TS / RES, N2 = N + 2, SRS = D.srs, NS = TS / SRS, NS2 = NS + 2;
    var cx = D.centro_utm[0], cy = D.centro_utm[1], base = D.base || "";
    var lista = [], kx0 = 1e9, ky0 = 1e9, kx1 = -1e9, ky1 = -1e9;
    Object.keys(D.teselas).forEach(function (k) { var d = D.teselas[k]; kx0 = Math.min(kx0, d.kx); kx1 = Math.max(kx1, d.kx); ky0 = Math.min(ky0, d.ky); ky1 = Math.max(ky1, d.ky); });
    var NKX = kx1 - kx0 + 1, NKY = ky1 - ky0 + 1, G = new Array(NKX * NKY);
    Object.keys(D.teselas).forEach(function (k) {
      var d = D.teselas[k], t = { key: k, kx: d.kx, ky: d.ky, ox: d.kx * TS - cx, oy: d.ky * TS - cy, v: d.v, np: d.np || 0, estado: 0, dtm: null, chm: null, suel: null, pts: null, ortImg: null, ortCv: null, ortPix: null, ortW: 0, ortH: 0 };
      G[(d.ky - ky0) * NKX + (d.kx - kx0)] = t; lista.push(t);
    });
    function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
    function tesela(x, y) { var i = Math.floor((x + cx) / TS) - kx0, j = Math.floor((y + cy) / TS) - ky0; return i < 0 || j < 0 || i >= NKX || j >= NKY ? null : G[j * NKX + i] || null; }

    // relieve grueso (8 m) para lo que aún no está cargado
    var GR = D.grueso, gz = Float32Array.from(i16(GR.b64), function (v) { return v / 100; });
    function grueso(x, y) {
      var fx = cl((x - GR.x0) / GR.res - 0.5, 0, GR.w - 1.001), fy = cl((GR.yN - y) / GR.res - 0.5, 0, GR.h - 1.001), i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, w = GR.w;
      return (gz[j * w + i] * (1 - tx) + gz[j * w + i + 1] * tx) * (1 - ty) + (gz[(j + 1) * w + i] * (1 - tx) + gz[(j + 1) * w + i + 1] * tx) * ty;
    }
    function suelo(x, y) {
      var ux = x + cx, uy = y + cy, kx = Math.floor(ux / TS), ky = Math.floor(uy / TS), i0 = kx - kx0, j0 = ky - ky0, t = i0 >= 0 && j0 >= 0 && i0 < NKX && j0 < NKY ? G[j0 * NKX + i0] : null;
      if (!t || !t.dtm) return grueso(x, y);
      var fx = (ux - kx * TS) / RES - 0.5, fy = (uy - ky * TS) / RES - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, o = (j + 1) * N2 + i + 1, d = t.dtm;
      return (d[o] * (1 - tx) + d[o + 1] * tx) * (1 - ty) + (d[o + N2] * (1 - tx) + d[o + N2 + 1] * tx) * ty;
    }
    function copaAlta(x, y) { // altura de vegetación en ese punto (a 0,1 m)
      var t = tesela(x, y); if (!t || !t.chm || x < t.v[0] || x >= t.v[2] || y < t.v[1] || y >= t.v[3]) return 0;
      var ix = Math.floor((x - t.ox) / RES), iy = Math.floor((y - t.oy) / RES); return t.chm[iy * N + ix] / 10;
    }
    function colorSuelo(x, y, out) {   // bilineal: el suelo se guarda a 2 m
      var t = tesela(x, y); if (!t || !t.suel) { out[0] = 0.62; out[1] = 0.54; out[2] = 0.4; return; }
      var fx = (x - t.ox) / SRS - 0.5, fy = (y - t.oy) / SRS - 0.5, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, s = t.suel, o = ((j + 1) * NS2 + i + 1) * 3, o2 = o + NS2 * 3;
      for (var c = 0; c < 3; c++) out[c] = ((s[o + c] * (1 - tx) + s[o + 3 + c] * tx) * (1 - ty) + (s[o2 + c] * (1 - tx) + s[o2 + 3 + c] * tx) * ty) / 255;
    }

    // ortofoto: cada tesela trae la suya (768 px); los píxeles se decodifican solo cuando alguien los muestrea, y para lo lejano hay un mosaico de 1 m
    var mos = { img: null, pix: null, w: 0, h: 0 }, reloj = 0;   // reloj: ms del último refresco (cada 0,2 s en actualiza); marca el último uso de cada ortofoto
    function pixeles(img) { var c = document.createElement("canvas"); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height; var g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0); return { cv: c, px: g.getImageData(0, 0, c.width, c.height).data }; }
    function decodificaOrto(t) {
      var r = pixeles(t.ortImg); t.ortCv = r.cv; t.ortPix = r.px; t.ortW = r.cv.width; t.ortH = r.cv.height; t.uso = performance.now(); nDec++;
      desalojaOrto(); return t.ortPix;
    }
    // M4: tope de ortofotos decodificadas a la vez (cada una ~2,4 MB de píxeles). Pasado el tope se suelta la MENOS USADA recientemente (t.uso = el último muestreo), salvo
    // la tesela bajo la cámara y sus cuatro vecinas (foco: lo fija liberaOrtoLejos) y las usadas en los últimos ORTO_GRACIA ms: así nada se suelta para decodificarse
    // otra vez en el mismo fotograma (el tope es blando: si todo está protegido se excede). ?ortoMax=N lo fija a mano (para medir); por defecto 8 en móvil/gafas y 20 en escritorio.
    var ORTO_GRACIA = 8000, nDec = 0, nDes = 0, foco = null;
    var ORTO_MAX = (function () {
      var q = typeof location !== "undefined" ? location.search : "", m = /[?&]ortoMax=(\d+)/.exec(q); if (m && +m[1] >= 1) return +m[1];
      var nv = typeof navigator !== "undefined" ? navigator : {}, movil = /Mobi|Android|iPhone|iPad|OculusBrowser|Quest/i.test(nv.userAgent || "") || !!(nv.deviceMemory && nv.deviceMemory <= 4);
      return movil ? 8 : 20;
    })();
    function desalojaOrto() {
      var vivas = lista.filter(function (t) { return t.ortPix; }); if (vivas.length <= ORTO_MAX) return;
      var ahora = performance.now(), prot = {}, c = foco && tesela(foco.x, foco.y);
      if (c) [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) { var v = G[(c.ky + d[1] - ky0) * NKX + (c.kx + d[0] - kx0)]; if (v && c.kx + d[0] >= kx0 && c.kx + d[0] <= kx1 && c.ky + d[1] >= ky0 && c.ky + d[1] <= ky1) prot[v.key] = 1; });
      var cand = vivas.filter(function (t) { return !prot[t.key] && ahora - (t.uso || 0) > ORTO_GRACIA; }).sort(function (a, b) { return (a.uso || 0) - (b.uso || 0); });
      for (var i = 0; i < cand.length && vivas.length - i > ORTO_MAX; i++) { liberaOrtoPix(cand[i]); nDes++; }
    }
    function muestrea(p, w, h, u, v, out) {
      u = cl(u, 0, w - 1.001); v = cl(v, 0, h - 1.001);
      var iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv, o = (iv * w + iu) * 4, o2 = o + w * 4;
      for (var c = 0; c < 3; c++) out[c] = ((p[o + c] * (1 - tu) + p[o + 4 + c] * tu) * (1 - tv) + (p[o2 + c] * (1 - tu) + p[o2 + 4 + c] * tu) * tv) / 255;
    }
    function orto(x, y, out) {
      var t = tesela(x, y), p = t && t.ortPix; if (p) t.uso = reloj;
      if (!p && t && t.ortImg && t.ortImg.complete && t.ortImg.naturalWidth) p = decodificaOrto(t);
      if (p) { muestrea(p, t.ortW, t.ortH, (x - t.ox) / TS * t.ortW - 0.5, (TS - (y - t.oy)) / TS * t.ortH - 0.5, out); return; }
      if (mos.pix) { var M = D.mosaico; muestrea(mos.pix, mos.w, mos.h, (x - M.x0) / M.res - 0.5, (M.yN - y) / M.res - 0.5, out); return; }
      out[0] = 0.55; out[1] = 0.52; out[2] = 0.4;
    }
    function ortoGrueso(x, y, out) {   // el mosaico de 1 m (para lo lejano y para el color de cada olivo en los niveles 1 y 2)
      if (!mos.pix) { out[0] = 0.55; out[1] = 0.52; out[2] = 0.4; return; }
      var M = D.mosaico; muestrea(mos.pix, mos.w, mos.h, (x - M.x0) / M.res - 0.5, (M.yN - y) / M.res - 0.5, out);
    }
    // pinta en un canvas 2D la región [vx0, vx0+ancho] × [vy1-alto, vy1] del mundo (el minimapa): lo lejano con el mosaico, lo cercano con las ortofotos de las teselas
    function pintaOrto(c, vx0, vy1, ancho, alto, dw, dh) {
      var escx = dw / ancho, escy = dh / alto;
      if (ancho > TS * 1.5 && mos.img) {
        var M = D.mosaico; c.drawImage(mos.img, (vx0 - M.x0) / M.res, (M.yN - vy1) / M.res, ancho / M.res, alto / M.res, 0, 0, dw, dh); return;
      }
      c.fillStyle = "#8d8668"; c.fillRect(0, 0, dw, dh);
      lista.forEach(function (t) {
        var im = t.ortCv || (t.ortImg && t.ortImg.complete && t.ortImg.naturalWidth ? t.ortImg : null); if (!im) return;
        var ax0 = Math.max(vx0, t.v[0]), ax1 = Math.min(vx0 + ancho, t.v[2]), ay1 = Math.min(vy1, t.v[3]), ay0 = Math.max(vy1 - alto, t.v[1]); if (ax1 <= ax0 || ay1 <= ay0) return;
        var sw = im.width || im.naturalWidth, sh = im.height || im.naturalHeight, ty1 = t.oy + TS;
        c.drawImage(im, (ax0 - t.ox) / TS * sw, (ty1 - ay1) / TS * sh, (ax1 - ax0) / TS * sw, (ay1 - ay0) / TS * sh, (ax0 - vx0) * escx, (vy1 - ay1) * escy, (ax1 - ax0) * escx, (ay1 - ay0) * escy);
      });
    }

    // carga: los datos de una tesela vienen de sus ficheros (t/<clave>.json y .jpg, del mismo origen)
    function decodifica(t, c) {
      var d = i16(c.dtm), f = new Float32Array(d.length); for (var i = 0; i < d.length; i++) f[i] = d[i] / 100;
      t.dtm = f; t.chm = b64(c.chm); t.suel = b64(c.suelo); t.pts = c.pts ? i16(c.pts) : null; t.np = c.np || 0; t.estado = 2;
    }
    function cargaImagen(src, fin) { var im = new Image(); im.onload = function () { fin(im); }; im.onerror = function () { fin(null); }; im.src = src; return im; }
    function cargaTesela(t, fin) {
      fetch(base + "t/" + t.key + ".json").then(function (r) { if (!r.ok) throw new Error("tesela " + t.key + ": " + r.status); return r.json(); }).then(function (c2) {
        decodifica(t, c2); cargaImagen(base + "t/" + t.key + ".jpg", function (im) { t.ortImg = im; fin(t); });
      }).catch(function (e) { console.error(e); t.estado = 3; t.fallo = performance.now(); fin(t); });
    }
    // planificador de carga: pide las teselas por cercanía a la cámara, de MAXF en MAXF; cada una avisa a los que se registraron con alCargar (terreno, nube, olivos)
    var MAXF = 3, enVuelo = 0, oyentes = [], RADIO_CARGA = 1800;
    function dist(t, px, py, pz) {   // distancia en 3D de un punto de la cámara al rectángulo de la tesela
      var hx = (t.v[2] - t.v[0]) / 2, hy = (t.v[3] - t.v[1]) / 2, mx = (t.v[0] + t.v[2]) / 2, my = (t.v[1] + t.v[3]) / 2;
      var dx = Math.max(0, Math.abs(px - mx) - hx), dz = Math.max(0, Math.abs(pz + my) - hy), dy = Math.max(0, py - (t.hc === undefined ? 0 : t.hc)); return Math.sqrt(dx * dx + dz * dz + dy * dy);
    }
    function pide(t) {
      if (t.estado !== 0 && !(t.estado === 3 && performance.now() - t.fallo > 15000)) return;
      t.estado = 1; enVuelo++;
      cargaTesela(t, function () { enVuelo--; if (t.dtm) oyentes.forEach(function (f) { f(t); }); });
    }
    function actualiza(px, py, pz) {
      reloj = performance.now();
      if (enVuelo >= MAXF) return;
      var cand = lista.filter(function (t) { return (t.estado === 0 || (t.estado === 3 && performance.now() - t.fallo > 15000)) && dist(t, px, py, pz) < RADIO_CARGA; });
      cand.sort(function (a, b) { return dist(a, px, py, pz) - dist(b, px, py, pz); });
      for (var i = 0; i < cand.length && enVuelo < MAXF; i++) pide(cand[i]);
    }
    function alCargar(f) { oyentes.push(f); }
    function arranca(fin) {   // solo se espera al mosaico; las teselas llegan por actualiza()
      cargaImagen(D.mosaico.jpg, function (im) { if (im) { mos.img = im; var r = pixeles(im); mos.pix = r.px; mos.w = r.cv.width; mos.h = r.cv.height; } fin(); });
    }
    function liberaOrtoPix(t) { t.ortPix = null; t.ortCv = null; }   // la ortofoto decodificada ocupa 2,4 MB por tesela: se suelta cuando la tesela queda lejos
    function liberaOrtoLejos(px, py, pz) {
      reloj = performance.now(); foco = { x: px, y: -pz };
      lista.forEach(function (t) { if (t.ortPix && dist(t, px, py, pz) > 900) liberaOrtoPix(t); });
      desalojaOrto();
    }
    function ortoEstado() { return { max: ORTO_MAX, vivas: lista.filter(function (t) { return t.ortPix; }).length, decodificadas: nDec, desalojadas: nDes, mb: Math.round(lista.reduce(function (a, t) { return a + (t.ortPix ? t.ortPix.length : 0); }, 0) / 1048576 * 10) / 10 }; }
    function* aseguraOrto(t) {   // decodifica (en su propia rebanada) la ortofoto de la tesela y de sus vecinas cargadas: el color de un punto a veces cae en la de al lado
      var ks = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (var i = 0; i < ks.length; i++) {
        var v = G[(t.ky + ks[i][1] - ky0) * NKX + (t.kx + ks[i][0] - kx0)]; if (!v || v.ortPix || !v.ortImg || !v.ortImg.complete || !v.ortImg.naturalWidth) continue;
        if (ks[i][0] || ks[i][1]) { if (Math.abs(ks[i][0]) + Math.abs(ks[i][1]) > 1) continue; }   // las diagonales no hacen falta: el desplazamiento es de pocos metros
        v.uso = performance.now(); decodificaOrto(v); yield;
      }
    }
    return { TS: TS, N: N, N2: N2, NS: NS, NS2: NS2, SRS: SRS, cx: cx, cy: cy, lista: lista, tesela: tesela, suelo: suelo, copaAlta: copaAlta, colorSuelo: colorSuelo, orto: orto, ortoGrueso: ortoGrueso, pintaOrto: pintaOrto, arranca: arranca, actualiza: actualiza, alCargar: alCargar, dist: dist, liberaOrtoPix: liberaOrtoPix,
      cargaTesela: cargaTesela, aseguraOrto: aseguraOrto, liberaOrtoLejos: liberaOrtoLejos, decodificaOrto: decodificaOrto, ortoEstado: ortoEstado, grueso: grueso, mosaico: mos };
  })();
  var suelo = Mundo.suelo, copaAlta = Mundo.copaAlta, colorSuelo = Mundo.colorSuelo, orto = Mundo.orto;

  // La ortofoto enseña la copa corrida hacia el este según su altura (medido en esta parcela:
  // ~1,2 m a 1 m de altura, ~2,5 m a 4 m). Para pintar un punto del LiDAR se mira el píxel donde la ortofoto lo dibuja.
  var kcor = 1;
  function desp(h) { return kcor * (1.2 * Math.min(h, 1) + 0.42 * Math.max(h - 1, 0)); }
  var tmpC = [0, 0, 0], PLATA = [0.58, 0.62, 0.52];
  // El verde de la ortofoto lleva la sombra de la copa: se aclara un poco hacia el gris plateado del olivo.
  var tinte = false, ndLo = 0, ndHi = 1;
  function aviva(c3, x, y) {
    for (var i = 0; i < 3; i++) c3[i] = Math.min(1, 0.8 * c3[i] * 1.35 + 0.2 * PLATA[i]);
    if (tinte && x !== undefined) {   // el tono de la copa sigue al NDVI de su zona; la luz y la sombra del follaje se conservan
      var lum = (c3[0] + c3[1] + c3[2]) / 3, t = ndviRel(x, y), r = rampa(t), mezcla = 0.78, f = 0.45 + 0.9 * lum;
      for (var k = 0; k < 3; k++) c3[k] = Math.min(1, c3[k] * (1 - mezcla) + r[k] * f * mezcla);
    }
  }
  function colorEn(x, y, h, out) { orto(x + desp(h), y + kcor * 0.2 * Math.min(h / 2, 1), out); }

  // ---- datos
  // el registro de árboles: copas[i] = [x, y, h, r8, parcela+1] y, en columnas paralelas opcionales (CONTRATOS §1.1), copas_id[i] (id estable) y copas_tipo[i]
  // (olivo-tipo del catálogo, ADR-0012); sin ellas, −1: sin id y sin tipo (se dibuja como siempre)
  var copas = D.copas.map(function (c, i) { var rm = c[3].reduce(function (a, b) { return a + b; }, 0) / 8; return { i: i, id: D.copas_id ? D.copas_id[i] : -1, tipo: D.copas_tipo ? D.copas_tipo[i] : -1, x: c[0], y: c[1], h: c[2], perfil: c[3], dentro: c[4] > 0, parc: c[4] - 1, oliv: !(c[2] > 8 || (c[2] > 6.5 && rm < 2.2)) }; });
  var cIn = copas.filter(function (c) { return c.dentro && c.oliv; });
  var marc = D.marcados.map(function (m, i) { return { i: i, x: m[0], y: m[1], par: m[2], parc: m[3] }; });
  var med = function (a) { var s = a.slice().sort(function (p, q) { return p - q; }); return s.length ? s[Math.floor(s.length / 2)] : 0; };

