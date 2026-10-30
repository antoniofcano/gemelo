// Integración de la Agenda (migración 0012, OF11, doc/sistema/OFICINA.md §7) contra PostGIS en un contenedor: crear y editar eventos, aforo en personas,
// lista de espera con promoción automática (al borrarse alguien y al subir el aforo), que nadie se cuele, cancelar con aviso, inscritos sin correo, avisar con
// tope semanal, las gafas no se inscriben, el RGPD (sale en /api/yo/datos). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la Agenda con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-agenda@example.com", ANA = "ana-agenda@example.com", LUIS = "luis-agenda@example.com", MARTA = "marta-agenda@example.com";
const ids: Record<string, number> = {};
let ofi = "";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"], [LUIS, "hogar"], [MARTA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  await bd.dueno.query("UPDATE hogares SET alias = 'Ana', nombre_interno = 'Ruiz Prueba', avisos_correo = true WHERE id = $1", [ids[ANA]]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = ([] as string[]).concat(r.headers["set-cookie"] ?? []).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
async function entra(correo: string): Promise<{ sesion: string; aparato: string | null }> {
  await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") };
}
async function oficina(correo: string): Promise<string> {
  const e = await entra(correo);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e.sesion;
}
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const q = async <T = Record<string, unknown>>(sql: string, p: unknown[] = []) => (await bd.dueno.query(sql, p)).rows as T[];
const manana = (dias = 3) => new Date(Date.now() + dias * 86400_000).toISOString();
async function crea(extra: object = {}): Promise<number> {
  const r = await pide("POST", "/api/admin/eventos", ofi, { titulo: "Cata de prueba", tipo: "cata", empieza_en: manana(), plazas: 5, lugar: "Patio", ...extra });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id;
}
const avisosDe = async (correo: string) => q<{ titulo: string }>("SELECT a.titulo FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id WHERE ah.hogar_id = $1 AND a.tipo = 'evento' ORDER BY a.id", [ids[correo]]);

test("solo la oficina gestiona: un hogar 403, sin sesión 401; y los hogares ven la agenda", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const ana = (await entra(ANA)).sesion;
  assert.equal((await pide("GET", "/api/admin/eventos", ana)).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/admin/eventos", headers: deLaWeb() })).statusCode, 401);
  assert.equal((await pide("GET", "/api/agenda", ana)).statusCode, 200);
});

test("crear y editar: el evento sale en la agenda de las familias sin el creador; borrador oculto; fechas incoherentes 400", async t => {
  if (salta(t)) return;
  const ana = (await entra(ANA)).sesion;
  const id = await crea({ titulo: "Visita a la loma", tipo: "guiada", plazas: 8 });
  const borrador = await crea({ titulo: "Aún no", estado: "borrador" });
  const l = (await pide("GET", "/api/agenda", ana)).json();
  const e = l.eventos.find((x: { id: number }) => x.id === id);
  assert.ok(e); assert.equal(e.plazas_libres, 8); assert.equal(e.inscripcion_abierta, true); assert.equal(e.mia, null);
  assert.ok(!l.eventos.some((x: { id: number }) => x.id === borrador), "un borrador no se ve");
  assert.ok(!/creada_por|guia_id/.test(JSON.stringify(l)), "lista blanca: ni creador ni guía");
  assert.equal((await pide("POST", "/api/admin/eventos", ofi, { titulo: "X", tipo: "cata", empieza_en: manana(), termina_en: new Date(Date.now() + 3600_000).toISOString() })).statusCode, 400, "acaba antes de empezar");
  assert.equal((await pide("POST", "/api/admin/eventos", ofi, { titulo: "X", tipo: "cata", empieza_en: manana(2), inscripcion_hasta: manana(5) })).statusCode, 400, "plazo después del inicio");
  assert.equal((await pide("POST", "/api/admin/eventos", ofi, { titulo: "X", tipo: "cata", empieza_en: new Date(Date.now() - 1000).toISOString() })).statusCode, 400, "en el pasado");
  assert.equal((await pide("POST", "/api/admin/eventos", ofi, { titulo: "X", tipo: "cata", empieza_en: manana(), haza_id: 99999 })).statusCode, 400, "haza que no existe");
  assert.equal((await pide("PUT", "/api/admin/eventos/" + id, ofi, { titulo: "Visita a la loma (con guía)" })).statusCode, 200);
  assert.equal((await q<{ titulo: string }>("SELECT titulo FROM visitas WHERE id = $1", [id]))[0]!.titulo, "Visita a la loma (con guía)");
  assert.equal((await pide("PUT", "/api/admin/eventos/999999", ofi, { plazas: 3 })).statusCode, 404);
});

