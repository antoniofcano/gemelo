"use strict";
// El interruptor «Avisarme por correo de los eventos» (apps/web/motor/49_avisos_correo.js, OF11f; componente «avisos-correo»), en Node y sin navegador:
//  - lo puro (AvisosCorreoPuro): solo una respuesta { avisos_correo: boolean } vale;
//  - el componente con un Ajustes y un fetch de mentira: sin api, sin sesión o con error no registra nada; con sesión registra la casilla con el valor de la api
//    (no el del aparato); al cambiarla manda el PUT y, si falla o la api dice otra cosa, la devuelve; los cambios seguidos van en orden; libera() la quita;
//  - el registro: bandera ?avisos=, presupuesto 0, sin innerHTML ni otro host.
// Lo de Chrome (la casilla de verdad en Configuración, iPhone, Quest): no probado.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const FUENTE = lee("apps/web/motor/49_avisos_correo.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "49_avisos_correo.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const sinPrimera = t => t.slice(t.indexOf("\n") + 1);
const PURO = sinPrimera(trozo("// [puro:inicio]", "// [puro:fin]")), MOTOR = sinPrimera(trozo("// [motor:inicio]", "// [motor:fin]"));
const P = new Function("\"use strict\";\n" + PURO + "\nreturn AvisosCorreoPuro;")();
const espera = () => new Promise(r => setTimeout(r, 5));

test("puro: solo vale { avisos_correo: boolean }", () => {
  assert.strictEqual(P.valor({ avisos_correo: true }), true);
  assert.strictEqual(P.valor({ avisos_correo: false }), false);
  for (const malo of [null, undefined, {}, "true", 1, { avisos_correo: 1 }, { avisos_correo: "si" }, []]) assert.strictEqual(P.valor(malo), null, JSON.stringify(malo));
});

