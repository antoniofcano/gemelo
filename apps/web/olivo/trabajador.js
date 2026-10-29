// Trabajador (Web Worker de módulo) que genera recetas fuera del hilo principal. Mensaje de entrada: {id, entrada, nivel?};
// de salida: {id, receta} con todos sus arrays TRANSFERIDOS (sin copia), o {id, error}. Lo crea fabrica.js.
import * as G from "three-gen";
import { receta } from "./nucleo.js";
import { aNivel } from "./niveles.js";
import { transferibles } from "./transferir.js";

self.onmessage = e => {
  const { id, entrada, nivel } = e.data || {};
  try {
    const t0 = performance.now();
    let r = receta(G, entrada);
    if (nivel && nivel !== "E0") r = aNivel(r, nivel);
    r.ms = performance.now() - t0;
    self.postMessage({ id, receta: r }, transferibles(r));
  } catch (err) {
    self.postMessage({ id, error: String(err && err.message || err) });
  }
};
