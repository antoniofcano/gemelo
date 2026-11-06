// La puerta del núcleo hacia el legado (MUNDOS §9.3): lo que exporta este fichero es lo que ve la IIFE de apps/web/motor/ como `Nucleo.<nombre>`.
// genera_motor.mjs escribe `import * as Nucleo from "@gemelo/nucleo";` delante del motor concatenado; el alias «@gemelo/nucleo» → este fichero
// está en vite.config.js (las dos builds) y en tsconfig.json («paths»). Un módulo legado migrado queda en motor/ como talón: `var X = Nucleo.X;`.
// Regla: nada de aquí lee globales del legado al cargarse; lo que necesite del legado lo recibe por argumento cuando el talón llama a su fábrica.
export { partesDeVersion } from "./version.ts";
export { CargaPuro, creaCola, duenoDe } from "./cola.ts";
export { RenderPuro, InfoDibujo, creaRender } from "./render.ts";
export { XrPerillasPuro, creaXrPerillas } from "./xr-perillas.ts";
export { EntidadesPuro } from "./entidades.ts";
export { LlegadaPuro, IrAPuro } from "./locomocion.ts";
export { VrPresupuestoPuro, VrControlPuro, creaVrPresupuesto } from "./presupuesto.ts";
export { ESTADO_INICIAL, creaEstado } from "./estado.ts";
export type { Estado, Modo } from "./estado.ts";
export { FUNDIDO_S, SALTO_FUNDIDO_M, FundidoPuro, creaFundido } from "./fundido.ts";
export type { Fundido, FaseFundido } from "./fundido.ts";
export { BuclePuro, creaBucle } from "./bucle.ts";
export type { Bucle, DepsBucle, PasoBucle } from "./bucle.ts";
