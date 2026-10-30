// O9a (decisión 80): masa visual de cada escalón del olivo, en el navegador con el three 0.186.1 del motor y el constructor real. Solo mide.
// La carga pruebas/olivo/o9a_masa.mjs en una página con mapa de importaciones (three, three-gen, idb-keyval) y llama a window.mide(cfg).
// Por cada olivo y escalón: 8 vistas horizontales (cada 45°, elevación 0) + 1 cenital, cámara ortográfica con el MISMO encuadre (el del E0),
// fondo transparente (la máscara es el alfa; los materiales son opacos con recorte alfa) y luz fija (sol + cielo, sin sombras: el motor no las
// activa). Métricas por vista, en el lado N de la imagen (512 ≈ el olivo a 16 m en 1080p; 128 ≈ a 60 m):
//   cobertura  píxeles de árbol dentro del casco convexo de la silueta del E0 / área del casco
//   IoU        de la silueta (máscara cerrada y con los agujeros rellenos) frente a la del E0 en la misma vista
//   huecos     % de la silueta por el que se ve el fondo, y nº de agujeros (≥ 2 px) por 10.000 px de silueta
//   color      media sRGB (0-255) de los píxeles de árbol; contraste = desviación típica de la luminancia / su media
// El IMPOSTOR se emula: la variante estirada se dibuja con la resolución de su celda del atlas (128 px por vista sobre 2 × semilado, contrato
// olivo-impostor §1) con 4 × 4 submuestras, y se amplía con filtro bilineal y corte en 0,5 (alphaTest del motor). Vista exacta, sin el error de
// la rejilla 8 × 8 de direcciones ni el mipmap: es una cota optimista.
import * as THREE from "three";
import * as O from "/apps/web/olivo/index.js";

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
document.body.appendChild(renderer.domElement);
const gl = renderer.getContext();
const matsCob = O.creaMateriales(THREE, null, { epoca: "envero", srgb: true });   // hojas con mipmaps que conservan la cobertura (ADR-0022 §6)
const matsGPU = O.creaMateriales(THREE, null, { epoca: "envero", srgb: true, mipsCobertura: false });   // los mipmaps de la GPU (como antes de O9c), para comparar
const escena = new THREE.Scene();
const sol = new THREE.DirectionalLight(0xffffff, 1.5 * Math.PI); sol.position.set(Math.cos(2.4) * 0.6, 0.8, Math.sin(2.4) * 0.6); escena.add(sol); escena.add(sol.target);
escena.add(new THREE.HemisphereLight(0xcfe0ff, 0x7a6a55, 1.1 * Math.PI));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);

function pinta(obj, enc, vista, w, h) {
  renderer.setSize(w, h, false);
  const [cx, cy, cz] = enc.centro, s = vista.cenital ? enc.semiCenital : enc.semi;
  const sx = s * (enc.aspecto || 1);
  cam.left = -sx; cam.right = sx; cam.top = s; cam.bottom = -s; cam.updateProjectionMatrix();
  if (vista.cenital) { cam.up.set(0, 0, -1); cam.position.set(cx, cy + 100, cz); }
  else { cam.up.set(0, 1, 0); cam.position.set(cx + 100 * Math.sin(vista.az), cy, cz + 100 * Math.cos(vista.az)); }
  cam.lookAt(cx, cy, cz); cam.near = 1; cam.far = 300; cam.updateProjectionMatrix();
  escena.add(obj); renderer.render(escena, cam); escena.remove(obj);
  const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return px;
}
const VISTAS = [0, 1, 2, 3, 4, 5, 6, 7].map(k => ({ nombre: "az" + k * 45, az: k * Math.PI / 4 })).concat([{ nombre: "cenital", cenital: true }]);

