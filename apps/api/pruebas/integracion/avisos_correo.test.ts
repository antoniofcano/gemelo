// Integración del correo de los avisos y el .ics de la Agenda (migración 0016, OF11c, contratos/avisos-correo.md). Dos partes:
//  1. contra PostGIS en un contenedor (Docker) con el buzón en memoria: la inscripción, el cambio de fecha y la cancelación llegan por correo con su .ics a quien
//     lo pidió y solo a ellos, los reintentos son acotados, la baja con un clic funciona, la ruta del .ics, y la petición no espera al correo. Se SALTA sin Docker.
//  2. contra Mailpit (SMTP real de infra/dev, con `npm run dev:arriba`): el cartero de nodemailer manda el aviso con el .ics de verdad. Se SALTA si no está
//     GEMELO_MAILPIT_URL (p. ej. http://127.0.0.1:8025; el SMTP, en GEMELO_MAILPIT_SMTP_PUERTO, 1025 por omisión).
// Datos SINTÉTICOS (correos @example.com). Escrita, NO lanzada en el encargo que la creó.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { BuzonDePruebas, CarteroSmtp } from "../../src/auth/correo.ts";
import { Repartidor, tokenDeBaja } from "../../src/avisos/correo.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: el correo de los avisos con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>, rep: Repartidor;
let ipN = 0;
const OFI = "ofi-correo@example.com", ANA = "ana-correo@example.com", LUIS = "luis-correo@example.com", MARTA = "marta-correo@example.com";
const ids: Record<string, number> = {};
let ofi = "";
const REINTENTOS = 3;

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"], [LUIS, "hogar"], [MARTA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  await bd.dueno.query("UPDATE hogares SET alias = 'Ana', avisos_correo = true WHERE id = ANY($1)", [[ids[ANA], ids[LUIS]]]);
  await bd.dueno.query("UPDATE hogares SET alias = 'Marta Secreta' WHERE id = $1", [ids[MARTA]]);   // sin avisos_correo
  const base = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  // el temporizador largo: solo se reparte cuando la prueba llama a reparte()
  rep = new Repartidor(bd.app, base.cartero, { urlPublica: base.config.urlPublica, secreto: base.config.sesion.secreto, remitente: "Gemelo <gemelo@canoydamas.invalid>", reintentos: REINTENTOS, cadaSeg: 0, retardoMs: 3_600_000 });
  ctx = { ...base, repartidor: rep };
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (!SALTO) { await rep.para(); await app.close(); await bd.cierra(); } });

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
const buzon = () => ctx.cartero;
const vacia = () => { buzon().mensajes.length = 0; buzon().falla = false; };
const dias = (n: number) => new Date(Date.now() + n * 86400_000).toISOString();
async function crea(extra: object = {}): Promise<number> {
  const r = await pide("POST", "/api/admin/eventos", ofi, { titulo: "Cata del correo", tipo: "cata", empieza_en: dias(10), plazas: 5, lugar: "Patio", ...extra });
  assert.equal(r.statusCode, 201, r.body);
  return r.json().id;
}
const de = (correo: string) => buzon().mensajes.filter(m => m.para === correo);

