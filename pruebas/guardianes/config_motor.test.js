"use strict";
// La configuración versionada en el motor (C6 de ADR-0023, OF6 de doc/sistema/OFICINA.md): ConfigPuro y Config de apps/web/motor/02c_componentes.js,
// en Node y sin navegador:
//   · los límites del motor (ConfigPuro.LIMITES) son los de contratos/config.schema.json, y los máximos de gafas, los VR_PERFILES[].tri de 29_vr.js;
//   · precedencia URL > configuración > código, recorte a los límites (enteros, «solo baja» en gafas), umbrales que van juntos y con sus reglas;
//   · épocas: la tabla de la configuración solo si cubre los 366 días; la época de cada día, igual que apps/web/olivo/epocas.js;
//   · la lectura: sin servidor no pide nada; 200 → la configuración; 401/404/503, sin red, respuesta rara o tarde → el código, SIN escribir en consola;
//   · Config entero (02c con una ventana de mentira): aplica el bloque «componentes», avisa a quien espera (Config.al) y recorta lo que se le pide;
//   · cada parámetro del contrato lo lee algún módulo del motor (01_datos, 07ab, 07b, 29_vr), con la URL por delante donde la hay.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");
const contratoModulos = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));

const NUCLEO = lee("apps/web/motor/02c_componentes.js");
const trozo = (s, ini, fin) => { const i = s.indexOf(ini), f = s.indexOf(fin); assert.ok(i >= 0 && f > i, "faltan las marcas"); return s.slice(i, f); };
const { ConfigPuro: P } = new Function("\"use strict\";\n" + trozo(NUCLEO, "// [puro:inicio]", "// [puro:fin]") + "\nreturn { ConfigPuro };")();
const json = f => JSON.parse(lee(f));
const ESQ = json("contratos/config.schema.json"), EJ = json("contratos/config-ejemplo.json"), CAL = json("contratos/epocas-calendario.json");
const VR_TRI = [...lee("apps/web/motor/29_vr.js").match(/var VR_PERFILES = \[(.*?)\];/)[1].matchAll(/tri: (\d+)/g)].map(m => Number(m[1]));
const sinCabecera = s => s.slice(s.indexOf(contratoModulos.MARCA_F) + contratoModulos.MARCA_F.length + 1);

// ---------- el contrato y el motor dicen lo mismo
test("los límites del motor son los del esquema (y los máximos de gafas, los VR_PERFILES del código)", () => {
  const esc = ESQ.properties.escalera.properties, vistos = [];
  (function recorre(nodo, ruta) {
    if (nodo.type === "number" || nodo.type === "integer") {
      const L = P.LIMITES[ruta]; vistos.push(ruta);
      assert.ok(L, "el motor no tiene límites para " + ruta);
      assert.deepStrictEqual([L[0], L[1], !!L[2]], [nodo.minimum, nodo.maximum, nodo.type === "integer"], ruta);
    } else if (nodo.properties) for (const [k, v] of Object.entries(nodo.properties)) recorre(v, ruta + "." + k);
    else if (nodo.prefixItems) {
      const L = P.LIMITES[ruta]; vistos.push(ruta);
      assert.ok(L && L[2] && L[3], ruta + ": enteros y solo a la baja");
      assert.deepStrictEqual(nodo.prefixItems.map(x => x.maximum), VR_TRI, "los máximos de gafas del esquema son los VR_PERFILES[].tri de 29_vr.js");
      assert.ok(nodo.prefixItems.every(x => x.minimum === L[0] && x.type === "integer"), ruta + ": mínimo " + L[0]);
      assert.strictEqual(L[1], Math.max(...VR_TRI));
    }
  })({ properties: esc }, "escalera");
  assert.deepStrictEqual(vistos.sort(), Object.keys(P.LIMITES).sort(), "ni un límite de más ni de menos");
});

