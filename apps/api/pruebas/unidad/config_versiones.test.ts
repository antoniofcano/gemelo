// La validación de la configuración versionada (apps/api/src/config/valida.ts; contratos/config.schema.json): el ejemplo vale,
// los límites de la decisión 111 (las gafas solo bajan respecto a VR_PERFILES del código), las reglas entre umbrales y las
// épocas que cubren los 366 días. Sin base de datos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { esOficina } from "../../src/config/rutas.ts";
import { validaConfig, validaTabla } from "../../src/config/valida.ts";
import { CONTRATOS, RAIZ } from "../apoyo/esquemas.ts";

const EJEMPLO = JSON.parse(readFileSync(CONTRATOS + "config-ejemplo.json", "utf8")) as Record<string, any>;
const CALENDARIO = JSON.parse(readFileSync(CONTRATOS + "epocas-calendario.json", "utf8")) as { comun: Record<string, { desde: string; hasta: string }> };
const copia = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const con = (f: (c: Record<string, any>) => void) => { const c = copia(EJEMPLO); f(c); return c; };

test("el ejemplo del contrato vale; { v: 1 } solo también", () => {
  assert.deepEqual(validaConfig(EJEMPLO), []);
  assert.deepEqual(validaConfig({ v: 1 }), []);
  assert.notDeepEqual(validaConfig({ v: 2 }), []);
  assert.notDeepEqual(validaConfig({ v: 1, otra: 1 }), [], "lo que sobra se rechaza");
});

test("límites de la escalera (decisión 111): fuera de rango se rechaza, en el borde vale", () => {
  const malos: [string, (c: Record<string, any>) => void][] = [
    ["E0 < 300", c => { c.escalera.umbralesPx.e0 = 299; }],
    ["E2 > 400", c => { c.escalera.umbralesPx = { e0: 2000, e1: 1000, e2: 401 }; }],
    ["banda > 3", c => { c.escalera.bandaM = 3.01; }],
    ["histéresis < 3 %", c => { c.escalera.histeresis = 0.02; }],
    ["propios 9", c => { c.escalera.maxPropios = 9; }],
    ["propios 1,5", c => { c.escalera.maxPropios = 1.5; }],
    ["propios en gafas 5", c => { c.escalera.maxPropiosGafas = 5; }],
    ["variantes 65", c => { c.escalera.maxVariantes = 65; }],
    ["escritorio 700.001", c => { c.escalera.triangulos.escritorio = 700001; }],
    ["móvil 119.999", c => { c.escalera.triangulos.movil = 119999; }],
    ["E0 en gafas 0,6", c => { c.escalera.fraccionE0Gafas = 0.6; }],
    ["factor de copa 0,4", c => { c.escalera.factorCopa = 0.4; }],
    ["umbrales a medias", c => { c.escalera.umbralesPx = { e0: 700 }; }],
    ["campo desconocido", c => { c.escalera.experto = 1; }],
  ];
  for (const [k, f] of malos) assert.notDeepEqual(validaConfig(con(f)), [], "debería fallar: " + k);
  const bordes = con(c => { c.escalera = { umbralesPx: { e0: 2000, e1: 1000, e2: 400 }, bandaM: 0, histeresis: 0.2, maxPropios: 8, maxPropiosGafas: 1, maxVariantes: 0,
    triangulos: { escritorio: 300000, movil: 300000, gafas: [380000, 270000, 190000, 130000] }, fraccionE0Gafas: 0.5, factorCopa: 1.5 }; });
  assert.deepEqual(validaConfig(bordes), []);
});

test("las gafas solo bajan: un perfil por encima del código (29_vr.js VR_PERFILES) se rechaza", () => {
  const codigo = [...readFileSync(RAIZ + "apps/web/motor/29_vr.js", "utf8").match(/var VR_PERFILES = \[(.*?)\];/)![1]!.matchAll(/tri: (\d+)/g)].map(m => Number(m[1]));
  assert.equal(codigo.length, 4);
  assert.deepEqual(validaConfig(con(c => { c.escalera.triangulos.gafas = codigo; })), [], "igual que el código vale");
  for (let i = 0; i < 4; i++) {
    const g = codigo.slice(); g[i] = g[i]! + 1;
    assert.notDeepEqual(validaConfig(con(c => { c.escalera.triangulos.gafas = g; })), [], "perfil " + i + " por encima del código");
  }
  assert.notDeepEqual(validaConfig(con(c => { c.escalera.triangulos.gafas = codigo.slice(0, 3); })), [], "faltan perfiles");
  assert.notDeepEqual(validaConfig(con(c => { c.escalera.triangulos.gafas = [...codigo, 1]; })), [], "sobran perfiles");
});

test("reglas entre umbrales: E1 ≤ E0 / 1,5 y E2 ≤ E1 / 1,5", () => {
  assert.deepEqual(validaConfig(con(c => { c.escalera.umbralesPx = { e0: 750, e1: 500, e2: 333 }; })), []);
  assert.match(validaConfig(con(c => { c.escalera.umbralesPx = { e0: 700, e1: 500, e2: 90 }; })).join(), /e1/);
  assert.match(validaConfig(con(c => { c.escalera.umbralesPx = { e0: 700, e1: 250, e2: 200 }; })).join(), /e2/);
});

test("épocas: el calendario del repo cubre los 366 días; huecos, solapes y fechas raras se rechazan", () => {
  assert.deepEqual(validaTabla(CALENDARIO.comun), []);
  assert.deepEqual(validaConfig({ v: 1, epocas: { comun: CALENDARIO.comun, fincas: { hituelo: CALENDARIO.comun } } }), []);
  const hueco = copia(CALENDARIO.comun); hueco["verde"]!.hasta = "09-08";
  assert.match(validaConfig({ v: 1, epocas: { comun: hueco } }).join(), /09-09: sin época/);
  const solape = copia(CALENDARIO.comun); solape["flor"]!.hasta = "06-12";
  assert.match(validaConfig({ v: 1, epocas: { comun: CALENDARIO.comun, fincas: { cerro: solape } } }).join(), /fincas\/cerro .*varias/);
  const sinFebrero = copia(CALENDARIO.comun); sinFebrero["reposo"]!.hasta = "02-28"; sinFebrero["boton"]!.desde = "03-01";
  assert.match(validaConfig({ v: 1, epocas: { comun: sinFebrero } }).join(), /02-29: sin época/, "el 29 de febrero también cuenta");
  assert.notDeepEqual(validaConfig({ v: 1, epocas: { comun: Object.assign(copia(CALENDARIO.comun), { flor: { desde: "13-01", hasta: "06-09" } }) } }), []);
  assert.notDeepEqual(validaConfig({ v: 1, epocas: { fincas: {} } }), [], "comun es obligatoria");
});

test("componentes: el bloque de C1 sigue igual", () => {
  assert.deepEqual(validaConfig({ v: 1, componentes: { "fichas-tiempo": { activo: false, parametros: { a: 1 } } } }), []);
  assert.notDeepEqual(validaConfig({ v: 1, componentes: { Fichas: { activo: true } } }), []);
  assert.notDeepEqual(validaConfig({ v: 1, componentes: { a: { activo: "si" } } }), []);
});

test("quién ve la versión en prueba: la oficina (oficina, admin), no los hogares", () => {
  assert.equal(esOficina("admin"), true); assert.equal(esOficina("oficina"), true);
  for (const r of ["hogar", "guia", "corresponsal", undefined]) assert.equal(esOficina(r), false, String(r));
});
