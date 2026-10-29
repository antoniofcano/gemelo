"use strict";
// Impostores de olivo (O8b, contratos/olivo-impostor.md, ADR-0019 §2):
//   - en Node: la disposición hemi-octaédrica (direcciones, ida y vuelta, base de cada vista, celdas que teselan el atlas sin solaparse), la clave
//     y la fila del manifiesto (esquema con ajv, lo que el esquema no dice, ida y vuelta por JSON, el hornero conserva o descarta filas);
//   - en Chrome (por el turno del banco; se salta sin Chrome o sin el constructor): hornea UNA variante E2 real del fixture, comprueba tamaños,
//     esquinas transparentes y centro con color en cada vista, normales unitarias, y que dos horneados seguidos dan la misma huella. Deja los
//     atlas en pruebas/salida/impostor/ para mirarlos.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const os = require("os");
const { RAIZ, SALIDA, fs, path } = require("./_util");
const { motivoSalto } = require("./_navegador");
const imp = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);

let I, HN, IM;
test.before(async () => { I = await imp("apps", "web", "olivo", "impostor.js"); HN = await imp("tuberia", "olivos", "hornero.mjs"); IM = await imp("tuberia", "olivos", "impostores.mjs"); });

const punto = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cerca = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test("direcciones de las 8 × 8 vistas: unitarias, en el hemisferio de arriba, con el horizonte en el borde y la ida y vuelta exacta", () => {
  const n = I.IMPOSTOR.REJILLA;
  assert.strictEqual(n, 8); assert.strictEqual(I.IMPOSTOR.LADO, I.IMPOSTOR.POR_LADO * n * I.IMPOSTOR.VISTA); assert.strictEqual(I.IMPOSTOR.LADO_NORMAL, I.IMPOSTOR.POR_LADO * n * I.IMPOSTOR.VISTA_NORMAL);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const d = I.direccionDeVista(i, j, n);
    assert.ok(cerca(Math.hypot(...d), 1), "unitaria"); assert.ok(d[1] >= 0, "arriba del horizonte");
    if (i === 0 || j === 0 || i === n - 1 || j === n - 1) assert.ok(cerca(d[1], 0), "el borde de la rejilla es el horizonte (" + i + "," + j + ")");
    const [gi, gj] = I.vistaContinua(d, n);
    assert.ok(cerca(gi, i, 1e-9) && cerca(gj, j, 1e-9), "ida y vuelta (" + i + "," + j + ") → (" + gi + "," + gj + ")");
  }
  // las esquinas son los cuatro puntos cardinales del horizonte
  assert.deepStrictEqual(I.direccionDeVista(n - 1, n - 1, n).map(Math.round), [1, 0, 0]);
  assert.deepStrictEqual(I.direccionDeVista(0, 0, n).map(Math.round), [-1, 0, 0]);
  assert.deepStrictEqual(I.direccionDeVista(n - 1, 0, n).map(Math.round), [0, 0, 1]);
  assert.deepStrictEqual(I.direccionDeVista(0, n - 1, n).map(Math.round), [0, 0, -1]);
  // por debajo del horizonte se usa la fila del horizonte; el cenit cae en el centro de la rejilla
  const [a, b] = I.octaDeDireccion([0.6, -0.3, 0.2]); assert.ok(cerca(Math.max(Math.abs(a), Math.abs(b)), 1), "mirada desde abajo → horizonte");
  assert.deepStrictEqual(I.vistaContinua([0, 1, 0], n), [(n - 1) / 2, (n - 1) / 2]);
});

test("base de cada vista: ortonormal, de mano derecha (r × u = d) y con u hacia arriba; en el cenit, r = +X", () => {
  const n = I.IMPOSTOR.REJILLA, dirs = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) dirs.push(I.direccionDeVista(i, j, n));
  dirs.push([0, 1, 0]);
  for (const d of dirs) {
    const { r, u } = I.baseDeVista(d);
    assert.ok(cerca(Math.hypot(...r), 1) && cerca(Math.hypot(...u), 1), "unitarias");
    assert.ok(cerca(punto(r, d), 0) && cerca(punto(u, d), 0) && cerca(punto(r, u), 0), "ortogonales");
    const c = [r[1] * u[2] - r[2] * u[1], r[2] * u[0] - r[0] * u[2], r[0] * u[1] - r[1] * u[0]];
    assert.ok(cerca(c[0], d[0]) && cerca(c[1], d[1]) && cerca(c[2], d[2]), "r × u = d");
    assert.ok(u[1] >= -1e-12, "u no mira hacia abajo"); assert.ok(cerca(r[1], 0), "r horizontal");
  }
  assert.deepStrictEqual(I.baseDeVista([0, 1, 0]).r, [1, 0, 0]);
});

