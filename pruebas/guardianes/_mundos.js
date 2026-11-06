"use strict";
// Los mundos de TypeScript (apps/web/src/mundos/index.ts) cargados en Node: el mismo `Mundos` que ve la IIFE del motor por `import * as Mundos` (MUNDOS §9.3).
// Como _nucleo.js: Node >= 24 carga el .ts quitando los tipos. Las pruebas que evalúan un módulo del motor en un vm o con new Function y que ya es un talón
// de un componente del exterior (04b, 04c, 04e, 04f) lo reciben de aquí.
//   const Mundos = require("./_mundos");
const path = require("path");
const { RAIZ } = require("./_util");

module.exports = require(path.join(RAIZ, "apps/web/src/mundos/index.ts"));
