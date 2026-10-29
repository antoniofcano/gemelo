// Impostores de olivo (ADR-0019 §2, O8b; contratos/olivo-impostor.md): hornea, por cada época del manifiesto de la finca, un atlas de COLOR (2.048²)
// y uno de NORMALES (1.024²) con las 4 variantes E2 que ya horneó el hornero, fotografiadas desde 8 × 8 direcciones hemi-octaédricas en Chrome sin
// pantalla (playwright-core, la página tuberia/olivos/impostores/pagina.html con el three 0.186.1 del motor). Los atlas son WebP (sharp) guardados
// como objetos inmutables `<huella>.webp` junto a las variantes; las filas van en `impostores[]` del manifiesto, que el hornero escribe el ÚLTIMO.
//
//   node tuberia/olivos/impostores.mjs --carpeta <salida>/<finca>/olivos [--rehace]     hornea los que falten para el manifiesto que ya hay y lo reescribe
//   node tuberia/olivos/impostores.mjs --compara <carpeta de salida> [--carpeta <olivos>]   la comparación de color de la decisión 70 (capturas y medias)
//
// Incremental: la `clave` de una fila (impostor.js, claveImpostor) junta lo que decide el atlas sin abrir Chrome (formato, época, huellas de las
// recetas fuente, three, página de horneado, playwright-core); si el manifiesto anterior tiene una fila con esa clave y sus dos objetos existen con su
// tamaño, se reutiliza y no se abre Chrome. Un Chrome nuevo fuera de Docker no cambia la clave: --rehace (o borrar las filas) lo fuerza.
// Chrome: el compartido de la puerta (GEMELO_CHROME_WS) o uno propio DENTRO del turno del banco (pruebas/banco/turno.js, si existe: fuera de Docker);
// el ejecutable, CHROME o el de playwright (en la imagen oficial de Playwright).
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo"), PAGINA = path.join(AQUI, "impostores");
const reqH = createRequire(path.join(AQUI, "package.json")), reqO = createRequire(path.join(OLIVO, "package.json"));
const imp = f => import(pathToFileURL(path.join(OLIVO, f)).href);

/** Calidad de los WebP (contrato §2): color con pérdida (4:2:0 con smartSubsample) y alfa sin pérdida; normales SIN pérdida (el 4:2:0 las desnormaliza). `exact`: no se toca lo que hay bajo lo transparente */
export const WEBP = { color: { quality: 90, alphaQuality: 100, exact: true, effort: 6, smartSubsample: true }, normales: { lossless: true, exact: true, effort: 6 } };

const huella128 = b => crypto.createHash("sha256").update(b).digest("hex").slice(0, 32);
const raizPaquete = (req, nombre) => { let d = path.dirname(req.resolve(nombre)); while (path.basename(d) !== nombre && path.dirname(d) !== d) d = path.dirname(d); return d; };
export const versionDe = (req, nombre) => JSON.parse(fs.readFileSync(path.join(raizPaquete(req, nombre), "package.json"), "utf8")).version;

