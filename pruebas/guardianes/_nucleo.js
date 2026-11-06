"use strict";
// El núcleo de TypeScript (apps/web/src/nucleo/index.ts) cargado en Node, el mismo que ve la IIFE del motor por `import * as Nucleo` (MUNDOS §9.3).
// Node >= 24 (package.json «engines») carga el .ts con require quitando los tipos. Para las pruebas de guardián que antes evaluaban el trozo [puro] de un
// módulo migrado con new Function / vm: ahora toman de aquí la fábrica o la lógica pura (Nucleo.creaXrPerillas, Nucleo.XrPerillasPuro, Nucleo.creaRender…).
//   const Nucleo = require("./_nucleo");
const path = require("path");
const { RAIZ } = require("./_util");

module.exports = require(path.join(RAIZ, "apps/web/src/nucleo/index.ts"));
