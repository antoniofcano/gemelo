"use strict";
// Presencia de verdad (P4) contra el LiveKit de infra/dev, dentro del entorno local con Docker. Opcional: GEMELO_DOCKER=1
// (pide el turno del banco: un solo Docker o Chrome de pruebas a la vez, TESTING.md). Sin la bandera, todo se SALTA con aviso.
//  1. Transporte: dos páginas LIGERAS (la portada, sin WebGL) en el MISMO Chrome, con las sesiones de dos hogares, el mismo
//     livekit-client del motor y el token de la api, se mandan la pose del contrato a 10 Hz: retardo (reloj del emisor de la
//     cabecera frente a la llegada; MISMO equipo, performance.timeOrigin de cada página) con p95 < 250 ms.
//  2. El motor: dos contextos con dos hogares entran en /finca/?presencia=red: en vista aérea no publican pose; paseando se
//     ven (cada una recibe la pose de la otra y dibuja su avatar; su retardo con SwiftShader va al ritmo de los fotogramas y
//     solo se informa) y se escriben por el chat. Un segundo aparato del MISMO hogar (otra sesión) entra sin echar al primero.
//     La oficina expulsa al hogar: salen sus dos conexiones, el vecino sigue y no hay token nuevo. Con ?presencia=sim y sin
//     bandera, todo sigue igual (ni token ni panel).
//  3. Lo que P1-P3 dejaron sin verificar contra un LiveKit real: los permisos del token (canPublish false con
//     canPublishSources vacío: un micrófono no se publica; los datos sí), RemoveParticipant de quien no está, y si Chrome abre
//     ws://localhost:7880 desde https://localhost:8743 (y wss://localhost:8743/rtc, por Caddy).
//  4. Carga: N clientes ligeros en Node (@livekit/rtc-node, el SDK oficial de LiveKit para Node; sin navegador), repartidos en
//     P procesos (_carga_presencia.mjs), en la misma sala publican pose a 10 Hz a toda la sala durante S segundos; CPU y
//     memoria del contenedor de LiveKit (docker stats), pérdidas y retardo. GEMELO_CARGA_N (40), GEMELO_CARGA_S (60),
//     GEMELO_CARGA_PROCESOS (4); GEMELO_P4_SOLO_CARGA=1 hace solo esta parte.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync, spawn, execFile } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");
const { motivoSalto, lanza } = require("./_navegador");

const HERR = path.join(RAIZ, "infra", "dev", "herramientas");
const SIN_DOCKER = (() => {
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.error || s.status !== 0 ? "el demonio de Docker no responde" : null;
})();
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e de presencia opcional (GEMELO_DOCKER=1): dos navegadores en la sala, permisos reales y carga NO se han comprobado"
  : SIN_DOCKER ? SIN_DOCKER + ": la presencia contra LiveKit NO se ha comprobado" : motivoSalto("la presencia en dos navegadores");
const COOKIE = "__Host-gemelo";
const SALA = "hituelo-libre";
const N_CARGA = Number(process.env.GEMELO_CARGA_N || 40), S_CARGA = Number(process.env.GEMELO_CARGA_S || 60), P_CARGA = Number(process.env.GEMELO_CARGA_PROCESOS || 4), SOLO_CARGA = process.env.GEMELO_P4_SOLO_CARGA === "1";

const espera = ms => new Promise(ok => setTimeout(ok, ms));
const p95 = v => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const pct = (v, q) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const r1 = x => Math.round(x * 10) / 10;
/** retardo de cada pose: (origen del receptor + llegada) − (origen del emisor + reloj del emisor de la cabecera) */
const retardos = (lecturas, origenDe) => { const r = []; for (const [l, oR] of lecturas) for (const [id, te, llega] of l) if (origenDe[id] !== undefined) r.push(oR + llega - (origenDe[id] + te)); return r; };
const resumen = r => { let mx = -Infinity, mn = Infinity; for (const x of r) { if (x > mx) mx = x; if (x < mn) mn = x; } return { muestras: r.length, p50: r1(pct(r, 0.5)), p95: r1(p95(r)), p99: r1(pct(r, 0.99)), max: r1(mx), min: r1(mn) }; };


