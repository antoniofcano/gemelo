// L9-06: tras expulsar (o sacar de un corro), un token de LiveKit firmado antes sigue valiendo; LiveKit no lo revoca. El centinela (reingreso.ts) y el
// barrido de los corros vuelven a sacar a quien reentra con él. Con dobles de LiveKit (SalaFalsa): sin base, sin Docker, sin LiveKit real.
// [NO VERIFICADO contra LiveKit 1.13.11: que un JWT reutilizado reconecte tras RemoveParticipant; aquí se supone que sí, que es el caso malo.]
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigLiveKit } from "../../src/config.ts";
import { Corros, type Puertas } from "../../src/presencia/corro.ts";
import { Expulsados, identidadOpaca, prefijoHogar, SALA_CORRO, SALA_GUIADA, SALAS, TTL_S } from "../../src/presencia/livekit.ts";
import { vuelveAExpulsar } from "../../src/presencia/reingreso.ts";
import { ExpulsadosGuiada } from "../../src/presencia/voz_rutas.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devreingreso", secreto: "r".repeat(16) + "-sintetico-de-prueba-reingreso" };
const pre = (h: number) => prefijoHogar(LK, h);
const dentro = (sala: SalaFalsa, s: string) => [...(sala.salas.get(s)?.keys() ?? [])];

function centinela(sala: SalaFalsa, expulsados: Expulsados, guiada?: ExpulsadosGuiada, t = { v: 0 }) {
  let llamadasSalas = 0;
  const d = { moderador: sala, prefijo: pre, expulsados, ...(guiada ? { guiada } : {}), ahora: () => t.v,
    salas: async () => { llamadasSalas++; return [SALAS.general, SALAS.visita, ...(await sala.salasGuiadas()), ...[...sala.salas.keys()].filter(s => s.startsWith("corro-"))]; } };
  return { pasa: () => vuelveAExpulsar(d), llamadasSalas: () => llamadasSalas, t };
}

test("un expulsado que vuelve a entrar con su token anterior (en cualquier sala del mundo) sale en la pasada siguiente; los demás se quedan", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), c = centinela(sala, exp);
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil")); sala.entra(SALAS.general, identidadOpaca(LK, 8, "pc"));
  // la oficina le expulsa: marca (y RemoveParticipant, que aquí es salir)
  exp.marca(7, 0); sala.sale(SALAS.general, identidadOpaca(LK, 7, "movil"));
  // vuelve con el token de antes, a la general y a la visita, y con otro aparato a un corro y a una guiada
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil")); sala.entra(SALAS.visita, identidadOpaca(LK, 7, "movil"));
  sala.entra(SALA_CORRO("AbC_dE-fGh12"), identidadOpaca(LK, 7, "gafas")); sala.entra(SALA_GUIADA(3), identidadOpaca(LK, 7, "gafas"));
  c.t.v = 60_000;
  assert.equal(await c.pasa(), 4, "cuatro conexiones del expulsado, fuera");
  for (const s of [SALAS.general, SALAS.visita, SALA_CORRO("AbC_dE-fGh12"), SALA_GUIADA(3)]) assert.ok(!dentro(sala, s).some(i => i.startsWith(pre(7) + "_")), "sigue en " + s);
  assert.deepEqual(dentro(sala, SALAS.general), [identidadOpaca(LK, 8, "pc")], "el otro hogar se queda");
  assert.equal(await c.pasa(), 0, "nadie ha vuelto");
});

test("sin expulsados vivos el centinela no llama a LiveKit; pasada la marca (TTL_S), ya no saca a nadie", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), c = centinela(sala, exp);
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil"));
  assert.equal(await c.pasa(), 0); assert.equal(c.llamadasSalas(), 0, "sin marcas, ni siquiera lista las salas");
  exp.marca(7, 0); c.t.v = TTL_S * 1000 + 1;
  assert.equal(await c.pasa(), 0); assert.equal(c.llamadasSalas(), 0);
  assert.equal(dentro(sala, SALAS.general).length, 1, "pasada la marca, puede volver (su token ya caducó también)");
});

