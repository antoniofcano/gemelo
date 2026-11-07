"use strict";
// La interfaz de TypeScript (apps/web/src/ui/index.ts) cargada en Node: la misma `Interfaz` que ve la IIFE del motor por `import * as Interfaz` (MUNDOS §1 y §9.3; A3-7a).
// Como _mundos.js: Node >= 24 carga el .ts quitando los tipos. Las pruebas que evalúan un módulo del motor con new Function y que ya es un talón de un componente de la
// interfaz (46_guiada, 43_agenda…) la reciben de aquí (conFabrica de _materiales.js la añade al contexto como `Interfaz`).
//   const Interfaz = require("./_ui");
const path = require("path");
const { RAIZ } = require("./_util");

module.exports = require(path.join(RAIZ, "apps/web/src/ui/index.ts"));
