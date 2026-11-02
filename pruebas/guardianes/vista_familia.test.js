"use strict";
// La vista simple para las familias (apps/web/motor/48_vista_familia.js, U9; componente «vista-familia»), en Node y sin navegador:
//  - lo puro (VistaFamiliaPuro): qué vista toca según ?vista= y el rol (hogar, guia, corresponsal → familia; oficina, admin y sin rol → completa) y qué se oculta;
//  - el componente con un DOM de mentira (ids, ancestros, estilo, nodos de texto, botones de modo): con familia oculta lo justo, rotula «Olivos», fuerza el modo
//    Gemelo y deja Linde, NDVI y Ambiente; con oficina no toca nada; libera() lo restaura todo (estilos, rótulo y modo anterior);
//  - el registro: bandera ?vista=, presupuesto 0 y que el motor sin el módulo no cambia (el módulo no toca nada fuera de su función).
// Lo de Chrome (los controles de verdad en la ventana): pruebas/guardianes/vista_familia_chrome.test.js.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/48_vista_familia.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "48_vista_familia.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const sinPrimera = t => t.slice(t.indexOf("\n") + 1);   // la primera línea de la marca lleva un comentario
const PURO = sinPrimera(trozo("// [puro:inicio]", "// [puro:fin]")), MOTOR = sinPrimera(trozo("// [motor:inicio]", "// [motor:fin]")), PURO_SIN = PURO;
const P = new Function("\"use strict\";\n" + PURO + "\nreturn VistaFamiliaPuro;")();

test("puro: ?vista= manda; si no, familia solo con rol conocido que no sea de oficina; sin rol, completa", () => {
  for (const r of ["hogar", "guia", "corresponsal"]) assert.strictEqual(P.vista("", r), "familia", r);
  for (const r of ["oficina", "admin"]) assert.strictEqual(P.vista("", r), "completa", r);
  for (const r of [null, undefined, "", 7]) assert.strictEqual(P.vista("", r), "completa", "sin sesión todo como hoy: " + r);
  assert.strictEqual(P.vista("?vista=completa", "hogar"), "completa");
  assert.strictEqual(P.vista("?x=1&vista=familia", "admin"), "familia");
  assert.strictEqual(P.vista("?vista=FAMILIA", null), "familia");
  assert.strictEqual(P.vista("?vista=otra", "hogar"), "familia", "un valor desconocido no manda: decide el rol");
});

test("puro: el plan de familia oculta OlivarTrack, desfase y selector de modo; deja Linde, NDVI y Ambiente; la completa no oculta nada", () => {
  const f = P.plan("familia"), ids = f.oculta.map(d => d.id);
  for (const id of ["mNube", "cMarc", "cDesf", "kMarc", "kDes", "notaDesfase", "notaModo"]) assert.ok(ids.includes(id), id);
  for (const id of ["cLinde", "cCopas", "cNdvi", "cTinte", "bNdvi", "cPaisaje", "cHierba", "cFauna", "cSolo", "cSonido"]) assert.ok(!ids.includes(id), id + " se queda");
  assert.deepStrictEqual(f.rotulos.map(r => [r.id, r.ahora]), [["cCopas", "Olivos"]]);
  assert.strictEqual(f.forzar, "mGem");
  assert.deepStrictEqual(P.plan("completa"), { oculta: [], rotulos: [], forzar: null });
});

