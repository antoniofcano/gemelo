"use strict";
// La portada con llaves de acceso (OF13b-7, ADR-0029; doc/sistema/LLAVES-DE-ACCESO.md §3, UX.md §4.2b). Siempre, y sin Chrome ni red:
//  - piezas puras (apps/web/portada/llave_puro.js): cuándo se ofrece crear una llave, el recuerdo de «Ahora no» y «No es mío», destinos, textos;
//  - el flujo (llave_flujo.js) con `fetch` y la librería de WebAuthn DE MENTIRA: entrar (feliz, un solo error genérico, abortar la ceremonia
//    ANTES de pedir otras opciones, autorrelleno que no molesta, sin soporte), la oferta (no desde gafas, ni con «ahora no»), el alta y la baja;
//  - estática: textos y ids de la pantalla, nada en línea ni de otro origen, rutas del contrato, @simplewebauthn/browser (regla 12) y carga perezosa.
// Opcional (GEMELO_DOCKER=1): el recorrido completo en Chrome con el AUTENTICADOR VIRTUAL de CDP contra infra/dev: primer enlace → oferta →
// crear llave → salir → entrar con la llave. ESCRITO SIN EJECUTAR. Ninguna llave real (Windows Hello, iPhone, Android, QR, llave física) se prueba aquí.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, chrome, playwright, python, fs, path } = require("./_util");

const html = lee("apps/web/portada/index.html"), js = lee("apps/web/portada/portada.js"), flujoSrc = lee("apps/web/portada/llave_flujo.js"), puroSrc = lee("apps/web/portada/llave_puro.js");
const css = lee("apps/web/portada/portada.css");
const carga = f => import(pathToFileURL(path.join(RAIZ, "apps", "web", "portada", f)).href);
const sinEtiquetas = s => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const seccion = id => { const m = new RegExp('<section[^>]*id="' + id + '"[\\s\\S]*?</section>').exec(html); assert.ok(m, id); return m[0]; };

// ——— piezas puras ———
test("puro: cuándo se ofrece crear una llave (solo tras un enlace, titular, sin gafas, sin oficina, con soporte y sin recuerdo)", async () => {
  const P = await carga("llave_puro.js");
  const ok = { sesion: { entrada: "enlace", titular: true, primer_acceso: false, rol: "hogar" }, llaves: { puede_anadir: true }, soporte: true, recuerdo: { tipo: "nada" } };
  assert.strictEqual(P.debeOfrecer(ok), true);
  const sin = c => P.debeOfrecer(Object.assign({}, ok, c));
  assert.strictEqual(sin({ sesion: { ...ok.sesion, entrada: "codigo", titular: false } }), false, "desde unas gafas, nunca");
  assert.strictEqual(sin({ sesion: { ...ok.sesion, entrada: "llave" } }), false, "entró con una llave: ya la tiene");
  assert.strictEqual(sin({ sesion: { ...ok.sesion, titular: false } }), false);
  assert.strictEqual(sin({ sesion: { ...ok.sesion, primer_acceso: true } }), false, "primero las normas");
  assert.strictEqual(sin({ sesion: { ...ok.sesion, rol: "oficina" } }), false, "la oficina tiene su pantalla de la llave");
  assert.strictEqual(sin({ sesion: { ...ok.sesion, rol: "admin" } }), false);
  assert.strictEqual(sin({ soporte: false }), false);
  assert.strictEqual(sin({ llaves: { puede_anadir: false } }), false, "tope de llaves o cuenta que no puede");
  assert.strictEqual(sin({ llaves: null }), false);
  for (const tipo of ["ahora_no", "nunca", "hecha"]) assert.strictEqual(sin({ recuerdo: { tipo } }), false, tipo);
  assert.strictEqual(sin({ sesion: null }), false);
});

test("puro: el recuerdo de «Ahora no» (30 días), «Este aparato no es mío» (siempre) y lo estropeado", async () => {
  const P = await carga("llave_puro.js"), AHORA = Date.UTC(2026, 10, 2);
  assert.strictEqual(P.DIAS_AHORA_NO, 30);
  assert.deepStrictEqual(P.leeRecuerdo(null, AHORA), { tipo: "nada", hasta: 0 });
  const ahoraNo = P.recuerdoDe("ahora_no", AHORA);
  assert.strictEqual(P.leeRecuerdo(ahoraNo, AHORA + 29 * 86400000).tipo, "ahora_no", "a los 29 días sigue sin preguntar");
  assert.strictEqual(P.leeRecuerdo(ahoraNo, AHORA + 30 * 86400000 + 1).tipo, "nada", "a los 30 días vuelve a ofrecerse");
  assert.strictEqual(P.leeRecuerdo(P.recuerdoDe("nunca", AHORA), AHORA + 3650 * 86400000).tipo, "nunca", "nunca caduca");
  assert.strictEqual(P.leeRecuerdo(P.recuerdoDe("hecha", AHORA), AHORA).tipo, "hecha");
  assert.strictEqual(P.recuerdoDe("otra", AHORA), null);
  for (const malo of ["{", "[]", "3", '{"v":2,"t":"nunca"}', '{"v":1,"t":"ahora_no","hasta":"x"}', '{"v":1,"t":"raro"}']) assert.strictEqual(P.leeRecuerdo(malo, AHORA).tipo, "nada", malo);
  assert.ok(!/token|secret|clave_p/i.test(P.recuerdoDe("nunca", AHORA)), "solo comodidad, nada secreto");
});

