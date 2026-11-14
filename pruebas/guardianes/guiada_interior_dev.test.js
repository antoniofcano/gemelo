"use strict";
// ADR-0036 (T9): la visita guiada compartida en los interiores, de punta a punta con TRES Chrome (una guía y dos familias, A y B) y micrófono simulado, contra el
// LiveKit y la api de infra/dev (Docker, PostGIS), con el cliente de verdad. Opcional: GEMELO_DOCKER=1; pide el turno del banco («docker+chrome») y lanza SU PROPIO
// Chrome con --use-fake-device-for-media-stream: con GEMELO_CHROME_WS se SALTA con aviso (se corre sola o por `proceso.js`). Sin la bandera, se salta.
// Los interiores son SINTÉTICOS (nunca los datos del eje B): una carpeta con «fabrica» (y un «patios» de relleno) hecha con el glb de modelos/interiores/ejemplo-luz (sus cuatro máquinas) y las
// tres paradas y las fuentes de modelos/interiores/ejemplo, en pruebas/salida/ (ignorada por git), que se pasa a Caddy por GEMELO_DEV_INTERIORES y sale en
// /teselas/hituelo/fabrica/pantalla/. Una guiada sintética (en 5 min); las tres entran por el botón de la agenda y salen a pie en el exterior (el fixture).
//   0. la ruta POST …/guiadas/<evento>/visita: una familia recibe 403; la guía, con la sala aún sin abrir en LiveKit, 409 sala_sin_abrir; un cuerpo mal formado, 400;
//   1. la guía y las dos familias, fuera, en la sala guiada-<evento>: cada una dibuja a las otras dos;
//   2. la guía entra en la fábrica y pulsa «Entrar con el grupo» (su panel; POST …/visita {mundo}): A y B reciben «La visita está en la fábrica [Ir] [Me quedo]»;
//      A pulsa «Ir» y entra; B pulsa «Me quedo»;
//   3. dentro, la guía y A se ven (en las coordenadas del interior); B no las dibuja, Gente dice «en la fábrica» y B sigue oyendo a la guía; fuera, B no tiene
//      ningún fantasma junto al origen de la finca (donde caería una pose de interior);
//   4. la guía lleva al grupo a la parada 1 («Llevar al grupo a la parada 1»): A recibe la oferta, pulsa «Ir», queda en el radio de la parada mirando al ancla,
//      con la ficha abierta y sin lectura automática; B, fuera, no recibe otro aviso;
//   5. «Máquinas para todos: paradas» y luego «en marcha»: igual en la guía y en A;
//   6. B entra también por su cuenta (tres dentro): se miden las llamadas y los triángulos de dibujo con tres personas dentro (SwiftShader: recuentos, no fps);
//   7. los tres salen al exterior a pie: nadie dibujado junto al origen de la finca, se ven de nuevo, la memoria de GPU vuelve (una
//      segunda vuelta no suma nada; la primera, acotada: el exterior carga por teselas y no es idéntico al de partida) y no hay errores de consola.
// No prueba: el sonido real (el micrófono es un pitido; «sin sitio» se deduce de que la guía no está dibujada para B, la ganancia no se expone), la altura de los
// avatares en el suelo de la zona (la pose no la expone el motor; solo x/y), los 15 de aforo, Quest ni iPhone, el cuarto navegador que llega tarde.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path, fs, chrome, playwright } = require("./_util");
const { motivoSalto, ARGS_CHROME } = require("./_navegador");
const { spawnSync } = require("child_process");

const HERR = path.join(RAIZ, "infra", "dev", "herramientas");
const SIN_DOCKER = (() => {
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.error || s.status !== 0 ? "el demonio de Docker no responde" : null;
})();
const SALTO = process.env.GEMELO_DOCKER !== "1" ? "e2e de la visita guiada en los interiores opcional (GEMELO_DOCKER=1): NO se ha comprobado contra LiveKit"
  : process.env.GEMELO_CHROME_WS ? "la visita guiada con tres Chrome necesita su propio Chrome con micrófono simulado (--use-fake-device-for-media-stream): correr sola, sin GEMELO_CHROME_WS"
  : SIN_DOCKER ? SIN_DOCKER + ": la e2e de la visita guiada en los interiores NO se ha comprobado" : motivoSalto("la visita guiada en los interiores con tres Chrome");
const COOKIE = "__Host-gemelo";
const ARGS_MICRO = ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"];
const espera = ms => new Promise(ok => setTimeout(ok, ms));
const hasta = async (fn, ms, que) => { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await fn(); if (v) return v; await espera(250); } throw new Error("no llegó a tiempo: " + que + " (último: " + JSON.stringify(v) + ")"); };
const lk = async fn => { for (let i = 0; ; i++) { try { return await fn(); } catch (e) { if (i < 4 && (e && (e.code === 23 || /timeout|aborted/i.test(String(e.message))))) { await espera(1500); continue; } throw e; } } };
const EJ = path.join(RAIZ, "modelos", "interiores");
const SALIDA = path.join(RAIZ, "pruebas", "salida", "interiores-visita-compartida");   // ignorada por git (pruebas/salida/); levanta.mjs solo admite ahí una carpeta dentro del repo
const ruido = /DataChannel error on (lossy|reliable): User-Initiated Abort|publisher data channel '[A-Z_]+' closed unexpectedly|could not find published track/;

