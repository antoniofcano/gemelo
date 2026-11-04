// Núcleo de la tubería de suelo (EV-1s): aritmética pura sobre imágenes en coma flotante, sin E/S ni sharp (lo prueba pruebas/guardianes/suelo_tuberia.test.js).
// Una imagen es { w, h, c, d: Float32Array } con los valores en [0, 1] (sRGB tal cual, «como se ve»), fila 0 arriba.
// Por qué código propio y no una librería: sharp (que sí se usa para leer, recortar, escalar y codificar) desenfoca con el borde extendido, y aquí hace
// falta desenfocar con el borde ENVUELTO (la textura es periódica); y no hay en npm una librería mantenida de «textura sin costuras». Todo es determinista.

/** imagen vacía */
export function imagen(w, h, c) { return { w, h, c, d: new Float32Array(w * h * c) }; }

/** de bytes intercalados (sharp raw) a flotante [0, 1] */
export function deBytes(buf, w, h, c) { const im = imagen(w, h, c); for (let i = 0; i < im.d.length; i++) im.d[i] = buf[i] / 255; return im; }

/** a bytes con un factor: v·escala, redondeado y recortado a [0, 255] */
export function aBytes(im, escala = 255) { const b = Buffer.alloc(im.d.length); for (let i = 0; i < im.d.length; i++) b[i] = Math.max(0, Math.min(255, Math.round(im.d[i] * escala))); return b; }

/** desenfoque de caja de radio r en una dirección, por canal; envuelto (periódico) o con el borde extendido */
function caja1(src, w, h, c, r, horizontal, envuelve) {
  const out = new Float32Array(src.length), n = horizontal ? w : h, m = horizontal ? h : w, k = 2 * r + 1;
  for (let a = 0; a < m; a++) {
    for (let ch = 0; ch < c; ch++) {
      const idx = (t) => { let q = t; if (envuelve) q = ((q % n) + n) % n; else q = q < 0 ? 0 : q >= n ? n - 1 : q; return (horizontal ? a * w + q : q * w + a) * c + ch; };
      let s = 0; for (let t = -r; t <= r; t++) s += src[idx(t)];
      for (let t = 0; t < n; t++) { out[idx(t)] = s / k; s += src[idx(t + r + 1)] - src[idx(t - r)]; }
    }
  }
  return out;
}
/** desenfoque casi gaussiano: tres cajas de radio r en cada eje (σ ≈ r) */
export function desenfoca(im, r, envuelve) {
  if (r < 1) return { ...im, d: Float32Array.from(im.d) };
  let d = im.d; for (let p = 0; p < 3; p++) { d = caja1(d, im.w, im.h, im.c, r, true, envuelve); d = caja1(d, im.w, im.h, im.c, r, false, envuelve); }
  return { w: im.w, h: im.h, c: im.c, d };
}

/** claridad (luma de Rec. 601) de una imagen de 3 canales */
export function claridad(im) { const o = imagen(im.w, im.h, 1); for (let i = 0; i < o.d.length; i++) o.d[i] = 0.299 * im.d[i * 3] + 0.587 * im.d[i * 3 + 1] + 0.114 * im.d[i * 3 + 2]; return o; }

export function media(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
export function desviacion(a) { const m = media(a); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m); return Math.sqrt(s / a.length); }

/**
 * Aplana la iluminación: divide cada canal por su desenfoque fuerte (radio rGrande, borde extendido). Quita el degradado de luz, la sombra del
 * fotógrafo y el tinte medio: el resultado tiene media ≈ 1 por canal y conserva el detalle (hojas, granos, piedras) y su color RELATIVO.
 */
export function aplana(im, rGrande) {
  const L = desenfoca(im, rGrande, false), o = imagen(im.w, im.h, im.c);
  for (let i = 0; i < o.d.length; i++) o.d[i] = im.d[i] / Math.max(L.d[i], 0.02);
  return o;
}

/**
 * Normaliza alrededor de 1: la claridad con la desviación típica `contraste` y el color con `saturacion` de su desviación respecto a la claridad.
 * Así la textura MODULA el color que ya trae el suelo (la ortofoto: medido) y no lo sustituye.
 */