test("puro: destinos seguros, mis llaves solo con sesión titular, tiempos y textos sin jerga", async () => {
  const P = await carga("llave_puro.js");
  assert.strictEqual(P.destinoSeguro("/finca/"), "/finca/");
  assert.strictEqual(P.destinoSeguro("/#bienvenida"), "/#bienvenida");
  assert.strictEqual(P.destinoSeguro("/oficina/"), "/oficina/");
  for (const malo of ["//otro.example/", "https://otro.example/", "javascript:alert(1)", "finca", "", null, undefined, 3]) assert.strictEqual(P.destinoSeguro(malo), null, String(malo));
  assert.strictEqual(P.anclaDeDestino("/#bienvenida"), "bienvenida");
  assert.strictEqual(P.anclaDeDestino("/finca/"), null);
  assert.strictEqual(P.muestraMisLlaves({ titular: true, entrada: "enlace" }), true);
  assert.strictEqual(P.muestraMisLlaves({ titular: true, entrada: "llave" }), true);
  assert.strictEqual(P.muestraMisLlaves({ titular: false, entrada: "codigo" }), false, "no desde las gafas");
  assert.strictEqual(P.muestraMisLlaves(null), false);
  const AHORA = Date.parse("2026-11-02T12:00:00Z");
  assert.strictEqual(P.hace("2026-11-02T11:59:50Z", AHORA), "hace un momento");
  assert.strictEqual(P.hace("2026-11-02T11:00:00Z", AHORA), "hace 1 h");
  assert.strictEqual(P.hace("2026-11-01T12:00:00Z", AHORA), "hace 1 día");
  assert.strictEqual(P.hace("nada", AHORA), null);
  assert.match(P.resumenMiLlave({ creada_en: "2026-11-02T11:00:00Z", ultima_vez_en: null, sincronizada: true }, AHORA), /^creada hace 1 h · sin usar todavía · guardada también en tu cuenta del aparato$/);
  const l = { nombre: "Móvil de Ana" };
  assert.ok(!P.textoQuitar(l, 2).includes("enlace"), "con más llaves no hace falta recordar el enlace");
  assert.match(P.textoQuitar(l, 1), /Móvil de Ana[\s\S]*el enlace que te mandamos al correo/, "si es la última, el enlace sigue sirviendo");
  assert.match(P.TEXTO_ERROR_ENTRADA, /^No hemos podido entrar con esa llave\. Prueba otra vez o recibe un enlace por correo\.$/);
  assert.strictEqual(P.TEXTO_AVISO_APARATO, "Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta.");
  assert.match(P.textoFalloAlta({ status: 409, json: { error: "demasiadas_llaves" } }), /máximo de llaves/);
  assert.match(P.textoFalloAlta({ status: 0 }), /No hemos podido conectar/);
  assert.match(P.textoFalloAlta({ status: 500, json: null }), /No hemos podido guardar la llave/);
  const todos = Object.entries(P).filter(([, v]) => typeof v === "string").map(([, v]) => v).join(" ") + puroSrc;
  assert.ok(!/passkey|WebAuthn|FIDO|credencial|autenticador|biom/i.test(todos.replace(/^\/\/.*$/gm, "").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), "sin jerga en los textos que lee una familia");
});

// ——— el flujo, con fetch y WebAuthn de mentira ———
/** Un banco de mentira: registra en orden lo que pasa (llamadas a la api y a la librería) y responde lo que se le diga. */
function banco({ soporte = true, autorrelleno = true, plataforma = true, respuestas = {}, memoria0 = null, agente = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131", ahora = Date.UTC(2026, 10, 2) } = {}) {
  const eventos = [], llamadas = [], guardado = { v: memoria0 };
  const rutas = Object.assign({
    "POST /api/auth/llave/opciones": { status: 200, json: { challenge: "c", rpId: "localhost", userVerification: "required", timeout: 60000 } },
    "POST /api/auth/llave": { status: 200, json: { ok: true, destino: "/finca/", primer_acceso: false } },
    "GET /api/yo/llaves": { status: 200, json: { llaves: [], maximo: 10, puede_anadir: true } },
    "POST /api/yo/llaves/opciones": { status: 200, json: { challenge: "r", rp: { name: "Cuarenta hazas" } } },
    "POST /api/yo/llaves": { status: 201, json: { id: 7, nombre: "Windows Hello de este ordenador" } },
  }, respuestas);
  const pide = async (metodo, ruta, cuerpo) => {
    const k = metodo + " " + (ruta.startsWith("/api/yo/llaves/") && metodo === "DELETE" ? "/api/yo/llaves/:id" : ruta);
    eventos.push(k); llamadas.push({ metodo, ruta, cuerpo });
    const r = rutas[k];
    if (r instanceof Error) throw r;
    if (typeof r === "function") return r({ metodo, ruta, cuerpo });
    assert.ok(r, "ruta no prevista en la prueba: " + k);
    return r;
  };
  const lib = {
    browserSupportsWebAuthn: () => soporte,
    browserSupportsWebAuthnAutofill: async () => autorrelleno,
    platformAuthenticatorIsAvailable: async () => plataforma,
    startAuthentication: async o => { eventos.push("startAuthentication" + (o.useBrowserAutofill ? "(condicional)" : "")); return (respuestas.__auth || (async () => ({ id: "cred", response: {} })))(o); },
    startRegistration: async o => { eventos.push("startRegistration"); return (respuestas.__reg || (async () => ({ id: "nueva", response: {} })))(o); },
    cancelCeremony: () => { eventos.push("cancelCeremony"); respuestas.__cancela?.(); },
  };
  const memoria = { lee: () => guardado.v, guarda: b => { guardado.v = b; } };
  return { eventos, llamadas, guardado, hechos: async () => (await import(pathToFileURL(path.join(RAIZ, "apps", "web", "portada", "llave_flujo.js")).href)).creaLlaves({ pide, lib, memoria, ahora: () => ahora, agente }) };
}

test("flujo: entrar con la llave sin escribir el correo (opciones → ceremonia → entrada → destino), abortando la ceremonia anterior ANTES de pedir opciones", async () => {
  const b = banco(), L = await b.hechos();
  const r = await L.entra();
  assert.deepStrictEqual(r, { ok: true, destino: "/finca/", primer_acceso: false });
  assert.deepStrictEqual(b.eventos, ["cancelCeremony", "POST /api/auth/llave/opciones", "startAuthentication", "POST /api/auth/llave"],
    "hallazgo de OF13b-5: pedir otras opciones pisa la cookie del reto; se aborta primero la ceremonia que hubiera");
  assert.deepStrictEqual(b.llamadas[0].cuerpo, {}, "las opciones se piden con {} (el contrato lo exige)");
  assert.deepStrictEqual(b.llamadas[1].cuerpo, { respuesta: { id: "cred", response: {} } });
  const g = banco({ respuestas: { "POST /api/auth/llave": { status: 200, json: { ok: true, destino: "/#bienvenida", primer_acceso: true } } } });
  assert.deepStrictEqual(await (await g.hechos()).entra(), { ok: true, destino: "/#bienvenida", primer_acceso: true });
});

test("flujo: UN solo texto de error para cualquier fallo (api, navegador, red, destino raro), sin distinguir causas", async () => {
  const P = await carga("llave_puro.js");
  const fallos = {
    "la api rechaza la llave (401)": { respuestas: { "POST /api/auth/llave": { status: 401, json: { error: "llave_no_valida", mensaje: "otra cosa" } } } },
    "límite (429)": { respuestas: { "POST /api/auth/llave": { status: 429, json: { error: "limite", mensaje: "Demasiados intentos" } } } },
    "las opciones fallan": { respuestas: { "POST /api/auth/llave/opciones": { status: 500, json: null } } },
    "sin red en las opciones": { respuestas: { "POST /api/auth/llave/opciones": new Error("red") } },
    "sin red en la entrada": { respuestas: { "POST /api/auth/llave": new Error("red") } },
    "la persona cancela": { respuestas: { __auth: async () => { const e = new Error("x"); e.name = "NotAllowedError"; throw e; } } },
    "el aparato no tiene llave": { respuestas: { __auth: async () => { const e = new Error("x"); e.name = "NotSupportedError"; throw e; } } },
    "un destino de otro sitio": { respuestas: { "POST /api/auth/llave": { status: 200, json: { ok: true, destino: "https://otro.example/", primer_acceso: false } } } },
    "sin soporte": { soporte: false },
  };
  for (const [que, o] of Object.entries(fallos)) {
    const r = await (await banco(o).hechos()).entra();
    assert.deepStrictEqual(r, { ok: false, texto: P.TEXTO_ERROR_ENTRADA }, que);
  }
  assert.ok(!/401|429|cancel|tiempo|PIN/.test(P.TEXTO_ERROR_ENTRADA));
});

test("flujo: sin soporte de WebAuthn no se llama a nada (solo queda el enlace) y el autorrelleno no se ofrece", async () => {
  const b = banco({ soporte: false }), L = await b.hechos();
  assert.strictEqual(L.soporte(), false);
  assert.strictEqual(await L.admiteAutorrelleno(), false);
  await L.entra();
  assert.deepStrictEqual(b.eventos, [], "ni opciones ni ceremonia");
  assert.strictEqual((await L.evalua({ entrada: "enlace", titular: true, primer_acceso: false, rol: "hogar" })).ofrecer, false);
  assert.strictEqual(banco({ autorrelleno: false }).hechos && await (await banco({ autorrelleno: false }).hechos()).admiteAutorrelleno(), false);
});

test("flujo: el botón sustituye al autorrelleno (solo un reto vivo) y el autorrelleno abortado no enseña ningún error", async () => {
  // el autorrelleno queda esperando a la persona; la ceremonia que lo sustituye lo aborta con AbortError
  let suelta; const espera = new Promise((ok, mal) => { suelta = mal; });
  const b = banco({ respuestas: { __auth: o => (o.useBrowserAutofill ? espera : Promise.resolve({ id: "cred", response: {} })) } });
  const L = await b.hechos();
  const cond = L.entra({ condicional: true });
  await new Promise(ok => setImmediate(ok));
  assert.deepStrictEqual(b.eventos, ["cancelCeremony", "POST /api/auth/llave/opciones", "startAuthentication(condicional)"]);
  const boton = L.entra();   // la persona pulsa el botón: cancela la ceremonia anterior antes de pedir otras opciones
  const e = new Error("abortada"); e.name = "AbortError"; e.code = "ERROR_CEREMONY_ABORTED"; suelta(e);
  assert.deepStrictEqual(await cond, { ok: false, obsoleta: true }, "el autorrelleno sustituido no molesta");
  assert.deepStrictEqual(await boton, { ok: true, destino: "/finca/", primer_acceso: false });
  assert.deepStrictEqual(b.eventos.slice(3, 5), ["cancelCeremony", "POST /api/auth/llave/opciones"], "cancela ANTES de pedir las segundas opciones");
  assert.strictEqual(b.eventos.filter(x => x === "POST /api/auth/llave").length, 1, "solo el botón llega a entrar");
  // un autorrelleno que falla por su cuenta no enseña el error genérico (la persona no ha hecho nada)
  const c = banco({ respuestas: { "POST /api/auth/llave/opciones": { status: 500, json: null } } });
  const r = await (await c.hechos()).entra({ condicional: true });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.silencioso, true);
  // al salir de la pantalla se aborta y un intento en vuelo queda obsoleto
  let suelta2; const espera2 = new Promise((ok, mal) => { suelta2 = mal; });
  const d = banco({ respuestas: { __auth: () => espera2 } }), L2 = await d.hechos();
  const colgado = L2.entra({ condicional: true });
  await new Promise(ok => setImmediate(ok));
  L2.paraEntrada(); suelta2(Object.assign(new Error("x"), { name: "AbortError" }));
  assert.deepStrictEqual(await colgado, { ok: false, obsoleta: true });
  assert.strictEqual(d.eventos.at(-1), "cancelCeremony");
});

