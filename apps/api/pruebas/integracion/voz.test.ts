// Integración de F3c (la voz de las guiadas; ADR-0026; contratos livekit-roles v6 y presencia.md) contra PostGIS en un contenedor y una sala de LiveKit de
// mentira con un reloj que se adelanta a mano: el guía del evento lo pone la oficina; el token de `guiada-<evento>` es solo para el guía, la oficina y las
// familias APUNTADAS (no en espera); el guía y la oficina con micrófono, la familia sin él; la palabra la dan el guía o la oficina a una familia cada vez,
// vence sola a los 2 min, se alarga y se quita; manos en orden; silenciar y expulsar; todo en la auditoría (quién, a quién, cuándo; nada de voz).
// Al final, si hay un LiveKit de desarrollo (GEMELO_DEV_LIVEKIT_URL, _CLAVE y _SECRETO, p. ej. el de infra/dev), comprueba contra él lo que se puede sin
// clientes de verdad: que el 404 de UpdateParticipant se lee como «no está» y que las salas guiadas se listan. Lo de que el permiso revocado despublique
// es de F3g (tres Chrome por el banco). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { RoomServiceClient, TokenVerifier } from "livekit-server-sdk";
import { construyeApp } from "../../src/app.ts";
import { ModeradorLiveKit, type ModeradorSala } from "../../src/presencia/livekit.ts";
import { ATRIBUTOS, AVISO_CIERRE_S, TURNO_S } from "../../src/presencia/voz.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: F3c (voz de las guiadas) con PostGIS NO se ha comprobado";
const LIVEKIT = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "/rtc", GEMELO_LIVEKIT_CLAVE: "devf3c", GEMELO_LIVEKIT_SECRETO: "f".repeat(40) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-f3c@example.com", GUIA = "guia-f3c@example.com", ANA = "ana-f3c@example.com", BETA = "beta-f3c@example.com", GAMMA = "gamma-f3c@example.com", DELTA = "delta-f3c@example.com";
const ids: Record<string, number> = {}, ses: Record<string, string> = {}, ident: Record<string, string> = {};
let ev = 0, otro = 0;
const sala = new SalaFalsa(), reloj = new RelojFalso();
const moderador: ModeradorSala = { async expulsaHogar() { return 0; }, async envia() { return false; } };

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [GUIA, "guia"], [ANA, "hogar"], [BETA, "hogar"], [GAMMA, "hogar"], [DELTA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  ev = Number((await bd.dueno.query<{ id: number }>("INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas) VALUES ('Guiada F3c', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 10) RETURNING id")).rows[0]!.id);
  otro = Number((await bd.dueno.query<{ id: number }>("INSERT INTO visitas (titulo, tipo, empieza_en, estado) VALUES ('Taller F3c', 'taller', now() + interval '5 minutes', 'abierta') RETURNING id")).rows[0]!.id);
  await bd.dueno.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado'), ($1, $3, 'apuntado'), ($1, $4, 'en_espera')", [ev, ids[ANA], ids[BETA], ids[GAMMA]]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", ...LIVEKIT }));
  ctx.moderador = moderador; ctx.moderadorVoz = sala; ctx.relojVoz = reloj;
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
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const auditoria = async (accion: string) => (await bd.dueno.query<{ hogar_id: string | null; detalle: Record<string, unknown> }>("SELECT hogar_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id DESC LIMIT 1", [accion])).rows[0];
const G = () => "/api/presencia/guiadas/" + ev;
const SALA = () => "guiada-" + ev;
const v = () => new TokenVerifier(LIVEKIT.GEMELO_LIVEKIT_CLAVE, LIVEKIT.GEMELO_LIVEKIT_SECRETO);

test("el guía del evento: solo lo pone la oficina, y solo una cuenta de guía o de la oficina", async t => {
  if (salta(t)) return;
  const o = await entra(OFI);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(o.aparato!)]);
  ses[OFI] = o.sesion;
  for (const c of [GUIA, ANA, BETA, GAMMA, DELTA]) ses[c] = (await entra(c)).sesion;
  assert.equal((await pide("PUT", "/api/admin/eventos/" + ev + "/guia", ses[GUIA]!, { hogar_id: ids[GUIA] })).statusCode, 403, "el guía no se pone solo");
  assert.equal((await pide("PUT", "/api/admin/eventos/" + ev + "/guia", ses[OFI]!, { hogar_id: ids[ANA] })).json().error, "no_es_guia");
  assert.equal((await pide("PUT", "/api/admin/eventos/" + ev + "/guia", ses[OFI]!, { hogar_id: 2147483000 })).statusCode, 404);
  const r = await pide("PUT", "/api/admin/eventos/" + ev + "/guia", ses[OFI]!, { hogar_id: ids[GUIA] });
  assert.equal(r.statusCode, 200, r.body); assert.deepEqual(r.json(), { guia_id: ids[GUIA] });
  assert.deepEqual((await auditoria("admin.evento_guia"))!.detalle, { evento: ev, guia: ids[GUIA] });
});