// ---- morfología sobre máscaras (Uint8Array 0/1, N × N)
function dilata(m, N, r) {
  const t = new Uint8Array(N * N), o = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const xx = x + d; if (xx >= 0 && xx < N && m[y * N + xx]) v = 1; } t[y * N + x] = v; }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let v = 0; for (let d = -r; d <= r && !v; d++) { const yy = y + d; if (yy >= 0 && yy < N && t[yy * N + x]) v = 1; } o[y * N + x] = v; }
  return o;
}
const invierte = m => m.map(v => 1 - v);
const erosiona = (m, N, r) => invierte(dilata(invierte(m), N, r));
function rellena(m, N) {   // lo que no se alcanza desde el borde por el fondo
  const fuera = new Uint8Array(N * N), pila = [];
  for (let i = 0; i < N; i++) for (const p of [i, (N - 1) * N + i, i * N, i * N + N - 1]) if (!m[p] && !fuera[p]) { fuera[p] = 1; pila.push(p); }
  while (pila.length) { const p = pila.pop(), x = p % N, y = (p / N) | 0; for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1]) if (q >= 0 && !m[q] && !fuera[q]) { fuera[q] = 1; pila.push(q); } }
  return invierte(fuera);
}
function silueta(m, N) { const r = Math.max(1, Math.round(N / 170)); return erosiona(rellena(dilata(m, N, r), N), N, r); }
function casco(m, N) {   // casco convexo (cadena monótona) de los extremos de cada fila, relleno por filas
  const P = [];
  for (let y = 0; y < N; y++) { let a = -1, b = -1; for (let x = 0; x < N; x++) if (m[y * N + x]) { if (a < 0) a = x; b = x; } if (a >= 0) { P.push([a, y]); P.push([b + 1, y]); P.push([a, y + 1]); P.push([b + 1, y + 1]); } }
  P.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  const H = lo.slice(0, -1).concat(hi.slice(0, -1)), o = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const c = [x + 0.5, y + 0.5]; let dentro = H.length > 2; for (let i = 0; i < H.length && dentro; i++) if (cr(H[i], H[(i + 1) % H.length], c) < 0) dentro = false; o[y * N + x] = dentro ? 1 : 0; }
  return o;
}
function componentes(m, N, min) {
  const vis = new Uint8Array(N * N); let n = 0;
  for (let p0 = 0; p0 < N * N; p0++) {
    if (!m[p0] || vis[p0]) continue; let t = 0; const pila = [p0]; vis[p0] = 1;
    while (pila.length) { const p = pila.pop(), x = p % N, y = (p / N) | 0; t++; for (const q of [x > 0 ? p - 1 : -1, x < N - 1 ? p + 1 : -1, y > 0 ? p - N : -1, y < N - 1 ? p + N : -1]) if (q >= 0 && m[q] && !vis[q]) { vis[q] = 1; pila.push(q); } }
    if (t >= min) n++;
  }
  return n;
}
const suma = m => m.reduce((a, b) => a + b, 0);

function metricas(px, N, ref) {
  const m = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) m[i] = px[i * 4 + 3] > 127 ? 1 : 0;
  const S = silueta(m, N), Hu = ref ? ref.casco : casco(S, N);
  let dentro = 0, inter = 0, union = 0, R = 0, G = 0, B = 0, n = 0, L = [];
  for (let i = 0; i < N * N; i++) {
    if (m[i] && Hu[i]) dentro++;
    const sr = ref ? ref.S[i] : S[i]; if (S[i] && sr) inter++; if (S[i] || sr) union++;
    if (m[i]) { const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2]; R += r; G += g; B += b; n++; L.push(0.2126 * r + 0.7152 * g + 0.0722 * b); }
  }
  const huecosM = new Uint8Array(N * N); for (let i = 0; i < N * N; i++) huecosM[i] = S[i] && !m[i] ? 1 : 0;
  const aS = suma(S), aH = suma(huecosM), mL = L.reduce((a, b) => a + b, 0) / Math.max(1, L.length), dL = Math.sqrt(L.reduce((a, b) => a + (b - mL) * (b - mL), 0) / Math.max(1, L.length));
  return { r: { S, casco: Hu }, cobertura: +(dentro / Math.max(1, suma(Hu))).toFixed(4), iou: +(inter / Math.max(1, union)).toFixed(4), area_arbol: n, area_silueta: aS,
    huecos_pct: +(100 * aH / Math.max(1, aS)).toFixed(2), agujeros_10k: +(componentes(huecosM, N, 2) * 10000 / Math.max(1, aS)).toFixed(1),
    color: [Math.round(R / Math.max(1, n)), Math.round(G / Math.max(1, n)), Math.round(B / Math.max(1, n))], luz: +mL.toFixed(1), contraste: +(dL / Math.max(1, mL)).toFixed(3) };
}