test("flujo: la oferta solo cuando toca; desde gafas no se pregunta ni se pide la lista", async () => {
  const enlace = { entrada: "enlace", titular: true, primer_acceso: false, rol: "hogar" };
  const b = banco(), L = await b.hechos();
  const r = await L.evalua(enlace);
  assert.strictEqual(r.ofrecer, true);
  assert.deepStrictEqual(b.eventos, ["GET /api/yo/llaves"]);
  // gafas (código corto): ni siquiera se pide la lista
  const g = banco(), Lg = await g.hechos();
  assert.strictEqual((await Lg.evalua({ entrada: "codigo", titular: false, primer_acceso: false, rol: "hogar" })).ofrecer, false);
  assert.deepStrictEqual(g.eventos, []);
  // entró con una llave: no se ofrece
  assert.strictEqual((await (await banco().hechos()).evalua({ ...enlace, entrada: "llave" })).ofrecer, false);
  // la cuenta no puede añadir (tope): no se ofrece aunque haya llaves
  assert.strictEqual((await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 200, json: { llaves: [], maximo: 10, puede_anadir: false } } } }).hechos()).evalua(enlace)).ofrecer, false);
  // la lista falla: no se ofrece (y no rompe)
  assert.strictEqual((await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 500, json: null } } }).hechos()).evalua(enlace)).ofrecer, false);
  // sin autenticador de plataforma (LLAVES-DE-ACCESO §3.1): no se ofrece y no se pide la lista
  const p = banco({ plataforma: false }); assert.strictEqual((await (await p.hechos()).evalua(enlace)).ofrecer, false); assert.deepStrictEqual(p.eventos, []);
  // primer acceso sin terminar: no
  assert.strictEqual((await (await banco().hechos()).evalua({ ...enlace, primer_acceso: true })).ofrecer, false);
});