test("el ejemplo del contrato cumple el esquema y sus reglas entre campos", async () => {
  const Ajv2020 = require("ajv/dist/2020").default, v = new Ajv2020({ strict: true, strictRequired: false, allErrors: true }).compile(ESQ);
  assert.ok(v(EJ), JSON.stringify(v.errors));
  assert.deepStrictEqual(P.umbrales(EJ, [700, 250, 90]).origen, "config");
  assert.ok(P.tablaEpocas(EJ, "hituelo"), "las épocas del ejemplo cubren el año");
  assert.ok(v({ v: 1 }), "todo es opcional");
});

// ---------- precedencia y recorte
test("precedencia URL > configuración > código, y recorte a los límites", () => {
  const cfg = { v: 1, escalera: { bandaM: 9, histeresis: 0.01, maxPropios: 5.6, maxVariantes: 40, factorCopa: "1,2", triangulos: { escritorio: 900000, gafas: [400000, 100000, 190000, 10] } } };
  assert.deepStrictEqual(P.param(cfg, "escalera.bandaM", 1.5), { v: 3, origen: "config" }, "recortada al máximo");
  assert.deepStrictEqual(P.param(cfg, "escalera.bandaM", 1.5, 0.7), { v: 0.7, origen: "url" }, "la URL manda (con sus topes)");
  assert.deepStrictEqual(P.param(cfg, "escalera.histeresis", 0.08), { v: 0.03, origen: "config" }, "recortada al mínimo");
  assert.deepStrictEqual(P.param(cfg, "escalera.maxPropios", 6), { v: 6, origen: "config" }, "entero: 5,6 → 6");
  assert.deepStrictEqual(P.param(cfg, "escalera.factorCopa", 1), { v: 1, origen: "codigo" }, "lo que no es número no vale");
  assert.deepStrictEqual(P.param(cfg, "escalera.fraccionE0Gafas", 0.4), { v: 0.4, origen: "codigo" }, "lo que falta, del código");
  assert.deepStrictEqual(P.param(null, "escalera.maxVariantes", 48), { v: 48, origen: "codigo" }, "sin configuración, el código");
  assert.deepStrictEqual(P.param(cfg, "escalera.maxVariantes", 48, null), { v: 40, origen: "config" }, "null en la URL = no hay URL");
  assert.deepStrictEqual(P.param(cfg, "escalera.triangulos.escritorio", 550000), { v: 700000, origen: "config" });
  // gafas: solo a la baja respecto al código y nunca por debajo del mínimo
  assert.deepStrictEqual(VR_TRI.map((c, i) => P.param(cfg, "escalera.triangulos.gafas." + i, c).v), [380000, 100000, 190000, 50000]);
  assert.deepStrictEqual(P.param({ v: 1, escalera: { triangulos: { gafas: [380000, 270000, 190000, 130000] } } }, "escalera.triangulos.gafas.0", 200000).v, 200000,
    "si el código de un aparato ya baja (perfil cambiado en el código), la configuración no lo sube");
  assert.strictEqual(P.param(cfg, "escalera.desconocido", 7).origen, "codigo");
});

test("umbrales: van juntos, recortados, con E1 ≤ E0/1,5 y E2 ≤ E1/1,5; si no, los del código", () => {
  const C = [700, 250, 90], u = x => ({ v: 1, escalera: { umbralesPx: x } });
  assert.deepStrictEqual(P.umbrales(u({ e0: 800, e1: 300, e2: 100 }), C), { v: [800, 300, 100], origen: "config" });
  assert.deepStrictEqual(P.umbrales(u({ e0: 5000, e1: 300, e2: 100 }), C).v, [2000, 300, 100], "recortados");
  assert.strictEqual(P.umbrales(u({ e0: 700, e1: 600, e2: 90 }), C).origen, "codigo");
  assert.match(P.umbrales(u({ e0: 700, e1: 250, e2: 200 }), C).motivo, /incoherentes/);
  assert.strictEqual(P.umbrales(u({ e0: 700 }), C).origen, "codigo", "a medias, no");
  assert.deepStrictEqual(P.umbrales(u({ e0: 800, e1: 300, e2: 100 }), C, [900, 300, 80]), { v: [900, 300, 80], origen: "url" });
  assert.deepStrictEqual(P.umbrales(null, C), { v: C, origen: "codigo" });
});

