"use strict";
// AG-2.2: cartulinas recortadas a la silueta (doc/sistema/CARTULINAS.md; apps/web/olivo/silueta.js, 07ab_generados, 07ac_lejanos, tuberia/olivos/impostores.mjs).
//   · la silueta de una textura sintética CONTIENE todos los texeles que pasan el corte (con su cuadrado entero), en el nivel 0 y en los mipmaps que cuenta;
//   · tiene entre 6 y 10 vértices (lo que se pida) y no se sale de su región (en un atlas, la celda vecina);
//   · recortaQuads: las mismas uv (la posición es la función afín de las uv del cuadrilátero), la misma normal y el mismo sentido de giro;
//   · la perilla ?cartulina=rect|silueta (defecto rect) y que 07ab y 07ac la miran;
//   · las siluetas del impostor de la tubería: forma del esquema y contención celda a celda.
// No dibuja nada: los píxeles y los fps los dan las capturas del banco (pruebas/cartulinas_capturas.js) y un aparato real (no probado en Quest ni iPhone).
const test = require("node:test"), assert = require("node:assert"), path = require("path"), fs = require("fs"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");
const { fabrica } = require("./_materiales");

const imp = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);
let S = null;
test.before(async () => { S = await imp("apps", "web", "olivo", "silueta.js"); });

// azar con semilla fija (mulberry32)
const azar = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
/** una textura RGBA de manchas (elipses y trazos) con el alfa entre 0 y 255, como una ramita: fila 0 arriba */
function sintetica(W, H, semilla, n) {
  const r = azar(semilla), d = new Uint8Array(W * H * 4), manchas = [];
  for (let k = 0; k < n; k++) manchas.push({ x: W * (0.2 + 0.6 * r()), y: H * (0.15 + 0.7 * r()), a: W * (0.03 + 0.12 * r()), b: H * (0.02 + 0.1 * r()), al: 80 + 175 * r() });
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let a = 0; for (const m of manchas) { const u = (x + 0.5 - m.x) / m.a, v = (y + 0.5 - m.y) / m.b; if (u * u + v * v < 1) a = Math.max(a, m.al); }
    d[(y * W + x) * 4 + 3] = a;
  }
  return d;
}
/** los texeles de un nivel con alfa ≥ corte, como sus cuatro esquinas en uv (v hacia arriba: fila 0 arriba) dentro de la región */
function esquinasOpacas(L, corte, R) {
  const out = [];
  for (let y = 0; y < L.alto; y++) for (let x = 0; x < L.ancho; x++) {
    const a = L.datos[(y * L.ancho + x) * (L.paso || 4) + (L.canal === undefined ? 3 : L.canal)]; if (a < corte * 255) continue;
    const u0 = x / L.ancho, u1 = (x + 1) / L.ancho, v1 = 1 - y / L.alto, v0 = 1 - (y + 1) / L.alto;
    if (R && (u1 <= R[0] || u0 >= R[2] || v1 <= R[1] || v0 >= R[3])) continue;
    for (const p of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]) out.push(R ? [Math.min(R[2], Math.max(R[0], p[0])), Math.min(R[3], Math.max(R[1], p[1]))] : p);
  }
  return out;
}

test("la silueta contiene todos los texeles opacos (nivel 0 y mipmaps de ≥ 16 texeles) y tiene entre 6 y 10 vértices", () => {
  for (const [W, H, sem, n] of [[256, 512, 1, 9], [128, 128, 7, 3], [512, 512, 11, 14], [64, 128, 23, 1]]) {
    const d = sintetica(W, H, sem, n), mips = S.mipsCaja(d, W, H), L = [{ datos: d, ancho: W, alto: H }].concat(mips);
    for (const k of [6, 8, 10]) for (const umbral of [0.45, 0.5]) {
      const s = S.siluetaDe(L, null, { umbral, vertices: k });
      assert.ok(s.poligono, "hay silueta " + [W, H, sem, k]);
      // con manchas repartidas, la envolvente tiene muchos vértices y se reduce a los pedidos (6-10); si la envolvente ya tiene menos (una mancha
      // recortada por el borde), se queda con los suyos: menos triángulos, la misma contención
      if (n > 1) assert.ok(s.vertices >= 6 && s.vertices <= k, "vértices " + s.vertices + " (pedidos " + k + ")");
      else assert.ok(s.vertices >= 3 && s.vertices <= k, "vértices " + s.vertices);
      assert.ok(s.vertices <= 10, "nunca más de 10 vértices");
      assert.ok(S.area(s.poligono) > 0, "antihorario");
      assert.ok(s.area < 1 && s.area > 0, "área relativa " + s.area);
      const P = s.poligono;
      for (const Lk of L) {
        if (Lk !== L[0] && Math.min(Lk.ancho, Lk.alto) < S.SILUETA.MIN_TEXELES) continue;
        for (const p of esquinasOpacas(Lk, umbral)) assert.ok(S.contiene(P, p, 1e-9), "texel opaco fuera (" + Lk.ancho + "×" + Lk.alto + ", " + p + ")");
      }
      for (const p of P) assert.ok(p[0] >= -1e-9 && p[0] <= 1 + 1e-9 && p[1] >= -1e-9 && p[1] <= 1 + 1e-9, "dentro de la textura");
    }
  }
});

