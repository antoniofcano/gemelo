// F3k-1 (ADR-0032): la voz por cercanía en corros, SIN base ni LiveKit. El token de `corro-<id>` se firma y se DECODIFICA con el verificador del SDK y se
// compara con el contrato livekit-roles v8 (roles_corro.miembro); los corros (Corros) con una sala de mentira, unas Puertas de mentira (quién está disponible,
// quién bloquea a quién) y un reloj que se adelanta a mano: invitar, aceptar, «Ahora no», caducar, salir, deshacer, el tope de 5 hogares, los límites, el barrido
// de desconectados, el interruptor, y propiedades con secuencias al azar (nadie en dos corros, ningún corro de menos de 2 ni más de 5, nunca juntos dos hogares
// que se bloquean). La expulsión de la oficina saca también del corro. Las rutas: Origin, sesión y forma antes de nada. La migración 0025. Datos sintéticos.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import fc from "fast-check";
import { TokenVerifier } from "livekit-server-sdk";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import type { ConfigLiveKit } from "../../src/config.ts";
import { AMBITOS_VOZ, VERSION_AVISO, VOZ_AVISO_VERSION, VOZ_CERCANIA_AVISO_VERSION } from "../../src/presencia/consentimiento_voz.ts";
import { AVISOS_SUSPENDEN, AVISOS_VENTANA_DIAS, DIAS_SUSPENSION, MOTIVOS_AVISO, SQL_DISPONIBLES, TEXTO_AVISO_MAX } from "../../src/presencia/cercania.ts";
import { AHORA_NO_SEGUIDOS, AUSENTE_MS, CORRO_MAX_HOGARES, Corros, INVITA_MAX, INVITA_VENTANA_MS, INVITACION_S, type Puertas, VETO_MS } from "../../src/presencia/corro.ts";
import { aliasPublico } from "../../src/presencia/corro_rutas.ts";
import { Expulsados, firmaTokenCorro, identidadOpaca, type ModeradorSala, PATRON_SALA_CORRO, PERMISOS_CORRO, prefijoHogar, SALA_CORRO } from "../../src/presencia/livekit.ts";
import { expulsa } from "../../src/presencia/rutas.ts";
import type { Auditor } from "../../src/presencia/voz.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devcorro1", secreto: "c".repeat(16) + "-sintetico-de-prueba-corro" };
const lkDevSinBase = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devcorro2", GEMELO_LIVEKIT_SECRETO: "k".repeat(32) };
const ROLES = JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as {
  version: number; salas: { corro: { patron: string; solo_audio: boolean } }; roles_corro: Record<string, Record<string, unknown>>; roles: Record<string, Record<string, unknown>>;
};
const RAIZ = new URL("../../../../", import.meta.url);
const lee = (r: string) => readFileSync(new URL(r, RAIZ), "utf8");
const META = { alias: "Mirlo", avatar: { camisa: 2, sombrero: "gorra" as const, piel: 3 }, rol: "hogar" as const, dispositivo: "escritorio" as const };
const S = 1000, MIN = 60_000;

// ---------------------------------------------------------------- un montaje de mentira

class PuertasFalsas implements Puertas {
  readonly fuera = new Set<number>();          // los que NO tienen la voz por cercanía disponible (apagada, sin aviso, suspendidos)
  readonly bloqueos = new Set<string>();       // «a>b»: a bloquea a b
  async disponibles(hs: number[]) { return new Set(hs.filter(h => !this.fuera.has(h))); }
  async bloqueo(h: number, otros: number[]) { return otros.some(o => this.bloqueos.has(h + ">" + o) || this.bloqueos.has(o + ">" + h)); }
}
function monta() {
  const sala = new SalaFalsa(), reloj = new RelojFalso(), puertas = new PuertasFalsas(), filas: { actor: number | null; accion: string; detalle: Record<string, unknown> }[] = [];
  const audita: Auditor = async (actor, accion, detalle) => { filas.push({ actor, accion, detalle }); };
  const avisados: number[][] = [];
  const c = new Corros({ sala, puertas, audita, reloj, prefijo: h => prefijoHogar(LK, h), avisa: async hs => { avisados.push(hs); } });
  /** el hogar h conecta una sesión a la sala de su corro */
  const conecta = (h: number, ses = "s" + h) => { const id = c.corroDe(h); assert.ok(id); sala.entra(SALA_CORRO(id), identidadOpaca(LK, h, ses)); };
  return { sala, reloj, puertas, filas, avisados, c, conecta };
}
async function corroDe(m: ReturnType<typeof monta>, hogares: number[]): Promise<string> {
  const [a, ...resto] = hogares;
  for (const b of resto) {
    const i = await m.c.invita(a!, b); assert.ok(i.ok, JSON.stringify(i));
    const r = await m.c.acepta(b, i.id); assert.ok(r.ok, JSON.stringify(r));
  }
  return m.c.corroDe(a!)!;
}

