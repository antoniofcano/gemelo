"use strict";
// F3g: el recorrido COMPLETO de una visita guiada con voz en TRES Chrome (un guía y dos familias) y micrófono simulado, contra el LiveKit y la api de infra/dev
// (Docker, PostGIS). Opcional: GEMELO_DOCKER=1; pide el turno del banco («docker+chrome») y lanza SU PROPIO Chrome con --use-fake-device-for-media-stream y
// --use-fake-ui-for-media-stream (el micrófono es un pitido sintético): con GEMELO_CHROME_WS se SALTA con aviso (se corre sola). Sin la bandera, se salta.
//  Una guiada sintética (en 5 min), un guía, dos familias apuntadas (Ana y Beta) y una tercera EN ESPERA (solo por la api: no tiene Chrome):
//   1. los tres entran en `guiada-<evento>` por el BOTÓN «Entrar en la visita» de la agenda (OF11e); una sola conexión por persona; LiveKit da el papel y el
//      permiso del token (guía puede publicar; familias, no); la familia en espera no obtiene token (403) y no está en la sala;
//   2. sin la palabra, Ana y Beta no publican aunque pulsen (ninguna pista suya en LiveKit); el guía abre su micrófono y las dos lo oyen;
//   3. Ana levanta la mano (`__habla`): la ve el guía y el atributo `mano` llega a LiveKit; el guía le da la palabra desde el panel (`mano1`): el atributo
//      `palabra_hasta` llega a LiveKit, el permiso llega en vivo, Ana abre y publica; Beta y el guía la reciben (pista, `voz:habla` → «hablan»);
//   4. la palabra VENCE SOLA a los 2 min (temporizador de la api, UpdateParticipant sin canPublish): la pista de Ana se despublica sola, su permiso en LiveKit
//      vuelve a falso, el atributo se limpia y su micrófono queda cerrado [ADR-0026, no verificado hasta hoy contra LiveKit 1.13.11];
//   5. el guía da la palabra a Beta y SILENCIA A TODOS: nadie (salvo el guía) tiene micrófono sin silenciar y Beta pierde el turno;
//   6. UpdateParticipant sobre una identidad que no está responde 404 (twirp not_found) en LiveKit real;
//   7. el guía EXPULSA a Beta: sale de la sala, no puede volver (token denegado) y las demás siguen;
//   8. el guía CIERRA la sala con 5 s de aviso: el aviso (tema «cierre») llega ANTES de que LiveKit borre la sala (la sala sigue listada cuando el aviso se
//      ve), todos vuelven a la visita libre, la sala desaparece y la familia no puede volver a entrar;
//   9. sin grabación: ni Egress en los compose, ni sala con `activeRecording`; sin errores de consola en las páginas.
// No prueba: el sonido real (el micrófono es un pitido; no se oye con altavoces ni auriculares), Quest, iPhone, la carga con muchas personas (F3h).
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
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e de la voz con tres Chrome opcional (GEMELO_DOCKER=1): el recorrido completo contra LiveKit NO se ha comprobado"
  : process.env.GEMELO_CHROME_WS ? "la voz con tres Chrome necesita su propio Chrome con micrófono simulado (--use-fake-device-for-media-stream): correr sola, sin GEMELO_CHROME_WS"
  : SIN_DOCKER ? SIN_DOCKER + ": el recorrido completo contra LiveKit NO se ha comprobado" : motivoSalto("la voz con tres Chrome");
const COOKIE = "__Host-gemelo";
const ARGS_MICRO = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const hasta = async (fn, ms, que) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await espera(250); } throw new Error("no llegó a tiempo: " + que + " (último: " + JSON.stringify(v) + ")"); };

