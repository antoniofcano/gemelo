// Integración de OF10 (el mundo en modo oficina; migración 0014; doc/sistema/OFICINA.md §6) contra PostGIS en un contenedor y una sala de LiveKit de
// mentira: solo la oficina anuncia, invita a otra sala y pone, mueve y quita balizas oficiales; lo que manda va por la sala sin participante (lo apunta
// el moderador de mentira) y queda en la auditoría; las balizas se ven con sesión, caducan, caben como mucho 20 por finca y no salen de la finca; la
// oficina entra en la sala con el alias «Oficina». Datos SINTÉTICOS (correos @example.com, una finca «prueba-of10» con un contorno inventado).
// Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { TokenVerifier } from "livekit-server-sdk";
import { construyeApp } from "../../src/app.ts";
import type { ModeradorSala } from "../../src/presencia/livekit.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: OF10 (balizas oficiales, anunciar, llevar) con PostGIS NO se ha comprobado";
const LIVEKIT = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "/rtc", GEMELO_LIVEKIT_CLAVE: "devof10", GEMELO_LIVEKIT_SECRETO: "k".repeat(40) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-of10@example.com", ANA = "ana-of10@example.com";
const ids: Record<string, number> = {};
let ofi = "", ana = "";
const FINCA = "prueba-of10", X0 = 400_000, Y0 = 4_100_000;   // un cuadrado de 1 km de contorno inventado
const enviados: { sala: string; tema: string; datos: unknown }[] = [];
const moderador: ModeradorSala = {
  async expulsaHogar() { return 0; },
  async envia(sala, tema, datos) { enviados.push({ sala, tema, datos: JSON.parse(new TextDecoder().decode(datos)) }); return sala === "hituelo-libre"; },
};

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  await bd.dueno.query("UPDATE hogares SET alias = 'Pepa de la oficina' WHERE id = $1", [ids[OFI]]);
  await bd.dueno.query(
    "INSERT INTO fincas_contorno (finca, geom, fuente, consultado_en, parcelas) VALUES ($1, ST_Multi(ST_MakeEnvelope($2, $3, $4, $5, 25830)), 'sigpac', '2026-01-01', 1)",
    [FINCA, X0, Y0, X0 + 1000, Y0 + 1000]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", ...LIVEKIT }));
  ctx.moderador = moderador;
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
const auditoria = async (accion: string) => (await bd.dueno.query<{ hogar_id: string; detalle: Record<string, unknown> }>("SELECT hogar_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id DESC LIMIT 1", [accion])).rows[0];

test("solo la oficina: un hogar recibe 403 al anunciar, llevar o poner balizas; nada sale por la sala", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI); ana = (await entra(ANA)).sesion;
  assert.equal((await pide("POST", "/api/admin/presencia/anuncio", ana, { texto: "hola", sala: "todas" })).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ana, { de: "general", a: "visita" })).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/balizas", ana, { finca: FINCA, x: X0 + 10, y: Y0 + 10, titulo: "Mía" })).statusCode, 403);
  assert.equal((await pide("DELETE", "/api/admin/balizas/1", ana)).statusCode, 403);
  assert.deepEqual(enviados, []);
});

test("la oficina entra en la sala con el alias «Oficina» (decisión 107) y su rol; un hogar puede pedir la sala de la visita", async t => {
  if (salta(t)) return;
  const r = await pide("POST", "/api/presencia/token", ofi, { dispositivo: "escritorio" });
  assert.equal(r.statusCode, 200, r.body);
  const c = await new TokenVerifier(LIVEKIT.GEMELO_LIVEKIT_CLAVE, LIVEKIT.GEMELO_LIVEKIT_SECRETO).verify(r.json().token);
  const m = JSON.parse(c.metadata!);
  assert.equal(m.alias, "Oficina"); assert.equal(m.rol, "oficina"); assert.ok(!r.body.includes("Pepa"), "su alias de cuenta no viaja");
  const v = await pide("POST", "/api/presencia/token", ana, { dispositivo: "movil", sala: "visita" });
  assert.equal(v.statusCode, 200, v.body); assert.equal(v.json().sala, "hituelo-visita");
});

test("anunciar: limpio, por el tema «anuncio» a las salas pedidas, sin participante, y en la auditoría", async t => {
  if (salta(t)) return;
  enviados.length = 0;
  const r = await pide("POST", "/api/admin/presencia/anuncio", ofi, { texto: "  Hoy  se recoge\nen la loma  ", sala: "todas" });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { salas: ["hituelo-libre"] }, "solo en la que había alguien (el moderador de mentira: la libre)");
  assert.deepEqual(enviados, [{ sala: "hituelo-libre", tema: "anuncio", datos: { v: 1, texto: "Hoy se recoge en la loma" } }, { sala: "hituelo-visita", tema: "anuncio", datos: { v: 1, texto: "Hoy se recoge en la loma" } }]);
  const a = await auditoria("admin.presencia_anuncio");
  assert.equal(Number(a!.hogar_id), ids[OFI]); assert.deepEqual(a!.detalle, { sala: "todas", salas: "hituelo-libre", texto: "Hoy se recoge en la loma" });
  assert.equal((await pide("POST", "/api/admin/presencia/anuncio", ofi, { texto: " \n ", sala: "general" })).statusCode, 400, "vacío tras limpiar");
});