// ---------------------------------------------------------------- contrato y token

test("contrato livekit-roles v8: el token de corro-<id> es el del contrato (micrófono y solo micrófono, sin datos, sin roomAdmin), con papel «miembro»; la sala libre sigue sin audio", async () => {
  assert.ok(ROLES.version >= 8);
  assert.deepEqual(Object.keys(ROLES.roles_corro).filter(k => k !== "$comment"), Object.keys(PERMISOS_CORRO));
  const v = new TokenVerifier(LK.clave, LK.secreto);
  const t = await firmaTokenCorro(LK, 5, "ses", META, "AbC_dE-fGh12");
  const c = await v.verify(t.token);
  assert.deepEqual({ ...c.video }, { room: "corro-AbC_dE-fGh12", ...ROLES.roles_corro.miembro });
  assert.equal(c.video!.roomAdmin, false); assert.equal(c.video!.canPublishData, false); assert.deepEqual(c.video!.canPublishSources, ["microphone"]);
  assert.equal(JSON.parse(c.metadata!).papel, "miembro"); assert.equal(c.name, "Mirlo");
  assert.equal(t.sala, "corro-AbC_dE-fGh12"); assert.equal(t.identidad, identidadOpaca(LK, 5, "ses"), "la misma identidad opaca que en la sala libre (otra sala: no se echan)");
  assert.ok(Date.parse(t.caduca_en) - Date.now() <= 15 * MIN + S, "vida corta, como los demás");
  const ofi = await v.verify((await firmaTokenCorro(LK, 8, "o", { ...META, rol: "oficina", alias: "Pepa Real" }, "AbC_dE-fGh12")).token);
  assert.equal(ofi.name, "Oficina", "decisión 107: sin nombre propio"); assert.ok(!JSON.stringify(ofi).includes("Pepa"));
  await assert.rejects(firmaTokenCorro(LK, 5, "ses", META, "../hituelo-libre"), /no válido/);
  assert.equal(String(PATRON_SALA_CORRO), String(new RegExp(ROLES.salas.corro.patron)));
  assert.equal(ROLES.salas.corro.solo_audio, true);
  for (const r of Object.values(ROLES.roles)) { assert.equal(r.canPublish, false); assert.deepEqual(r.canPublishSources, []); }
});

// ---------------------------------------------------------------- invitar y aceptar

test("invitar y aceptar: se crea el corro con los dos, cada uno lo ve con sus miembros, los de fuera ven qué hogares están juntos; auditoría corro.invitacion y corro.entra", async () => {
  const m = monta();
  const i = await m.c.invita(1, 2);
  assert.ok(i.ok); assert.match(i.id, /^[A-Za-z0-9_-]{12}$/); assert.equal(Date.parse(i.caduca_en), INVITACION_S * S);
  assert.deepEqual((await m.c.invita(1, 2)), i, "volver a invitar devuelve la misma");
  assert.deepEqual(m.c.vista(2).recibidas.map(x => [x.id, x.de]), [[i.id, 1]]); assert.deepEqual(m.c.vista(1).enviadas.map(x => x.a), [2]);
  assert.equal(m.c.corroDe(1), null, "sin aceptar no hay corro: no se oye nada");
  assert.deepEqual(m.avisados.at(-1), [2], "se le avisa en la sala libre (tema «corro»)");
  const r = await m.c.acepta(2, i.id);
  assert.ok(r.ok); assert.match(r.sala, PATRON_SALA_CORRO);
  assert.equal(m.c.corroDe(1), r.corro); assert.equal(m.c.corroDe(2), r.corro);
  assert.deepEqual(m.c.vista(1).corro!.miembros.map(x => x.hogar).sort(), [1, 2]);
  assert.deepEqual(m.c.publicos(), [{ id: r.corro, miembros: [1, 2] }]);
  assert.deepEqual(m.c.salas(), [SALA_CORRO(r.corro)]);
  assert.deepEqual(m.filas.map(f => f.accion), ["corro.invitacion", "corro.entra", "corro.entra"]);
  assert.deepEqual(m.filas[2], { actor: 2, accion: "corro.entra", detalle: { corro: r.corro, hogar: 2, con: "1", invito: 1 } });
  assert.ok(!JSON.stringify(m.filas).includes("audio"), "nada de voz en la auditoría");
  // un tercero entra en el MISMO corro con una invitación de cualquiera de dentro
  const k = await m.c.invita(2, 3); assert.ok(k.ok);
  assert.ok((await m.c.acepta(3, k.id)).ok); assert.equal(m.c.corroDe(3), r.corro);
  assert.deepEqual(m.c.cuenta(), { corros: 1, hogares: 3 });
});

