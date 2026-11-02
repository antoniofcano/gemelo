"use strict";
// La personalización de los árboles (apps/web/motor/42_personalizacion.js, P7f; decisiones 91-96 y 99-102). En Node y sin navegador:
//  - la parte pura: el id estable del olivo, la lista blanca de la api (el ejemplo del contrato entra; lo malformado no), el nombre, el fichero y su reducción,
//    los textos de error (tamaño, tipo, límite por hora, subidas apagadas, solo titular), qué se ofrece según quién mira (titular/ajeno/gafas/VR) y qué rótulos tocan;
//  - el cliente y el flujo de subida con una api de mentira: reducir → POST /api/medios?acepto=true → PUT /api/olivos/…, que para si falla la subida;
//  - el motor con un DOM, Entidades, Laminas y Hazas de mentira: sin api no crea nada; con api complementa la ficha común (acciones de Usables, no ficha propia),
//    nombrar manda solo el nombre, los rótulos son DOM (≤ 12, sin coste sin nada cerca), la lámina se abre al elegir y se libera al soltar;
//  - que el aviso es el de la api, que el módulo no usa innerHTML ni habla con otro host y que lo que pide está en el contrato.
// Chrome contra la api real con PostGIS: pruebas/guardianes/personalizacion_e2e.test.js (GEMELO_DOCKER=1, por el banco).
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/42_personalizacion.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "42_personalizacion.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const P = new Function("\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + "\nreturn PersonalizaPuro;")();
const EJEMPLO = JSON.parse(lee("contratos/olivos-haza-ejemplo.json"));
const URL_OK = "/api/medios/0123456789abcdef0123456789abcdef.webp";

test("puro: el id del olivo es «olivo:<finca>:<copas_id>»; el provisional («i<n>») no se puede personalizar", () => {
  assert.deepStrictEqual(P.idOlivo("olivo:hituelo:900001"), { finca: "hituelo", copas_id: 900001 });
  assert.deepStrictEqual(P.idOlivo("olivo:cerro:0"), { finca: "cerro", copas_id: 0 });
  assert.strictEqual(P.idOlivo("olivo:cerro:i12"), null, "sin copas_id, el id no es estable (decisión 92)");
  for (const mal of ["baliza:x:1", "olivo:Cerro:1", "olivo:cerro:4294967296", "olivo:cerro:-1", "olivo:cerro", "", null, undefined, "olivo:a:b:3"]) assert.strictEqual(P.idOlivo(mal), null, String(mal));
});

test("puro: la lista de la api entra por su lista blanca (el ejemplo del contrato sí; lo malformado, no)", () => {
  const m = {};
  assert.strictEqual(P.indexa(m, EJEMPLO), 3);
  assert.deepStrictEqual(m["hituelo:900001"], { id: 7, nombre: "El abuelo", objeto: { tipo: "foto", url: EJEMPLO.olivos[0].objeto.url, ancho: 800, alto: 1600 }, haza: 1, mia: false });
  assert.strictEqual(m["hituelo:900002"].objeto, null); assert.strictEqual(m["hituelo:900004"].nombre, null);
  const sucio = { haza_id: 2, es_mia: true, olivos: [
    { id: 1, finca: "x", copas_id: 1, nombre: "a".repeat(41), objeto: null },                                        // nombre largo y nada más: no cuenta
    { id: 2, finca: "x", copas_id: 2, nombre: "Vale", objeto: { tipo: "foto", url: "https://otro.example/x.webp", ancho: 1, alto: 1 } },   // url de otro host: solo el nombre
    { id: 3, finca: "X!", copas_id: 3, nombre: "Mal finca" }, { id: 0, finca: "x", copas_id: 4, nombre: "Id 0" }, { id: 5, finca: "x", copas_id: 1.5, nombre: "no entero" },
    null, 7, { id: 6, finca: "x", copas_id: 6, nombre: 12 }, { id: 8, finca: "x", copas_id: 8, nombre: null, objeto: { tipo: "video", url: URL_OK, ancho: 1, alto: 1 } }] };
  const m2 = {}; assert.strictEqual(P.indexa(m2, sucio), 1); assert.deepStrictEqual(Object.keys(m2), ["x:2"]); assert.strictEqual(m2["x:2"].objeto, null); assert.strictEqual(m2["x:2"].mia, true);
  assert.strictEqual(P.indexa({}, null), 0); assert.strictEqual(P.indexa({}, { olivos: "no" }), 0);
});

test("puro (P7g D3): las decoraciones de la lista salen aparte, con su haza (mía o no); un olivo con solo decoración no entra en el mapa de nombres e imágenes", () => {
  const d = P.decoraciones(Object.assign({}, EJEMPLO, { es_mia: true }));
  assert.deepStrictEqual(d, [{ finca: "hituelo", copas_id: 900001, pieza: "luces", mia: true }, { finca: "hituelo", copas_id: 900004, pieza: "lazo", mia: true }, { finca: "hituelo", copas_id: 900005, pieza: "cinta", mia: true }]);
  assert.ok(!("hituelo:900005" in (m => (P.indexa(m, EJEMPLO), m))({})), "solo decoración: ni rótulo ni «Denunciar» (no hay texto ni imagen)");
  const sucio = { es_mia: false, olivos: [{ finca: "x", copas_id: 1, decoracion: "LUCES" }, { finca: "x", copas_id: 2, decoracion: "a".repeat(17) }, { finca: "x", copas_id: 3, decoracion: 7 },
    { finca: "X!", copas_id: 4, decoracion: "lazo" }, { finca: "x", copas_id: -1, decoracion: "lazo" }, null, { finca: "x", copas_id: 5, decoracion: "cohete" }] };
  assert.deepStrictEqual(P.decoraciones(sucio), [{ finca: "x", copas_id: 5, pieza: "cohete", mia: false }], "la forma de slug; si la pieza existe lo decide quien dibuja");
  assert.deepStrictEqual(P.decoraciones(null), []); assert.deepStrictEqual(P.decoraciones({ olivos: 1 }), []);
});

test("puro: el nombre (1-40, los caracteres de la api) y el fichero (JPEG, PNG o WebP)", () => {
  assert.deepStrictEqual(P.validaNombre("  El   abuelo  "), { ok: true, nombre: "El abuelo" });
  assert.strictEqual(P.validaNombre("Olivo de Lucía (2026)").ok, true);
  for (const mal of ["", "   ", "a".repeat(41), "<b>x</b>", "a_b", "x\ny\u0000"]) assert.strictEqual(P.validaNombre(mal).ok, mal === "x\ny\u0000" ? false : false, JSON.stringify(mal));
  assert.strictEqual(P.validaNombre("x\ny").nombre, "x y", "los saltos de línea se normalizan como espacios (igual que la api)");
  assert.strictEqual(P.validaFichero({ type: "image/jpeg", size: 10 }).ok, true);
  assert.strictEqual(P.validaFichero({ type: "IMAGE/PNG", size: 10 }).ok, true);
  assert.match(P.validaFichero({ type: "image/heic", size: 10 }).error, /JPEG, PNG o WebP/);
  assert.match(P.validaFichero({ type: "image/gif", size: 10 }).error, /JPEG, PNG o WebP/);
  assert.match(P.validaFichero({ type: "image/jpeg", size: 0 }).error, /vacío/); assert.ok(!P.validaFichero(null).ok);
});

