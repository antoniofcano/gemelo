// Integración de OF16 (ADR-0028 § Comprobación, decisiones 181-182) contra PostGIS en un contenedor: una cuenta de oficina aprueba el
// código corto de unas gafas; la sesión que nace es la de un VISITANTE (GET /api/sesion: rol hogar, titular false), dura 12 h desde que
// nace y 2 h sin actividad, no pasa /api/admin/* ni /oficina/ (401/403), su token de LiveKit no lleva el rol oficina, sale en la ficha de la
// oficina como «Gafas (código corto)» y revocar las sesiones del hogar la cierra. Las gafas de una familia no cambian. Sin Docker se SALTA
// con aviso. Se ejecuta por el turno del banco (no en el equipo de quien la escribió).
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { TokenVerifier } from "livekit-server-sdk";
import { construyeApp } from "../../src/app.ts";
import { normalizaCodigo } from "../../src/auth/vinculo.ts";
import { ALIAS_OFICINA } from "../../src/presencia/livekit.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: las gafas vinculadas desde la oficina (OF16) con PostGIS NO se han comprobado";
const LK_ENV = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devprueba16", GEMELO_LIVEKIT_SECRETO: "v".repeat(32) };
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ANTONIO = "antonio-of16@example.com", OFI = "ofi-of16@example.com", ANA = "ana-of16@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const HORA = 3_600_000;

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ANTONIO, "admin"], [OFI, "oficina"], [ANA, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol, alias) VALUES ($1, $2, $3) RETURNING id", [c, rol, "Alias" + rol])).rows[0]!.id);
  }
  // la cuenta de la oficina aprueba seis códigos en este fichero: el límite por hogar de producción (5 en 15 min) se sube aquí, como en
  // api.test.ts; el propio límite lo vigila api.test.ts con su app aparte.
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_VINCULO_INTENTOS_POR_HOGAR: "100", ...LK_ENV }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => { if (!SALTO) { await app.close(); await bd.cierra(); } });

// ---------------------------------------------------------------- ayudas
const ip = () => "198.51.100." + (++ipN % 250);
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };
const galleta = (r: LightMyRequestResponse, nombre: string) => {
  const m = ([] as string[]).concat(r.headers["set-cookie"] ?? []).map(c => new RegExp("^" + nombre + "=([^;]*)").exec(c)).find(Boolean);
  return m ? m[1]! : null;
};
const conCookie = (sesion: string, aparato?: string | null) => ["__Host-gemelo=" + sesion, aparato ? "__Host-gemelo-aparato=" + aparato : ""].filter(Boolean).join("; ");
const pide = (method: "GET" | "POST" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: conCookie(sesion), "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const autoriza = (sesion: string, para = "") =>
  app.inject({ method: "GET", url: "/api/interno/autoriza" + (para ? "?para=" + para : ""), headers: { cookie: conCookie(sesion) } });
const idSesion = (sesion: string) => hashToken(sesion.split(".")[0]!);

/** Pide un enlace para `correo` y lo gasta con el formulario. Devuelve la sesión y la cookie de aparato (si es de oficina). */
async function entra(correo: string, aparato: string | null = null): Promise<{ sesion: string; aparato: string | null }> {
  assert.equal((await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } })).statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar",
    headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME, ...(aparato ? { cookie: "__Host-gemelo-aparato=" + aparato } : {}) }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") ?? aparato };
}
/** Una cuenta de oficina con su aparato aprobado desde la consola (como el RUNBOOK). */
async function oficinaAprobada(correo: string) {
  const e = await entra(correo);
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e;
}
/** Unas gafas piden código, `sesion` lo aprueba y las gafas sondean: devuelve la sesión de las gafas y la respuesta del sondeo. */
async function vinculaGafas(sesion: string) {
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json() as { codigo: string; sondeo: string };
  const d = await pide("POST", "/api/yo/dispositivos/vincular", sesion, { codigo: p.codigo, aprobar: true });
  assert.equal(d.statusCode, 204, d.body);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  assert.equal(s.json().estado, "aprobado");
  const gafas = galleta(s, "__Host-gemelo");
  assert.ok(gafas, "las gafas reciben su sesión");
  return { gafas, codigo: p.codigo, sondeo: s };
}