test("llevar: invita por el tema «sala» a quien está en la sala de origen; la misma sala, 400", async t => {
  if (salta(t)) return;
  enviados.length = 0;
  const r = await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita" });
  assert.equal(r.statusCode, 200, r.body); assert.deepEqual(r.json(), { enviado: true });
  assert.deepEqual(enviados, [{ sala: "hituelo-libre", tema: "sala", datos: { v: 1, a: "visita" } }]);
  assert.deepEqual((await auditoria("admin.presencia_llevar"))!.detalle, { de: "general", a: "visita", habia_sala: true });
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "visita", a: "visita" })).statusCode, 400);
});

test("OF10b: la sala de la visita ligada a un evento: 403 visita_solo_inscritos a quien no está apuntado (o está en espera); entran los apuntados y la oficina", async t => {
  if (salta(t)) return;
  const BETA = "beta-of10b@example.com", GAMMA = "gamma-of10b@example.com";
  for (const c of [BETA, GAMMA]) ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, 'hogar') RETURNING id", [c])).rows[0]!.id);
  const evId = async (estado: string) => Number((await bd.dueno.query<{ id: number }>(
    "INSERT INTO visitas (titulo, tipo, empieza_en, estado, plazas) VALUES ('Visita de prueba OF10b', 'guiada', now() + interval '1 day', $1, 5) RETURNING id", [estado])).rows[0]!.id);
  const ev = await evId("abierta");
  await bd.dueno.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado, personas) VALUES ($1, $2, 'apuntado', 2), ($1, $3, 'en_espera', 1)", [ev, ids[ANA], ids[BETA]]);
  const beta = (await entra(BETA)).sesion, gamma = (await entra(GAMMA)).sesion;
  const token = (s: string, sala = "visita") => pide("POST", "/api/presencia/token", s, { dispositivo: "escritorio", sala });
  // sin evento ligado: entra cualquiera con sesión (lo de OF10)
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita" })).statusCode, 200);
  for (const s of [ana, beta, gamma]) assert.equal((await token(s)).statusCode, 200);
  // el evento tiene que existir y estar vigente; solo se liga la sala de la visita
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita", evento: 2147483000 })).statusCode, 404);
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "visita", a: "general", evento: ev })).statusCode, 400);
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita", evento: await evId("cancelada") })).statusCode, 409);
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita", evento: await evId("borrador") })).statusCode, 409);
  // ligada: la oficina y la apuntada pasan; la que está en espera y la que no está, 403 con su código; la sala general no se toca
  const r = await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita", evento: ev });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual((await auditoria("admin.presencia_llevar"))!.detalle, { de: "general", a: "visita", habia_sala: true, evento: ev });
  assert.equal((await token(ofi)).statusCode, 200, "la oficina");
  assert.equal((await token(ana)).statusCode, 200, "apuntada");
  for (const s of [beta, gamma]) {
    const x = await token(s);
    assert.equal(x.statusCode, 403, x.body);
    assert.deepEqual(x.json(), { error: "visita_solo_inscritos", mensaje: "Esta visita es para las familias apuntadas." });
    assert.equal((await token(s, "general")).statusCode, 200, "la sala general sigue abierta");
  }
  // si la apuntada se borra de la lista, deja de entrar; si la espera se promueve, entra
  await bd.dueno.query("UPDATE visitas_asistentes SET estado = 'anulado', anulado_en = now() WHERE visita_id = $1 AND hogar_id = $2", [ev, ids[ANA]]);
  await bd.dueno.query("UPDATE visitas_asistentes SET estado = 'apuntado' WHERE visita_id = $1 AND hogar_id = $2", [ev, ids[BETA]]);
  assert.equal((await token(ana)).statusCode, 403); assert.equal((await token(beta)).statusCode, 200);
  // cancelado el evento, solo la oficina
  await bd.dueno.query("UPDATE visitas SET estado = 'cancelada' WHERE id = $1", [ev]);
  assert.equal((await token(beta)).statusCode, 403); assert.equal((await token(ofi)).statusCode, 200);
  // invitar a la sala de la visita sin evento la deja abierta otra vez
  assert.equal((await pide("POST", "/api/admin/presencia/llevar", ofi, { de: "general", a: "visita" })).statusCode, 200);
  for (const s of [ana, gamma]) assert.equal((await token(s)).statusCode, 200);
});