test("hasta 5 hogares: el sexto no se puede invitar ni entrar (corro_lleno), aunque la invitación sea de antes de llenarse", async () => {
  const m = monta();
  await corroDe(m, [1, 2, 3, 4]);
  const tarde = await m.c.invita(1, 9); assert.ok(tarde.ok, "con 4 aún se invita");
  const quinto = await m.c.invita(1, 5); assert.ok(quinto.ok);
  assert.ok((await m.c.acepta(5, quinto.id)).ok);
  assert.equal(CORRO_MAX_HOGARES, 5); assert.equal(m.c.vista(1).corro!.miembros.length, 5);
  assert.deepEqual(await m.c.invita(2, 6), { ok: false, codigo: "corro_lleno" });
  assert.deepEqual(await m.c.acepta(9, tarde.id), { ok: false, codigo: "corro_lleno" }, "se vuelve a mirar al aceptar");
  assert.equal(m.c.corroDe(9), null);
});

test("no disponible: quien la tiene apagada o sin aviso, quien está en otro corro, un bloqueo en cualquier sentido (también con otro miembro); y no_puedes para quien invita sin tenerla", async () => {
  const m = monta();
  m.puertas.fuera.add(7);
  assert.deepEqual(await m.c.invita(1, 7), { ok: false, codigo: "no_disponible" });
  assert.deepEqual(await m.c.invita(7, 1), { ok: false, codigo: "no_puedes" });
  assert.deepEqual(await m.c.invita(1, 1), { ok: false, codigo: "mismo_hogar" });
  m.puertas.bloqueos.add("3>1");
  assert.deepEqual(await m.c.invita(1, 3), { ok: false, codigo: "no_disponible" }, "el bloqueado no invita a quien le bloqueó…");
  assert.deepEqual(await m.c.invita(3, 1), { ok: false, codigo: "no_disponible" }, "…ni al revés; y a ninguno se le dice por qué");
  await corroDe(m, [1, 2]);
  assert.deepEqual(await m.c.invita(2, 3), { ok: false, codigo: "no_disponible" }, "3 bloqueó a 1, que está en el corro: no entra");
  assert.deepEqual(await m.c.invita(4, 2), { ok: false, codigo: "no_disponible" }, "2 ya está en otro corro");
  assert.deepEqual(await m.c.invita(1, 2), { ok: false, codigo: "ya_en_tu_corro" });
  // lo que cambia entre invitar y aceptar también cuenta: quien invitó deja de tenerla
  const i = await m.c.invita(5, 6); assert.ok(i.ok);
  m.puertas.fuera.add(5);
  assert.deepEqual(await m.c.acepta(6, i.id), { ok: false, codigo: "no_disponible" });
  assert.equal(m.c.corroDe(6), null);
  // y quien acepta, si ya no la tiene
  m.puertas.fuera.delete(5); const j = await m.c.invita(5, 6); assert.ok(j.ok); m.puertas.fuera.add(6);
  assert.deepEqual(await m.c.acepta(6, j.id), { ok: false, codigo: "no_puedes" });
  assert.equal(m.filas.filter(f => f.accion === "corro.entra").length, 2, "solo entraron 1 y 2");
});

