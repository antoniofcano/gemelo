"use strict";
// F3k-5: la voz por cercanía en corros en TRES Chrome con micrófono simulado contra el LiveKit y la api de infra/dev (Docker). Opcional: GEMELO_DOCKER=1; pide el
// turno del banco («docker+chrome») y lanza su propio Chrome con --use-fake-device-for-media-stream y --use-fake-ui-for-media-stream (el micrófono es un pitido
// sintético y el permiso se concede solo), así que con GEMELO_CHROME_WS (la puerta comparte un Chrome) se salta con aviso: se corre sola. Sin la bandera, se salta.
// ESCRITA EN F3k-2/3 Y SIN EJECUTAR (el agente que la escribió no abre Chrome ni Docker): la primera pasada por el banco puede pedir ajustes de tiempos o selectores.
//  Tres cuentas de prueba (siembra de infra/dev: Abubilla, Vecino, Mirlo); el interruptor de la oficina encendido en la base; A y B con el aviso «cercania» aceptado
//  y la voz activada; C sin activar. Los tres en /finca/?presencia=red, paseando, A y B juntos:
//   1. sin aceptar no se oye: A invita a B; antes de aceptar no existe la sala del corro y nadie tiene voces;
//   2. B acepta: los dos en corro-<id> (dos participantes; C no), A abre el micro (un clic: gesto) y B recibe su pista (una voz con ganancia > 0); C, nada;
//   3. C ve el icono del corro y no puede pedir token (409 sin_corro);
//   4. quien sale deja de oír: B sale (motivo salir), su voz sale de la sala y el corro se deshace (DeleteRoom);
//   5. bloqueado no entra: B bloquea a A; A invita a B → 409 no_disponible (sin decir por qué);
//   6. suspendido no recibe token: sin bloqueo, A y B otra vez en corro; la oficina suspende a B (en la base): su token → 409 no_puedes;
//   7. sin errores en las páginas.
// No prueba: si se entiende lo que se oye, Quest ni iPhone (F3k-6).
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
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e de los corros opcional (GEMELO_DOCKER=1): la voz por cercanía contra LiveKit NO se ha comprobado"
  : process.env.GEMELO_CHROME_WS ? "los corros necesitan su propio Chrome con micrófono simulado: correr sola, sin GEMELO_CHROME_WS"
  : SIN_DOCKER ? SIN_DOCKER + ": la voz por cercanía contra LiveKit NO se ha comprobado" : motivoSalto("los corros en tres navegadores");
const ARGS_MICRO = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"];
const COOKIE = "__Host-gemelo";
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const hasta = async (fn, ms, que) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await espera(250); } throw new Error("no llegó a tiempo: " + que + " (último: " + JSON.stringify(v) + ")"); };

