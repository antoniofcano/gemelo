// El correo de los avisos y el .ics de la Agenda (OF11c) sin base de datos: el mensaje, la baja firmada, la invitación de calendario y el repartidor
// con una base de mentira. Lo que necesita PostgreSQL (la cola real, SKIP LOCKED, la ruta del .ics con sesión) está en pruebas/integracion/avisos_correo.test.ts.
import assert from "node:assert/strict";
import { test } from "node:test";
import type pg from "pg";
import { construyeApp } from "../../src/app.ts";
import { icsDeEvento, partesDeRemitente, uidDeEvento, type EventoIcs } from "../../src/agenda/ics.ts";
import { BuzonDePruebas } from "../../src/auth/correo.ts";
import { hogarDeBaja, mensajeDeAviso, Repartidor, tokenDeBaja, urlDeBaja } from "../../src/avisos/correo.ts";
import { contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const SECRETO = "secreto-de-prueba-secreto-de-prueba-0123456789";
const evento = (extra: Partial<EventoIcs> = {}): EventoIcs => ({
  id: 7, titulo: "Cata de aceite", descripcion: "Cata guiada en la almazara", lugar: "Almazara", finca: "cerro",
  empieza_en: new Date("2026-11-20T09:00:00Z"), termina_en: new Date("2026-11-20T11:00:00Z"), actualizada_en: new Date("2026-10-30T12:00:00Z"), ...extra,
});

// ---------------------------------------------------------------- el mensaje
test("mensaje: título, texto, enlace al gemelo y forma de darse de baja; texto llano y HTML sencillo", () => {
  const baja = urlDeBaja(ORIGEN, SECRETO, 5);
  const m = mensajeDeAviso({ para: "casa@example.com", titulo: "Se cancela la cata", texto: "La oficina la ha cancelado.", enlace: "/finca/#agenda" }, ORIGEN, baja);
  assert.equal(m.para, "casa@example.com");
  assert.equal(m.asunto, "Se cancela la cata");
  for (const parte of ["Se cancela la cata", "La oficina la ha cancelado.", ORIGEN + "/finca/#agenda", baja, "dejar de recibirlos"]) assert.ok(m.texto.includes(parte), parte);
  assert.ok(m.html!.includes("Dejar de recibirlos") && m.html!.includes("La oficina la ha cancelado."));
  assert.deepEqual(m.cabeceras, { "List-Unsubscribe": "<" + baja + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  assert.ok(!/<img|<script|<link|src=/i.test(m.html!), "sin imágenes remotas ni scripts");
});

test("mensaje: el HTML escapa lo que escribió la oficina y el asunto no admite saltos de línea", () => {
  const m = mensajeDeAviso({ para: "casa@example.com", titulo: "A <b>&\nBcc: otro@example.com", texto: "<script>alert(1)</script>", enlace: null }, ORIGEN, urlDeBaja(ORIGEN, SECRETO, 1));
  assert.ok(!m.html!.includes("<script>") && !m.html!.includes("<b>"));
  assert.ok(m.html!.includes("&lt;script&gt;"));
  assert.ok(!/[\r\n]/.test(m.asunto));
  assert.ok(m.texto.includes(ORIGEN + "/"), "sin enlace propio, a la portada");
});

// ---------------------------------------------------------------- la baja firmada
test("baja: el token se reconoce, no sirve para otro hogar, ni con otro secreto, ni manipulado", () => {
  const t = tokenDeBaja(SECRETO, 42);
  assert.equal(hogarDeBaja(SECRETO, t), 42);
  assert.equal(hogarDeBaja(SECRETO, t.replace(/^42\./, "43.")), null);
  assert.equal(hogarDeBaja("otro-secreto-otro-secreto-otro-secreto-00", t), null);
  assert.equal(hogarDeBaja(SECRETO, t.slice(0, -1) + (t.endsWith("A") ? "B" : "A")), null);
  for (const malo of ["", "42", "42.", "x.y", "42." + "a".repeat(31), "42." + "a".repeat(33), "-1." + "a".repeat(32)]) assert.equal(hogarDeBaja(SECRETO, malo), null, malo);
});

// ---------------------------------------------------------------- el .ics
const lineas = (ics: string) => ics.split("\r\n");

test("ics: PUBLISH con la zona Europe/Madrid (VTIMEZONE y TZID), UID estable y SEQUENCE de la edición", () => {
  const ics = icsDeEvento(evento(), { metodo: "PUBLISH", urlPublica: ORIGEN });
  const l = lineas(ics);
  assert.equal(l[0], "BEGIN:VCALENDAR");
  assert.ok(l.includes("DTSTAMP:20261030T120000Z"), "DTSTAMP en UTC");
  assert.ok(l.includes("METHOD:PUBLISH") && l.includes("BEGIN:VTIMEZONE") && l.includes("TZID:Europe/Madrid"));
  // 09:00 UTC de noviembre = 10:00 en Madrid (CET); con la zona en el propio DTSTART, nunca flotante ni en UTC
  assert.ok(l.includes("DTSTART;TZID=Europe/Madrid:20261120T100000"), "inicio en hora de Madrid");
  assert.ok(l.includes("DTEND;TZID=Europe/Madrid:20261120T120000"));
  assert.ok(!l.some(x => /^DTSTART:\d{8}T\d{6}Z?$/.test(x) && !x.includes("1970")), "ningún DTSTART sin zona fuera del VTIMEZONE");
  assert.ok(l.includes("UID:" + uidDeEvento(7, ORIGEN)) && uidDeEvento(7, ORIGEN) === "evento-7@gemelo.example.com");
  assert.ok(l.includes("SEQUENCE:" + Math.floor(Date.parse("2026-10-30T12:00:00Z") / 1000)));
  assert.ok(l.includes("SUMMARY:Cata de aceite") && l.includes("LOCATION:Almazara · cerro") && l.includes("STATUS:CONFIRMED"));
  assert.ok(!l.some(x => x.startsWith("ORGANIZER") || x.startsWith("ATTENDEE")), "PUBLISH sin organizador ni asistentes");
  assert.ok(l.every(x => Buffer.byteLength(x) <= 75), "líneas plegadas a 75 octetos");
});

test("ics: en verano la hora de Madrid es UTC+2 y una edición posterior sube el SEQUENCE", () => {
  const verano = lineas(icsDeEvento(evento({ empieza_en: new Date("2026-07-15T08:00:00Z"), termina_en: null }), { metodo: "PUBLISH", urlPublica: ORIGEN }));
  assert.ok(verano.includes("DTSTART;TZID=Europe/Madrid:20260715T100000"));
  assert.ok(verano.includes("DTEND;TZID=Europe/Madrid:20260715T110000"), "sin hora de fin: una hora");
  const seq = (e: EventoIcs) => Number(lineas(icsDeEvento(e, { metodo: "PUBLISH", urlPublica: ORIGEN })).find(x => x.startsWith("SEQUENCE:"))!.slice(9));
  assert.ok(seq(evento({ actualizada_en: new Date("2026-10-31T12:00:00Z") })) > seq(evento()));
});

test("ics: CANCEL lleva METHOD:CANCEL, STATUS:CANCELLED, organizador y asistente", () => {
  const l = lineas(icsDeEvento(evento(), { metodo: "CANCEL", urlPublica: ORIGEN, organizador: { nombre: "Gemelo del olivar", correo: "gemelo@canoydamas.invalid" }, asistente: "casa@example.com" }));
  assert.ok(l.includes("METHOD:CANCEL") && l.includes("STATUS:CANCELLED"));
  assert.ok(l.some(x => x.startsWith("ORGANIZER") && x.includes("mailto:gemelo@canoydamas.invalid")));
  assert.ok(l.some(x => x.startsWith("ATTENDEE") && x.toLowerCase().includes("mailto:casa@example.com")));
});

test("ics: lo que escribió la oficina se escapa (comas, punto y coma, saltos) y no cuela líneas nuevas", () => {
  const ics = icsDeEvento(evento({ titulo: "Cata; con, comas", descripcion: "Línea 1\nORGANIZER:mailto:malo@example.com" }), { metodo: "PUBLISH", urlPublica: ORIGEN });
  assert.ok(ics.includes("SUMMARY:Cata\\; con\\, comas"));
  assert.ok(!lineas(ics).some(x => x.startsWith("ORGANIZER")));
});

test("remitente: nombre y dirección de «Nombre <a@b>», de «a@b» y valor por omisión", () => {
  assert.deepEqual(partesDeRemitente("Gemelo del olivar <buzon@canoydamas.invalid>", ORIGEN), { nombre: "Gemelo del olivar", correo: "buzon@canoydamas.invalid" });
  assert.deepEqual(partesDeRemitente("buzon@canoydamas.invalid", ORIGEN), { nombre: "Gemelo del olivar", correo: "buzon@canoydamas.invalid" });
  assert.deepEqual(partesDeRemitente("", ORIGEN), { nombre: "Gemelo del olivar", correo: "gemelo@gemelo.example.com" });
});

// ---------------------------------------------------------------- el repartidor con una base de mentira
type Fila = Record<string, unknown>;
interface Consulta { sql: string; params: unknown[] }

/** Una base que responde a las cuatro consultas del repartidor y apunta todas. */
function baseDeMentira(pendientes: Fila[], evento_: Fila | null = null) {
  const consultas: Consulta[] = [];
  const bd = {
    async query(sql: string, params: unknown[] = []) {
      consultas.push({ sql, params });
      if (sql.includes("UPDATE avisos_hogar ah SET correo_intentos")) return { rows: pendientes, rowCount: pendientes.length };
      if (sql.includes("FROM visitas WHERE id")) return { rows: evento_ ? [evento_] : [], rowCount: evento_ ? 1 : 0 };
      return { rows: [], rowCount: 1 };
    },
  };
  return { bd, consultas };
}
const pendiente = (extra: Fila = {}): Fila => ({ aviso_id: 11, hogar_id: 5, correo_intentos: 1, correo: "casa@example.com", titulo: "Cambia la fecha", texto: "Ahora el sábado.", enlace: null, evento_id: null, ics: null, ...extra });
const opciones = { urlPublica: ORIGEN, secreto: SECRETO, remitente: "Gemelo del olivar <gemelo@canoydamas.invalid>", reintentos: 3, cadaSeg: 0, retardoMs: 0 } as const;
const filaEvento = (extra: Fila = {}): Fila => ({ ...evento(), estado: "abierta", ...extra });

test("repartidor: manda el pendiente al hogar, lo marca enviado y audita sin dirección ni contenido", async () => {
  const { bd, consultas } = baseDeMentira([pendiente()]);
  const buzon = new BuzonDePruebas();
  const r = await new Repartidor(bd, buzon, opciones).reparte();
  assert.deepEqual(r, { enviados: 1, fallidos: 0, desistidos: 0 });
  assert.equal(buzon.mensajes.length, 1);
  assert.equal(buzon.mensajes[0]!.para, "casa@example.com");
  assert.ok(consultas.some(c => c.sql.includes("correo_enviado_en = now()") && c.params.join() === "11,5"));
  const auditoria = consultas.find(c => c.sql.includes("INSERT INTO auditoria"))!;
  assert.equal(auditoria.params[1], "correo.avisos");
  assert.ok(!JSON.stringify(auditoria.params).includes("example.com") && !JSON.stringify(auditoria.params).includes("Ahora el sábado"));
});

test("repartidor: solo toca lo del aviso y del hogar: ninguna consulta mira inscritos ni otros hogares", async () => {
  const { bd, consultas } = baseDeMentira([pendiente({ evento_id: 7, ics: "cambio" })], filaEvento());
  const buzon = new BuzonDePruebas();
  await new Repartidor(bd, buzon, opciones).reparte();
  assert.ok(!consultas.some(c => c.sql.includes("visitas_asistentes")), "no lee quién más está apuntado");
  const m = buzon.mensajes[0]!;
  assert.ok(!/ajena|otra familia|alias/i.test(m.texto + m.ics!.contenido));
  assert.equal(m.ics!.metodo, "PUBLISH");
  assert.ok(m.ics!.contenido.includes("DTSTART;TZID=Europe/Madrid:20261120T100000"));
});

test("repartidor: la cancelación lleva CANCEL con el destinatario como asistente; el cambio de un evento ya cancelado sale sin .ics", async () => {
  const cancelado = filaEvento({ estado: "cancelada" });
  const a = baseDeMentira([pendiente({ evento_id: 7, ics: "cancelacion" })], cancelado);
  const bA = new BuzonDePruebas();
  await new Repartidor(a.bd, bA, opciones).reparte();
  assert.equal(bA.mensajes[0]!.ics!.metodo, "CANCEL");
  assert.ok(bA.mensajes[0]!.ics!.contenido.toLowerCase().includes("mailto:casa@example.com") && bA.mensajes[0]!.ics!.contenido.includes("STATUS:CANCELLED"));
  const b = baseDeMentira([pendiente({ evento_id: 7, ics: "cambio" })], cancelado);
  const bB = new BuzonDePruebas();
  await new Repartidor(b.bd, bB, opciones).reparte();
  assert.equal(bB.mensajes[0]!.ics, undefined);
});

test("repartidor: un fallo no se marca como enviado; al agotar los reintentos se desiste; el registro no lleva la dirección", async () => {
  const buzon = new BuzonDePruebas();
  buzon.falla = true;
  const avisos: string[] = [];
  const log = { warn: (o: object) => { avisos.push(JSON.stringify(o)); }, info: () => undefined };
  const a = baseDeMentira([pendiente({ correo_intentos: 1 })]);
  assert.deepEqual(await new Repartidor(a.bd, buzon, { ...opciones, log }).reparte(), { enviados: 0, fallidos: 1, desistidos: 0 });
  assert.ok(!a.consultas.some(c => c.sql.includes("correo_enviado_en = now()")) && !a.consultas.some(c => c.sql.includes("correo_desistido_en = now()")));
  const b = baseDeMentira([pendiente({ correo_intentos: 3 })]);
  assert.deepEqual(await new Repartidor(b.bd, buzon, { ...opciones, log }).reparte(), { enviados: 0, fallidos: 1, desistidos: 1 });
  assert.ok(b.consultas.some(c => c.sql.includes("correo_desistido_en = now()") && c.params.join() === "11,5"));
  assert.ok(avisos.length === 2 && avisos.every(x => !x.includes("example.com")));
});

test("repartidor: la consulta reclama contando el intento, con espera creciente, solo hogares activos que lo pidieron y avisos recientes", async () => {
  const { bd, consultas } = baseDeMentira([]);
  await new Repartidor(bd, new BuzonDePruebas(), opciones).reparte();
  const sql = consultas[0]!.sql;
  for (const t of ["h.activo AND h.avisos_correo", "correo_enviado_en IS NULL", "correo_desistido_en IS NULL", "power(3, ah.correo_intentos - 1)", "SKIP LOCKED", "correo_intentos = ah.correo_intentos + 1", "make_interval(days => 3)"])
    assert.ok(sql.includes(t), t);
  assert.ok(!consultas.some(c => c.sql.includes("INSERT INTO auditoria")), "sin pendientes, sin asiento");
});

test("repartidor: despierta() no espera ni manda en el acto; las pasadas simultáneas se juntan", async () => {
  const { bd } = baseDeMentira([pendiente()]);
  let enviados = 0, suelta!: () => void;
  const lento = { envia: () => { enviados++; return enviados > 1 ? Promise.resolve() : new Promise<void>(res => { suelta = res; }); }, cierra: async () => undefined };
  const rep = new Repartidor(bd, lento, { ...opciones, retardoMs: 60_000 });
  assert.equal(rep.despierta(), undefined);
  rep.despierta();
  assert.equal(enviados, 0, "despertarlo solo programa; no manda en la misma llamada");
  const p = rep.reparte();                       // una pasada en marcha, parada en el SMTP lento
  await new Promise(r => setImmediate(r));
  const q = rep.reparte();                       // pedir otra mientras corre no lanza un segundo envío a la vez
  assert.equal(enviados, 1);
  suelta();                                      // al terminar, la pasada pedida mientras tanto se hace (la segunda vuelta)
  await Promise.all([p, q]);
  await rep.para();
});

// ---------------------------------------------------------------- la app: la petición no espera al correo
test("app: tras una petición que cambia algo y sale bien se despierta al repartidor, sin esperarlo; un GET o un error no", async () => {
  let despertadas = 0;
  const consultas: string[] = [];
  const bd = { async query(sql: string) { consultas.push(sql); return { rows: [], rowCount: 1 }; }, async end() { /* nada */ } } as unknown as pg.Pool;
  // el repartidor de mentira se queda «enviando» para siempre: la respuesta no debe depender de él
  const ctx = { ...contexto(bd), repartidor: { despierta: () => { despertadas++; void new Promise(() => undefined); } } };
  const app = await construyeApp(ctx);
  await app.ready();
  try {
    const t = tokenDeBaja(ctx.config.sesion.secreto, 5);
    const ok = await app.inject({ method: "POST", url: "/api/avisos/baja?t=" + t, headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-proto": "https" }, payload: "List-Unsubscribe=One-Click" });
    assert.equal(ok.statusCode, 200, "el clic del cliente de correo (sin Origin) da de baja");
    assert.ok(consultas.some(s => s.includes("UPDATE hogares SET avisos_correo = false")));
    const antes = despertadas;
    assert.equal(antes, 1);
    const malo = await app.inject({ method: "POST", url: "/api/avisos/baja?t=5." + "a".repeat(32), headers: { "x-forwarded-proto": "https" } });
    assert.equal(malo.statusCode, 400);
    assert.equal(despertadas, antes, "una petición fallida no despierta");
    consultas.length = 0;
    const get = await app.inject({ method: "GET", url: "/api/avisos/baja?t=" + t });
    assert.equal(get.statusCode, 200);
    assert.ok(get.body.includes("method=\"post\"") && !consultas.some(s => s.includes("UPDATE")), "el GET solo enseña el botón");
    assert.equal(despertadas, antes);
    assert.equal((await app.inject({ method: "GET", url: "/api/agenda/1/evento.ics", headers: deLaWeb() })).statusCode, 401, "el .ics pide sesión");
  } finally { await app.close(); }
});
