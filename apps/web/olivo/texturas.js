// Texturas del olivo: las tres fotos de campo (corteza, corteza con musgo y madera vieja sin corteza) y los dibujos de la referencia
// (ramita con hojas opuestas, relleno de hoja menuda y la corteza dibujada de reserva). Sin DOM: las fotos como ImageBitmap y los dibujos en
// OffscreenCanvas (o en un <canvas> si no hay OffscreenCanvas).
//
// Las fotos están en apps/web/olivo/texturas/ (versionadas por decisión de Antonio nº 30, con su LICENCIA.txt; se regeneran desde la
// referencia con `npm run texturas`) y el anfitrión las sirve desde su MISMO origen. Si faltan, se usa la corteza dibujada y un color liso,
// y se dice en `avisos`.
import { rngFrom } from "./azar.js";

export const FOTOS = ["corteza", "musgo", "muerta"];

/** Un lienzo de w × h: OffscreenCanvas si existe; si no, <canvas> del documento; si tampoco, null */
export function lienzo(w, h) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  if (typeof document !== "undefined") { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  return null;
}

/**
 * Carga las fotos desde `base` (URL del mismo origen, acabada en «/»). Devuelve { corteza, musgo, muerta: ImageBitmap | null, avisos: [] }.
 * Las fotos se voltean al decodificarlas (imageOrientation "flipY"), porque three no voltea un ImageBitmap: quien haga la textura pone flipY = false.
 */
export async function cargaFotos(base) {
  const r = { avisos: [] };
  await Promise.all(FOTOS.map(async n => {
    r[n] = null;
    try {
      const resp = await fetch(base + n + ".jpg");
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      r[n] = await createImageBitmap(await resp.blob(), { imageOrientation: "flipY" });
    } catch (e) {
      r.avisos.push("sin la foto «" + n + "» (" + (e && e.message || e) + "): se usa " + (n === "corteza" ? "la corteza dibujada" : "un color liso"));
    }
  }));
  return r;
}

