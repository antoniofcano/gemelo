// Los dobles del DOM de las pruebas (A3-7a, MU5-n) viven desde A3-7b1 en nucleo/prueba-dom.ts, para que los use también la prueba de un mundo (que no puede importar de ui/).
// Esto los deja a mano de las pruebas de ui/ con el mismo nombre. Solo lo importan los *.test.ts.
export { creaMundo } from "../nucleo/prueba-dom.ts";
export type { Mundo } from "../nucleo/prueba-dom.ts";