test("puro: reducir (lado mayor ≤ 1280, sin ampliar, sin deformar)", () => {
  assert.deepStrictEqual(P.reduce(4000, 3000), { w: 1280, h: 960, reducida: true });
  assert.deepStrictEqual(P.reduce(3000, 4000), { w: 960, h: 1280, reducida: true });
  assert.deepStrictEqual(P.reduce(800, 600), { w: 800, h: 600, reducida: false }, "no se amplía");
  assert.deepStrictEqual(P.reduce(1280, 1280), { w: 1280, h: 1280, reducida: false });
  assert.deepStrictEqual(P.reduce(10000, 1), { w: 1280, h: 1, reducida: true }, "nunca 0 px");
  assert.ok(P.MAX_PX <= 1600, "por debajo del tope de la api (1600)");
});

test("puro: los errores se explican (tamaño, tipo, límite por hora, subidas apagadas, solo titular, sesión) y la red caída también", () => {
  assert.match(P.mensajeError(0, null), /conexión/);
  assert.match(P.mensajeError(401, null), /sesión ha caducado/);
  assert.match(P.mensajeError(403, { error: "solo_titular" }), /titular.*enlace/);
  assert.match(P.mensajeError(403, { error: "no_es_tu_haza" }), /no está en tu haza/);
  assert.match(P.mensajeError(413, { error: "imagen_demasiado_grande" }), /demasiado grande/);
  assert.match(P.mensajeError(415, { error: "no_es_imagen" }), /JPEG, PNG o WebP/);
  assert.match(P.mensajeError(429, { error: "demasiadas_peticiones" }), /límite por hora/);
  const apagado = P.mensajeError(503, { error: "subidas_apagadas" });
  assert.match(apagado, /aún no admite fotos/); assert.match(apagado, /cuentas de prueba/, "decisión 102: se explica, sin inventar permisos");
  assert.strictEqual(P.mensajeError(400, { error: "nombre_no_valido", mensaje: "Ese nombre no se puede usar." }), "Ese nombre no se puede usar.");
  assert.match(P.mensajeError(409, { error: "ya_denunciado" }, "denuncia"), /Ya lo habías denunciado/);
  assert.match(P.mensajeError(404, { error: "no_existe" }, "denuncia"), /ya no se ve/);
  assert.match(P.mensajeError(500, null), /error 500/);
});

test("puro: qué se ofrece según quién mira (titular en lo suyo, ajeno, gafas vinculadas, VR, id provisional)", () => {
  const ids = r => r.acciones.map(a => a.id), dato = { id: 7, nombre: "A", objeto: { tipo: "foto" } };
  assert.deepStrictEqual(ids(P.ofrece({ titular: true, mia: true, dato: null, vr: false, estable: true })), ["nombrar", "foto", "sugerir"]);
  assert.deepStrictEqual(ids(P.ofrece({ titular: true, mia: true, dato, vr: false, estable: true })), ["nombrar", "foto", "quitar", "sugerir"]);
  assert.strictEqual(P.ofrece({ titular: true, mia: true, dato, vr: false, estable: true }).acciones[1].txt, "Cambiar foto o dibujo");
  assert.deepStrictEqual(ids(P.ofrece({ titular: true, mia: false, dato, vr: false, estable: true })), ["denunciar"], "el ajeno con contenido: denunciar");
  assert.deepStrictEqual(ids(P.ofrece({ titular: true, mia: false, dato: null, vr: false, estable: true })), [], "el ajeno sin nada: nada que hacer");
  assert.deepStrictEqual(ids(P.ofrece({ titular: false, mia: false, dato, vr: false, estable: true })), ["denunciar"], "las gafas también pueden denunciar (cualquier sesión)");
  const gafas = P.ofrece({ titular: false, mia: true, dato: null, vr: false, estable: true });
  assert.deepStrictEqual(ids(gafas), []); assert.match(gafas.filas[0].v, /solo con tu enlace/);
  assert.deepStrictEqual(ids(P.ofrece({ titular: null, mia: true, dato: null, vr: false, estable: true })), [], "sin saber quién es, no se ofrece escribir");
  const vr = P.ofrece({ titular: true, mia: true, dato, vr: true, estable: true });
  assert.deepStrictEqual(ids(vr), [], "en VR no se sube, ni se nombra, ni se sugiere"); assert.match(vr.filas[0].v, /no en VR/);
  assert.deepStrictEqual(ids(P.ofrece({ titular: true, mia: false, dato, vr: true, estable: true })), ["denunciar"], "en VR se puede denunciar");
  assert.deepStrictEqual(P.ofrece({ titular: true, mia: true, dato: null, vr: false, estable: false }), { acciones: [], filas: [] }, "id provisional: nada");
});

test("puro: los rótulos que tocan son los más cercanos (≤ 12) y a menos de 45 m; con 5000 con nombre cuesta menos de 1 ms por vuelta", () => {
  const l = []; for (let i = 0; i < 5000; i++) l.push({ x: (i * 37) % 1000, z: (i * 91) % 1000, clave: "f:" + i, nombre: "n" + i });
  const r = P.cercanos(l, 500, 500, P.CERCA_M, P.MAX_ROTULOS);
  assert.ok(r.length <= 12 && r.length > 0); assert.ok(r.every(a => a.d < 45));
  assert.deepStrictEqual(r.map(a => a.d), r.map(a => a.d).slice().sort((a, b) => a - b), "de más cerca a más lejos");
  const verdad = l.map(q => ({ q, d: Math.hypot(q.x - 500, q.z - 500) })).filter(a => a.d < 45).sort((a, b) => a.d - b.d).slice(0, 12);
  assert.deepStrictEqual(r.map(a => a.q.clave), verdad.map(a => a.q.clave), "los mismos que con ordenar todo");
  assert.deepStrictEqual(P.cercanos(l, 5000, 5000, 45, 12), [], "lejos de todo, ninguno");
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 200; i++) P.cercanos(l, 500 + i, 500, 45, 12);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200; console.log("   [medida] cercanos() con 5000 olivos con nombre: " + ms.toFixed(3) + " ms por vuelta (cada 0,4 s)");
  assert.ok(ms < 1, "cuesta " + ms + " ms");
});

test("puro: el cuerpo del PUT lleva SOLO lo que cambia (la lista blanca no da el medio_id: renombrar no puede quitar la foto)", () => {
  assert.deepStrictEqual(P.cuerpoOlivo({ nombre: "El abuelo" }), { nombre: "El abuelo" });
  assert.deepStrictEqual(P.cuerpoOlivo({ objeto: { tipo: "foto", medio_id: 5 } }), { objeto: { tipo: "foto", medio_id: 5 } });
  assert.deepStrictEqual(P.cuerpoOlivo({ nombre: null }), { nombre: null });
});

// ---------- el cliente y el flujo de subida con una api de mentira
function apiFalsa(guion) {
  const llamadas = [];
  const fetchFn = (url, op) => {
    llamadas.push({ url, metodo: op.method, cab: op.headers, cuerpo: op.body, cred: op.credentials });
    const g = guion(url, op, llamadas.length - 1); if (g === "red") return Promise.reject(new Error("red"));
    return Promise.resolve({ status: g.estado, json: () => (g.cuerpo === undefined ? Promise.reject(new Error("sin cuerpo")) : Promise.resolve(g.cuerpo)) });
  };
  return { llamadas, cli: P.Cliente("/api/", fetchFn) };
}
const blob = (n, type) => ({ size: n, type: type || "image/jpeg" });

