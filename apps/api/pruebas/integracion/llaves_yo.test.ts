// Integración de las llaves de la propia cuenta (OF13b-4, ADR-0029: /api/yo/llaves) contra PostGIS en un contenedor, con un autenticador
// simulado (pruebas/apoyo/autenticador.ts) frente a la verificación real de @simplewebauthn/server y la sesión de verdad (enlace → cookie).
// Comprueba lo que la base de mentira de la unidad no puede: el alta en transacción con la cuenta bloqueada, la UNIQUE de la credencial entre
// cuentas, revocar cierra las sesiones de la llave, la lista sin material criptográfico, /api/yo/datos con las llaves y la CASCADA al borrar la
// cuenta (llaves_acceso, llaves_retos y sesiones.llave_id). Sin Docker se SALTA con aviso.
// ESCRITA SIN EJECUTAR al hacer OF13b-4 (agente solo Node): queda por lanzar por el banco.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { AutenticadorFalso } from "../apoyo/autenticador.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, ORIGEN } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: las llaves de /api/yo con PostGIS NO se han comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
const ids: Record<string, number> = {};
let ipN = 0;
const ANA = "ana-yo-llaves@example.com", LUIS = "luis-yo-llaves@example.com", BORRA = "borra-yo-llaves@example.com", TODOS = "todos-yo-llaves@example.com";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const c of [ANA, LUIS, BORRA, TODOS]) ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, 'hogar') RETURNING id", [c])).rows[0]!.id);
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
/** Entra con el enlace del correo (una sesión titular de verdad). */
async function entra(correo: string): Promise<string> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el enlace a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip(), "user-agent": CHROME }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return galleta(r, "__Host-gemelo")!;
}
const pide = (method: "GET" | "POST" | "DELETE", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "user-agent": CHROME, "x-forwarded-for": ip() }), ...(payload ? { payload } : method === "POST" ? { payload: {} } : {}) });
async function daDeAlta(sesion: string, a: AutenticadorFalso, nombre?: string) {
  const o = await pide("POST", "/api/yo/llaves/opciones", sesion);
  if (o.statusCode !== 200) return o;
  return pide("POST", "/api/yo/llaves", sesion, { ...(nombre ? { nombre } : {}), respuesta: a.alta(o.json()) });
}
const cuenta = async (sql: string, p: unknown[]) => Number((await bd.dueno.query<{ n: string }>(sql, p)).rows[0]!.n);

test("alta, lista, aviso y baja de una familia contra la base de verdad", async t => {
  if (salta(t)) return;
  const s = await entra(ANA);
  const a1 = new AutenticadorFalso(ORIGEN), a2 = new AutenticadorFalso(ORIGEN);
  const r1 = await daDeAlta(s, a1, "Móvil de Ana");
  assert.equal(r1.statusCode, 201, r1.body);
  // una segunda llave con la cuenta que ya tiene una, desde la sesión (que ya se abrió con la primera): la familia siempre puede (decisión 183)
  const r2 = await daDeAlta(s, a2);
  assert.equal(r2.statusCode, 201, r2.body);
  const l = (await pide("GET", "/api/yo/llaves", s)).json();
  assert.equal(l.llaves.length, 2);
  assert.deepEqual(l.llaves.map((x: { nombre: string }) => x.nombre).sort(), ["Móvil de Ana", "Windows · Chrome"]);
  assert.ok(!JSON.stringify(l).includes(a1.id) && !JSON.stringify(l).includes("clave"), "ni el id de credencial ni la clave");
  assert.equal(l.llaves.filter((x: { es_esta: boolean }) => x.es_esta).length, 1, "la de esta sesión");
  await new Promise(r => setImmediate(r));
  assert.equal(ctx.cartero.mensajes.filter(m => m.para === ANA && m.asunto.startsWith("Se ha añadido una llave")).length, 2, "un aviso por alta");
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE accion = 'llave.alta' AND hogar_id = $1", [ids[ANA]!]), 2);
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE detalle::text LIKE '%' || $1 || '%'", [a1.id]), 0, "el id de credencial no está en la auditoría");
  // la misma credencial no entra en otra cuenta
  const luis = await entra(LUIS);
  const dup = await daDeAlta(luis, a1);
  assert.equal(dup.statusCode, 409, dup.body);
  assert.equal(dup.json().error, "llave_repetida");
  // quitar: la de otra cuenta es un 404 igual que una inexistente; la propia cierra su sesión
  const idAna = l.llaves.find((x: { es_esta: boolean }) => x.es_esta).id as number;
  assert.equal((await pide("DELETE", "/api/yo/llaves/" + idAna, luis)).statusCode, 404);
  assert.equal((await pide("DELETE", "/api/yo/llaves/999999", luis)).statusCode, 404);
  const q = await pide("DELETE", "/api/yo/llaves/" + idAna, s);
  assert.equal(q.statusCode, 200, q.body);
  assert.deepEqual(q.json(), { sesiones_cerradas: 1, era_esta: true, quedan: 1 });
  assert.equal((await pide("GET", "/api/yo/llaves", s)).statusCode, 401, "la sesión abierta con esa llave se cerró");
  await new Promise(r => setImmediate(r));
  assert.ok(ctx.cartero.mensajes.some(m => m.para === ANA && m.asunto.startsWith("Se ha quitado una llave")), "aviso de la baja");
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE accion = 'llave.quitada' AND hogar_id = $1", [ids[ANA]!]), 1);
});

