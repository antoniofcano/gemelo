// Los dobles del DOM para las pruebas de Vitest de ui/ (A3-7a, MU5-n). Desde A3-7b2 viven en nucleo/prueba-dom.ts, que pueden importar también los tests de mundos/ (una prueba de
// mundos/ no puede importar de ui/: la frontera de dependency-cruiser); esto solo los reexporta para las pruebas de ui/ de siempre. Solo lo importan los *.test.ts.
export { creaMundo } from "../nucleo/prueba-dom.ts";
export type { Mundo } from "../nucleo/prueba-dom.ts";