test("cliente: las rutas y los cuerpos son los del contrato (mismo origen, cookie, acepto=true)", async () => {
  const a = apiFalsa(() => ({ estado: 200, cuerpo: {} }));
  await a.cli.sesion(); await a.cli.olivosDeHaza(3); await a.cli.sube(blob(5), "image/jpeg"); await a.cli.cuelga("hituelo", 7, { nombre: "A" }); await a.cli.quita("hituelo", 7);
  await a.cli.denuncia(9, "ofensivo", "texto"); await a.cli.denuncia(9, "otro", ""); await a.cli.sugiere(3, "rama partida", "hituelo", 7); await a.cli.sugiere(3, "general");
  assert.deepStrictEqual(a.llamadas.map(l => l.metodo + " " + l.url), ["GET /api/sesion", "GET /api/hazas/3/olivos", "POST /api/medios?acepto=true", "PUT /api/olivos/hituelo/7", "DELETE /api/olivos/hituelo/7",
    "POST /api/personalizaciones/9/denuncias", "POST /api/personalizaciones/9/denuncias", "POST /api/hazas/3/sugerencias", "POST /api/hazas/3/sugerencias"]);
  assert.ok(a.llamadas.every(l => l.cred === "same-origin"), "solo el mismo origen, con su cookie");
  assert.strictEqual(a.llamadas[2].cab["content-type"], "image/jpeg", "la imagen tal cual, sin multipart");
  assert.deepStrictEqual(JSON.parse(a.llamadas[3].cuerpo), { nombre: "A" });
  assert.deepStrictEqual(JSON.parse(a.llamadas[5].cuerpo), { motivo: "ofensivo", texto: "texto" }); assert.deepStrictEqual(JSON.parse(a.llamadas[6].cuerpo), { motivo: "otro" }, "sin texto, sin campo");
  assert.deepStrictEqual(JSON.parse(a.llamadas[7].cuerpo), { texto: "rama partida", finca: "hituelo", copas_id: 7 }); assert.deepStrictEqual(JSON.parse(a.llamadas[8].cuerpo), { texto: "general" });
});

test("cliente: nunca lanza (red caída, cuerpo ilegible, 204)", async () => {
  assert.deepStrictEqual(await apiFalsa(() => "red").cli.sesion(), { ok: false, estado: 0, cuerpo: null });
  assert.deepStrictEqual(await apiFalsa(() => ({ estado: 204 })).cli.quita("a", 1), { ok: true, estado: 204, cuerpo: null });
  assert.deepStrictEqual(await apiFalsa(() => ({ estado: 502 })).cli.sesion(), { ok: false, estado: 502, cuerpo: null });
});

test("flujo de subida: reduce, sube con el aviso aceptado y cuelga SOLO el objeto; si falla la subida, no cuelga nada", async () => {
  const a = apiFalsa(url => url.startsWith("/api/medios") ? { estado: 201, cuerpo: { id: 44, url: URL_OK, ancho: 800, alto: 600, bytes: 9 } } : { estado: 200, cuerpo: { id: 7 } });
  let reducidas = 0; const reduceFn = async () => { reducidas++; return { blob: blob(900, "image/jpeg"), tipo: "image/jpeg" }; };
  const r = await P.cuelgaImagen(a.cli, reduceFn, { type: "image/png", size: 5e6 }, { finca: "hituelo", copas_id: 900001 }, "pintura");
  assert.deepStrictEqual(r, { ok: true, paso: "colgar" }); assert.strictEqual(reducidas, 1);
  assert.deepStrictEqual(a.llamadas.map(l => l.metodo + " " + l.url), ["POST /api/medios?acepto=true", "PUT /api/olivos/hituelo/900001"]);
  assert.deepStrictEqual(JSON.parse(a.llamadas[1].cuerpo), { objeto: { tipo: "pintura", medio_id: 44 } }, "ni el nombre ni nada más");
  // los fallos: cada uno con su texto y sin pasar al paso siguiente
  const casos = [[413, "imagen_demasiado_grande", /demasiado grande/], [415, "no_es_imagen", /JPEG, PNG o WebP/], [429, "demasiadas_peticiones", /límite por hora/], [503, "subidas_apagadas", /cuentas de prueba/], [403, "solo_titular", /titular/], [401, "x", /sesión ha caducado/]];
  for (const [estado, error, re] of casos) {
    const b = apiFalsa(() => ({ estado, cuerpo: { error } }));
    const q = await P.cuelgaImagen(b.cli, reduceFn, { type: "image/jpeg", size: 100 }, { finca: "hituelo", copas_id: 1 }, "foto");
    assert.strictEqual(q.ok, false); assert.strictEqual(q.paso, "subir"); assert.match(q.error, re, estado + ""); assert.strictEqual(b.llamadas.length, 1, "si la subida falla no se cuelga nada");
  }
  const c = apiFalsa(url => url.startsWith("/api/medios") ? { estado: 201, cuerpo: { id: 1 } } : { estado: 403, cuerpo: { error: "no_es_tu_haza" } });
  const q = await P.cuelgaImagen(c.cli, reduceFn, { type: "image/jpeg", size: 100 }, { finca: "hituelo", copas_id: 1 }, "foto");
  assert.strictEqual(q.paso, "colgar"); assert.match(q.error, /no está en tu haza/);
  // lo que no llega a la red: tipo no admitido, imagen ilegible, imagen que sigue enorme tras reducir
  const d = apiFalsa(() => ({ estado: 201, cuerpo: { id: 1 } }));
  assert.strictEqual((await P.cuelgaImagen(d.cli, reduceFn, { type: "image/heic", size: 9 }, { finca: "h", copas_id: 1 }, "foto")).paso, "fichero");
  assert.strictEqual((await P.cuelgaImagen(d.cli, async () => null, { type: "image/jpeg", size: 9 }, { finca: "h", copas_id: 1 }, "foto")).paso, "reducir");
  assert.strictEqual((await P.cuelgaImagen(d.cli, async () => ({ blob: blob(9e6), tipo: "image/jpeg" }), { type: "image/jpeg", size: 9 }, { finca: "h", copas_id: 1 }, "foto")).paso, "reducir");
  assert.strictEqual(d.llamadas.length, 0, "nada de eso toca la red");
});

