"use strict";
// Entorno de desarrollo con Docker (infra/dev/, doc/operacion/DESARROLLO-LOCAL.md).
//  - Siempre: el compose es válido (`docker compose config`; sin Docker esa parte se SALTA con aviso), imágenes con versión fija,
//    ningún puerto fuera de 127.0.0.1, ningún secreto escrito, límites de memoria, restart y la red propia.
//  - Opcional (GEMELO_DOCKER=1): lo levanta de verdad, comprueba la web, el mundo en Chrome headless con 0 errores, la db,
//    LiveKit y el buzón (con un correo de prueba), y lo baja (si ya estaba levantado antes, lo deja como estaba).
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, fs, path } = require("./_util");
const { motivoSalto, lanza, mide } = require("./_navegador");

const DEV = path.join(RAIZ, "infra", "dev");
const COMPOSE = path.join(DEV, "compose.yml");
const EJEMPLO = path.join(DEV, "ejemplo.env");
const HERR = path.join(DEV, "herramientas");
const SERVICIOS = ["web", "db", "livekit", "correo"];

function hayDocker() {
  const v = spawnSync("docker", ["compose", "version", "--short"], { encoding: "utf8" });
  if (v.error || v.status !== 0) return "no hay `docker compose`";
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.status === 0 ? null : "el demonio de Docker no responde";
}
const SIN_DOCKER = hayDocker();
/** El compose tal como lo ve Docker, con la plantilla de variables (sin el .env de este equipo, para que valga en cualquier máquina) */
function config() {
  const r = spawnSync("docker", ["compose", "-f", COMPOSE, "--env-file", EJEMPLO, "config", "--format", "json"], { cwd: DEV, encoding: "utf8", env: Object.assign({}, process.env, { GEMELO_DEV_TESELAS: "" }) });
  assert.strictEqual(r.status, 0, "docker compose config falló:\n" + r.stderr);
  return JSON.parse(r.stdout);
}
/** Compose sin comentarios (el bloque de la api está comentado a propósito) */
const composeSinComentarios = () => lee("infra/dev/compose.yml").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");

// versión fija: 2.11.7-alpine, v1.13.11, 18-3.6-alpine (PostgreSQL-PostGIS)… nunca latest/edge/master ni solo la mayor (2, v1)
const TAG_FIJO = /^(v?\d+\.\d+(\.\d+)?|\d+-\d+\.\d+)(-[a-z0-9.]+)?$/;

test("compose de desarrollo: `docker compose config` lo acepta y tiene los cuatro servicios", t => {
  if (SIN_DOCKER) return t.skip(SIN_DOCKER + ": la validación del compose con Docker NO se ha comprobado (las de texto sí)");
  const c = config();
  assert.strictEqual(c.name, "gemelo-dev");
  assert.deepStrictEqual(Object.keys(c.services).sort(), SERVICIOS.slice().sort());
  for (const [n, s] of Object.entries(c.services)) {
    assert.strictEqual(s.restart, "unless-stopped", n + ": restart");
    assert.ok(s.deploy && s.deploy.resources && s.deploy.resources.limits && s.deploy.resources.limits.memory, n + ": sin límite de memoria");
    assert.deepStrictEqual(Object.keys(s.networks || {}), ["interna"], n + ": debe estar solo en la red interna del proyecto");
    for (const p of s.ports || []) assert.strictEqual(p.host_ip, "127.0.0.1", n + ": puerto " + p.published + " publicado fuera de 127.0.0.1");
  }
});

// etiquetas preliminares o móviles: nunca (Antonio, 2026-10-28: versiones estables, pensando en producción)
const PRELIMINAR = /(^|[-.\d])(latest|edge|master|main|dev|devel|nightly|snapshot|rc\d*|beta\d*|alpha\d*|preview|canary|testing|unstable)([-.\d]|$)/i;