test("la invitación caduca a los 60 s; solo la acepta o rechaza su destinatario; quien invitó la puede retirar", async () => {
  const m = monta();
  const i = await m.c.invita(1, 2); assert.ok(i.ok);
  assert.deepEqual(await m.c.acepta(3, i.id), { ok: false, codigo: "no_existe" }, "no es suya");
  await m.reloj.avanza(INVITACION_S * S);
  assert.deepEqual(await m.c.acepta(2, i.id), { ok: false, codigo: "no_existe" }, "caducada");
  assert.deepEqual(m.c.vista(2).recibidas, []);
  const j = await m.c.invita(1, 2); assert.ok(j.ok);
  await m.c.cancela(3, j.id); assert.equal(m.c.vista(2).recibidas.length, 1, "un tercero no la retira");
  await m.c.cancela(1, j.id); assert.equal(m.c.vista(2).recibidas.length, 0);
  assert.deepEqual(await m.c.acepta(2, j.id), { ok: false, codigo: "no_existe" });
});

test("límites: 5 invitaciones cada 10 min por hogar; dos «Ahora no» seguidos de la misma persona → 24 h sin poder invitarla (aceptar pone la cuenta a cero)", async () => {
  const m = monta();
  for (let b = 2; b < 2 + INVITA_MAX; b++) assert.ok((await m.c.invita(1, b)).ok, "invitación " + b);
  assert.deepEqual(await m.c.invita(1, 20), { ok: false, codigo: "demasiadas_invitaciones" });
  await m.reloj.avanza(INVITA_VENTANA_MS + S);
  assert.ok((await m.c.invita(1, 20)).ok, "pasados 10 min, otra vez");
  // «Ahora no»
  const a = await m.c.invita(30, 31); assert.ok(a.ok);
  assert.deepEqual(await m.c.rechaza(31, a.id), { ok: true, veto: false });
  const b = await m.c.invita(30, 31); assert.ok(b.ok);
  assert.deepEqual(await m.c.rechaza(31, b.id), { ok: true, veto: true }, "el segundo seguido veta");
  assert.equal(AHORA_NO_SEGUIDOS, 2);
  assert.deepEqual(await m.c.invita(30, 31), { ok: false, codigo: "no_disponible" }, "vetado: a quien invita solo le sale «no disponible»");
  assert.ok((await m.c.invita(31, 30)).ok, "el veto es en un sentido: quien dijo «Ahora no» sí puede invitar");
  await m.reloj.avanza(VETO_MS + S);
  const c = await m.c.invita(30, 31); assert.ok(c.ok, "a las 24 h, otra vez");
  // un «Ahora no» y luego aceptar: la cuenta vuelve a cero
  assert.ok((await m.c.rechaza(31, c.id)).ok);
  const d = await m.c.invita(30, 31); assert.ok(d.ok); assert.ok((await m.c.acepta(31, d.id)).ok);
  await m.c.sale(31, "salir");
  const e = await m.c.invita(30, 31); assert.ok(e.ok); assert.deepEqual(await m.c.rechaza(31, e.id), { ok: true, veto: false }, "tras aceptar, un «Ahora no» no veta");
  assert.deepEqual(m.filas.filter(f => f.accion === "corro.ahora_no").map(f => f.detalle.veto), [false, true, false, false]);
});

test("salir: RemoveParticipant de sus conexiones; con menos de dos, el corro se deshace (DeleteRoom) y nadie queda dentro; idempotente", async () => {
  const m = monta();
  const id = await corroDe(m, [1, 2, 3]);
  m.conecta(1); m.conecta(2); m.conecta(2, "otra"); m.conecta(3);
  assert.deepEqual(await m.c.sale(2, "salir"), { estaba: true });
  assert.equal(m.c.corroDe(2), null); assert.equal(m.c.corroDe(1), id);
  assert.equal([...m.sala.salas.get(SALA_CORRO(id))!.keys()].filter(i => i.startsWith(prefijoHogar(LK, 2))).length, 0, "sus dos conexiones fuera");
  assert.equal(m.sala.salas.get(SALA_CORRO(id))!.size, 2);
  assert.deepEqual(await m.c.sale(1, "lejos"), { estaba: true });
  assert.equal(m.c.corroDe(3), null, "con uno solo, se deshace");
  assert.deepEqual(m.sala.borradas, [SALA_CORRO(id)]);
  assert.deepEqual(m.c.publicos(), []); assert.deepEqual(m.c.salas(), []);
  assert.deepEqual(await m.c.sale(1, "salir"), { estaba: false });
  const fin = m.filas.slice(-3).map(f => [f.accion, f.detalle.motivo]);
  assert.deepEqual(fin, [["corro.sale", "salir"], ["corro.sale", "lejos"], ["corro.deshecho", "menos_de_dos"]]);
  assert.equal(m.filas.at(-1)!.detalle.quedaban, "3");
});