// ---------- el motor con un DOM, Entidades, Laminas y Hazas de mentira
function el(tag) {
  const e = { tagName: tag, children: [], attrs: {}, style: {}, oyentes: {}, _t: "", parentNode: null, value: "", files: null, checked: false, disabled: false, type: "",
    get textContent() { return this._t + this.children.map(c => c.textContent).join(""); }, set textContent(v) { this._t = String(v); this.children = []; },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }, removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; return c; },
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }, focus() {},
    addEventListener(t, f) { (this.oyentes[t] = this.oyentes[t] || []).push(f); }, dispara(t, ev) { (this.oyentes[t] || []).forEach(f => f(ev || { target: e, key: "", stopPropagation() {} })); },
    buscaPor(f) { const r = []; (function rec(x) { if (f(x)) r.push(x); x.children.forEach(rec); })(e); return r; },
    querySelector(s) { const t = s.split(","); return this.buscaPor(x => t.includes(x.tagName))[0] || null; } };
  e.style.cssText = ""; return e;
}
function mundoMotor(o) {
  o = o || {};
  const reg = { fetch: [], abre: [], cierra: [], refresca: [], eventos: [], complementos: [], quitados: 0, errores: [] };
  const body = el("body"), documento = { createElement: t => el(t), body };
  const hazas = o.hazas || [{ id: 1, es_mia: true }, { id: 2, es_mia: false }];
  const respuestas = Object.assign({
    "/api/sesion": { estado: 200, cuerpo: { rol: "familia", titular: o.titular !== false } },
    "/api/hazas/1/olivos": { estado: 200, cuerpo: { haza_id: 1, es_mia: true, olivos: [{ id: 11, finca: "hituelo", copas_id: 100, nombre: "La Parra", objeto: { tipo: "foto", url: URL_OK, ancho: 800, alto: 600 } }] } },
    "/api/hazas/2/olivos": { estado: 200, cuerpo: { haza_id: 2, es_mia: false, olivos: [{ id: 22, finca: "hituelo", copas_id: 200, nombre: "El Abuelo", objeto: { tipo: "foto", url: URL_OK, ancho: 800, alto: 1600 } }, { id: 23, finca: "hituelo", copas_id: 201, nombre: "Solo nombre", objeto: null }] } } }, o.respuestas || {});
  const fetchFalso = (url, op) => {
    reg.fetch.push([op.method || "GET", url, op.body]);
    const r = respuestas[url.split("?")[0]] || (op.method === "PUT" || op.method === "DELETE" || op.method === "POST" ? { estado: 200, cuerpo: { id: 11 } } : { estado: 404, cuerpo: null });
    return Promise.resolve({ status: r.estado, json: () => Promise.resolve(r.cuerpo) });
  };
  // posiciones: el olivo 100 (haza 1, mía) en x=10; 200 y 201 (haza 2, ajena) en x=30 y x=500; 300 (haza 1, sin nada) en x=12
  const POS = { "olivo:hituelo:100": { x: 10, y: 3, z: -10 }, "olivo:hituelo:200": { x: 30, y: 3, z: -10 }, "olivo:hituelo:201": { x: 500, y: 3, z: -10 }, "olivo:hituelo:300": { x: 12, y: 3, z: -10 } };
  const Entidades = { complementa: (t, fn) => { assert.strictEqual(t, "olivo"); reg.complementos.push(fn); return () => { reg.quitados++; reg.complementos = reg.complementos.filter(f => f !== fn); }; }, pos: id => POS[id] || null,
    ficha: (id, modo) => { const f = { titulo: "Olivo", filas: [{ k: "Altura", v: "4 m" }] }; reg.complementos.forEach(fn => fn(f, id, modo)); return f; } };
  const Hazas = { vistas: () => hazas, enPunto: x => (x < 20 ? { id: 1, es_mia: true } : x < 100 ? { id: 2, es_mia: false } : null) };
  const Usables = { refresca: id => reg.refresca.push(id) };
  const Laminas = { abre: l => { reg.abre.push(l); return true; }, cierra: (id, m) => { reg.cierra.push([id, m]); return true; }, repinta: () => true };
  const Bus = { emite: (ev, d) => { reg.eventos.push([ev, d]); return 0; }, hay: ev => ev === "decoraciones:cambian" && !o.sinDeco };   // hay: quien dibuja las decoraciones (50_decoraciones.js) escucha ese evento
  class V3 { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } project() { this.x = (this.x - 10) / 50; this.y = 0.2; this.z = 0.5; return this; } }
  class Imagen { set src(v) { this._s = v; } get src() { return this._s; } }
  const camera = { position: { x: 12, y: 2, z: -10 } }, lienzo = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) }, VRX = { on: false };
  // P7g D4: la fecha de «hoy» del motor (por defecto, otoño: 2-nov-2026)
  const AHORA = o.ahora || "2026-11-02T10:00:00+01:00";
  class FechaFalsa extends Date { constructor(...a) { super(...(a.length ? a : [AHORA])); } }
  const f = new Function("D", "location", "fetch", "document", "window", "THREE", "Entidades", "Usables", "Laminas", "Hazas", "HazasPuro", "Bus", "camera", "lienzo", "exag", "VRX", "Image", "createImageBitmap", "console", "Date",
    "\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + trozo("// [motor:inicio]", "// [motor:fin]") + "\nreturn PersonalizaMotor;");
  const HazasPuro = { prefijoApi: () => (o.sinApi ? null : "/api/") };
  const motor = f({ base: "/teselas/hituelo/", finca_id: "hituelo" }, { search: "" }, fetchFalso, documento, {}, { Vector3: V3 }, Entidades, Usables, Laminas, Hazas, HazasPuro, Bus, camera, lienzo, 1, VRX, Imagen, undefined,
    { error: (...a) => reg.errores.push(a.join(" ")) }, FechaFalsa);
  const on = {}, n = { on: (ev, fn) => { on[ev] = fn; return () => {}; } };
  return { motor, n, on, reg, body, Entidades, VRX, camera, listo: () => new Promise(r => setTimeout(r, 5)) };
}
const buscaBoton = (body, txt) => body.buscaPor(x => x.tagName === "button" && x.textContent === txt)[0];

test("motor: sin api no pide nada, no crea nada y no cambia ninguna ficha", () => {
  const w = mundoMotor({ sinApi: true }), m = w.motor(w.n);
  assert.deepStrictEqual(m.estado(), { api: false }); assert.strictEqual(w.reg.fetch.length, 0); assert.strictEqual(w.reg.complementos.length, 0); assert.strictEqual(w.body.children.length, 0);
  m.actualiza("tarde", 0.4); m.actualiza("mundo", 0.016); m.libera();
});

test("motor: con api pide la sesión y los olivos de cada haza, y complementa la ficha común con las acciones de Usables", async () => {
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  assert.ok(w.reg.fetch.some(f => f[1] === "/api/sesion")); assert.ok(w.reg.fetch.some(f => f[1] === "/api/hazas/1/olivos")); assert.ok(w.reg.fetch.some(f => f[1] === "/api/hazas/2/olivos"));
  assert.ok(w.reg.fetch.every(f => f[0] === "GET"), "al arrancar solo lee");
  assert.strictEqual(w.reg.complementos.length, 1, "UN complemento de la ficha del olivo: no hay ficha propia");
  const mia = w.Entidades.ficha("olivo:hituelo:100", "pantalla");
  assert.deepStrictEqual(mia.filas[0], { k: "Nombre", v: "La Parra", de: "puesto por tu familia" });
  assert.deepStrictEqual(mia.acciones.map(a => a.txt), ["Cambiar nombre", "Cambiar foto o dibujo", "Decorar", "Quitar", "Sugerir a la oficina"]);
  const ajeno = w.Entidades.ficha("olivo:hituelo:200", "pantalla");
  assert.strictEqual(ajeno.filas[0].v, "El Abuelo"); assert.match(ajeno.filas[0].de, /esa haza/); assert.deepStrictEqual(ajeno.acciones.map(a => a.txt), ["Denunciar"]);
  assert.strictEqual(w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.map(a => a.txt).join(), "Nombrar,Colgar foto o dibujo,Decorar,Sugerir a la oficina", "lo mío sin nada: nombrar, colgar y decorar (sin Quitar)");
  assert.strictEqual(w.Entidades.ficha("olivo:hituelo:i5", "pantalla").acciones, undefined, "id provisional: nada");
  const vr = w.Entidades.ficha("olivo:hituelo:100", "vr"); assert.strictEqual(vr.acciones, undefined, "en VR lo mío no se escribe"); assert.ok(vr.filas.some(q => /no en VR/.test(q.v)));
  assert.deepStrictEqual(w.Entidades.ficha("olivo:hituelo:200", "vr").acciones.map(a => a.txt), ["Denunciar"], "en VR se denuncia");
  m.libera(); assert.strictEqual(w.reg.quitados, 1, "libera quita el complemento"); assert.strictEqual(w.reg.complementos.length, 0);
});