test("inscripción, cambio de fecha y cancelación: llegan por correo con su .ics a quien lo pidió y solo a ellos", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const ana = (await entra(ANA)).sesion, luis = (await entra(LUIS)).sesion, marta = (await entra(MARTA)).sesion;
  const id = await crea();
  vacia();
  for (const s of [ana, luis, marta]) assert.equal((await pide("POST", `/api/agenda/${id}/inscripcion`, s, { personas: 2 })).statusCode, 201);

  // 1. inscripción: Ana y Luis (con avisos_correo) la reciben; Marta, no (solo la ve la gente que la pidió)
  let r = await rep.reparte();
  assert.deepEqual(r, { enviados: 2, fallidos: 0, desistidos: 0 });
  assert.equal(de(MARTA).length, 0);
  const alta = de(ANA)[0]!;
  assert.match(alta.asunto, /Estás apuntado/);
  assert.equal(alta.ics!.metodo, "PUBLISH");
  assert.match(alta.ics!.contenido, /DTSTART;TZID=Europe\/Madrid:/);
  assert.ok(!(alta.texto + alta.ics!.contenido).includes("Marta Secreta") && !(alta.texto + alta.ics!.contenido).includes(LUIS), "nada de otras familias");
  assert.equal((await q("SELECT 1 FROM avisos_hogar WHERE hogar_id = $1 AND correo_enviado_en IS NOT NULL", [ids[ANA]])).length, 1, "marcado enviado");
  const sec1 = Number(/SEQUENCE:(\d+)/.exec(alta.ics!.contenido)![1]);

  // 2. cambio de fecha: avisa a apuntados (Ana, Luis; Marta ya está apuntada pero sin correo), con el mismo UID y un SEQUENCE mayor
  vacia();
  await new Promise(res => setTimeout(res, 1100));   // actualizada_en cambia al menos en un segundo
  assert.equal((await pide("PUT", `/api/admin/eventos/${id}`, ofi, { empieza_en: dias(12) })).statusCode, 200);
  r = await rep.reparte();
  assert.equal(r.enviados, 2);
  const cambio = de(ANA)[0]!;
  assert.match(cambio.asunto, /Cambia la fecha o el lugar/);
  assert.equal(cambio.ics!.metodo, "PUBLISH");
  assert.equal(/UID:(\S+)/.exec(cambio.ics!.contenido)![1], /UID:(\S+)/.exec(alta.ics!.contenido)![1], "mismo UID: el calendario actualiza");
  assert.ok(Number(/SEQUENCE:(\d+)/.exec(cambio.ics!.contenido)![1]) > sec1);

  // 3. el .ics de la ruta del hogar: el mismo evento, con sesión
  const ics = await pide("GET", `/api/agenda/${id}/evento.ics`, ana);
  assert.equal(ics.statusCode, 200);
  assert.match(String(ics.headers["content-type"]), /^text\/calendar/);
  assert.match(ics.body, /BEGIN:VTIMEZONE[\s\S]*TZID:Europe\/Madrid/);
  assert.equal((await app.inject({ method: "GET", url: `/api/agenda/${id}/evento.ics`, headers: deLaWeb() })).statusCode, 401);
  const borrador = await crea({ estado: "borrador" });
  assert.equal((await pide("GET", `/api/agenda/${borrador}/evento.ics`, ana)).statusCode, 404, "un borrador no es visible");

  // 4. cancelación: METHOD:CANCEL para quien lo pidió
  vacia();
  assert.equal((await pide("POST", `/api/admin/eventos/${id}/cancelar`, ofi, {})).statusCode, 204);
  r = await rep.reparte();
  assert.equal(r.enviados, 2);
  const baja = de(LUIS)[0]!;
  assert.match(baja.asunto, /Se cancela un evento/);
  assert.equal(baja.ics!.metodo, "CANCEL");
  assert.match(baja.ics!.contenido, /METHOD:CANCEL[\s\S]*STATUS:CANCELLED/);
  assert.equal((await pide("GET", `/api/agenda/${id}/evento.ics`, ana)).statusCode, 404, "cancelado: ya no se baja");
});

test("la petición no espera al correo: con el SMTP colgado la inscripción responde y el aviso queda pendiente", async t => {
  if (salta(t)) return;
  const ana = (await entra(ANA)).sesion;
  const id = await crea();
  vacia();
  const original = buzon().envia.bind(buzon());
  buzon().envia = () => new Promise<void>(() => undefined);     // SMTP que nunca contesta
  try {
    const t0 = Date.now();
    assert.equal((await pide("POST", `/api/agenda/${id}/inscripcion`, ana, { personas: 1 })).statusCode, 201);
    assert.ok(Date.now() - t0 < 5000);
    assert.equal((await q("SELECT 1 FROM avisos_hogar WHERE hogar_id = $1 AND correo_enviado_en IS NULL AND aviso_id IN (SELECT id FROM avisos WHERE evento_id = $2)", [ids[ANA], id])).length, 1);
  } finally { buzon().envia = original; }
  await rep.para();   // lo que dejó colgado el envío de mentira no se espera: la pasada anterior no llegó a empezar (retardo largo)
});