// ---- el impostor emulado: cobertura y color a la resolución de la celda (4 × 4 submuestras por texel) y ampliado con bilineal + corte en 0,5
function pintaImpostor(obj, enc, vista, N, texel) {
  const s = vista.cenital ? enc.semiCenital : enc.semi, ancho = 2 * s, tH = vista.cenital ? texel.h : texel.h, tV = vista.cenital ? texel.h : texel.v;
  const wc = Math.max(2, Math.ceil(ancho / tH)), hc = Math.max(2, Math.ceil(ancho / tV)), SS = 4;
  const px = pinta(obj, Object.assign({}, enc), vista, wc * SS, hc * SS);
  const cov = new Float32Array(wc * hc), col = new Float32Array(wc * hc * 3);
  for (let y = 0; y < hc; y++) for (let x = 0; x < wc; x++) {
    let c = 0, r = 0, g = 0, b = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) { const p = ((y * SS + j) * wc * SS + x * SS + i) * 4; if (px[p + 3] > 127) { c++; r += px[p]; g += px[p + 1]; b += px[p + 2]; } }
    cov[y * wc + x] = c / (SS * SS); if (c) { col[(y * wc + x) * 3] = r / c; col[(y * wc + x) * 3 + 1] = g / c; col[(y * wc + x) * 3 + 2] = b / c; }
  }
  const out = new Uint8Array(N * N * 4), mu = (a, b, t) => a + (b - a) * t;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N * wc - 0.5, v = (y + 0.5) / N * hc - 0.5, x0 = Math.max(0, Math.min(wc - 1, Math.floor(u))), y0 = Math.max(0, Math.min(hc - 1, Math.floor(v)));
    const x1 = Math.min(wc - 1, x0 + 1), y1 = Math.min(hc - 1, y0 + 1), fx = Math.max(0, Math.min(1, u - x0)), fy = Math.max(0, Math.min(1, v - y0));
    const k = mu(mu(cov[y0 * wc + x0], cov[y0 * wc + x1], fx), mu(cov[y1 * wc + x0], cov[y1 * wc + x1], fx), fy);
    if (k < 0.5) continue;
    let best = y0 * wc + x0, bc = -1; for (const q of [y0 * wc + x0, y0 * wc + x1, y1 * wc + x0, y1 * wc + x1]) if (cov[q] > bc) { bc = cov[q]; best = q; }   // el color, del texel más cubierto (el atlas extiende el color vecino)
    const p = (y * N + x) * 4; out[p] = col[best * 3]; out[p + 1] = col[best * 3 + 1]; out[p + 2] = col[best * 3 + 2]; out[p + 3] = 255;
  }
  return out;
}

// miniatura de una vista (para la hoja de contacto): fondo gris neutro
function miniatura(ctx, px, N, dx, dy, M) {
  const im = ctx.createImageData(M, M), f = N / M;
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const p = ((N - 1 - Math.floor(y * f)) * N + Math.floor(x * f)) * 4, q = (y * M + x) * 4, a = px[p + 3] / 255;
    im.data[q] = px[p] * a + 128 * (1 - a); im.data[q + 1] = px[p + 1] * a + 128 * (1 - a); im.data[q + 2] = px[p + 2] * a + 128 * (1 - a); im.data[q + 3] = 255;
  }
  ctx.putImageData(im, dx, dy);
}