test("imágenes estables con versión fija Y digest (imagen:versión@sha256:…), sin etiquetas preliminares", () => {
  const imgs = [...composeSinComentarios().matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map(m => m[1]);
  assert.strictEqual(imgs.length, SERVICIOS.length, "se esperaban " + SERVICIOS.length + " imágenes: " + imgs.join(", "));
  for (const i of imgs) {
    const m = /^([a-z0-9._/-]+):([A-Za-z0-9._-]+)@sha256:([a-f0-9]{64})$/.exec(i);
    assert.ok(m, i + ": debe ser imagen:versión@sha256:<64 hex>");
    assert.match(m[2], TAG_FIJO, i + ": la etiqueta debe ser una versión fija (no solo la mayor)");
    assert.ok(!PRELIMINAR.test(m[2]), i + ": etiqueta preliminar o móvil");
  }
});

test("ningún puerto publicado fuera de 127.0.0.1 (ni 0.0.0.0, ni sin IP)", () => {
  const txt = composeSinComentarios();
  assert.ok(!/0\.0\.0\.0|::\]?:/.test(txt), "aparece 0.0.0.0 o [::]");
  const bloques = [...txt.matchAll(/^\s+ports:\n((?:\s+- .*\n)+)/gm)].map(m => m[1]);
  assert.ok(bloques.length >= 4, "no encuentro los bloques ports:");
  for (const b of bloques) for (const l of b.split("\n").filter(Boolean)) assert.match(l, /^\s+- "127\.0\.0\.1:/, "puerto sin 127.0.0.1: " + l.trim());
  assert.ok(!/network_mode:\s*host/.test(txt), "network_mode: host salta el aislamiento");
});

test("ningún secreto escrito: las claves salen de infra/dev/.env (ignorado), la plantilla no trae valores y LiveKit no lleva keys", () => {
  const txt = composeSinComentarios();
  for (const m of txt.matchAll(/^\s*([A-Z_]*(?:PASSWORD|CLAVE|SECRETO|SECRET|KEYS?|TOKEN)[A-Z_]*):\s*(.+)$/gm)) assert.match(m[2], /^"?\$\{/, m[1] + " debe venir de una variable, no escrito: " + m[2]);
  for (const m of lee("infra/dev/ejemplo.env").matchAll(/^(GEMELO_DEV_[A-Z_]*(?:CLAVE|SECRETO))=(.*)$/gm)) assert.strictEqual(m[2], "la-genera-levanta", m[1] + ": la plantilla no lleva valores");
  assert.ok(!/^\s*keys\s*:/m.test(lee("infra/dev/livekit.yaml")), "livekit.yaml no debe llevar claves");
  const ign = spawnSync("git", ["check-ignore", "-q", "infra/dev/.env"], { cwd: RAIZ });
  assert.strictEqual(ign.status, 0, "infra/dev/.env debe estar ignorado por git");
});

test("scripts dev:arriba, dev:abajo y dev:estado en el package.json raíz, y dependencias de las herramientas con versión exacta", () => {
  const s = JSON.parse(lee("package.json")).scripts;
  for (const [k, f] of [["dev:arriba", "levanta.mjs"], ["dev:abajo", "para.mjs"], ["dev:estado", "estado.mjs"]]) {
    assert.strictEqual(s[k], "node infra/dev/herramientas/" + f, k);
    assert.ok(fs.existsSync(path.join(HERR, f)), f + " no existe");
  }
  const deps = JSON.parse(lee("infra/dev/herramientas/package.json")).dependencies;
  for (const [n, v] of Object.entries(deps)) assert.match(v, /^\d+\.\d+\.\d+$/, n + "@" + v + ": versión exacta");
  assert.ok(fs.existsSync(path.join(HERR, "package-lock.json")), "falta infra/dev/herramientas/package-lock.json");
});

// ——— e2e opcional ———
const SALTO_E2E = process.env.GEMELO_DOCKER !== "1" ? "e2e de Docker opcional (GEMELO_DOCKER=1): el entorno levantado NO se ha comprobado"
  : SIN_DOCKER ? SIN_DOCKER + ": el entorno levantado NO se ha comprobado" : motivoSalto("el mundo servido por Caddy");

test("e2e: levanta el entorno, la web sirve el mundo (0 errores en Chrome), db, LiveKit y buzón sanos; y lo baja", { timeout: 900000 }, async t => {
  if (SALTO_E2E) return t.skip(SALTO_E2E);
  const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
  const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs"), { estado } = await imp("estado.mjs"), comun = await imp("_comun.mjs");
  const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
  const t0 = Date.now();
  levanta();
  const tArriba = (Date.now() - t0) / 1000;
  try {
    const p = comun.puertos(), url = "http://localhost:" + p.web + "/";
    const e = await estado();
    assert.ok(e.ok, "estado no sano:\n" + JSON.stringify(e, null, 1));
    t.diagnostic("arriba en " + tArriba.toFixed(1) + " s; " + e.externas.map(x => x.servicio + ": " + x.detalle).join(" | "));

    // cabeceras de la web
    const r = await fetch(url, { headers: { "accept-encoding": "br" } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.headers.get("content-encoding"), "br", "la página debe servirse precomprimida en brotli");
    for (const h of ["content-security-policy-report-only", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"]) assert.ok(r.headers.get(h), "falta la cabecera " + h);
    assert.ok(!r.headers.get("server"), "Caddy no debe anunciarse (Server)");
    const js = /assets\/[^"]+\.js/.exec(await r.text())[0];
    const a = await fetch(url + js);
    assert.match(a.headers.get("cache-control") || "", /immutable/, "assets/ debe llevar caché inmutable");
    const ti = await fetch(url + "teselas/hituelo/indice.json");
    assert.strictEqual(ti.status, 200, "/teselas/hituelo/indice.json");

    // el mundo en Chrome headless: 0 errores (ni avisos de la CSP Report-Only) y las teselas pedidas a /teselas/
    const nav = await lanza();
    try {
      const t1 = Date.now(), m = await mide(nav, url);
      t.diagnostic("mundo listo y medido en " + ((Date.now() - t1) / 1000).toFixed(1) + " s; lejos: " + JSON.stringify(m.medidas.lejos));
      assert.deepStrictEqual(m.errores, [], "errores en la consola");
      assert.deepStrictEqual(m.fallos, [], "peticiones fallidas");
      assert.ok(m.medidas.lejos.triangulos > 0, "no se dibuja nada");
      const pg = await nav.newPage(), pedidas = [], avisos = [];
      pg.on("response", x => { if (x.url().includes("/teselas/")) pedidas.push(x.status() + " " + new URL(x.url()).pathname); });
      pg.on("console", x => { if (/Content Security Policy|Report Only/i.test(x.text())) avisos.push(x.text().slice(0, 200)); });
      // el evento del navegador (también salta en Report-Only), no solo el texto de la consola
      await pg.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      await pg.goto(url);
      await pg.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
      await pg.waitForTimeout(1500);
      avisos.push(...await pg.evaluate(() => window.__csp));
      const vistos = avisos.slice();   // la foto ANTES del control, que sí provoca un aviso a propósito
      // control: un script en línea SÍ debe denunciarse (prueba que la CSP llega y que el detector funciona)
      const control = await pg.evaluate(() => new Promise(ok => { const n = window.__csp.length, s = document.createElement("script"); s.textContent = "void 0"; document.head.appendChild(s); setTimeout(() => ok(window.__csp.slice(n)), 500); }));
      await pg.close();
      assert.ok(control.some(v => /^script-src/.test(v)), "la CSP Report-Only no denuncia un script en línea: ¿no llega la cabecera? " + JSON.stringify(control));
      assert.ok(pedidas.some(x => /^200 \/teselas\/hituelo\/t\/\d+_\d+\.json$/.test(x)), "el motor no pidió teselas a /teselas/hituelo/t/: " + pedidas.join(", "));
      assert.deepStrictEqual(vistos, [], "la CSP (Report-Only) avisa de violaciones");
      t.diagnostic("teselas pedidas: " + pedidas.length + " (" + pedidas.join(", ") + ")");
    } finally { await nav.close(); }

    // el buzón recibe un correo como el del enlace mágico
    const nodemailer = require(require.resolve("nodemailer", { paths: [HERR] }));   // dependencia de infra/dev/herramientas (versión fija)
    const asunto = "Prueba e2e " + Date.now();
    await nodemailer.createTransport({ host: "127.0.0.1", port: p.smtp, secure: false }).sendMail({ from: "gemelo@canoydamas.invalid", to: "hogar@example.com", subject: asunto, text: "Enlace: " + url + "entrar?t=prueba" });
    const busca = await (await fetch("http://127.0.0.1:" + p.correoWeb + "/api/v1/search?query=" + encodeURIComponent('subject:"' + asunto + '"'))).json();
    assert.strictEqual(busca.messages_count, 1, "el correo de prueba no llegó al buzón");
    await fetch("http://127.0.0.1:" + p.correoWeb + "/api/v1/messages", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [busca.messages[0].ID] }) });
  } finally {
    if (!antes) { const t2 = Date.now(); para(); t.diagnostic("bajado en " + ((Date.now() - t2) / 1000).toFixed(1) + " s (el volumen de la db se conserva)"); }
    else t.diagnostic("ya estaba levantado antes de la prueba: se deja levantado");
  }
});
