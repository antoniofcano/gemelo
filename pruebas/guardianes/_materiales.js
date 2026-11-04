"use strict";
// La fábrica de materiales (02i_materiales.js) y el renderizador elegido (02h_render.js) y los estáticos (02j_estaticos.js) evaluados en Node, para las pruebas que ejecutan un módulo
// del motor en un vm y necesitan `Materiales` (F1 de doc/sistema/MULTIVIEW.md). Es el código de verdad, no un doble: devuelve lo mismo que en la página.
//   const { fabrica } = require("./_materiales");  const { Materiales, Render, InfoDibujo, RenderPuro, Estaticos } = fabrica(THREE, { busqueda: "?render=nuevo" });
const vm = require("vm");
const { lee } = require("./_util");

function fabrica(THREE, o) {
  o = o || {};
  const g = { THREE, location: { search: o.busqueda || "" }, console: o.console || { warn() {}, error() {} }, Promise };
  if (o.build) g.__GEMELO_BUILD__ = o.build;
  vm.runInContext("\"use strict\";\n" + lee("apps/web/motor/02h_render.js") + lee("apps/web/motor/02i_materiales.js") + lee("apps/web/motor/02j_estaticos.js") +
    "\nthis.Estaticos = Estaticos; this.Materiales = Materiales; this.Render = Render; this.InfoDibujo = InfoDibujo; this.RenderPuro = RenderPuro;", vm.createContext(g), { filename: "02h-02i" });
  return { Materiales: g.Materiales, Render: g.Render, InfoDibujo: g.InfoDibujo, RenderPuro: g.RenderPuro, Estaticos: g.Estaticos };
}

/** el contexto g de una prueba (vm o new Function) con la fábrica y el lector de dibujo, si no los trae: con su THREE (de verdad o de mentira) */
function conFabrica(g) {
  if (!g.Materiales || !g.InfoDibujo || !g.Estaticos) { const f = fabrica(g.THREE); if (!g.Materiales) g.Materiales = f.Materiales; if (!g.InfoDibujo) g.InfoDibujo = f.InfoDibujo; if (!g.Estaticos) g.Estaticos = f.Estaticos; }
  return g;
}

module.exports = { fabrica, conFabrica };
