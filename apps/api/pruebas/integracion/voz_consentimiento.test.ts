// Integración de F3j (consentimiento de voz y plazo de la auditoría de voz; ADR-0026, decisiones 163 y 164; contratos/voz-consentimiento.md) contra PostGIS en un
// contenedor (la misma imagen que producción) y una sala de LiveKit de mentira con un reloj que se adelanta a mano. Escrita, SIN EJECUTAR en la sesión que la
// escribió (hay una puerta pesada corriendo: pasa por el banco). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso.
//   1. GET: sin fila, aceptada falsa; PUT con otra versión, 409; PUT con la vigente, 200 (idempotente, una sola fila de auditoría); DELETE, 204 (idempotente).
//   2. Sin consentimiento: la mano da 409 sin_consentimiento y la palabra también, SIN tocar LiveKit (ninguna llamada a la sala; el permiso no se abre).
//   3. Con consentimiento todo sigue igual; una versión vieja en la base (como tras subir VOZ_AVISO_VERSION) vuelve a no valer.
//   4. Retirar con la palabra dada: se le quita en la sala y se baja su mano (auditoría con motivo «consentimiento»).
//   5. «Mis datos» lleva el consentimiento; borrar el hogar lo borra (cascada).
//   6. El plazo: la función de la base borra solo las acciones de la voz fuera de plazo (y no el resto de la auditoría); gemelo_api no puede borrar de la auditoría
//      a mano pero sí llamar a la función.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import type { ModeradorSala } from "../../src/presencia/livekit.ts";
import { corteAuditoriaVoz, purgaAuditoriaVoz, VOZ_AVISO_VERSION } from "../../src/presencia/consentimiento_voz.ts";
import { ATRIBUTOS } from "../../src/presencia/voz.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: F3j (consentimiento de voz) con PostGIS NO se ha comprobado";
const LIVEKIT = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "/rtc", GEMELO_LIVEKIT_CLAVE: "devf3j", GEMELO_LIVEKIT_SECRETO: "j".repeat(40) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0, ev = 0;
const GUIA = "guia-f3j@example.com", ANA = "ana-f3j@example.com", BETA = "beta-f3j@example.com";
const ids: Record<string, number> = {}, ses: Record<string, string> = {}, ident: Record<string, string> = {};
const sala = new SalaFalsa(), reloj = new RelojFalso();
const moderador: ModeradorSala = { async expulsaHogar() { return 0; }, async envia() { return false; } };
const U = "/api/presencia/voz/consentimiento";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[GUIA, "guia"], [ANA, "hogar"], [BETA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  ev = Number((await bd.dueno.query<{ id: number }>(
    "INSERT INTO visitas (titulo, tipo, empieza_en, termina_en, estado, plazas, guia_id) VALUES ('Guiada F3j', 'guiada', now() + interval '5 minutes', now() + interval '65 minutes', 'abierta', 10, $1) RETURNING id",
    [ids[GUIA]])).rows[0]!.id);
  await bd.dueno.query("INSERT INTO visitas_asistentes (visita_id, hogar_id, estado) VALUES ($1, $2, 'apuntado'), ($1, $3, 'apuntado')", [ev, ids[ANA], ids[BETA]]);
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
async function entra(correo: string): Promise<string> {
  await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return galleta(r, "__Host-gemelo")!;
}
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const acciones = async (accion: string, hogar?: number) =>
  (await bd.dueno.query<{ detalle: Record<string, unknown> }>("SELECT detalle FROM auditoria WHERE accion = $1" + (hogar ? " AND hogar_id = " + Number(hogar) : "") + " ORDER BY id", [accion])).rows;
const G = () => "/api/presencia/guiadas/" + ev;
const SALA = () => "guiada-" + ev;

test("el consentimiento: sin fila no hay; otra versión, 409; la vigente, 200 (idempotente y con una sola fila de auditoría); retirar, 204 (idempotente)", async t => {
  if (salta(t)) return;
  for (const c of [GUIA, ANA, BETA]) ses[c] = await entra(c);
  const g = await pide("GET", U, ses[ANA]!);
  assert.equal(g.statusCode, 200); assert.deepEqual(g.json(), { version: VOZ_AVISO_VERSION, aceptada: false, version_aceptada: null, aceptada_en: null });
  assert.equal(g.headers["cache-control"], "no-store");
  const mala = await pide("PUT", U, ses[ANA]!, { version: VOZ_AVISO_VERSION + 1 });
  assert.equal(mala.statusCode, 409); assert.equal(mala.json().error, "version_distinta"); assert.equal(mala.json().version, VOZ_AVISO_VERSION);
  assert.equal((await bd.dueno.query("SELECT 1 FROM voz_consentimientos WHERE hogar_id = $1", [ids[ANA]])).rowCount, 0, "con la versión equivocada no se guarda nada");
  const ok = await pide("PUT", U, ses[ANA]!, { version: VOZ_AVISO_VERSION });
  assert.equal(ok.statusCode, 200, ok.body); const e = ok.json();
  assert.equal(e.aceptada, true); assert.equal(e.version_aceptada, VOZ_AVISO_VERSION); assert.match(e.aceptada_en, /^\d{4}-\d\d-\d\dT/);
  assert.equal((await pide("PUT", U, ses[ANA]!, { version: VOZ_AVISO_VERSION })).statusCode, 200);
  assert.deepEqual(await acciones("voz.consentimiento_dado", ids[ANA]), [{ detalle: { version: VOZ_AVISO_VERSION } }], "aceptar dos veces la misma versión se apunta una sola vez, y sin más datos");
  assert.equal((await pide("DELETE", U, ses[ANA]!)).statusCode, 204);
  assert.equal((await pide("DELETE", U, ses[ANA]!)).statusCode, 204, "idempotente");
  assert.equal((await pide("GET", U, ses[ANA]!)).json().aceptada, false);
  assert.deepEqual(await acciones("voz.consentimiento_retirado", ids[ANA]), [{ detalle: { version: VOZ_AVISO_VERSION } }], "y se apunta una vez");
  // sin sesión y sin Origin
  assert.equal((await app.inject({ method: "GET", url: U, headers: deLaWeb() })).statusCode, 401);
  assert.equal((await app.inject({ method: "PUT", url: U, headers: { "x-forwarded-proto": "https" }, payload: { version: 1 } })).statusCode, 403);
});

test("sin consentimiento vigente la api ni acepta la mano ni da la palabra, y LiveKit no se toca; con él todo sigue igual; una versión vieja ya no vale", async t => {
  if (salta(t)) return;
  for (const c of [GUIA, ANA, BETA]) {
    const r = await pide("POST", "/api/presencia/guiadas/" + ev + "/token", ses[c]!, { dispositivo: "escritorio" });
    assert.equal(r.statusCode, 200, c + " " + r.body); ident[c] = r.json().identidad;
    sala.entra(SALA(), ident[c]!, r.json().papel);
  }
  const antes = sala.llamadas.length;
  const mano = await pide("POST", G() + "/mano", ses[ANA]!, {});
  assert.equal(mano.statusCode, 409); assert.equal(mano.json().error, "sin_consentimiento"); assert.match(mano.json().mensaje, /aceptar el aviso de voz/);
  const dar = await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[ANA] });
  assert.equal(dar.statusCode, 409); assert.equal(dar.json().error, "sin_consentimiento");
  assert.deepEqual(sala.llamadas.slice(antes), [], "ni un RoomService: el permiso de micrófono no se abrió");
  assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, false);
  // acepta: la mano entra; la palabra se da
  assert.equal((await pide("PUT", U, ses[ANA]!, { version: VOZ_AVISO_VERSION })).statusCode, 200);
  assert.deepEqual((await pide("POST", G() + "/mano", ses[ANA]!, {})).json(), { puesto: 1 });
  const dada = await pide("POST", G() + "/palabra", ses[GUIA]!, { identidad: ident[ANA] });
  assert.equal(dada.statusCode, 200, dada.body); assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, true);
  // Beta, sin aceptar, sigue sin poder (no depende de lo de Ana); y con una versión vieja guardada tampoco
  assert.equal((await pide("POST", G() + "/mano", ses[BETA]!, {})).json().error, "sin_consentimiento");
  await bd.dueno.query("INSERT INTO voz_consentimientos (hogar_id, version) VALUES ($1, $2)", [ids[BETA], VOZ_AVISO_VERSION + 1]);
  const vieja = await pide("GET", U, ses[BETA]!); assert.equal(vieja.json().aceptada, false); assert.equal(vieja.json().version_aceptada, VOZ_AVISO_VERSION + 1);
  assert.equal((await pide("POST", G() + "/mano", ses[BETA]!, {})).json().error, "sin_consentimiento");
  await bd.dueno.query("DELETE FROM voz_consentimientos WHERE hogar_id = $1", [ids[BETA]]);
});