// ---- un DOM de mentira: lo justo (getElementById, closest, style, childNodes, getAttribute, click)
function elemento(id, etiqueta, padre, extra) {
  const e = Object.assign({ id, etiqueta, padre, style: { display: "" }, childNodes: [], attrs: {}, clicks: 0 }, extra || {});
  e.getAttribute = k => (k in e.attrs ? e.attrs[k] : null);
  e.closest = sel => { for (let x = e; x; x = x.padre) if (x.etiqueta === sel || (sel[0] === "." && x.clases && x.clases.includes(sel.slice(1)))) return x; return null; };
  if (padre) padre.childNodes.push(e);
  return e;
}
function pagina() {
  const raiz = elemento("raiz", "body", null), por = {};
  const reg = e => { if (e.id) por[e.id] = e; return e; };
  reg(elemento("tModo", "h3", raiz));
  const modo = elemento("", "div", raiz, { clases: ["modo"] });
  for (const id of ["mNube", "mGem", "mOrto"]) { const b = reg(elemento(id, "button", modo)); b.attrs["aria-pressed"] = id === "mNube" ? "true" : "false"; }
  const clic = id => () => { for (const k of ["mNube", "mGem", "mOrto"]) por[k].attrs["aria-pressed"] = String(k === id); por[id].clicks++; };
  for (const id of ["mNube", "mGem", "mOrto"]) por[id].click = clic(id);
  reg(elemento("notaModo", "p", raiz));
  const capa = (id, texto) => { const l = elemento("", "label", raiz); const i = reg(elemento(id, "input", l)); l.childNodes.push({ nodeType: 3, nodeValue: texto }); return l; };
  const labels = { cLinde: capa("cLinde", "Linde "), cCopas: capa("cCopas", "Copas del LiDAR "), cMarc: capa("cMarc", "Guardados en OlivarTrack "), cDesf: capa("cDesf", "Desfase entre ambos "), cNdvi: capa("cNdvi", "Vigor (NDVI) "), cTinte: capa("cTinte", "Copas coloreadas por NDVI ") };
  const cifra = id => { const d = elemento("", "div", raiz); reg(elemento(id, "dd", d)); return d; };
  const cifras = { kMarc: cifra("kMarc"), kDes: cifra("kDes"), kAlt: cifra("kAlt") };
  reg(elemento("notaDesfase", "p", raiz));
  return { raiz, por, labels, cifras };
}
function monta(consulta, rol, opciones) {
  const pg = pagina(), o = opciones || {};
  const peticiones = [];
  const fetchFalso = (u, op) => { peticiones.push([u, op]); return Promise.resolve({ status: o.estado || 200, json: () => Promise.resolve({ rol }) }); };
  const f = new Function("document", "location", "fetch", "HazasPuro", "D", "\"use strict\";\nvar VistaFamiliaPuro = (function(){" + PURO_SIN + "\nreturn VistaFamiliaPuro;})();\n" + MOTOR + "\nreturn VistaFamiliaMotor;");
  const motor = f({ getElementById: id => pg.por[id] || null }, { search: consulta }, fetchFalso,
    { prefijoApi: (b, base) => (/api=/.test(b) ? "/api/" : /^\/teselas\//.test(base) ? "/api/" : null) }, { base: o.base === undefined ? "/teselas/x/" : o.base });
  return { pg, api: motor({}), peticiones };
}
const espera = () => new Promise(r => setTimeout(r, 5));
const oculto = e => e.style.display === "none";

test("motor, rol familia por la sesión: oculta lo justo, rotula «Olivos», fuerza el modo Gemelo y deja Linde, NDVI y Ambiente", async () => {
  const { pg, api, peticiones } = monta("", "hogar");
  assert.strictEqual(api.estado().vista, "completa", "mientras no llega la sesión, lo de siempre");
  await espera();
  assert.strictEqual(peticiones.length, 1); assert.strictEqual(peticiones[0][0], "/api/sesion"); assert.strictEqual(peticiones[0][1].credentials, "same-origin");
  assert.strictEqual(api.estado().vista, "familia");
  assert.ok(oculto(pg.por.tModo) && oculto(pg.por.mNube.padre) && oculto(pg.por.notaModo), "el selector de modo");
  assert.ok(oculto(pg.labels.cMarc) && oculto(pg.labels.cDesf), "Guardados y Desfase de Datos");
  assert.ok(oculto(pg.cifras.kMarc) && oculto(pg.cifras.kDes) && oculto(pg.por.notaDesfase), "las cifras y la nota del mapa");
  for (const k of ["cLinde", "cCopas", "cNdvi", "cTinte"]) assert.ok(!oculto(pg.labels[k]), k + " se queda");
  assert.ok(!oculto(pg.cifras.kAlt), "la altura mediana se queda");
  assert.strictEqual(pg.labels.cCopas.childNodes[1].nodeValue, "Olivos ");
  assert.strictEqual(pg.por.mGem.getAttribute("aria-pressed"), "true"); assert.strictEqual(pg.por.mGem.clicks, 1);
  assert.strictEqual(api.estado().ocultos, 8);
});

test("motor, libera() lo restaura todo: estilos, rótulo y el modo que había; y no queda nada vivo (una sesión tardía ya no pinta)", async () => {
  const { pg, api } = monta("", "guia");
  await espera();
  api.libera();
  assert.strictEqual(pg.labels.cCopas.childNodes[1].nodeValue, "Copas del LiDAR ");
  for (const e of [pg.por.tModo, pg.labels.cMarc, pg.labels.cDesf, pg.por.notaDesfase, pg.por.mNube.padre]) assert.strictEqual(e.style.display, "", "restaurado");
  assert.strictEqual(pg.por.mNube.getAttribute("aria-pressed"), "true", "vuelve al modo que había");
  assert.strictEqual(api.estado().ocultos, 0);
});

test("motor, oficina, admin, sin sesión y sin servidor: no toca nada; ?vista=completa gana al rol; ?vista=familia no espera a la sesión", async () => {
  for (const [consulta, rol, opc] of [["", "oficina"], ["", "admin"], ["?vista=completa", "hogar"], ["", "hogar", { estado: 401 }], ["", "hogar", { base: "" }]]) {
    const { pg, api } = monta(consulta, rol, opc);
    await espera();
    assert.strictEqual(api.estado().vista, "completa", consulta + rol);
    assert.ok(Object.values(pg.por).every(e => e.style.display === ""), "nada oculto: " + consulta + rol);
    assert.strictEqual(pg.por.mGem.clicks, 0); assert.strictEqual(pg.labels.cCopas.childNodes[1].nodeValue, "Copas del LiDAR ");
  }
  const f = monta("?vista=familia", null, { base: "" });
  assert.strictEqual(f.api.estado().vista, "familia", "forzada: al montar, sin servidor ni sesión");
  assert.strictEqual(f.peticiones.length, 0, "no pregunta nada");
});

test("registro: bandera ?vista=, sin GPU, sin eventos; el módulo solo toca el DOM en monta y no usa innerHTML ni habla con otro host", () => {
  assert.match(FUENTE, /id: "vista-familia"/); assert.match(FUENTE, /bandera: \{ defecto: true, url: "vista" \}/);
  assert.match(FUENTE, /presupuesto: \{ llamadas: 0, triangulos: 0 \}/);
  assert.doesNotMatch(FUENTE, /innerHTML|https?:\/\//);
  assert.doesNotMatch(FUENTE, /new THREE|THREE\./, "sin GPU");
});