// un Ajustes de mentira: guarda valores, avisa a quien se suscribe y deja ver lo que se registró
function ajustesFalso(guardadoAntes) {
  const v = {}, oyentes = [], reg = { registros: 0, quitados: 0, pestana: null };
  const A = {
    lee: k => (k in v ? v[k] : false), pon: (k, x) => { const antes = A.lee(k); v[k] = x; if (antes !== x) oyentes.forEach(f => f(k, x, antes)); return true; },
    registra: (prefijo, esquema, pestana, aplicaFn) => {
      reg.registros++; reg.pestana = pestana; reg.esquema = esquema;
      oyentes.push((k, x) => { if (k.indexOf(prefijo + ".") === 0) aplicaFn(k, x); });
      if (guardadoAntes !== undefined) v[prefijo + ".correo"] = guardadoAntes;   // lo que dejó localStorage de otra visita
      Object.keys(esquema).forEach(k => aplicaFn(prefijo + "." + k, A.lee(prefijo + "." + k)));
      return () => { reg.quitados++; };
    },
  };
  return { A, reg, v };
}
// el servidor de mentira: el valor del hogar y lo que responde a cada petición
function servidor(valor, opc) {
  const o = Object.assign({ get: 200, put: 200 }, opc || {}), s = { valor, peticiones: [] };
  s.fetch = (u, op) => {
    s.peticiones.push({ u, metodo: op.method, body: op.body ? JSON.parse(op.body) : null, credentials: op.credentials, tipo: op.headers["content-type"] });
    if (op.method === "GET") return Promise.resolve({ status: o.get, json: () => Promise.resolve({ avisos_correo: s.valor }) });
    if (o.put === "red") return Promise.reject(new Error("sin red"));
    if (o.put === 200) s.valor = JSON.parse(op.body).avisos_correo;
    return Promise.resolve({ status: o.put, json: () => Promise.resolve({ avisos_correo: o.dice !== undefined ? o.dice : s.valor }) });
  };
  return s;
}
function monta(sv, aj, base) {
  const f = new Function("location", "fetch", "HazasPuro", "D", "Ajustes", "\"use strict\";\nvar AvisosCorreoPuro = (function(){" + PURO + "\nreturn AvisosCorreoPuro;})();\n" + MOTOR + "\nreturn AvisosCorreoMotor;");
  return f({ search: "" }, sv.fetch, { prefijoApi: (b, ba) => (/^\/teselas\//.test(ba) ? "/api/" : null) }, { base: base === undefined ? "/teselas/x/" : base }, aj.A)({});
}

test("con sesión: pide GET /api/yo/avisos con la cookie del mismo origen y registra la casilla con el valor de la api, no el del aparato", async () => {
  const sv = servidor(true), aj = ajustesFalso(false);
  const api = monta(sv, aj);
  assert.strictEqual(aj.reg.registros, 0, "hasta que contesta la api no hay casilla");
  await espera();
  assert.deepStrictEqual([sv.peticiones[0].u, sv.peticiones[0].metodo, sv.peticiones[0].credentials], ["/api/yo/avisos", "GET", "same-origin"]);
  assert.strictEqual(aj.reg.registros, 1);
  assert.deepStrictEqual(aj.reg.pestana.campos, [{ k: "correo", t: "Avisarme por correo de los eventos" }]);
  assert.strictEqual(aj.A.lee("avisos.correo"), true, "manda la api");
  assert.strictEqual(sv.peticiones.length, 1, "cargar la casilla no escribe nada en la api");
  assert.deepStrictEqual(api.estado(), { visible: true, valor: true });
});

test("al marcar o desmarcar: PUT con el booleano; dos cambios seguidos llegan en orden", async () => {
  const sv = servidor(false), aj = ajustesFalso();
  monta(sv, aj); await espera();
  aj.A.pon("avisos.correo", true); aj.A.pon("avisos.correo", false); aj.A.pon("avisos.correo", true);
  await espera();
  const puts = sv.peticiones.filter(p => p.metodo === "PUT");
  assert.deepStrictEqual(puts.map(p => p.body), [{ avisos_correo: true }, { avisos_correo: false }, { avisos_correo: true }]);
  assert.ok(puts.every(p => p.tipo === "application/json" && p.u === "/api/yo/avisos"));
  assert.strictEqual(sv.valor, true); assert.strictEqual(aj.A.lee("avisos.correo"), true);
});

test("si la api rechaza, no responde o dice otra cosa, la casilla vuelve a lo que había", async () => {
  for (const opc of [{ put: 500 }, { put: 401 }, { put: "red" }, { put: 200, dice: false }]) {
    const sv = servidor(false, opc), aj = ajustesFalso();
    const api = monta(sv, aj); await espera();
    aj.A.pon("avisos.correo", true); await espera();
    assert.strictEqual(aj.A.lee("avisos.correo"), false, JSON.stringify(opc));
    assert.strictEqual(api.estado().valor, false);
  }
});

test("sin sesión, con error de la api o sin servidor: no hay casilla ni peticiones de más", async () => {
  for (const [opc, base] of [[{ get: 401 }], [{ get: 500 }], [{}, ""]]) {
    const sv = servidor(true, opc), aj = ajustesFalso();
    const api = monta(sv, aj, base); await espera();
    assert.strictEqual(aj.reg.registros, 0, JSON.stringify(opc) + base);
    assert.strictEqual(api.estado().visible, false);
    assert.ok(sv.peticiones.every(p => p.metodo === "GET"));
  }
  const api = monta(servidor(true), { A: undefined });   // un motor sin Ajustes
  assert.strictEqual(api.estado().visible, false);
});

test("libera(): quita la casilla y una respuesta tardía ya no registra nada", async () => {
  const sv = servidor(true), aj = ajustesFalso();
  const api = monta(sv, aj); await espera();
  api.libera(); assert.strictEqual(aj.reg.quitados, 1);
  const sv2 = servidor(true), aj2 = ajustesFalso();
  monta(sv2, aj2).libera(); await espera();
  assert.strictEqual(aj2.reg.registros, 0);
});

test("registro: bandera ?avisos=, sin GPU, sin eventos; ni innerHTML ni otro host", () => {
  assert.match(FUENTE, /id: "avisos-correo"/); assert.match(FUENTE, /bandera: \{ defecto: true, url: "avisos" \}/);
  assert.match(FUENTE, /presupuesto: \{ llamadas: 0, triangulos: 0 \}/);
  assert.doesNotMatch(FUENTE, /innerHTML|https?:\/\//);
  assert.doesNotMatch(FUENTE, /new THREE|THREE\./);
});
