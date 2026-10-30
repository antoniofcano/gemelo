// Páginas de prueba del motor (T8 fase 2, decisión 79): desde que se retira la salida artefacto, toda prueba que abre el gemelo en un navegador
// lo hace con el cliente web de verdad: el motor generado por apps/web/herramientas/genera_motor.mjs y empaquetado con Vite (apps/web), contra
// el índice de una finca del fixture sintético, con t/ y tileset/ al lado (como lo sirve Caddy). Pacto de T8 fase 2, §4:
//   montaPagina({ finca, conTileset = true, olivos, salida }) → { carpeta, url: "index.html", raiz, indice }
// - finca: "cerro" | "hituelo" (las dos del fixture; las dos con indice.json y t/ desde T8 fase 2).
// - conTileset: el índice de la página lleva `tileset: "tileset/tileset.json"` (la escena 3D Tiles, la única que hay); sin él, la página debe
//   decir «Esta finca no tiene escena» (pacto §1). `tileset` (cadena) fuerza otro valor, p. ej. uno de otro host para probar que se rechaza.
// - olivos: exige el constructor de olivos instalado (apps/web/olivo, ADR-0017); sin él, vite.config.js pone un sustituto vacío y ?olivos=gen
//   no dibujaría nada. No cambia el build: solo falla pronto y con motivo.
// - salida: carpeta donde dejar la página (se vacía). Sin ella, la página va a la caché por huella (pruebas/salida/paginas/<finca>-<huella>/),
//   que se reutiliza mientras no cambien el motor, la plantilla, las herramientas de build, las dependencias, el índice ni las opciones.
// - fixture: carpeta del fixture ya generado (por defecto, uno propio de este proceso con _util.fixture()).
// Devuelve la carpeta servible (carpeta), la página dentro de ella (url, relativa), la raíz que vio Vite (raiz, con entrada/motor.generado.js)
// y el índice con el que se montó (indice).
// Servir: sirve() de _navegador.js, que pone la CSP de infra/Caddyfile (en modo solo informe, como el Caddy de producción).
"use strict";
const crypto = require("crypto");
const { RAIZ, SALIDA, ejecuta, fixture, python, fs, path } = require("./_util");

const WEB = path.join(RAIZ, "apps", "web");
const VITE = path.join(WEB, "node_modules", "vite", "bin", "vite.js");
const GENERA = path.join(WEB, "herramientas", "genera_motor.mjs");
const T3D = path.join(RAIZ, "tuberia", "tiles3d");
const CACHE = path.join(SALIDA, "paginas");
const OLIVO_INSTALADO = () => fs.existsSync(path.join(WEB, "olivo", "node_modules", "three-gen", "package.json"));
const CADUCA_MS = 24 * 3600 * 1000;   // las entradas de la caché que nadie ha usado en un día se borran

/** Motivo para no poder montar páginas (o null): lo que necesita el build con Vite */
function saltoPagina(que) {
  if (!fs.existsSync(VITE)) return "Vite no instalado (cd apps/web && npm ci): " + que + " NO se ha comprobado";
  if (!fs.existsSync(path.join(WEB, "node_modules", "3d-tiles-renderer", "package.json"))) return "3d-tiles-renderer no instalado (cd apps/web && npm ci): " + que + " NO se ha comprobado";
  if (!python()) return "falta Python 3 para generar el fixture: " + que + " NO se ha comprobado";
  return null;
}

let fixturePropio = null;
const fixtureDe = dir => dir || fixturePropio || (fixturePropio = fixture());

const duerme = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const hashFicheros = (h, dir, base) => {   // nombre y contenido de todo lo que cuelga de dir, en orden fijo
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f), r = (base ? base + "/" : "") + f;
    if (fs.statSync(p).isDirectory()) hashFicheros(h, p, r); else { h.update(r + "\0"); h.update(fs.readFileSync(p)); }
  }
};
const copia = (de, a) => { if (fs.existsSync(de)) fs.cpSync(de, a, { recursive: true }); };

/** El tileset del fixture de una finca: el que trae el fixture (npm run fixture lo genera, pacto §3) o, si no lo trae, se genera aquí */
function tilesetDe(dirFinca) {
  const ts = path.join(dirFinca, "tileset");
  if (fs.existsSync(path.join(ts, "tileset.json"))) return ts;
  const g = ejecuta(process.execPath, [path.join(T3D, "genera.mjs"), "--entrada", dirFinca, "--salida", ts, "--catalogo", path.join(RAIZ, "modelos", "olivos", "fixture", "catalogo.json")]);
  if (g.status !== 0) throw new Error("tuberia/tiles3d/genera.mjs falló con " + path.basename(dirFinca) + ":\n" + g.stdout + g.stderr);
  return ts;
}

/** Construye la página en dest (dest/web servible, dest/raiz lo que vio Vite) */
function construye(dest, finca, dirFinca, indice, conTileset) {
  const raiz = path.join(dest, "raiz"), web = path.join(dest, "web");
  fs.mkdirSync(raiz, { recursive: true });
  const datos = path.join(raiz, "indice.json");
  fs.writeFileSync(datos, JSON.stringify(indice));
  const g = ejecuta(process.execPath, [GENERA, "--datos", datos, "--dest", raiz, "--finca", finca]);
  if (g.status !== 0) throw new Error("genera_motor.mjs falló:\n" + g.stdout + g.stderr);
  const b = ejecuta(process.execPath, [VITE, "build"], { cwd: WEB, env: Object.assign({}, process.env, { GEMELO_WEB_RAIZ: raiz, GEMELO_WEB_SALIDA: web }) });
  if (b.status !== 0) throw new Error("vite build falló:\n" + b.stdout + b.stderr);
  // lo que Caddy sirve junto a la página: el índice, las teselas del Mundo (decisión 38) y el tileset
  fs.copyFileSync(datos, path.join(web, "indice.json"));
  copia(path.join(dirFinca, "t"), path.join(web, "t"));
  if (conTileset) copia(path.join(dirFinca, "tileset"), path.join(web, "tileset"));
  fs.writeFileSync(path.join(dest, "LISTO"), new Date().toISOString() + "\n");
}