test("las celdas de las 4 variantes × 64 vistas teselan los dos atlas sin solaparse; v hacia arriba y fila 0 del fichero arriba", () => {
  const n = I.IMPOSTOR.REJILLA, k4 = I.IMPOSTOR.POR_LADO ** 2;
  for (const [lado, vista] of [[I.IMPOSTOR.LADO, I.IMPOSTOR.VISTA], [I.IMPOSTOR.LADO_NORMAL, I.IMPOSTOR.VISTA_NORMAL]]) {
    const ocupado = new Uint8Array((lado / vista) ** 2);
    for (let k = 0; k < k4; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const c = I.celdaPixeles(k, i, j, lado);
      assert.strictEqual(c.w, vista); assert.strictEqual(c.x % vista, 0); assert.strictEqual(c.y % vista, 0);
      const idx = (c.y / vista) * (lado / vista) + c.x / vista; assert.strictEqual(ocupado[idx], 0, "solape en " + [k, i, j]); ocupado[idx] = 1;
    }
    assert.ok(ocupado.every(x => x === 1), "todo el atlas usado");
  }
  assert.deepStrictEqual(I.celdaUV(0, 0, 0), [0, 0, 1 / 16, 1 / 16], "la vista (0,0) de la variante 0, abajo a la izquierda en uv");
  assert.deepStrictEqual(I.celdaPixeles(0, 0, 0, 2048), { x: 0, y: 2048 - 128, w: 128 }, "…que en el fichero es la última fila de celdas");
  assert.deepStrictEqual(I.celdaUV(3, 7, 7), [15 / 16, 15 / 16, 1, 1], "la variante 3, arriba a la derecha");
});

// una fila de impostores sintética (las huellas no son de ficheros reales salvo en la prueba que los crea)
const filaSintetica = (ej, epoca, huellas) => {
  const fuentes = ej.variantes.filter(f => f.epoca === epoca && f.nivel === "E2");
  return { formato: 1, epoca, nivel: "E2", rejilla: 8, vista: 128, vista_normal: 64, clave: "0".repeat(32),
    color: { huella: huellas[0], bytes: 11, lado: 2048, imagen: "webp", sin_perdida: false }, normales: { huella: huellas[1], bytes: 7, lado: 1024, imagen: "webp", sin_perdida: false },
    variantes: fuentes.map((f, k) => ({ celda: k, tipo: f.tipo, semilla: f.semilla, fuente: f.huella, caja: [[-4, 0, -4], [4, 5, 4]], centro: [0, 2.5, 0], semilado: 5.9,
      copa: { centro: [0, 3, 0], semiejes: [4, 2, 4] }, medidas: { altura_m: 5, copa_m: 8 } })),
    horneado: { three: "186", chrome: "sintetico", ms: 1 } };
};
const ejemplo = () => JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "horneado", "manifiesto-ejemplo.json"), "utf8"));

test("manifiesto con impostores: valida (ajv + lo que el esquema no dice), ida y vuelta por JSON, y los errores se ven", () => {
  const m = ejemplo(); m.impostores = [filaSintetica(m, "envero", ["a".repeat(32), "b".repeat(32)]), filaSintetica(m, "madura", ["c".repeat(32), "d".repeat(32)])];
  assert.deepStrictEqual(HN.validaManifiesto(m), []);
  for (const f of m.impostores) assert.deepStrictEqual(I.validaFilaImpostor(f), []);
  const vuelta = JSON.parse(JSON.stringify(m)); assert.deepStrictEqual(vuelta, m); assert.deepStrictEqual(HN.validaManifiesto(vuelta), []);
  const sin = ejemplo(); assert.deepStrictEqual(HN.validaManifiesto(sin), [], "sin impostores sigue valiendo (opcional; v sigue en 1)");
  const mal = JSON.parse(JSON.stringify(m));
  mal.impostores[1].epoca = "envero"; mal.impostores[0].variantes[1].fuente = "e".repeat(32); mal.impostores[0].color.lado = 1024;
  const e = HN.validaManifiesto(mal).join(" | ");
  assert.match(e, /impostor repetido/); assert.match(e, /fuente e+ no es una variante/); assert.match(e, /lados/);
  const mal2 = JSON.parse(JSON.stringify(m)); mal2.impostores[0].rejilla = 16; assert.ok(HN.validaManifiesto(mal2).length, "otra rejilla: el esquema la rechaza");
  const mal3 = JSON.parse(JSON.stringify(m)); mal3.impostores[0].variantes[0].caja = [[1, 1, 1], [0, 0, 0]]; assert.ok(I.validaFilaImpostor(mal3.impostores[0]).some(x => /al revés/.test(x)));
});