test("flujo: «Ahora no» (30 días) y «Este aparato no es mío» (nunca) se recuerdan en el navegador; sin almacenamiento no rompe", async () => {
  const P = await carga("llave_puro.js"), enlace = { entrada: "enlace", titular: true, primer_acceso: false, rol: "hogar" }, T0 = Date.UTC(2026, 10, 2);
  const b = banco(), L = await b.hechos();
  L.responde("ahora_no");
  assert.strictEqual(P.leeRecuerdo(b.guardado.v, T0).tipo, "ahora_no");
  assert.strictEqual((await L.evalua(enlace)).ofrecer, false, "no vuelve a preguntar");
  const tarde = banco({ memoria0: b.guardado.v, ahora: T0 + 31 * 86400000 });
  assert.strictEqual((await (await tarde.hechos()).evalua(enlace)).ofrecer, true, "a los 31 días vuelve");
  const n = banco(); (await n.hechos()).responde("nunca");
  assert.strictEqual((await (await banco({ memoria0: n.guardado.v, ahora: T0 + 4000 * 86400000 }).hechos()).evalua(enlace)).ofrecer, false, "nunca más en este navegador");
  const roto = banco(), Lr = await roto.hechos();
  const sinAlm = creaConMemoriaRota(await import(pathToFileURL(path.join(RAIZ, "apps", "web", "portada", "llave_flujo.js")).href));
  assert.doesNotThrow(() => sinAlm.responde("nunca"));
  void Lr;
  function creaConMemoriaRota(m) {
    return m.creaLlaves({ pide: async () => ({ status: 200, json: {} }), lib: { browserSupportsWebAuthn: () => true, cancelCeremony() {} },
      memoria: { lee: () => { throw new Error("sin almacenamiento"); }, guarda: () => { throw new Error("sin almacenamiento"); } }, ahora: () => T0, agente: "" });
  }
});

test("flujo: crear la llave (opciones → ceremonia → alta con el nombre) y que un fallo no rompa nada", async () => {
  const b = banco(), L = await b.hechos();
  const r = await L.crea("");
  assert.deepStrictEqual(r, { ok: true, nombre: "Windows Hello de este ordenador" });
  assert.deepStrictEqual(b.eventos, ["cancelCeremony", "POST /api/yo/llaves/opciones", "startRegistration", "POST /api/yo/llaves"]);
  assert.deepStrictEqual(b.llamadas[1].cuerpo, { nombre: "Windows Hello de este ordenador", respuesta: { id: "nueva", response: {} } }, "el nombre sugerido del aparato");
  assert.strictEqual(JSON.parse(b.guardado.v).t, "hecha", "una vez creada, no se vuelve a ofrecer en este navegador");
  const nom = banco(); assert.strictEqual((await (await nom.hechos()).crea("  Mi móvil  ")).ok, true); assert.strictEqual(nom.llamadas[1].cuerpo.nombre, "Mi móvil");
  // la persona cancela el diálogo del aparato
  const c = banco({ respuestas: { __reg: async () => { const e = new Error("x"); e.name = "NotAllowedError"; throw e; } } });
  const rc = await (await c.hechos()).crea("");
  assert.strictEqual(rc.ok, false); assert.strictEqual(rc.cancelada, true); assert.match(rc.texto, /cancel/i);
  assert.strictEqual(c.guardado.v, null, "no queda recuerdo de algo que no se creó");
  // la api dice que no (tope, repetida, sin red): texto sin jerga y no lanza
  for (const [r2, re] of [[{ status: 409, json: { error: "demasiadas_llaves" } }, /máximo de llaves/], [{ status: 409, json: { error: "llave_repetida" } }, /ya está guardada/], [{ status: 400, json: { error: "llave_no_valida" } }, /No hemos podido guardar/]]) {
    const f = await (await banco({ respuestas: { "POST /api/yo/llaves": r2 } }).hechos()).crea("");
    assert.strictEqual(f.ok, false); assert.match(f.texto, re);
  }
  const red = await (await banco({ respuestas: { "POST /api/yo/llaves/opciones": new Error("red") } }).hechos()).crea("");
  assert.strictEqual(red.ok, false); assert.match(red.texto, /No hemos podido conectar/);
});

test("flujo: quitar una llave con DELETE sin cuerpo; la última deja el enlace; la que ya no está no rompe", async () => {
  const b = banco({ respuestas: { "DELETE /api/yo/llaves/:id": { status: 200, json: { sesiones_cerradas: 1, era_esta: false, quedan: 0 } } } });
  const r = await (await b.hechos()).quita(7);
  assert.deepStrictEqual(r, { ok: true, quedan: 0, era_esta: false });
  assert.deepStrictEqual(b.llamadas, [{ metodo: "DELETE", ruta: "/api/yo/llaves/7", cuerpo: undefined }], "sin cuerpo (hallazgo de OF13b-4: un content-type JSON sin cuerpo da 400)");
  assert.strictEqual((await (await banco({ respuestas: { "DELETE /api/yo/llaves/:id": { status: 200, json: { sesiones_cerradas: 2, era_esta: true, quedan: 1 } } } }).hechos()).quita(3)).era_esta, true);
  const nf = await (await banco({ respuestas: { "DELETE /api/yo/llaves/:id": { status: 404, json: null } } }).hechos()).quita(9);
  assert.strictEqual(nf.ok, false); assert.strictEqual(nf.yaNoEsta, true);
  const mal = await (await banco({ respuestas: { "DELETE /api/yo/llaves/:id": { status: 500, json: null } } }).hechos()).quita(9);
  assert.strictEqual(mal.ok, false); assert.match(mal.texto, /No hemos podido quitar la llave/);
  const lista = await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 200, json: { llaves: [{ id: 1, nombre: "A", es_esta: true }], maximo: 10, puede_anadir: true } } } }).hechos()).lista();
  assert.strictEqual(lista.ok, true); assert.strictEqual(lista.llaves.length, 1);
  assert.strictEqual((await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 401, json: null } } }).hechos()).lista()).ok, false);
});