export function normaliza(f, contraste, saturacion) {
  const n = f.w * f.h, l = new Float32Array(n);
  for (let i = 0; i < n; i++) l[i] = 0.299 * f.d[i * 3] + 0.587 * f.d[i * 3 + 1] + 0.114 * f.d[i * 3 + 2];
  const m = media(l), s = desviacion(l) || 1, k = contraste / s, o = imagen(f.w, f.h, 3);
  for (let i = 0; i < n; i++) {
    const l2 = 1 + suave((l[i] - m) * k, 2.5 * contraste);   // lo muy claro u oscuro (una piedra suelta) se comprime: se notaría al repetirse
    for (let ch = 0; ch < 3; ch++) { const crom = (f.d[i * 3 + ch] - l[i]) * k; o.d[i * 3 + ch] = Math.max(0, Math.min(1.99, l2 + crom * saturacion)); }
  }
  return o;
}

/** recorte suave: lineal hasta ±t y luego se acerca a ±1,6·t sin pasarlo */
export function suave(d, t) { const a = Math.abs(d); if (a <= t) return d; return Math.sign(d) * (t + 0.6 * t * Math.tanh((a - t) / (0.6 * t))); }

/** desplaza la imagen (dx, dy) píxeles envolviendo */
export function desplaza(im, dx, dy) {
  const o = imagen(im.w, im.h, im.c);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) {
    const sx = (x + dx) % im.w, sy = (y + dy) % im.h, a = (y * im.w + x) * im.c, b = (sy * im.w + sx) * im.c;
    for (let ch = 0; ch < im.c; ch++) o.d[a + ch] = im.d[b + ch];
  }
  return o;
}

/**
 * Repetible sin costuras, en dos pasadas (primero en x, luego en y). En cada una se mezcla la imagen con ella misma desplazada medio lado:
 * cerca del borde manda la desplazada (cuyo borde es el centro de la original: continuo al repetirse) y en el centro la original (cuya costura
 * está en el borde). La transición ocupa `banda` (fracción del lado) y la mezcla conserva la varianza (Heitz y Neyret 2018, «histogram-preserving
 * blending», en su forma lineal): a la mitad no se lava el contraste. La segunda pasada no estropea la primera (pesos solo en y sobre algo ya periódico en x).
 */
export function sinCostura(im, banda = 0.18) {
  let cur = im;
  for (const eje of ["x", "y"]) {
    const n = eje === "x" ? cur.w : cur.h, sh = eje === "x" ? desplaza(cur, cur.w >> 1, 0) : desplaza(cur, 0, cur.h >> 1);
    const medias = []; for (let ch = 0; ch < cur.c; ch++) { let s = 0; for (let i = ch; i < cur.d.length; i += cur.c) s += cur.d[i]; medias.push(s / (cur.d.length / cur.c)); }
    const peso = new Float32Array(n), B = Math.max(2, Math.round(banda * n));
    for (let t = 0; t < n; t++) { const de = Math.min(t + 0.5, n - t - 0.5) / B, u = Math.max(0, Math.min(1, de)); peso[t] = u * u * (3 - 2 * u); }   // 0 en el borde, 1 lejos de él
    const o = imagen(cur.w, cur.h, cur.c);
    for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) {
      const w = peso[eje === "x" ? x : y], nrm = Math.sqrt(w * w + (1 - w) * (1 - w)), a = (y * cur.w + x) * cur.c;
      for (let ch = 0; ch < cur.c; ch++) { const m = medias[ch]; o.d[a + ch] = m + (w * (cur.d[a + ch] - m) + (1 - w) * (sh.d[a + ch] - m)) / nrm; }
    }
    cur = o;
  }
  return cur;
}

/**
 * Relieve aproximado (DEDUCIDO, no medido): la claridad de la textura con un paso alto (desenfoque fino menos desenfoque ancho, envueltos: sigue
 * siendo periódico), normalizada a 0,5 ± 2σ. Lo claro (hojas, granos, piedras) queda arriba y lo oscuro (huecos, grietas, sombras) abajo.
 */
export function relieve(f, rFino = 1, rAncho = 24) {
  const l = claridad(f), a = desenfoca(l, rFino, true), b = desenfoca(l, rAncho, true), h = imagen(f.w, f.h, 1);
  for (let i = 0; i < h.d.length; i++) h.d[i] = a.d[i] - b.d[i];
  const s = desviacion(h.d) || 1; for (let i = 0; i < h.d.length; i++) h.d[i] = Math.max(0, Math.min(1, 0.5 + h.d[i] / (4 * s)));
  return h;
}