test("si LiveKit no responde al salir o deshacer, el corro se deshace igual en la api (su token ya no se renueva) y solo se avisa en el registro", async () => {
  const m = monta();
  await corroDe(m, [1, 2]);
  m.sala.expulsaHogar = async () => { throw new Error("LiveKit no responde"); };
  m.sala.borraSala = async () => { throw new Error("LiveKit no responde"); };
  assert.deepEqual(await m.c.sale(1, "salir"), { estaba: true });
  assert.equal(m.c.corroDe(2), null); assert.deepEqual(m.c.publicos(), []);
});

test("el barrido: quien pasa más de 60 s sin ninguna conexión en la sala de su corro sale (desconectado); con conexión, se queda; si LiveKit falla, no saca a nadie", async () => {
  const m = monta();
  const id = await corroDe(m, [1, 2, 3]);
  m.conecta(1); m.conecta(2);
  await m.reloj.avanza(AUSENTE_MS - S);
  assert.equal(await m.c.barre(), 0, "aún dentro del margen para conectar");
  await m.reloj.avanza(2 * S);
  assert.equal(await m.c.barre(), 1); assert.equal(m.c.corroDe(3), null); assert.equal(m.c.corroDe(1), id);
  assert.deepEqual(m.filas.at(-1), { actor: null, accion: "corro.sale", detalle: { corro: id, hogar: 3, motivo: "desconectado" } });
  // 2 cierra su pestaña: a los 60 s sale y el corro se deshace
  m.sala.sale(SALA_CORRO(id), identidadOpaca(LK, 2, "s2"));
  await m.reloj.avanza(AUSENTE_MS / 2); assert.equal(await m.c.barre(), 0);
  const presentes = m.sala.presentes.bind(m.sala);
  m.sala.presentes = async () => { throw new Error("LiveKit no responde"); };
  await m.reloj.avanza(AUSENTE_MS); assert.equal(await m.c.barre(), 0, "sin saber quién está, no se saca a nadie");
  m.sala.presentes = presentes;
  assert.equal(await m.c.barre(), 1); assert.equal(m.c.corroDe(1), null, "se deshizo");
  assert.deepEqual(m.sala.borradas, [SALA_CORRO(id)]);
});

test("sacar a un hogar (suspensión, expulsión, consentimiento, ajuste) borra también sus invitaciones; apagar el interruptor deshace todos los corros", async () => {
  const m = monta();
  const i = await m.c.invita(6, 1); assert.ok(i.ok, "una invitación a 1 de antes de que entrase en su corro");
  await corroDe(m, [1, 2, 3]);
  const otro = await corroDe(m, [4, 5]);
  const j = await m.c.invita(1, 7); assert.ok(j.ok);
  assert.equal(m.c.vista(1).recibidas.length, 1);
  await m.c.sacaHogar(1, "suspension", 99);
  assert.equal(m.c.corroDe(1), null); assert.equal(m.c.vista(1).recibidas.length, 0); assert.equal(m.c.vista(7).recibidas.length, 0);
  assert.equal(m.filas.find(f => f.accion === "corro.sale" && f.detalle.hogar === 1)!.actor, 99, "el actor es quien suspende");
  assert.ok(m.c.corroDe(2) && m.c.corroDe(2) === m.c.corroDe(3), "los otros dos siguen");
  assert.equal(await m.c.apagaTodo(99), 2);
  assert.deepEqual(m.c.publicos(), []); assert.equal(m.c.corroDe(4), null);
  assert.ok(m.sala.llamadas.includes("borra " + SALA_CORRO(otro)));
  assert.deepEqual(m.filas.filter(f => f.accion === "corro.deshecho" && f.detalle.motivo === "interruptor").length, 2);
});