test("e2e: presencia con LiveKit real (dos Chrome, mismo hogar en dos aparatos, expulsión, permisos) y carga con clientes en Node", { timeout: 2400000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: presencia_dev.test.js (P4)");
  try {
    const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs");
    const comun = await imp("_comun.mjs"), { HOGARES } = await imp("siembra.mjs");
    const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
    const t0 = Date.now();
    await levanta({ sinBuild: process.env.GEMELO_SIN_BUILD === "1" });
    t.diagnostic("entorno arriba en " + r1((Date.now() - t0) / 1000) + " s (proyecto " + (process.env.COMPOSE_PROJECT_NAME || "gemelo-dev") + ")");
    try {
      const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, ca = comun.caLocal();
      const pide = (ruta, o = {}) => comun.pideHttps(p.https, ruta, { method: o.method, body: o.body, ca,
        headers: Object.assign({}, o.body !== undefined ? { "content-type": "application/json", origin: base } : {}, o.headers, o.cookie ? { cookie: COOKIE + "=" + o.cookie } : {}) });
      const Pg = require(path.join(HERR, "node_modules", "pg"));
      const bd = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
      await bd.connect();
      const lkSdk = require(path.join(HERR, "node_modules", "livekit-server-sdk"));
      const rs = new lkSdk.RoomServiceClient("http://127.0.0.1:" + p.livekit, process.env.GEMELO_DEV_LIVEKIT_CLAVE, process.env.GEMELO_DEV_LIVEKIT_SECRETO);
      const yo = HOGARES[0], vecino = HOGARES[1], mirlo = HOGARES[2], OFICINA = "oficina.p4@example.com";
      let idYo, nav;
      try { if (!SOLO_CARGA) {   // GEMELO_P4_SOLO_CARGA=1: solo la carga (para repetirla con otro N sin los navegadores)
        // una cuenta de la oficina (rol admin) para expulsar; sintética, como los hogares de prueba (@example.com)
        await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, 'admin', 'Oficina', false, true) ON CONFLICT (correo) DO UPDATE SET rol = 'admin', activo = true", [OFICINA]);
        idYo = Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [yo.correo])).rows[0].id);

        // una sesión por el camino de verdad: enlace mágico → buzón (Mailpit) → POST /api/auth/entrar → cookie
        const vistos = new Set();
        async function sesion(correo) {
          const busca = async () => (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + correo))).json()).messages || [];
          for (const m of await busca()) vistos.add(m.ID);
          const e = await pide("/api/auth/enlace", { method: "POST", body: JSON.stringify({ correo }) });
          assert.strictEqual(e.status, 202, "enlace para " + correo + ": " + e.status + " " + e.texto.slice(0, 120));
          let msg = null;
          for (let i = 0; i < 100 && !msg; i++) { msg = (await busca()).find(m => !vistos.has(m.ID)) || null; if (!msg) await espera(200); }
          assert.ok(msg, "el enlace de " + correo + " no llegó al buzón");
          vistos.add(msg.ID);
          const txt = (await (await fetch(buzon + "/api/v1/message/" + msg.ID)).json()).Text;
          const tok = (/\/api\/auth\/entrar\?t=([A-Za-z0-9_-]{43})/.exec(txt) || [])[1];
          assert.ok(tok, "sin token en el correo");
          const r = await pide("/api/auth/entrar", { method: "POST", body: JSON.stringify({ t: tok }) });
          assert.strictEqual(r.status, 200, "entrar: " + r.status + " " + r.texto.slice(0, 120));
          const c = [].concat(r.cabeceras["set-cookie"] || []).map(x => new RegExp("^" + COOKIE + "=([^;]+)").exec(x)).find(Boolean);
          assert.ok(c, "sin cookie de sesión");
          return c[1];
        }
        const ses = { yo1: await sesion(yo.correo), yo2: await sesion(yo.correo), vecino: await sesion(vecino.correo), mirlo: await sesion(mirlo.correo), oficina: await sesion(OFICINA) };
        const token = async (cookie, dispositivo = "escritorio") => { const r = await pide("/api/presencia/token", { method: "POST", cookie, body: JSON.stringify({ dispositivo }) }); return { status: r.status, cuerpo: JSON.parse(r.texto) }; };

        // ---- permisos reales del token: canPublish false + canPublishSources [] → el micrófono se rechaza; los datos, sí
        await t.test("LiveKit real: con canPublish false y canPublishSources vacío no se publica audio; datos sí; RemoveParticipant de quien no está", async tt => {
          const rtc = await import(pathToFileURL(path.join(HERR, "node_modules", "@livekit", "rtc-node", "dist", "index.js")).href);
          const tk = await token(ses.mirlo);
          assert.strictEqual(tk.status, 200, JSON.stringify(tk.cuerpo));
          assert.strictEqual(tk.cuerpo.url, "/rtc", "la api da la ruta del mismo origen");
          const sala = new rtc.Room();
          await sala.connect("ws://127.0.0.1:" + p.livekit, tk.cuerpo.token, { autoSubscribe: false, dynacast: false });
          try {
            const pr = (await rs.listParticipants(SALA)).find(x => x.identity === tk.cuerpo.identidad);
            assert.ok(pr, "el participante está en la sala");
            const perm = pr.permission;
            tt.diagnostic("permiso según el servidor: " + JSON.stringify({ canPublish: perm.canPublish, canPublishData: perm.canPublishData, canPublishSources: perm.canPublishSources, canSubscribe: perm.canSubscribe, canUpdateMetadata: perm.canUpdateMetadata, hidden: perm.hidden }));
            assert.strictEqual(perm.canPublish, false); assert.strictEqual(perm.canPublishData, true); assert.deepStrictEqual([...perm.canPublishSources], []);
            await sala.localParticipant.publishData(new Uint8Array([1, 2, 3]), { reliable: true, topic: "prueba" });
            const fuente = new rtc.AudioSource(48000, 1), pista = rtc.LocalAudioTrack.createAudioTrack("micro", fuente);
            let rechazo = null;
            try { await Promise.race([sala.localParticipant.publishTrack(pista, new rtc.TrackPublishOptions({ source: rtc.TrackSource.SOURCE_MICROPHONE })), espera(15000).then(() => { throw new Error("sin respuesta en 15 s"); })]); }
            catch (e) { rechazo = String(e && e.message || e); }
            tt.diagnostic("publicar un micrófono: " + (rechazo ? "rechazado (" + rechazo.slice(0, 160) + ")" : "ACEPTADO"));
            assert.ok(rechazo, "LiveKit debía rechazar la pista de audio (canPublish false)");
            const tras = (await rs.listParticipants(SALA)).find(x => x.identity === tk.cuerpo.identidad);
            assert.strictEqual((tras.tracks || []).length, 0, "ninguna pista publicada");
            await fuente.close?.();
          } finally { await sala.disconnect(); }
          // RemoveParticipant de alguien que no está: ¿404 / not_found? (lo usa ModeradorLiveKit)
          let err = null;
          try { await rs.removeParticipant(SALA, "h_" + "x".repeat(22) + "_nadie123"); } catch (e) { err = e; }
          tt.diagnostic("RemoveParticipant de quien no está: " + (err ? "status " + err.status + ", code " + err.code + ", «" + String(err.message).slice(0, 80) + "»" : "sin error"));
          assert.ok(err && (err.status === 404 || err.code === "not_found"), "se esperaba 404/not_found");
          let errSala = null, lista = null;
          try { lista = await rs.listParticipants("sala-que-no-existe-p4"); } catch (e) { errSala = e; }
          tt.diagnostic("ListParticipants de una sala que no existe: " + (errSala ? "status " + errSala.status + ", code " + errSala.code : "lista de " + lista.length));
        });

        nav = await lanza();
        const ctxs = [];
        const LK_SRC = require("fs").readFileSync(path.join(RAIZ, "apps", "web", "node_modules", "livekit-client", "dist", "livekit-client.esm.mjs"), "utf8");
        const abre = async (cookie, ruta, { mide = true } = {}) => {
          const ctx = await nav.newContext({ viewport: { width: 480, height: 320 }, ignoreHTTPSErrors: true });
          ctxs.push(ctx);
          await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
          await ctx.addInitScript(m => { window.__presenciaMide = m; window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); }, mide);
          const pg = await ctx.newPage(), errores = [], tokens = [];
          pg.on("pageerror", e => errores.push(String(e).slice(0, 300)));
          pg.on("console", m => { if (m.type() === "error") errores.push(m.text().slice(0, 300)); });
          pg.on("request", r => { if (r.url().includes("/api/presencia/token")) tokens.push(r.url()); });
          if (ruta) {
            await pg.goto(base + ruta);
            await pg.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 300000, polling: 1000 });
          }
          return { ctx, pg, errores, tokens, est: () => pg.evaluate(() => window.__presencia()) };
        };
        const cierra = async s => { const i = ctxs.indexOf(s.ctx); if (i >= 0) ctxs.splice(i, 1); await s.ctx.close(); };
        // una página LIGERA (la portada, sin WebGL) con el MISMO livekit-client 2.22.4 del motor, el mismo token de la api y
        // la misma pose del contrato a 10 Hz: mide LiveKit + navegador sin el coste de dibujar el mundo con SwiftShader
        const PURO = (() => { const F = lee("apps/web/motor/26_presencia.js"); return "\"use strict\";\n" + F.slice(F.indexOf("// [puro:inicio]"), F.indexOf("// [puro:fin]")) + "\nreturn { PoseCodec: PoseCodec };"; })();
        const ligera = async cookie => {
          const s = await abre(cookie, null);
          await s.ctx.route(base + "/__p4/livekit-client.mjs", r => r.fulfill({ status: 200, contentType: "text/javascript", body: LK_SRC }));
          await s.pg.goto(base + "/");
          s.info = await s.pg.evaluate(async puro => {
            const LK = await import("/__p4/livekit-client.mjs");
            const r = await fetch("/api/presencia/token", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ dispositivo: "escritorio" }) });
            const t = await r.json();
            const room = new LK.Room({ adaptiveStream: false, dynacast: false }), S = window.__s = { room, l: [], enviados: 0, desconectado: null };
            room.on(LK.RoomEvent.DataReceived, (d, p, k, tema) => { if (tema === "pose" && p) S.l.push([p.identity, new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(4, true), performance.now()]); });
            room.on(LK.RoomEvent.Disconnected, m => { S.desconectado = m === undefined ? "?" : m; });
            await room.connect(new URL(t.url, location.href).href.replace(/^http/, "ws"), t.token, { autoSubscribe: false });
            const { PoseCodec } = new Function(puro)();
            S.emite = on => {
              clearInterval(S.int); if (!on) return;
              S.int = setInterval(() => {
                const ahora = performance.now(), a = ahora / 4000;
                room.localParticipant.publishData(PoseCodec.codifica({ tipo: 1, seq: S.enviados & 0xffff, t: Math.round(ahora) >>> 0, cab: { p: [Math.cos(a) * 10, 1.6, Math.sin(a) * 10], q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)] }, izq: null, der: null }), { reliable: false, topic: "pose" });
                S.enviados++;
              }, 100);
            };
            return { identidad: room.localParticipant.identity, origen: performance.timeOrigin };
          }, PURO);
          s.lee = () => s.pg.evaluate(() => { const S = window.__s; return { l: S.l.splice(0), enviados: S.enviados, desconectado: S.desconectado, estado: S.room.state }; });
          return s;
        };

        // ---- ¿abre Chrome ws://localhost:7880 desde una página https://localhost:8743? (P1-P3: sin verificar)
        await t.test("Chrome: ws://localhost:7880 desde https://localhost:8743 (y por el mismo origen, wss://localhost:8743/rtc)", async tt => {
          const s = await abre(ses.vecino, null);
          await s.pg.goto(base + "/");
          const tk = await token(ses.vecino);
          const prueba = url => s.pg.evaluate(u => new Promise(ok => {
            let w; try { w = new WebSocket(u); } catch (e) { ok("excepción: " + e.name + " " + e.message); return; }
            const fin = setTimeout(() => { try { w.close(); } catch (e) { /* nada */ } ok("sin respuesta en 8 s"); }, 8000);
            w.onopen = () => { clearTimeout(fin); w.close(); ok("abierto"); };
            w.onerror = () => { clearTimeout(fin); ok("error"); };
          }), url);
          const q = "/rtc?access_token=" + encodeURIComponent(tk.cuerpo.token) + "&auto_subscribe=0&protocol=16&sdk=js";
          const directo = await prueba("ws://localhost:" + p.livekit + q), mismo = await prueba("wss://localhost:" + p.https + "/rtc" + q);
          tt.diagnostic("ws://localhost:" + p.livekit + " desde " + base + ": " + directo + "; wss://localhost:" + p.https + "/rtc (Caddy): " + mismo);
          assert.strictEqual(mismo, "abierto", "por el mismo origen (Caddy → LiveKit) debe abrir");
          await cierra(s);
          await espera(1500);
        });

        // ---- transporte: dos páginas ligeras (dos hogares, dos contextos del mismo Chrome), pose a 10 Hz durante 20 s
        await t.test("transporte (livekit-client en dos páginas ligeras, mismo Chrome): la pose llega con p95 < 250 ms", async tt => {
          const V = await ligera(ses.vecino), M = await ligera(ses.mirlo);
          await espera(1500);
          await V.lee(); await M.lee();
          await V.pg.evaluate(() => window.__s.emite(true)); await M.pg.evaluate(() => window.__s.emite(true));
          const S = 20;
          await espera(S * 1000);
          await V.pg.evaluate(() => window.__s.emite(false)); await M.pg.evaluate(() => window.__s.emite(false));
          await espera(1000);
          const lv = await V.lee(), lm = await M.lee();
          const ret = retardos([[lv.l, V.info.origen], [lm.l, M.info.origen]], { [V.info.identidad]: V.info.origen, [M.info.identidad]: M.info.origen });
          const m = Object.assign(resumen(ret), { enviadas: { V: lv.enviados, M: lm.enviados }, perdidas: { MdeV: r1(100 * (1 - lm.l.length / Math.max(1, lv.enviados))) + " %", VdeM: r1(100 * (1 - lv.l.length / Math.max(1, lm.enviados))) + " %" } });
          tt.diagnostic("transporte " + S + " s: " + JSON.stringify(m) + " (mismo equipo y reloj de pared; Caddy → LiveKit --dev en Docker; sin WebGL)");
          await cierra(V); await cierra(M);
          assert.ok(ret.length > 300, "pocas muestras: " + ret.length);
          assert.ok(m.min > -5, "retardo negativo: relojes mal casados (" + m.min + " ms)");
          assert.ok(m.p95 < 250, "pose p95 = " + m.p95 + " ms (objetivo < 250 ms)");
        });

        // ---- el motor: dos hogares en /finca/?presencia=red
        let A, B, A2, V, eA, eB;
        await t.test("motor: dos hogares en la sala; en vista aérea (órbita) no se publica pose y el otro te lista «en vista aérea»", async tt => {
          A = await abre(ses.yo1, "/finca/?presencia=red"); B = await abre(ses.vecino, "/finca/?presencia=red");
          for (const s of [A, B]) await s.pg.waitForFunction(() => window.__presencia().conectado, null, { timeout: 120000, polling: 1000 });
          eA = await A.est(); eB = await B.est();
          assert.match(eA.identidad, /^h_[A-Za-z0-9_-]{22}_[A-Za-z0-9_-]{8}$/); assert.notStrictEqual(eA.identidad.slice(0, 24), eB.identidad.slice(0, 24));
          await espera(3000);
          const a = await A.est(), b = await B.est();
          assert.strictEqual(a.enVistaAerea, true); assert.strictEqual(a.enviados, 0, "en órbita no se publica pose"); assert.strictEqual(b.enviados, 0);
          assert.strictEqual(b.recibidos, 0); assert.strictEqual(b.vistos, 0, "no se dibuja a quien está en vista aérea");
          const gente = await B.pg.textContent("#presenciaGente");
          assert.match(gente, new RegExp(yo.alias + " · hogar · escritorio · en vista aérea"), "B lista a A en vista aérea: " + gente.slice(0, 200));
          tt.diagnostic("Gente en B: " + gente.replace(/\s+/g, " ").slice(0, 160));
        });

        await t.test("motor: paseando, cada una recibe la pose de la otra y dibuja su avatar (retardo con SwiftShader, solo informativo)", async tt => {
          await A.pg.click("#btnPaseo"); await B.pg.click("#btnPaseo");
          await A.pg.waitForFunction(() => window.__presencia().vistos >= 1, null, { timeout: 60000, polling: 1000 });
          await B.pg.waitForFunction(() => window.__presencia().vistos >= 1, null, { timeout: 60000, polling: 1000 });
          const oA = (await A.pg.evaluate(() => window.__presencia("llegadas"))).origen, oB = (await B.pg.evaluate(() => window.__presencia("llegadas"))).origen;   // vacía lo de antes
          const iA = await A.est(), iB = await B.est(), fps0 = await A.pg.evaluate(() => window.__g.renderer.info.render.frame);
          const S = 20;
          await espera(S * 1000);
          const lA = await A.pg.evaluate(() => window.__presencia("llegadas")), lB = await B.pg.evaluate(() => window.__presencia("llegadas"));
          const fA = await A.est(), fB = await B.est(), fps1 = await A.pg.evaluate(() => window.__g.renderer.info.render.frame);
          const ret = retardos([[lA.l, oA], [lB.l, oB]], { [eA.identidad]: oA, [eB.identidad]: oB });
          const env = { A: fA.enviados - iA.enviados, B: fB.enviados - iB.enviados };
          const m = Object.assign(resumen(ret), { fpsA: r1((fps1 - fps0) / S), tasaHz: { A: r1(env.A / S), B: r1(env.B / S) }, perdidas: { BdeA: r1(100 * (1 - lB.l.length / Math.max(1, env.A))) + " %", AdeB: r1(100 * (1 - lA.l.length / Math.max(1, env.B))) + " %" } });
          tt.diagnostic("motor " + S + " s: " + JSON.stringify(m) + " (dos mundos con SwiftShader en la CPU: la pose sale y se atiende al ritmo de los fotogramas; NO es la cifra de red)");
          assert.ok(ret.length > 5, "pocas muestras: " + ret.length);
          assert.ok(fA.vistos >= 1 && fB.vistos >= 1, "cada una dibuja el avatar de la otra");
          assert.ok(m.min > -5, "retardo negativo: relojes mal casados (" + m.min + " ms)");
        });

        await t.test("motor: chat por el canal de datos, en los dos sentidos", async () => {
          const manda = async (s, txt) => { await s.pg.fill("#presenciaGente input[type=text]", txt); await s.pg.press("#presenciaGente input[type=text]", "Enter"); };
          await manda(A, "Hola desde A"); await espera(800); await manda(B, "Hola desde B");
          await B.pg.waitForFunction(a => document.querySelector("#presenciaGente ol").textContent.includes(a + ": Hola desde A"), yo.alias, { timeout: 30000, polling: 500 });
          await A.pg.waitForFunction(a => document.querySelector("#presenciaGente ol").textContent.includes(a + ": Hola desde B"), vecino.alias, { timeout: 30000, polling: 500 });
          for (const s of [A, B]) assert.deepStrictEqual(s.errores, [], "errores en la consola");
          const csp = [];
          for (const s of [A, B]) csp.push(...await s.pg.evaluate(() => window.__csp));
          assert.deepStrictEqual(csp, [], "la CSP (Report-Only, connect-src 'self') avisa de algo");
        });

        // ---- el mismo hogar desde otro aparato (otra sesión): entra sin echar al primero. El vecino pasa a una página ligera
        //      (tres mundos con SwiftShader a la vez no caben en este equipo)
        await t.test("mismo hogar en dos aparatos (dos sesiones) en el motor: identidades distintas con el prefijo del hogar; ninguno echa al otro", async () => {
          await cierra(B);
          V = await ligera(ses.vecino);
          await V.pg.evaluate(() => window.__s.emite(true));
          A2 = await abre(ses.yo2, "/finca/?presencia=red");
          await A2.pg.waitForFunction(() => window.__presencia().conectado, null, { timeout: 120000, polling: 1000 });
          await A2.pg.click("#btnPaseo");
          await A2.pg.waitForFunction(() => window.__presencia().vistos >= 2, null, { timeout: 60000, polling: 1000 });
          await A.pg.waitForFunction(() => window.__presencia().vistos >= 2, null, { timeout: 60000, polling: 1000 });
          const a = await A.est(), a2 = await A2.est();
          assert.strictEqual(a.conectado, true, "el primer aparato sigue dentro");
          assert.notStrictEqual(a2.identidad, a.identidad); assert.strictEqual(a2.identidad.slice(0, 24), a.identidad.slice(0, 24), "mismo prefijo de hogar");
          const enSala = (await rs.listParticipants(SALA)).map(x => x.identity);
          assert.ok(enSala.includes(a.identidad) && enSala.includes(a2.identidad) && enSala.includes(V.info.identidad), "los tres en la sala: " + enSala.join(", "));
        });

        await t.test("la oficina expulsa al hogar: salen sus DOS conexiones, el vecino sigue y no hay token nuevo", async tt => {
          const nErrores = new Map([A, A2].map(s => [s, s.errores.length]));
          const r = await pide("/api/admin/presencia/expulsar", { method: "POST", cookie: ses.oficina, body: JSON.stringify({ hogar_id: idYo, motivo: "prueba P4" }) });
          assert.strictEqual(r.status, 200, r.texto);
          assert.deepStrictEqual(JSON.parse(r.texto), { estaba_en_sala: true, conexiones: 2 });
          for (const s of [A, A2]) {
            await s.pg.waitForFunction(() => !window.__presencia().conectado, null, { timeout: 30000, polling: 500 });
            assert.match(await s.pg.textContent("#presenciaGente"), /La oficina te ha sacado/);
          }
          await espera(1500);
          const v = await V.lee();
          assert.deepStrictEqual([v.desconectado, v.estado], [null, "connected"], "el vecino sigue dentro");
          assert.deepStrictEqual((await rs.listParticipants(SALA)).map(x => x.identity), [V.info.identidad], "en la sala solo queda el vecino");
          for (const c of [ses.yo1, ses.yo2]) { const k = await token(c); assert.strictEqual(k.status, 403); assert.strictEqual(k.cuerpo.error, "expulsado"); }
          await A.pg.click("#presenciaGente button:has-text('Volver a entrar')");
          await A.pg.waitForFunction(() => /Podrás volver a entrar más tarde/.test(document.querySelector("#presenciaGente").textContent), null, { timeout: 20000, polling: 500 });
          const aud = (await bd.query("SELECT detalle FROM auditoria WHERE accion = 'admin.presencia_expulsado' ORDER BY id DESC LIMIT 1")).rows[0].detalle;
          assert.deepStrictEqual(aud, { hogar: idYo, sala: SALA, estaba: true, conexiones: 2, motivo: "prueba P4" });
          const otra = JSON.parse((await pide("/api/admin/presencia/expulsar", { method: "POST", cookie: ses.oficina, body: JSON.stringify({ hogar_id: idYo }) })).texto);
          assert.deepStrictEqual(otra, { estaba_en_sala: false, conexiones: 0 }, "expulsar a quien ya no está");
          tt.diagnostic("la expulsión dura 15 min en memoria de la api (Expulsados): el vencimiento lo prueba la unidad, no esta e2e");
          // al ser expulsado, livekit-client avisa de que se cierran sus canales y el navegador anota el 403 del token: es lo esperado
          const esperado = /DataChannel error on|data channel '.*' closed unexpectedly|status of 403/;
          for (const s of [A, A2]) assert.deepStrictEqual(s.errores.slice(nErrores.get(s)).filter(x => !esperado.test(x)).concat(s.errores.slice(0, nErrores.get(s))), [], "errores en la consola");
        });
        for (const c of ctxs.splice(0)) await c.close();

        await t.test("sin bandera y con ?presencia=sim todo sigue igual: ni token, ni panel, ni sala", async () => {
          const s0 = await abre(ses.vecino, "/finca/"), e0 = await s0.est();
          assert.strictEqual(e0.activo, false); assert.strictEqual(await s0.pg.$("#presenciaGente"), null); assert.deepStrictEqual(s0.tokens, []);
          const s1 = await abre(ses.vecino, "/finca/?presencia=sim");
          await espera(2000);
          const e1 = await s1.est();
          assert.strictEqual(e1.activo, true); assert.strictEqual(e1.variante, "sim"); assert.strictEqual(e1.n, 10);
          assert.strictEqual(await s1.pg.$("#presenciaGente"), null); assert.deepStrictEqual(s1.tokens, []);
          assert.deepStrictEqual([...s0.errores, ...s1.errores], []);
          for (const c of ctxs.splice(0)) await c.close();
        });
      } } finally {
        if (nav) await nav.close();
        await bd.end().catch(() => {});
      }

      // ---- carga: N clientes ligeros en Node en la misma sala, pose a 10 Hz a toda la sala
      await t.test("carga: " + N_CARGA + " clientes en Node (" + P_CARGA + " procesos) publican pose a 10 Hz durante " + S_CARGA + " s", { timeout: 900000 }, async tt => {
        const contenedor = comun.compose(["ps", "-q", "livekit"], { captura: true }).stdout.trim();
        const stats = () => new Promise(ok => execFile("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}};{{.MemUsage}}", contenedor], { encoding: "utf8" }, (e, out) => ok(e ? null : out.trim())));
        const mem = s => { const m = /^([\d.]+)\s*([KMG]i?B)/.exec(s.split(";")[1].trim()); return m ? Number(m[1]) * ({ KiB: 1 / 1024, MiB: 1, GiB: 1024, KB: 1 / 1000, MB: 1, GB: 1000 }[m[2]] || 1) : NaN; };
        const reposo = await stats();
        // P procesos con N/P clientes cada uno (_carga_presencia.mjs); hablan por líneas JSON
        const porProceso = Math.ceil(N_CARGA / P_CARGA), procs = [];
        const tC = Date.now();
        for (let i = 0; i < P_CARGA; i++) {
          const n = Math.min(porProceso, N_CARGA - i * porProceso); if (n <= 0) break;
          const h = spawn(process.execPath, [path.join(__dirname, "_carga_presencia.mjs")], { stdio: ["pipe", "pipe", "inherit"], env: Object.assign({}, process.env, {
            CARGA_URL: "ws://127.0.0.1:" + p.livekit, CARGA_CLAVE: process.env.GEMELO_DEV_LIVEKIT_CLAVE, CARGA_SECRETO: process.env.GEMELO_DEV_LIVEKIT_SECRETO,
            CARGA_SALA: SALA, CARGA_N: String(n), CARGA_DESDE: String(i * porProceso), CARGA_S: String(S_CARGA) }) });
          const pr = { h, eventos: [], esperando: [] };
          let resto = "";
          h.stdout.on("data", d => {
            resto += d; const l = resto.split("\n"); resto = l.pop();
            for (const x of l) { let o; try { o = JSON.parse(x); } catch (e) { continue; } if (!o.evento) continue; pr.eventos.push(o); pr.esperando.filter(w => w.ev === o.evento).forEach(w => w.ok(o)); }
          });
          pr.espera = ev => new Promise((ok, no) => { const ya = pr.eventos.find(o => o.evento === ev); if (ya) return ok(ya); pr.esperando.push({ ev, ok }); h.once("exit", c => no(new Error("el proceso de carga salió con " + c + " antes de «" + ev + "»"))); });
          procs.push(pr);
        }
        const con = await Promise.all(procs.map(pr => pr.espera("conectados")));
        const conexion = r1((Date.now() - tC) / 1000), fallos = procs.flatMap(pr => pr.eventos.filter(o => o.evento === "fallo"));
        await espera(3000);
        const enSala = (await rs.listParticipants(SALA)).length, nConectados = con.reduce((s, o) => s + o.n, 0);
        tt.diagnostic(nConectados + " clientes conectados en " + conexion + " s (" + con.map(o => r1(o.ms / 1000) + " s").join(", ") + " por proceso)" + (fallos.length ? "; fallos al conectar: " + JSON.stringify(fallos) : "") + "; en la sala según LiveKit: " + enSala + "; LiveKit en reposo: " + reposo);
        const muestras = [];
        let sigue = true;
        const sondeo = (async () => { while (sigue) { const s = await stats(); if (s) muestras.push(s); await espera(1000); } })();
        procs.forEach(pr => pr.h.stdin.write("empieza\n"));
        const fin = await Promise.all(procs.map(pr => pr.espera("fin")));
        sigue = false;
        await sondeo;
        await Promise.all(procs.map(pr => new Promise(ok => { if (pr.h.exitCode !== null) ok(); else pr.h.once("exit", ok); })));
        const env = fin.reduce((s, o) => s + o.enviados, 0), rec = fin.reduce((s, o) => s + o.recibidos, 0), esperado = env * (nConectados - 1);
        const ret = fin.flatMap(o => o.retardos), cpus = muestras.map(s => parseFloat(s.split(";")[0])), mems = muestras.map(mem);
        const r = {
          clientes: nConectados, procesos: procs.length, segundos: S_CARGA, enviadas: env, tasaPorCliente: r1(env / nConectados / S_CARGA) + " Hz", recibidas: rec, esperadas: esperado,
          perdidas: r1(100 * (1 - rec / esperado)) + " %", erroresAlPublicar: fin.reduce((s, o) => s + o.errores, 0),
          retardo: resumen(ret),
          livekit: { cpuMedia: r1(cpus.reduce((s, x) => s + x, 0) / cpus.length) + " %", cpuMax: r1(Math.max(...cpus)) + " %", memMaxMiB: r1(Math.max(...mems)), muestras: muestras.length },
          clientesCpu: fin.map(o => r1(o.cpuNucleo * 100) + " %").join(", ") + " de un núcleo por proceso",
        };
        tt.diagnostic("carga: " + JSON.stringify(r));
        tt.diagnostic("docker stats (CPU %; memoria) del contenedor de LiveKit, primera y última: " + muestras[0] + " | " + muestras[muestras.length - 1]);
        assert.strictEqual(nConectados, N_CARGA, "no se conectaron todos");
        assert.ok(rec / esperado > 0.9, "más de un 10 % de pérdidas: " + r.perdidas);
      });
    } finally {
      // el SDK de Node (FFI en Rust) mantiene vivo el proceso hasta que se libera
      try { await (await import(pathToFileURL(path.join(HERR, "node_modules", "@livekit", "rtc-node", "dist", "index.js")).href)).dispose(); } catch (e) { /* no se cargó */ }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
      else t.diagnostic("el entorno se deja levantado");
    }
  } finally { await sueltaTurno(); }
});
