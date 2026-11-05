// Integración de F3k-1 (la voz por cercanía en corros; ADR-0032; migración 0025; contratos: livekit-roles.json v8, presencia.md, voz-consentimiento.md) contra
// PostGIS en un contenedor (la misma imagen que producción) y una sala de LiveKit de mentira con un reloj que se adelanta a mano. Escrita, SIN EJECUTAR en la
// sesión que la escribió (hay una prueba pesada corriendo y no se abre Docker: pasa por el banco). Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA.
//   1. Todo apagado por omisión: el interruptor nace apagado; sin encenderlo, nadie invita (cercania_apagada) y el estado dice disponible: false.
//   2. El aviso propio (ámbito cercania): sin `adulto: true`, 409 falta_declaracion; con él, 200; el de la guiada no cuenta; activar el ajuste sin aviso, 409.
//   3. El recorrido: la oficina enciende; Ana invita a Beta (por su identidad de la sala libre); sin aceptar no hay token; Beta acepta; las dos reciben el token
//      de `corro-<id>` (solo micrófono, sin datos); Caro, de fuera, no; Caro ve el corro como prefijos; Beta sale y el corro se deshace (DeleteRoom).
//   4. Bloqueos: Caro bloquea a Ana: Ana no la puede invitar (no_disponible, sin decir por qué) y la lista de bloqueos de Caro la nombra.
//   5. Avisos: tres hogares avisan de Dani en 7 días → suspensión automática; la oficina los ve en su bandeja; quien avisa sale de su corro; levantar.
//   6. Retirar el consentimiento de cercanía apaga el ajuste y saca del corro; apagar el interruptor deshace todos los corros.
//   7. «Mis datos» lleva lo de la voz por cercanía; la purga borra corro.* fuera de plazo y respeta el «dado» de cada ámbito.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { TokenVerifier } from "livekit-server-sdk";
import { construyeApp } from "../../src/app.ts";
import { purgaAuditoriaVoz, VOZ_AVISO_VERSION, VOZ_CERCANIA_AVISO_VERSION } from "../../src/presencia/consentimiento_voz.ts";
import { purgaVozCercania } from "../../src/presencia/cercania.ts";
import type { ModeradorSala, ParticipanteSala } from "../../src/presencia/livekit.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { RelojFalso, SalaFalsa } from "../apoyo/voz.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: F3k-1 (corros de la voz por cercanía) con PostGIS NO se ha comprobado";
const LIVEKIT = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "/rtc", GEMELO_LIVEKIT_CLAVE: "devf3k", GEMELO_LIVEKIT_SECRETO: "q".repeat(40) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-f3k@example.com", ANA = "ana-f3k@example.com", BETA = "beta-f3k@example.com", CARO = "caro-f3k@example.com", DANI = "dani-f3k@example.com";
const ids: Record<string, number> = {}, ses: Record<string, string> = {}, libre: Record<string, string> = {};
const sala = new SalaFalsa(), reloj = new RelojFalso();
const enLibre: ParticipanteSala[] = [], enviados: { tema: string; destinos: string[] }[] = [];
const moderador: ModeradorSala = {
  async expulsaHogar() { return 0; },
  async envia(_s, tema, _d, destinos) { enviados.push({ tema, destinos: destinos ?? [] }); return true; },
  async participantes() { return enLibre; },
};
const U = "/api/presencia/voz/consentimiento?ambito=cercania", C = "/api/presencia/corros";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"], [BETA, "hogar"], [CARO, "hogar"], [DANI, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol, alias) VALUES ($1, $2, $3) RETURNING id", [c, rol, c.split("-")[0]])).rows[0]!.id);
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
const acciones = async (accion: string) => (await bd.dueno.query<{ hogar_id: string | null; detalle: Record<string, unknown> }>("SELECT hogar_id, detalle FROM auditoria WHERE accion = $1 ORDER BY id", [accion])).rows;
/** acepta el aviso de cercanía y activa el ajuste */
async function activa(c: string) {
  assert.equal((await pide("PUT", U, ses[c]!, { version: VOZ_CERCANIA_AVISO_VERSION, adulto: true })).statusCode, 200);
  assert.equal((await pide("PUT", C + "/ajuste", ses[c]!, { activa: true })).statusCode, 200);
}
const invita = (de: string, a: string) => pide("POST", C + "/invitaciones", ses[de]!, { identidad: libre[a] });