test("/api/yo/datos trae las llaves sin material criptográfico, y borrar la cuenta las borra en cascada (llaves, retos y sesiones)", async t => {
  if (salta(t)) return;
  const s = await entra(BORRA);
  const a = new AutenticadorFalso(ORIGEN);
  assert.equal((await daDeAlta(s, a, "Para borrar")).statusCode, 201);
  // un reto abierto de la sesión, para comprobar también esa cascada
  assert.equal((await pide("POST", "/api/yo/llaves/opciones", s)).statusCode, 200);
  const d = await pide("GET", "/api/yo/datos", s);
  assert.equal(d.statusCode, 200, d.body);
  const j = d.json();
  assert.deepEqual(j.llaves_de_acceso.map((x: { nombre: string }) => x.nombre), ["Para borrar"]);
  assert.deepEqual(Object.keys(j.llaves_de_acceso[0]).sort(), ["creada_en", "descubrible", "nombre", "revocada_en", "sincronizada", "ultima_vez_en"]);
  assert.ok(!d.body.includes(a.id));
  const id = ids[BORRA]!;
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1", [id]), 1);
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_retos WHERE sesion_id IN (SELECT id FROM sesiones WHERE hogar_id = $1)", [id]), 1);
  const borra = await pide("DELETE", "/api/yo", s);
  assert.equal(borra.statusCode, 204, borra.body);
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1", [id]), 0, "las llaves se fueron con la cuenta");
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_retos WHERE sesion_id IN (SELECT id FROM sesiones WHERE hogar_id = $1)", [id]), 0);
  assert.equal(await cuenta("SELECT count(*) AS n FROM sesiones WHERE hogar_id = $1", [id]), 0);
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE credencial_id = $1", [a.id]), 0, "y la credencial vuelve a quedar libre");
});

test("salir de todos y quitar las llaves (OF13b-8b): todo en una transacción, un solo correo, y la cuenta vuelve a entrar por enlace y a crear una llave", async t => {
  if (salta(t)) return;
  const id = ids[TODOS]!;
  const s1 = await entra(TODOS), s2 = await entra(TODOS);   // dos aparatos con sesión
  const a1 = new AutenticadorFalso(ORIGEN), a2 = new AutenticadorFalso(ORIGEN);
  assert.equal((await daDeAlta(s1, a1, "Móvil de Luz")).statusCode, 201);
  assert.equal((await daDeAlta(s1, a2, "Portátil")).statusCode, 201);
  await new Promise(r => setImmediate(r));
  const antes = ctx.cartero.mensajes.length;
  // la forma estricta: nada cambia
  for (const cuerpo of [{}, { confirmar: false }, { confirmar: true, x: 1 }]) assert.equal((await pide("POST", "/api/yo/llaves/quitar-todas", s1, cuerpo)).statusCode, 400);
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL", [id]), 2);
  const r = await pide("POST", "/api/yo/llaves/quitar-todas", s1, { confirmar: true });
  assert.equal(r.statusCode, 200, r.body);
  assert.deepEqual(r.json(), { sesiones_cerradas: 2, llaves_quitadas: 2 });
  assert.equal(await cuenta("SELECT count(*) AS n FROM llaves_acceso WHERE hogar_id = $1 AND revocada_en IS NULL", [id]), 0, "ninguna llave viva");
  assert.equal(await cuenta("SELECT count(*) AS n FROM sesiones WHERE hogar_id = $1 AND revocada_en IS NULL", [id]), 0, "ninguna sesión viva");
  assert.equal((await pide("GET", "/api/yo/llaves", s1)).statusCode, 401, "este aparato salió");
  assert.equal((await pide("GET", "/api/yo/llaves", s2)).statusCode, 401, "y el otro también");
  await new Promise(r2 => setImmediate(r2));
  assert.equal(ctx.cartero.mensajes.length - antes, 1, "UN solo correo");
  assert.equal(ctx.cartero.mensajes.at(-1)!.asunto, "Se han cerrado tus sesiones y quitado tus llaves de acceso");
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE hogar_id = $1 AND accion IN ('llave.quitadas_todas', 'sesion.todas_cerradas')", [id]), 2);
  assert.equal(await cuenta("SELECT count(*) AS n FROM auditoria WHERE hogar_id = $1 AND (detalle::text LIKE '%' || $2 || '%' OR detalle::text LIKE '%@%')", [id, a1.id]), 0, "ni credencial ni correo en la auditoría");
  // la cuenta sigue viva: entra por enlace y crea otra llave
  const s3 = await entra(TODOS);
  assert.equal((await daDeAlta(s3, new AutenticadorFalso(ORIGEN), "Nueva")).statusCode, 201);
  assert.equal((await pide("GET", "/api/yo/llaves", s3)).json().llaves.length, 1);
});