/** Huella del código que hornea (la página y la disposición): si cambia, cambia la clave y se vuelve a hornear */
export function huellaPagina() {
  const h = crypto.createHash("sha256");
  for (const f of [path.join(PAGINA, "pagina.mjs"), path.join(PAGINA, "pagina.html"), path.join(OLIVO, "impostor.js"), path.join(OLIVO, "materiales.js"), path.join(OLIVO, "texturas.js"), path.join(OLIVO, "montaje.js")])
    h.update(fs.readFileSync(f).toString("utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex").slice(0, 16);
}

/** Las fuentes de cada época: las filas E2 del manifiesto, en su orden, hasta 4 (una celda del atlas cada una) */
export function fuentesPorEpoca(man, I) {
  const por = new Map();
  for (const e of man.epocas) por.set(e.epoca, man.variantes.filter(f => f.epoca === e.epoca && f.nivel === I.NIVEL).slice(0, I.POR_LADO * I.POR_LADO));
  return por;
}

// ---------- servidor de la página (mismo origen): página, constructor, three y los objetos; recoge lo que la página sube
const TIPOS = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".png": "image/png" };
export function sirvePagina(carpetaObjetos) {
  const montajes = { "/m/three/": raizPaquete(reqH, "three"), "/m/three-gen/": raizPaquete(reqO, "three-gen"), "/m/idb-keyval/": raizPaquete(reqO, "idb-keyval"),
    "/apps/web/olivo/": OLIVO, "/pagina/": PAGINA };
  const recogido = {};
  const s = http.createServer((q, r) => {
    const url = decodeURIComponent(q.url.split("?")[0]);
    if (q.method === "POST" && url.startsWith("/recoge/")) {
      const trozos = []; q.on("data", t => trozos.push(t)); q.on("end", () => { recogido[url.slice(8)] = Buffer.concat(trozos); r.statusCode = 204; r.end(); }); return;
    }
    const m = /^\/obj\/([0-9a-f]{32})$/.exec(url);
    if (m) {
      try { r.setHeader("content-type", "application/octet-stream"); r.end(reqDescomprime(path.join(carpetaObjetos, m[1] + ".br"))); } catch (e) { r.statusCode = 404; r.end(); }
      return;
    }
    const pre = Object.keys(montajes).find(p => url.startsWith(p));
    if (!pre || url.includes("..")) { r.statusCode = 404; return r.end(); }
    const f = path.join(montajes[pre], url.slice(pre.length));
    if (!f.startsWith(montajes[pre]) || (pre === "/apps/web/olivo/" && !/^\/apps\/web\/olivo\/[a-z_0-9]+\.js$/.test(url))) { r.statusCode = 403; return r.end(); }
    fs.readFile(f, (e, d) => { if (e) { r.statusCode = 404; r.end(); } else { r.setHeader("content-type", TIPOS[path.extname(f)] || "application/octet-stream"); r.end(d); } });
  });
  return new Promise(ok => s.listen(0, "127.0.0.1", () => ok({ servidor: s, url: "http://127.0.0.1:" + s.address().port, recogido })));
}
let descomprimeBr = null;
const reqDescomprime = ruta => descomprimeBr(fs.readFileSync(ruta));

const ARGS_CHROME = ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox", "--enable-precise-memory-info"];
function chromeLocal() {
  const c = [process.env.CHROME, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/usr/bin/chromium"].filter(Boolean);
  return c.find(p => fs.existsSync(p)) || undefined;   // sin ninguno: el de playwright (imagen oficial)
}
/** El Chrome del horneado: el de la puerta (GEMELO_CHROME_WS) o uno propio dentro del turno del banco si existe (fuera de Docker). close() lo cierra y suelta el turno */
export async function lanzaChrome(que) {
  const pw = reqH("playwright-core").chromium;
  if (process.env.GEMELO_CHROME_WS) return pw.connect(process.env.GEMELO_CHROME_WS);
  const rutaTurno = path.join(RAIZ, "pruebas", "banco", "turno.js");
  const suelta = fs.existsSync(rutaTurno) ? await createRequire(rutaTurno)(rutaTurno).pide(que || "chrome: impostores") : async () => {};
  try {
    const nav = await pw.launch({ executablePath: chromeLocal(), args: ARGS_CHROME }), cierra = nav.close.bind(nav);
    nav.close = async () => { try { await cierra(); } finally { await suelta(); } };
    return nav;
  } catch (e) { await suelta(); throw e; }
}

async function abrePagina(nav, url, log) {
  const p = await nav.newPage({ viewport: { width: 64, height: 64 } }), errores = [];
  p.on("pageerror", e => errores.push(String(e).slice(0, 400))); p.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 400)); });
  await p.goto(url + "/pagina/pagina.html");
  try { await p.waitForFunction(() => window.__impostor && window.__impostor.listo, null, { timeout: 120000 }); }
  catch (e) { throw new Error("la página de horneado no arrancó: " + (errores.join(" | ") || e.message)); }
  p.errores = errores; if (log) p.on("console", m => { if (m.type() !== "error") log("[página] " + m.text()); });
  return p;
}