test("épocas: la tabla de la configuración solo si cubre los 366 días; la de la finca reemplaza a la común; la época de cada día como epocas.js", async () => {
  const E = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "olivo", "epocas.js")).href);
  const cfg = { v: 1, epocas: { comun: CAL.comun } };
  const t = P.tablaEpocas(cfg, "hituelo"); assert.ok(t);
  for (let d = 0; d < 366; d++) { const f = new Date(Date.UTC(2024, 0, 1 + d)); assert.strictEqual(P.epocaDeFecha(t, f), E.epocaDeFecha(t, f), f.toISOString()); }
  assert.deepStrictEqual(P.validaTabla(CAL.comun), E.validaTabla(CAL.comun));
  const hueco = JSON.parse(JSON.stringify(CAL.comun)); hueco.verde.hasta = "09-01";
  assert.ok(P.validaTabla(hueco).length && E.validaTabla(hueco).length, "las dos ven el hueco");
  assert.strictEqual(P.tablaEpocas({ v: 1, epocas: { comun: hueco } }, "hituelo"), null);
  const propia = JSON.parse(JSON.stringify(CAL.comun)); propia.verde.hasta = "09-14"; propia.envero.desde = "09-15";
  const c2 = { v: 1, epocas: { comun: CAL.comun, fincas: { cerro: propia } } };
  assert.strictEqual(P.epocaDeFecha(P.tablaEpocas(c2, "cerro"), new Date("2026-09-12T10:00:00Z")), "verde");
  assert.strictEqual(P.epocaDeFecha(P.tablaEpocas(c2, "hituelo"), new Date("2026-09-12T10:00:00Z")), "envero");
  assert.strictEqual(P.tablaEpocas({ v: 1 }, "hituelo"), null);
});

// ---------- la lectura
const respuesta = (status, cuerpo) => ({ status, json: () => Promise.resolve(cuerpo) });
test("lectura: sin servidor no pide; 200 → la configuración; 401/404/503, sin red, rara o tarde → el código; nunca escribe en consola", async () => {
  const consola = ["error", "warn", "log"].map(k => [k, console[k]]), escritos = [];
  for (const [k] of consola) console[k] = (...a) => escritos.push(k + ": " + a.join(" "));
  try {
    let pedidas = [];
    const f = r => (u, o) => { pedidas.push([u, o]); return typeof r === "function" ? r() : Promise.resolve(r); };
    assert.strictEqual(P.prefijoApi("", "datos/"), null); assert.strictEqual(P.prefijoApi("", "/teselas/hituelo/"), "/api/");
    assert.strictEqual(P.prefijoApi("?api=/prueba/", "datos/"), "/prueba/"); assert.strictEqual(P.prefijoApi("?api=https://otro.example/", "/teselas/x/"), null, "nunca otro host");
    let r = await P.lee({ fetch: f(respuesta(200, {})), prefijo: null });
    assert.deepStrictEqual([r.cfg, r.estado.motivo, pedidas.length], [null, "sin servidor", 0]);
    r = await P.lee({ fetch: f(respuesta(200, { version: 7, estado: "publicada", config: EJ })), prefijo: "/api/" });
    assert.deepStrictEqual([r.cfg, r.estado.origen, r.estado.version, r.estado.estadoVersion], [EJ, "servidor", 7, "publicada"]);
    assert.strictEqual(pedidas[0][0], "/api/config"); assert.strictEqual(pedidas[0][1].credentials, "same-origin");
    r = await P.lee({ fetch: f(respuesta(200, { version: null, estado: null, config: { v: 1 } })), prefijo: "/api/" });
    assert.deepStrictEqual([r.cfg, r.estado.origen, r.estado.motivo], [{ v: 1 }, "codigo", "sin versión publicada"]);
    for (const s of [401, 404, 503, 500]) {
      r = await P.lee({ fetch: f(respuesta(s, {})), prefijo: "/api/" });
      assert.deepStrictEqual([r.cfg, r.estado.motivo], [null, "http " + s]);
    }
    r = await P.lee({ fetch: f(() => Promise.reject(new TypeError("Failed to fetch"))), prefijo: "/api/" });
    assert.deepStrictEqual([r.cfg, r.estado.motivo], [null, "sin red o respuesta ilegible"]);
    r = await P.lee({ fetch: f({ status: 200, json: () => Promise.reject(new SyntaxError("x")) }), prefijo: "/api/" });
    assert.strictEqual(r.cfg, null);
    for (const raro of [null, [], { config: { v: 2 } }, { config: { v: 1, componentes: { A: { activo: 1 } } } }, { config: { v: 1, escalera: [] } }]) {
      r = await P.lee({ fetch: f(respuesta(200, raro)), prefijo: "/api/" });
      assert.strictEqual(r.cfg, null, JSON.stringify(raro));
    }
    r = await P.lee({ fetch: f(() => new Promise(res => setTimeout(() => res(respuesta(200, { version: 1, config: EJ })), 300))), prefijo: "/api/", espera: 50 });
    assert.deepStrictEqual([r.cfg, r.tarde], [null, true], "lo que llega tarde se ignora");
    assert.match(r.estado.motivo, /tarde/);
    await new Promise(res => setTimeout(res, 320));
  } finally { for (const [k, fn] of consola) console[k] = fn; }
  assert.deepStrictEqual(escritos, [], "ni un error ni un aviso en consola");
});