test("retirar con la palabra dada: la palabra se quita en la sala (LiveKit despublica) y la mano se baja; queda en la auditoría con motivo «consentimiento»", async t => {
  if (salta(t)) return;
  assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, true, "Ana sigue con la palabra del test anterior");
  assert.equal((await pide("PUT", U, ses[BETA]!, { version: VOZ_AVISO_VERSION })).statusCode, 200);
  assert.deepEqual((await pide("POST", G() + "/mano", ses[BETA]!, {})).json(), { puesto: 1 });
  assert.ok(sala.p(SALA(), ident[BETA]!)!.atributos[ATRIBUTOS.mano]);
  assert.equal((await pide("DELETE", U, ses[ANA]!)).statusCode, 204);
  assert.equal(sala.p(SALA(), ident[ANA]!)!.micro, false, "sin permiso de micrófono");
  assert.equal(sala.p(SALA(), ident[ANA]!)!.atributos[ATRIBUTOS.palabra], undefined);
  const q = await acciones("guiada.palabra_quitada");
  assert.deepEqual(q.at(-1)!.detalle, { evento: ev, hogar: ids[ANA], motivo: "consentimiento" });
  // la mano de Beta sigue (no era de Ana) y Beta retira la suya: se baja
  assert.ok(sala.p(SALA(), ident[BETA]!)!.atributos[ATRIBUTOS.mano]);
  assert.equal((await pide("DELETE", U, ses[BETA]!)).statusCode, 204);
  assert.equal(sala.p(SALA(), ident[BETA]!)!.atributos[ATRIBUTOS.mano], undefined, "su mano, bajada en LiveKit");
  const v = await pide("GET", G() + "/palabra", ses[GUIA]!); assert.deepEqual(v.json().manos, []); assert.equal(v.json().turno, null);
  // y para volver a pedirla hay que aceptar otra vez
  assert.equal((await pide("POST", G() + "/mano", ses[ANA]!, {})).json().error, "sin_consentimiento");
});