test("token de la sala guiada: guía y oficina con micrófono; las apuntadas sin él; en espera, no inscrita o un taller, no", async t => {
  if (salta(t)) return;
  const tk = (c: string, e = ev) => pide("POST", "/api/presencia/guiadas/" + e + "/token", ses[c]!, { dispositivo: "escritorio" });
  for (const [c, papel, micro] of [[GUIA, "guia", true], [OFI, "oficina", true], [ANA, "familia", false], [BETA, "familia", false]] as const) {
    const r = await tk(c);
    assert.equal(r.statusCode, 200, c + " " + r.body);
    const b = r.json();
    assert.equal(b.sala, SALA()); assert.equal(b.papel, papel);
    const cl = await v().verify(b.token);
    assert.equal(cl.video!.canPublish, micro, c); assert.deepEqual(cl.video!.canPublishSources ?? [], micro ? ["microphone"] : [], c);
    assert.equal(cl.video!.roomAdmin, false); assert.equal(JSON.parse(cl.metadata!).papel, papel);
    ident[c] = b.identidad;
    sala.entra(SALA(), b.identidad, papel);   // «se conecta» a la sala de mentira
  }
  for (const c of [GAMMA, DELTA]) { const r = await tk(c); assert.equal(r.statusCode, 403, c); assert.equal(r.json().error, "guiada_solo_inscritos"); }
  assert.equal((await tk(ANA, otro)).statusCode, 404, "un taller no tiene sala de voz");
  // la promoción de la espera abre la puerta; borrarse la cierra (contra la base, sin memoria)
  await bd.dueno.query("UPDATE visitas_asistentes SET estado = 'apuntado' WHERE visita_id = $1 AND hogar_id = $2", [ev, ids[GAMMA]]);
  assert.equal((await tk(GAMMA)).statusCode, 200);
  await bd.dueno.query("UPDATE visitas_asistentes SET estado = 'anulado', anulado_en = now() WHERE visita_id = $1 AND hogar_id = $2", [ev, ids[GAMMA]]);
  assert.equal((await tk(GAMMA)).statusCode, 403);
});

test("manos y palabra: la familia levanta la mano; solo el guía o la oficina dan la palabra, a una familia apuntada y a una sola a la vez", async t => {
  if (salta(t)) return;
  const mano = await pide("POST", G() + "/mano", ses[BETA]!, {});
  assert.equal(mano.statusCode, 200, mano.body); assert.deepEqual(mano.json(), { puesto: 1 });
  assert.deepEqual((await pide("POST", G() + "/mano", ses[ANA]!, {})).json(), { puesto: 2 });
  assert.equal((await pide("POST", G() + "/mano", ses[GUIA]!, {})).json().error, "no_eres_familia");
  assert.equal((await pide("GET", G() + "/palabra", ses[ANA]!)).statusCode, 403, "una familia no ve la cola");
  const e = (await pide("GET", G() + "/palabra", ses[GUIA]!)).json();
  assert.deepEqual(e.manos.map((m: { identidad: string }) => m.identidad), [ident[BETA], ident[ANA]]); assert.equal(e.turno, null);
  assert.ok(sala.p(SALA(), ident[BETA]!)!.atributos[ATRIBUTOS.mano]);
  assert.deepEqual((await auditoria("guiada.mano_levantada"))!.detalle, { evento: ev, hogar: ids[ANA] });

  assert.equal((await pide("POST", G() + "/palabra", ses[ANA]!, { identidad: ident[BETA] })).statusCode, 403, "una familia no da la palabra");
  assert.equal((await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[GUIA] })).json().error, "no_es_familia_apuntada");
  const r = await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[BETA] });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(sala.p(SALA(), ident[BETA]!)!.micro, true);
  assert.deepEqual((await auditoria("guiada.palabra_dada"))!.detalle, { evento: ev, hogar: ids[BETA], segundos: TURNO_S });
  assert.equal(Number((await auditoria("guiada.palabra_dada"))!.hogar_id), ids[GUIA], "quién la dio");
  assert.equal((await pide("POST", G() + "/palabra", ses[OFI]!, { identidad: ident[ANA] })).json().error, "palabra_ocupada");
  assert.deepEqual(sala.conMicro(SALA()), [ident[BETA]]);
  assert.deepEqual((await pide("GET", G() + "/palabra", ses[OFI]!)).json().manos.map((m: { identidad: string }) => m.identidad), [ident[ANA]], "al darle la palabra se le baja la mano");
});