test("reintento acotado: un fallo no se marca enviado, espera antes de reintentar y al agotar los intentos se desiste", async t => {
  if (salta(t)) return;
  await q("UPDATE avisos_hogar SET correo_enviado_en = now() WHERE correo_enviado_en IS NULL");   // limpia lo de antes
  const ana = (await entra(ANA)).sesion;
  const id = await crea();
  vacia();
  assert.equal((await pide("POST", `/api/agenda/${id}/inscripcion`, ana, { personas: 1 })).statusCode, 201);
  buzon().falla = true;
  assert.deepEqual(await rep.reparte(), { enviados: 0, fallidos: 1, desistidos: 0 });
  const fila = () => q<{ correo_intentos: number; correo_enviado_en: Date | null; correo_desistido_en: Date | null }>("SELECT correo_intentos, correo_enviado_en, correo_desistido_en FROM avisos_hogar WHERE hogar_id = $1 AND correo_enviado_en IS NULL", [ids[ANA]]);
  assert.equal((await fila())[0]!.correo_intentos, 1);
  assert.deepEqual(await rep.reparte(), { enviados: 0, fallidos: 0, desistidos: 0 }, "aún no toca reintentar (espera creciente)");
  for (let n = 2; n <= REINTENTOS; n++) {
    await q("UPDATE avisos_hogar SET correo_ultimo_intento = now() - interval '1 day' WHERE correo_enviado_en IS NULL AND correo_desistido_en IS NULL");
    const r = await rep.reparte();
    assert.equal(r.fallidos, 1);
    assert.equal(r.desistidos, n === REINTENTOS ? 1 : 0);
  }
  assert.ok((await q("SELECT 1 FROM avisos_hogar WHERE correo_desistido_en IS NOT NULL AND hogar_id = $1", [ids[ANA]])).length >= 1);
  await q("UPDATE avisos_hogar SET correo_ultimo_intento = now() - interval '1 day' WHERE correo_enviado_en IS NULL");
  assert.deepEqual(await rep.reparte(), { enviados: 0, fallidos: 0, desistidos: 0 }, "desistido: no se vuelve a intentar");
  // y se vuelve a mandar si el SMTP se arregla ANTES de agotar: un aviso nuevo con el buzón sano sale a la primera
  buzon().falla = false;
  assert.equal((await pide("DELETE", `/api/agenda/${id}/inscripcion`, ana)).statusCode, 204);
  assert.equal((await pide("POST", `/api/agenda/${id}/inscripcion`, ana, { personas: 1 })).statusCode, 201);
  assert.equal((await rep.reparte()).enviados, 1);
});