// ---------- Config entero, con 02c en una ventana de mentira
function nucleo({ base = "/teselas/hituelo/", busqueda = "", fetch: fetchFn } = {}) {
  const errores = [], consola = { error: (...a) => errores.push(a.join(" ")), warn: (...a) => errores.push(a.join(" ")), log() {} };
  const f = new Function("window", "location", "document", "console", "D", "fetch", "\"use strict\";\n" + sinCabecera(NUCLEO) + "\nreturn { Componentes, Config };");
  const r = f({ addEventListener() {} }, { search: busqueda }, { getElementById: () => null }, consola, { base }, fetchFn);
  r.errores = errores; return r;
}
const manifiesto = (id, log) => ({ id, consume: [], expone: [], eventos: { escucha: [], emite: [] }, bandera: { defecto: true }, presupuesto: { llamadas: 0, triangulos: 0 },
  fases: {}, actualiza: {}, monta: () => { log.push("monta " + id); return {}; }, libera: () => log.push("libera " + id) });

test("Config: con servidor aplica «componentes», avisa a quien espera y recorta; sin servidor no pide nada; la URL sigue mandando", async () => {
  const log = [], pedidas = [];
  const cfg = { v: 1, componentes: { "a-x": { activo: false } }, escalera: { bandaM: 2, triangulos: { gafas: [999999, 1, 190000, 130000] } } };
  const { Componentes: C, Config, errores } = nucleo({ fetch: u => { pedidas.push(u); return Promise.resolve(respuesta(200, { version: 3, estado: "en_prueba", config: cfg })); } });
  C.registra(manifiesto("a-x", log)); C.registra(manifiesto("b-y", log)); C.arranca();
  assert.deepStrictEqual(log.splice(0), ["monta a-x", "monta b-y"], "antes de llegar, los defectos");
  let visto = null; Config.al(c => { visto = c; });
  assert.strictEqual(visto, null, "aún no ha llegado");
  await Config.listo;
  assert.deepStrictEqual(pedidas, ["/api/config"]);
  assert.strictEqual(visto, cfg); assert.deepStrictEqual(log, ["libera a-x"], "la configuración apaga a-x");
  assert.strictEqual(C.activo("a-x"), false); assert.strictEqual(C.resumen().find(x => x.id === "a-x").origen, "servidor");
  assert.strictEqual(Config.param("escalera.bandaM", 1.5), 2);
  assert.deepStrictEqual(VR_TRI.map((c, i) => Config.param("escalera.triangulos.gafas." + i, c)), [VR_TRI[0], 50000, 190000, 130000]);
  const e = Config.estado();
  assert.deepStrictEqual([e.hecho, e.origen, e.version, e.estadoVersion], [true, "servidor", 3, "en_prueba"]);
  assert.deepStrictEqual(e.usados["escalera.bandaM"], { v: 2, origen: "config" });
  let tarde = null; Config.al(c => { tarde = c; }); assert.strictEqual(tarde, cfg, "quien llega después recibe la configuración al momento");
  assert.deepStrictEqual(errores, []);

  const otro = nucleo({ base: "datos/", fetch: () => { throw new Error("no debería pedir"); } });
  assert.strictEqual(await otro.Config.listo, null); assert.strictEqual(otro.Config.estado().motivo, "sin servidor");
  assert.strictEqual(otro.Config.param("escalera.bandaM", 1.5), 1.5); assert.deepStrictEqual(otro.errores, []);

  const caido = nucleo({ fetch: () => Promise.resolve(respuesta(401, {})) });
  assert.strictEqual(await caido.Config.listo, null); assert.strictEqual(caido.Config.estado().motivo, "http 401"); assert.deepStrictEqual(caido.errores, []);

  const log2 = [], url = nucleo({ busqueda: "?ax=1", fetch: () => Promise.resolve(respuesta(200, { version: 1, estado: "publicada", config: cfg })) });
  const m = manifiesto("a-x", log2); m.bandera = { defecto: true, url: "ax" }; url.Componentes.registra(m); url.Componentes.arranca(); await url.Config.listo;
  assert.strictEqual(url.Componentes.activo("a-x"), true, "?ax=1 manda sobre la configuración");
});