test("propiedades (fast-check, 300 secuencias): nadie en dos corros; ningún corro de menos de 2 ni más de 5 hogares; nunca juntos dos hogares que se bloquean; las vistas cuadran", async () => {
  const op = fc.oneof(
    fc.record({ t: fc.constant("invita" as const), a: fc.integer({ min: 1, max: 9 }), b: fc.integer({ min: 1, max: 9 }) }),
    fc.record({ t: fc.constant("acepta" as const), a: fc.integer({ min: 1, max: 9 }), k: fc.nat(20) }),
    fc.record({ t: fc.constant("rechaza" as const), a: fc.integer({ min: 1, max: 9 }), k: fc.nat(20) }),
    fc.record({ t: fc.constant("sale" as const), a: fc.integer({ min: 1, max: 9 }) }),
    fc.record({ t: fc.constant("saca" as const), a: fc.integer({ min: 1, max: 9 }) }),
    fc.record({ t: fc.constant("tiempo" as const), ms: fc.integer({ min: 0, max: 90_000 }) }),
  );
  await fc.assert(fc.asyncProperty(fc.array(op, { maxLength: 60 }), fc.array(fc.tuple(fc.integer({ min: 1, max: 9 }), fc.integer({ min: 1, max: 9 })), { maxLength: 4 }), async (ops, bloq) => {
    const m = monta(); const ids: string[] = [];
    for (const [a, b] of bloq) if (a !== b) m.puertas.bloqueos.add(a + ">" + b);
    for (const o of ops) {
      if (o.t === "invita") { const r = await m.c.invita(o.a, o.b); if (r.ok) ids.push(r.id); }
      else if (o.t === "acepta") await m.c.acepta(o.a, ids[o.k % Math.max(1, ids.length)] ?? "x");
      else if (o.t === "rechaza") await m.c.rechaza(o.a, ids[o.k % Math.max(1, ids.length)] ?? "x");
      else if (o.t === "sale") await m.c.sale(o.a, "salir");
      else if (o.t === "saca") await m.c.sacaHogar(o.a, "suspension", null);
      else await m.reloj.avanza(o.ms);
      const pub = m.c.publicos(), todos = pub.flatMap(c => c.miembros);
      assert.equal(new Set(todos).size, todos.length, "nadie en dos corros");
      for (const c of pub) {
        assert.ok(c.miembros.length >= 2 && c.miembros.length <= CORRO_MAX_HOGARES, JSON.stringify(c));
        for (const x of c.miembros) { assert.equal(m.c.corroDe(x), c.id); for (const y of c.miembros) assert.ok(!m.puertas.bloqueos.has(x + ">" + y), "juntos " + x + " y " + y); }
      }
      for (let h = 1; h <= 9; h++) { const id = m.c.corroDe(h); if (id) assert.ok(pub.some(c => c.id === id && c.miembros.includes(h))); }
    }
  }), { numRuns: 300 });
});

test("la expulsión de la oficina saca también del corro (y de su sala) y lo apunta en la auditoría", async () => {
  const m = monta();
  const id = await corroDe(m, [1, 2]);
  m.conecta(1); m.conecta(2);
  const filas: unknown[][] = [];
  const bd = { query: async (sql: string, p?: unknown[]) => { filas.push([sql, p]); return { rowCount: 1, rows: [] }; } };
  const moderador: ModeradorSala = { async expulsaHogar() { return 0; }, async envia() { return false; } };
  const r = await expulsa({ bd: bd as never, lk: LK, moderador, expulsados: new Expulsados(), corros: m.c }, 99, 1, null);
  assert.deepEqual(r, { ok: true, estaba_en_sala: false, conexiones: 0 });
  assert.equal(m.c.corroDe(1), null); assert.equal(m.c.corroDe(2), null, "con uno solo, el corro se deshace");
  assert.deepEqual(m.sala.borradas, [SALA_CORRO(id)]);
  assert.ok(m.filas.some(f => f.accion === "corro.sale" && f.detalle.motivo === "expulsion" && f.actor === 99));
  const auditoria = filas.find(f => String(f[0]).includes("INSERT INTO auditoria"))!;
  assert.match(String((auditoria[1] as unknown[])[2]), new RegExp("corro-" + id));
});

// ---------------------------------------------------------------- lo de alrededor

test("aliasPublico: el suyo, «Oficina» para la oficina, o «Visitante» con un trozo del prefijo opaco (nunca el correo ni el id)", () => {
  assert.equal(aliasPublico(LK, { id: 3, alias: "Mirlo", rol: "hogar" }), "Mirlo");
  assert.equal(aliasPublico(LK, { id: 3, alias: "Pepa Real", rol: "oficina" }), "Oficina");
  assert.equal(aliasPublico(LK, { id: 3, alias: "Pepa Real", rol: "admin" }), "Oficina");
  const v = aliasPublico(LK, { id: 3, alias: null, rol: "hogar" });
  assert.equal(v, "Visitante " + prefijoHogar(LK, 3).slice(2, 6)); assert.ok(!v.includes("3"));
});

