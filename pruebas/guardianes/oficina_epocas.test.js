"use strict";
// La oficina, OF9: la pestaña Épocas de Olivos (apps/web/oficina/olivos.js y olivos_puro.js, doc/sistema/OFICINA.md §9.2). Siempre, y sin red ni Chrome:
//  - los valores de partida y el orden de las siete épocas son los del contrato (contratos/epocas-calendario.json, ORDEN_EPOCAS de apps/web/olivo/epocas.js);
//  - la comprobación de los 366 días de la pantalla dice lo mismo que `validaTabla` del hornero y del motor (apps/web/olivo/epocas.js) con tablas al azar
//    (la de la api, valida.ts, se contrasta en apps/api/pruebas/unidad/epocas_oficina.test.ts);
//  - del cuerpo del contrato a la pantalla y vuelta con «epocas» (común y por finca), y lo que sale lo acepta el esquema y lo toma el hornero (calendarioDe);
//  - la pestaña está en la página, con sus ids, y todo sigue con textContent (sin HTML a mano);
//  - re-hornear: la ruta y el botón, solo admin, con confirmación reciente.
const test = require("node:test"), assert = require("node:assert");
const { pathToFileURL } = require("url");
const { RAIZ, lee, path } = require("./_util");

const json = f => JSON.parse(lee(f));
const importa = (...p) => import(pathToFileURL(path.join(RAIZ, ...p)).href);
const ESQ = json("contratos/config.schema.json"), CAL = json("contratos/epocas-calendario.json");
const html = lee("apps/web/oficina/index.html"), olivos = lee("apps/web/oficina/olivos.js"), sistema = lee("apps/web/oficina/sistema.js");

const semilla = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const DIAS_MES = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const mmdd = n => { let m = 0; while (n >= DIAS_MES[m]) { n -= DIAS_MES[m]; m++; } return String(m + 1).padStart(2, "0") + "-" + String(n + 1).padStart(2, "0"); };
const ORDEN = ["reposo", "boton", "flor", "cuajado", "verde", "envero", "madura"];
/** Una tabla al azar: o una partición buena del año (con un giro al azar) o con huecos y solapes. */
function tablaAlAzar(r) {
  const cortes = []; while (cortes.length < 7) { const c = Math.floor(r() * 366); if (!cortes.includes(c)) cortes.push(c); } cortes.sort((a, b) => a - b);
  const t = {}; ORDEN.forEach((e, i) => { t[e] = { desde: mmdd(cortes[i]), hasta: mmdd((cortes[(i + 1) % 7] + 365) % 366) }; });
  if (r() < 0.5) { const e = ORDEN[Math.floor(r() * 7)], c = r() < 0.5 ? "desde" : "hasta"; t[e][c] = mmdd(Math.floor(r() * 366)); }   // la rompe (casi siempre)
  return t;
}

test("los valores de partida y el orden de las épocas son los del contrato", async () => {
  const P = await importa("apps", "web", "oficina", "olivos_puro.js"), E = await importa("apps", "web", "olivo", "epocas.js");
  assert.deepStrictEqual(P.EPOCAS.map(x => x[0]), E.ORDEN_EPOCAS, "el orden del ciclo");
  assert.deepStrictEqual(P.EPOCAS_PARTIDA, CAL.comun, "los valores de partida son contratos/epocas-calendario.json");
  assert.deepStrictEqual(P.validaTabla(P.tablaDePartida()), [], "y cubren el año");
  const ESQ_EP = Object.keys(ESQ.$defs.tabla.properties);
  assert.deepStrictEqual(ESQ_EP, ORDEN, "las siete épocas del esquema");
});

