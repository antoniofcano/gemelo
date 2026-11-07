"use strict";
// La fábrica de materiales (02i_materiales.js) y el renderizador elegido (02h_render.js) y los estáticos (02j_estaticos.js) evaluados en Node, para las pruebas que ejecutan un módulo
// del motor en un vm y necesitan `Materiales` (F1 de doc/sistema/MULTIVIEW.md). Es el código de verdad, no un doble: devuelve lo mismo que en la página.
//   const { fabrica } = require("./_materiales");  const { Materiales, Render, InfoDibujo, RenderPuro, Estaticos } = fabrica(THREE, { busqueda: "?render=nuevo" });
const vm = require("vm");
const { lee } = require("./_util");
const { pasoArranque } = require("./_pasos");   // A3-8c: los pasos de apps/web/src/arranque.ts (antes, los ficheros de apps/web/motor/)
const NUCLEO = require("./_nucleo");   // el núcleo de TypeScript, el mismo que ve la IIFE por «import * as Nucleo» (MUNDOS §9.3)

function fabrica(THREE, o) {
  o = o || {};
  const g = { THREE, Nucleo: NUCLEO, location: { search: o.busqueda || "" }, console: o.console || { warn() {}, error() {} }, Promise };
  if (o.build) g.__GEMELO_BUILD__ = o.build;
  vm.runInContext("\"use strict\";\n" + pasoArranque("02h_render.js") + pasoArranque("02i_materiales.js") + pasoArranque("02j_estaticos.js") + pasoArranque("02k_fusiona.js") +
    "\nthis.fusionaGeometrias = fusionaGeometrias; this.Estaticos = Estaticos; this.Materiales = Materiales; this.Render = Render; this.InfoDibujo = InfoDibujo;", vm.createContext(g), { filename: "02h-02i" });
  return { Materiales: g.Materiales, Render: g.Render, InfoDibujo: g.InfoDibujo, RenderPuro: NUCLEO.RenderPuro, Estaticos: g.Estaticos, fusionaGeometrias: g.fusionaGeometrias };
}

/** el contexto g de una prueba (vm o new Function) con la fábrica y el lector de dibujo, si no los trae: con su THREE (de verdad o de mentira).
 *  También el Nucleo de verdad, si no lo trae: 02c_componentes.js crea Componentes con Nucleo.creaComponentes (MU2-5); y Mundos (A3-1b) */
function conFabrica(g) {
  conEstados(g);
  if (!g.Nucleo) g.Nucleo = NUCLEO;
  if (!g.Mundos) g.Mundos = require("./_mundos");   // A3-1b: los talones de 04b, 04c, 04e y 04f toman de Mundos su fábrica
  if (!g.Interfaz) g.Interfaz = require("./_ui");   // A3-7b2: los talones de la interfaz (46_guiada…) toman de Interfaz su manifiesto
  if (!g.Materiales || !g.InfoDibujo || !g.Estaticos || !g.fusionaGeometrias) { const f = fabrica(g.THREE); if (!g.Materiales) g.Materiales = f.Materiales; if (!g.InfoDibujo) g.InfoDibujo = f.InfoDibujo; if (!g.Estaticos) g.Estaticos = f.Estaticos; if (!g.fusionaGeometrias) g.fusionaGeometrias = f.fusionaGeometrias; }
  return g;
}

/** A3-8c: las primitivas del arranque viven en el objeto de su dueño (Paseo.E, Vida.E, FactorR8.E, Paisaje.agua(), Follaje.sombras(), Historia.OT y .VIVO).
 *  Las pruebas que evalúan un paso con su estado suelto en g (`paseando: true`, `tVida: 0`, `FACTOR_R8: 0.5`…) lo siguen dando así: aquí ese estado se ve
 *  también por los objetos, que leen y escriben g en cada uso (no es una copia). Lo que la prueba ya trae (su propio Paseo, su Vida…) no se toca. */
function conEstados(g) {
  const vista = ks => { const E = {}; for (const k of ks) Object.defineProperty(E, k, { get: () => g[k], set: v => { g[k] = v; }, enumerable: true }); return E; };
  if (!g.Paseo) g.Paseo = { E: vista(["paseando", "persona", "teclas", "primera"]) };
  if (!g.Vida) g.Vida = { E: vista(["tVida", "enQuad", "vq", "enDron"]) };
  if (!g.FactorR8) g.FactorR8 = { E: { get r8() { return g.FACTOR_R8 !== undefined ? g.FACTOR_R8 : 0.5; }, get gen() { return g.FACTOR_R8_GEN !== undefined ? g.FACTOR_R8_GEN : 1; } },
    deConfig: () => (g.factorCopaDeConfig ? g.factorCopaDeConfig() : g.FactorR8.E.gen) };
  if (!g.Paisaje) g.Paisaje = { agua: () => g.aguaNivel || 0 };
  if (!g.Follaje) g.Follaje = { sombras: () => g.instSombra || null };
  if (!g.Historia) g.Historia = { get OT() { return g.OT; }, get VIVO() { return g.VIVO; } };
  return g;
}

module.exports = { fabrica, conFabrica, conEstados };