/** La fábrica sintética: el glb de ejemplo-luz (máquinas) con las paradas y las fuentes de ejemplo; id «fabrica», aforo 15 (decisión 237) */
function escribeFabrica() {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  const dir = path.join(SALIDA, "fabrica", "pantalla"), luz = JSON.parse(fs.readFileSync(path.join(EJ, "ejemplo-luz", "mundo.json"), "utf8")), ej = JSON.parse(fs.readFileSync(path.join(EJ, "ejemplo", "mundo.json"), "utf8"));
  const m = Object.assign({}, luz, { id: "fabrica", aforo: 15, paradas: ej.paradas, fuentes: ej.fuentes });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "mundo.json"), JSON.stringify(m)); fs.copyFileSync(path.join(EJ, "ejemplo-luz", m.glb), path.join(dir, m.glb));
  // «patios» (el ejemplo con ese id): nadie va, pero el cliente sondea qué interiores hay (precarga del portón) y un 404 se leería como error
  const dirP = path.join(SALIDA, "patios", "pantalla"), p = Object.assign({}, ej, { id: "patios" });
  fs.mkdirSync(dirP, { recursive: true });
  fs.writeFileSync(path.join(dirP, "mundo.json"), JSON.stringify(p)); fs.copyFileSync(path.join(EJ, "ejemplo", p.glb), path.join(dirP, p.glb));
  return m;
}