test("la comprobación de los 366 días de la pantalla dice lo mismo que la del hornero y el motor, con tablas al azar", async () => {
  const P = await importa("apps", "web", "oficina", "olivos_puro.js"), E = await importa("apps", "web", "olivo", "epocas.js");
  const r = semilla(9);
  let buenas = 0, malas = 0;
  for (let i = 0; i < 400; i++) {
    const t = tablaAlAzar(r), propia = P.validaTabla(t).filter(m => m.nivel === "mal").length === 0, ajena = E.validaTabla(t).length === 0;
    assert.strictEqual(propia, ajena, "mismo veredicto para " + JSON.stringify(t));
    if (propia) buenas++; else malas++;
    // y cuenta los mismos días por época que el calendario del hornero
    if (propia) { const c = P.cobertura(t); for (const e of ORDEN) assert.strictEqual(c.dias[e], Array.from({ length: 366 }, (_, d) => E.epocaDeFecha(t, new Date(Date.UTC(2024, 0, 1 + d)))).filter(x => x === e).length, e); }
  }
  assert.ok(buenas > 60 && malas > 60, "la prueba ve de las dos: " + buenas + " buenas, " + malas + " malas");
  // casos concretos con su mensaje
  const hueco = P.tablaDePartida(); hueco.flor.hasta = "06-01";
  assert.match(P.validaTabla(hueco)[0].texto, /8 días sin época \(06-02, 06-03, 06-04…\)/);
  const doble = P.tablaDePartida(); doble.verde.hasta = "09-12";
  assert.match(P.validaTabla(doble)[0].texto, /3 días con más de una época/);
  const mal = P.tablaDePartida(); mal.flor.desde = "02-30"; mal.boton.hasta = "13-01"; mal.cuajado.desde = "";
  assert.deepStrictEqual(P.validaTabla(mal).map(m => m.nivel), ["mal", "mal", "mal"], "una fecha que no existe se señala antes de contar días");
  const feb = P.tablaDePartida(); feb.reposo.hasta = "02-28"; feb.boton.desde = "02-29";
  assert.ok(P.validaTabla(feb).some(m => m.nivel === "av" && /febrero/.test(m.texto)), "un límite en febrero avisa (el 29 en un año normal)");
  assert.strictEqual(P.fechaValida("02-29"), true); assert.strictEqual(P.fechaValida("02-30"), false); assert.strictEqual(P.fechaValida("2-9"), false); assert.strictEqual(P.fechaValida("12-31"), true);
  assert.deepStrictEqual(P.validaEp(null), [], "sin épocas en la configuración no hay nada que comprobar (vale el calendario del repo)");
  const dos = { comun: P.tablaDePartida(), fincas: { hituelo: hueco } };
  assert.match(P.validaEp(dos)[0].texto, /^finca hituelo: 8 días sin época/);
});

test("del cuerpo a la pantalla y vuelta con las épocas (común y por finca); lo que sale lo acepta el esquema y lo toma el hornero", async () => {
  const P = await importa("apps", "web", "oficina", "olivos_puro.js"), SV = await importa("tuberia", "olivos", "servicio.mjs"), E = await importa("apps", "web", "olivo", "epocas.js");
  const Ajv2020 = require("ajv/dist/2020").default, v = new Ajv2020({ strict: true, strictRequired: false, allErrors: true }).compile(ESQ);
  assert.strictEqual(P.desdeCuerpo({ v: 1 }).ep, null, "sin bloque, sin épocas");
  assert.deepStrictEqual(P.aCuerpo(P.defectos(), {}, null, null), { v: 1 }, "sin épocas ni cambios, nada que escribir");
  const hit = P.tablaDePartida(); hit.verde.hasta = "09-14"; hit.envero.desde = "09-15";
  const ep = { comun: P.tablaDePartida(), fincas: { hituelo: hit } };
  const c = P.aCuerpo(P.defectos(), {}, null, ep);
  assert.deepStrictEqual(c, { v: 1, epocas: { comun: CAL.comun, fincas: { hituelo: hit } } });
  assert.ok(v(c), JSON.stringify(v.errors));
  assert.deepStrictEqual(P.desdeCuerpo(c).ep, ep, "ida y vuelta");
  assert.deepStrictEqual(P.aCuerpo(P.defectos(), {}, c, undefined).epocas, c.epocas, "sin `ep` (llamadas de antes) se conservan las del cuerpo base");
  assert.strictEqual(P.aCuerpo(P.defectos(), {}, c, null).epocas, undefined, "con null se quitan");
  assert.deepStrictEqual(P.normEp({ comun: CAL.comun, sobra: 1, fincas: { "Mal Id": hit, bien_1: hit } }).fincas, { bien_1: hit }, "un id de finca que el esquema no admite se descarta");
  // el hornero (calendarioDe) toma esas épocas, y la finca con tabla propia tiene la suya
  const tmp = require("fs").mkdtempSync(path.join(require("os").tmpdir(), "of9-")), rutaCfg = path.join(tmp, "publicada.json");
  require("fs").writeFileSync(rutaCfg, JSON.stringify(c));
  const cal = SV.calendarioDe(path.join(RAIZ, "contratos", "epocas-calendario.json"), rutaCfg, E.validaTabla);
  assert.strictEqual(cal.origen, "configuración");
  const dia = new Date("2026-09-12T00:00:00Z");
  assert.strictEqual(E.epocaDeFecha(E.tablaDe(cal.cal, "hituelo"), dia), "verde", "la tabla propia de hituelo");
  assert.strictEqual(E.epocaDeFecha(E.tablaDe(cal.cal, "cerro"), dia), "envero", "otra finca: la común (el 12-sep ya es envero)");
});