test("expulsado de una guiada: vuelve a salir de ESA guiada, no de la sala libre ni de otra guiada", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), g = new ExpulsadosGuiada(), c = centinela(sala, exp, g);
  g.marca(3, 7, 0);
  for (const s of [SALA_GUIADA(3), SALA_GUIADA(4), SALAS.general]) sala.entra(s, identidadOpaca(LK, 7, "movil"));
  c.t.v = 1000;
  assert.equal(await c.pasa(), 1);
  assert.deepEqual(dentro(sala, SALA_GUIADA(3)), []);
  assert.equal(dentro(sala, SALA_GUIADA(4)).length, 1); assert.equal(dentro(sala, SALAS.general).length, 1);
  assert.deepEqual(g.vivos(1000), [{ evento: 3, hogar: 7 }]); assert.deepEqual(g.vivos(TTL_S * 1000 + 1), []);
});

test("corros: quien está en la sala de un corro sin ser miembro (le sacaron y volvió con su token) sale en el barrido; los miembros se quedan", async () => {
  const sala = new SalaFalsa(), reloj = new RelojFalso();
  const puertas: Puertas = { disponibles: async hs => new Set(hs), bloqueo: async () => false };
  const avisos: string[] = [];
  const c = new Corros({ sala, puertas, audita: async () => undefined, reloj, prefijo: pre, log: { warn: (_o, m) => { avisos.push(m); } } });
  const i = await c.invita(1, 2); assert.ok(i.ok); assert.ok((await c.acepta(2, i.id)).ok);
  const i2 = await c.invita(1, 3); assert.ok(i2.ok); assert.ok((await c.acepta(3, i2.id)).ok);
  const id = c.corroDe(1)!, s = SALA_CORRO(id);
  for (const h of [1, 2, 3]) sala.entra(s, identidadOpaca(LK, h, "s" + h));
  await c.sale(3, "salir");                          // 3 se va del corro: la api le saca de la sala
  assert.ok(!dentro(sala, s).some(x => x.startsWith(pre(3) + "_")));
  sala.entra(s, identidadOpaca(LK, 3, "s3"));       // y vuelve con el token de antes
  assert.equal(await c.barre(), 1, "el intruso, fuera");
  assert.deepEqual(dentro(sala, s).sort(), [identidadOpaca(LK, 1, "s1"), identidadOpaca(LK, 2, "s2")].sort());
  assert.equal(c.corroDe(1), id, "el corro sigue"); assert.ok(avisos.some(a => /no es del corro/.test(a)));
  assert.equal(await c.barre(), 0);
});

test("corros: tras deshacerse un corro, quien vuelve a su sala con un token anterior (la recrea el auto_create de LiveKit) sale; pasado TTL_S ya no se mira", async () => {
  const sala = new SalaFalsa(), reloj = new RelojFalso();
  const puertas: Puertas = { disponibles: async hs => new Set(hs), bloqueo: async () => false };
  const c = new Corros({ sala, puertas, audita: async () => undefined, reloj, prefijo: pre, log: { warn: () => undefined } });
  const i = await c.invita(1, 2); assert.ok(i.ok); assert.ok((await c.acepta(2, i.id)).ok);
  const s = SALA_CORRO(c.corroDe(1)!);
  sala.entra(s, identidadOpaca(LK, 1, "s1")); sala.entra(s, identidadOpaca(LK, 2, "s2"));
  await c.sale(2, "salir");                          // quedan menos de dos: el corro se deshace y su sala se borra
  assert.equal(c.corroDe(1), null); assert.deepEqual(sala.borradas, [s]);
  sala.entra(s, identidadOpaca(LK, 2, "s2")); sala.entra(s, identidadOpaca(LK, 1, "s1"));   // los dos vuelven con sus tokens de antes
  assert.equal(await c.barre(), 2); assert.deepEqual(dentro(sala, s), []);
  await reloj.avanza(TTL_S * 1000 + 1);
  sala.entra(s, identidadOpaca(LK, 2, "s2"));
  assert.equal(await c.barre(), 0, "pasada la vida del token, la sala ya no es asunto del barrido");
});
