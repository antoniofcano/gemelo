// L9-06: tras expulsar (o sacar de un corro), un token de LiveKit firmado antes sigue valiendo; LiveKit no lo revoca. El centinela (reingreso.ts) y el
// barrido de los corros vuelven a sacar a quien reentra con él. Con dobles de LiveKit (SalaFalsa): sin base, sin Docker, sin LiveKit real.
// [NO VERIFICADO contra LiveKit 1.13.11: que un JWT reutilizado reconecte tras RemoveParticipant; aquí se supone que sí, que es el caso malo.]
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigLiveKit } from "../../src/config.ts";
import { Corros, type Puertas } from "../../src/presencia/corro.ts";
import { Expulsados, identidadOpaca, prefijoHogar, SALA_CORRO, SALA_GUIADA, SALAS, TTL_S } from "../../src/presencia/livekit.ts";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { BARRIDO_MS } from "../../src/presencia/corro.ts";
import { arrancaCentinela, reconstruyeMarcas, SQL_EXPULSIONES_VIVAS, type Temporizador, vuelveAExpulsar } from "../../src/presencia/reingreso.ts";
import { ExpulsadosGuiada } from "../../src/presencia/voz_rutas.ts";
import { configDePrueba, contexto } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa, vacia } from "../apoyo/voz.ts";

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

// ---------------------------------------------------------------- L9-06, remate: fallos por sala, el temporizador del centinela y el reinicio

/** Un temporizador que se dispara a mano: guarda cada programación (ms y función) y cuáles se pararon. */
class TemporizadorFalso implements Temporizador {
  readonly programados: { ms: number; fn: () => void; parado: boolean }[] = [];
  cada(ms: number, fn: () => void) { this.programados.push({ ms, fn, parado: false }); return this.programados.length - 1; }
  para(h: unknown) { this.programados[h as number]!.parado = true; }
  dispara() { for (const p of this.programados) if (!p.parado) p.fn(); }
}
const registro = () => { const avisos: string[] = []; return { avisos, log: { warn: (_o: object, m: string) => { avisos.push(m); } } }; };

test("un error de LiveKit (no 404) en una sala se apunta y no corta la pasada: el expulsado sale de las demás", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), r = registro();
  const moderador = { expulsaHogar: async (s: string, p: string) => { if (s === SALAS.general) throw new Error("LiveKit 503"); return sala.expulsaHogar(s, p); } };
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil")); sala.entra(SALAS.visita, identidadOpaca(LK, 7, "movil")); sala.entra(SALA_GUIADA(3), identidadOpaca(LK, 7, "pc"));
  exp.marca(7, 0);
  const g = new ExpulsadosGuiada(); g.marca(3, 7, 0);
  const n = await vuelveAExpulsar({ moderador, prefijo: pre, expulsados: exp, guiada: g, salas: async () => [SALAS.general, SALAS.visita], ahora: () => 1000, log: r.log });
  assert.equal(n, 2, "la visita y la guiada, aunque la general fallara");
  assert.deepEqual(dentro(sala, SALAS.visita), []); assert.deepEqual(dentro(sala, SALA_GUIADA(3)), []);
  assert.equal(r.avisos.length, 1); assert.match(r.avisos[0]!, /no pudo mirar una sala/);
});

test("arrancaCentinela: se programa cada `ms`, cada disparo es una pasada, no amontona pasadas si LiveKit tarda y se para", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), t = new TemporizadorFalso(), r = registro();
  let pasadas = 0, suelta: (() => void) | null = null;
  const salas = async () => { pasadas++; await new Promise<void>(res => { suelta = res; }); return [SALAS.general]; };
  const para = arrancaCentinela({ moderador: sala, prefijo: pre, expulsados: exp, salas, log: r.log }, BARRIDO_MS, t);
  assert.equal(t.programados.length, 1); assert.equal(t.programados[0]!.ms, BARRIDO_MS);
  exp.marca(7); sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil"));
  t.dispara(); t.dispara(); await vacia();
  assert.equal(pasadas, 1, "la segunda no empieza mientras la primera espera a LiveKit");
  suelta!(); await vacia();
  assert.deepEqual(dentro(sala, SALAS.general), [], "la pasada lo saca");
  assert.ok(r.avisos.some(a => /volvió a entrar/.test(a)));
  t.dispara(); await vacia(); assert.equal(pasadas, 2, "terminada la anterior, la siguiente sí");
  suelta!(); await vacia();
  para(); assert.equal(t.programados[0]!.parado, true);
});