test("en un atlas, la silueta de cada celda no se sale de su celda y contiene lo opaco de la celda", () => {
  const W = 1024, H = 512, d = new Uint8Array(W * H * 4);
  for (let c = 0; c < 8; c++) {   // 4 × 2 celdas de 256, con manchas que llegan al borde de la celda
    const cx = (c % 4) * 256, cy = Math.floor(c / 4) * 256, t = sintetica(256, 256, 100 + c, 6);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) d[((cy + y) * W + cx + x) * 4 + 3] = t[(y * 256 + x) * 4 + 3];
  }
  const L = [{ datos: d, ancho: W, alto: H }].concat(S.mipsCaja(d, W, H));
  for (let c = 0; c < 8; c++) {
    const col = c % 4, fila = Math.floor(c / 4), R = [col / 4, 1 - (fila + 1) / 2, (col + 1) / 4, 1 - fila / 2];
    const s = S.siluetaDe(L, R, { umbral: 0.45, vertices: 6 });
    assert.ok(s.poligono, "celda " + c);
    for (const p of s.poligono) assert.ok(p[0] >= R[0] - 1e-9 && p[0] <= R[2] + 1e-9 && p[1] >= R[1] - 1e-9 && p[1] <= R[3] + 1e-9, "vértice fuera de la celda " + c + ": " + p);
    for (const p of esquinasOpacas(L[0], 0.45, R)) assert.ok(S.contiene(s.poligono, p, 1e-9), "texel opaco fuera en la celda " + c);
  }
});

test("filaArriba: false (readPixels, fila 0 abajo) da la silueta volteada", () => {
  const W = 64, H = 64, d = sintetica(W, H, 5, 2), v = new Uint8Array(d.length);
  for (let y = 0; y < H; y++) v.set(d.subarray(y * W * 4, (y + 1) * W * 4), (H - 1 - y) * W * 4);
  const a = S.siluetaDe([{ datos: d, ancho: W, alto: H }], null, { vertices: 6 }), b = S.siluetaDe([{ datos: v, ancho: W, alto: H }], null, { vertices: 6, filaArriba: false });
  assert.ok(Math.abs(a.area - b.area) < 1e-9, "la misma área");
});

test("sin nada opaco o sin ganancia: sin silueta (se queda el rectángulo)", () => {
  const vacia = new Uint8Array(32 * 32 * 4), llena = new Uint8Array(32 * 32 * 4).fill(255);
  assert.strictEqual(S.siluetaDe([{ datos: vacia, ancho: 32, alto: 32 }], null, {}).poligono, null);
  const s = S.siluetaDe([{ datos: llena, ancho: 32, alto: 32 }], null, {});
  assert.strictEqual(S.compensa(s), false, "llena: no compensa");
});