test("baja con un clic: el POST sin Origin con la firma apaga los avisos por correo; después no sale nada; una firma ajena no sirve", async t => {
  if (salta(t)) return;
  const secreto = ctx.config.sesion.secreto;
  const malo = await app.inject({ method: "POST", url: "/api/avisos/baja?t=" + ids[ANA] + "." + "a".repeat(32), headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "List-Unsubscribe=One-Click" });
  assert.equal(malo.statusCode, 400);
  assert.equal((await q<{ avisos_correo: boolean }>("SELECT avisos_correo FROM hogares WHERE id = $1", [ids[ANA]]))[0]!.avisos_correo, true);
  const ok = await app.inject({ method: "POST", url: "/api/avisos/baja?t=" + tokenDeBaja(secreto, ids[ANA]!), headers: { "content-type": "application/x-www-form-urlencoded" }, payload: "List-Unsubscribe=One-Click" });
  assert.equal(ok.statusCode, 200);
  assert.equal((await q<{ avisos_correo: boolean }>("SELECT avisos_correo FROM hogares WHERE id = $1", [ids[ANA]]))[0]!.avisos_correo, false);
  assert.equal((await q("SELECT 1 FROM auditoria WHERE accion = 'avisos.baja_correo' AND hogar_id = $1", [ids[ANA]])).length, 1);
  const ana = (await entra(ANA)).sesion;
  const id = await crea();
  vacia();
  assert.equal((await pide("POST", `/api/agenda/${id}/inscripcion`, ana, { personas: 1 })).statusCode, 201);
  await rep.reparte();
  assert.equal(de(ANA).length, 0, "sin avisos_correo, solo la campana");
});

// ---------------------------------------------------------------- Mailpit (SMTP real de infra/dev)
const MAILPIT = process.env["GEMELO_MAILPIT_URL"]?.replace(/\/$/, "");
test("Mailpit: el cartero real manda el aviso de cancelación con el .ics (METHOD:CANCEL) y la baja en las cabeceras", { skip: MAILPIT ? false : "sin GEMELO_MAILPIT_URL: el envío por SMTP NO se ha comprobado" }, async () => {
  const cartero = new CarteroSmtp({ host: "127.0.0.1", puerto: Number(process.env["GEMELO_MAILPIT_SMTP_PUERTO"] ?? 1025), tls: false, usuario: undefined, clave: undefined, remitente: "Gemelo del olivar <gemelo@canoydamas.invalid>" });
  const titulo = "Prueba OF11c " + Date.now();
  const bdFalsa = {
    async query(sql: string) {
      if (sql.includes("UPDATE avisos_hogar ah SET correo_intentos"))
        return { rows: [{ aviso_id: 1, hogar_id: 9, correo_intentos: 1, correo: "mailpit@example.com", titulo, texto: "Se cancela.", enlace: null, evento_id: 3, ics: "cancelacion" }], rowCount: 1 };
      if (sql.includes("FROM visitas WHERE id"))
        return { rows: [{ id: 3, titulo: "Cata", descripcion: null, lugar: "Patio", finca: null, empieza_en: new Date(Date.now() + 864e5), termina_en: null, actualizada_en: new Date(), estado: "cancelada" }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  try {
    const r = await new Repartidor(bdFalsa, cartero, { urlPublica: "https://gemelo.example.com", secreto: "s".repeat(32), remitente: "Gemelo del olivar <gemelo@canoydamas.invalid>", reintentos: 3, cadaSeg: 0 }).reparte();
    assert.equal(r.enviados, 1);
    const lista = await (await fetch(MAILPIT + "/api/v1/search?query=" + encodeURIComponent('subject:"' + titulo + '"'))).json() as { messages: { ID: string }[] };
    assert.equal(lista.messages.length, 1);
    const msg = await (await fetch(MAILPIT + "/api/v1/message/" + lista.messages[0]!.ID)).json() as { Text: string; HTML: string; Attachments: { FileName: string }[]; To: { Address: string }[] };
    assert.equal(msg.To[0]!.Address, "mailpit@example.com");
    assert.match(msg.Text, /Se cancela\./);
    assert.match(msg.Text, /api\/avisos\/baja\?t=9\./);
    assert.ok(msg.Attachments.some(a => /\.ics$/.test(a.FileName)), "lleva el .ics adjunto");
    const crudo = await (await fetch(MAILPIT + "/api/v1/message/" + lista.messages[0]!.ID + "/raw")).text();
    assert.match(crudo, /List-Unsubscribe-Post: List-Unsubscribe=One-Click/i);
    assert.match(crudo, /text\/calendar; (?:charset=utf-8; )?method=CANCEL/i);
  } finally { await cartero.cierra(); }
});