test("flujo: «Salir de todos y quitar las llaves» es un solo POST con { confirmar: true }; borra el recuerdo «hecha» (no «nunca») y un fallo deja la sesión abierta", async () => {
  const P = await carga("llave_puro.js"), T0 = Date.UTC(2026, 10, 2);
  const ok = { "POST /api/yo/llaves/quitar-todas": { status: 200, json: { sesiones_cerradas: 3, llaves_quitadas: 2 } } };
  const b = banco({ respuestas: ok }), L = await b.hechos();
  L.responde("hecha");
  assert.strictEqual(P.leeRecuerdo(b.guardado.v, T0).tipo, "hecha");
  assert.deepStrictEqual(await L.quitaTodas(), { ok: true, sesiones: 3, llaves: 2 });
  assert.deepStrictEqual(b.llamadas, [{ metodo: "POST", ruta: "/api/yo/llaves/quitar-todas", cuerpo: { confirmar: true } }]);
  assert.strictEqual(P.leeRecuerdo(b.guardado.v, T0).tipo, "nada", "la llave de este aparato ya no existe: se podrá volver a ofrecer");
  assert.ok(b.eventos.includes("cancelCeremony"), "se invalida cualquier ceremonia en vuelo");
  const n = banco({ respuestas: ok }), Ln = await n.hechos(); Ln.responde("nunca"); await Ln.quitaTodas();
  assert.strictEqual(P.leeRecuerdo(n.guardado.v, T0).tipo, "nunca", "«Este aparato no es mío» se respeta");
  for (const [que, r, re] of [["error del servidor", { status: 500, json: null }, /Tu sesión sigue abierta; prueba otra vez/], ["sin red", new Error("red"), /Tu sesión sigue abierta\. Comprueba la conexión/],
    ["límite", { status: 429, json: null }, /Demasiados intentos/], ["oficina", { status: 403, json: { error: "cuenta_de_oficina" } }, /oficina[\s\S]*administrador/], ["gafas", { status: 403, json: { error: "solo_titular" } }, /Desde unas gafas/]]) {
    const f = banco({ respuestas: { "POST /api/yo/llaves/quitar-todas": r }, memoria0: P.recuerdoDe("hecha", T0) }), x = await (await f.hechos()).quitaTodas();
    assert.strictEqual(x.ok, false, que); assert.match(x.texto, re, que);
    assert.strictEqual(P.leeRecuerdo(f.guardado.v, T0).tipo, "hecha", que + ": si falla no se toca el recuerdo");
  }
  assert.strictEqual((await (await banco({ respuestas: { "POST /api/yo/llaves/quitar-todas": { status: 401, json: null } } }).hechos()).quitaTodas()).status, 401);
  assert.strictEqual(P.muestraSalidaTotal({ titular: true, entrada: "enlace", rol: "hogar" }), true);
  assert.strictEqual(P.muestraSalidaTotal({ titular: true, entrada: "llave", rol: "hogar" }), true);
  for (const mala of [{ titular: false, entrada: "codigo", rol: "hogar" }, { titular: true, entrada: "enlace", rol: "oficina" }, { titular: true, entrada: "llave", rol: "admin" }, null]) assert.strictEqual(P.muestraSalidaTotal(mala), false, JSON.stringify(mala));
  assert.ok(!/passkey|WebAuthn|FIDO|credencial|autenticador|biom/i.test(P.TEXTO_SALIDA_TOTAL + P.TEXTO_SALIDA_TOTAL_HECHA + P.TEXTO_ERROR_LISTA + P.TEXTO_LISTA_LIMITE), "sin jerga");
});

test("flujo: la lista que falla dice cuándo es el 429 y nunca devuelve una lista vacía que engañe", async () => {
  const P = await carga("llave_puro.js");
  const f = await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 500, json: null } } }).hechos()).lista();
  assert.deepStrictEqual(f, { ok: false, status: 500, texto: P.TEXTO_ERROR_LISTA });
  assert.strictEqual(P.TEXTO_ERROR_LISTA, "No hemos podido leer tus llaves. Prueba otra vez.");
  const l = await (await banco({ respuestas: { "GET /api/yo/llaves": { status: 429, json: { error: "demasiadas_peticiones", mensaje: "otro" } } } }).hechos()).lista();
  assert.strictEqual(l.status, 429); assert.strictEqual(l.texto, P.TEXTO_LISTA_LIMITE); assert.ok(!/enlace/i.test(l.texto));
  const red = await (await banco({ respuestas: { "GET /api/yo/llaves": new Error("red") } }).hechos()).lista();
  assert.strictEqual(red.ok, false); assert.strictEqual(red.status, 0);
});

test("flujo: «Entrar con mi llave» una y otra vez, con el autorrelleno en marcha, no deja ceremonias colgadas (navigator.credentials de mentira)", async () => {
  // cada startAuthentication es una ceremonia viva hasta que se aborta (cancelCeremony, como WebAuthnAbortService) o la persona toca el sensor
  let vivas = 0, max = 0, aborta = null, tocaSensor = false;
  const b = banco({ respuestas: {
    __cancela: () => aborta?.(),
    __auth: () => new Promise((ok, mal) => {
      vivas++; max = Math.max(max, vivas);
      aborta = () => { vivas--; aborta = null; mal(Object.assign(new Error("abortada"), { name: "AbortError", code: "ERROR_CEREMONY_ABORTED" })); };
      if (tocaSensor) setImmediate(() => { vivas--; aborta = null; ok({ id: "cred", response: {} }); });
    }),
  } });
  const L = await b.hechos();
  const cond = L.entra({ condicional: true });
  await new Promise(ok => setImmediate(ok));
  assert.strictEqual(vivas, 1, "el autorrelleno espera");
  const a = L.entra(); await new Promise(ok => setImmediate(ok));
  const c = L.entra(); await new Promise(ok => setImmediate(ok));
  assert.strictEqual(vivas, 1, "dos pulsaciones, una sola ceremonia viva");
  tocaSensor = true;
  const d = L.entra();
  const rs = await Promise.all([cond, a, c, d]);
  assert.strictEqual(max, 1, "nunca dos a la vez");
  for (const r of rs.slice(0, 3)) assert.deepStrictEqual(r, { ok: false, obsoleta: true });
  assert.strictEqual(rs[3].ok, true, "solo la última pulsación entra");
  assert.strictEqual(b.eventos.filter(x => x === "POST /api/auth/llave").length, 1, "una sola entrada contra la api");
  assert.strictEqual(vivas, 0, "ninguna ceremonia colgada");
});

