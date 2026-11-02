// Integración de los avisos de un evento en el mundo (OF11g, migración 0019; contratos/avisos-correo.md): «Avisar…» deja el aviso ligado a su evento aunque el hogar
// no tenga el correo activo, cada hogar solo ve los suyos en GET /api/avisos, marcar leído es suyo, idempotente y auditado, y el historial de la oficina
// trae solo agregados. Contra PostGIS en un contenedor (Docker); se SALTA sin Docker. Datos SINTÉTICOS (correos @example.com). Escrita, NO lanzada en el encargo que la creó.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { Repartidor } from "../../src/avisos/correo.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: los avisos de evento en el mundo con PostGIS NO se han comprobado";
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
  // el alias es único sin distinguir mayúsculas (hogares_alias_unico): cada familia el suyo
  await bd.dueno.query("UPDATE hogares SET alias = CASE id WHEN $1 THEN 'Ana' ELSE 'Luis' END, avisos_correo = true WHERE id = ANY($2)", [ids[ANA], [ids[ANA], ids[LUIS]]]);
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

test("«Avisar…» liga el aviso a su evento; cada hogar ve solo los suyos (con o sin correo); marcar leído es suyo, idempotente y auditado", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const id = await crea();
  for (const [c, p] of [[ANA, 2], [LUIS, 1], [MARTA, 1]] as const) {
    const s = await entra(c);
    const r = await pide("POST", "/api/agenda/" + id + "/inscripcion", s.sesion, { personas: p });
    assert.equal(r.statusCode, 201, r.body);
  }
  const sAna = (await entra(ANA)).sesion, sLuis = (await entra(LUIS)).sesion, sMarta = (await entra(MARTA)).sesion;
  // un evento al que Marta no va: su aviso no le llega
  const otro = await crea({ titulo: "Otro evento" });
  const ajeno = await pide("POST", "/api/agenda/" + otro + "/inscripcion", sAna, { personas: 1 });
  assert.equal(ajeno.statusCode, 201, ajeno.body);
  vacia();
  const av = await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Traed gorra", texto: "Hará sol", a: "apuntados" });
  assert.equal(av.statusCode, 201, av.body);
  const aviso = av.json().aviso as number;
  assert.equal(Number((await q<{ evento_id: string }>("SELECT evento_id FROM avisos WHERE id = $1", [aviso]))[0]!.evento_id), id, "queda ligado a su evento");
  assert.equal((await q<{ ics: string | null }>("SELECT ics FROM avisos WHERE id = $1", [aviso]))[0]!.ics, null, "sin invitación de calendario");
  // Marta no tiene el correo activado: el aviso está igualmente en el mundo
  const deMarta = (await pide("GET", "/api/avisos", sMarta)).json();
  const suyo = deMarta.avisos.find((a: { id: number }) => a.id === aviso);
  assert.ok(suyo, "Marta lo ve aunque no tenga avisos_correo");
  assert.deepEqual(Object.keys(suyo).sort(), ["evento", "evento_id", "fecha", "id", "leido", "texto", "titulo"]);
  assert.equal(suyo.evento_id, id); assert.equal(suyo.titulo, "Traed gorra"); assert.equal(suyo.texto, "Hará sol"); assert.equal(suyo.leido, false);
  assert.ok(deMarta.sin_leer >= 1);
  assert.equal((await q("SELECT 1 FROM avisos_hogar WHERE aviso_id = $1 AND hogar_id = $2 AND correo_enviado_en IS NOT NULL", [aviso, ids[MARTA]])).length, 0, "y por correo, nada");
  // un aviso del otro evento solo lo ve quien está en él
  const avOtro = await pide("POST", "/api/admin/eventos/" + otro + "/avisar", ofi, { titulo: "Solo Ana", a: "apuntados" });
  assert.equal(avOtro.statusCode, 201, avOtro.body);
  const titulosDe = async (s: string) => ((await pide("GET", "/api/avisos", s)).json().avisos as { titulo: string }[]).map(a => a.titulo);
  assert.ok((await titulosDe(sAna)).includes("Solo Ana") && !(await titulosDe(sLuis)).includes("Solo Ana") && !(await titulosDe(sMarta)).includes("Solo Ana"));
  // marcar leído: lo de uno no toca lo del otro; idempotente; auditado una sola vez; ajeno o inexistente, 404
  assert.equal((await pide("POST", "/api/avisos/" + aviso + "/leido", sMarta, {})).statusCode, 204);
  assert.equal((await pide("POST", "/api/avisos/" + aviso + "/leido", sMarta, {})).statusCode, 204, "idempotente");
  assert.equal((await q("SELECT 1 FROM auditoria WHERE accion = 'avisos.leido' AND hogar_id = $1 AND (detalle ->> 'aviso')::bigint = $2", [ids[MARTA], aviso])).length, 1, "auditado una vez");
  const alVer = (s: string) => pide("GET", "/api/avisos", s).then(r => (r.json().avisos as { id: number; leido: boolean }[]).find(a => a.id === aviso)!.leido);
  assert.equal(await alVer(sMarta), true); assert.equal(await alVer(sLuis), false, "Luis aún no lo ha visto");
  assert.equal((await pide("POST", "/api/avisos/" + avOtro.json().aviso + "/leido", sLuis, {})).statusCode, 404, "el aviso de otra familia no se puede marcar");
  assert.equal((await pide("POST", "/api/avisos/999999/leido", sLuis, {})).statusCode, 404);
  assert.equal((await pide("POST", "/api/avisos/" + aviso + "/leido", sLuis, { hogar: ids[ANA] })).statusCode, 400, "cuerpo estricto");
  assert.equal((await q<{ leido_en: string | null }>("SELECT leido_en FROM avisos_hogar WHERE aviso_id = $1 AND hogar_id = $2", [aviso, ids[LUIS]]))[0]!.leido_en, null);
  // sin sesión, 401
  assert.equal((await app.inject({ method: "GET", url: "/api/avisos", headers: deLaWeb({ "x-forwarded-for": ip() }) })).statusCode, 401);
});

test("el historial de la oficina trae agregados y nunca qué familia lo leyó", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const id = await crea({ titulo: "Con historial" });
  const sAna = (await entra(ANA)).sesion, sLuis = (await entra(LUIS)).sesion;
  for (const s of [sAna, sLuis]) assert.equal((await pide("POST", "/api/agenda/" + id + "/inscripcion", s, { personas: 1 })).statusCode, 201);
  const av = await pide("POST", "/api/admin/eventos/" + id + "/avisar", ofi, { titulo: "Cambio de hora", a: "apuntados" });
  await pide("POST", "/api/avisos/" + av.json().aviso + "/leido", sAna, {});
  const r = await pide("GET", "/api/admin/eventos/" + id + "/avisos", ofi);
  assert.equal(r.statusCode, 200, r.body);
  const a = (r.json().avisos as Record<string, unknown>[]).find(x => x.id === av.json().aviso)!;
  assert.equal(a.titulo, "Cambio de hora"); assert.equal(a.manual, true); assert.equal(a.destinatarios, 2); assert.equal(a.leidos, 1);
  assert.ok(!/ana|luis|example\.com/i.test(JSON.stringify(r.json())), "ni nombres ni correos");
  assert.equal((await pide("GET", "/api/admin/eventos/" + id + "/avisos", sAna)).statusCode, 403, "una familia no ve el historial");
  assert.equal((await pide("GET", "/api/admin/eventos/999999/avisos", ofi)).statusCode, 404);
});