test("rutas de los corros y de la oficina: sin Origin 403, sin sesión 401, forma mala 400 (antes de tocar la base)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const app = await construyeApp({ ...contexto(pool, configDePrueba({ ...lkDevSinBase })), moderadorVoz: new SalaFalsa() });
  const ID = "AbC_dE-fGh12", IDENT = identidadOpaca(LK, 1, "x");
  const rutas: [string, string, unknown][] = [
    ["GET", "/api/presencia/corros/estado", undefined], ["GET", "/api/presencia/corros", undefined], ["GET", "/api/presencia/corros/ajuste", undefined],
    ["PUT", "/api/presencia/corros/ajuste", { activa: true }], ["POST", "/api/presencia/corros/invitaciones", { identidad: IDENT }],
    ["POST", `/api/presencia/corros/invitaciones/${ID}/aceptar`, {}], ["POST", `/api/presencia/corros/invitaciones/${ID}/rechazar`, {}],
    ["DELETE", `/api/presencia/corros/invitaciones/${ID}`, undefined], ["POST", "/api/presencia/corros/salir", {}],
    ["POST", "/api/presencia/corros/token", { dispositivo: "quest" }], ["GET", "/api/presencia/corros/bloqueos", undefined],
    ["POST", "/api/presencia/corros/bloqueos", { identidad: IDENT }], ["DELETE", "/api/presencia/corros/bloqueos/" + IDENT.slice(0, 24), undefined],
    ["POST", "/api/presencia/corros/avisos", { identidad: IDENT, motivo: "acoso" }],
    ["GET", "/api/admin/voz/cercania", undefined], ["PUT", "/api/admin/voz/cercania", { activa: true }], ["GET", "/api/admin/voz/avisos", undefined],
    ["POST", "/api/admin/voz/avisos/1/estado", { estado: "visto" }], ["POST", "/api/admin/voz/suspensiones", { hogar_id: 2, dias: 7 }], ["DELETE", "/api/admin/voz/suspensiones/2", undefined],
  ];
  try {
    for (const [method, url, payload] of rutas) {
      const cuerpo = payload === undefined ? {} : { payload: payload as object };
      assert.equal((await app.inject({ method: method as "GET", url, headers: deLaWeb(), ...cuerpo })).statusCode, 401, method + " " + url + " sin sesión");
      if (method !== "GET") assert.equal((await app.inject({ method: method as "POST", url, headers: { "x-forwarded-proto": "https" }, ...cuerpo })).statusCode, 403, method + " " + url + " sin Origin");
    }
    // la forma: lo que no cumple el esquema no llega a la base (ni a la sesión)
    const malas: [string, string, unknown][] = [
      ["POST", "/api/presencia/corros/invitaciones", { identidad: "h_corta" }], ["POST", "/api/presencia/corros/invitaciones", { identidad: IDENT, hogar: 2 }],
      ["POST", "/api/presencia/corros/invitaciones/../aceptar", {}], ["POST", "/api/presencia/corros/invitaciones/corto/aceptar", {}],
      ["POST", "/api/presencia/corros/salir", { motivo: "porque_si" }], ["POST", "/api/presencia/corros/token", { dispositivo: "tostadora" }],
      ["PUT", "/api/presencia/corros/ajuste", { activa: "si" }], ["POST", "/api/presencia/corros/avisos", { identidad: IDENT, motivo: "me_cae_mal" }],
      ["POST", "/api/presencia/corros/avisos", { identidad: IDENT, motivo: "otro", texto: "x".repeat(TEXTO_AVISO_MAX + 1) }],
      ["POST", "/api/presencia/corros/avisos", { identidad: IDENT, motivo: "otro", texto: "hola\u0000" }],
      ["DELETE", "/api/presencia/corros/bloqueos/h_corta", undefined], ["POST", "/api/admin/voz/suspensiones", { hogar_id: 2, dias: 3 }],
      ["POST", "/api/admin/voz/avisos/1/estado", { estado: "nuevo" }], ["PUT", "/api/presencia/voz/consentimiento?ambito=chat", { version: 1 }],
    ];
    for (const [method, url, payload] of malas) {
      const cuerpo = payload === undefined ? {} : { payload: payload as object };
      const r = await app.inject({ method: method as "POST", url, headers: deLaWeb(), ...cuerpo });
      assert.ok([400, 404].includes(r.statusCode), method + " " + url + " → " + r.statusCode);
    }
  } finally { await app.close(); await pool.end(); }
});