/** Una base de mentira: a la consulta de las expulsiones vivas responde `filas`; a lo demás, vacío. */
function bdConExpulsiones(filas: object[]) {
  const consultas: unknown[][] = [];
  return { consultas, bd: { query: async (sql: string, p: unknown[] = []) => { if (sql === SQL_EXPULSIONES_VIVAS) { consultas.push(p); return { rows: filas, rowCount: filas.length }; } return { rows: [], rowCount: 0 }; } } };
}

test("reconstruyeMarcas: las expulsiones de la auditoría de los últimos TTL_S vuelven a marcar, cada una con su hora; las filas raras se saltan", async () => {
  const t0 = 10_000_000, { bd, consultas } = bdConExpulsiones([
    { accion: "admin.presencia_expulsado", hogar: "7", evento: null, en: t0 },
    { accion: "guiada.expulsado", hogar: "8", evento: "3", en: String(t0 + 500) },
    { accion: "admin.presencia_expulsado", hogar: null, evento: null, en: t0 },
    { accion: "guiada.expulsado", hogar: "9", evento: "x", en: t0 },
  ]);
  const exp = new Expulsados(), g = new ExpulsadosGuiada();
  assert.equal(await reconstruyeMarcas(bd as unknown as pg.Pool, { expulsados: exp, guiada: g }), 2);
  assert.deepEqual(consultas, [[TTL_S]], "mira solo la ventana de vida del token");
  assert.ok(exp.esta(7, t0 + TTL_S * 1000 - 1)); assert.ok(!exp.esta(7, t0 + TTL_S * 1000), "vence cuando habría vencido sin el reinicio");
  assert.deepEqual(g.vivos(t0 + 1000), [{ evento: 3, hogar: 8 }]);
  assert.match(SQL_EXPULSIONES_VIVAS, /FROM auditoria/); assert.match(SQL_EXPULSIONES_VIVAS, /admin\.presencia_expulsado/); assert.match(SQL_EXPULSIONES_VIVAS, /guiada\.expulsado/);
});

test("la api cablea el centinela: al arrancar recupera de la auditoría al expulsado de antes del reinicio y el barrido periódico le saca", async () => {
  const lk = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devreingreso2", GEMELO_LIVEKIT_SECRETO: "w".repeat(32) };
  const { bd, consultas } = bdConExpulsiones([{ accion: "admin.presencia_expulsado", hogar: "7", evento: null, en: Date.now() - 60_000 }]);
  const sala = new SalaFalsa(), t = new TemporizadorFalso();
  const app = await construyeApp({ ...contexto(bd as unknown as pg.Pool, configDePrueba(lk)), moderador: sala, temporizador: t });
  try {
    await app.ready();
    assert.equal(consultas.length, 1, "lee la auditoría al arrancar");
    const prog = t.programados.filter(p => p.ms === BARRIDO_MS);
    assert.equal(prog.length, 1, "el barrido periódico está programado (si se quita el cableado, esto falla)");
    const lkc = configDePrueba(lk).livekit!;
    sala.entra(SALAS.general, identidadOpaca(lkc, 7, "movil")); sala.entra(SALAS.general, identidadOpaca(lkc, 8, "pc"));
    prog[0]!.fn(); await vacia();
    assert.deepEqual(dentro(sala, SALAS.general), [identidadOpaca(lkc, 8, "pc")], "el expulsado antes del reinicio, fuera; el otro se queda");
  } finally { await app.close(); }
  assert.ok(t.programados.every(p => p.parado), "al cerrar la api, se para");
});

// ---------------------------------------------------------------- H-3: la marca, en la auditoría antes de LiveKit; la reconstrucción, con reintento