test("motor (P7g D3): publica las decoraciones de todas las hazas por el Bus al traerlas y a quien las pida; al liberar, la lista vacía", async () => {
  const w = mundoMotor({ respuestas: {
    "/api/hazas/1/olivos": { estado: 200, cuerpo: { haza_id: 1, es_mia: true, olivos: [{ id: 11, finca: "hituelo", copas_id: 100, nombre: null, decoracion: "luces", objeto: null }] } },
    "/api/hazas/2/olivos": { estado: 200, cuerpo: { haza_id: 2, es_mia: false, olivos: [{ id: 22, finca: "hituelo", copas_id: 200, nombre: "El Abuelo", decoracion: "lazo", objeto: null }] } } } });
  const m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const ult = () => w.reg.eventos.filter(e => e[0] === "decoraciones:cambian").pop();
  assert.ok(ult(), "«decoraciones:cambian» emitido");
  assert.deepStrictEqual(ult()[1].lista.slice().sort((a, b) => a.copas_id - b.copas_id), [{ finca: "hituelo", copas_id: 100, pieza: "luces", mia: true }, { finca: "hituelo", copas_id: 200, pieza: "lazo", mia: false }]);
  assert.strictEqual(m.estado().decoraciones, 2); assert.strictEqual(m.estado().personalizados, 1, "la de solo decoración no es «personalizada» (nombre o imagen)");
  assert.deepStrictEqual(w.Entidades.ficha("olivo:hituelo:100", "pantalla").acciones.map(a => a.txt), ["Nombrar", "Colgar foto o dibujo", "Cambiar decoración", "Quitar decoración", "Sugerir a la oficina"], "sin «Quitar» (nombre e imagen): la decoración tiene el suyo (D4)");
  const n0 = w.reg.eventos.length; assert.strictEqual(typeof w.on["decoraciones:pide"], "function"); w.on["decoraciones:pide"]({});
  assert.strictEqual(w.reg.eventos.length, n0 + 1); assert.strictEqual(ult()[1].lista.length, 2, "responde con la última");
  m.libera(); assert.deepStrictEqual(ult()[1].lista, [], "liberado, ya no hay decoraciones que dibujar");
});

// ---------- P7g D4: la acción «Decorar» en la ficha del olivo
test("puro (P7g D4): qué se ofrece de decorar (solo el titular en lo suyo y fuera de VR; sin catálogo, nada) y los textos", () => {
  const ids = r => r.acciones.map(a => a.id), txt = r => r.acciones.map(a => a.txt), otono = P.piezasDeLaEpoca("otono");
  const base = { titular: true, mia: true, dato: null, vr: false, estable: true };
  assert.deepStrictEqual(ids(P.ofrece(base)), ["nombrar", "foto", "sugerir"], "sin catálogo de decoraciones (?decoraciones=0), no se ofrece decorar");
  assert.deepStrictEqual(ids(P.ofrece(Object.assign({}, base, { decora: otono, deco: null }))), ["nombrar", "foto", "decorar", "sugerir"]);
  assert.deepStrictEqual(txt(P.ofrece(Object.assign({}, base, { decora: otono, deco: null }))).filter(t => /ecora/.test(t)), ["Decorar"]);
  const con = P.ofrece(Object.assign({}, base, { decora: otono, deco: "luces" }));
  assert.deepStrictEqual(ids(con), ["nombrar", "foto", "decorar", "quitardeco", "sugerir"]); assert.deepStrictEqual(txt(con).filter(t => /ecora/.test(t)), ["Cambiar decoración", "Quitar decoración"]);
  assert.deepStrictEqual(ids(P.ofrece(Object.assign({}, base, { decora: otono, deco: "luces", dato: { id: 1, nombre: "A" } }))), ["nombrar", "foto", "decorar", "quitardeco", "quitar", "sugerir"], "«Quitar» (nombre e imagen) y «Quitar decoración» son dos cosas");
  // nada de decorar: ajeno, gafas vinculadas, sin saber quién es, VR, id provisional
  for (const m of [{ mia: false }, { titular: false }, { titular: null }, { vr: true }, { estable: false }]) assert.ok(!ids(P.ofrece(Object.assign({}, base, { decora: otono, deco: "luces" }, m))).some(i => /deco/.test(i)), JSON.stringify(m));
  // el rótulo del diálogo: la época, las piezas de esa época y la leyenda de honestidad
  const t = P.textoDecorar("otono", otono, "Luces");
  assert.match(t, /Ahora toca el otoño: farolillo o cosecha/); assert.match(t, /nueva sustituye a la anterior/); assert.match(t, /Ahora tiene: luces/); assert.ok(t.endsWith("Ilustrativa: la decoración la elige tu familia; no la mide el gemelo."));
  assert.match(P.textoDecorar("primavera", P.piezasDeLaEpoca("primavera"), null), /Ahora toca la primavera: flores\./); assert.ok(!/Ahora tiene/.test(P.textoDecorar("verano", P.piezasDeLaEpoca("verano"), null)));
  // los errores se explican; fuera_de_epoca, tal cual la api
  const fuera = "Esa decoración no es de esta época del año. Ahora toca: farolillo y cosecha.";
  assert.strictEqual(P.mensajeError(422, { error: "fuera_de_epoca", mensaje: fuera }, "deco"), fuera);
  assert.match(P.mensajeError(403, { error: "solo_titular" }, "deco"), /titular/); assert.match(P.mensajeError(403, { error: "no_es_tu_haza" }, "deco"), /no está en tu haza/);
  assert.match(P.mensajeError(409, { error: "a_la_vez" }, "deco"), /se ha cruzado/); assert.match(P.mensajeError(429, { error: "demasiadas_peticiones" }, "deco"), /límite/);
  assert.match(P.mensajeError(401, null, "deco"), /sesión ha caducado/); assert.match(P.mensajeError(0, null, "deco"), /conexión/);
  assert.strictEqual(P.mensajeError(400, { error: "pieza_no_existe", mensaje: "Esa decoración no existe." }, "deco"), "Esa decoración no existe.");
  assert.strictEqual(P.mensajeError(404, { error: "no_existe" }, "deco"), "Este olivo ya no tenía decoración.");
});