// ---------------------------------------------------------------- las gafas de la oficina
test("la oficina aprueba un código: las gafas son un visitante (rol hogar, titular false) y la auditoría lo dice sin el código ni el correo", async t => {
  if (salta(t)) return;
  const ofi = await oficinaAprobada(OFI);
  const { gafas, codigo } = await vinculaGafas(ofi.sesion);
  const yo = await pide("GET", "/api/sesion", gafas);
  assert.equal(yo.statusCode, 200, yo.body);
  assert.equal(yo.json().rol, "hogar");
  assert.equal(yo.json().titular, false);
  const f = (await bd.dueno.query("SELECT origen, aparato_id, aparato_nombre, confirmada_en, llave_id FROM sesiones WHERE hash = $1", [idSesion(gafas)])).rows[0];
  assert.deepEqual(f, { origen: "vinculo", aparato_id: null, aparato_nombre: "Gafas (código corto)", confirmada_en: null, llave_id: null });
  const aud = (await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion = 'vinculo.aprobado' AND hogar_id = $1 ORDER BY id DESC LIMIT 1", [ids[OFI]])).rows[0];
  assert.deepEqual(aud.detalle, { como: "visitante" });
  const todo = JSON.stringify((await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion LIKE 'vinculo.%'")).rows);
  assert.ok(!todo.includes(normalizaCodigo(codigo)!) && !todo.includes(OFI), "ni el código ni el correo");
});

test("las gafas de la oficina: nada de /api/admin, /api/oficina ni /oficina/ (403), el mundo sí", async t => {
  if (salta(t)) return;
  for (const correo of [OFI, ANTONIO]) {
    const ofi = await oficinaAprobada(correo);
    const { gafas } = await vinculaGafas(ofi.sesion);
    for (const url of ["/api/admin/hogares", "/api/admin/aparatos", "/api/admin/bandeja", "/api/admin/hogares/" + ids[ANA] + "/sesiones", "/api/oficina/sesion", "/api/oficina/llaves"]) {
      const r = await pide("GET", url, gafas);
      assert.ok(r.statusCode === 403 || r.statusCode === 401, correo + " " + url + " → " + r.statusCode);
    }
    for (const url of ["/api/admin/hogares/" + ids[ANA] + "/revocar", "/api/admin/sincronia", "/api/oficina/confirmar"]) {
      const r = await pide("POST", url, gafas, {});
      assert.ok(r.statusCode === 403 || r.statusCode === 401, correo + " POST " + url + " → " + r.statusCode);
    }
    assert.equal((await autoriza(gafas, "oficina")).statusCode, 403, "/oficina/ cerrada");
    assert.equal((await autoriza(gafas)).statusCode, 204, "el mundo, sí");
    assert.equal((await pide("GET", "/api/sesion", ofi.sesion)).json().rol, correo === ANTONIO ? "admin" : "oficina", "la sesión del PC no cambia");
  }
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM sesiones WHERE hogar_id = $1 AND revocada_en IS NOT NULL AND origen = 'enlace'", [ids[ANA]])).rows[0].n, 0, "las gafas no revocaron nada de nadie");
});

test("el token de LiveKit de las gafas de la oficina: rol hogar y el alias de la cuenta, no «Oficina»", async t => {
  if (salta(t)) return;
  const ofi = await oficinaAprobada(OFI);
  const { gafas } = await vinculaGafas(ofi.sesion);
  const r = await pide("POST", "/api/presencia/token", gafas, { dispositivo: "quest" });
  assert.equal(r.statusCode, 200, r.body);
  const meta = JSON.parse((await new TokenVerifier(LK_ENV.GEMELO_LIVEKIT_CLAVE, LK_ENV.GEMELO_LIVEKIT_SECRETO).verify(r.json().token)).metadata!);
  assert.equal(meta.rol, "hogar");
  assert.notEqual(meta.alias, ALIAS_OFICINA);
});

test("las gafas de la oficina viven 12 h desde que nacen y 2 h sin actividad", async t => {
  if (salta(t)) return;
  const ofi = await oficinaAprobada(OFI);
  const { gafas, sondeo } = await vinculaGafas(ofi.sesion);
  const sc = ([] as string[]).concat(sondeo.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo="))!;
  assert.ok(Math.abs(Date.parse(/Expires=([^;]+)/.exec(sc)![1]!) - Date.now() - 12 * HORA) < 120_000, "la cookie caduca a las 12 h");
  const horas = (await bd.dueno.query("SELECT round(extract(epoch FROM expira_en - creada_en) / 3600)::int AS h FROM sesiones WHERE hash = $1", [idSesion(gafas)])).rows[0].h;
  assert.equal(horas, 12, "expira_en a 12 h, no a 30 días");
  // aunque expira_en se alargara, manda creada_en (12 h)
  await bd.dueno.query("UPDATE sesiones SET expira_en = now() + interval '20 days', creada_en = now() - interval '13 hours' WHERE hash = $1", [idSesion(gafas)]);
  assert.equal((await pide("GET", "/api/sesion", gafas)).statusCode, 401, "a las 13 h ya no vale");
  // inactividad: 2 h (la de la oficina, la más corta)
  const otra = (await vinculaGafas(ofi.sesion)).gafas;
  await bd.dueno.query("UPDATE sesiones SET ultima_actividad_en = now() - interval '90 minutes' WHERE hash = $1", [idSesion(otra)]);
  assert.equal((await pide("GET", "/api/sesion", otra)).statusCode, 200, "a los 90 min sin uso, sigue");
  await bd.dueno.query("UPDATE sesiones SET ultima_actividad_en = now() - interval '3 hours' WHERE hash = $1", [idSesion(otra)]);
  assert.equal((await pide("GET", "/api/sesion", otra)).statusCode, 401, "a las 3 h sin uso, no");
});

test("la ficha de la oficina enseña las gafas como «Gafas (código corto)» y revocar las sesiones del hogar las cierra", async t => {
  if (salta(t)) return;
  const antonio = await oficinaAprobada(ANTONIO);
  const ofi = await oficinaAprobada(OFI);
  const { gafas } = await vinculaGafas(ofi.sesion);
  const lista = await pide("GET", "/api/admin/hogares/" + ids[OFI] + "/sesiones", antonio.sesion);
  assert.equal(lista.statusCode, 200, lista.body);
  const s = (lista.json().sesiones as Array<{ aparato: string; por_codigo_corto: boolean }>).filter(x => x.por_codigo_corto);
  assert.ok(s.length >= 1 && s.every(x => x.aparato === "Gafas (código corto)"));
  assert.equal((await pide("POST", "/api/admin/hogares/" + ids[OFI] + "/revocar", antonio.sesion, {})).statusCode, 204);
  assert.equal((await pide("GET", "/api/sesion", gafas)).statusCode, 401, "las gafas se cierran");
  assert.equal((await pide("GET", "/api/sesion", ofi.sesion)).statusCode, 401, "y el PC de esa cuenta también");
  // salir de todas desde el PC también cierra las gafas
  const ofi2 = await oficinaAprobada(OFI);
  const g2 = (await vinculaGafas(ofi2.sesion)).gafas;
  assert.equal((await pide("POST", "/api/sesion/salir-todas", ofi2.sesion, {})).statusCode, 204);
  assert.equal((await pide("GET", "/api/sesion", g2)).statusCode, 401);
});

// ---------------------------------------------------------------- las de una familia, igual que siempre
test("las gafas de una familia no cambian: rol hogar, 30 días y la inactividad de familia", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const { gafas } = await vinculaGafas(ana.sesion);
  assert.deepEqual([(await pide("GET", "/api/sesion", gafas)).json().rol, (await pide("GET", "/api/sesion", gafas)).json().titular], ["hogar", false]);
  const dias = (await bd.dueno.query("SELECT round(extract(epoch FROM expira_en - creada_en) / 86400)::int AS d FROM sesiones WHERE hash = $1", [idSesion(gafas)])).rows[0].d;
  assert.equal(dias, 30);
  await bd.dueno.query("UPDATE sesiones SET ultima_actividad_en = now() - interval '3 hours', creada_en = now() - interval '13 hours' WHERE hash = $1", [idSesion(gafas)]);
  assert.equal((await pide("GET", "/api/sesion", gafas)).statusCode, 200, "a una familia no le afecta lo de la oficina");
});
