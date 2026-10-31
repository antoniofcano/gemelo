"use strict";
// El panel del guía de una visita guiada (F3f) en dos Chrome contra el LiveKit y la api de infra/dev (Docker). Opcional: GEMELO_DOCKER=1; pide el turno del banco
// («docker+chrome»: un solo Docker o Chrome de pruebas a la vez, TESTING.md) y lanza su propio Chrome (sin micrófono: aquí nadie habla; la voz es voz_dev.test.js).
// Con GEMELO_CHROME_WS (la puerta comparte un Chrome) se salta con aviso: se corre sola. Sin la bandera, todo se salta con aviso.
//  Una visita guiada sintética (tipo «guiada», en 5 min), un guía (rol guia, visitas.guia_id) y una familia apuntada; los dos abren /finca/?presencia=red&guiada=<evento>:
//   1. la PRESENCIA de los dos viaja a la sala guiada-<evento> (una sola conexión por persona: LiveKit tiene dos participantes, no cuatro) y la voz usa esa conexión;
//   2. el guía ve la ventana «Visita guiada» con «N de M familias apuntadas»; la familia, no;
//   3. la familia levanta la mano (POST …/mano): el guía la ve en la cola; le da la palabra desde el panel (la 1.ª mano): los DOS ven la cuenta atrás
//      (palabra_hasta), la familia «Tienes la palabra»; +1 min la alarga; cortar la quita;
//   4. silenciar a todos responde (0 pistas: nadie habla);
//   5. el guía cierra la sala con 5 s de aviso: los dos ven «termina en N s», vuelven solos a la visita libre (hituelo-libre), LiveKit ya no tiene la sala, y la
//      familia no puede volver a entrar (409 guiada_cerrada); el guía sí;
//   6. sin errores en las páginas.
// No prueba: el sonido (voz_dev.test.js), ni Quest ni iPhone.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, path, chrome, playwright } = require("./_util");
const { motivoSalto, ARGS_CHROME } = require("./_navegador");
const { spawnSync } = require("child_process");

const HERR = path.join(RAIZ, "infra", "dev", "herramientas");
const SIN_DOCKER = (() => {
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.error || s.status !== 0 ? "el demonio de Docker no responde" : null;
})();
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e del panel del guía opcional (GEMELO_DOCKER=1): el panel del guía contra LiveKit NO se ha comprobado"
  : process.env.GEMELO_CHROME_WS ? "el panel del guía lanza su propio Chrome: correr solo, sin GEMELO_CHROME_WS"
  : SIN_DOCKER ? SIN_DOCKER + ": el panel del guía contra LiveKit NO se ha comprobado" : motivoSalto("el panel del guía en dos navegadores");
const COOKIE = "__Host-gemelo";
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const hasta = async (fn, ms, que) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await espera(250); } throw new Error("no llegó a tiempo: " + que + " (último: " + JSON.stringify(v) + ")"); };

