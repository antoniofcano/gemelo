// La red (MUNDOS §1): salas, identidades y temas, sin three ni nada de dentro de un mundo; solo importa de datos/. El legado la ve como `Mundos.<nombre>`
// porque mundos/index.ts la reexporta (mundos/ puede importar de red/; nucleo/ no): así no hace falta un tercer alias en genera_motor.mjs.
// MU5-n (A3-6a): el componente de la red (antes 37_red.js).
export { ID_RED, RedPuro, manifiestoRed } from "./salas.ts";
export type { DepsRed, Red } from "./salas.ts";
// A3-6a: la pose (códec y búfer) y la lógica de la sala de la presencia (antes el trozo puro de 26_presencia.js).
export { BufferPose, PoseCodec } from "./pose.ts";
export { Aspecto, AutoPresencia, Chat, Reintento, SalaPose } from "./sala.ts";