test("qué cambió: líneas legibles entre dos bloques de épocas y resumen del historial", async () => {
  const P = await importa("apps", "web", "oficina", "olivos_puro.js");
  const a = { comun: P.tablaDePartida(), fincas: {} }, b = { comun: P.tablaDePartida(), fincas: {} };
  assert.deepStrictEqual(P.cambiosEp(b, a), []); assert.ok(P.mismasEp(a, b)); assert.ok(P.mismasEp(null, null)); assert.ok(!P.mismasEp(a, null));
  b.comun.verde.hasta = "09-14"; b.comun.envero.desde = "09-15"; b.fincas.hituelo = P.tablaDePartida();
  assert.deepStrictEqual(P.cambiosEp(b, a), ["Épocas, Verde: 07-10–09-09 → 07-10–09-14", "Épocas, Envero: 09-10–10-31 → 09-15–10-31", "Épocas: tabla propia para la finca hituelo"]);
  assert.deepStrictEqual(P.cambiosEp(a, b).slice(-1), ["Épocas: la finca hituelo vuelve a la tabla común"]);
  assert.deepStrictEqual(P.cambiosEp(null, a), ["Épocas: se quitan las de la configuración (vuelve el calendario del repo)"]);
  assert.strictEqual(P.resumenEp(a), "épocas de partida"); assert.strictEqual(P.resumenEp(b), "épocas 2 ventanas ajustadas (tabla propia: hituelo)"); assert.strictEqual(P.resumenEp(null), "");
  assert.match(P.resumen(P.defectos(), {}, b), /épocas 2 ventanas ajustadas/);
  assert.strictEqual(P.resumen(P.defectos(), {}, null), "todo por defecto");
});

test("la pestaña está en la página con sus ids y la comprobación; el botón de re-hornear solo existe para admin y confirma", () => {
  for (const id of ["p-epo", "eEstado", "eFinca", "eTabla", "eMsgs", "eDef", "eRepo", "eNueva", "eAnade", "eQuita", "bRehornear", "sPedido"]) assert.match(html, new RegExp('id="' + id + '"'), id);
  assert.match(olivos, /\["epo", "Épocas"\]/);
  assert.match(html, /<label class="campo en-fila" for="eFinca">/);
  assert.match(olivos, /h\("label", \{ class: "vh", for: "ep-"/, "cada ventana lleva su etiqueta (accesible)");
  assert.match(html, /sin respaldo de campo/, "lo de partida se dice sin respaldo (decisión 68)");
  assert.match(sistema, /api\("POST", "\/api\/admin\/hornero\/rehornear", \{\}\)/);
  assert.match(sistema, /conConfirmacion\(\(\) => api\("POST", "\/api\/admin\/hornero\/rehornear"/);
  assert.match(sistema, /b\.hidden = !esAdmin\(\)/);
  assert.ok(!/innerHTML|insertAdjacentHTML|\.style\b/.test(olivos + sistema), "nada de HTML a mano");
  const api = lee("apps/api/src/admin/sistema.ts"), openapi = lee("contratos/api.openapi.yaml");
  assert.match(api, /\/api\/admin\/hornero\/rehornear", \{ preHandler: \[requiereRol\("admin"\), requiereConfirmacionReciente\(\)\]/, "solo admin y con confirmación reciente");
  assert.ok(openapi.includes("  /api/admin/hornero/rehornear:"), "está en api.openapi.yaml");
  assert.match(api, /audita\(bd, req\.session\.hogarId!, "hornero\.rehornear"/, "queda en la auditoría");
});
