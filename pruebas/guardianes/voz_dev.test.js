"use strict";
// La voz de una visita guiada (F3d) en Chrome con MICRÓFONO SIMULADO contra el LiveKit y la api de infra/dev (Docker). Opcional: GEMELO_DOCKER=1; pide el turno
// del banco («docker+chrome»: un solo Docker o Chrome de pruebas a la vez, TESTING.md) y lanza SU PROPIO Chrome con --use-fake-device-for-media-stream y
// --use-fake-ui-for-media-stream (el micrófono es un pitido sintético y el permiso se concede solo), así que con GEMELO_CHROME_WS (la puerta comparte un
// Chrome sin esas banderas) se SALTA con aviso: se corre sola. Sin la bandera, todo se salta con aviso.
//  Una visita guiada sintética (tipo «guiada», en 5 min), un guía (rol guia, visitas.guia_id) y una familia apuntada; los dos abren /finca/?guiada=<evento>:
//   1. los dos entran en la sala guiada-<evento> (componente «voz-guiada»), con su papel; el guía puede hablar y la familia no;
//   2. sin gesto, nadie abre el micrófono (ni el guía); con un gesto (clic), el guía sí: LiveKit tiene su pista de micrófono y la familia la recibe, la oye por
//      Web Audio (espacial) y le llega quién habla (ActiveSpeakers); el guía, con el micro abierto y sin auriculares, oye plano (cancelación de eco);
//   3. la familia, con un gesto y sin la palabra, no publica nada (LiveKit no tiene pistas suyas);
//   4. el guía le da la palabra por la api (POST …/palabra, F3c): a la familia le llega el permiso en vivo y su turno (palabra_hasta); con un gesto abre y
//      LiveKit tiene su pista; el guía la recibe;
//   5. el guía quita la palabra (DELETE …/palabra): la pista de la familia se despublica sola y su micrófono queda cerrado
//      [lo que ADR-0026 dejó NO VERIFICADO contra LiveKit 1.13.11: que UpdateParticipant sin canPublish despublique];
//   6. el guía cierra el suyo; nada se graba (el compose no lleva Egress).
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path, chrome, playwright } = require("./_util");
const { motivoSalto, ARGS_CHROME } = require("./_navegador");
const { spawnSync } = require("child_process");

const HERR = path.join(RAIZ, "infra", "dev", "herramientas");
const SIN_DOCKER = (() => {
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.error || s.status !== 0 ? "el demonio de Docker no responde" : null;
})();
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e de la voz opcional (GEMELO_DOCKER=1): la voz con micrófono simulado contra LiveKit NO se ha comprobado"
  : process.env.GEMELO_CHROME_WS ? "la voz necesita su propio Chrome con micrófono simulado (--use-fake-device-for-media-stream): correr sola, sin GEMELO_CHROME_WS"
  : SIN_DOCKER ? SIN_DOCKER + ": la voz contra LiveKit NO se ha comprobado" : motivoSalto("la voz en dos navegadores");
const COOKIE = "__Host-gemelo";
const ARGS_MICRO = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const hasta = async (fn, ms, que) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await espera(250); } throw new Error("no llegó a tiempo: " + que + " (último: " + JSON.stringify(v) + ")"); };