function podaCache() {
  if (!fs.existsSync(CACHE)) return;
  for (const d of fs.readdirSync(CACHE)) {
    const p = path.join(CACHE, d);
    try { if (Date.now() - fs.statSync(p).mtimeMs > CADUCA_MS) fs.rmSync(p, { recursive: true, force: true }); } catch (e) { /* la usa otro proceso: se queda */ }
  }
}

/** Ver la cabecera. Síncrono (spawnSync): se llama en test.before o en una prueba, nunca con un servidor del mismo proceso esperando respuesta. */
function montaPagina({ finca = "hituelo", conTileset = true, tileset, olivos = false, salida, fixture: dirFixture } = {}) {
  const motivo = saltoPagina("la página de prueba"); if (motivo) throw new Error(motivo);
  if (olivos && !OLIVO_INSTALADO()) throw new Error("el constructor de olivos no está instalado (cd apps/web/olivo && npm ci): ?olivos=gen no dibujaría nada");
  const dirFinca = path.join(fixtureDe(dirFixture), finca), fi = path.join(dirFinca, "indice.json");
  if (!fs.existsSync(fi)) throw new Error("el fixture no trae " + finca + "/indice.json (npm run fixture; desde T8 fase 2 también Cerro)");
  const indice = JSON.parse(fs.readFileSync(fi, "utf8"));
  const conTs = conTileset || typeof tileset === "string";
  if (conTs) indice.tileset = typeof tileset === "string" ? tileset : "tileset/tileset.json"; else delete indice.tileset;
  if (conTs && typeof tileset !== "string") tilesetDe(dirFinca);

  if (salida) {
    fs.rmSync(salida, { recursive: true, force: true });
    construye(salida, finca, dirFinca, indice, conTs && typeof tileset !== "string");
    return { carpeta: path.join(salida, "web"), url: "index.html", raiz: path.join(salida, "raiz"), indice };
  }

  // la huella: todo lo que cambia la página
  const h = crypto.createHash("sha256");
  hashFicheros(h, path.join(WEB, "motor"), "motor");
  for (const f of ["plantilla.html", "vite.config.js", "package-lock.json", path.join("herramientas", "genera_motor.mjs"), path.join("herramientas", "sin_tiles3d.js")]) {
    const p = path.join(WEB, f); if (fs.existsSync(p)) { h.update(f + "\0"); h.update(fs.readFileSync(p)); }
  }
  h.update(JSON.stringify({ finca, indice, olivo: OLIVO_INSTALADO() }));
  hashFicheros(h, path.join(dirFinca, "t"), "t");
  if (conTs && typeof tileset !== "string") hashFicheros(h, path.join(dirFinca, "tileset"), "tileset");
  const huella = h.digest("hex").slice(0, 16), dest = path.join(CACHE, finca + "-" + huella), cerrojo = dest + ".cerrojo";
  const res = { carpeta: path.join(dest, "web"), url: "index.html", raiz: path.join(dest, "raiz"), indice };
  fs.mkdirSync(CACHE, { recursive: true });

  // otro proceso puede estar construyendo la misma: un cerrojo (mkdir es atómico); si el que lo tiene murió hace más de 10 min, se rompe
  for (let t0 = Date.now(); ;) {
    if (fs.existsSync(path.join(dest, "LISTO"))) { const ahora = new Date(); fs.utimesSync(dest, ahora, ahora); return res; }
    try { fs.mkdirSync(cerrojo); break; }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      let edad = 0; try { edad = Date.now() - fs.statSync(cerrojo).mtimeMs; } catch (e2) { continue; }
      if (edad > 10 * 60000) { fs.rmSync(cerrojo, { recursive: true, force: true }); continue; }
      if (Date.now() - t0 > 15 * 60000) throw new Error("15 min esperando el cerrojo de " + cerrojo);
      duerme(500);
    }
  }
  try {
    podaCache();
    const tmp = dest + ".tmp-" + process.pid;
    fs.rmSync(tmp, { recursive: true, force: true }); fs.rmSync(dest, { recursive: true, force: true });
    construye(tmp, finca, dirFinca, indice, conTs && typeof tileset !== "string");
    fs.renameSync(tmp, dest);
  } finally { fs.rmSync(cerrojo, { recursive: true, force: true }); }
  return res;
}

/** El JSON de datos con el que arranca la página: el que va en #datos o, si la página lo pide aparte, su indice.json */
function datosDe(carpeta, pagina = "index.html") {
  const html = fs.readFileSync(path.join(carpeta, pagina), "utf8"), m = /<script type="application\/json" id="datos">([\s\S]*?)<\/script>/.exec(html);
  return JSON.parse(m ? m[1] : fs.readFileSync(path.join(carpeta, "indice.json"), "utf8"));
}

module.exports = { montaPagina, saltoPagina, datosDe, WEB, VITE };