test("la migración 0025: consentimiento por ámbito, ajuste e interruptor apagados por omisión, bloqueos y avisos con cascada, la purga con corro.* y por ámbito; gemelo_api sigue sin borrar la auditoría", () => {
  const sql = lee("apps/api/migraciones/0025_voz_cercania.sql");
  assert.match(sql, /ADD COLUMN ambito text NOT NULL DEFAULT 'guiada' CHECK \(ambito IN \('guiada', 'cercania'\)\)/, "las filas de F3j quedan como de la guiada");
  assert.match(sql, /ADD PRIMARY KEY \(hogar_id, ambito\)/);
  assert.match(sql, /voz_cercania_ajustes \(\s*hogar_id\s+bigint PRIMARY KEY REFERENCES hogares \(id\) ON DELETE CASCADE,\s*activa\s+boolean NOT NULL DEFAULT false/, "el ajuste, apagado por omisión (decisión 210)");
  assert.match(sql, /INSERT INTO voz_cercania_interruptor \(id, activa\) VALUES \(true, false\)/, "el interruptor nace APAGADO");
  assert.match(sql, /REVOKE INSERT, DELETE, TRUNCATE ON voz_cercania_interruptor FROM gemelo_api/);
  assert.match(sql, /bloqueado_id bigint NOT NULL REFERENCES hogares \(id\) ON DELETE CASCADE/);
  assert.match(sql, /char_length\(texto\) BETWEEN 1 AND 280/);
  for (const mo of MOTIVOS_AVISO) assert.ok(sql.includes("'" + mo + "'"), mo);
  const acciones = [...sql.matchAll(/a\.accion\s*(?:LIKE|=)\s*'([^']+)'/g)].map(x => x[1]).sort();
  assert.deepEqual(acciones, ["corro.%", "guiada.%", "voz.consentimiento_dado", "voz.consentimiento_retirado"], "solo las acciones de la voz");
  assert.match(sql, /c\.ambito = coalesce\(a\.detalle ->> 'ambito', 'guiada'\)/, "un «dado» se mira en su ámbito");
  assert.match(sql, /SECURITY DEFINER/); assert.doesNotMatch(sql, /GRANT[^;]*DELETE[^;]*\bauditoria\b/i);
  assert.doesNotMatch(sql, /\bbytea\b|\boid\b/i, "nada de audio (ni binarios) en la base");
  // lo que la api escribe con esos nombres existe
  const codigo = lee("apps/api/src/presencia/corro.ts") + lee("apps/api/src/presencia/corro_rutas.ts");
  for (const a of ["corro.invitacion", "corro.entra", "corro.sale", "corro.deshecho", "corro.ahora_no", "corro.bloqueo", "corro.aviso", "corro.suspendido", "corro.interruptor"]) assert.ok(codigo.includes('"' + a + '"'), a);
  assert.match(SQL_DISPONIBLES, /c\.ambito = 'cercania' AND c\.version = \$2/); assert.match(SQL_DISPONIBLES, /a\.activa/); assert.match(SQL_DISPONIBLES, /voz_cercania_suspensiones/);
  assert.deepEqual([AVISOS_SUSPENDEN, AVISOS_VENTANA_DIAS, [...DIAS_SUSPENSION]], [3, 7, [7, 30]], "las cifras del ADR-0032 (provisionales)");
});

test("consentimiento por ámbito: dos versiones vigentes (guiada y cercania); el contrato trae el texto propuesto del aviso de cercanía con su versión y la declaración de adulto", () => {
  assert.deepEqual([...AMBITOS_VOZ], ["guiada", "cercania"]);
  assert.deepEqual(VERSION_AVISO, { guiada: VOZ_AVISO_VERSION, cercania: VOZ_CERCANIA_AVISO_VERSION });
  const md = lee("contratos/voz-consentimiento.md");
  const v = /Aviso «cercania», versión (\d+)/.exec(md); assert.ok(v, "el contrato nombra la versión del aviso de cercanía");
  assert.equal(Number(v![1]), VOZ_CERCANIA_AVISO_VERSION);
  for (const s of ["mayor de edad", "no se graba", "Salir", "Avisar", "no hay nadie moderando"]) assert.ok(md.toLowerCase().includes(s.toLowerCase()), "el aviso dice «" + s + "»");
});