/** Codifica un RGBA8 crudo (fila 0 arriba) a WebP con sharp, deterministamente */
export async function aWebp(rgba, lado, opciones) {
  const sharp = reqH("sharp"); sharp.concurrency(1); sharp.cache(false);
  return sharp(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), { raw: { width: lado, height: lado, channels: 4 } }).webp(opciones).toBuffer();
}
/** Decodifica un WebP a RGBA8 crudo (pruebas): { datos, ancho, alto } */
export async function deWebp(buf) {
  const sharp = reqH("sharp"), { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { datos: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), ancho: info.width, alto: info.height };
}
/** La `clave` de la fila de una época: SHA-256/128 de claveImpostor() con las huellas de sus fuentes y las versiones de lo que hornea */
export async function claveDe(epoca, huellasFuente) {
  const { claveImpostor } = await imp("impostor.js");
  return huella128(claveImpostor({ epoca, fuentes: huellasFuente, three: versionDe(reqH, "three"), pagina: huellaPagina(), chrome: "playwright-core " + versionDe(reqH, "playwright-core") }));
}
function escribeAtomico(ruta, datos) { const tmp = ruta + ".tmp-" + process.pid; fs.writeFileSync(tmp, datos); fs.renameSync(tmp, ruta); }

/**
 * Las filas `impostores[]` de un manifiesto. o: { carpeta (la de olivos/, con los .br de las variantes), manifiesto (el NUEVO, con sus variantes),
 *   anterior (manifiesto anterior o null: de él se reutilizan filas), rehace, navegador (uno ya abierto: pruebas), log }
 * @returns { filas, horneados, reutilizados, ms, chrome }
 */
export async function horneaImpostores(o) {
  const t0 = Date.now(), log = o.log || (() => {}), I = (await imp("impostor.js")).IMPOSTOR;
  descomprimeBr = (await imp("horneado_node.js")).descomprimeBr;
  const previas = new Map();
  if (o.anterior && Array.isArray(o.anterior.impostores) && !o.rehace) for (const f of o.anterior.impostores) {
    const ok = ["color", "normales"].every(k => f[k] && fs.existsSync(path.join(o.carpeta, f[k].huella + ".webp")) && fs.statSync(path.join(o.carpeta, f[k].huella + ".webp")).size === f[k].bytes);
    if (ok) previas.set(f.clave, f);
  }
  const filas = [], porHacer = [];
  for (const [epoca, fuentes] of fuentesPorEpoca(o.manifiesto, I)) {
    if (!fuentes.length) continue;
    const clave = await claveDe(epoca, fuentes.map(f => f.huella));
    const vieja = previas.get(clave);
    if (vieja) filas.push(vieja); else { porHacer.push({ epoca, fuentes, clave, i: filas.length }); filas.push(null); }
  }
  let horneados = 0, chrome = null;
  if (porHacer.length) {
    const srv = await sirvePagina(o.carpeta), nav = o.navegador || await lanzaChrome("chrome: impostores " + (o.manifiesto.finca || ""));
    try {
      chrome = nav.version(); const p = await abrePagina(nav, srv.url, null);
      for (const t of porHacer) {
        log("[impostores] " + t.epoca + ": " + t.fuentes.length + " variantes × " + I.REJILLA * I.REJILLA + " vistas");
        const r = await p.evaluate(a => window.__impostor.hornea(a), { epoca: t.epoca, fuentes: t.fuentes.map(f => "/obj/" + f.huella) });
        const fila = { formato: I.FORMATO, epoca: t.epoca, nivel: I.NIVEL, rejilla: I.REJILLA, vista: I.VISTA, vista_normal: I.VISTA_NORMAL, clave: t.clave };
        for (const [k, lado] of [["color", I.LADO], ["normales", I.LADO_NORMAL]]) {
          const crudo = srv.recogido[k]; if (!crudo || crudo.length !== lado * lado * 4) throw new Error("la página no subió el atlas de " + k);
          const webp = await aWebp(new Uint8Array(crudo.buffer, crudo.byteOffset, crudo.length), lado, WEBP[k]), h = huella128(webp), destino = path.join(o.carpeta, h + ".webp");
          if (!(fs.existsSync(destino) && fs.statSync(destino).size === webp.length)) escribeAtomico(destino, webp);
          fila[k] = { huella: h, bytes: webp.length, lado, imagen: "webp", sin_perdida: !!WEBP[k].lossless };
          delete srv.recogido[k];
        }
        fila.variantes = r.variantes.map((v, k) => Object.assign({ celda: k, tipo: v.tipo, semilla: v.semilla, fuente: t.fuentes[k].huella }, { caja: v.caja, centro: v.centro, semilado: v.semilado, copa: v.copa, medidas: v.medidas }));
        fila.horneado = { three: r.three, chrome, ms: r.ms };
        filas[t.i] = fila; horneados++;
        if (p.errores.length) log("[impostores] avisos de la página: " + p.errores.join(" | "));
      }
      await p.close();
    } finally { if (!o.navegador) await nav.close(); srv.servidor.close(); }
  }
  return { filas, horneados, reutilizados: filas.length - horneados, ms: Date.now() - t0, chrome };
}