test("e2e F3k-5: corros con tres Chrome y micrófono simulado (sin aceptar no se oye; quien sale deja de oír; bloqueado no entra; suspendido no recibe token)", { timeout: 1800000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: corro_dev.test.js (F3k-5)");
  try {
    const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs");
    const comun = await imp("_comun.mjs"), { HOGARES } = await imp("siembra.mjs");
    const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
    await levanta({ sinBuild: process.env.GEMELO_SIN_BUILD === "1" });
    let nav = null, bd = null;
    const [cA, cB, cC] = HOGARES.map(h => h.correo);
    try {
      const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, ca = comun.caLocal();
      const pide = (ruta, o = {}) => comun.pideHttps(p.https, ruta, { method: o.method, body: o.body, ca,
        headers: Object.assign({ origin: base }, o.body !== undefined ? { "content-type": "application/json" } : {}, o.headers, o.cookie ? { cookie: COOKIE + "=" + o.cookie } : {}) });
      const Pg = require(path.join(HERR, "node_modules", "pg"));
      bd = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
      await bd.connect();
      const lkSdk = require(path.join(HERR, "node_modules", "livekit-server-sdk"));
      const rs = new lkSdk.RoomServiceClient("http://127.0.0.1:" + p.livekit, process.env.GEMELO_DEV_LIVEKIT_CLAVE, process.env.GEMELO_DEV_LIVEKIT_SECRETO);
      const idDe = async c => Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [c])).rows[0].id);
      const [hA, hB, hC] = [await idDe(cA), await idDe(cB), await idDe(cC)];
      // la oficina enciende el interruptor (en la base: la ruta de la oficina pide además un aparato aprobado; F3k-4 la usará desde su página)
      await bd.query("UPDATE voz_cercania_interruptor SET activa = true, cambiada_en = now()");
      await bd.query("DELETE FROM voz_bloqueos WHERE hogar_id = ANY($1::bigint[]) OR bloqueado_id = ANY($1::bigint[])", [[hA, hB, hC]]);
      await bd.query("DELETE FROM voz_cercania_suspensiones WHERE hogar_id = ANY($1::bigint[])", [[hA, hB, hC]]);
      const vistos = new Set();
      async function sesion(correo) {   // enlace mágico → buzón (Mailpit) → POST /api/auth/entrar → cookie (como guiada_dev.test.js)
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
      const ses = { A: await sesion(cA), B: await sesion(cB), C: await sesion(cC) };
      // A y B: el aviso «cercania» (lo que hace el diálogo, probado en Node en corro.test.js) y la voz activada; C, apagada
      for (const q of ["A", "B"]) {
        assert.strictEqual((await pide("/api/presencia/voz/consentimiento?ambito=cercania", { method: "PUT", cookie: ses[q], body: JSON.stringify({ version: 1, adulto: true }) })).status, 200, "aviso de " + q);
        assert.strictEqual((await pide("/api/presencia/corros/ajuste", { method: "PUT", cookie: ses[q], body: JSON.stringify({ activa: true }) })).status, 200, "ajuste de " + q);
      }
      nav = await playwright().chromium.launch({ executablePath: chrome(), args: ARGS_CHROME.concat(ARGS_MICRO) });
      const abre = async (cookie, x, y) => {
        const ctx = await nav.newContext({ viewport: { width: 900, height: 650 }, ignoreHTTPSErrors: true, permissions: ["microphone"] });
        await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
        const pg = await ctx.newPage(), errores = [];
        pg.on("pageerror", e => errores.push(String(e).slice(0, 300)));
        pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
        await pg.goto(base + "/finca/?presencia=red");
        await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__presencia && window.__corro && window.__voz, null, { timeout: 300000, polling: 1000 });
        await pg.evaluate(([x, y]) => window.__g.paseoEn(x, y, 0), [x, y]);
        const cor = (a, v) => pg.evaluate(([a, v]) => Promise.resolve(window.__corro(a, v)), [a, v]);
        const voz = (a, v) => pg.evaluate(([a, v]) => Promise.resolve(window.__voz(a, v)), [a, v]);
        const pres = () => pg.evaluate(() => window.__presencia());
        return { ctx, pg, errores, cor, voz, pres };
      };
      // A y B a 3 m (pueden invitarse); C a 30 m (los ve, no está en el corro). Coordenadas del fixture de infra/dev [SUPUESTO: dentro de la finca de prueba]
      const A = await abre(ses.A, 100, 100), B = await abre(ses.B, 103, 100), C = await abre(ses.C, 130, 100);
      for (const X of [A, B, C]) await hasta(async () => { const e = await X.pres(); return e.conectado && e.sala === "general" && e; }, 60000, "la presencia en la visita libre");
      const idB = (await B.pres()).identidad, idA = (await A.pres()).identidad;
      await hasta(async () => (await A.cor()).disponible && (await A.cor()).puedo, 40000, "A con la voz por cercanía disponible");
      const salasCorro = async () => (await rs.listRooms()).filter(r => /^corro-/.test(r.name));

      await t.test("1. sin aceptar no se oye: la invitación sale, pero no hay sala ni voces", async () => {
        assert.strictEqual(await A.cor("invita", idB), true, "A invita a B (a 3 m)");
        await hasta(async () => (await B.cor()).invitacion, 20000, "B ve la invitación (tema «corro» o sondeo)");
        assert.ok(await B.pg.isVisible("#corroInvitacion"), "la caja de la invitación"); assert.strictEqual(await B.pg.evaluate(() => document.activeElement && document.activeElement.id), "corroInvNo", "foco en «Ahora no»");
        assert.deepStrictEqual(await salasCorro(), [], "sin aceptar, ni sala"); assert.strictEqual((await A.voz()).voces, 0); assert.strictEqual((await B.voz()).voces, 0);
      });
      let sala = "";
      await t.test("2. B acepta: los dos en corro-<id>; A habla (un clic) y B le oye; C no está", async () => {
        await B.pg.click("#corroInvSi");
        for (const X of [A, B]) await hasta(async () => (await X.voz()).corro, 30000, "en la sala del corro");
        sala = (await A.voz()).sala; assert.match(sala, /^corro-[A-Za-z0-9_-]{12}$/); assert.strictEqual((await B.voz()).sala, sala);
        const l = await hasta(async () => { const x = await rs.listParticipants(sala); return x.length === 2 && x; }, 20000, "dos participantes en " + sala);
        assert.deepStrictEqual(l.map(x => x.identity).sort(), [idA, idB].sort(), "la misma identidad que en la sala libre; C no está");
        await hasta(async () => await A.pg.isVisible("#hablaBoton"), 15000, "el botón Hablar de A");
        await A.pg.click("#hablaBoton");
        // F3l (sin ejecutar: lo mide el banco): la primera vez sale la tarjeta «tu micrófono, en pocas palabras»; «Entendido» y otro «Hablar» abren el micro
        if (await A.pg.isVisible("#hablaTarjetaOk")) { await A.pg.click("#hablaTarjetaOk"); await A.pg.click("#hablaBoton"); }
        await hasta(async () => (await A.voz()).micro === "abierto", 15000, "el micro de A abierto");
        const vs = await hasta(async () => { const v = await B.voz("voces"); return v.length === 1 && v; }, 20000, "B recibe la pista de A");
        assert.strictEqual(vs[0].identidad, idA);
        assert.strictEqual((await C.voz()).sala, "", "C sin sala de voz"); assert.strictEqual((await C.voz()).voces, 0);
      });
      await t.test("3. C ve el icono del corro y no tiene token", async () => {
        await hasta(async () => (await C.cor()).iconos >= 1, 60000, "el icono sobre A y B").catch(async e => { t.diagnostic("C: " + JSON.stringify(await C.cor()) + " · A: " + JSON.stringify(await A.pres())); throw e; });
        const tk = await pide("/api/presencia/corros/token", { method: "POST", cookie: ses.C, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.strictEqual(tk.status, 409); assert.strictEqual(JSON.parse(tk.texto).error, "sin_corro");
      });
      await t.test("4. quien sale deja de oír y el corro se deshace", async () => {
        assert.strictEqual(await B.cor("sale", "salir"), true);
        await hasta(async () => !(await B.voz()).corro, 15000, "B fuera de la voz del corro");
        await hasta(async () => !(await A.voz()).corro, 30000, "A también: quedaba uno solo");
        await hasta(async () => !(await rs.listRooms()).some(r => r.name === sala), 20000, "LiveKit sin la sala " + sala);
      });
      await t.test("5. bloqueado no entra: B bloquea a A y A ya no puede invitarle (solo «no disponible»)", async () => {
        assert.strictEqual(await B.cor("bloquea", idA), true);
        const r = await pide("/api/presencia/corros/invitaciones", { method: "POST", cookie: ses.A, body: JSON.stringify({ identidad: idB }) });
        assert.strictEqual(r.status, 409); assert.strictEqual(JSON.parse(r.texto).error, "no_disponible");
        const pre = idA.slice(0, 24); assert.strictEqual((await pide("/api/presencia/corros/bloqueos/" + pre, { method: "DELETE", cookie: ses.B })).status, 204, "y se quita");
      });
      await t.test("6. suspendido no recibe token", async () => {
        assert.strictEqual(await A.cor("invita", idB), true);
        await hasta(async () => (await B.cor()).invitacion, 20000, "la invitación");
        await B.cor("acepta");
        await hasta(async () => (await B.voz()).corro, 60000, "en corro otra vez");
        await bd.query("INSERT INTO voz_cercania_suspensiones (hogar_id, hasta, automatica) VALUES ($1, NULL, false) ON CONFLICT (hogar_id) DO UPDATE SET hasta = NULL", [hB]);
        const tk = await pide("/api/presencia/corros/token", { method: "POST", cookie: ses.B, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.strictEqual(tk.status, 409); assert.strictEqual(JSON.parse(tk.texto).error, "no_puedes");
      });
      await t.test("7. sin errores en las páginas", async () => {
        const ruido = /DataChannel error on (lossy|reliable): User-Initiated Abort|publisher data channel '[A-Z_]+' closed unexpectedly/;   // el cierre de una sala desde el servidor (como en guiada_dev)
        assert.deepStrictEqual([...A.errores, ...B.errores, ...C.errores].filter(x => !ruido.test(x)), []);
      });
    } finally {
      if (nav) await nav.close().catch(() => {});
      if (bd) {
        const ids = await Promise.all([cA, cB, cC].map(c => bd.query("SELECT id FROM hogares WHERE correo = $1", [c]).then(r => Number(r.rows[0].id)).catch(() => 0)));
        await bd.query("DELETE FROM voz_cercania_suspensiones WHERE hogar_id = ANY($1::bigint[])", [ids]).catch(() => {});
        await bd.query("DELETE FROM voz_bloqueos WHERE hogar_id = ANY($1::bigint[])", [ids]).catch(() => {});
        await bd.query("UPDATE voz_cercania_interruptor SET activa = false").catch(() => {});
        await bd.end().catch(() => {});
      }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
    }
  } finally { await sueltaTurno(); }
});