test("e2e: el panel del guía en dos Chrome (la presencia viaja a la guiada, manos, palabra con cuenta atrás para todos, silenciar y cerrar con vuelta a la general)", { timeout: 1800000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: guiada_dev.test.js (F3f)");
  try {
    const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs");
    const comun = await imp("_comun.mjs"), { HOGARES } = await imp("siembra.mjs");
    const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
    await levanta({ sinBuild: process.env.GEMELO_SIN_BUILD === "1" });
    let nav = null, bd = null, ev = null;
    try {
      const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, ca = comun.caLocal();
      const pide = (ruta, o = {}) => comun.pideHttps(p.https, ruta, { method: o.method, body: o.body, ca,
        headers: Object.assign({ origin: base }, o.body !== undefined ? { "content-type": "application/json" } : {}, o.headers, o.cookie ? { cookie: COOKIE + "=" + o.cookie } : {}) });
      const Pg = require(path.join(HERR, "node_modules", "pg"));
      bd = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
      await bd.connect();
      const lkSdk = require(path.join(HERR, "node_modules", "livekit-server-sdk"));
      const rs = new lkSdk.RoomServiceClient("http://127.0.0.1:" + p.livekit, process.env.GEMELO_DEV_LIVEKIT_CLAVE, process.env.GEMELO_DEV_LIVEKIT_SECRETO);
      const GUIA = "guia.f3f@example.com", familia = HOGARES[0];
      await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, 'guia', 'Guía F3f', true, true) ON CONFLICT (correo) DO UPDATE SET rol = 'guia', activo = true", [GUIA]);
      const idDe = async c => Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [c])).rows[0].id);
      const idGuia = await idDe(GUIA), idFam = await idDe(familia.correo);
      ev = Number((await bd.query("INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas, guia_id) VALUES ('Guiada F3f (e2e)', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 10, $1) RETURNING id", [idGuia])).rows[0].id);
      await bd.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado')", [ev, idFam]);
      const SALA = "guiada-" + ev;
      const vistos = new Set();
      async function sesion(correo) {   // enlace mágico → buzón (Mailpit) → POST /api/auth/entrar → cookie (como voz_dev.test.js)
        const busca = async () => (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + correo))).json()).messages || [];
        for (const m of await busca()) vistos.add(m.ID);
        const e = await pide("/api/auth/enlace", { method: "POST", body: JSON.stringify({ correo }) });
        assert.strictEqual(e.status, 202, "enlace para " + correo + ": " + e.status);
        let msg = null;
        for (let i = 0; i < 100 && !msg; i++) { msg = (await busca()).find(m => !vistos.has(m.ID)) || null; if (!msg) await espera(200); }
        assert.ok(msg, "el enlace de " + correo + " no llegó al buzón"); vistos.add(msg.ID);
        const tok = (/\/api\/auth\/entrar\?t=([A-Za-z0-9_-]{43})/.exec((await (await fetch(buzon + "/api/v1/message/" + msg.ID)).json()).Text) || [])[1];
        const r = await pide("/api/auth/entrar", { method: "POST", body: JSON.stringify({ t: tok }) });
        assert.strictEqual(r.status, 200, "entrar: " + r.status);
        return [].concat(r.cabeceras["set-cookie"] || []).map(x => new RegExp("^" + COOKIE + "=([^;]+)").exec(x)).find(Boolean)[1];
      }
      const ses = { guia: await sesion(GUIA), familia: await sesion(familia.correo) };
      nav = await playwright().chromium.launch({ executablePath: chrome(), args: ARGS_CHROME });
      const abre = async cookie => {
        const ctx = await nav.newContext({ viewport: { width: 900, height: 650 }, ignoreHTTPSErrors: true });
        await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
        const pg = await ctx.newPage(), errores = [];
        pg.on("pageerror", e => errores.push(String(e).slice(0, 300)));
        pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
        await pg.goto(base + "/finca/?presencia=red&guiada=" + ev);
        await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__guiada && window.__presencia, null, { timeout: 300000, polling: 1000 });
        const gui = (a, x) => pg.evaluate(([a, x]) => Promise.resolve(window.__guiada(a, x)), [a, x]);
        const pres = () => pg.evaluate(() => window.__presencia());
        return { ctx, pg, errores, gui, pres };
      };
      const G = await abre(ses.guia), F = await abre(ses.familia);
      let idF = null;
      await t.test("la presencia de los dos viaja a la sala guiada: una conexión por persona", async () => {
        for (const X of [G, F]) await hasta(async () => { const e = await X.pres(); return e.sala === "guiada" && e.conectado && e.evento === ev && e; }, 60000, "la presencia en la guiada");
        const l = await hasta(async () => { const x = await rs.listParticipants(SALA); return x.length === 2 && x; }, 30000, "dos participantes en " + SALA);
        assert.deepStrictEqual(l.map(x => JSON.parse(x.metadata || "{}").papel).sort(), ["familia", "guia"]);
        idF = l.find(x => JSON.parse(x.metadata || "{}").papel === "familia").identity;
        const v = await G.pg.evaluate(() => window.__voz()); assert.strictEqual(v.sala, SALA); assert.strictEqual(v.papel, "guia");
      });
      await t.test("el guía ve la ventana «Visita guiada» con las familias apuntadas; la familia no", async () => {
        // la vista de la api se sondea cada 5 s: la 1.ª puede ser anterior a que la familia entrase, así que se espera a la que ya la cuenta
        const e = await hasta(async () => { const x = await G.gui(); return x.ventana && x.inscritos && x.inscritos.conectados === 1 && x; }, 20000, "la ventana del guía y la vista de la api con la familia dentro");
        assert.deepStrictEqual(e.inscritos, { apuntados: 1, conectados: 1 });
        assert.strictEqual((await F.gui()).ventana, false);
        await G.pg.click("#hudIco-guia"); await hasta(() => G.pg.evaluate(() => /1 de 1 familia apuntada está en la sala/.test(document.body.textContent)), 10000, "el texto de preparar");
      });
      await t.test("mano, palabra con cuenta atrás para los dos, +1 min y cortar", async () => {
        const m = await pide("/api/presencia/guiadas/" + ev + "/mano", { method: "POST", cookie: ses.familia, body: "{}" }); assert.strictEqual(m.status, 200, m.texto);
        await hasta(async () => (await G.gui()).manos.includes(idF), 15000, "la mano en la cola del guía");
        assert.ok(await G.gui("mano1"));
        const pf = await hasta(async () => { const x = await F.gui(); return x.palabra && x; }, 15000, "la familia ve su turno");
        assert.match(pf.tira, /^Tienes la palabra · [12]:\d\d$/);
        const pg_ = await hasta(async () => { const x = await G.gui(); return x.palabra && x; }, 15000, "el guía ve el turno");
        assert.strictEqual(pg_.palabra.identidad, idF); assert.ok(pg_.palabra.segundos > 100 && pg_.palabra.segundos <= 120);
        assert.ok(await G.gui("alarga")); await hasta(async () => ((await F.gui()).palabra || {}).segundos > 125, 15000, "+1 min, también para la familia");
        assert.ok(await G.gui("corta")); await hasta(async () => (await F.gui()).palabra === null, 15000, "sin turno");
      });
      await t.test("silenciar a todos responde (nadie habla: 0 pistas)", async () => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/silenciar", { method: "POST", cookie: ses.guia, body: "{}" }); assert.strictEqual(r.status, 200, r.texto);
        assert.strictEqual(JSON.parse(r.texto).pistas, 0);
      });
      await t.test("cerrar con 5 s: los dos ven el aviso, vuelven solos a la visita libre, la sala ya no existe y la familia no puede volver", async tt => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/cerrar", { method: "POST", cookie: ses.guia, body: JSON.stringify({ segundos: 5 }) }); assert.strictEqual(r.status, 200, r.texto);
        for (const X of [G, F]) await hasta(async () => (await X.gui()).cierre, 5000, "el aviso de cierre");
        const t0 = Date.now();
        for (const X of [G, F]) await hasta(async () => { const e = await X.pres(); return e.sala === "general" && e.conectado; }, 30000, "de vuelta a la visita libre");
        tt.diagnostic("de vuelta en " + (Date.now() - t0) + " ms desde el aviso visto");
        await hasta(async () => !(await rs.listRooms()).some(x => x.name === SALA), 20000, "LiveKit sin la sala " + SALA);
        const tf = await pide("/api/presencia/guiadas/" + ev + "/token", { method: "POST", cookie: ses.familia, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.strictEqual(tf.status, 409); assert.strictEqual(JSON.parse(tf.texto).error, "guiada_cerrada");
        const tg = await pide("/api/presencia/guiadas/" + ev + "/token", { method: "POST", cookie: ses.guia, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.strictEqual(tg.status, 200, "el guía sí");
        // DeleteRoom cierra la sala desde el servidor: livekit-client escribe entonces, a nivel error, que sus canales de datos se cerraron («User-Initiated Abort»,
        // «closed unexpectedly»). Es el ruido esperable de un cierre del servidor (no es código del gemelo); cualquier otro error sí falla la prueba
        const ruido = /DataChannel error on (lossy|reliable): User-Initiated Abort|publisher data channel '[A-Z_]+' closed unexpectedly/;
        assert.deepStrictEqual([...G.errores, ...F.errores].filter(x => !ruido.test(x)), []);
      });
    } finally {
      if (nav) await nav.close().catch(() => {});
      if (bd) { if (ev) await bd.query("DELETE FROM visitas WHERE id = $1", [ev]).catch(() => {}); await bd.end().catch(() => {}); }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
    }
  } finally { await sueltaTurno(); }
});
