// La red (MUNDOS §1): salas, identidades y temas, sin three ni nada de dentro de un mundo; solo importa de datos/. El legado la ve como `Mundos.<nombre>`
// porque mundos/index.ts la reexporta (mundos/ puede importar de red/; nucleo/ no): así no hace falta un tercer alias en genera_motor.mjs.
// MU5-n (A3-6a): el componente de la red (antes 37_red.js).
export { ID_RED, RedPuro, manifiestoRed } from "./salas.ts";
export type { DepsRed, Red } from "./salas.ts";
// A3-6a: la pose (códec y búfer) y la lógica de la sala de la presencia (antes el trozo puro de 26_presencia.js).
export { BufferPose, PoseCodec } from "./pose.ts";
export { Aspecto, AutoPresencia, Chat, Reintento, SalaPose } from "./sala.ts";
// A3-6b (MU5-n): la voz (antes 45_voz.js) y la lógica pura del micro (47_habla.js) y del corro (47b_corro.js), de todo mundo. Lo que dibuja de esos dos
// (la caja, los diálogos, las láminas, los halos) vive en mundos/comun/habla.ts y corro.ts.
export { ID_VOZ, VozPuro, creaVoz, manifiestoVoz } from "./voz/voz.ts";
export type { DepsVoz, Voz } from "./voz/voz.ts";
export { HablaPuro } from "./voz/habla.ts";
export { CorroPuro } from "./voz/corro.ts";
// A3-7b2 (MU5-n): la tarjeta del estreno del micro (antes 46b_primera_vez.js): lógica pura, sin componente.
export { PrimeraVezPuro } from "./voz/primera-vez.ts";