/** cfg: {lados: [512, 128], olivos: [{nombre, entrada, mipsGPU? (los mipmaps de hoja de la GPU), variantes?: [{semilla, copa, altura, etiqueta, impostor?}]}]} */
window.mide = async function (cfg) {
  const res = [], hojas = {};
  for (const ol of cfg.olivos) {
    const r0 = O.receta(ol.entrada), filas = [], mats = ol.mipsGPU ? matsGPU : matsCob;
    for (const k of O.NIVELES) filas.push({ etiqueta: k, receta: O.aNivel(r0, k), tri: O.triangulosNivel(O.aNivel(r0, k)) });
    for (const v of ol.variantes || []) {
      const rv = O.receta({ tipo: "centenario3", epoca: ol.entrada.epoca, semilla: v.semilla }), rn = O.aNivel(rv, v.nivel || "E2");
      const kx = v.copa / rn.medidas.copa_m, ky = v.altura / rn.medidas.altura_m;
      filas.push({ etiqueta: v.etiqueta, receta: rn, tri: O.triangulosNivel(rn), estira: [kx, ky], impostor: !!v.impostor });
    }
    const g0 = O.montaOlivo(THREE, r0, mats); g0.updateMatrixWorld(true);
    const caja = new THREE.Box3().setFromObject(g0), c = caja.getCenter(new THREE.Vector3()), t = caja.getSize(new THREE.Vector3());
    const enc = { centro: [c.x, c.y, c.z], semi: 0.54 * Math.max(t.y, Math.hypot(t.x, t.z)), semiCenital: 0.54 * Math.max(t.x, t.z) * 1.15 };
    O.liberaOlivo(g0);
    for (const N of cfg.lados) {
      const lienzo = document.createElement("canvas"), M = 96; lienzo.width = M * VISTAS.length; lienzo.height = M * filas.length;
      const ctx = lienzo.getContext("2d"), ref = {};
      for (let f = 0; f < filas.length; f++) {
        const F = filas[f], g = O.montaOlivo(THREE, F.receta, mats);
        if (F.estira) { g.scale.x *= F.estira[0]; g.scale.z *= F.estira[0]; g.scale.y *= F.estira[1]; }
        g.updateMatrixWorld(true);
        let texel = null;
        if (F.impostor) {   // la celda del atlas: 128 px sobre 2 × semilado del árbol SIN estirar (radio de la esfera de su caja × 1,02), estirada como la variante
          const gs = O.montaOlivo(THREE, F.receta, mats); gs.updateMatrixWorld(true);
          const semilado = new THREE.Box3().setFromObject(gs).getBoundingSphere(new THREE.Sphere()).radius * 1.02; O.liberaOlivo(gs);
          texel = { h: F.estira[0] * 2 * semilado / 128, v: F.estira[1] * 2 * semilado / 128, semilado };
        }
        const porVista = {};
        for (let vi = 0; vi < VISTAS.length; vi++) {
          const V = VISTAS[vi], px = texel ? pintaImpostor(g, enc, V, N, texel) : pinta(g, enc, V, N, N);
          const mtr = metricas(px, N, f === 0 ? null : ref[V.nombre]);
          if (f === 0) ref[V.nombre] = mtr.r;
          delete mtr.r; porVista[V.nombre] = mtr;
          miniatura(ctx, px, N, vi * M, f * M, M);
          await new Promise(ok => setTimeout(ok, 0));
        }
        O.liberaOlivo(g);
        res.push({ olivo: ol.nombre, lado: N, escalon: F.etiqueta, tri: F.tri, estira: F.estira ? F.estira.map(x => +x.toFixed(3)) : null, texel_m: texel ? { h: +texel.h.toFixed(3), v: +texel.v.toFixed(3), semilado: +texel.semilado.toFixed(2) } : null, vistas: porVista });
      }
      hojas[ol.nombre + "@" + N] = lienzo.toDataURL("image/png");
    }
  }
  return { res, hojas, three: THREE.REVISION };
};
window.listo = true;