test("recortaQuads: mismas uv (posición afín), misma normal y mismo giro; los cuadriláteros sin silueta, tal cual", () => {
  // una PlaneGeometry de three 0.128 (índices 0-2-1, 2-3-1) y una tarjeta de tres planos (0-1-2, 0-2-3), con celdas de atlas
  const plano = { atrib: { position: new Float32Array([-0.15, 0.57, 0, 0.15, 0.57, 0, -0.15, -0.03, 0, 0.15, -0.03, 0]), normal: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), uv: new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]) }, indice: new Uint32Array([0, 2, 1, 2, 3, 1]) };
  const hex = (u0, v0, u1, v1) => { const cx = (u0 + u1) / 2, cy = (v0 + v1) / 2, rx = (u1 - u0) / 2, ry = (v1 - v0) / 2; return [0, 1, 2, 3, 4, 5].map(k => [cx + rx * 0.9 * Math.cos(k * Math.PI / 3), cy + ry * 0.9 * Math.sin(k * Math.PI / 3)]); };
  const giro = (P, I, t) => { const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2], e1 = [0, 1, 2].map(k => P[b * 3 + k] - P[a * 3 + k]), e2 = [0, 1, 2].map(k => P[c * 3 + k] - P[a * 3 + k]); return [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]]; };
  const r = S.recortaQuads(plano.atrib, plano.indice, hex);
  assert.strictEqual(r.triangulos, 4, "hexágono: 4 triángulos");
  for (let i = 0; i < r.atrib.uv.length / 2; i++) {
    const u = r.atrib.uv[2 * i], v = r.atrib.uv[2 * i + 1];
    assert.ok(Math.abs(r.atrib.position[3 * i] - (-0.15 + 0.3 * u)) < 1e-6 && Math.abs(r.atrib.position[3 * i + 1] - (-0.03 + 0.6 * v)) < 1e-6, "posición afín de la uv");
    assert.strictEqual(r.atrib.normal[3 * i + 2], 1);
  }
  const n0 = giro(plano.atrib.position, plano.indice, 0);
  for (let t = 0; t < r.triangulos; t++) assert.ok(Math.sign(giro(r.atrib.position, r.indice, t)[2]) === Math.sign(n0[2]), "mismo giro, triángulo " + t);
  // la tarjeta de verdad (tres planos, celdas del atlas con margen) de la biblioteca
  return imp("apps", "web", "olivo", "tarjetas.js").then(T => {
    const g = T.geosTarjeta().tarjeta, celdas = [];
    const r2 = S.recortaQuads(g.atrib, g.indice, (u0, v0, u1, v1) => { celdas.push([u0, v0, u1, v1]); return celdas.length === 2 ? null : hex(u0, v0, u1, v1); });
    assert.strictEqual(celdas.length, 3, "tres planos"); assert.strictEqual(r2.triangulos, 4 + 2 + 4, "el plano sin silueta se queda con sus 2");
    for (let i = 0; i < r2.atrib.uv.length / 2; i++) {
      const u = r2.atrib.uv[2 * i], v = r2.atrib.uv[2 * i + 1], c = celdas.find(q => u >= q[0] - 1e-9 && u <= q[2] + 1e-9 && v >= q[1] - 1e-9 && v <= q[3] + 1e-9);
      assert.ok(c, "uv dentro de su celda");
    }
    for (let t = 0; t < 2; t++) { const a = giro(g.atrib.position, g.indice, 0), b = giro(r2.atrib.position, r2.indice, t); assert.ok(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0, "plano A: mismo giro"); }
  });
});

test("poligonosFijos: K vértices por celda (repite el último) y el cuadrado sin silueta", () => {
  const d = S.poligonosFijos([[[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]], null], 6);
  assert.deepStrictEqual(Array.from(d.subarray(0, 12)).map(x => +x.toFixed(4)), [0.1, 0.1, 0.9, 0.1, 0.9, 0.9, 0.1, 0.9, 0.1, 0.9, 0.1, 0.9]);
  assert.deepStrictEqual(Array.from(d.subarray(12)), [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1]);
});

test("la perilla ?cartulina=rect|silueta: defecto rect; lo raro avisa y se queda en rect", () => {
  const T = { MeshLambertMaterial: function () {} }, { Materiales } = fabrica(T), E = q => JSON.parse(JSON.stringify(Materiales.eligeCartulina(q)));
  for (const q of ["", "?debug", undefined]) { assert.strictEqual(E(q).modo, "rect"); assert.strictEqual(E(q).silueta, false); assert.strictEqual(E(q).origen, "defecto"); }
  assert.strictEqual(E("?cartulina=silueta").silueta, true); assert.strictEqual(E("?a=1&cartulina=silueta&b=2").origen, "url");
  assert.strictEqual(E("?cartulina=rect").silueta, false); assert.strictEqual(E("?cartulina=rect").origen, "url");
  const raro = E("?cartulina=octogono"); assert.strictEqual(raro.modo, "rect"); assert.match(raro.advertencia, /solo vale rect o silueta/);
  assert.strictEqual(Materiales.cartulina.modo, "rect", "en la fábrica (sin ?cartulina) el defecto");
  assert.strictEqual(fabrica(T, { busqueda: "?cartulina=silueta" }).Materiales.cartulina.silueta, true);
  Materiales.apuntaCartulina("x", { area: 0.7 }); assert.deepStrictEqual(Materiales.cartulina.piezas.x, { area: 0.7 });
});

