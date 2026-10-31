// F3c (ADR-0026): la voz de las guiadas sin LiveKit ni base. El token de la sala `guiada-<evento>` se firma y se DECODIFICA con el verificador del SDK
// (permisos del contrato livekit-roles v6 por papel); quién entra y con qué papel (decideGuiada, con propiedades de fast-check); y la palabra (Palabra) con
// una sala de LiveKit de mentira y un reloj que se adelanta a mano: dar, quitar, alargar, vencer a los 2 min, una sola familia a la vez (también con
// operaciones a la vez y en secuencias al azar), manos en orden, la limpieza al arrancar y la auditoría. Las rutas: Origin, forma y sesión antes de nada.
// Claves y datos sintéticos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import fc from "fast-check";
import { TokenVerifier } from "livekit-server-sdk";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import type { ConfigLiveKit } from "../../src/config.ts";
import { firmaTokenGuiada, identidadOpaca, type ModeradorSala, type Papel, PATRON_SALA_GUIADA, PERMISOS_GUIADA, prefijoHogar, SALA_GUIADA } from "../../src/presencia/livekit.ts";
import { expulsa } from "../../src/presencia/rutas.ts";
import { ABRE_FAMILIAS_MIN, ABRE_MODERA_MIN, ALARGA_S, ALARGUES_MAX, ATRIBUTOS, type Auditor, CIERRA_MIN, decideGuiada, type EventoGuiada, limpiaAlArrancar, Palabra, papelDe, puedeModerar, TURNO_S } from "../../src/presencia/voz.ts";
import { ExpulsadosGuiada, hogarDeIdentidad } from "../../src/presencia/voz_rutas.ts";
import { Expulsados } from "../../src/presencia/livekit.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devvoz01", secreto: "v".repeat(16) + "-sintetico-de-prueba-voz" };
const lkDevSinBase = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devvoz02", GEMELO_LIVEKIT_SECRETO: "w".repeat(32) };
const ROLES = JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as {
  version: number; salas: { guiada: { nombre: string; patron: string; eventos: string[] } }; roles_guiada: Record<string, Record<string, unknown>>;
  palabra: { duracion_s: number; alargar_s: number; alargues_max: number; una_a_la_vez: boolean; desmute_remoto: boolean }; atributos: Record<string, unknown>;
};
const META = { alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra" as const, piel: 3 }, rol: "hogar" as const, dispositivo: "escritorio" as const };
const H = Date.parse("2026-11-14T10:00:00Z");
const EV: EventoGuiada = { tipo: "guiada", estado: "abierta", empieza_en: new Date(H), termina_en: new Date(H + 3600_000), guia_id: 7 };
const MIN = 60_000;

// ---------------------------------------------------------------- contrato y token

test("contrato livekit-roles v6: los permisos por papel del código son los del contrato; la sala guiada y la palabra, como en el código", async () => {
  assert.ok(ROLES.version >= 6);
  const papeles = Object.keys(ROLES.roles_guiada).filter(k => k !== "$comment").sort();
  assert.deepEqual(papeles, Object.keys(PERMISOS_GUIADA).sort());
  // el token es lo que llega a LiveKit: se decodifica y se compara con el contrato (las fuentes, como cadenas)
  const v = new TokenVerifier(LK.clave, LK.secreto);
  for (const p of papeles as Papel[]) {
    const c = await v.verify((await firmaTokenGuiada(LK, 5, "ses", META, 42, p)).token);
    assert.deepEqual({ ...c.video }, { room: "guiada-42", ...ROLES.roles_guiada[p] }, p);
  }
  assert.equal(SALA_GUIADA(42), "guiada-42");
  assert.equal(String(PATRON_SALA_GUIADA), String(new RegExp(ROLES.salas.guiada.patron)));
  assert.deepEqual(ROLES.salas.guiada.eventos, ["guiada", "directo"]);
  assert.deepEqual([ROLES.palabra.duracion_s, ROLES.palabra.alargar_s, ROLES.palabra.alargues_max], [TURNO_S, ALARGA_S, ALARGUES_MAX]);
  assert.equal(TURNO_S, 120, "decisión 161: 2 minutos");
  assert.equal(ROLES.palabra.una_a_la_vez, true); assert.equal(ROLES.palabra.desmute_remoto, false);
  assert.deepEqual(Object.keys(ROLES.atributos).filter(k => k !== "$comment").sort(), Object.values(ATRIBUTOS).sort());
});

test("token de la sala guiada: el guía y la oficina con micrófono y solo micrófono; la familia sin publicar pistas; papel en los metadatos; nadie con roomAdmin", async () => {
  const v = new TokenVerifier(LK.clave, LK.secreto);
  const guia = await v.verify((await firmaTokenGuiada(LK, 7, "ses-g", { ...META, rol: "guia", alias: "Rafa" }, 9, "guia")).token);
  assert.equal(guia.video!.canPublish, true); assert.deepEqual(guia.video!.canPublishSources, ["microphone"]);
  assert.equal(JSON.parse(guia.metadata!).papel, "guia"); assert.equal(guia.name, "Rafa");
  const ofi = await v.verify((await firmaTokenGuiada(LK, 8, "ses-o", { ...META, rol: "oficina", alias: "Pepa Real" }, 9, "oficina")).token);
  assert.deepEqual(ofi.video!.canPublishSources, ["microphone"]); assert.equal(ofi.name, "Oficina", "decisión 107: sin nombre propio");
  assert.ok(!JSON.stringify(ofi).includes("Pepa"));
  const fam = await firmaTokenGuiada(LK, 3, "ses-f", META, 9, "familia");
  const f = await v.verify(fam.token);
  assert.equal(f.video!.canPublish, false); assert.deepEqual(f.video!.canPublishSources ?? [], []);
  assert.equal(f.video!.canPublishData, true, "chat y pose, como en las salas fijas");
  assert.equal(JSON.parse(f.metadata!).papel, "familia");
  assert.equal(fam.sala, "guiada-9"); assert.equal(fam.identidad, identidadOpaca(LK, 3, "ses-f"), "la misma identidad opaca que en las salas fijas");
  for (const c of [guia, ofi, f]) { assert.equal(c.video!.roomAdmin, false); assert.equal(c.video!.canUpdateOwnMetadata, false); assert.equal(c.video!.room, "guiada-9"); }
});

// ---------------------------------------------------------------- quién entra

test("decideGuiada: solo guiadas y directos vigentes; la familia apuntada sin micro, la de espera o no apuntada fuera; el guía y la oficina con micro", () => {
  const ahora = H - 5 * MIN;
  const familia = { hogarId: 3, esOficina: false, apuntado: true };
  assert.deepEqual(decideGuiada(EV, familia, ahora), { ok: true, papel: "familia" });
  assert.deepEqual(decideGuiada(EV, { ...familia, apuntado: false }, ahora), { ok: false, http: 403, codigo: "guiada_solo_inscritos", mensaje: "Esta visita es para las familias apuntadas." }, "en espera o no apuntada: sin token");
  assert.deepEqual(decideGuiada(EV, { hogarId: 7, esOficina: false, apuntado: false }, ahora), { ok: true, papel: "guia" });
  assert.deepEqual(decideGuiada(EV, { hogarId: 8, esOficina: true, apuntado: false }, ahora), { ok: true, papel: "oficina" });
  assert.deepEqual(decideGuiada({ ...EV, guia_id: 8 }, { hogarId: 8, esOficina: true, apuntado: false }, ahora), { ok: true, papel: "guia" }, "la oficina que guía entra como guía");
  assert.equal(decideGuiada({ ...EV, tipo: "directo" }, familia, ahora).ok, true);
  for (const tipo of ["libre", "taller", "cata", "evento", "recoleccion"]) assert.deepEqual(decideGuiada({ ...EV, tipo }, familia, ahora), { ok: false, http: 404, codigo: "guiada_no_existe", mensaje: "Esa visita guiada no existe." }, tipo);
  assert.equal((decideGuiada(null, familia, ahora) as { http: number }).http, 404);
  for (const estado of ["cancelada", "borrador"]) assert.equal((decideGuiada({ ...EV, estado }, { hogarId: 8, esOficina: true, apuntado: false }, ahora) as { codigo: string }).codigo, "guiada_no_vigente", estado);
  assert.equal(decideGuiada({ ...EV, estado: "cerrada" }, familia, ahora).ok, true, "cerrada la inscripción, la visita sigue");
});

test("decideGuiada: la ventana de la sala (familias 15 min antes; guía y oficina 60; todos hasta 30 min tras el fin; sin fin, 3 h)", () => {
  const fam = { hogarId: 3, esOficina: false, apuntado: true }, guia = { hogarId: 7, esOficina: false, apuntado: false };
  const antes = decideGuiada(EV, fam, H - (ABRE_FAMILIAS_MIN + 1) * MIN);
  assert.equal((antes as { codigo: string }).codigo, "guiada_aun_no"); assert.equal((antes as { abre_en: string }).abre_en, new Date(H - ABRE_FAMILIAS_MIN * MIN).toISOString());
  assert.equal(decideGuiada(EV, fam, H - ABRE_FAMILIAS_MIN * MIN).ok, true);
  assert.equal(decideGuiada(EV, guia, H - (ABRE_FAMILIAS_MIN + 1) * MIN).ok, true, "el guía prepara antes");
  assert.equal((decideGuiada(EV, guia, H - (ABRE_MODERA_MIN + 1) * MIN) as { codigo: string }).codigo, "guiada_aun_no");
  assert.equal(decideGuiada(EV, fam, H + 3600_000 + CIERRA_MIN * MIN).ok, true);
  assert.equal((decideGuiada(EV, fam, H + 3600_000 + CIERRA_MIN * MIN + 1) as { codigo: string }).codigo, "guiada_terminada");
  assert.equal(decideGuiada({ ...EV, termina_en: null }, fam, H + 3 * 3600_000 + CIERRA_MIN * MIN).ok, true);
  assert.equal(decideGuiada({ ...EV, termina_en: null }, fam, H + 3 * 3600_000 + CIERRA_MIN * MIN + 1).ok, false);
});

test("propiedad: el micrófono del token solo lo llevan el guía del evento y la oficina; sin estar apuntada (o en espera) una familia nunca entra; no hay otro papel", () => {
  const evento = fc.record({
    tipo: fc.constantFrom("guiada", "directo", "libre", "taller", "cata", "evento", "recoleccion"),
    estado: fc.constantFrom("borrador", "abierta", "cerrada", "cancelada"),
    empieza: fc.integer({ min: -600, max: 600 }), dura: fc.option(fc.integer({ min: 1, max: 600 }), { nil: null }), guia: fc.option(fc.integer({ min: 1, max: 6 }), { nil: null }),
  });
  fc.assert(fc.property(evento, fc.integer({ min: 1, max: 6 }), fc.boolean(), fc.boolean(), (e, hogar, esOficina, apuntado) => {
    const ev: EventoGuiada = { tipo: e.tipo, estado: e.estado, empieza_en: new Date(H + e.empieza * MIN), termina_en: e.dura === null ? null : new Date(H + (e.empieza + e.dura) * MIN), guia_id: e.guia };
    const d = decideGuiada(ev, { hogarId: hogar, esOficina, apuntado }, H);
    if (!d.ok) return true;
    assert.ok(["guiada", "directo"].includes(e.tipo) && !["borrador", "cancelada"].includes(e.estado));
    assert.ok(["guia", "oficina", "familia"].includes(d.papel));
    const micro = PERMISOS_GUIADA[d.papel].canPublish;
    assert.equal(micro, e.guia === hogar || esOficina, "micro ⇔ guía u oficina");
    if (d.papel === "familia") assert.ok(apuntado && !esOficina && e.guia !== hogar);
    assert.equal(puedeModerar(ev, { hogarId: hogar, esOficina }), micro, "modera quien tiene micro");
    assert.equal(papelDe(ev, { hogarId: hogar, esOficina, apuntado }), d.papel);
    return true;
  }), { numRuns: 2000 });
});

test("hogarDeIdentidad: la identidad opaca se atribuye a su hogar solo si está entre los candidatos (apuntados); ExpulsadosGuiada, por evento y 15 min", () => {
  const i = identidadOpaca(LK, 4, "ses-x");
  assert.equal(hogarDeIdentidad(LK, i, [1, 2, 4]), 4);
  assert.equal(hogarDeIdentidad(LK, i, [1, 2]), null, "no apuntado: no se le puede dar la palabra");
  assert.equal(hogarDeIdentidad(LK, identidadOpaca({ secreto: "otro" + LK.secreto }, 4, "ses-x"), [4]), null, "otro secreto, otro prefijo");
  const x = new ExpulsadosGuiada(), t = Date.now();
  x.marca(9, 4, t);
  assert.ok(x.esta(9, 4, t)); assert.ok(!x.esta(10, 4, t), "solo de esa visita"); assert.ok(!x.esta(9, 5, t)); assert.ok(!x.esta(9, 4, t + 15 * MIN + 1));
});

// ---------------------------------------------------------------- la palabra con un LiveKit y un reloj de mentira

function auditoria() {
  const filas: { actor: number | null; accion: string; detalle: Record<string, unknown> }[] = [];
  const a: Auditor = async (actor, accion, detalle) => { filas.push({ actor, accion, detalle }); };
  return { a, filas };
}
const SALA = SALA_GUIADA(9), A = identidadOpaca(LK, 1, "a"), B = identidadOpaca(LK, 2, "b"), C = identidadOpaca(LK, 3, "c"), GUIA = identidadOpaca(LK, 7, "g");
function monta() {
  const lk = new SalaFalsa(), reloj = new RelojFalso(), { a, filas } = auditoria();
  for (const i of [A, B, C]) lk.entra(SALA, i);
  lk.entra(SALA, GUIA, "guia");
  return { lk, reloj, filas, p: new Palabra(lk, a, reloj) };
}

test("dar la palabra: micrófono en vivo y atributo palabra_hasta; a los 2 min (ni antes) el servidor la quita solo y lo apunta como «vencida» por el sistema", async () => {
  const { lk, reloj, filas, p } = monta();
  const r = await p.da(9, A, 1, 7);
  assert.deepEqual(r, { ok: true, hasta: new Date(TURNO_S * 1000).toISOString() });
  assert.equal(lk.p(SALA, A)!.micro, true); assert.equal(lk.p(SALA, A)!.atributos[ATRIBUTOS.palabra], r.ok && r.hasta);
  assert.deepEqual(p.vista(9).turno, { identidad: A, hasta: new Date(120_000).toISOString(), alargues: 0 });
  assert.deepEqual(filas.at(-1), { actor: 7, accion: "guiada.palabra_dada", detalle: { evento: 9, hogar: 1, segundos: 120 } });
  await reloj.avanza(TURNO_S * 1000 - 1);
  assert.equal(lk.p(SALA, A)!.micro, true, "a 1 ms del final aún habla");
  await reloj.avanza(1);
  assert.equal(lk.p(SALA, A)!.micro, false, "vencido: sin permiso de micrófono");
  assert.equal(lk.p(SALA, A)!.atributos[ATRIBUTOS.palabra], undefined, "sin cuenta atrás");
  assert.equal(p.vista(9).turno, null); assert.equal(reloj.pendientes, 0);
  assert.deepEqual(filas.at(-1), { actor: null, accion: "guiada.palabra_quitada", detalle: { evento: 9, hogar: 1, motivo: "vencida" } });
  for (const f of filas) assert.ok(!JSON.stringify(f).match(/audio|texto|voz/i), "la auditoría no lleva audio ni texto de voz");
});

test("una sola familia a la vez: dar a otra con la palabra dada es «palabra_ocupada»; también si llegan dos a la vez; tras quitarla, ya se puede", async () => {
  const { lk, filas, p } = monta();
  const [x, y] = await Promise.all([p.da(9, A, 1, 7), p.da(9, B, 2, 8)]);
  assert.deepEqual([x.ok, y.ok], [true, false]); assert.equal((y as { codigo: string }).codigo, "palabra_ocupada");
  assert.deepEqual(lk.conMicro(SALA), [A]);
  assert.equal(((await p.da(9, A, 1, 7)) as { codigo: string }).codigo, "ya_tiene_la_palabra");
  assert.deepEqual(await p.quita(9, 7), { ok: true, hogar: 1 });
  assert.deepEqual(filas.at(-1), { actor: 7, accion: "guiada.palabra_quitada", detalle: { evento: 9, hogar: 1, motivo: "cortada" } });
  assert.deepEqual(lk.conMicro(SALA), []);
  assert.equal((await p.da(9, B, 2, 8)).ok, true); assert.deepEqual(lk.conMicro(SALA), [B]);
  assert.equal(((await p.quita(10, 7)) as { codigo: string }).codigo, "nadie_tiene_la_palabra", "otra visita, otro estado");
  assert.equal((await p.da(10, A, 1, 7)).ok, false, "A no está en la sala de la visita 10");
});

test("alargar: +1 min desde lo que quedaba, cambia la cuenta atrás y el temporizador; tope de alargues; sin turno, 409", async () => {
  const { lk, reloj, filas, p } = monta();
  assert.equal(((await p.alarga(9, 7)) as { codigo: string }).codigo, "nadie_tiene_la_palabra");
  await p.da(9, A, 1, 7);
  await reloj.avanza(60_000);
  const r = await p.alarga(9, 7);
  assert.deepEqual(r, { ok: true, hasta: new Date(180_000).toISOString() });
  assert.equal(lk.p(SALA, A)!.atributos[ATRIBUTOS.palabra], new Date(180_000).toISOString());
  assert.deepEqual(filas.at(-1), { actor: 7, accion: "guiada.palabra_alargada", detalle: { evento: 9, hogar: 1, segundos: 60, alargues: 1 } });
  await reloj.avanza(60_000 + 1);
  assert.equal(lk.p(SALA, A)!.micro, true, "a los 2 min ya no vence: está alargado");
  await reloj.avanza(60_000);
  assert.equal(lk.p(SALA, A)!.micro, false, "vence a los 3 min");
  await p.da(9, B, 2, 7);
  for (let i = 1; i < ALARGUES_MAX; i++) assert.equal((await p.alarga(9, 7)).ok, true);
  assert.equal((await p.alarga(9, 7)).ok, true);
  assert.equal(((await p.alarga(9, 7)) as { codigo: string }).codigo, "tope_de_alargues");
  assert.equal(p.vista(9).turno!.hasta, new Date(reloj.t + (TURNO_S + ALARGUES_MAX * ALARGA_S) * 1000).toISOString());
});

test("dar la palabra a quien ya no está en la sala: «no_esta_en_la_sala», sin turno ni temporizador; si LiveKit falla al dar, el error sube y no queda turno", async () => {
  const { lk, reloj, p, filas } = monta();
  lk.sale(SALA, A);
  assert.equal(((await p.da(9, A, 1, 7)) as { codigo: string }).codigo, "no_esta_en_la_sala");
  assert.equal(p.vista(9).turno, null); assert.equal(reloj.pendientes, 0); assert.equal(filas.length, 0, "no se apunta lo que no se hizo");
  lk.falla = true;
  await assert.rejects(p.da(9, B, 2, 7), /LiveKit/);
  assert.equal(p.vista(9).turno, null); assert.equal(reloj.pendientes, 0);
  lk.falla = false;
  assert.equal((await p.da(9, B, 2, 7)).ok, true, "la cola de la sala sigue viva tras un error");
});

test("si LiveKit falla al vencer, el turno sigue en la vista y se reintenta solo hasta quitarlo", async () => {
  const { lk, reloj, p, filas } = monta();
  await p.da(9, A, 1, 7);
  lk.falla = true;
  await reloj.avanza(TURNO_S * 1000);
  assert.equal(p.vista(9).turno?.identidad, A, "no se ha podido quitar: sigue a la vista de quien modera");
  assert.equal(reloj.pendientes, 1, "reintento programado");
  lk.falla = false;
  await reloj.avanza(5000);
  assert.equal(lk.p(SALA, A)!.micro, false); assert.equal(p.vista(9).turno, null);
  assert.equal(filas.filter(f => f.accion === "guiada.palabra_quitada").length, 1);
});

test("manos: cola del servidor en orden de llegada, idempotente, con atributo «mano»; dar la palabra la baja; quien ya habla no la levanta; fuera de la sala, no", async () => {
  const { lk, reloj, filas, p } = monta();
  assert.deepEqual(await p.levanta(9, B, 2), { ok: true, puesto: 1 });
  await reloj.avanza(1000);
  assert.deepEqual(await p.levanta(9, A, 1), { ok: true, puesto: 2 });
  assert.deepEqual(await p.levanta(9, B, 2), { ok: true, puesto: 1 }, "otra vez: el mismo puesto");
  assert.deepEqual(p.vista(9).manos, [{ identidad: B, desde: new Date(0).toISOString() }, { identidad: A, desde: new Date(1000).toISOString() }]);
  assert.equal(lk.p(SALA, B)!.atributos[ATRIBUTOS.mano], new Date(0).toISOString());
  assert.equal(lk.p(SALA, B)!.micro, false, "levantar la mano no da permiso");
  await p.da(9, B, 2, 7);
  assert.deepEqual(p.vista(9).manos.map(m => m.identidad), [A]); assert.equal(lk.p(SALA, B)!.atributos[ATRIBUTOS.mano], undefined);
  assert.equal(((await p.levanta(9, B, 2)) as { codigo: string }).codigo, "ya_tienes_la_palabra");
  assert.deepEqual(await p.baja(9, A, 1), { ok: true }); assert.deepEqual(p.vista(9).manos, []);
  assert.deepEqual(await p.baja(9, A, 1), { ok: true }, "idempotente");
  lk.sale(SALA, C);
  assert.equal(((await p.levanta(9, C, 3)) as { codigo: string }).codigo, "no_estas_en_la_sala");
  assert.deepEqual(filas.map(f => f.accion), ["guiada.mano_levantada", "guiada.mano_levantada", "guiada.palabra_dada", "guiada.mano_bajada"]);
  assert.deepEqual(filas[0], { actor: 2, accion: "guiada.mano_levantada", detalle: { evento: 9, hogar: 2 } });
});

test("expulsar (olvidaHogar): pierde la palabra y sus manos; olvidaSala y cierra cancelan los temporizadores", async () => {
  const { lk, reloj, filas, p } = monta();
  await p.levanta(9, A, 1); await p.da(9, B, 2, 7);
  await p.olvidaHogar(9, 2, 8);
  assert.equal(lk.p(SALA, B)!.micro, false); assert.equal(p.vista(9).turno, null);
  assert.deepEqual(filas.at(-1), { actor: 8, accion: "guiada.palabra_quitada", detalle: { evento: 9, hogar: 2, motivo: "expulsion" } });
  await p.olvidaHogar(9, 1, 8);
  assert.deepEqual(p.vista(9).manos, []);
  await p.da(9, C, 3, 7);
  assert.equal(reloj.pendientes, 1);
  p.cierra();
  assert.equal(reloj.pendientes, 0); assert.equal(p.vista(9).turno, null);
});

test("propiedad: con cualquier secuencia de dar, quitar, alargar, levantar y dejar pasar el tiempo, nunca hay más de una familia con micrófono, el estado de la api y el de LiveKit coinciden y, pasado el turno, nadie habla", async () => {
  const op = fc.oneof(
    fc.record({ k: fc.constant("da" as const), q: fc.integer({ min: 0, max: 2 }) }),
    fc.record({ k: fc.constant("quita" as const) }), fc.record({ k: fc.constant("alarga" as const) }),
    fc.record({ k: fc.constant("mano" as const), q: fc.integer({ min: 0, max: 2 }) }),
    fc.record({ k: fc.constant("pasa" as const), ms: fc.integer({ min: 0, max: 200_000 }) }),
    fc.record({ k: fc.constant("juntos" as const), q: fc.integer({ min: 0, max: 2 }), r: fc.integer({ min: 0, max: 2 }) }),
  );
  await fc.assert(fc.asyncProperty(fc.array(op, { maxLength: 25 }), async ops => {
    const { lk, reloj, p } = monta();
    const ids = [A, B, C];
    for (const o of ops) {
      if (o.k === "da") await p.da(9, ids[o.q]!, o.q + 1, 7);
      else if (o.k === "quita") await p.quita(9, 7);
      else if (o.k === "alarga") await p.alarga(9, 7);
      else if (o.k === "mano") await p.levanta(9, ids[o.q]!, o.q + 1);
      else if (o.k === "pasa") await reloj.avanza(o.ms);
      else await Promise.all([p.da(9, ids[o.q]!, o.q + 1, 7), p.da(9, ids[o.r]!, o.r + 1, 8)]);
      const con = lk.conMicro(SALA), t = p.vista(9).turno;
      assert.ok(con.length <= 1, "una sola familia con micrófono: " + con.length);
      assert.deepEqual(con, t ? [t.identidad] : [], "la api y LiveKit dicen lo mismo");
      if (t) assert.ok(Date.parse(t.hasta) > reloj.t, "un turno a la vista no está vencido");
    }
    await reloj.avanza((TURNO_S + ALARGUES_MAX * ALARGA_S) * 1000 + 1);
    assert.deepEqual(lk.conMicro(SALA), [], "pasado el turno más largo posible, nadie habla");
    p.cierra();
  }), { numRuns: 150 });
});

test("al arrancar: se quita el micrófono a toda familia que lo tenga en una sala guiada (no al guía ni a la oficina), con su auditoría", async () => {
  const lk = new SalaFalsa(), { a, filas } = auditoria();
  lk.entra("guiada-3", A, "familia", true); lk.entra("guiada-3", B, "familia", false); lk.entra("guiada-3", GUIA, "guia");
  lk.entra("guiada-4", C, "familia", true); lk.entra("guiada-4", identidadOpaca(LK, 8, "o"), "oficina");
  lk.entra("hituelo-libre", identidadOpaca(LK, 5, "z"), "familia", true);
  assert.equal(await limpiaAlArrancar(lk, a), 2);
  assert.deepEqual([lk.p("guiada-3", A)!.micro, lk.p("guiada-3", GUIA)!.micro, lk.p("guiada-4", C)!.micro, lk.p("guiada-4", identidadOpaca(LK, 8, "o"))!.micro], [false, true, false, true]);
  assert.equal(lk.p("hituelo-libre", identidadOpaca(LK, 5, "z"))!.micro, true, "las salas fijas no se tocan (nadie tiene micro en ellas por token)");
  assert.deepEqual(filas.map(f => [f.actor, f.accion, f.detalle]), [[null, "guiada.palabra_quitada", { evento: 3, motivo: "arranque", conexiones: 1 }], [null, "guiada.palabra_quitada", { evento: 4, motivo: "arranque", conexiones: 1 }]]);
});

test("expulsar desde la oficina saca también de las salas guiadas abiertas (F3c)", async () => {
  const llamadas: string[] = [];
  const mod: ModeradorSala = { expulsaHogar: async (s, pr) => { llamadas.push(s); return s === "guiada-9" && pr === prefijoHogar(LK, 4) ? 1 : 0; }, envia: async () => true };
  const consultas: unknown[][] = [];
  const bd = { query: async (sql: string, params: unknown[] = []) => { consultas.push([sql, params]); return { rowCount: 1, rows: [] }; } } as unknown as Pick<pg.Pool, "query">;
  const r = await expulsa({ bd, lk: LK, moderador: mod, expulsados: new Expulsados(), guiadas: async () => ["guiada-9", "guiada-12"] }, 1, 4, null);
  assert.deepEqual(r, { ok: true, estaba_en_sala: true, conexiones: 1 });
  assert.deepEqual(llamadas, ["hituelo-libre", "hituelo-visita", "guiada-9", "guiada-12"]);
  assert.deepEqual(JSON.parse((consultas.at(-1)![1] as unknown[])[2] as string), { hogar: 4, sala: "guiada-9", estaba: true, conexiones: 1 });
});

// ---------------------------------------------------------------- las rutas, antes de la base

test("rutas de la voz: sin Origin 403, forma mala 400, sin sesión 401 (antes de tocar la base o LiveKit)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const lk = new SalaFalsa();
  const app = await construyeApp({ ...contexto(pool, configDePrueba({ ...lkDevSinBase })), moderadorVoz: lk });
  const I = identidadOpaca(LK, 1, "x");
  try {
    const rutas: [("POST" | "DELETE" | "GET" | "PUT"), string, object | undefined][] = [
      ["POST", "/api/presencia/guiadas/9/token", { dispositivo: "quest" }], ["POST", "/api/presencia/guiadas/9/mano", {}], ["DELETE", "/api/presencia/guiadas/9/mano", undefined],
      ["POST", "/api/presencia/guiadas/9/palabra", { identidad: I }], ["POST", "/api/presencia/guiadas/9/palabra/alargar", {}], ["DELETE", "/api/presencia/guiadas/9/palabra", undefined],
      ["POST", "/api/presencia/guiadas/9/silenciar", {}], ["POST", "/api/presencia/guiadas/9/expulsar", { identidad: I }], ["PUT", "/api/admin/eventos/9/guia", { hogar_id: 3 }],
    ];
    for (const [method, url, payload] of rutas) {
      const conCuerpo = payload ? { payload } : {};
      assert.equal((await app.inject({ method, url, headers: { "x-forwarded-proto": "https" }, ...conCuerpo })).statusCode, 403, method + " " + url + " sin Origin");
      assert.equal((await app.inject({ method: "GET" === method ? "GET" : method, url, headers: deLaWeb(), ...conCuerpo })).statusCode, 401, method + " " + url + " sin sesión");
    }
    const GET = await app.inject({ method: "GET", url: "/api/presencia/guiadas/9/palabra", headers: deLaWeb() });
    assert.equal(GET.statusCode, 401);
    for (const [method, url, payload] of [
      ["POST", "/api/presencia/guiadas/0/token", { dispositivo: "quest" }], ["POST", "/api/presencia/guiadas/x/token", { dispositivo: "quest" }],
      ["POST", "/api/presencia/guiadas/9/token", { dispositivo: "tele" }], ["POST", "/api/presencia/guiadas/9/token", { dispositivo: "quest", sala: "general" }],
      ["POST", "/api/presencia/guiadas/9/palabra", { identidad: "correo@example.com" }], ["POST", "/api/presencia/guiadas/9/palabra", { identidad: I, segundos: 600 }],
      ["POST", "/api/presencia/guiadas/9/palabra/alargar", { minutos: 5 }], ["POST", "/api/presencia/guiadas/9/mano", { hogar: 2 }],
      ["POST", "/api/presencia/guiadas/9/expulsar", { identidad: I, motivo: "x".repeat(201) }], ["PUT", "/api/admin/eventos/9/guia", { hogar_id: 0 }], ["PUT", "/api/admin/eventos/9/guia", {}],
    ] as const) assert.equal((await app.inject({ method, url, headers: deLaWeb(), payload })).statusCode, 400, method + " " + url + " " + JSON.stringify(payload));
    assert.deepEqual(lk.llamadas, [], "no se ha tocado LiveKit");
  } finally { await app.close(); await pool.end(); }
});