test("la palabra vence sola a los 2 min (el servidor la quita); alargar y cortar", async t => {
  if (salta(t)) return;
  await reloj.avanza(TURNO_S * 1000);
  assert.equal(sala.p(SALA(), ident[BETA]!)!.micro, false);
  const q = await auditoria("guiada.palabra_quitada");
  assert.equal(q!.hogar_id, null, "lo quita el sistema"); assert.deepEqual(q!.detalle, { evento: ev, hogar: ids[BETA], motivo: "vencida" });
  assert.equal((await pide("POST", G() + "/palabra", ses[OFI]!, { identidad: ident[ANA] })).statusCode, 200);
  const a = await pide("POST", G() + "/palabra/alargar", ses[GUIA]!, {});
  assert.equal(a.statusCode, 200, a.body);
  assert.equal(sala.p(SALA(), ident[ANA]!)!.atributos[ATRIBUTOS.palabra], a.json().hasta);
  assert.equal((await pide("DELETE", G() + "/palabra", ses[GUIA]!)).statusCode, 204);
  assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, false);
  assert.deepEqual((await auditoria("guiada.palabra_quitada"))!.detalle, { evento: ev, hogar: ids[ANA], motivo: "cortada" });
  assert.equal((await pide("DELETE", G() + "/palabra", ses[GUIA]!)).json().error, "nadie_tiene_la_palabra");
});

test("silenciar a todos menos al guía, y expulsar: fuera de la sala, sin palabra y 15 min sin token de esa visita", async t => {
  if (salta(t)) return;
  await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[ANA] });
  sala.p(SALA(), ident[ANA]!)!.pistas = ["TR_ana"]; sala.p(SALA(), ident[OFI]!)!.pistas = ["TR_ofi"]; sala.p(SALA(), ident[GUIA]!)!.pistas = ["TR_guia"];
  const s = await pide("POST", G() + "/silenciar", ses[GUIA]!, {});
  assert.equal(s.statusCode, 200, s.body);
  assert.deepEqual(s.json(), { pistas: 1, palabra_quitada: true }, "la de la oficina (pista silenciada) y la de Ana ya despublicada al quitarle la palabra");
  assert.deepEqual(sala.p(SALA(), ident[GUIA]!)!.pistas, ["TR_guia"], "el guía sigue hablando");
  assert.deepEqual((await auditoria("guiada.silenciados"))!.detalle, { evento: ev, pistas: 1, palabra_quitada: true });
  assert.equal((await pide("POST", G() + "/expulsar", ses[ANA]!, { identidad: ident[BETA] })).statusCode, 403);
  assert.equal((await pide("POST", G() + "/expulsar", ses[GUIA]!, { identidad: ident[OFI] })).json().error, "no_es_familia_apuntada", "el guía no saca a la oficina");
  const x = await pide("POST", G() + "/expulsar", ses[GUIA]!, { identidad: ident[BETA], motivo: "prueba" });
  assert.equal(x.statusCode, 200, x.body); assert.deepEqual(x.json(), { conexiones: 1 });
  assert.equal(sala.p(SALA(), ident[BETA]!), undefined);
  assert.deepEqual((await auditoria("guiada.expulsado"))!.detalle, { evento: ev, hogar: ids[BETA], conexiones: 1, motivo: "prueba" });
  assert.equal((await pide("POST", G() + "/token", ses[BETA]!, { dispositivo: "movil" })).json().error, "expulsado");
  for (const f of (await bd.dueno.query<{ detalle: unknown }>("SELECT detalle FROM auditoria WHERE accion LIKE 'guiada.%'")).rows)
    assert.ok(!/@|audio|texto/.test(JSON.stringify(f.detalle)), "la auditoría no lleva correos, audio ni texto");
});