test("07ab y 07ac miran la perilla, cuentan los triángulos de la silueta y no calculan nada por fotograma", () => {
  const g = lee("apps/web/motor/07ab_generados.js"), l = lee("apps/web/motor/07ac_lejanos.js");
  assert.match(g, /if \(Materiales\.cartulina\.silueta\) \{ silPend = true; encola\("Gsiluetas", -2, siluetasG\(\)/, "07ab: las siluetas por la cola propia, al montar los materiales");
  assert.match(g, /function tri\(r\) \{ return r \? M\.triangulosNivel\(r\) \+ extraSil\(r\) : 0; \}/, "07ab: el reparto paga los triángulos de la silueta");
  assert.match(g, /gs = SIL && SIL\[k\] \|\| G\[gk\], g = geoDe\(gs\.atrib, gs\.indice, false\)/, "07ab: la malla instanciada usa la silueta");
  assert.match(l, /Materiales\.cartulina\.silueta \? polisImpostor\(f\) : null/, "07ac: impostor con las siluetas de la fila");
  assert.match(l, /Cola\.add\("Lsil", 60, gen, fin\)/, "07ac: las del sustituto, al hornear y por la Cola");
  // el trozo que se cambia del sombreador del impostor existe tal cual (si no, la silueta no se aplicaría)
  assert.ok(l.includes('" vec3 ot_off = position.x * ot_r + position.y * ot_u; transformed = ot_C + ot_off * ot_S;'), "07ac: el trozo de GLSL_IMP_V que sustituye la silueta");
  // nada de esto en el paso por fotograma
  const paso = g.slice(g.indexOf("function paso("), g.indexOf("function paso(") + 3000);
  assert.ok(!/siluetaDe|recortaQuads/.test(paso), "07ab: nada de siluetas por fotograma");
});

test("las siluetas del impostor (tubería): forma del esquema, orden k · 64 + j · 8 + i y contención celda a celda", async () => {
  const IM = await imp("tuberia", "olivos", "impostores.mjs"), I = (await imp("apps", "web", "olivo", "impostor.js"));
  const lado = 2048, d = new Uint8Array(lado * lado * 4);
  // dos variantes: en cada vista, un árbol sintético (copa elíptica y tronco), distinto por vista
  const vistas = [[0, 0, 0], [0, 3, 5], [1, 7, 7], [1, 2, 6]];
  for (const [k, i, j] of vistas) {
    const c = I.celdaPixeles(k, i, j, lado), t = sintetica(128, 128, 1 + k * 64 + j * 8 + i, 5);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) d[((c.y + y) * lado + c.x + x) * 4 + 3] = t[(y * 128 + x) * 4 + 3];
  }
  const s = await IM.siluetasAtlas(d, lado, 2);
  assert.strictEqual(s.vertices, 6); assert.strictEqual(s.poligonos.length, 128);
  const Ajv = require("ajv/dist/2020"), ajv = new Ajv({ strict: false }), esq = JSON.parse(lee("contratos/hornero-manifiesto.schema.json"));
  const v = ajv.compile(esq.properties.impostores.items.properties.siluetas);
  assert.ok(v(s), JSON.stringify(v.errors));
  for (const [k, i, j] of vistas) {
    const q = s.poligonos[k * 64 + j * 8 + i], P = []; for (let n = 0; n < q.length; n += 2) P.push([q[n], q[n + 1]]);
    const H = S.envolvente(P), c = I.celdaPixeles(k, i, j, lado);
    assert.ok(S.area(H) < 0.99, "la vista " + [k, i, j] + " lleva silueta");
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) if (d[((c.y + y) * lado + c.x + x) * 4 + 3] >= 128)
      for (const [a, b] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) assert.ok(S.contiene(H, [a / 128, 1 - b / 128], 1e-3), "texel opaco fuera en " + [k, i, j]);
  }
  assert.deepStrictEqual(s.poligonos[1], [0, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1], "una vista vacía lleva el cuadrado");
});

test("07ab en Node con ?cartulina=silueta: las siluetas antes del primer lote, con sus triángulos; con rect, nada (pruebas/olivo/cartulinas_motor.mjs)", { timeout: 300000 }, (t) => {
  if (!fs.existsSync(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-r186"))) return t.skip("falta el constructor (cd apps/web/olivo && npm ci)");
  const r = require("child_process").spawnSync(process.execPath, [path.join(RAIZ, "pruebas", "olivo", "cartulinas_motor.mjs")], { cwd: RAIZ, encoding: "utf8", timeout: 280000 });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.trim().split("\n").pop());
  assert.deepStrictEqual(j.mal, []);
});