test("«Mis datos» lleva el consentimiento de voz y borrar el hogar lo borra", async t => {
  if (salta(t)) return;
  assert.equal((await pide("PUT", U, ses[ANA]!, { version: VOZ_AVISO_VERSION })).statusCode, 200);
  const d = await pide("GET", "/api/yo/datos", ses[ANA]!); assert.equal(d.statusCode, 200);
  assert.equal(d.json().voz_consentimiento.version, VOZ_AVISO_VERSION); assert.deepEqual(Object.keys(d.json().voz_consentimiento).sort(), ["aceptado_en", "version"]);
  await bd.dueno.query("DELETE FROM hogares WHERE id = $1", [ids[ANA]]);
  assert.equal((await bd.dueno.query("SELECT 1 FROM voz_consentimientos WHERE hogar_id = $1", [ids[ANA]])).rowCount, 0, "en cascada");
});

test("el plazo (decisión 164): la función de la base borra solo la auditoría de voz fuera de plazo; el resto de la auditoría se queda; gemelo_api no borra a mano pero sí llama a la función", async t => {
  if (salta(t)) return;
  const hogar = ids[BETA]!;
  const pon = (accion: string, cuando: string, h: number | null = hogar) =>
    bd.dueno.query("INSERT INTO auditoria (hogar_id, accion, detalle, cuando) VALUES ($1, $2, '{}'::jsonb, $3)", [h, accion, cuando]);
  // campaña 2024/25 (se borra el 5 de octubre de 2026 y no antes) y campaña 2025/26 (se queda hasta el 1 de octubre de 2027)
  for (const [a, c] of [["guiada.palabra_dada", "2025-03-01T10:00:00Z"], ["guiada.mano_levantada", "2025-09-30T23:00:00Z"], ["voz.consentimiento_retirado", "2025-05-05T10:00:00Z"],
    ["guiada.palabra_dada", "2025-10-02T10:00:00Z"], ["guiada.cerrada", "2026-06-01T10:00:00Z"], ["voz.consentimiento_retirado", "2026-02-02T10:00:00Z"],
    ["hogar.borrado", "2025-03-01T10:00:00Z"], ["enlace.pedido", "2025-03-01T10:00:00Z"], ["admin.evento_guia", "2025-05-05T10:00:00Z"]] as const)
    await pon(a, c);
  await pon("voz.consentimiento_dado", "2025-03-03T10:00:00Z");          // Beta tiene (tras el test anterior) consentimiento retirado: sin fila vigente → se borra
  await pon("voz.consentimiento_dado", "2025-03-03T10:00:00Z", null);   // hogar ya borrado (anónima): se borra
  await bd.dueno.query("INSERT INTO voz_consentimientos (hogar_id, version) VALUES ($1, $2)", [ids[GUIA], VOZ_AVISO_VERSION]);
  await pon("voz.consentimiento_dado", "2025-03-03T10:00:00Z", ids[GUIA]!);   // consentimiento VIGENTE de ese hogar: es su prueba, no se borra aunque sea vieja
  const cuenta = async (accion: string, desde: string, hasta: string) => Number((await bd.dueno.query<{ n: string }>("SELECT count(*) AS n FROM auditoria WHERE accion = $1 AND cuando >= $2 AND cuando < $3", [accion, desde, hasta])).rows[0]!.n);

  // 30 de septiembre de 2026: la campaña 2024/25 sigue (corte = 1 oct 2024... se guarda hasta el 1 oct 2026)
  assert.equal(corteAuditoriaVoz(new Date("2026-09-30T12:00:00Z")).toISOString(), "2024-10-01T00:00:00.000Z");
  assert.equal(await purgaAuditoriaVoz(bd.app, new Date("2026-09-30T12:00:00Z")), 0, "aún no: nada de 2025 cae");
  // 5 de octubre de 2026: la campaña 2024/25 (hasta el 30 sept de 2025) ya cumplió su año
  const r = await purgaAuditoriaVoz(bd.app, new Date("2026-10-05T12:00:00Z"));
  assert.equal(r, 5, "palabra_dada, mano_levantada, consentimiento_retirado de 2025 y los dos «dado» sin consentimiento vigente");
  assert.equal(await cuenta("guiada.palabra_dada", "2025-03-01", "2025-03-02"), 0);
  assert.equal(await cuenta("guiada.mano_levantada", "2025-09-30", "2025-10-01"), 0);
  assert.equal(await cuenta("voz.consentimiento_retirado", "2025-05-05", "2025-05-06"), 0);
  assert.equal(await cuenta("voz.consentimiento_dado", "2025-03-03", "2025-03-04"), 1, "solo queda el del hogar con consentimiento vigente");
  // lo de la campaña 2025/26 y lo que no es de la voz, intacto
  assert.equal(await cuenta("guiada.palabra_dada", "2025-10-02", "2025-10-03"), 1); assert.equal(await cuenta("guiada.cerrada", "2026-06-01", "2026-06-02"), 1);
  assert.equal(await cuenta("voz.consentimiento_retirado", "2026-02-02", "2026-02-03"), 1);
  for (const [a, d] of [["hogar.borrado", "2025-03-01"], ["enlace.pedido", "2025-03-01"], ["admin.evento_guia", "2025-05-05"]] as const)
    assert.equal(await cuenta(a, d, d.slice(0, 8) + String(Number(d.slice(8)) + 1).padStart(2, "0")), 1, a + " no es de la voz: se queda");
  // 5 de octubre de 2027: ahora cae la campaña 2025/26
  assert.equal(await purgaAuditoriaVoz(bd.app, new Date("2027-10-05T12:00:00Z")), 3);
  assert.equal(await cuenta("guiada.cerrada", "2026-06-01", "2026-06-02"), 0);
  // gemelo_api sigue sin poder borrar de la auditoría a mano
  await assert.rejects(bd.app.query("DELETE FROM auditoria WHERE accion = 'enlace.pedido'"), /permission denied|permiso denegado/i);
  // ni la función acepta a quien no es gemelo_api (PUBLIC sin EXECUTE) — el rol dueño, sí
  assert.equal(Number((await bd.dueno.query<{ n: number }>("SELECT purga_auditoria_voz('2000-01-01') AS n")).rows[0]!.n), 0);
});