test("claveImpostor: determinista y cambia con la época, las fuentes y lo que hornea", async () => {
  const a = await IM.claveDe("envero", ["1".repeat(32)]), b = await IM.claveDe("envero", ["1".repeat(32)]);
  assert.match(a, /^[0-9a-f]{32}$/); assert.strictEqual(a, b);
  assert.notStrictEqual(a, await IM.claveDe("madura", ["1".repeat(32)]));
  assert.notStrictEqual(a, await IM.claveDe("envero", ["2".repeat(32)]));
  assert.notStrictEqual(I.claveImpostor({ epoca: "envero", fuentes: [], three: "0.186.1" }), I.claveImpostor({ epoca: "envero", fuentes: [], three: "0.187.0" }));
});

test("incremental sin Chrome: una fila con la misma clave y sus atlas en disco se reutiliza; el hornero sin impostores conserva las que siguen valiendo", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "impostor-")), m = ejemplo();
  const huellas = ["1".repeat(32), "2".repeat(32)];
  fs.writeFileSync(path.join(dir, huellas[0] + ".webp"), Buffer.alloc(11)); fs.writeFileSync(path.join(dir, huellas[1] + ".webp"), Buffer.alloc(7));
  const fila = filaSintetica(m, "envero", huellas); fila.clave = await IM.claveDe("envero", fila.variantes.map(v => v.fuente));
  const solo = Object.assign({}, m, { epocas: m.epocas.filter(e => e.epoca === "envero") });
  const r = await IM.horneaImpostores({ carpeta: dir, manifiesto: solo, anterior: Object.assign({}, m, { impostores: [fila] }), navegador: { newPage() { throw new Error("no debía abrir Chrome"); }, version: () => "x" } });
  assert.strictEqual(r.horneados, 0); assert.strictEqual(r.reutilizados, 1); assert.deepStrictEqual(r.filas, [fila]);
  // el hornero sin `impostores`: la fila sigue valiendo si sus fuentes siguen y sus atlas están; si falta un atlas o cambia una fuente, se descarta
  assert.deepStrictEqual(HN.impostoresVigentes(Object.assign({}, m, { impostores: [fila] }), m.variantes, dir), [fila]);
  const otras = m.variantes.map(f => Object.assign({}, f, { huella: f.huella.replace(/^./, c => (c === "f" ? "0" : "f")) }));
  assert.deepStrictEqual(HN.impostoresVigentes(Object.assign({}, m, { impostores: [fila] }), otras, dir), []);
  fs.unlinkSync(path.join(dir, huellas[1] + ".webp"));
  assert.deepStrictEqual(HN.impostoresVigentes(Object.assign({}, m, { impostores: [fila] }), m.variantes, dir), []);
});

// ---------- Chrome: una variante E2 real del fixture
const sinConstructor = () => { try { require.resolve(path.join(RAIZ, "apps", "web", "olivo", "node_modules", "three-gen", "package.json")); return null; } catch (e) { return "falta el constructor (cd apps/web/olivo && npm i)"; } };
const sinHornero = () => { try { require.resolve(path.join(RAIZ, "tuberia", "olivos", "node_modules", "sharp", "package.json")); return null; } catch (e) { return "faltan las dependencias del hornero (cd tuberia/olivos && npm i)"; } };
const salto = motivoSalto("el horneado de impostores") || sinConstructor() || sinHornero();

