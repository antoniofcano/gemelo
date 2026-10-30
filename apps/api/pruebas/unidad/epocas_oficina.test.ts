// OF9: la comprobación de los 366 días de la pestaña Épocas de la oficina (apps/web/oficina/olivos_puro.js) dice lo mismo que la barrera de la api
// (src/config/valida.ts): el mismo veredicto con tablas al azar es una propiedad (propiedades.test.ts); aquí, el cuerpo que arma la pantalla.
import assert from "node:assert/strict";
import { test } from "node:test";
import { validaConfig } from "../../src/config/valida.ts";

const P = (await import(new URL("../../../web/oficina/olivos_puro.js", import.meta.url).href)) as {
  validaTabla: (t: unknown) => { nivel: string; texto: string }[]; tablaDePartida: () => Record<string, { desde: string; hasta: string }>; aCuerpo: (...a: unknown[]) => unknown; defectos: () => unknown;
};

// La comprobación de los 366 días con tablas al azar (api = oficina) pasó a una propiedad de fast-check: propiedades.test.ts (PB7).

test("el cuerpo que arma la pantalla con épocas común y de finca lo acepta la api", () => {
  const hit = P.tablaDePartida(); hit.verde!.hasta = "09-14"; hit.envero!.desde = "09-15";
  const cuerpo = P.aCuerpo(P.defectos(), {}, null, { comun: P.tablaDePartida(), fincas: { hituelo: hit } });
  assert.deepEqual(validaConfig(cuerpo), []);
});