test("1. apagado por omisión: el interruptor nace apagado; sin encenderlo nadie invita y el estado dice disponible: false", async t => {
  if (salta(t)) return;
  for (const c of [ANA, BETA, CARO, DANI]) {
    ses[c] = (await entra(c)).sesion;
    const r = await pide("POST", "/api/presencia/token", ses[c]!, { dispositivo: "escritorio" });
    assert.equal(r.statusCode, 200, r.body); libre[c] = r.json().identidad;
    enLibre.push({ sala: "hituelo-libre", identidad: libre[c]!, metadata: "{}", atributos: {}, conectadoEn: null, publicaPista: false });
  }
  assert.deepEqual((await bd.dueno.query("SELECT activa FROM voz_cercania_interruptor")).rows, [{ activa: false }]);
  const e = await pide("GET", C + "/estado", ses[ANA]!);
  assert.equal(e.statusCode, 200, e.body); assert.equal(e.json().disponible, false); assert.equal(e.json().puedo, false); assert.equal(e.json().ajuste.activa, false);
  assert.equal(e.json().consentimiento.version, VOZ_CERCANIA_AVISO_VERSION);
  assert.equal((await invita(ANA, BETA)).json().error, "cercania_apagada");
  assert.deepEqual((await pide("GET", C, ses[CARO]!)).json(), { corros: [] });
});

test("2. el aviso propio: sin declaración de adulto, 409; con ella, 200 (auditoría con ámbito); el de la guiada no cuenta; activar sin aviso, 409", async t => {
  if (salta(t)) return;
  const sinAdulto = await pide("PUT", U, ses[ANA]!, { version: VOZ_CERCANIA_AVISO_VERSION });
  assert.equal(sinAdulto.statusCode, 409); assert.equal(sinAdulto.json().error, "falta_declaracion");
  // el de la guiada no abre la cercanía
  assert.equal((await pide("PUT", "/api/presencia/voz/consentimiento", ses[ANA]!, { version: VOZ_AVISO_VERSION })).statusCode, 200);
  const sinAviso = await pide("PUT", C + "/ajuste", ses[ANA]!, { activa: true });
  assert.equal(sinAviso.statusCode, 409); assert.equal(sinAviso.json().error, "sin_consentimiento");
  for (const c of [ANA, BETA, CARO, DANI]) await activa(c);
  const d = await acciones("voz.consentimiento_dado");
  assert.ok(d.some(f => f.detalle.ambito === "cercania" && Number(f.hogar_id) === ids[ANA]));
  assert.ok(d.some(f => f.detalle.ambito === undefined && Number(f.hogar_id) === ids[ANA]), "la de la guiada, como antes (sin ámbito)");
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM voz_consentimientos WHERE hogar_id = $1", [ids[ANA]])).rows[0].n, 2, "una fila por ámbito");
});

test("3. el recorrido: la oficina enciende; invitar, aceptar, token de corro-<id> solo para los dos; quien está fuera ve prefijos; salir deshace (DeleteRoom)", async t => {
  if (salta(t)) return;
  const o = await entra(OFI);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(o.aparato!)]);
  ses[OFI] = o.sesion;
  assert.equal((await pide("PUT", "/api/admin/voz/cercania", ses[ANA]!, { activa: true })).statusCode, 403, "un hogar no enciende");
  const on = await pide("PUT", "/api/admin/voz/cercania", ses[OFI]!, { activa: true });
  assert.equal(on.statusCode, 200, on.body); assert.equal(on.json().interruptor.activa, true);
  const inv = await invita(ANA, BETA);
  assert.equal(inv.statusCode, 201, inv.body);
  assert.ok(enviados.some(x => x.tema === "corro" && x.destinos.includes(libre[BETA]!)), "a Beta le llega «mira tu estado» en la sala libre");
  assert.equal((await pide("POST", C + "/token", ses[BETA]!, { dispositivo: "quest" })).json().error, "sin_corro", "sin aceptar no hay token");
  const est = (await pide("GET", C + "/estado", ses[BETA]!)).json();
  assert.equal(est.invitaciones.recibidas[0].id, inv.json().id); assert.equal(est.invitaciones.recibidas[0].de.alias, "ana");
  const ac = await pide("POST", C + "/invitaciones/" + inv.json().id + "/aceptar", ses[BETA]!, {});
  assert.equal(ac.statusCode, 200, ac.body);
  const v = new TokenVerifier("devf3k", "q".repeat(40));
  for (const c of [ANA, BETA]) {
    const tk = await pide("POST", C + "/token", ses[c]!, { dispositivo: "escritorio" });
    assert.equal(tk.statusCode, 200, tk.body); assert.equal(tk.json().sala, ac.json().sala); assert.equal(tk.json().papel, "miembro");
    const g = await v.verify(tk.json().token);
    assert.equal(g.video!.canPublishData, false); assert.deepEqual(g.video!.canPublishSources, ["microphone"]); assert.equal(g.video!.roomAdmin, false);
    sala.entra(ac.json().sala, tk.json().identidad);
  }
  assert.equal((await pide("POST", C + "/token", ses[CARO]!, { dispositivo: "escritorio" })).json().error, "sin_corro", "Caro no está: no hay token");
  const pub = (await pide("GET", C, ses[CARO]!)).json().corros;
  assert.equal(pub.length, 1); assert.deepEqual(pub[0].prefijos.sort(), [libre[ANA]!.slice(0, 24), libre[BETA]!.slice(0, 24)].sort());
  assert.ok(!JSON.stringify(pub).includes("ana"), "ni alias");
  assert.equal((await pide("POST", C + "/salir", ses[BETA]!, { motivo: "lejos" })).statusCode, 204);
  assert.ok(sala.borradas.includes(ac.json().sala), "con uno solo, DeleteRoom");
  assert.equal((await pide("GET", C + "/estado", ses[ANA]!)).json().corro, null);
  const sale = await acciones("corro.sale"); assert.equal(sale.at(-1)!.detalle.motivo, "lejos");
  assert.ok((await acciones("corro.deshecho")).length >= 1); assert.ok((await acciones("corro.interruptor")).length >= 1);
});