test("balizas oficiales: poner (en la finca), verlas con sesión, moverlas, quitarlas; avisan a las salas y quedan en la auditoría", async t => {
  if (salta(t)) return;
  enviados.length = 0;
  const p = await pide("POST", "/api/admin/balizas", ofi, { finca: FINCA, x: X0 + 500.123, y: Y0 + 250, titulo: " Aquí  se recoge hoy ", texto: "Traed agua", horas: 4 });
  assert.equal(p.statusCode, 201, p.body);
  const id = p.json().id;
  assert.deepEqual(enviados.map(e => e.tema + "@" + e.sala), ["balizas@hituelo-libre", "balizas@hituelo-visita"]); assert.deepEqual(enviados[0]!.datos, { v: 1, finca: FINCA });
  let l = (await pide("GET", "/api/balizas-oficiales?finca=" + FINCA, ana)).json();
  assert.equal(l.srs, "EPSG:25830"); assert.equal(l.balizas.length, 1);
  const b = l.balizas[0];
  assert.deepEqual({ ...b, hasta: undefined }, { id, finca: FINCA, x: X0 + 500.12, y: Y0 + 250, titulo: "Aquí se recoge hoy", texto: "Traed agua", hasta: undefined });
  assert.ok(Math.abs(Date.parse(b.hasta) - (Date.now() + 4 * 3600_000)) < 60_000, "caduca a las 4 h");
  assert.ok(!/autor|ofi-of10|Pepa/.test(JSON.stringify(l)), "sin quién la puso");
  assert.equal((await app.inject({ method: "GET", url: "/api/balizas-oficiales?finca=" + FINCA, headers: deLaWeb() })).statusCode, 401);
  assert.deepEqual((await auditoria("admin.baliza_puesta"))!.detalle, { id, finca: FINCA, horas: 4 });
  // fuera de la finca, finca desconocida
  assert.equal((await pide("POST", "/api/admin/balizas", ofi, { finca: FINCA, x: X0 + 5000, y: Y0, titulo: "Lejos" })).json().error, "fuera_de_finca");
  assert.equal((await pide("POST", "/api/admin/balizas", ofi, { finca: "no-existe", x: X0, y: Y0, titulo: "¿?" })).json().error, "finca_desconocida");
  // mover
  assert.equal((await pide("PUT", "/api/admin/balizas/" + id, ofi, { x: X0 + 100, y: Y0 + 100 })).statusCode, 200);
  l = (await pide("GET", "/api/balizas-oficiales?finca=" + FINCA, ana)).json();
  assert.deepEqual([l.balizas[0].x, l.balizas[0].y], [X0 + 100, Y0 + 100]);
  assert.equal((await pide("PUT", "/api/admin/balizas/" + id, ofi, { x: X0 + 9000, y: Y0 })).json().error, "fuera_de_finca");
  // quitar: deja de verse, la fila queda (retirada) y no se quita dos veces
  assert.equal((await pide("DELETE", "/api/admin/balizas/" + id, ofi)).statusCode, 204);
  assert.equal((await pide("GET", "/api/balizas-oficiales?finca=" + FINCA, ana)).json().balizas.length, 0);
  const f = (await bd.dueno.query("SELECT retirada_en, retirada_por FROM balizas_oficiales WHERE id = $1", [id])).rows[0];
  assert.ok(f.retirada_en); assert.equal(Number(f.retirada_por), ids[OFI]);
  assert.equal((await pide("DELETE", "/api/admin/balizas/" + id, ofi)).statusCode, 404);
  assert.equal((await pide("PUT", "/api/admin/balizas/" + id, ofi, { x: X0 + 1, y: Y0 + 1 })).statusCode, 404);
  assert.deepEqual((await auditoria("admin.baliza_quitada"))!.detalle, { id, finca: FINCA });
});

test("balizas oficiales: caducan solas y como mucho 20 vigentes por finca", async t => {
  if (salta(t)) return;
  const id = (await pide("POST", "/api/admin/balizas", ofi, { finca: FINCA, x: X0 + 1, y: Y0 + 1, titulo: "Caduca" })).json().id;
  await bd.dueno.query("UPDATE balizas_oficiales SET desde = now() - interval '2 hours', hasta = now() - interval '1 minute' WHERE id = $1", [id]);
  assert.ok(!(await pide("GET", "/api/balizas-oficiales?finca=" + FINCA, ana)).json().balizas.some((b: { id: number }) => b.id === id), "caducada no se ve");
  for (let i = 0; i < 20; i++) assert.equal((await pide("POST", "/api/admin/balizas", ofi, { finca: FINCA, x: X0 + 10 + i, y: Y0 + 10, titulo: "B" + i })).statusCode, 201, "baliza " + i);
  const r = await pide("POST", "/api/admin/balizas", ofi, { finca: FINCA, x: X0 + 50, y: Y0 + 50, titulo: "Una de más" });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "demasiadas");
  assert.equal((await pide("GET", "/api/balizas-oficiales?finca=" + FINCA, ana)).json().balizas.length, 20);
});