test("e2e: la voz de una visita guiada en dos Chrome con micrófono simulado (permisos del token, gesto, la palabra en vivo, quitarla despublica)", { timeout: 1800000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  assert.ok(!/egress/i.test(lee("infra/dev/compose.yml")) && !/egress/i.test(lee("infra/compose.yml")), "sin Egress en los compose: nada puede grabar (decisión 10)");
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: voz_dev.test.js (F3d)");
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
      // un guía (rol guia; sintético, @example.com) y una familia de prueba apuntada a una guiada que empieza en 5 min
      const GUIA = "guia.f3d@example.com", familia = HOGARES[0];
      await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, 'guia', 'Guía F3d', true, true) ON CONFLICT (correo) DO UPDATE SET rol = 'guia', activo = true", [GUIA]);
      const idDe = async c => Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [c])).rows[0].id);
      const idGuia = await idDe(GUIA), idFam = await idDe(familia.correo);
      ev = Number((await bd.query("INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas, guia_id) VALUES ('Guiada F3d (e2e)', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 10, $1) RETURNING id", [idGuia])).rows[0].id);
      await bd.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado')", [ev, idFam]);
      const SALA = "guiada-" + ev;
      const vistos = new Set();
      async function sesion(correo) {   // enlace mágico → buzón (Mailpit) → POST /api/auth/entrar → cookie (como presencia_dev.test.js)
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

      // su propio Chrome, con el micrófono simulado (un pitido) y el permiso concedido sin preguntar
      nav = await playwright().chromium.launch({ executablePath: chrome(), args: ARGS_CHROME.concat(ARGS_MICRO) });
      const abre = async cookie => {
        const ctx = await nav.newContext({ viewport: { width: 450, height: 325 }, ignoreHTTPSErrors: true, permissions: ["microphone"] });
        await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
        await ctx.addInitScript(() => { window.__habla = []; });
        const pg = await ctx.newPage(), errores = [];
        pg.on("pageerror", e => errores.push(String(e).slice(0, 300)));
        pg.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
        await pg.goto(base + "/finca/?guiada=" + ev);
        await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__voz, null, { timeout: 300000, polling: 1000 });
        const voz = (accion, arg) => pg.evaluate(([a, x]) => Promise.resolve(window.__voz(a, x)), [accion, arg]);
        const gesto = () => pg.mouse.click(5, 5);   // un clic de verdad: activación del usuario (navigator.userActivation) y el AudioContext arranca
        return { ctx, pg, errores, voz, gesto };
      };
      const pistas = async () => { const l = await rs.listParticipants(SALA); return Object.fromEntries(l.map(x => [JSON.parse(x.metadata || "{}").papel || "?", { identidad: x.identity, micro: (x.tracks || []).filter(tr => (tr.source === 2 || tr.source === "MICROPHONE") && !tr.muted).length }])); };

      const G = await abre(ses.guia), F = await abre(ses.familia);
      await t.test("los dos entran en la sala guiada con su papel; el guía puede hablar y la familia no", async () => {
        const eg = await hasta(async () => { const e = await G.voz(); return e.dentro && e; }, 60000, "el guía en la sala");
        const ef = await hasta(async () => { const e = await F.voz(); return e.dentro && e; }, 60000, "la familia en la sala");
        assert.strictEqual(eg.sala, SALA); assert.strictEqual(eg.papel, "guia"); assert.strictEqual(eg.puede, true); assert.strictEqual(eg.micro, "cerrado");
        assert.strictEqual(ef.sala, SALA); assert.strictEqual(ef.papel, "familia"); assert.strictEqual(ef.puede, false);
      });
      await t.test("sin gesto no se abre ningún micrófono; con un clic, el del guía sí; la familia lo recibe y lo oye espacial; el guía oye plano", async tt => {
        // OJO: page.evaluate de Playwright corre CON activación de usuario (userGesture), así que llamar a abre() desde evaluate cuenta como gesto; para probar «sin gesto»
        // se programa la llamada desde un temporizador de la página, pasados los ~5 s que dura la activación transitoria, y se lee el resultado después
        await G.pg.evaluate(() => { window.__sinGesto = null; setTimeout(() => { Promise.resolve(window.__voz("abre")).then(r => { window.__sinGesto = { r, ...window.__voz() }; }); }, 6500); });
        await espera(8000);   // sin tocar la página: cada evaluate de Playwright renovaría la activación
        const sg = await hasta(() => G.pg.evaluate(() => window.__sinGesto), 15000, "abre() sin gesto");
        assert.strictEqual(sg.r, false); assert.strictEqual(sg.motivo, "sin_gesto");
        assert.strictEqual((await pistas()).guia.micro, 0, "LiveKit no tiene micrófono del guía");
        await G.gesto(); assert.strictEqual(await G.voz("abre"), true);
        await hasta(async () => (await pistas()).guia.micro === 1, 15000, "la pista del guía en LiveKit");
        await F.gesto();
        await hasta(async () => (await F.voz()).voces === 1, 20000, "la familia recibe la voz del guía");
        const v = (await F.voz("voces"))[0];
        tt.diagnostic("la familia oye al guía: " + JSON.stringify(v));
        assert.strictEqual(v.modo, "espacial"); assert.strictEqual(v.silenciada, true, "el <audio> va silenciado: suena por Web Audio"); assert.ok(v.ganancia >= 0.25);
        const quien = await hasta(async () => { const e = await F.voz(); return e.hablan > 0 && e; }, 20000, "quién habla (ActiveSpeakers) con el pitido del micrófono simulado").catch(e => e);
        tt.diagnostic("quién habla en la familia: " + (quien instanceof Error ? quien.message : quien.hablan));
        assert.ok(!(quien instanceof Error), "a la familia le llega que el guía habla");
        assert.strictEqual((await G.voz()).modo, "plano", "el guía, micro abierto y sin auriculares: plano (cancelación de eco)");
      });
      let idFamilia = null;
      await t.test("la familia, sin la palabra, no publica aunque pulse", async () => {
        await F.gesto(); assert.strictEqual(await F.voz("abre"), false); assert.strictEqual((await F.voz()).motivo, "sin_permiso");
        const pp = await pistas(); idFamilia = pp.familia.identidad; assert.strictEqual(pp.familia.micro, 0);
      });
      await t.test("el guía da la palabra por la api: permiso en vivo, turno, la familia habla y el guía la oye", async tt => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/palabra", { method: "POST", cookie: ses.guia, body: JSON.stringify({ identidad: idFamilia }) });
        assert.strictEqual(r.status, 200, r.texto);
        const e = await hasta(async () => { const x = await F.voz(); return x.puede && x; }, 15000, "el permiso en vivo (ParticipantPermissionsChanged)");
        tt.diagnostic("turno de la familia: " + e.turno + " s"); assert.ok(e.turno > 100 && e.turno <= 120, String(e.turno));
        await F.gesto(); assert.strictEqual(await F.voz("abre"), true);
        await hasta(async () => (await pistas()).familia.micro === 1, 15000, "la pista de la familia en LiveKit");
        await hasta(async () => (await G.voz()).voces === 1, 20000, "el guía recibe la voz de la familia");
      });
      await t.test("el guía quita la palabra: la pista de la familia se despublica sola y su micrófono queda cerrado", async tt => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/palabra", { method: "DELETE", cookie: ses.guia });
        assert.ok(r.status === 200 || r.status === 204, r.status + " " + r.texto);
        const t0 = Date.now();
        await hasta(async () => (await pistas()).familia.micro === 0, 15000, "LiveKit despublica la pista al quitar canPublish (NO VERIFICADO en ADR-0026)");
        tt.diagnostic("despublicada en " + (Date.now() - t0) + " ms");
        await hasta(async () => { const x = await F.voz(); return x.micro === "cerrado" && !x.puede; }, 15000, "el micrófono de la familia, cerrado");
      });
      await t.test("el guía cierra el suyo y nadie publica; sin errores en las páginas", async () => {
        assert.strictEqual(await G.voz("cierra"), true);
        await hasta(async () => { const pp = await pistas(); return pp.guia.micro === 0 && pp.familia.micro === 0; }, 15000, "ninguna pista");
        assert.deepStrictEqual([...G.errores, ...F.errores], []);
      });
    } finally {
      if (nav) await nav.close().catch(() => {});
      if (bd) { if (ev) await bd.query("DELETE FROM visitas WHERE id = $1", [ev]).catch(() => {}); await bd.end().catch(() => {}); }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
    }
  } finally { await sueltaTurno(); }
});