test("4. bloqueos: Caro bloquea a Ana; Ana no puede invitarla (no_disponible, sin decir por qué); Caro la ve en su lista y la puede quitar", async t => {
  if (salta(t)) return;
  const b = await pide("POST", C + "/bloqueos", ses[CARO]!, { identidad: libre[ANA] });
  assert.equal(b.statusCode, 201, b.body);
  const r = await invita(ANA, CARO);
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "no_disponible"); assert.doesNotMatch(r.json().mensaje, /bloque/i);
  assert.equal((await invita(CARO, ANA)).json().error, "no_disponible", "en los dos sentidos");
  const l = (await pide("GET", C + "/bloqueos", ses[CARO]!)).json().bloqueos;
  assert.deepEqual(l.map((x: { alias: string }) => x.alias), ["ana"]);
  assert.equal((await pide("DELETE", C + "/bloqueos/" + l[0].prefijo, ses[CARO]!)).statusCode, 204);
  assert.equal((await invita(ANA, CARO)).statusCode, 201);
});

test("5. avisos: tres hogares avisan de Dani en 7 días → suspensión automática; la oficina lo ve; quien avisa sale de su corro; la oficina levanta", async t => {
  if (salta(t)) return;
  // Ana y Dani en un corro
  const i = await invita(DANI, ANA); assert.equal(i.statusCode, 201, i.body);
  assert.equal((await pide("POST", C + "/invitaciones/" + i.json().id + "/aceptar", ses[ANA]!, {})).statusCode, 200);
  const a1 = await pide("POST", C + "/avisos", ses[ANA]!, { identidad: libre[DANI], motivo: "insultos", texto: "  Me ha insultado.  " });
  assert.equal(a1.statusCode, 201, a1.body);
  assert.equal((await pide("GET", C + "/estado", ses[ANA]!)).json().corro, null, "quien avisa sale del corro");
  const f = (await bd.dueno.query("SELECT motivo, texto, corro FROM voz_avisos WHERE id = $1", [a1.json().id])).rows[0];
  assert.equal(f.motivo, "insultos"); assert.equal(f.texto, "Me ha insultado."); assert.match(f.corro, /^[A-Za-z0-9_-]{12}$/);
  assert.equal((await pide("GET", C + "/estado", ses[DANI]!)).json().suspension, null, "uno no basta");
  for (const c of [BETA, CARO]) assert.equal((await pide("POST", C + "/avisos", ses[c]!, { identidad: libre[DANI], motivo: "acoso" })).statusCode, 201);
  const sus = (await pide("GET", C + "/estado", ses[DANI]!)).json();
  assert.equal(sus.suspension.automatica, true); assert.equal(sus.suspension.hasta, null); assert.equal(sus.puedo, false);
  assert.equal((await invita(DANI, BETA)).json().error, "no_puedes");
  const bandeja = (await pide("GET", "/api/admin/voz/avisos", ses[OFI]!)).json().avisos;
  assert.equal(bandeja.length, 3); assert.equal(bandeja[0].avisado.hogares_7d, 3); assert.equal(bandeja[0].avisado.suspendido, true);
  assert.equal((await pide("GET", "/api/admin/bandeja/resumen", ses[OFI]!)).json().nuevas.aviso_voz, 3);
  assert.equal((await pide("POST", "/api/admin/voz/avisos/" + a1.json().id + "/estado", ses[OFI]!, { estado: "resuelto" })).statusCode, 204);
  assert.equal((await pide("DELETE", "/api/admin/voz/suspensiones/" + ids[DANI], ses[OFI]!)).statusCode, 204);
  assert.equal((await pide("GET", C + "/estado", ses[DANI]!)).json().suspension, null);
  const s7 = await pide("POST", "/api/admin/voz/suspensiones", ses[OFI]!, { hogar_id: ids[DANI], dias: 7 });
  assert.equal(s7.statusCode, 200, s7.body); assert.equal(s7.json().suspension.automatica, false); assert.ok(s7.json().suspension.hasta);
  assert.equal((await pide("DELETE", "/api/admin/voz/suspensiones/" + ids[DANI], ses[OFI]!)).statusCode, 204);
  assert.ok((await acciones("corro.suspendido")).some(x => x.detalle.automatica === true));
});