// ——— estática ———
test("regla 12 y CSP: @simplewebauthn/browser, sin navigator.credentials a mano, carga perezosa, nada en línea ni de otro origen, DOM por textContent", () => {
  assert.match(js, /import\("@simplewebauthn\/browser"\)/);
  assert.match(js, /import\("\.\/llave_flujo\.js"\)/); assert.match(js, /import\("\.\/llave_puro\.js"\)/);
  assert.ok(!/^import /m.test(js), "el arranque de la portada no importa nada (guardián de avatar_portada)");
  assert.ok(!/navigator\.credentials/.test(js + flujoSrc + puroSrc), "la ceremonia es de la librería");
  assert.ok(!/^import .*simplewebauthn/m.test(flujoSrc + puroSrc), "la lógica no importa la librería: entra por creaLlaves() (así se prueba sin ella)");
  assert.match(lee("apps/web/package.json"), /"@simplewebauthn\/browser": "\d+\.\d+\.\d+"/, "versión fijada");
  assert.match(js, /WebAuthnAbortService\.cancelCeremony\(\)/);
  for (const [n, c] of [["portada.js", js], ["llave_flujo.js", flujoSrc], ["llave_puro.js", puroSrc]]) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(c), n + ": nada de HTML a mano");
    assert.ok(!/https?:\/\//.test(c.replace("http://www.w3.org/2000/svg", "")), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=|<script(?![^>]*\bsrc=)/i.test(html), "index.html sin estilos, manejadores ni scripts en línea");
  assert.ok(!/\.style\b|setAttribute\(["']style/.test(js), "nada de estilos desde JS (CSP style-src 'self')");
});

test("rutas: solo las del contrato (api.openapi.yaml), con el método que dice", () => {
  const openapi = lee("contratos/api.openapi.yaml");
  const usadas = new Set([...(js + flujoSrc).matchAll(/"(\/api\/(?:auth\/llave(?:\/opciones)?|yo\/llaves(?:\/opciones)?))"/g)].map(m => m[1]));
  assert.deepStrictEqual([...usadas].sort(), ["/api/auth/llave", "/api/auth/llave/opciones", "/api/yo/llaves", "/api/yo/llaves/opciones"]);
  for (const r of [...usadas, "/api/yo/llaves/{id}", "/api/sesion"]) assert.ok(openapi.includes("  " + r + ":"), r + " en el contrato");
  assert.match(flujoSrc, /llama\("DELETE", "\/api\/yo\/llaves\/" \+ encodeURIComponent\(String\(id\)\)\)/, "la baja, sin cuerpo");
  assert.ok(!/DELETE[^;]*\{\}/.test(flujoSrc), "DELETE sin cuerpo");
  assert.match(flujoSrc, /llama\("POST", "\/api\/yo\/llaves\/quitar-todas", \{ confirmar: true \}\)/, "la salida total, con el cuerpo estricto");
  assert.ok(openapi.includes("  /api/yo/llaves/quitar-todas:"), "la salida total, en el contrato");
  assert.match(js, /if \(cuerpo !== undefined\) \{ o\.headers\["content-type"\] = "application\/json"/, "sin cuerpo no se manda content-type JSON");
});

test("pantalla de entrada: «Entrar con mi llave» primero, «Recibir un enlace por correo» debajo, campo con entrada condicional, errores en vivo", () => {
  const s = seccion("p-entrar");
  assert.match(s, /<h1 id="t-entrar" tabindex="-1">Entrar<\/h1>/);
  assert.ok(s.indexOf('id="btnLlave"') > 0 && s.indexOf('id="btnLlave"') < s.indexOf('id="fEntrar"'), "la llave va antes que el correo");
  assert.match(s, /<div class="tarjeta pila" id="bloqueLlave" hidden>/, "oculta hasta saber que el navegador admite llaves");
  assert.match(s, /<button type="button" class="btn btn-prim btn-grande" id="btnLlave">Entrar con mi llave<\/button>/);
  assert.match(s, /<h2 id="tEnlace" class="separada">Recibir un enlace por correo<\/h2>/);
  assert.match(s, /<input id="correo" type="email" name="correo" autocomplete="email webauthn"/, "autocomplete=\"email webauthn\" para la mediación condicional");
  assert.match(s, /<div class="aviso aviso-err" id="avLlave" role="alert" tabindex="-1" hidden>/, "el error se anuncia y se puede enfocar");
  assert.match(s, /action="\/api\/auth\/enlace"/, "sin JS el enlace por correo sigue funcionando");
  assert.match(s, /id="opcGafas"/, "las gafas siguen con su código");
  assert.match(js, /useBrowserAutofill|condicional: true/, "se arranca el autorrelleno");
  assert.match(js, /\$\("bloqueLlave"\)\.hidden = !hay/, "sin soporte de WebAuthn no se enseña la llave");
  assert.match(js, /entrar: \(\) => pantallaEntrar\(\)/); assert.match(js, /llavesListas\?\.L\.paraEntrada\(\)/, "al salir de la pantalla se aborta la ceremonia");
  assert.match(js, /if \(caja\.focus\)|if \(foco\) caja\.focus\(\)/, "foco al aviso");
  assert.match(js, /location\.assign\(r\.destino\)/); assert.match(js, /P\.anclaDeDestino\(r\.destino\)/);
});

test("oferta tras el primer enlace: tres salidas, el aviso de aparatos compartidos y el del correo, sin prometer de más", () => {
  const m = /<div class="tarjeta pila separada" id="ofertaLlave"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/.exec(html);
  assert.ok(m, "la oferta existe en la portada");
  const o = sinEtiquetas(m[0]);
  assert.match(m[0], /<div class="tarjeta pila separada" id="ofertaLlave" aria-labelledby="tOferta" hidden>/, "oculta hasta que toque");
  assert.match(o, /¿Crear una llave en este aparato\?/);
  assert.match(o, /Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta\./);
  assert.match(o, /Te avisaremos por correo cuando se añada o se quite una llave/);
  assert.ok(!/siempre te llega|te hemos avisado/i.test(o), "no se promete que el aviso llegue siempre");
  for (const [id, t] of [["ofertaSi", "Sí, crear la llave"], ["ofertaAhoraNo", "Ahora no"], ["ofertaNunca", "Este aparato no es mío"]]) assert.match(m[0], new RegExp('id="' + id + '">' + t + "<"));
  assert.match(m[0], /id="avOferta" role="alert"/); assert.match(m[0], /id="okOferta" role="status"/);
  assert.match(js, /"hecha"|responde\("ahora_no"\)/); assert.match(js, /responde\("nunca"\)/);
  assert.match(js, /No te lo volveremos a preguntar en 30 días|en 30 días/);
  assert.match(js, /un fallo del alta no rompe la entrada/);
  assert.match(js, /ambién intentamos avisarte por correo/, "honesto: el aviso se intenta, no se garantiza");
});

test("Mis llaves en Mis dispositivos: lista, añadir otra y quitar con <dialog>; solo con sesión titular; la última no deja sin entrada", () => {
  const s = seccion("p-dispositivos");
  assert.match(s, /id="misLlaves" aria-labelledby="tMisLlaves" hidden/);
  for (const id of ["listaLlaves", "btnOtraLlave", "llaveNombreOtra", "avLlaves", "okLlaves", "llavesVacio", "dlgQuitar", "dlgQuitarSi", "dlgQuitarNo", "dlgQuitarTxt"]) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /<dialog id="dlgQuitar" aria-labelledby="dlgQuitarT">/, "confirmación nativa");
  assert.match(sinEtiquetas(s), /Cerrar la sesión en todos los aparatos no quita las llaves/);
  assert.match(js, /s\.titular !== true \|\| s\.entrada === "codigo"\) return;\s*\/\/ nunca desde unas gafas/);
  assert.match(js, /dispositivos: \(\) => \{ \$\("okVincular"\)\.hidden = true;[^}]*pintaSalidaTotal\(\); pintaMisLlaves\(\); \}/);
  assert.match(js, /showModal/); assert.match(js, /\$\("dlgQuitarNo"\)\.focus\(\)/, "el foco empieza en la salida segura");
  assert.match(js, /e\.className = "pill"; e\.textContent = "esta"/, "marca la llave de esta sesión");
  assert.match(js, /TEXTO_ULTIMA_LLAVE/);
  assert.match(js, /q\.setAttribute\("aria-label", "Quitar la llave «"/, "cada botón dice a qué llave se refiere");
  assert.match(js, /textContent = l\.nombre/, "el nombre de una llave es texto, nunca HTML");
});

test("Salir de todos y quitar las llaves: <dialog> nativo, aviso en vivo, el botón peligroso separado del de solo cerrar sesión y textos sencillos", () => {
  const s = seccion("p-dispositivos"), t = sinEtiquetas(s);
  assert.match(s, /<dialog id="dlgSalirTodo" aria-labelledby="dlgSalirTodoT">/, "confirmación nativa");
  for (const id of ["dlgSalirTodoTxt", "dlgSalirTodoSi", "dlgSalirTodoNo", "btnSalirYQuitar", "salidaTotal", "avSalidaTotal", "btnReintentaLlaves"]) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(s, /<div id="salidaTotal" class="pila" hidden>/, "oculto hasta saber que es una familia titular");
  assert.match(s, /id="avSalidaTotal" role="alert" tabindex="-1" hidden/, "el fallo se anuncia y se puede enfocar");
  assert.match(s, /<button type="button" class="btn btn-peligro" id="btnSalirYQuitar">Salir de todos y quitar las llaves<\/button>/);
  assert.match(s, /<button type="button" class="btn btn-peligro" data-accion="salirTodas">Cerrar sesión en todos mis aparatos<\/button>/, "el de solo cerrar sesión sigue");
  assert.match(t, /Esto no quita las llaves de acceso/, "la pantalla dice lo que NO hace el de siempre");
  assert.match(t, /Podrás volver a entrar con el enlace del correo y crear una llave nueva/);
  assert.match(s, /<button type="button" class="btn" id="btnReintentaLlaves" hidden>Probar otra vez<\/button>/);
  assert.match(js, /\$\("dlgSalirTodoNo"\)\.focus\(\)/, "el foco empieza en la salida segura");
  assert.match(js, /ll\.L\.quitaTodas\(\)/); assert.match(js, /anuncia\(ll\.P\.TEXTO_SALIDA_TOTAL_HECHA\)/, "se anuncia al terminar");
  assert.match(js, /if \(!r\.ok\) \{ avisaLlave\(\$\("avSalidaTotal"\)/, "si falla, la sesión sigue y se dice");
});

test("comodidad: botones de 44 px o más, [hidden] manda, <dialog> con colores del tema y nada que dependa solo del color", () => {
  assert.match(css, /--toque: 44px/); assert.match(css, /\.btn \{[^}]*min-height: var\(--toque\)/);
  assert.match(css, /\.lista-llaves li \{/); assert.match(css, /dialog \{[^}]*background: var\(--panel\)/); assert.match(css, /\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /id="anuncio" role="status" aria-live="polite"/);
  assert.match(html, /<button type="button" class="btn btn-prim btn-grande" id="ofertaSi">/, "los botones son <button>, alcanzables con teclado");
});

// ——— recorrido en Chrome con el autenticador virtual de CDP (opcional, ESCRITO SIN EJECUTAR) ———
test("recorrido: primer enlace → oferta → crear llave → salir → entrar con la llave (autenticador virtual de CDP contra infra/dev)", { timeout: 900_000 }, async t => {
  if (process.env.GEMELO_DOCKER !== "1") return t.skip("recorrido de Docker + Chrome opcional (GEMELO_DOCKER=1): la portada con llaves y el autenticador virtual NO se han comprobado");
  const { motivoSalto, lanza } = require("./_navegador");
  const motivo = motivoSalto("el recorrido de la portada con llaves");
  if (motivo) return t.skip(motivo);
  if (!chrome() || !playwright()) return t.skip("falta Chrome o playwright-core: la portada con llaves NO se ha comprobado");
  if (!python() && !process.env.GEMELO_DEV_TILESET) return t.skip("sin Python 3 para el fixture del entorno");
  const imp = f => import(pathToFileURL(path.join(RAIZ, "infra", "dev", "herramientas", f)).href);
  const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs"), comun = await imp("_comun.mjs"), { HOGARES } = await imp("siembra.mjs");
  const suelta = await require("../banco/turno").pide("docker + chrome: portada con llaves");   // un solo Chrome o Docker a la vez
  const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
  const nav = await lanza();
  try {
    await levanta();
    const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, yo = HOGARES[0];
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, locale: "es-ES", ignoreHTTPSErrors: true });
    await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
    const pg = await ctx.newPage(), errores = [];
    pg.on("pageerror", e => errores.push(String(e)));
    pg.on("console", m => { if (m.type() === "error" && !/Failed to load resource.*(401|403|404|409)/.test(m.text())) errores.push(m.text()); });
    // el autenticador virtual: de plataforma, con llave residente y verificación de la persona (como Windows Hello o Touch ID)
    const cdp = await ctx.newCDPSession(pg);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true } });

    // 0. sin llaves: la pantalla ofrece la llave primero y el enlace debajo
    await pg.goto(base + "/#entrar"); await pg.waitForSelector("html[data-listo]");
    await pg.waitForSelector("#bloqueLlave:not([hidden])");
    assert.strictEqual(await pg.getAttribute("#correo", "autocomplete"), "email webauthn");

    // 1. primer enlace (Mailpit) → página intermedia → portada
    const antesBuzon = (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json()).messages_count;
    await pg.fill("#correo", yo.correo); await pg.click("#btnMandar"); await pg.waitForSelector("#p-revisa:not([hidden])");
    let msg = null;
    for (let i = 0; i < 100 && !msg; i++) {
      const b = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json();
      if (b.messages_count > antesBuzon) msg = b.messages[0]; else await new Promise(ok => setTimeout(ok, 200));
    }
    assert.ok(msg, "el enlace no llegó al buzón en 20 s");
    const enlace = (/(https:\/\/localhost:\d+\/api\/auth\/entrar\?t=[A-Za-z0-9_-]{43})/.exec((await (await fetch(buzon + "/api/v1/message/" + msg.ID)).json()).Text) || [])[1];
    assert.ok(enlace, "el correo trae el enlace");
    await pg.goto(enlace);
    await pg.click("button[type=submit]");
    await pg.waitForURL(u => String(u).startsWith(base + "/"));
    // la cuenta sembrada puede estar en primer acceso (normas, alias, avatar) o no: se pasa lo que haya
    if (await pg.isVisible("#t-bienvenida")) {
      for (const id of ["#cPriv", "#cNormas", "#cAdulto"]) await pg.check(id);
      await pg.click("#fBienvenida button[type=submit]"); await pg.waitForSelector("#t-alias", { state: "visible" });
      await pg.click("#fAlias button[type=submit]"); await pg.waitForSelector("#t-avatar", { state: "visible" });
      await pg.click("#fAvatar button[type=submit]");
    }
    await pg.goto(base + "/"); await pg.waitForSelector("html[data-listo]");

    // 2. la oferta: aviso de aparato compartido y tres salidas; «Sí» crea la llave en el autenticador virtual
    await pg.waitForSelector("#ofertaLlave:not([hidden])", { timeout: 15_000 });
    assert.match(await pg.textContent("#ofertaLlave"), /Cualquiera que pueda desbloquear este aparato podrá entrar con tu cuenta\./);
    for (const id of ["#ofertaSi", "#ofertaAhoraNo", "#ofertaNunca"]) assert.ok((await pg.locator(id).boundingBox()).height >= 44, id + " ≥ 44 px");
    await pg.click("#ofertaSi");
    await pg.waitForSelector("#okOferta:not([hidden])", { timeout: 20_000 });
    assert.strictEqual((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length, 1, "una llave en el autenticador");

    // 3. Mis dispositivos → Mis llaves: la lista la enseña, «esta» marcada
    await pg.goto(base + "/#dispositivos"); await pg.waitForSelector("#misLlaves:not([hidden]) #listaLlaves li");
    assert.match(await pg.textContent("#listaLlaves"), /esta/);
    // y no se vuelve a ofrecer en este navegador (queda recuerdo «hecha»)
    await pg.goto(base + "/"); await pg.waitForSelector("html[data-listo]"); await pg.waitForTimeout(1500);
    assert.strictEqual(await pg.isHidden("#ofertaLlave"), true);

    // 4. salir y entrar con la llave, sin escribir el correo
    // salir es asíncrono (POST y luego S.sesion = null): hasta que no sale «Entrar», #entrar con la sesión aún viva cae en la portada
    // (destino() de portada.js), y el cambio de ancla no recarga la página
    await pg.click("[data-accion=salir]"); await pg.waitForSelector("#accionesSin:not([hidden]) #btnEntrar");
    await pg.goto(base + "/#entrar"); await pg.waitForSelector("#bloqueLlave:not([hidden])");
    await Promise.all([pg.waitForURL(base + "/finca/", { timeout: 30_000 }), pg.click("#btnLlave")]);
    const sesion = await (await ctx.request.get(base + "/api/sesion")).json();
    assert.strictEqual(sesion.entrada, "llave"); assert.strictEqual(sesion.titular, true);

    // 5. quitar la llave (la de esta sesión): la sesión se cierra y el enlace sigue sirviendo
    await pg.goto(base + "/#dispositivos"); await pg.waitForSelector("#listaLlaves li button");
    await pg.click("#listaLlaves li button"); await pg.waitForSelector("#dlgQuitar[open]");
    assert.match(await pg.textContent("#dlgQuitarTxt"), /el enlace que te mandamos al correo/);
    await pg.click("#dlgQuitarSi");
    await pg.waitForSelector("#btnEntrar");   // la sesión se cerró: portada con «Entrar»
    assert.strictEqual((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials.length, 1, "la llave sigue en el autenticador: solo se quitó del sitio");


    // 7. «Salir de todos y quitar las llaves» (OF13b-8b, ESCRITO SIN EJECUTAR): volver a entrar con el enlace, crear la llave, y salir de todo en un paso
    const entraPorEnlace = async () => {
      const n0 = (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json()).messages_count;
      await pg.goto(base + "/#entrar"); await pg.waitForSelector("html[data-listo]");
      await pg.fill("#correo", yo.correo); await pg.click("#btnMandar"); await pg.waitForSelector("#p-revisa:not([hidden])");
      let m2 = null;
      for (let i = 0; i < 100 && !m2; i++) {
        const b2 = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json();
        if (b2.messages_count > n0) m2 = b2.messages[0]; else await new Promise(ok => setTimeout(ok, 200));
      }
      assert.ok(m2, "el segundo enlace no llegó al buzón");
      await pg.goto((/(https:\/\/localhost:\d+\/api\/auth\/entrar\?t=[A-Za-z0-9_-]{43})/.exec((await (await fetch(buzon + "/api/v1/message/" + m2.ID)).json()).Text) || [])[1]);
      await pg.click("button[type=submit]"); await pg.waitForURL(u => String(u).startsWith(base + "/"));
    };
    await entraPorEnlace();
    await pg.goto(base + "/#dispositivos"); await pg.waitForSelector("#misLlaves:not([hidden])");
    await pg.click("#btnOtraLlave"); await pg.click("#btnOtraLlave");   // el primer toque pide el nombre; el segundo crea la llave
    await pg.waitForSelector("#listaLlaves li", { timeout: 20_000 });
    await pg.waitForSelector("#salidaTotal:not([hidden])");
    assert.ok((await pg.locator("#btnSalirYQuitar").boundingBox()).height >= 44, "≥ 44 px");
    await pg.click("#btnSalirYQuitar"); await pg.waitForSelector("#dlgSalirTodo[open]");
    assert.strictEqual(await pg.evaluate(() => document.activeElement.id), "dlgSalirTodoNo", "el foco, en la salida segura");
    await pg.click("#dlgSalirTodoNo");
    assert.strictEqual((await (await ctx.request.get(base + "/api/sesion")).json()).titular, true, "«No, volver» no cierra nada");
    await pg.click("#btnSalirYQuitar"); await pg.waitForSelector("#dlgSalirTodo[open]"); await pg.click("#dlgSalirTodoSi");
    await pg.waitForSelector("#btnEntrar");
    assert.strictEqual((await ctx.request.get(base + "/api/sesion")).status(), 401, "la sesión de este aparato también se cerró");
    const correos = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo + " subject:quitado"))).json();
    assert.strictEqual(correos.messages_count >= 1, true, "llegó el aviso de la salida total");
    await pg.goto(base + "/#entrar"); await pg.waitForSelector("#bloqueLlave:not([hidden])");
    await pg.click("#btnLlave");   // con la llave ya quitada del sitio, entrar con ella debe fallar con el texto único
    await pg.waitForSelector("#avLlave:not([hidden])");
    await entraPorEnlace();   // y el enlace del correo sigue siendo la entrada
    assert.strictEqual((await (await ctx.request.get(base + "/api/sesion")).json()).titular, true);

    // 6. TODO: la entrada condicional (autorrelleno) con una llave creada de nuevo — depende de que el autenticador virtual la admita; ajustar al ejecutarlo

    assert.deepStrictEqual(await pg.evaluate(() => window.__csp), [], "ninguna violación de la CSP impuesta");
    assert.deepStrictEqual(errores, [], "sin errores en la página");
    await ctx.close();
  } finally {
    await nav.close();
    if (!antes) para();
    await suelta();
  }
});