test("e2e T9: la visita guiada compartida en los interiores con tres Chrome (guía, A y B: entrar con el grupo, Ir / Me quedo, parada, máquinas, tres dentro, salir)", { timeout: 2400000 }, async t => {
  if (SALTO) return t.skip(SALTO);
  const MAN = escribeFabrica();
  process.env.GEMELO_DEV_INTERIORES = SALIDA;   // antes de levantar: levanta.mjs lo lee del entorno y lo monta en Caddy (el .env de infra/dev no manda: no pisa lo ya puesto)
  process.env.COMPOSE_PROJECT_NAME = process.env.COMPOSE_PROJECT_NAME || "gemelo-dev-vce";
  const sueltaTurno = await require("../banco/turno").pide("docker+chrome: guiada_interior_dev.test.js (T9)");
  try {
    const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
    const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs");
    const comun = await imp("_comun.mjs");
    const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
    const t0 = Date.now();
    await levanta({ sinBuild: process.env.GEMELO_SIN_BUILD === "1" });
    t.diagnostic("entorno arriba en " + Math.round((Date.now() - t0) / 1000) + " s (proyecto " + process.env.COMPOSE_PROJECT_NAME + ")");
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
      // el interior sintético sale por Caddy tras sesión: lo comprobamos más abajo con la sesión de la guía
      const GUIA = "guia.t9@example.com", FA = "a.t9@example.com", FB = "b.t9@example.com";
      for (const [c, rol, al] of [[GUIA, "guia", "Guía T9"], [FA, "hogar", "Ana T9"], [FB, "hogar", "Beto T9"]]) {
        await bd.query("INSERT INTO hogares (correo, rol, alias, alias_visible, activo) VALUES ($1, $2, $3, true, true) ON CONFLICT (correo) DO UPDATE SET rol = $2, activo = true", [c, rol, al]);
        correos.push(c);
      }
      const idDe = async c => Number((await bd.query("SELECT id FROM hogares WHERE correo = $1", [c])).rows[0].id);
      ev = Number((await bd.query("INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas, guia_id) VALUES ('Guiada T9 (e2e)', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 15, $1) RETURNING id", [await idDe(GUIA)])).rows[0].id);
      await bd.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado'), ($1, $3, 'apuntado')", [ev, await idDe(FA), await idDe(FB)]);
      const SALA = "guiada-" + ev, RUTA = "/api/presencia/guiadas/" + ev + "/visita";
      const vistos = new Set();
      async function sesion(correo) {
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
      const ses = { guia: await sesion(GUIA), a: await sesion(FA), b: await sesion(FB) };
      const visita = (cookie, cuerpo) => pide(RUTA, { method: "POST", cookie, body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) });

      await t.test("0. la ruta: la familia recibe 403, la guía 409 con la sala sin abrir y 400 con un cuerpo mal formado; el interior sintético sale por Caddy", async tt => {
        const f = await visita(ses.a, { mundo: "fabrica" });
        assert.strictEqual(f.status, 403, "una familia no mueve al grupo: " + f.status + " " + f.texto);
        const g = await visita(ses.guia, { mundo: "fabrica" });
        assert.strictEqual(g.status, 409, "sala sin abrir: " + g.status + " " + g.texto); assert.strictEqual(JSON.parse(g.texto).error, "sala_sin_abrir");
        const m = await visita(ses.guia, { mundo: "no-existe" }), v = await visita(ses.guia, {});
        assert.strictEqual(m.status, 400, "mundo desconocido: " + m.status); assert.strictEqual(v.status, 400, "cuerpo vacío: " + v.status);
        tt.diagnostic("403 familia · 409 " + JSON.parse(g.texto).error + " · 400 mundo desconocido y cuerpo vacío");
        const web = await pide("/teselas/hituelo/fabrica/pantalla/mundo.json", { cookie: ses.guia });
        assert.strictEqual(web.status, 200, "Caddy sirve el interior sintético: " + web.status); assert.strictEqual(JSON.parse(web.texto).id, "fabrica");
      });

      nav = await playwright().chromium.launch({ executablePath: chrome(), args: ARGS_CHROME.concat(ARGS_MICRO) });
      const abre = async (cookie, nombre) => {
        const ctx = await nav.newContext({ viewport: { width: 360, height: 240 }, ignoreHTTPSErrors: true, permissions: ["microphone"] });
        await ctx.addCookies([{ name: COOKIE, value: cookie, url: base, httpOnly: true, secure: true, sameSite: "Lax" }]);
        const pg = await ctx.newPage(), errores = [];
        pg.on("pageerror", e => errores.push(nombre + " PAGEERROR " + String(e.stack || e).slice(0, 300)));
        pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errores.push(nombre + " " + m.text().slice(0, 300)); });
        pg.on("response", r => { if (r.status() >= 400 && /\/teselas\//.test(r.url())) errores.push(nombre + " HTTP " + r.status() + " " + r.url().slice(0, 120)); });
        await pg.goto(base + "/finca/?presencia=red&olivos=0");
        await pg.waitForFunction(() => window.__g && window.__g.listo() && window.__agenda && window.__presencia, null, { timeout: 300000, polling: 1000 });
        // el inventario de la GPU (diagnóstico de la memoria): three, al subir una geometría o una textura, le pone una escucha «dispose» y se la quita al soltarla;
        // se engancha el addEventListener/removeEventListener del prototipo común (EventDispatcher) y se apunta quién la subió (las líneas de la pila) hasta que se suelta
        await pg.evaluate(() => {
          let pr = Object.getPrototypeOf(window.__g.scene); while (pr && !Object.prototype.hasOwnProperty.call(pr, "addEventListener")) pr = Object.getPrototypeOf(pr);
          const vivas = new Map(), add = pr.addEventListener, rem = pr.removeEventListener;
          const clase = o => o.isBufferGeometry ? "geo " + o.type : o.isTexture ? "tex " + (o.isRenderTargetTexture ? "rt" : o.isCanvasTexture ? "canvas" : o.isDataTexture ? "data" : o.isCompressedTexture ? "comprimida" : "img") + (o.name ? " " + o.name : "") : null;
          pr.addEventListener = function (t, f) {
            const c = t === "dispose" && clase(this);
            if (c && !vivas.has(this.uuid)) vivas.set(this.uuid, { c, pila: String(new Error().stack).split("\n").slice(2, 9).map(s => s.trim().replace(/https?:\/\/[^/]+/, "").slice(0, 110)).join(" < ") });
            return add.call(this, t, f);
          };
          pr.removeEventListener = function (t, f) { if (t === "dispose" && vivas.has(this.uuid)) vivas.delete(this.uuid); return rem.call(this, t, f); };
          // dónde cuelga cada una en la escena (la ruta de nombres del objeto que la usa), o «fuera de la escena»; y el tamaño de los lienzos
          const donde = () => {
            const r = new Map(), ruta = o => { const n = []; for (let p = o; p && n.length < 6; p = p.parent) n.push(p.name || p.type); return n.reverse().join("/"); };
            window.__g.scene.traverse(o => {
              if (o.geometry) r.set(o.geometry.uuid, ruta(o) + (o.visible ? "" : " (oculto)"));
              for (const mt of [].concat(o.material || [])) for (const k in mt) { const t = mt[k]; if (t && t.isTexture) r.set(t.uuid, ruta(o) + " ." + k); }
            });
            return r;
          };
          window.__invGeo = { foto: () => [...vivas.keys()], nuevas: antes => { const a = new Set(antes), d = donde(), m = {}; for (const [k, v] of vivas) if (!a.has(k)) { const c = v.c + " @ " + (d.get(k) || "fuera de la escena"); m[c] = (m[c] || 0) + 1; } return m; } };
          pr.addEventListener = (function (f0) { return function (t, f) { const r = f0.call(this, t, f); const v = vivas.get(this.uuid); if (v && this.isTexture && this.image && this.image.width && !v.tam) { v.tam = this.image.width + "×" + this.image.height; v.c += " " + v.tam; } return r; }; })(pr.addEventListener);
        });
        const llama = (f, a) => pg.evaluate(([n, a]) => Promise.resolve(window[n] ? window[n](a) : null), [f, a]);
        return { nombre, ctx, pg, errores, pres: () => llama("__presencia"), puntos: () => pg.evaluate(() => window.__presencia("puntos")), vis: a => llama("__visita", a), maq: a => llama("__maquinas", a),
          seg: a => llama("__seguimiento", a), voz: a => llama("__voz", a), gui: () => llama("__guiada"), int: () => llama("__interior"), gesto: () => pg.mouse.click(5, 5),
          pose: () => pg.evaluate(() => window.__g.paseoEstado()),
          mide: () => pg.evaluate(() => new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(() => { const i = window.__g.renderer.info; ok({ llamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures }); })))),
          aPie: (x, y, ang) => pg.evaluate(([x, y, a]) => window.__g.paseoEn(x, y, a), [x, y, ang]) };
      };
      const clic = (X, selector, texto) => X.pg.locator(selector, texto ? { hasText: texto } : undefined).first().evaluate(b => { b.click(); return true; });   // el clic del DOM: el panel cae fuera de un viewport de 360 × 240
      const entraPorLaAgenda = async X => {
        const visible = await X.pg.evaluate(() => { const b = document.getElementById("hudIco-agenda"); return !!(b && b.offsetParent); });
        if (visible) await X.pg.click("#hudIco-agenda"); else { await X.pg.click("#bMas"); await X.pg.locator("#hudMas button", { hasText: "Agenda" }).click(); }
        await X.pg.waitForSelector("#ventana-agenda [data-entra='" + ev + "']", { timeout: 60000 });
        await X.pg.click("#ventana-agenda [data-entra='" + ev + "']");
      };
      const abreVentanaGuia = async X => {
        if (await X.pg.evaluate(() => { const v = document.getElementById("ventana-guia"); return !!(v && v.offsetParent); })) return;
        const visible = await X.pg.evaluate(() => { const b = document.getElementById("hudIco-guia"); return !!(b && b.offsetParent); });
        if (visible) await X.pg.click("#hudIco-guia"); else { await X.pg.click("#bMas"); await X.pg.locator("#hudMas button", { hasText: "Visita guiada" }).click(); }
        await X.pg.waitForSelector("#ventana-guia button", { timeout: 30000 });
      };
      const ESQUINA = { G: [-130, -125, 0], A: [-127, -125, 0], B: [-124, -125, 0] };   // en el fixture, cerca de los olivos del escenario «cerca»
      const ORIGEN = (x, y) => Math.hypot(x, y);
      const sinFantasmas = async (X, que, minimo = 40) => {   // nadie dibujado junto al origen de la finca (donde caería una pose de interior sin traducir)
        const ps = await X.puntos(); const cerca = ps.filter(q => ORIGEN(q.x, q.y) < minimo);
        assert.deepStrictEqual(cerca, [], X.nombre + " (" + que + "): fantasma junto al origen de la finca: " + JSON.stringify(cerca));
      };
      const gente = async X => X.pg.evaluate(() => { const l = document.getElementById("presenciaListaGente"); return l ? [...l.querySelectorAll("li")].map(x => x.textContent) : []; });
      // la Cola puede no vaciarse nunca en una página con presencia (se mide aparte): se espera hasta 20 s a que lo haga y luego un par de segundos más, y se dice
      const asienta = async () => { await Promise.all(Xs.map(async X => { try { await hasta(async () => X.pg.evaluate(() => window.__g.Cola.pendientes() === 0), 20000, "cola vacía en " + X.nombre); } catch (e) { t.diagnostic(e.message); } })); await espera(2500); };
      const control = async que => { const m = {}; for (const X of Xs) { const q = await X.mide(), o = await X.pose(); m[X.nombre] = q.geometrias + "/" + q.texturas + " en " + Math.round(o.x) + "," + Math.round(o.y); } t.diagnostic("control de memoria (geometrías/texturas) " + que + ": " + JSON.stringify(m)); };
      const idDeX = async X => (await X.pres()).identidad;
      const sala = async () => (await lk(() => rs.listParticipants(SALA)));

      const G = await abre(ses.guia, "guía"), A = await abre(ses.a, "A"), B = await abre(ses.b, "B");
      const Xs = [G, A, B];
      let memAntes = null, idG, idA, idB;

      await t.test("1. las tres entran en guiada-<evento> por la agenda y, fuera, se ven", async tt => {
        for (const X of Xs) await entraPorLaAgenda(X);
        for (const X of Xs) await hasta(async () => { const e = await X.pres(); return e.sala === "guiada" && e.conectado && e.evento === ev && e; }, 120000, "la presencia en la guiada de " + X.nombre);
        await hasta(async () => (await sala()).length === 3, 30000, "tres participantes en " + SALA);
        idG = await idDeX(G); idA = await idDeX(A); idB = await idDeX(B);
        assert.ok(idG && idA && idB && new Set([idG, idA, idB]).size === 3);
        for (const X of Xs) { await X.gesto(); }
        for (const X of Xs) await X.aPie(...ESQUINA[X.nombre === "guía" ? "G" : X.nombre]);
        for (const X of Xs) await hasta(async () => (await X.pres()).vistos === 2 && (await X.puntos()).length === 2, 60000, X.nombre + " ve a las otras dos");
        for (const X of Xs) { const e = await X.pres(); assert.strictEqual(e.mundo, "exterior"); await sinFantasmas(X, "fuera, al empezar"); }
        // la guía abre su micrófono solo con el primer gesto (47_habla): las familias la oyen
        await hasta(async () => (await G.voz()).micro === "abierto", 30000, "el micrófono de la guía");
        for (const X of [A, B]) await hasta(async () => (await X.voz()).voces === 1, 45000, X.nombre + " oye a la guía");
        await asienta();
        memAntes = { G: await G.mide(), A: await A.mide(), B: await B.mide() };
        for (const X of Xs) X.invAntes = await X.pg.evaluate(() => window.__invGeo.foto());
        tt.diagnostic("memoria de GPU de partida " + JSON.stringify({ G: memAntes.G, A: memAntes.A, B: memAntes.B }));
      });

      await t.test("2. la guía entra en la fábrica y pulsa «Entrar con el grupo»: A y B reciben el aviso; A pulsa «Ir» y entra; B «Me quedo»", async tt => {
        const r = await G.pg.evaluate(() => window.__cambiaMundo("fabrica").then(r => ({ ok: r.ok, mundo: r.mundo, motivo: r.motivo })));
        assert.deepStrictEqual(r, { ok: true, mundo: "fabrica", motivo: undefined }, "la guía entra en la fábrica sintética (¿404 en Caddy?)");
        await hasta(async () => (await G.int()) && (await G.int()).colgado, 60000, "la fábrica colgada en la guía");
        await hasta(async () => (await G.gui()).mundo === "fabrica", 20000, "el panel de la guía sabe que está en la fábrica");
        await abreVentanaGuia(G);
        await clic(G, "#ventana-guia button", "Entrar con el grupo");
        for (const X of [A, B]) {
          await hasta(async () => { const s = await X.seg(); return s.oferta && s.oferta.tipo === "mundo" && s; }, 30000, "la oferta «La visita está en la fábrica» en " + X.nombre);
          assert.match(await X.pg.textContent("#guiadaSigue [role=status]"), /La visita está en la fábrica/);
          assert.deepStrictEqual(await X.pg.evaluate(() => [...document.querySelectorAll("#guiadaSigue button")].map(b => b.textContent)), ["Ir", "Me quedo", "Seguir al guía"]);
          assert.strictEqual((await X.seg()).seguir, false, "«Seguir al guía» apagado por defecto");
        }
        const meta = JSON.parse((await lk(() => rs.listRooms([SALA])))[0].metadata);
        assert.strictEqual(meta.mundo, "fabrica"); assert.strictEqual(meta.parada, null); tt.diagnostic("metadatos de la sala: " + JSON.stringify(meta));
        const tIr = Date.now();
        await clic(A, "#guiadaSigue button", "Ir");
        await hasta(async () => { const i = await A.int(); return i && i.colgado && (await A.pres()).mundo === "fabrica"; }, 90000, "A entra en la fábrica");
        tt.diagnostic("A pulsa «Ir» y está dentro en " + (Date.now() - tIr) + " ms (fundido de siempre y carga del glb)");
        await control("con A dentro (tras «Ir»)");
        await clic(B, "#guiadaSigue button", "Me quedo");
        const sb = await B.seg(); assert.strictEqual(sb.oferta, null); assert.strictEqual(sb.quedas, 1); assert.strictEqual((await B.pres()).mundo, "exterior");
      });

      const PARADA = k => [MAN.paradas[k].pos[0], -MAN.paradas[k].pos[2]];   // x este, y norte del interior (el glb lleva z hacia el sur)
      await t.test("3. dentro, la guía y A se ven en las coordenadas del interior; B no las dibuja, las tiene «en la fábrica» y oye a la guía; sin fantasmas fuera", async tt => {
        await A.aPie(1, 2.5, Math.PI); await G.aPie(-1, 2.5, 0);
        // la pose llega a 10 Hz y se interpola: se espera a que lo dibujado alcance lo real (si fuera con las coordenadas del exterior, nunca lo haría)
        const ve = async (X, de, otro) => { let d = Infinity; await hasta(async () => { const q = (await X.puntos()).find(z => z.id === de), o = await otro.pose(); d = q ? Math.hypot(q.x - o.x, q.y - o.y) : Infinity; return d < 0.6; }, 30000, X.nombre + " dibuja a su compañera donde está (a " + d + " m)"); return d; };
        const dA = await ve(G, idA, A), dG = await ve(A, idG, G);
        tt.diagnostic("posición dibujada frente a la real (m): guía ve a A " + dA.toFixed(2) + ", A ve a la guía " + dG.toFixed(2));
        assert.strictEqual((await G.puntos()).length, 1); assert.strictEqual((await A.puntos()).length, 1);
        await hasta(async () => (await B.pres()).vistos === 0 && (await B.puntos()).length === 0, 30000, "B no dibuja a nadie");
        await sinFantasmas(B, "con la guía y A dentro", 60);
        const g = await hasta(async () => { const l = await gente(B); return l.filter(x => /en la fábrica/.test(x)).length >= 2 && l; }, 30000, "Gente de B dice «en la fábrica»").catch(e => e);
        if (g instanceof Error) throw new Error(g.message + " · Gente: " + JSON.stringify(await gente(B)));
        tt.diagnostic("Gente de B: " + JSON.stringify(g));
        assert.ok(g.some(x => /Guía T9/.test(x) && /en la fábrica/.test(x)) && g.some(x => /Ana T9/.test(x) && /en la fábrica/.test(x)));
        assert.ok(!g.some(x => /Ir con/.test(x)), "no se ofrece «Ir con» a quien no se dibuja");
        assert.strictEqual((await B.voz()).voces, 1, "B sigue oyendo a la guía (voz sin sitio: no hay dónde ponerla)");
        assert.strictEqual((await A.voz()).voces, 1, "A oye a la guía");
        tt.diagnostic("Gente de la guía: " + JSON.stringify(await gente(G)));
      });

      await t.test("4. la guía lleva al grupo a la parada 1: A recibe la oferta, pulsa «Ir» y queda en el radio mirando al ancla, con la ficha abierta y sin lectura automática", async tt => {
        const lecAntes = (await A.vis()).lecturas;
        await hasta(async () => (await G.pg.$("#visitaMuseo button[data-accion='lleva:0']")), 20000, "los botones «Llevar al grupo» de la guía");
        await clic(G, "#visitaMuseo button[data-accion='lleva:0']");
        const s = await hasta(async () => { const x = await A.seg(); return x.oferta && x.oferta.tipo === "parada" && x; }, 30000, "la oferta de la parada en A");
        assert.match(await A.pg.textContent("#guiadaSigue [role=status]"), /El guía va a la parada 1 · Una sala inventada/);
        assert.strictEqual(s.oferta.k, 0);
        const meta = JSON.parse((await lk(() => rs.listRooms([SALA])))[0].metadata); assert.strictEqual(meta.parada, 0); assert.strictEqual(meta.mundo, "fabrica");
        await clic(A, "#guiadaSigue button", "Ir");
        await hasta(async () => (await A.vis()).abierta === 0, 30000, "la ficha de la parada 1 abierta en A");
        await espera(2500);   // acaba el fundido: la pose final
        const pa = PARADA(0), q = await A.pose(), d = Math.hypot(q.x - pa[0], q.y - pa[1]);
        const ancla = MAN.paradas[0].ancla.pos, esperado = Math.atan2(ancla[0] - q.x, -ancla[2] - q.y), difAng = Math.abs(((q.ang - esperado + Math.PI * 3) % (2 * Math.PI)) - Math.PI);
        tt.diagnostic("A en la parada 1: a " + d.toFixed(2) + " m de la parada (radio " + MAN.paradas[0].radio + " m, anillo de puestos), rumbo " + q.ang.toFixed(2) + " frente a " + esperado.toFixed(2) + " (dif " + difAng.toFixed(2) + " rad)");
        assert.ok(d <= MAN.paradas[0].radio + 0.9, "dentro del radio de la parada (y su anillo): " + d);
        assert.ok(difAng < 0.35, "mirando al ancla: " + difAng);
        assert.match(await A.pg.textContent("#visitaMuseo h3"), /1\. Una sala inventada/, "la ficha, abierta");
        const v = await A.vis(); assert.strictEqual(v.lecturas, lecAntes, "sin lectura automática en la guiada"); assert.strictEqual(v.voz && v.voz.estado !== "leyendo", true);
        await control("A en la parada 1");
        assert.strictEqual((await B.seg()).oferta, null, "B, fuera, no recibe otro aviso por el cambio de parada"); assert.strictEqual((await B.pres()).mundo, "exterior");
      });

      await t.test("5. «Máquinas para todos: paradas» y luego «en marcha»: igual en la guía y en A", async tt => {
        const estados = async () => ({ g: await G.maq(), a: await A.maq() });
        const e0 = await estados(); assert.ok(e0.g.maquinas === 4 && e0.a.maquinas === 4, "la fábrica sintética lleva las 4 máquinas de ejemplo-luz");
        await abreVentanaGuia(G);
        await clic(G, "#ventana-guia button", "Máquinas para todos: paradas");
        const p = await hasta(async () => { const x = await estados(); return !x.g.enMarcha && !x.a.enMarcha && x; }, 30000, "paradas en la guía y en A");
        tt.diagnostic("paradas: guía «" + p.g.texto + "» · A «" + p.a.texto + "» (mando " + p.a.mando + ")");
        assert.strictEqual(p.a.mando, "grupo", "A obedece al grupo (no es «reducir movimiento»)"); assert.match(p.g.texto, /Máquinas para todos: paradas/);
        const meta = JSON.parse((await lk(() => rs.listRooms([SALA])))[0].metadata); assert.strictEqual(meta.maquinas.marcha, false); assert.ok(meta.maquinas.desde > 0);
        await clic(G, "#ventana-guia button", "Máquinas para todos: en marcha");
        const m = await hasta(async () => { const x = await estados(); return x.g.enMarcha && x.a.enMarcha && x; }, 30000, "en marcha en la guía y en A");
        tt.diagnostic("en marcha: guía «" + m.g.texto + "» · A «" + m.a.texto + "»");
        assert.match(m.g.texto, /Máquinas para todos: en marcha/);
        const meta2 = JSON.parse((await lk(() => rs.listRooms([SALA])))[0].metadata); assert.strictEqual(meta2.maquinas.marcha, true); assert.ok(meta2.n > meta.n);
        assert.ok((await A.pg.$("#maquinasInterior button")), "A tiene su interruptor «Parar para mí»");
        await control("tras las máquinas");
      });

      await t.test("6. B entra también: con tres dentro, las llamadas y los triángulos de dibujo (SwiftShader: recuentos)", async tt => {
        // en fila sobre el eje este-oeste, mirándose: la guía y A se ven entre sí; con B en medio, cada una ve a las otras dos (el recuento depende de lo que cae en la cámara)
        await G.aPie(-2, 2.5, Math.PI / 2); await A.aPie(2, 2.5, 3 * Math.PI / 2); await espera(3000);
        const sin = { G: await G.mide(), A: await A.mide() };
        const r = await B.pg.evaluate(() => window.__cambiaMundo("fabrica").then(r => ({ ok: r.ok, mundo: r.mundo })));
        assert.deepStrictEqual(r, { ok: true, mundo: "fabrica" });
        await hasta(async () => (await B.int()).colgado, 60000, "la fábrica en B"); await B.aPie(0, 2.5, Math.PI / 2);
        for (const X of Xs) await hasta(async () => (await X.pres()).vistos === 2 && (await X.puntos()).length === 2, 60000, X.nombre + " ve a las otras dos dentro");
        for (const X of Xs) assert.strictEqual((await X.pres()).mundo, "fabrica");
        await espera(3000);
        const con = { G: await G.mide(), A: await A.mide(), B: await B.mide() };
        tt.diagnostic("dibujo con dos dentro (guía, A): " + JSON.stringify(sin) + " · con tres dentro: " + JSON.stringify(con) + " · interior de B: " + JSON.stringify({ triangulos: (await B.int()).triangulos, llamadas: (await B.int()).llamadas }));
        assert.ok(con.G.llamadas >= sin.G.llamadas && con.G.llamadas - sin.G.llamadas <= 12, "una persona más cuesta pocas llamadas (muñecos instanciados): " + (con.G.llamadas - sin.G.llamadas));
        // por su cuenta, B entra donde ya está la visita (en la parada 1): se le dice dónde está (alEntraMundo), sin llevarlo; «Me quedo» lo quita
        const m = await hasta(async () => { const x = await B.seg(); return x.oferta && x; }, 15000, "B, que entra por su cuenta donde ya está la visita, sabe en qué parada está");
        assert.deepStrictEqual([m.oferta.tipo, m.oferta.k], ["parada", 0]); assert.strictEqual((await B.vis()).abierta, -1, "no se le abre ninguna ficha ni se le mueve");
        await clic(B, "#guiadaSigue button", "Me quedo"); assert.strictEqual((await B.seg()).oferta, null);
      });

      await t.test("7. los tres salen al exterior a pie: sin fantasmas, se ven de nuevo, la memoria de GPU vuelve y no hay errores", async tt => {
        await control("dentro los tres");
        for (const X of Xs) await X.aPie(0, 0.2, Math.PI);
        for (const X of Xs) await hasta(async () => { const i = await X.int(); return i && i.liberado && (await X.pres()).mundo === "exterior"; }, 90000, X.nombre + " de vuelta en el exterior");
        await control("recién fuera");
        for (const X of Xs) await X.aPie(...ESQUINA[X.nombre === "guía" ? "G" : X.nombre]);
        for (const X of Xs) await hasta(async () => (await X.pres()).vistos === 2 && (await X.puntos()).length === 2, 60000, X.nombre + " ve a las otras dos otra vez");
        for (const X of Xs) await sinFantasmas(X, "al volver");
        await asienta();
        const mem = { G: await G.mide(), A: await A.mide(), B: await B.mide() };
        tt.diagnostic("memoria de GPU al volver " + JSON.stringify(mem));
        await espera(8000);
        const mem2 = { G: await G.mide(), A: await A.mide(), B: await B.mide() };
        tt.diagnostic("memoria de GPU 8 s después " + JSON.stringify(mem2));
        const nuevas = {};
        for (const X of Xs) { nuevas[X.nombre] = await X.pg.evaluate(a => window.__invGeo.nuevas(a), X.invAntes); tt.diagnostic("geometrías y texturas subidas tras la partida y aún vivas en " + X.nombre + " (qué @ dónde cuelga: cuántas): " + JSON.stringify(nuevas[X.nombre])); }
        // segunda vuelta (entrar en la fábrica y salir otra vez): lo que sea carga perezosa se queda igual; una fuga sigue creciendo
        for (const X of Xs) { const r = await X.pg.evaluate(() => window.__cambiaMundo("fabrica").then(r => r.ok)); assert.ok(r); }
        for (const X of Xs) await hasta(async () => (await X.int()).colgado, 60000, "otra vez dentro en " + X.nombre);
        await espera(2000);
        for (const X of Xs) await X.aPie(0, 0.2, Math.PI);
        for (const X of Xs) await hasta(async () => { const i = await X.int(); return i && i.liberado && (await X.pres()).mundo === "exterior"; }, 90000, X.nombre + " fuera otra vez");
        for (const X of Xs) await X.aPie(...ESQUINA[X.nombre === "guía" ? "G" : X.nombre]);
        await asienta();
        const mem3 = { G: await G.mide(), A: await A.mide(), B: await B.mide() };
        tt.diagnostic("memoria de GPU tras la segunda vuelta " + JSON.stringify(mem3));
        for (const k of ["G", "A", "B"]) assert.deepStrictEqual({ g: mem3[k].geometrias, t: mem3[k].texturas }, { g: mem2[k].geometrias, t: mem2[k].texturas }, "la segunda vuelta no suma memoria de GPU en " + k + " (no hay fuga)");
        // La primera vuelta frente a la partida no es comparable en número: el exterior que se recarga al volver no es idéntico al de partida (la carga por teselas
        // varía; la partida de la guía varió entre 86 y 93 geometrías en cinco pasadas). El inventario de subidas a la GPU (arriba) lo explicó el 2026-11-14: lo que A
        // tenía de más (+17..+28 geometrías, +4..+5 texturas) colgaba todo de la escena del exterior (puntos y mallas de «arboles», carteles de haza, un sprite): contenido
        // cargado, no restos del interior. Por eso aquí se comprueba lo que sí sería una fuga: ninguna geometría subida tras la partida sigue viva FUERA de la escena, y
        // fuera de ella solo queda alguna textura de datos de tesela (258 × 258, en los tres por igual: la caché del exterior). La prueba exacta de fuga es la segunda vuelta.
        for (const X of Xs) {
          const fuera = Object.entries(nuevas[X.nombre]).filter(([c]) => / @ fuera de la escena$/.test(c));
          const geoFuera = fuera.filter(([c]) => /^geo /.test(c)), texFuera = fuera.filter(([c]) => /^tex /.test(c) && !/^tex data 258×258 /.test(c));
          assert.deepStrictEqual(geoFuera.concat(texFuera), [], "en " + X.nombre + ", nada de lo subido tras la partida queda vivo fuera de la escena (sería una fuga)");
          const datos = fuera.filter(([c]) => /^tex data 258×258 /.test(c)).reduce((n, [, k]) => n + k, 0);
          assert.ok(datos <= 2, "en " + X.nombre + ", texturas de tesela fuera de la escena: " + datos);
        }
        for (const s of await rs.listRooms()) assert.ok(!s.activeRecording, "sin grabación en " + s.name);
        assert.deepStrictEqual(Xs.flatMap(X => X.errores).filter(x => !ruido.test(x)), [], "errores de consola o de página");
      });
    } finally {
      if (nav) await nav.close().catch(() => {});
      if (bd) {
        if (ev) await bd.query("DELETE FROM visitas WHERE id = $1", [ev]).catch(() => {});
        await bd.query("DELETE FROM hogares WHERE correo = ANY($1)", [correos.filter(c => c !== "guia.t9@example.com")]).catch(() => {});
        await bd.end().catch(() => {});
      }
      if (!antes && process.env.GEMELO_DEJA_ARRIBA !== "1") { para(); t.diagnostic("entorno bajado (el volumen de la db se conserva)"); }
      if (process.env.GEMELO_DEJA_ARRIBA !== "1") fs.rmSync(SALIDA, { recursive: true, force: true });
    }
  } finally { await sueltaTurno(); }
});
