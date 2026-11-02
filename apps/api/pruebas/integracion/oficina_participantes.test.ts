// Integración de OF14 (escalón 2): GET /api/admin/presencia/participantes contra PostGIS en un contenedor (sesiones y hogares de verdad) y una sala de LiveKit de
// mentira. Comprueba lo que la unidad no puede: que la sesión de oficina de verdad (enlace + aparato aprobado) lee y una de familia no, que la api deduce el
// hogar de cada identidad opaca con los hogares REALES de la base (prefijoHogar) y que la respuesta no lleva correos. ESCRITA, NO EJECUTADA (Docker: por el banco);
// sin Docker se SALTA con aviso. Tampoco prueba LiveKit real (qué da listParticipants con la 1.13.11). Datos sintéticos (correos @example.com).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { identidadOpaca, type ModeradorSala, type ParticipanteSala } from "../../src/presencia/livekit.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: OF14 (participantes) con PostGIS NO se ha comprobado";
const LIVEKIT = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "/rtc", GEMELO_LIVEKIT_CLAVE: "devof14bb", GEMELO_LIVEKIT_SECRETO: "m".repeat(40) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>, ipN = 0;
const OFI = "ofi-of14@example.com", ANA = "ana-of14@example.com";
const ids: Record<string, number> = {};
let ofi = "", ana = "";
let lista: ParticipanteSala[] = [];
const moderador: ModeradorSala = { expulsaHogar: async () => 0, envia: async () => true, participantes: async sala => lista.filter(p => p.sala === sala) };

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"]] as const)
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
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
const pide = (sesion: string) => app.inject({ method: "GET", url: "/api/admin/presencia/participantes", headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip() }) });

test("solo la oficina lee; una familia recibe 403 y no se consulta la sala", async t => {
  if (salta(t)) return;
  const e = await entra(OFI);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  ofi = e.sesion; ana = (await entra(ANA)).sesion;
  assert.equal((await pide(ana)).statusCode, 403);
});

test("la identidad opaca de cada conexión se resuelve con los hogares reales de la base; sin correos en la respuesta", async t => {
  if (salta(t)) return;
  const lk = { secreto: LIVEKIT.GEMELO_LIVEKIT_SECRETO };
  const meta = (rol: string, alias: string) => JSON.stringify({ alias, avatar: { camisa: 0, sombrero: "paja", piel: 1 }, rol, dispositivo: "escritorio" });
  lista = [
    { sala: "hituelo-libre", identidad: identidadOpaca(lk, ids[ANA]!, "s1"), metadata: meta("hogar", "Pardal"), atributos: {}, conectadoEn: Date.now() - 120_000, publicaPista: false },
    { sala: "hituelo-libre", identidad: identidadOpaca(lk, ids[OFI]!, "s2"), metadata: meta("oficina", "Oficina"), atributos: {}, conectadoEn: Date.now() - 600_000, publicaPista: false },
  ];
  const r = await pide(ofi);
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.deepEqual(j.participantes.map((p: { alias: string; hogar_id: number; rol: string }) => [p.alias, p.hogar_id, p.rol]), [["Oficina", ids[OFI], "oficina"], ["Pardal", ids[ANA], "hogar"]]);
  assert.doesNotMatch(r.body, /@example\.com/, "ningún correo");
});