test("F3f, preparar la visita: GET …/palabra dice cuántas familias apuntadas hay y cuántas están ya en la sala (solo números)", async t => {
  if (salta(t)) return;
  const e = (await pide("GET", G() + "/palabra", ses[GUIA]!)).json();
  // apuntadas: Ana y Beta (Gamma se borró; el guía no cuenta); en la sala, Ana (Beta fue expulsada)
  assert.deepEqual(e.inscritos, { apuntados: 2, conectados: 1 }); assert.equal(e.cierra_en, null);
  assert.ok(!/@/.test(JSON.stringify(e)), "sin correos");
});

test("F3f, cerrar la sala (decisión 155): aviso por el tema «cierre» con el instante y la vuelta a la general; a los segundos, DeleteRoom; las familias ya no entran", async t => {
  if (salta(t)) return;
  assert.equal((await pide("POST", G() + "/cerrar", ses[ANA]!, {})).statusCode, 403, "una familia no cierra la sala");
  assert.equal((await pide("POST", G() + "/cerrar", ses[GUIA]!, { segundos: 2 })).statusCode, 400, "menos de 5 s, no");
  await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[ANA] });
  const t0 = reloj.ahora();
  const r = await pide("POST", G() + "/cerrar", ses[GUIA]!, {});
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { cierra_en: new Date(t0 + AVISO_CIERRE_S * 1000).toISOString(), segundos: AVISO_CIERRE_S, avisados: true });
  assert.deepEqual(sala.enviados.at(-1), { sala: SALA(), tema: "cierre", datos: { v: 1, en: r.json().cierra_en, a: "general" } });
  assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, false, "se le quita la palabra al cerrar");
  assert.deepEqual((await auditoria("guiada.palabra_quitada"))!.detalle, { evento: ev, hogar: ids[ANA], motivo: "cierre" });
  assert.deepEqual((await auditoria("guiada.cerrada"))!.detalle, { evento: ev, segundos: AVISO_CIERRE_S, palabra_quitada: true, avisados: true });
  assert.equal((await pide("POST", G() + "/cerrar", ses[OFI]!, {})).json().error, "ya_cerrandose");
  assert.equal((await pide("GET", G() + "/palabra", ses[OFI]!)).json().cierra_en, r.json().cierra_en);
  // mientras se avisa y después, las familias no reciben token; el guía y la oficina sí
  assert.equal((await pide("POST", G() + "/token", ses[ANA]!, { dispositivo: "escritorio" })).json().error, "guiada_cerrada");
  assert.equal((await pide("POST", G() + "/token", ses[GUIA]!, { dispositivo: "escritorio" })).statusCode, 200);
  assert.deepEqual(sala.borradas, []);
  await reloj.avanza(AVISO_CIERRE_S * 1000);
  assert.deepEqual(sala.borradas, [SALA()], "DeleteRoom a los segundos del aviso");
  assert.equal((await pide("POST", G() + "/token", ses[ANA]!, { dispositivo: "escritorio" })).json().error, "guiada_cerrada");
});

// ---------------------------------------------------------------- contra un LiveKit de desarrollo, si lo hay
const DEV = { url: process.env.GEMELO_DEV_LIVEKIT_URL, clave: process.env.GEMELO_DEV_LIVEKIT_CLAVE, secreto: process.env.GEMELO_DEV_LIVEKIT_SECRETO };
test("LiveKit de desarrollo: una sala guiada se lista, quien no está da «no está» (404 de UpdateParticipant) y no hay nadie que silenciar", async t => {
  if (!DEV.url || !DEV.clave || !DEV.secreto) { t.skip("sin GEMELO_DEV_LIVEKIT_URL/_CLAVE/_SECRETO: NO comprobado contra LiveKit real"); return; }
  const rs = new RoomServiceClient(DEV.url, DEV.clave, DEV.secreto), nombre = "guiada-" + (900000 + Math.floor(Math.random() * 99999));
  const m = new ModeradorLiveKit({ url: DEV.url, urlPublica: DEV.url, clave: DEV.clave, secreto: DEV.secreto });
  await rs.createRoom({ name: nombre, emptyTimeout: 60 });
  try {
    assert.ok((await m.salasGuiadas()).includes(nombre));
    assert.deepEqual(await m.presentes(nombre), []);
    assert.equal(await m.actualiza(nombre, "h_" + "a".repeat(22) + "_" + "b".repeat(8), { micro: true }), false);
    assert.equal(await m.silencia(nombre, ["h_" + "a".repeat(22) + "_" + "b".repeat(8)]), 0);
  } finally { await rs.deleteRoom(nombre).catch(() => undefined); }
});