/** Una auditoría en memoria: guarda los INSERT y responde a SQL_EXPULSIONES_VIVAS con las filas de expulsión de la ventana (como la base). */
function auditoriaEnMemoria() {
  const filas: { accion: string; detalle: Record<string, unknown>; en: number }[] = [];
  let fallaLectura = 0;
  const bd = {
    query: async (sql: string, p: unknown[] = []) => {
      if (/INSERT INTO auditoria/.test(sql)) { filas.push({ accion: String(p[1]), detalle: JSON.parse(String(p[2] ?? "{}")), en: Date.now() }); return { rows: [], rowCount: 1 }; }
      if (sql === SQL_EXPULSIONES_VIVAS) {
        if (fallaLectura > 0) { fallaLectura--; throw new Error("la base no responde"); }
        const acciones = /IN \(([^)]*)\)/.exec(sql)![1]!.split(",").map(x => x.trim().replace(/'/g, ""));
        const vivas = filas.filter(f => acciones.includes(f.accion) && f.en > Date.now() - (p[0] as number) * 1000);
        return { rows: vivas.map(f => ({ accion: f.accion, hogar: f.detalle["hogar"] === undefined ? null : String(f.detalle["hogar"]), evento: f.detalle["evento"] === undefined ? null : String(f.detalle["evento"]), en: f.en })), rowCount: vivas.length };
      }
      if (/SELECT 1 FROM hogares WHERE id = \$1/.test(sql)) return { rows: [{}], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  return { bd, filas, fallaLecturas: (n: number) => { fallaLectura = n; } };
}
const LK_APP = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devreingreso3", GEMELO_LIVEKIT_SECRETO: "h".repeat(32) };

test("H-3: si LiveKit falla al expulsar, la marca ya está en la auditoría: tras un reinicio, el barrido saca al expulsado", async () => {
  const { expulsa } = await import("../../src/presencia/rutas.ts");
  const { MARCA_GENERAL } = await import("../../src/presencia/reingreso.ts");
  const lkc = configDePrueba(LK_APP).livekit!;
  const a = auditoriaEnMemoria();
  const roto = { expulsaHogar: async () => { throw new Error("LiveKit 503"); }, envia: async () => { throw new Error("LiveKit 503"); } };
  await assert.rejects(expulsa({ bd: a.bd as never, lk: lkc, moderador: roto as never, expulsados: new Expulsados() }, 1, 7, null), /LiveKit/);
  assert.deepEqual(a.filas.map(f => f.accion), [MARCA_GENERAL], "la marca quedó escrita antes de la llamada que falló");
  // «reinicio»: una api nueva sobre la misma auditoría; LiveKit ya responde y el expulsado ha vuelto con su token de antes
  const sala = new SalaFalsa(), t = new TemporizadorFalso();
  const app = await construyeApp({ ...contexto(a.bd as unknown as pg.Pool, configDePrueba(LK_APP)), moderador: sala, temporizador: t });
  try {
    await app.ready();
    sala.entra(SALAS.general, identidadOpaca(lkc, 7, "movil")); sala.entra(SALAS.general, identidadOpaca(lkc, 8, "pc"));
    t.programados.find(p => p.ms === BARRIDO_MS)!.fn(); await vacia();
    assert.deepEqual(dentro(sala, SALAS.general), [identidadOpaca(lkc, 8, "pc")], "el expulsado, fuera; el otro se queda");
  } finally { await app.close(); }
});

test("H-3: si leer la auditoría falla al arrancar, la primera pasada del centinela lo reintenta, recupera la marca y saca al expulsado", async () => {
  const lkc = configDePrueba(LK_APP).livekit!;
  const a = auditoriaEnMemoria();
  a.filas.push({ accion: "guiada.expulsion_marcada", detalle: { evento: 3, hogar: 7 }, en: Date.now() - 30_000 });
  a.filas.push({ accion: "admin.presencia_expulsion_marcada", detalle: { hogar: 9 }, en: Date.now() - 30_000 });
  a.fallaLecturas(1);   // la del arranque
  const sala = new SalaFalsa(), t = new TemporizadorFalso();
  const app = await construyeApp({ ...contexto(a.bd as unknown as pg.Pool, configDePrueba(LK_APP)), moderador: sala, temporizador: t });
  try {
    await app.ready();   // no tumba el arranque
    sala.entra(SALA_GUIADA(3), identidadOpaca(lkc, 7, "gafas")); sala.entra(SALAS.visita, identidadOpaca(lkc, 9, "movil")); sala.entra(SALAS.general, identidadOpaca(lkc, 8, "pc"));
    t.programados.find(p => p.ms === BARRIDO_MS)!.fn(); await vacia(); await vacia();
    assert.deepEqual(dentro(sala, SALA_GUIADA(3)), [], "el de la guiada, fuera");
    assert.deepEqual(dentro(sala, SALAS.visita), [], "el de la visita compartida, fuera");
    assert.equal(dentro(sala, SALAS.general).length, 1, "el otro se queda");
  } finally { await app.close(); }
});

test("H-3: RecuperaMarcas solo lee la auditoría hasta que sale bien; una marca reconstruida tarde no acorta otra más nueva", async () => {
  const { RecuperaMarcas } = await import("../../src/presencia/reingreso.ts");
  const t0 = 10_000_000;
  let lecturas = 0, falla = true;
  const bd = { query: async () => { lecturas++; if (falla) throw new Error("caída"); return { rows: [{ accion: "admin.presencia_expulsado", hogar: "7", evento: null, en: t0 }], rowCount: 1 }; } };
  const exp = new Expulsados(), r = registro();
  const rec = new RecuperaMarcas(bd as never, { expulsados: exp }, r.log);
  assert.equal(await rec.intenta(), false); assert.equal(rec.hecha, false); assert.match(r.avisos[0]!, /se reintenta/);
  exp.marca(7, t0 + 600_000);   // mientras, una expulsión nueva del mismo hogar
  falla = false;
  assert.equal(await rec.intenta(), true); assert.equal(rec.hecha, true);
  assert.equal(await rec.intenta(), true); assert.equal(lecturas, 2, "hecha, no vuelve a leer");
  assert.ok(exp.esta(7, t0 + 600_000 + TTL_S * 1000 - 1), "la marca nueva no se acorta con la vieja");
});

// ---------------------------------------------------------------- la ruta que expulsa y el centinela, a la vez (voz_guiada_dev, 2026-11-14)

test("Expulsados.sacando: mientras la ruta lo saca consta «en curso»; soltar es idempotente y dos a la vez se cuentan", () => {
  const e = new Expulsados(), g = new ExpulsadosGuiada();
  assert.equal(e.enCursoDe(7), false);
  const s1 = e.sacando(7), s2 = e.sacando(7);
  assert.equal(e.enCursoDe(7), true);
  s1(); s1(); assert.equal(e.enCursoDe(7), true, "soltar dos veces el mismo no suelta el otro");
  s2(); assert.equal(e.enCursoDe(7), false); assert.equal(e.hayEnCurso(), false);
  const sg = g.sacando(3, 7);
  assert.equal(g.enCursoDe(3, 7), true); assert.equal(g.enCursoDe(4, 7), false, "solo en ESA guiada"); assert.equal(g.enCursoDe(3, 8), false);
  sg(); assert.equal(g.enCursoDe(3, 7), false);
});

test("el centinela no toca a quien la ruta está sacando (general o de una guiada); en la pasada siguiente, sí", async () => {
  const sala = new SalaFalsa(), exp = new Expulsados(), g = new ExpulsadosGuiada(), c = centinela(sala, exp, g);
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil")); sala.entra(SALA_GUIADA(3), identidadOpaca(LK, 8, "pc"));
  exp.marca(7, 0); g.marca(3, 8, 0);
  const s7 = exp.sacando(7), s8 = g.sacando(3, 8);
  c.t.v = 1000;
  assert.equal(await c.pasa(), 0, "los dos están en manos de su ruta");
  assert.equal(dentro(sala, SALAS.general).length, 1); assert.equal(dentro(sala, SALA_GUIADA(3)).length, 1);
  s7(); s8();
  assert.equal(await c.pasa(), 2, "soltados, si siguen dentro el centinela los saca");
});

test("expulsar con el centinela pasando en medio (la auditoría tarda): la ruta cuenta las conexiones de verdad y el centinela no se las quita", async () => {
  const { expulsa } = await import("../../src/presencia/rutas.ts");
  const sala = new SalaFalsa(), exp = new Expulsados(), c = centinela(sala, exp);
  sala.entra(SALAS.general, identidadOpaca(LK, 7, "movil")); sala.entra(SALAS.visita, identidadOpaca(LK, 7, "pc"));
  let abre: () => void = () => undefined;
  const puerta = new Promise<void>(r => { abre = r; });
  let primera = true;
  const bd = { query: async (sql: string) => {
    if (/FROM hogares/.test(sql)) return { rowCount: 1, rows: [] };
    if (/INSERT INTO auditoria/.test(sql) && primera) { primera = false; await puerta; }   // la marca de H-3, lenta (la base con carga)
    return { rowCount: 1, rows: [] };
  } };
  const r = expulsa({ bd: bd as never, lk: LK, moderador: sala, expulsados: exp }, 1, 7, null);
  await vacia();
  assert.equal(exp.esta(7), true, "ya marcado: sin tokens nuevos");
  c.t.v = Date.now();
  assert.equal(await c.pasa(), 0, "el centinela pasa en medio y no le saca: es cosa de la ruta");
  abre();
  assert.deepEqual(await r, { ok: true, estaba_en_sala: true, conexiones: 2 }, "las dos conexiones, contadas por la ruta (antes: 0 si el centinela se adelantaba)");
  assert.equal(exp.enCursoDe(7), false, "y lo suelta al acabar");
});
