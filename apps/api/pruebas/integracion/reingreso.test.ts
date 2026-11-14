// L9-06 (remate): las marcas de expulsión se reconstruyen al arrancar desde la auditoría, contra PostGIS en un contenedor y con el rol de la aplicación
// (gemelo_api: solo SELECT e INSERT en auditoria). Sin Docker se SALTA con aviso: la consulta NO se ha comprobado contra una base real.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Expulsados, TTL_S } from "../../src/presencia/livekit.ts";
import { reconstruyeMarcas } from "../../src/presencia/reingreso.ts";
import { ExpulsadosGuiada } from "../../src/presencia/voz_rutas.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la reconstrucción de las expulsiones desde la auditoría NO se ha comprobado con PostGIS";
let b: BdDePrueba;

before(async () => { if (!SALTO) b = await levantaBd(); }, { timeout: 240_000 });
after(async () => { if (!SALTO) await b.cierra(); });

test("al arrancar, las expulsiones de los últimos 15 min vuelven a marcar (con su hora); las más viejas y las de otras acciones, no", async t => {
  if (SALTO) { t.skip(SALTO); return; }
  const ins = (accion: string, detalle: object, haceS: number) =>
    b.dueno.query("INSERT INTO auditoria (cuando, accion, detalle) VALUES (now() - make_interval(secs => $1), $2, $3)", [haceS, accion, JSON.stringify(detalle)]);
  await ins("admin.presencia_expulsado", { hogar: 7, sala: "hituelo-libre", estaba: true, conexiones: 1 }, 60);
  await ins("guiada.expulsado", { evento: 3, hogar: 8, conexiones: 1 }, 120);
  await ins("admin.presencia_expulsado", { hogar: 9, sala: "hituelo-libre", estaba: false, conexiones: 0 }, TTL_S + 60);   // ya vencida
  await ins("enlace.pedido", { hogar: 10 }, 10);
  const exp = new Expulsados(), g = new ExpulsadosGuiada();
  assert.equal(await reconstruyeMarcas(b.app, { expulsados: exp, guiada: g }), 2, "con el rol de la aplicación");
  const ahora = Date.now();
  assert.deepEqual(exp.vivos(ahora), [7]);
  assert.deepEqual(g.vivos(ahora), [{ evento: 3, hogar: 8 }]);
  assert.ok(!exp.esta(7, ahora + (TTL_S - 50) * 1000), "vence a los 15 min de la expulsión, no del arranque");
});