test("aforo en personas, espera y promoción: nadie pasa del aforo, nadie se cuela, al borrarse alguien entra el primero que cabe (con aviso)", async t => {
  if (salta(t)) return;
  const [ana, luis, marta] = [(await entra(ANA)).sesion, (await entra(LUIS)).sesion, (await entra(MARTA)).sesion];
  const id = await crea({ plazas: 5 });
  const U = "/api/agenda/" + id + "/inscripcion";
  let r = await pide("POST", U, ana, { personas: 3 });
  assert.equal(r.statusCode, 201, r.body); assert.deepEqual(r.json(), { estado: "apuntado", personas: 3, plazas_libres: 2 });
  assert.equal((await pide("POST", U, ana, { personas: 1 })).statusCode, 409, "ya_inscrito");
  assert.equal((await pide("POST", U, luis, { personas: 6 })).statusCode, 422, "más que el aforo entero");
  r = await pide("POST", U, luis, { personas: 3 });
  assert.equal(r.json().estado, "en_espera", "3 + 3 > 5"); assert.equal(r.json().plazas_libres, 2);
  r = await pide("POST", U, marta, { personas: 1 });
  assert.equal(r.json().estado, "en_espera", "cabría (quedan 2) pero hay familias esperando: no se cuela");
  // Ana se borra: quedan 5 libres; Luis (3) entra y Marta (1) también
  assert.equal((await pide("DELETE", U, ana)).statusCode, 204);
  const filas = await q<{ hogar_id: number; estado: string; promovida_en: string | null }>("SELECT hogar_id, estado, promovida_en FROM visitas_asistentes WHERE visita_id = $1 ORDER BY hogar_id", [id]);
  assert.deepEqual(filas.map(f => f.estado), ["anulado", "apuntado", "apuntado"]);
  assert.ok(filas[1]!.promovida_en && filas[2]!.promovida_en);
  assert.equal((await avisosDe(LUIS)).filter(a => /plaza libre/.test(a.titulo)).length, 1, "Luis recibe el aviso en el gemelo");
  assert.equal((await q("SELECT 1 FROM avisos_hogar WHERE correo_enviado_en IS NOT NULL")).length, 0, "el correo no sale hoy");
  assert.equal((await pide("DELETE", U, ana)).statusCode, 404, "ya no estaba apuntada");
  // Ana vuelve: no cabe (4 de 5 ocupadas, ella son 2) y queda la última en la cola
  r = await pide("POST", U, ana, { personas: 2 });
  assert.equal(r.json().estado, "en_espera");
  // subir el aforo promueve a la espera; bajarlo por debajo de lo apuntado, 409
  assert.equal((await pide("PUT", "/api/admin/eventos/" + id, ofi, { plazas: 3 })).statusCode, 409);
  r = await pide("PUT", "/api/admin/eventos/" + id, ofi, { plazas: 6 });
  assert.equal(r.statusCode, 200); assert.equal(r.json().promovidos, 1);
});