test("puro (P7g D4): el catálogo que se ofrece es el de contratos/decoraciones.json y la época es la de la api (apps/api/src/vida/decoraciones.ts) en los días límite, en hora de Madrid", () => {
  const CAT = JSON.parse(lee("contratos/decoraciones.json"));
  assert.deepStrictEqual(P.PIEZAS, CAT.piezas.map(p => ({ id: p.id, nombre: p.nombre, epoca: p.epoca })), "lo que se ofrece y el contrato dicen lo mismo");
  const e = iso => P.epocaDeLaFecha(new Date(iso));
  // las mismas fechas que apps/api/pruebas/unidad/decoraciones.test.ts (época: estaciones astronómicas con sus días límite, en hora de Madrid)
  const CASOS = [["2026-03-20T12:00:00+01:00", "invierno"], ["2026-03-21T12:00:00+01:00", "primavera"], ["2026-06-20T12:00:00+02:00", "primavera"], ["2026-06-21T12:00:00+02:00", "verano"],
    ["2026-09-22T12:00:00+02:00", "verano"], ["2026-09-23T12:00:00+02:00", "otono"], ["2026-12-20T12:00:00+01:00", "otono"], ["2026-12-21T12:00:00+01:00", "invierno"],
    ["2027-01-15T12:00:00+01:00", "invierno"], ["2026-11-02T10:00:00+01:00", "otono"],
    ["2026-03-20T23:30:00Z", "primavera"], ["2026-06-20T22:30:00Z", "verano"], ["2026-12-20T23:30:00Z", "invierno"], ["2028-02-29T12:00:00+01:00", "invierno"]];
  CASOS.forEach(c => assert.strictEqual(e(c[0]), c[1], c[0]));
  // y el código de la api dice los mismos límites y la misma zona (si alguien los cambia en un lado, este guardián salta)
  const api = lee("apps/api/src/vida/decoraciones.ts"), lim = [...api.matchAll(/mmdd >= (\d+) && mmdd <= (\d+)\) return "(\w+)"/g)].map(m => [+m[1], +m[2], m[3]]);
  assert.deepStrictEqual(lim, [[321, 620, "primavera"], [621, 922, "verano"], [923, 1220, "otono"]], "la api: tres tramos y el resto es invierno");
  assert.ok(/mmdd >= 321 && mmdd <= 620\) return "primavera"/.test(FUENTE) && /mmdd >= 621 && mmdd <= 922\) return "verano"/.test(FUENTE) && /mmdd >= 923 && mmdd <= 1220\) return "otono"/.test(FUENTE), "el motor: los mismos límites");
  assert.ok(/ZONA = "Europe\/Madrid"/.test(api) && /timeZone: "Europe\/Madrid"/.test(FUENTE), "la misma zona horaria");
  // a lo largo del año: las cuatro épocas, en orden
  const vistas = []; for (let d = 0; d < 366; d++) { const x = P.epocaDeLaFecha(new Date(Date.UTC(2028, 0, 1 + d, 12))); if (vistas[vistas.length - 1] !== x) vistas.push(x); }
  assert.deepStrictEqual(vistas, ["invierno", "primavera", "verano", "otono", "invierno"]);
  // las piezas de cada época: una en primavera y verano, dos en otoño e invierno
  assert.deepStrictEqual(P.piezasDeLaEpoca("primavera").map(p => p.id), ["flores"]); assert.deepStrictEqual(P.piezasDeLaEpoca("verano").map(p => p.id), ["cinta"]);
  assert.deepStrictEqual(P.piezasDeLaEpoca("otono").map(p => p.id), ["farolillo", "cosecha"]); assert.deepStrictEqual(P.piezasDeLaEpoca("invierno").map(p => p.id), ["luces", "lazo"]); assert.deepStrictEqual(P.piezasDeLaEpoca("nunca"), []);
  assert.strictEqual(P.piezaPorId("luces").nombre, "Luces"); assert.strictEqual(P.piezaPorId("cohete"), null);
});

test("cliente (P7g D4): PUT y DELETE de /api/olivos/{finca}/{copas_id}/decoracion, con el cuerpo { pieza } y el mismo origen", async () => {
  const a = apiFalsa(() => ({ estado: 200, cuerpo: { id: 1, pieza: "luces" } }));
  await a.cli.ponDeco("hituelo", 900001, "luces"); await a.cli.quitaDeco("hituelo", 900001);
  assert.deepStrictEqual(a.llamadas.map(l => l.metodo + " " + l.url), ["PUT /api/olivos/hituelo/900001/decoracion", "DELETE /api/olivos/hituelo/900001/decoracion"]);
  assert.deepStrictEqual(JSON.parse(a.llamadas[0].cuerpo), { pieza: "luces" }); assert.ok(a.llamadas.every(l => l.cred === "same-origin"));
  assert.deepStrictEqual(await apiFalsa(() => "red").cli.ponDeco("a", 1, "lazo"), { ok: false, estado: 0, cuerpo: null }, "nunca lanza");
});

const botonesPieza = body => body.buscaPor(x => x.tagName === "button" && x.attrs["data-pieza"]);
const DECO = { "/api/hazas/1/olivos": { estado: 200, cuerpo: { haza_id: 1, es_mia: true, olivos: [{ id: 11, finca: "hituelo", copas_id: 100, nombre: null, decoracion: "luces", objeto: null }] } } };

test("motor (P7g D4): «Decorar» ofrece SOLO las piezas de la época, con la leyenda ilustrativa; elegir una hace el PUT, cierra, refresca la lista y D3 la recibe por el Bus", async () => {
  const w = mundoMotor({ respuestas: { "/api/olivos/hituelo/300/decoracion": { estado: 200, cuerpo: { id: 5, pieza: "cosecha" } } } }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const a = w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "decorar"); assert.strictEqual(a.txt, "Decorar"); assert.strictEqual(a.fn(), true);
  assert.strictEqual(w.body.children[0].attrs.role, "dialog", "el mismo recuadro modal que las otras");
  assert.match(w.body.buscaPor(x => x.tagName === "h2")[0].textContent, /Decorar este olivo/);
  const bs = botonesPieza(w.body); assert.deepStrictEqual(bs.map(b => b.attrs["data-pieza"]), ["farolillo", "cosecha"], "otoño: dos piezas, ni una más");
  assert.deepStrictEqual(bs.map(b => b.textContent), ["Farolillo", "Cosecha"]); assert.ok(bs.every(b => /min-height:44px/.test(b.style.cssText) && /min-width:44px/.test(b.style.cssText)), "zonas ≥ 44 px");
  const txt = w.body.textContent; assert.ok(txt.includes("Ilustrativa: la decoración la elige tu familia; no la mide el gemelo.")); assert.ok(txt.includes("Ahora toca el otoño"));
  assert.ok(buscaBoton(w.body, "Cancelar"), "con «Cancelar»"); assert.ok(!buscaBoton(w.body, "Guardar"), "sin «Guardar»: tocar la pieza la cuelga");
  assert.ok(!w.reg.fetch.some(f => f[0] === "PUT"), "abrir no escribe");
  w.reg.eventos.length = 0; w.reg.fetch.length = 0;
  bs[1].dispara("click"); await w.listo();
  const put = w.reg.fetch.find(f => f[0] === "PUT"); assert.strictEqual(put[1], "/api/olivos/hituelo/300/decoracion"); assert.deepStrictEqual(JSON.parse(put[2]), { pieza: "cosecha" });
  assert.strictEqual(w.body.children.length, 0, "el recuadro se cierra"); assert.deepStrictEqual(w.reg.refresca, ["olivo:hituelo:300"], "la ficha se repinta");
  assert.ok(w.reg.fetch.some(f => f[0] === "GET" && f[1] === "/api/hazas/1/olivos"), "se vuelve a pedir la lista de la haza");
  assert.ok(w.reg.eventos.some(e => e[0] === "decoraciones:cambian"), "y se publica para que D3 repinte sin recargar");
  m.libera();
});

test("motor (P7g D4): con una decoración puesta se ofrece «Cambiar decoración» (la actual, marcada y sin poder re-elegirse) y «Quitar decoración»; la época cambia las piezas ofrecidas", async () => {
  const w = mundoMotor({ respuestas: DECO }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const f = w.Entidades.ficha("olivo:hituelo:100", "pantalla"); assert.deepStrictEqual(f.acciones.map(q => q.txt).filter(t => /ecora/.test(t)), ["Cambiar decoración", "Quitar decoración"]);
  m.libera();
  // invierno: la que tiene (luces) está entre las dos de la época y sale marcada
  const inv = mundoMotor({ respuestas: DECO, ahora: "2026-12-21T09:00:00+01:00" }), mi = inv.motor(inv.n); mi.actualiza("tarde", 0.4); await inv.listo();
  inv.Entidades.ficha("olivo:hituelo:100", "pantalla").acciones.find(q => q.id === "decorar").fn();
  const bs = botonesPieza(inv.body); assert.deepStrictEqual(bs.map(b => b.attrs["data-pieza"]), ["luces", "lazo"]); assert.strictEqual(bs[0].textContent, "Luces (la que tiene ahora)"); assert.strictEqual(bs[0].disabled, true); assert.strictEqual(bs[1].disabled, false);
  assert.match(inv.body.textContent, /Ahora toca el invierno: luces o lazo/); assert.match(inv.body.textContent, /Ahora tiene: luces/);
  mi.libera();
  // primavera y verano: una sola pieza
  for (const [ahora, ids] of [["2027-03-21T09:00:00+01:00", ["flores"]], ["2027-06-21T09:00:00+02:00", ["cinta"]]]) {
    const x = mundoMotor({ ahora }), mx = x.motor(x.n); mx.actualiza("tarde", 0.4); await x.listo();
    x.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "decorar").fn(); assert.deepStrictEqual(botonesPieza(x.body).map(b => b.attrs["data-pieza"]), ids, ahora); mx.libera();
  }
});