test("6. retirar el consentimiento apaga el ajuste y saca del corro; apagar el interruptor deshace todos los corros", async t => {
  if (salta(t)) return;
  const i = await invita(ANA, BETA); assert.equal(i.statusCode, 201, i.body);
  assert.equal((await pide("POST", C + "/invitaciones/" + i.json().id + "/aceptar", ses[BETA]!, {})).statusCode, 200);
  const j = await invita(ANA, CARO); assert.equal((await pide("POST", C + "/invitaciones/" + j.json().id + "/aceptar", ses[CARO]!, {})).statusCode, 200);
  assert.equal((await pide("DELETE", U, ses[CARO]!)).statusCode, 204);
  const e = (await pide("GET", C + "/estado", ses[CARO]!)).json();
  assert.equal(e.corro, null); assert.equal(e.ajuste.activa, false); assert.equal(e.consentimiento.aceptada, false);
  assert.equal((await pide("GET", "/api/presencia/voz/consentimiento", ses[CARO]!)).statusCode, 200, "el de la guiada no se toca");
  const off = await pide("PUT", "/api/admin/voz/cercania", ses[OFI]!, { activa: false });
  assert.equal(off.statusCode, 200); assert.equal(off.json().deshechos, 1);
  assert.equal((await pide("GET", C + "/estado", ses[ANA]!)).json().corro, null);
  assert.equal((await pide("POST", C + "/token", ses[ANA]!, { dispositivo: "escritorio" })).json().error, "sin_corro");
});

test("7. «Mis datos» lleva la voz por cercanía; la purga borra corro.* fuera de plazo, los avisos atendidos viejos y respeta el «dado» vigente de cada ámbito", async t => {
  if (salta(t)) return;
  const d = (await pide("GET", "/api/yo/datos", ses[ANA]!)).json();
  assert.deepEqual(Object.keys(d.voz_cercania).sort(), ["ajuste", "avisos_mandados", "avisos_recibidos", "bloqueos", "consentimiento", "suspension"]);
  assert.ok(d.voz_cercania.avisos_mandados.length >= 1);
  const r = (await pide("GET", "/api/yo/datos", ses[DANI]!)).json().voz_cercania.avisos_recibidos;
  assert.ok(r.length >= 3); assert.deepEqual(Object.keys(r[0]).sort(), ["creado_en", "estado", "motivo"], "ni quién avisó ni su texto");
  // todo «viejo»: dos años atrás
  await bd.dueno.query("UPDATE auditoria SET cuando = cuando - interval '3 years' WHERE accion LIKE 'corro.%' OR accion LIKE 'voz.%'");
  await bd.dueno.query("UPDATE voz_avisos SET creado_en = creado_en - interval '3 years'");
  const n = await purgaAuditoriaVoz(bd.app);
  assert.ok(n > 0);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM auditoria WHERE accion LIKE 'corro.%'")).rows[0].n, 0);
  // Ana tiene consentimiento vigente de los dos ámbitos: sus dos «dado» se quedan
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'voz.consentimiento_dado' AND hogar_id = $1", [ids[ANA]])).rows[0].n, 2);
  // Caro retiró el de cercanía: su «dado» de cercanía cae
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM auditoria WHERE accion = 'voz.consentimiento_dado' AND hogar_id = $1 AND detalle->>'ambito' = 'cercania'", [ids[CARO]])).rows[0].n, 0);
  const p = await purgaVozCercania(bd.app);
  assert.equal(p.avisos, 1, "solo el resuelto; los que la oficina no ha atendido se quedan");
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM voz_avisos")).rows[0].n, 2);
  // borrar el hogar se lleva en cascada su consentimiento, ajuste, bloqueos y suspensión
  await bd.dueno.query("DELETE FROM hogares WHERE id = $1", [ids[DANI]]);
  for (const tabla of ["voz_consentimientos", "voz_cercania_ajustes", "voz_cercania_suspensiones"])
    assert.equal((await bd.dueno.query(`SELECT count(*)::int AS n FROM ${tabla} WHERE hogar_id = $1`, [ids[DANI]])).rows[0].n, 0, tabla);
  void reloj;
});