/** Comparación de color (decisión 70): el E2 de la primera variante con la luz de «Olivos tipo» (r128) y con la del motor; capturas en `salida` */
export async function comparaColor({ carpeta, salida, epoca, navegador, extra }) {
  descomprimeBr = (await imp("horneado_node.js")).descomprimeBr;
  const man = JSON.parse(fs.readFileSync(path.join(carpeta, "manifiesto.json"), "utf8")), ep = epoca || man.actual;
  const fila = man.variantes.find(f => f.epoca === ep && f.nivel === "E2"); if (!fila) throw new Error("sin variante E2 de " + ep);
  const srv = await sirvePagina(carpeta), nav = navegador || await lanzaChrome("chrome: impostores compara");
  try {
    const p = await abrePagina(nav, srv.url), r = await p.evaluate(a => window.__impostor.compara(a), { fuente: "/obj/" + fila.huella, epoca: ep, extra: extra || [] });
    fs.mkdirSync(salida, { recursive: true });
    for (const [n, b] of Object.entries(srv.recogido)) fs.writeFileSync(path.join(salida, n), b);
    return { epoca: ep, tipo: fila.tipo, semilla: fila.semilla, medias: r, errores: p.errores };
  } finally { if (!navegador) await nav.close(); srv.servidor.close(); }
}

// ---------- línea de órdenes: hornear los impostores de un manifiesto que ya existe (fuera del hornero) o comparar el color
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), val = n => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : null; };
  (async () => {
    const carpeta = val("--carpeta");
    if (a.includes("--compara")) return comparaColor({ carpeta: path.resolve(carpeta), salida: path.resolve(val("--compara")), epoca: val("--epoca"), extra: val("--extra") ? JSON.parse(val("--extra")) : [] });
    if (!carpeta) throw new Error("falta --carpeta <salida>/<finca>/olivos");
    const HN = await import(pathToFileURL(path.join(AQUI, "hornero.mjs")).href), ruta = path.join(carpeta, "manifiesto.json"), man = JSON.parse(fs.readFileSync(ruta, "utf8"));
    const r = await horneaImpostores({ carpeta, manifiesto: man, anterior: a.includes("--rehace") ? null : man, rehace: a.includes("--rehace"), log: m => process.stderr.write(m + "\n") });
    const nuevo = Object.assign({}, man, { impostores: r.filas }), err = HN.validaManifiesto(nuevo, carpeta);
    if (err.length) throw new Error("el manifiesto no valida: " + err.join("; "));
    if (JSON.stringify(nuevo) !== JSON.stringify(man)) escribeAtomico(ruta, JSON.stringify(nuevo, null, 2) + "\n");   // el manifiesto, el último
    return { horneados: r.horneados, reutilizados: r.reutilizados, ms: r.ms, chrome: r.chrome, filas: r.filas.map(f => ({ epoca: f.epoca, color: f.color, normales: f.normales })) };
  })().then(r => console.log(JSON.stringify(r)), e => { process.stderr.write("impostores: " + (e && e.stack || e) + "\n"); process.exit(1); });
}