test("motor (P7g D4): «Quitar decoración» hace el DELETE de la decoración (no el del nombre y la imagen) y repinta; un 404 se explica", async () => {
  const w = mundoMotor({ respuestas: DECO }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  w.Entidades.ficha("olivo:hituelo:100", "pantalla").acciones.find(q => q.id === "quitardeco").fn();
  assert.match(w.body.textContent, /Se quita la decoración de este olivo/); w.reg.fetch.length = 0;
  buscaBoton(w.body, "Quitar decoración").dispara("click"); await w.listo();
  const d = w.reg.fetch.find(f => f[0] === "DELETE"); assert.strictEqual(d[1], "/api/olivos/hituelo/100/decoracion"); assert.strictEqual(w.body.children.length, 0); assert.deepStrictEqual(w.reg.refresca, ["olivo:hituelo:100"]);
  m.libera();
  const x = mundoMotor({ respuestas: Object.assign({ "/api/olivos/hituelo/100/decoracion": { estado: 404, cuerpo: { error: "no_existe" } } }, DECO) }), mx = x.motor(x.n); mx.actualiza("tarde", 0.4); await x.listo();
  x.Entidades.ficha("olivo:hituelo:100", "pantalla").acciones.find(q => q.id === "quitardeco").fn(); buscaBoton(x.body, "Quitar decoración").dispara("click"); await x.listo();
  assert.match(x.body.buscaPor(e => e.attrs["data-msg"])[0].textContent, /ya no tenía decoración/); assert.strictEqual(x.body.children.length, 1, "el recuadro sigue abierto con el motivo");
  mx.libera();
});

test("motor (P7g D4): los errores de la api se ven en el recuadro sin cerrarlo y se puede probar otra vez (fuera_de_epoca tal cual, solo_titular, a_la_vez, 429, 401); Esc cierra", async () => {
  const casos = [[422, { error: "fuera_de_epoca", mensaje: "Esa decoración no es de esta época del año. Ahora toca: farolillo y cosecha." }, /no es de esta época del año\. Ahora toca: farolillo y cosecha\./], [403, { error: "solo_titular" }, /titular/], [403, { error: "no_es_tu_haza" }, /no está en tu haza/],
    [409, { error: "a_la_vez" }, /se ha cruzado/], [429, { error: "demasiadas_peticiones" }, /límite/], [401, { error: "no_autenticado" }, /sesión ha caducado/]];
  for (const [estado, cuerpo, re] of casos) {
    const w = mundoMotor({ respuestas: { "/api/olivos/hituelo/300/decoracion": { estado, cuerpo } } }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
    w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "decorar").fn();
    botonesPieza(w.body)[0].dispara("click"); await w.listo();
    assert.match(w.body.buscaPor(e => e.attrs["data-msg"])[0].textContent, re, String(estado)); assert.strictEqual(w.body.children.length, 1, "el recuadro sigue abierto");
    assert.ok(botonesPieza(w.body).every(b => !b.disabled), "se puede elegir otra vez"); assert.deepStrictEqual(w.reg.refresca, [], "no se repinta nada si no se guardó");
    m.libera();
  }
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "decorar").fn(); w.body.children[0].dispara("keydown", { key: "Escape", stopPropagation() {} });
  assert.strictEqual(w.body.children.length, 0, "Esc cierra"); m.libera();
});

