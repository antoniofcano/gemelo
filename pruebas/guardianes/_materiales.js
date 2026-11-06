"use strict";
// La fábrica de materiales (02i_materiales.js) y el renderizador elegido (02h_render.js) y los estáticos (02j_estaticos.js) evaluados en Node, para las pruebas que ejecutan un módulo
// del motor en un vm y necesitan `Materiales` (F1 de doc/sistema/MULTIVIEW.md). Es el código de verdad, no un doble: devuelve lo mismo que en la página.
//   const { fabrica } = require("./_materiales");  const { Materiales, Render, InfoDibujo, RenderPuro, Estaticos } = fabrica(THREE, { busqueda: "?render=nuevo" });
const vm = require("vm");
const { lee } = require("./_util");
const NUCLEO = require("./_nucleo");   // el núcleo de TypeScript, el mismo que ve la IIFE por «import * as Nucleo» (MUNDOS §9.3)

function fabrica(THREE, o) {
  o = o || {};
  const g = { THREE, Nucleo: NUCLEO, location: { search: o.busqueda || "" }, console: o.console || { warn() {}, error() {} }, Promise };
  if (o.build) g.__GEMELO_BUILD__ = o.build;
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/02h_render.js") + lee("apps/web/motor/02i_materiales.js") + lee("apps/web/motor/02j_estaticos.js") + lee("apps/web/motor/02k_fusiona.js") +
    "\nthis.fusionaGeometrias = fusionaGeometrias; this.Estaticos = Estaticos; this.Materiales = Materiales; this.Render = Render; this.InfoDibujo = InfoDibujo;", vm.createContext(g), { filename: "02h-02i" });
  return { Materiales: g.Materiales, Render: g.Render, InfoDibujo: g.InfoDibujo, RenderPuro: NUCLEO.RenderPuro, Estaticos: g.Estaticos, fusionaGeometrias: g.fusionaGeometrias };
}

/** el contexto g de una prueba (vm o new Function) con la fábrica y el lector de dibujo, si no los trae: con su THREE (de verdad o de mentira).
 *  También el Nucleo de verdad, si no lo trae: 02c_componentes.js crea Componentes con Nucleo.creaComponentes (MU2-5); y Mundos (A3-1b) */
function conFabrica(g) {
  if (!g.Nucleo) g.Nucleo = NUCLEO;
  if (!g.Mundos) g.Mundos = require("./_mundos");   // A3-1b: los talones de 04b, 04c, 04e y 04f toman de Mundos su fábrica
  if (!g.Materiales || !g.InfoDibujo || !g.Estaticos || !g.fusionaGeometrias) { const f = fabrica(g.THREE); if (!g.Materiales) g.Materiales = f.Materiales; if (!g.InfoDibujo) g.InfoDibujo = f.InfoDibujo; if (!g.Estaticos) g.Estaticos = f.Estaticos; if (!g.fusionaGeometrias) g.fusionaGeometrias = f.fusionaGeometrias; }
  return g;
}

module.exports = { fabrica, conFabrica };