test("e2e F3g: guía y dos familias en tres Chrome (entrar desde la agenda, sin la palabra no se publica, mano, palabra, vence sola, silenciar, expulsar, cerrar con aviso)", { timeout: 2400000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  assert.ok(!/egress/i.test(lee("infra/dev/compose.yml")) && !/egress/i.test(lee("infra/compose.yml")), "sin Egress en los compose: nada puede grabar (decisión 10)");
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: voz_guiada_dev.test.js (F3g)");
  try {
    const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs");
    const comun = await imp("_comun.mjs");
    const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
    await levanta({ sinBuild: process.env.GEMELO_SIN_BUILD === "1" });
    let nav = null, bd = null, ev = null;
    const correos = [];
    try {
      const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, ca = comun.caLocal();
      const pide = (ruta, o = {}) => comun.pideHttps(p.https, ruta, { method: o.method, body: o.body, ca,
        headers: Object.assign({ origin: base }, o.body !== undefined ? { "content-type": "application/json" } : {}, o.headers, o.cookie ? { cookie: COOKIE + "=" + o.cookie } : {}) });
      const Pg = require(path.join(HERR, "node_modules", "pg"));
      bd = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
      await bd.connect();
      const lkSdk = require(path.join(HERR, "node_modules", "livekit-server-sdk"));
      const rs = new lkSdk.RoomServiceClient("http://127.0.0.1:" + p.livekit, process.env.GEMELO_DEV_LIVEKIT_CLAVE, process.env.GEMELO_DEV_LIVEKIT_SECRETO);
      // datos SINTÉTICOS (@example.com): un guía, dos familias apuntadas y una en espera
      const GUIA = "guia.f3g@example.com", ANA = "ana.f3g@example.com", BETA = "beta.f3g@example.com", ESPERA = "espera.f3g@example.com";
      for (const [c, rol, al] of [[GUIA, "guia", "Guía F3g"], [ANA, "hogar", "Ana F3g"], [BETA, "hogar", "Beta F3g"], [ESPERA, "hogar", "Espera F3g"]]) {
        await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, $2, $3, true, true) ON CONFLICT (correo) DO UPDATE SET rol = $2, activo = true", [c, rol, al]);
        correos.push(c);
      }
      const idDe = async c => Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [c])).rows[0].id);
      ev = Number((await bd.query("INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas, guia_id) VALUES ('Guiada F3g (e2e)', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 10, $1) RETURNING id", [await idDe(GUIA)])).rows[0].id);
      await bd.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado'), ($1, $3, 'apuntado'), ($1, $4, 'en_espera')", [ev, await idDe(ANA), await idDe(BETA), await idDe(ESPERA)]);
      const SALA = "guiada-" + ev;
      const vistos = new Set();
      async function sesion(correo) {   // enlace mágico → buzón (Mailpit) → POST /api/auth/entrar → cookie
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
      const ses = { guia: await sesion(GUIA), ana: await sesion(ANA), beta: await sesion(BETA), espera: await sesion(ESPERA) };

      nav = await playwright().chromium.launch({ executablePath: chrome(), args: ARGS_CHROME.concat(ARGS_MICRO) });
      const abre = async cookie => {
        const ctx = await nav.newContext({ viewport: { width: 640, height: 420 }, ignoreHTTPSErrors: true, permissions: ["microphone"] });
        await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
        const pg = await ctx.newPage(), errores = [];
        pg.on("pageerror", e => errores.push(String(e).slice(0, 300)));
        pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(m.text().slice(0, 300)); });
        await pg.goto(base + "/finca/?presencia=red");   // SIN ?guiada=: se entra por la agenda
        await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__agenda && window.__presencia, null, { timeout: 300000, polling: 1000 });
        const llama = (f, a, x) => pg.evaluate(([n, a, x]) => Promise.resolve(window[n] ? window[n](a, x) : null), [f, a, x]);
        return { ctx, pg, errores, voz: (a, x) => llama("__voz", a, x), gui: (a, x) => llama("__guiada", a, x), hab: (a, x) => llama("__habla", a, x),
          pres: () => llama("__presencia"), gesto: () => pg.mouse.click(5, 5) };
      };
      const entraPorLaAgenda = async X => {   // el botón «Entrar en la visita» de la ventana de la agenda (OF11e)
        await hasta(async () => { const a = await X.pg.evaluate(() => window.__agenda().datos); return a && a.eventos.some(e => e.id === ev && e.entrada) && a; }, 60000, "la guiada en la agenda con su ventana de entrada");
        const visible = await X.pg.evaluate(() => { const b = document.getElementById("hudIco-agenda"); return !!(b && b.offsetParent); });
        if (visible) await X.pg.click("#hudIco-agenda"); else { await X.pg.click("#bMas"); await X.pg.locator("#hudMas button", { hasText: "Agenda" }).click(); }
        await X.pg.waitForSelector("#ventana-agenda [data-entra='" + ev + "']", { timeout: 15000 });
        await X.pg.click("#ventana-agenda [data-entra='" + ev + "']");
      };
      const lista = async () => (await rs.listParticipants(SALA)).map(x => ({ identidad: x.identity, papel: JSON.parse(x.metadata || "{}").papel || "?", attr: Object.assign({}, x.attributes),
        puede: !!(x.permission && x.permission.canPublish), micros: (x.tracks || []).filter(tr => tr.source === 2 || tr.source === "MICROPHONE").length,
        sinSilenciar: (x.tracks || []).filter(tr => (tr.source === 2 || tr.source === "MICROPHONE") && !tr.muted).length }));
      const de = async papel => (await lista()).filter(x => x.papel === papel);

      const G = await abre(ses.guia), A = await abre(ses.ana), B = await abre(ses.beta);
      let idA = null, idB = null, idG = null;

      await t.test("los tres entran por el botón de la agenda: una conexión por persona, papel y permiso del token; la familia en espera no tiene token", async () => {
        for (const X of [G, A, B]) await entraPorLaAgenda(X);
        for (const X of [G, A, B]) await hasta(async () => { const e = await X.pres(); return e.sala === "guiada" && e.conectado && e.evento === ev && e; }, 90000, "la presencia en la guiada");
        const l = await hasta(async () => { const x = await lista(); return x.length === 3 && x; }, 30000, "tres participantes (una conexión por persona) en " + SALA);
        assert.deepStrictEqual(l.map(x => x.papel).sort(), ["familia", "familia", "guia"]);
        const guia = l.find(x => x.papel === "guia");
        assert.strictEqual(guia.puede, true, "el guía puede publicar (token)");
        for (const f of l.filter(x => x.papel === "familia")) assert.strictEqual(f.puede, false, "la familia no puede publicar (token)");
        idG = (await G.gui()).yo; idA = (await A.gui()).yo; idB = (await B.gui()).yo;
        assert.strictEqual(idG, guia.identidad); assert.ok(idA && idB && idA !== idB);
        for (const X of [G, A, B]) { const v = await X.voz(); assert.strictEqual(v.sala, SALA); }
        const te = await pide("/api/presencia/guiadas/" + ev + "/token", { method: "POST", cookie: ses.espera, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.ok(te.status === 403 || te.status === 409, "en espera: " + te.status + " " + te.texto); assert.ok(!/"token"/.test(te.texto), "no se entrega token a la familia en espera");
        assert.strictEqual((await lista()).length, 3, "la familia en espera no está en la sala");
      });

      await t.test("sin la palabra, las familias no publican aunque pulsen; el guía abre su micrófono y las dos lo oyen", async tt => {
        await A.gesto(); assert.strictEqual(await A.voz("abre"), false); assert.strictEqual((await A.voz()).motivo, "sin_permiso");
        await B.gesto(); assert.strictEqual(await B.voz("abre"), false); assert.strictEqual((await B.voz()).motivo, "sin_permiso");
        await G.gesto(); assert.strictEqual(await G.voz("abre"), true);
        await hasta(async () => (await de("guia"))[0].sinSilenciar === 1, 20000, "la pista del guía en LiveKit");
        for (const X of [A, B]) await hasta(async () => (await X.voz()).voces === 1, 25000, "la familia recibe la voz del guía");
        for (const f of await de("familia")) assert.strictEqual(f.micros, 0, "ninguna pista de familia en LiveKit");
        const h = await hasta(async () => { const e = await B.voz(); return e.hablan > 0 && e; }, 25000, "voz:habla (ActiveSpeakers) con el pitido simulado").catch(e => e);
        tt.diagnostic("Beta ve hablar al guía: " + (h instanceof Error ? h.message : "sí (" + h.hablan + ")")); assert.ok(!(h instanceof Error));
      });

      await t.test("Ana levanta la mano; el guía la ve y el atributo llega a LiveKit; el guía le da la palabra: atributo palabra_hasta, permiso en vivo, publica y la oyen", async tt => {
        const h = await A.hab("mano", true); tt.diagnostic("mano de Ana: " + JSON.stringify({ mano: h && h.mano, puesto: h && h.puesto }));
        await hasta(async () => (await G.gui()).manos.includes(idA), 15000, "la mano de Ana en la cola del guía");
        const fa = await hasta(async () => { const x = (await lista()).find(y => y.identidad === idA); return x && Object.keys(x.attr).length && x; }, 15000, "los atributos de Ana en LiveKit");
        tt.diagnostic("atributos de Ana en LiveKit tras la mano: " + JSON.stringify(fa.attr));
        assert.ok("mano" in fa.attr, "el atributo «mano» llega a la sala: " + JSON.stringify(fa.attr));
        assert.ok(await G.gui("mano1"), "el panel del guía da la palabra a la 1.ª mano");
        const fb = await hasta(async () => { const x = (await lista()).find(y => y.identidad === idA); return x && x.attr.palabra_hasta && x; }, 15000, "palabra_hasta en LiveKit");
        tt.diagnostic("atributos de Ana en LiveKit con la palabra: " + JSON.stringify(fb.attr) + " · permiso " + fb.puede);
        assert.strictEqual(fb.puede, true, "UpdateParticipant dio canPublish");
        assert.ok(Number(fb.attr.palabra_hasta) > Date.now() + 100000 || Date.parse(fb.attr.palabra_hasta) > Date.now() + 100000, "palabra_hasta a ~2 min: " + fb.attr.palabra_hasta);
        const e = await hasta(async () => { const x = await A.voz(); return x.puede && x; }, 15000, "el permiso en vivo en Ana");
        assert.ok(e.turno > 100 && e.turno <= 120, String(e.turno));
        for (const X of [A, G]) await hasta(async () => { const x = await X.gui(); return x.palabra && x.palabra.identidad === idA; }, 15000, "los dos ven el turno");
        await A.gesto(); assert.strictEqual(await A.voz("abre"), true);
        await hasta(async () => (await lista()).find(y => y.identidad === idA).sinSilenciar === 1, 15000, "la pista de Ana en LiveKit");
        await hasta(async () => (await B.voz()).voces === 2, 25000, "Beta recibe al guía y a Ana");
        await hasta(async () => (await G.voz()).voces === 1, 25000, "el guía recibe a Ana");
        const hb = await hasta(async () => { const x = await B.voz(); return x.hablan > 0 && x; }, 20000, "voz:habla en Beta").catch(x => x);
        assert.ok(!(hb instanceof Error), "a Beta le llega que alguien habla");
      });

      await t.test("la palabra VENCE SOLA a los 2 min: la pista de Ana se despublica, su permiso vuelve a falso, el atributo se limpia y su micro queda cerrado", async tt => {
        const t0 = Date.now();
        await hasta(async () => (await lista()).find(y => y.identidad === idA).micros === 0, 160000, "LiveKit despublica la pista al vencer el turno (ADR-0026, no verificado)");
        tt.diagnostic("despublicada a los " + Math.round((Date.now() - t0) / 1000) + " s de comprobar (el turno llevaba ya unos 15-40 s)");
        const fa = (await lista()).find(y => y.identidad === idA);
        assert.strictEqual(fa.puede, false, "canPublish vuelve a falso en LiveKit"); assert.ok(!fa.attr.palabra_hasta, "palabra_hasta limpiado: " + JSON.stringify(fa.attr));
        await hasta(async () => { const x = await A.voz(); return x.micro === "cerrado" && !x.puede; }, 15000, "el micrófono de Ana, cerrado");
        for (const X of [G, A, B]) await hasta(async () => (await X.gui()).palabra === null, 15000, "sin turno en las páginas");
        await hasta(async () => (await B.voz()).voces === 1, 15000, "Beta ya solo oye al guía");
      });

      await t.test("el guía da la palabra a Beta y silencia a todos: nadie salvo el guía tiene micrófono sin silenciar y Beta pierde el turno", async tt => {
        assert.ok(await G.gui("dar", idB));
        await hasta(async () => (await B.voz()).puede, 15000, "el permiso en vivo en Beta");
        await B.gesto(); assert.strictEqual(await B.voz("abre"), true);
        await hasta(async () => (await lista()).find(y => y.identidad === idB).sinSilenciar === 1, 15000, "la pista de Beta en LiveKit");
        const r = await pide("/api/presencia/guiadas/" + ev + "/silenciar", { method: "POST", cookie: ses.guia, body: "{}" });
        assert.strictEqual(r.status, 200, r.texto); tt.diagnostic("silenciar: " + r.texto);
        await hasta(async () => { const l = await lista(); return l.filter(x => x.papel !== "guia").every(x => x.sinSilenciar === 0) && l; }, 15000, "ninguna familia con micrófono sin silenciar");
        assert.strictEqual((await de("guia"))[0].sinSilenciar, 1, "el guía sigue hablando");
        await hasta(async () => { const x = await B.voz(); return !x.puede && x.micro === "cerrado"; }, 15000, "Beta sin permiso y con el micro cerrado");
        for (const X of [G, A, B]) await hasta(async () => (await X.gui()).palabra === null, 15000, "sin turno");
      });

      await t.test("UpdateParticipant sobre alguien que no está responde 404 en LiveKit real (la api lo lee como «no está»)", async tt => {
        let err = null;
        try { await rs.updateParticipant(SALA, "no_existe_f3g", undefined, { canPublish: true, canSubscribe: true, canPublishData: true, canPublishSources: [2] }); } catch (e) { err = e; }
        assert.ok(err, "debía fallar"); tt.diagnostic("error de LiveKit: " + JSON.stringify({ status: err.status, code: err.code, message: String(err.message).slice(0, 120) }));
        assert.ok(err.status === 404 || err.code === "not_found", "404 / not_found: " + JSON.stringify({ status: err.status, code: err.code }));
      });

      await t.test("el guía expulsa a Beta: sale de la sala, no puede volver y las demás siguen", async () => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/expulsar", { method: "POST", cookie: ses.guia, body: JSON.stringify({ identidad: idB, motivo: "prueba F3g" }) });
        assert.strictEqual(r.status, 200, r.texto); assert.ok(JSON.parse(r.texto).conexiones >= 1);
        await hasta(async () => !(await lista()).some(x => x.identidad === idB), 15000, "Beta fuera de la sala");
        await espera(4000); assert.ok(!(await lista()).some(x => x.identidad === idB), "Beta no se cuela de nuevo");
        const tb = await pide("/api/presencia/guiadas/" + ev + "/token", { method: "POST", cookie: ses.beta, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.ok(tb.status >= 400 && tb.status < 500 && !/"token"/.test(tb.texto), "expulsada: sin token (" + tb.status + " " + tb.texto.slice(0, 100) + ")");
        assert.strictEqual((await lista()).length, 2, "quedan el guía y Ana");
      });

      await t.test("cerrar con 5 s de aviso: el aviso llega ANTES del DeleteRoom, todos vuelven a la general, la sala desaparece y la familia no puede volver", async tt => {
        const r = await pide("/api/presencia/guiadas/" + ev + "/cerrar", { method: "POST", cookie: ses.guia, body: JSON.stringify({ segundos: 5 }) }); assert.strictEqual(r.status, 200, r.texto);
        const vistoEn = {};
        for (const [k, X] of [["guia", G], ["ana", A]]) { await hasta(async () => (await X.gui()).cierre, 5000, "el aviso de cierre en " + k); vistoEn[k] = Date.now(); }
        const salaSigue = (await rs.listRooms()).some(x => x.name === SALA);
        assert.ok(salaSigue, "cuando el aviso ya se ve, LiveKit aún tiene la sala (el aviso llega antes del DeleteRoom)");
        const t0 = Date.now();
        for (const X of [G, A]) await hasta(async () => { const e = await X.pres(); return e.sala === "general" && e.conectado; }, 40000, "de vuelta a la visita libre");
        tt.diagnostic("aviso visto → de vuelta en la general en " + (Date.now() - Math.min(vistoEn.guia, vistoEn.ana)) + " ms (aviso de 5 s); comprobación posterior " + (Date.now() - t0) + " ms");
        await hasta(async () => !(await rs.listRooms()).some(x => x.name === SALA), 20000, "LiveKit sin la sala " + SALA);
        const ta = await pide("/api/presencia/guiadas/" + ev + "/token", { method: "POST", cookie: ses.ana, body: JSON.stringify({ dispositivo: "escritorio" }) });
        assert.strictEqual(ta.status, 409); assert.strictEqual(JSON.parse(ta.texto).error, "guiada_cerrada");
      });

      await t.test("sin grabación y sin errores en las páginas", async () => {
        for (const s of await rs.listRooms()) assert.ok(!s.activeRecording, "la sala " + s.name + " no se graba");
        assert.deepStrictEqual([...G.errores, ...A.errores, ...B.errores], []);
      });
    } finally {
      if (nav) await nav.close().catch(() => {});
      if (bd) {
        if (ev) await bd.query("DELETE FROM visitas WHERE id = $1", [ev]).catch(() => {});
        await bd.query("DELETE FROM hogares WHERE correo = ANY($1)", [correos.filter(c => c !== "guia.f3g@example.com")]).catch(() => {});
        await bd.end().catch(() => {});
      }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
    }
  } finally { await sueltaTurno(); }
});