/** reduce a la mitad con la media de cada 2×2: exacto y conserva la periodicidad (un remuestreo con filtro la rompería en el borde) */
export function mitad(im) {
  const w = im.w >> 1, h = im.h >> 1, o = imagen(w, h, im.c);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let ch = 0; ch < im.c; ch++) {
    const g = (yy, xx) => im.d[(yy * im.w + xx) * im.c + ch];
    o.d[(y * w + x) * im.c + ch] = (g(2 * y, 2 * x) + g(2 * y, 2 * x + 1) + g(2 * y + 1, 2 * x) + g(2 * y + 1, 2 * x + 1)) / 4;
  }
  return o;
}

/**
 * ¿Es repetible? Diferencia media entre la última y la primera columna (y fila), frente a la diferencia media entre columnas (filas) vecinas del
 * interior. Repetible: la costura no se distingue del interior (cociente ≈ 1). `px`: bytes o flotantes intercalados.
 */
export function costura(px, w, h, c) {
  const v = (x, y, ch) => px[(y * w + x) * c + ch];
  let sb = 0, nb = 0, si = 0, ni = 0;
  for (let y = 0; y < h; y++) for (let ch = 0; ch < c; ch++) { sb += Math.abs(v(w - 1, y, ch) - v(0, y, ch)); nb++; for (let x = 0; x < w - 1; x += 7) { si += Math.abs(v(x + 1, y, ch) - v(x, y, ch)); ni++; } }
  for (let x = 0; x < w; x++) for (let ch = 0; ch < c; ch++) { sb += Math.abs(v(x, h - 1, ch) - v(x, 0, ch)); nb++; for (let y = 0; y < h - 1; y += 7) { si += Math.abs(v(x, y + 1, ch) - v(x, y, ch)); ni++; } }
  return { borde: sb / nb, interior: si / ni, cociente: (sb / nb) / ((si / ni) || 1) };
}

/** color medio (sRGB 0-255) de una imagen de bytes, sin lo muy oscuro ni lo quemado */
export function colorMedio(buf, c) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < buf.length; i += c) { const l = 0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2]; if (l < 25 || l > 245) continue; r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
  return n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null;
}

export function hex(rgb) { return "#" + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join(""); }

/**
 * Paleta del cielo de atardecer de una foto (bytes RGB, fila 0 arriba). Fuera lo oscuro (siluetas). Clases por reglas simples de color:
 *  - cielo azul: b > r + 12;  - nube iluminada: r > b + 28 y claridad > 140;  - nube en sombra: |r − b| < 22 y claridad entre 70 y 165.
 * Horizonte: lo no oscuro de las filas de cielo más bajas (el 8 % de abajo); cenit: el cielo azul de las filas más altas (el 15 % de arriba).
 * Devuelve sumas (para juntar varias fotos) y cuentas.
 */
export function cuentaCielo(buf, w, h) {
  const S = { horizonte: [0, 0, 0, 0], cenit: [0, 0, 0, 0], nube_luz: [0, 0, 0, 0], nube_sombra: [0, 0, 0, 0] };
  const suma = (k, r, g, b) => { const s = S[k]; s[0] += r; s[1] += g; s[2] += b; s[3]++; };
  // la fila más baja de cielo de cada columna: por encima de la silueta (lo oscuro conectado con el borde de abajo)
  let filaBaja = 0;
  for (let y = h - 1; y >= 0 && !filaBaja; y--) { let claros = 0; for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 3; if (0.299 * buf[i] + 0.587 * buf[i + 1] + 0.114 * buf[i + 2] > 60) claros++; } if (claros > 0.6 * (w / 4)) filaBaja = y; }
  const yH = filaBaja - Math.round(0.08 * h), yC = Math.round(0.15 * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3, r = buf[i], g = buf[i + 1], b = buf[i + 2], l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (l < 60) continue;
    if (y > yH && y <= filaBaja) suma("horizonte", r, g, b);
    if (y < yC && b > r + 12) suma("cenit", r, g, b);
    if (r > b + 28 && l > 140) suma("nube_luz", r, g, b);
    else if (Math.abs(r - b) < 22 && l > 70 && l < 165 && y < yH) suma("nube_sombra", r, g, b);
  }
  return S;
}
export function juntaCielo(lista) {
  const o = {}; for (const S of lista) for (const k of Object.keys(S)) { o[k] = o[k] || [0, 0, 0, 0]; for (let q = 0; q < 4; q++) o[k][q] += S[k][q]; }
  const r = {}; for (const k of Object.keys(o)) r[k] = o[k][3] ? hex([o[k][0] / o[k][3], o[k][1] / o[k][3], o[k][2] / o[k][3]]) : null;
  return r;
}
