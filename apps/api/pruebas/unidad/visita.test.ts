// Visita guiada compartida (decisiones 233-238, acuerdo del 2026-11-14): la parte pura de la ruta POST /api/presencia/guiadas/:evento/visita, sin base ni LiveKit:
// lectura tolerante de los metadatos, mezcla (mundo, parada, máquinas, n, desde), tamaño y la lista de mundos contra el contrato. Los permisos y la ventana
// (403, 409) de la ruta, con base, están en pruebas/integracion/voz.test.ts. Datos sintéticos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ESQUEMA_CUERPO_VISITA, leeVisita, MUNDOS_POSE, MUNDOS_POSE_LITERAL, MUNDOS_VISITA, mezclaVisita, VISITA_MAX_BYTES, VISITA_POR_DEFECTO, visitaATexto, visitaCabe, type Visita } from "../../src/presencia/visita.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

const T0 = 1763100000000;

test("los mundos: la lista de la api es la del contrato (clave mundos_pose, si ya está) o la literal del acuerdo; «otro» no es un destino", () => {
  const c = (JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as { mundos_pose?: string[] }).mundos_pose;
  assert.deepEqual([...MUNDOS_POSE], c ?? [...MUNDOS_POSE_LITERAL]);
  assert.deepEqual([...MUNDOS_POSE_LITERAL], ["exterior", "patios", "fabrica", "otro"]);
  assert.deepEqual([...MUNDOS_VISITA], ["exterior", "patios", "fabrica"]);
  assert.deepEqual(ESQUEMA_CUERPO_VISITA.properties.mundo.enum, ["exterior", "patios", "fabrica"]);
});

test("leer los metadatos: vacíos o ilegibles dan el valor por defecto; lo que no cuadra se sustituye campo a campo", () => {
  for (const x of [undefined, null, "", "{no es json", "[]", "7", "null", '"texto"']) assert.deepEqual(leeVisita(x), VISITA_POR_DEFECTO, String(x));
  const bueno: Visita = { v: 1, mundo: "fabrica", parada: 3, maquinas: { marcha: true, desde: T0 }, n: 7 };
  assert.deepEqual(leeVisita(JSON.stringify(bueno)), bueno);
  assert.deepEqual(leeVisita('{"mundo":"luna","parada":99,"maquinas":{"marcha":"si"},"n":-1}'), VISITA_POR_DEFECTO);
  assert.deepEqual(leeVisita('{"mundo":"otro","parada":2.5,"n":3}'), { ...VISITA_POR_DEFECTO, n: 3 }, "«otro» no vale como mundo de la visita");
  assert.equal(leeVisita('{"extra":"<script>"}').n, 0);
  assert.ok(!("extra" in leeVisita('{"extra":1}')), "no se arrastra nada que no sea del contrato");
});

test("mezcla: n sube de uno en uno desde el valor por defecto; lo no pedido se conserva", () => {
  let v = mezclaVisita(VISITA_POR_DEFECTO, { parada: 2 }, T0);
  assert.deepEqual(v, { v: 1, mundo: "exterior", parada: 2, maquinas: null, n: 1 });
  v = mezclaVisita(v, { parada: null }, T0 + 1);
  assert.deepEqual(v, { v: 1, mundo: "exterior", parada: null, maquinas: null, n: 2 });
  v = mezclaVisita(leeVisita("{{"), { parada: 0 }, T0);
  assert.equal(v.n, 1); assert.equal(v.parada, 0, "la parada 0 es una parada, no «ninguna»");
});

test("mezcla: cambiar de mundo pone la parada a null, salvo que venga en el mismo cuerpo; el mismo mundo no la toca", () => {
  const base: Visita = { v: 1, mundo: "exterior", parada: 5, maquinas: null, n: 4 };
  assert.deepEqual(mezclaVisita(base, { mundo: "fabrica" }, T0), { v: 1, mundo: "fabrica", parada: null, maquinas: null, n: 5 });
  assert.deepEqual(mezclaVisita(base, { mundo: "fabrica", parada: 1 }, T0), { v: 1, mundo: "fabrica", parada: 1, maquinas: null, n: 5 });
  assert.equal(mezclaVisita(base, { mundo: "exterior" }, T0).parada, 5);
  assert.equal(mezclaVisita(base, { mundo: "patios", parada: null }, T0).parada, null);
});

test("mezcla de las máquinas: `desde` lo pone la api y solo cambia al cambiar `marcha`", () => {
  const sin: Visita = { v: 1, mundo: "fabrica", parada: null, maquinas: null, n: 1 };
  const a = mezclaVisita(sin, { maquinas: { marcha: true } }, T0);
  assert.deepEqual(a.maquinas, { marcha: true, desde: T0 });
  const b = mezclaVisita(a, { maquinas: { marcha: true } }, T0 + 5000);
  assert.deepEqual(b.maquinas, { marcha: true, desde: T0 }, "misma marcha: el instante del último cambio no se mueve");
  assert.equal(b.n, 3, "pero n sube: es una escritura más");
  const c = mezclaVisita(b, { maquinas: { marcha: false } }, T0 + 9000);
  assert.deepEqual(c.maquinas, { marcha: false, desde: T0 + 9000 });
  assert.deepEqual(mezclaVisita(c, { parada: 4 }, T0 + 10000).maquinas, { marcha: false, desde: T0 + 9000 }, "no tocar las máquinas las deja como estaban");
  assert.deepEqual(mezclaVisita(sin, { maquinas: { marcha: false } }, T0).maquinas, { marcha: false, desde: T0 }, "primera vez en paradas: también cuenta como cambio");
});

test("tamaño: el peor caso cabe de sobra en 512 B; un texto mayor no cabe; se cuentan bytes, no letras", () => {
  const peor: Visita = { v: 1, mundo: "exterior", parada: 63, maquinas: { marcha: false, desde: Number.MAX_SAFE_INTEGER }, n: Number.MAX_SAFE_INTEGER };
  assert.ok(visitaCabe(visitaATexto(peor)), String(Buffer.byteLength(visitaATexto(peor))));
  assert.ok(Buffer.byteLength(visitaATexto(peor)) < 200);
  assert.equal(visitaCabe("a".repeat(VISITA_MAX_BYTES)), true);
  assert.equal(visitaCabe("a".repeat(VISITA_MAX_BYTES + 1)), false);
  assert.equal(visitaCabe("ñ".repeat(VISITA_MAX_BYTES / 2 + 1)), false);
  assert.deepEqual(JSON.parse(visitaATexto(peor)), peor);
});