test("Chrome: el hornero hornea los impostores de una variante E2 del fixture (2 épocas); incremental; misma huella dos veces; tamaños, esquinas transparentes, centro con color, normales unitarias", { skip: salto || false, timeout: 1200000 }, async () => {
  const sal = fs.mkdtempSync(path.join(os.tmpdir(), "impostor-chrome-")), dir = path.join(sal, "fixture", "olivos");
  const nav = await IM.lanzaChrome("chrome: impostor.test.js"), base = { finca: "fixture", salida: sal, fecha: "2026-10-29", semillas: [11], niveles: ["E2"], navegador: nav };   // envero y madura, una semilla, solo E2
  let r0, r1, r2, m;
  try {
    r0 = await HN.hornea(Object.assign({ impostores: true }, base));
    m = JSON.parse(fs.readFileSync(path.join(dir, "manifiesto.json"), "utf8"));
    r1 = await HN.hornea(Object.assign({ impostores: true }, base));   // sin cambios: ni variantes ni impostores, y el manifiesto no se toca
    const solo = Object.assign({}, m, { epocas: m.epocas.filter(e => e.epoca === "envero"), variantes: m.variantes.filter(f => f.epoca === "envero") });
    r2 = await IM.horneaImpostores({ carpeta: dir, manifiesto: solo, anterior: null, rehace: true, navegador: nav });
  } finally { await nav.close(); }
  assert.deepStrictEqual(r0.impostores.horneados, 2); assert.strictEqual(m.impostores.length, 2); assert.deepStrictEqual(m.impostores.map(f => f.epoca), ["envero", "madura"]);
  assert.deepStrictEqual(HN.validaManifiesto(m, dir), [], "el manifiesto escrito por el hornero valida con sus atlas");
  assert.strictEqual(r1.impostores.horneados, 0); assert.strictEqual(r1.impostores.reutilizados, 2); assert.strictEqual(r1.escribio_manifiesto, false);
  const f = m.impostores[0];
  assert.deepStrictEqual(I.validaFilaImpostor(f), []);
  assert.strictEqual(r2.horneados, 1);
  assert.strictEqual(r2.filas[0].color.huella, f.color.huella, "dos horneados seguidos: la misma huella de color");
  assert.strictEqual(r2.filas[0].normales.huella, f.normales.huella, "…y de normales");
  const color = await IM.deWebp(fs.readFileSync(path.join(dir, f.color.huella + ".webp"))), nor = await IM.deWebp(fs.readFileSync(path.join(dir, f.normales.huella + ".webp")));
  assert.strictEqual(color.ancho, 2048); assert.strictEqual(color.alto, 2048); assert.strictEqual(nor.ancho, 1024); assert.strictEqual(nor.alto, 1024);
  const px = (img, x, y) => img.datos.subarray((y * img.ancho + x) * 4, (y * img.ancho + x) * 4 + 4);
  let vistasConArbol = 0, sinCentro = [];
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const c = I.celdaPixeles(0, i, j, 2048), w = c.w;
    for (const [x, y] of [[0, 0], [w - 1, 0], [0, w - 1], [w - 1, w - 1]]) assert.strictEqual(px(color, c.x + x, c.y + y)[3], 0, "esquina transparente en la vista " + [i, j]);
    let cub = 0; for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) if (px(color, c.x + x, c.y + y)[3] >= 128) cub++;
    if (cub > w * w * 0.05) vistasConArbol++;
    // el centro de la vista (alrededor del centro de la caja) tiene árbol y color (no negro ni blanco)
    let hay = false; for (let y = w / 2 - 8; y < w / 2 + 8 && !hay; y++) for (let x = w / 2 - 8; x < w / 2 + 8 && !hay; x++) { const p = px(color, c.x + x, c.y + y); if (p[3] >= 128 && p[0] + p[1] + p[2] > 30 && p[0] + p[1] + p[2] < 720) hay = true; }
    if (!hay) sinCentro.push([i, j]);
  }
  assert.strictEqual(vistasConArbol, 64, "el árbol se ve en las 64 vistas");
  assert.deepStrictEqual(sinCentro, [], "centro con color");
  // las otras tres celdas (no hay más variantes) quedan transparentes
  const c3 = I.celdaPixeles(3, 4, 4, 2048); assert.strictEqual(px(color, c3.x + 64, c3.y + 64)[3], 0);
  // normales unitarias donde hay árbol (8 bits por componente con pérdida: tolerancia amplia)
  let malas = 0, vistas = 0;
  for (let y = 0; y < 512; y += 3) for (let x = 0; x < 512; x += 3) {
    const cx = Math.floor(x / 64), cy = Math.floor(y / 64), cc = I.celdaPixeles(0, cx, 7 - cy, 2048);   // la variante 0 ocupa el cuadrante de abajo a la izquierda
    const pc = px(color, cc.x + (x % 64) * 2, cc.y + (y % 64) * 2); if (pc[3] < 250) continue;
    const pn = px(nor, x, 512 + y), l = Math.hypot(pn[0] / 127.5 - 1, pn[1] / 127.5 - 1, pn[2] / 127.5 - 1); vistas++;
    if (Math.abs(l - 1) > 0.15) malas++;
  }
  assert.ok(vistas > 1000, "hay normales que mirar"); assert.ok(malas / vistas < 0.02, malas + " de " + vistas + " normales no unitarias");
  const out = path.join(SALIDA, "impostor"); fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(dir, f.color.huella + ".webp"), path.join(out, "color.webp")); fs.copyFileSync(path.join(dir, f.normales.huella + ".webp"), path.join(out, "normales.webp"));
  fs.writeFileSync(path.join(out, "fila.json"), JSON.stringify(Object.assign({ ms_impostores_2_epocas: r0.impostores.ms }, f), null, 2) + "\n");
});