// ---------- quién lee cada parámetro
test("cada parámetro del contrato lo lee el motor (01_datos, 07ab, 07b, 29_vr), con la URL delante donde la hay; y se espera a la configuración antes del primer olivo", () => {
  const motor = ["01_datos.js", "07ab_generados.js", "07b_arboles.js", "29_vr.js"].map(f => lee("apps/web/motor/" + f)).join("\n");
  for (const ruta of Object.keys(P.LIMITES)) {
    const base = ruta.replace(/\.e[012]$/, "");
    assert.ok(motor.includes("\"" + ruta + "\"") || motor.includes("\"" + ruta + ".\"") || (base === "escalera.umbralesPx" && /Config\.umbrales\(/.test(motor)), "nadie lee " + ruta);
  }
  const G = lee("apps/web/motor/07ab_generados.js");
  assert.match(G, /Config\.umbrales\(Escalera\.UMBRALES, mU \? UMB : null\)/, "?olivosPx= manda");
  assert.match(G, /Config\.param\("escalera\.bandaM", Escalera\.BANDA, mB \? BANDA : null\)/, "?olivosBanda= manda");
  assert.match(G, /Config\.param\("escalera\.maxPropios", MAX_PROPIOS, mpr \? MAX_PROPIOS : null\)/, "?olivosPropios= manda");
  assert.match(G, /Promise\.all\(\[p, Config\.listo\]\)\.then\(function \(r\) \{\s*var m = r\[0\]; aplicaConfig\(\);/, "la configuración se aplica antes del primer olivo");
  assert.match(lee("apps/web/motor/01_datos.js"), /Config\.param\("escalera\.factorCopa", FACTOR_R8_GEN, FACTOR_R8_URL\)/, "?factorR8= manda");
  assert.match(lee("apps/web/motor/29_vr.js"), /Config\.al\(function \(\) \{ VR_PERFILES\.forEach\(function \(p, i\) \{ p\.tri = Config\.param\("escalera\.triangulos\.gafas\." \+ i, p\.tri\); \}\); \}\);/);
  assert.match(lee("apps/web/motor/07b_arboles.js"), /triMovil: TRI_MOVIL_CFG/);
});