test("motor (P7g D4): no se ofrece en VR, a un ajeno, a las gafas vinculadas ni sin el componente de las decoraciones (sin quien las dibuje)", async () => {
  const w = mundoMotor({ respuestas: DECO }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const vr = w.Entidades.ficha("olivo:hituelo:100", "vr"); assert.strictEqual(vr.acciones, undefined, "en VR, solo lectura"); assert.ok(vr.filas.some(q => /no en VR/.test(q.v)));
  assert.ok(!w.Entidades.ficha("olivo:hituelo:200", "pantalla").acciones.some(q => /ecora/.test(q.txt)), "un olivo ajeno: solo denunciar");
  assert.ok(w.Entidades.ficha("olivo:hituelo:100", "vr").filas.length >= 1);
  m.libera();
  const g = mundoMotor({ titular: false, respuestas: DECO }), mg = g.motor(g.n); mg.actualiza("tarde", 0.4); await g.listo();
  assert.strictEqual(g.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones, undefined, "gafas vinculadas: nada de escribir"); mg.libera();
  const s = mundoMotor({ sinDeco: true, respuestas: DECO }), ms = s.motor(s.n); ms.actualiza("tarde", 0.4); await s.listo();
  assert.ok(!s.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.some(q => /ecora/.test(q.txt)), "sin quien las dibuje (50_decoraciones.js fuera) no se ofrece"); ms.libera();
});

test("motor: una sesión de gafas vinculadas no escribe (lo dice) pero sí ve y denuncia", async () => {
  const w = mundoMotor({ titular: false }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const mia = w.Entidades.ficha("olivo:hituelo:300", "pantalla"); assert.strictEqual(mia.acciones, undefined); assert.ok(mia.filas.some(q => /solo con tu enlace/.test(q.v)));
  assert.deepStrictEqual(w.Entidades.ficha("olivo:hituelo:200", "pantalla").acciones.map(a => a.txt), ["Denunciar"]);
  m.libera();
});

test("motor: «Nombrar» abre el recuadro, valida y manda SOLO el nombre; al volver cierra el recuadro y repinta la ficha", async () => {
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  const a = w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "nombrar"); assert.strictEqual(a.fn(), true);
  const campo = w.body.querySelector("input"); assert.ok(campo, "hay un campo"); assert.strictEqual(campo.maxLength, 40);
  campo.value = ""; buscaBoton(w.body, "Guardar").dispara("click"); assert.match(w.body.buscaPor(x => x.attrs["data-msg"])[0].textContent, /Escribe un nombre/); assert.ok(!w.reg.fetch.some(f => f[0] === "PUT"));
  campo.value = "  El   Viejo "; buscaBoton(w.body, "Guardar").dispara("click"); await w.listo();
  const put = w.reg.fetch.find(f => f[0] === "PUT"); assert.strictEqual(put[1], "/api/olivos/hituelo/300"); assert.deepStrictEqual(JSON.parse(put[2]), { nombre: "El Viejo" });
  assert.deepStrictEqual(w.reg.refresca, ["olivo:hituelo:300"], "la ficha se repinta"); assert.strictEqual(w.body.children.length, 0, "el recuadro se cierra");
  m.libera();
});

test("motor: subir pide marcar el aviso (casilla), lo dice tal cual y un error de la api se ve en el recuadro sin colgar nada", async () => {
  const w = mundoMotor({ respuestas: { "/api/medios": { estado: 503, cuerpo: { error: "subidas_apagadas" } } } }), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  w.Entidades.ficha("olivo:hituelo:300", "pantalla").acciones.find(q => q.id === "foto").fn();
  const txt = w.body.textContent; assert.ok(txt.includes(P.AVISO), "el aviso obligatorio, tal cual"); assert.ok(txt.includes(P.AVISO_PRUEBAS));
  const ok = buscaBoton(w.body, "Subir y colgar"); assert.strictEqual(ok.disabled, true, "sin marcar el aviso no se puede subir");
  const chk = w.body.buscaPor(x => x.attrs["data-acepta"])[0]; chk.checked = true; chk.dispara("change"); assert.strictEqual(ok.disabled, false);
  const arch = w.body.buscaPor(x => x.tagName === "input" && x.accept)[0]; assert.ok(/image\/jpeg/.test(arch.accept)); arch.files = [{ type: "image/jpeg", size: 100 }];
  ok.dispara("click"); await w.listo();
  assert.ok(!w.reg.fetch.some(f => f[0] === "PUT"), "sin subida no hay PUT"); assert.strictEqual(w.body.children.length, 1, "el recuadro sigue abierto con el motivo");
  assert.match(w.body.buscaPor(x => x.attrs["data-msg"])[0].textContent, /leer esa imagen|cuentas de prueba/);   // en Node no hay canvas: reducir falla y lo dice
  m.libera(); assert.strictEqual(w.body.children.length, 0, "libera cierra el recuadro");
});

test("motor: «Denunciar» manda el motivo a la personalización (no al olivo); en VR, el motivo «otro» y el aviso por el Bus", async () => {
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  w.Entidades.ficha("olivo:hituelo:200", "pantalla").acciones[0].fn();
  const sel = w.body.querySelector("select"); assert.deepStrictEqual(sel.children.map(o => o.value), P.MOTIVOS.map(q => q[0])); sel.value = "menores";
  buscaBoton(w.body, "Enviar denuncia").dispara("click"); await w.listo();
  const d = w.reg.fetch.find(f => /denuncias$/.test(f[1])); assert.strictEqual(d[1], "/api/personalizaciones/22/denuncias"); assert.deepStrictEqual(JSON.parse(d[2]), { motivo: "menores" });
  w.reg.fetch.length = 0;
  assert.strictEqual(w.Entidades.ficha("olivo:hituelo:200", "vr").acciones[0].fn(), true); await w.listo();
  assert.deepStrictEqual(JSON.parse(w.reg.fetch.find(f => /denuncias$/.test(f[1]))[2]), { motivo: "otro" });
  assert.deepStrictEqual(w.reg.eventos.pop(), ["personalizacion:resultado", { texto: "Denuncia enviada: la oficina lo mirará." }]);
  m.libera();
});

test("motor: los rótulos son DOM (≤ 12, reutilizados, nada con nada cerca ni en VR) y se quitan al liberar", async () => {
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo(); m.actualiza("tarde", 0.4);
  assert.strictEqual(m.estado().conNombre, 3, "tres olivos con nombre");
  const capa = w.body.children.find(c => c.attrs.id === "rotulosOlivos"); assert.ok(capa, "la capa de rótulos"); assert.strictEqual(capa.attrs["aria-hidden"], "true");
  m.actualiza("mundo", 0.016); const visibles = capa.children.filter(c => c.style.display === "block");
  assert.deepStrictEqual(visibles.map(c => c.textContent).sort(), ["El Abuelo", "La Parra"], "los dos a menos de 45 m; «Solo nombre», a 488 m, no");
  assert.ok(visibles.every(c => /translate\(/.test(c.style.transform)));
  const antes = capa.children.length; m.actualiza("tarde", 0.4); m.actualiza("mundo", 0.016); assert.strictEqual(capa.children.length, antes, "las etiquetas se reutilizan");
  w.camera.position.x = 9000; m.actualiza("tarde", 0.4); m.actualiza("mundo", 0.016); assert.ok(capa.children.every(c => c.style.display === "none"), "lejos de todo, ninguno");
  w.camera.position.x = 12; m.actualiza("tarde", 0.4); w.VRX.on = true; m.actualiza("tarde", 0.4); assert.ok(capa.children.every(c => c.style.display === "none"), "en VR no hay rótulos de DOM (la ficha dice el nombre)");
  w.VRX.on = false; m.libera(); assert.strictEqual(w.body.children.length, 0, "libera quita la capa");
});

test("motor: al elegir un olivo con imagen se abre UNA lámina colgada de él; al soltar (o elegir otro) se cierra; sin imagen no se abre", async () => {
  const w = mundoMotor(), m = w.motor(w.n); m.actualiza("tarde", 0.4); await w.listo();
  w.on["usable:elige"]({ id: "olivo:hituelo:200", tipo: "olivo", como: "toque" });
  assert.strictEqual(w.reg.abre.length, 1); const l = w.reg.abre[0]; assert.strictEqual(l.id, "personaliza:olivo:hituelo:200");
  assert.ok(l.en && Math.abs(l.en.x - 30) < 2 && l.en.y > 3, "colgada del olivo, no delante de la cabeza"); assert.ok(l.w <= 512, "una textura de ≤ 512 px de ancho");
  assert.strictEqual(l.ancho > 0 && l.alto > 0, true); assert.strictEqual(typeof l.firma, "function");
  w.on["usable:elige"]({ id: "olivo:hituelo:201" }); assert.deepStrictEqual(w.reg.cierra.pop(), ["personaliza:olivo:hituelo:200", "cerrada"], "otro olivo (sin imagen): se cierra la anterior"); assert.strictEqual(w.reg.abre.length, 1);
  w.on["usable:elige"]({ id: "olivo:hituelo:100" }); assert.strictEqual(w.reg.abre.length, 2); w.on["usable:suelta"]({ id: "olivo:hituelo:100", motivo: "nada" }); assert.strictEqual(w.reg.cierra.length, 1, "soltar cierra la lámina");
  w.on["usable:elige"]({ id: "baliza:p1" }); assert.strictEqual(w.reg.abre.length, 2, "una baliza no abre nada");
  w.on["usable:elige"]({ id: "olivo:hituelo:200" }); const n0 = w.reg.cierra.length; m.libera(); assert.ok(w.reg.cierra.length > n0, "libera cierra la lámina abierta");
});

test("el aviso es el de la api, el módulo no usa HTML a mano ni habla con otro host, y lo que pide está en el contrato", () => {
  const medios = lee("apps/api/src/vida/medios.ts"), aviso = /TEXTO_AVISO = "([^"]+)"/.exec(medios)[1];
  assert.strictEqual(P.AVISO, aviso, "mismo texto que el que guarda la api con la versión aceptada");
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(FUENTE), "textContent siempre");
  assert.ok(!/https?:\/\//.test(FUENTE.replace(/\/\/ .*$/gm, "")), "solo su mismo origen");
  const openapi = lee("contratos/api.openapi.yaml");
  for (const r of ["/api/hazas/{id}/olivos", "/api/olivos/{finca}/{copas_id}", "/api/medios", "/api/personalizaciones/{id}/denuncias", "/api/hazas/{id}/sugerencias", "/api/sesion"]) assert.ok(openapi.includes("  " + r + ":"), r);
  const eventos = JSON.parse(lee("contratos/eventos.json")).eventos; assert.ok(eventos["usable:elige"].escuchan.includes("42_personalizacion")); assert.deepStrictEqual(eventos["personalizacion:resultado"].emiten, ["42_personalizacion"]);
});