/** Corteza dibujada (la de reserva de la referencia), 256 × 512 */
export function dibujaCorteza() {
  const cv = lienzo(256, 512); if (!cv) return null;
  const g = cv.getContext("2d"); g.fillStyle = "#7a6d5c"; g.fillRect(0, 0, 256, 512);
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) { const x = r() * 256, w = 2 + r() * 7, l = 40 + r() * 220, y = r() * 512;
    g.fillStyle = `rgba(${40 + r() * 40 | 0},${36 + r() * 30 | 0},${28 + r() * 24 | 0},${0.25 + r() * 0.35})`;
    g.beginPath(); g.ellipse(x, y, w, l / 2, (r() - 0.5) * 0.15, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(200,190,170,${0.08 + r() * 0.12})`; g.fillRect(r() * 256, r() * 512, 1 + r() * 3, 10 + r() * 60); }
  return cv;
}

const HAZ = ["#5d6a52", "#66735a", "#58654f", "#6d7858"], ENVES = ["#a2aa96", "#aeb4a0", "#959d88", "#b7bba7"];

/** Ramita de olivo (256 × 512, fondo transparente): hojas opuestas, haz gris verdoso y envés plateado; `flor` = null | "boton" | "flor" | "cuajado" */
export function dibujaRamita(sem, flor, cv) {
  cv = cv || lienzo(256, 512); if (!cv) return null;
  const g = cv.getContext("2d"), W = cv.width, Hc = cv.height, r = rngFrom(sem), pick = a => a[(r() * a.length) | 0];
  g.clearRect(0, 0, W, Hc); g.lineCap = "round";
  const pts = []; let x = W / 2 + (r() - 0.5) * 16;
  for (let i = 0; i <= 10; i++) { pts.push([x, Hc - 6 - i * (Hc - 40) / 10]); x += (r() - 0.5) * 12; }
  g.strokeStyle = "#a99c80";
  for (let i = 0; i < 10; i++) { g.lineWidth = 5.5 - 3.5 * i / 10; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); }
  const hoja = (x, y, ang, len, wid, color) => {
    g.save(); g.translate(x, y); g.rotate(ang);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(wid, -len * 0.5, 0, -len); g.quadraticCurveTo(-wid, -len * 0.5, 0, 0);
    g.fillStyle = color; g.fill();
    g.strokeStyle = "rgba(225,228,210,0.35)"; g.lineWidth = 1.1; g.beginPath(); g.moveTo(0, -3); g.lineTo(0, -len * 0.9); g.stroke();
    g.restore();
  };
  const axilas = [];
  for (let i = 1; i <= 9; i++) {
    const px = pts[i][0], py = pts[i][1], frente = i % 2 === 0, joven = i >= 8;
    for (const lado of [-1, 1]) {
      const ang = lado * (frente ? 0.25 + r() * 0.3 : 0.6 + r() * 0.45);
      const len = (frente ? 70 : 100) + r() * 35 - (i > 7 ? 20 : 0), wid = frente ? 11 : 20 + r() * 7;
      hoja(px, py, ang, len, wid, joven && r() < 0.6 ? "#8fa36a" : (r() < 0.55 ? pick(HAZ) : pick(ENVES)));
    }
    if (i >= 2 && i <= 8) axilas.push([px, py]);
  }
  hoja(pts[10][0], pts[10][1], -0.2, 60, 10, "#8fa36a"); hoja(pts[10][0], pts[10][1], 0.25, 55, 10, "#9aae74");
  if (!flor) return cv;
  axilas.push([pts[9][0], pts[9][1]], [pts[1][0], pts[1][1]]);
  for (const [ax, ay] of axilas) {
    for (const lado of [-1, 1]) {
      if (r() < 0.1) continue;
      const a = lado * (0.5 + r() * 0.5) - Math.PI / 2, L = 34 + r() * 24;
      const ex = ax + Math.cos(a) * L, ey = ay + Math.sin(a) * L;
      g.strokeStyle = "#c9c48c"; g.lineWidth = 1.6; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
      const nb = 9 + (r() * 6 | 0);
      for (let k = 0; k < nb; k++) {
        const t = 0.25 + 0.75 * k / (nb - 1), mx = ax + (ex - ax) * t, my = ay + (ey - ay) * t, bx = mx + (r() - 0.5) * 12, by = my + (r() - 0.5) * 12;
        g.strokeStyle = "#c9c48c"; g.lineWidth = 1; g.beginPath(); g.moveTo(mx, my); g.lineTo(bx, by); g.stroke();
        if (flor === "boton") { g.fillStyle = "#c3cc85"; g.beginPath(); g.arc(bx, by, 4.2, 0, 7); g.fill(); g.strokeStyle = "#98a05e"; g.lineWidth = 0.8; g.stroke(); }
        else if (flor === "flor") { g.fillStyle = r() < 0.85 ? "#f6f1da" : "#e8deb0"; g.beginPath(); g.arc(bx, by, 6.6, 0, 7); g.fill();
          g.fillStyle = r() < 0.5 ? "#d2a838" : "#8a5b2c"; g.beginPath(); g.arc(bx + (r() - 0.5) * 3, by + (r() - 0.5) * 3, 1.6, 0, 7); g.fill(); }
        else { if (r() < 0.55) { g.fillStyle = "#6c8a3a"; g.beginPath(); g.arc(bx, by, 3, 0, 7); g.fill(); }
          if (r() < 0.5) { g.fillStyle = "#a17c4b"; g.beginPath(); g.arc(bx + 2, by - 2, 1.4, 0, 7); g.fill(); } }
      }
    }
  }
  return cv;
}

/** Relleno de copa (512 × 512): hoja menuda a tamaño real con huecos por los que pasa la luz; con flor, racimos repartidos */
export function dibujaRelleno(flor, cv) {
  cv = cv || lienzo(512, 512); if (!cv) return null;
  const g = cv.getContext("2d"), r = rngFrom(77); g.clearRect(0, 0, 512, 512); g.lineCap = "round";
  for (let i = 0; i < 60; i++) { const a = r() * 6.28, d = r() * 200, x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d, b = r() * 6.28, l = 40 + r() * 70;
    g.strokeStyle = "#9d917a"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); g.stroke(); }
  for (let i = 0; i < 1100; i++) { const a = r() * 6.28, d = Math.sqrt(r()) * 235, x = 256 + Math.cos(a) * d, y = 256 + Math.sin(a) * d;
    if (r() < Math.pow(d / 235, 3)) continue;
    const b = r() * 6.28, l = 26 + r() * 16, w = 3.2 + r() * 1.8;
    g.save(); g.translate(x, y); g.rotate(b); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(w, -l / 2, 0, -l); g.quadraticCurveTo(-w, -l / 2, 0, 0);
    g.fillStyle = r() < 0.55 ? HAZ[(r() * HAZ.length) | 0] : ENVES[(r() * ENVES.length) | 0]; g.fill(); g.restore(); }
  if (!flor) return cv;
  const rf = rngFrom(91), nRac = flor === "flor" ? 340 : flor === "boton" ? 260 : 120;
  for (let i = 0; i < nRac; i++) { const a = rf() * 6.28, d = Math.sqrt(rf()) * 215, cx = 256 + Math.cos(a) * d, cy = 256 + Math.sin(a) * d, n = flor === "cuajado" ? 3 + (rf() * 4 | 0) : 9 + (rf() * 9 | 0);
    for (let k = 0; k < n; k++) { const x = cx + (rf() - 0.5) * 16, y = cy + (rf() - 0.5) * 16;
      if (flor === "flor") { g.fillStyle = rf() < 0.85 ? "#f3eed6" : "#e6dcae"; g.beginPath(); g.arc(x, y, 2.4 + rf() * 1.2, 0, 7); g.fill();
        if (rf() < 0.3) { g.fillStyle = "#c9a23a"; g.beginPath(); g.arc(x, y, 0.9, 0, 7); g.fill(); } }
      else if (flor === "boton") { g.fillStyle = rf() < 0.6 ? "#c6cf8a" : "#d7d9a4"; g.beginPath(); g.arc(x, y, 1.9 + rf() * 0.8, 0, 7); g.fill(); }
      else { g.fillStyle = "#6f8d3c"; g.beginPath(); g.arc(x, y, 1.6, 0, 7); g.fill(); } } }
  return cv;
}

/** Todo lo de una época: fotos (si se pasan) + dibujos. `flor` sale de ESTADOS[epoca].flor */
export function dibujos(flor) {
  return { cortezaDibujada: dibujaCorteza(), ramitas: [dibujaRamita(11, flor), dibujaRamita(29, flor)], relleno: dibujaRelleno(flor) };
}

/**
 * Mipmaps que CONSERVAN LA COBERTURA del recorte alfa (ADR-0022 §6; The Witness, «Computing alpha mipmaps»; NVIDIA Texture Tools; Unity
 * `mipMapsPreserveCoverage`). Con los mipmaps de la GPU, el alfa de cada nivel es la media de 2 × 2 texeles y, en una hoja estrecha sobre fondo
 * transparente, cae por debajo del `alphaTest`: a pocos píxeles el follaje se deshace y quedan las ramas. Aquí cada nivel se reduce del anterior
 * SIN reescalar (caja 2 × 2; el color, ponderado por el alfa para no oscurecer los bordes) y su alfa se multiplica por el k que deja pasar el
 * corte a la MISMA fracción de texeles que el nivel 0 (búsqueda binaria). Devuelve [nivel 0, 1, …, 1 × 1] como ImageData (lo que espera
 * `texture.mipmaps` de three) o null si no hay lienzo 2D (Node).
 */
export function mipsConCobertura(cv, corte) {
  const g = cv && cv.getContext ? cv.getContext("2d") : null;
  if (!g || typeof ImageData === "undefined") return null;
  let w = cv.width, h = cv.height;
  const d0 = g.getImageData(0, 0, w, h).data, out = [new ImageData(new Uint8ClampedArray(d0), w, h)];
  let A = new Float32Array(w * h * 4); for (let i = 0; i < A.length; i++) A[i] = d0[i] / 255;
  const cobertura = (B, n, k) => { let c = 0; for (let i = 3; i < n * 4; i += 4) if (B[i] * k >= corte) c++; return c / n; };
  const meta = cobertura(A, w * h, 1);
  while (w > 1 || h > 1) {
    const w2 = Math.max(1, w >> 1), h2 = Math.max(1, h >> 1), B = new Float32Array(w2 * h2 * 4), dx = w > 1 ? 2 : 1, dy = h > 1 ? 2 : 1;
    for (let y = 0; y < h2; y++) for (let x = 0; x < w2; x++) {
      let r = 0, gg = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
      for (let j = 0; j < dy; j++) for (let i = 0; i < dx; i++) {
        const q = ((y * dy + j) * w + x * dx + i) * 4, al = A[q + 3];
        r += A[q] * al; gg += A[q + 1] * al; b += A[q + 2] * al; a += al; r0 += A[q]; g0 += A[q + 1]; b0 += A[q + 2];
      }
      const n = dx * dy, o = (y * w2 + x) * 4;
      if (a > 0) { B[o] = r / a; B[o + 1] = gg / a; B[o + 2] = b / a; } else { B[o] = r0 / n; B[o + 1] = g0 / n; B[o + 2] = b0 / n; }
      B[o + 3] = a / n;
    }
    w = w2; h = h2; A = B;
    // la cobertura crece con k: búsqueda binaria del salto que cruza la del nivel 0 y, de sus dos lados, el que queda más cerca
    let lo = 0, hi = 1;
    while (hi < 64 && cobertura(A, w * h, hi) < meta) hi *= 2;
    for (let it = 0; it < 18; it++) { const m = (lo + hi) / 2; if (cobertura(A, w * h, m) < meta) lo = m; else hi = m; }
    const k = Math.abs(cobertura(A, w * h, lo) - meta) < Math.abs(cobertura(A, w * h, hi) - meta) ? lo : hi, u = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < u.length; i += 4) { u[i] = A[i] * 255 + 0.5; u[i + 1] = A[i + 1] * 255 + 0.5; u[i + 2] = A[i + 2] * 255 + 0.5; u[i + 3] = Math.min(1, A[i + 3] * k) * 255 + 0.5; }
    out.push(new ImageData(u, w, h));
  }
  return out;
}