test("inscribirse cerrado: plazo vencido, evento cerrado o cancelado; las gafas vinculadas no apuntan", async t => {
  if (salta(t)) return;
  const ana = (await entra(ANA)).sesion;
  const cerrado = await crea({ estado: "cerrada" });
  assert.equal((await pide("POST", "/api/agenda/" + cerrado + "/inscripcion", ana, { personas: 1 })).json().error, "inscripcion_cerrada");
  const vencido = await crea({ inscripcion_hasta: new Date(Date.now() + 1500).toISOString() });
  await bd.dueno.query("UPDATE visitas SET inscripcion_hasta = now() - interval '1 minute' WHERE id = $1", [vencido]);
  assert.equal((await pide("POST", "/api/agenda/" + vencido + "/inscripcion", ana, { personas: 1 })).statusCode, 409);
  const abierto = await crea();
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json();
  assert.equal((await pide("POST", "/api/yo/dispositivos/vincular", ana, { codigo: p.codigo, aprobar: true })).statusCode, 204);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  const gafas = galleta(s, "__Host-gemelo")!;
  assert.equal((await pide("GET", "/api/agenda", gafas)).json().puede_inscribirse, false);
  assert.equal((await pide("POST", "/api/agenda/" + abierto + "/inscripcion", gafas, { personas: 1 })).json().error, "solo_titular");
});

test("cancelar avisa a apuntados y a la espera, no se puede apuntar ni editar; inscritos sin correo; avisar con tope semanal; RGPD", async t => {
  if (salta(t)) return;
  const [ana, luis] = [(await entra(ANA)).sesion, (await entra(LUIS)).sesion];
  const id = await crea({ plazas: 2 });
  await pide("POST", "/api/agenda/" + id + "/inscripcion", ana, { personas: 2 });
  await pide("POST", "/api/agenda/" + id + "/inscripcion", luis, { personas: 1 });
  const ins = await pide("GET", "/api/admin/eventos/" + id + "/inscritos", ofi);
  assert.equal(ins.statusCode, 200);
  assert.ok(!/@|correo/i.test(ins.body.replace(/"nombre_interno"/g, "")), "nunca el correo");
  assert.deepEqual(ins.json().inscritos.map((f: { estado: string }) => f.estado), ["apuntado", "en_espera"]);
  assert.equal(ins.json().inscritos[0].nombre_interno, "Ruiz Prueba");
  // avisar: Ana (apuntada) y Luis (espera); a «espera» solo Luis
  let r = await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Traed gorra", a: "espera" });
  assert.equal(r.statusCode, 201, r.body); assert.equal(r.json().enviados, 1); assert.equal(r.json().correo_pendiente, 0);
  r = await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Traed gorra", texto: "Hará sol", a: "apuntados" });
  assert.equal(r.json().enviados, 1); assert.equal(r.json().correo_pendiente, 1, "Ana pidió avisos por correo: queda registrado, no enviado");
  for (const n of [1, 2]) await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Aviso " + n, a: "apuntados" });
  r = await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Uno de más", a: "apuntados" });
  assert.equal(r.statusCode, 200); assert.equal(r.json().enviados, 0); assert.equal(r.json().omitidos_por_tope, 1, "tope de 3 por hogar y semana");
  // cancelar
  assert.equal((await pide("POST", "/api/admin/eventos/" + id + "/cancelar", ofi, {})).statusCode, 204);
  assert.equal((await pide("POST", "/api/admin/eventos/" + id + "/cancelar", ofi, {})).statusCode, 409);
  assert.ok((await avisosDe(LUIS)).some(a => /cancela/.test(a.titulo)), "la espera también se entera");
  assert.equal((await pide("POST", "/api/agenda/" + id + "/inscripcion", luis, { personas: 1 })).statusCode, 404);
  assert.equal((await pide("PUT", "/api/admin/eventos/" + id, ofi, { titulo: "Nuevo" })).statusCode, 409);
  assert.ok(!(await pide("GET", "/api/agenda", ana)).json().eventos.some((e: { id: number }) => e.id === id));
  // auditoría sin datos personales y RGPD
  const aud = await q<{ accion: string; detalle: object }>("SELECT accion, detalle FROM auditoria WHERE accion LIKE 'agenda.%' OR accion LIKE 'admin.evento_%'");
  assert.ok(aud.some(a => a.accion === "agenda.inscripcion") && aud.some(a => a.accion === "admin.evento_cancelado"));
  assert.ok(!/@example/.test(JSON.stringify(aud)));
  const datos = (await pide("GET", "/api/yo/datos", ana)).json();
  assert.ok(datos.visitas.some((v: { personas: number }) => v.personas === 2), "sus inscripciones salen en su descarga de datos");
});
