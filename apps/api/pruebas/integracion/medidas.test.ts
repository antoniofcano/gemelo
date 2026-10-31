// Integración de las medidas de fluidez (migración 0017, PB9, contratos/medidas.md) contra PostGIS en un contenedor (la misma imagen que producción):
// guardar una medida, que la fila no lleve nada de personas, lo no creíble (422), el límite por hogar y día, los permisos de la tabla, el agregado de la
// oficina con sus filtros y que un hogar no lo lee. Datos SINTÉTICOS (correos @example.com). Sin Docker se SALTA con aviso.
// ESCRITA SIN LANZAR (PB9: tarea ligera, sin Docker): la lanza el banco en la puerta pesada.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { MEDIDAS_POR_DIA, type CuerpoMedida } from "../../src/medidas/rutas.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración de las medidas de fluidez con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const ANA = "ana-medidas@example.com", LUIS = "luis-medidas@example.com", OFI = "ofi-medidas@example.com";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ANA, "hogar"], [LUIS, "hogar"], [OFI, "oficina"]] as const) await bd.dueno.query("INSERT INTO hogares (correo, rol) VALUES ($1, $2)", [c, rol]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });
after(async () => { if (SALTO) return; await app.close(); await bd.cierra(); });

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
  assert.ok(t);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  const aparato = galleta(r, "__Host-gemelo-aparato");
  if (aparato) await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(aparato)]);
  return galleta(r, "__Host-gemelo")!;
}
const pide = (method: "GET" | "POST", url: string, sesion: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion, "x-forwarded-for": ip(), "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" }), ...(payload ? { payload } : {}) });
const medida = (extra: Partial<CuerpoMedida> = {}): CuerpoMedida => ({
  aparato: "quest", navegador: "Quest Browser", nav_mayor: 38, perfil: 2, finca: "hituelo", modo: "nube", vr: true,
  mediana_ms: 12.1, p95_ms: 13.5, peor_ms: 30.5, fotogramas: 4300, duracion_s: 60, version: "0.2.0", medida_en: new Date(Date.now() - 60_000).toISOString(), ...extra,
});

test("0017: la tabla, sus límites, que no guarda nada de personas y que la api solo lee y añade", async t => {
  if (salta(t)) return;
  const cols = (await bd.dueno.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'medidas_fluidez' ORDER BY ordinal_position")).rows.map(r => r.column_name);
  assert.ok(!cols.some(c => /hogar|correo|ip|agente|ua|lat|lon|sesion/i.test(c) && c !== "duracion_s"), "ninguna columna de personas: " + cols.join(", "));
  const priv = (await bd.dueno.query<{ p: string }>("SELECT privilege_type AS p FROM information_schema.role_table_grants WHERE grantee = 'gemelo_api' AND table_name = 'medidas_fluidez' ORDER BY 1")).rows.map(r => r.p);
  assert.deepEqual(priv, ["INSERT", "SELECT"]);
  await assert.rejects(bd.dueno.query("INSERT INTO medidas_fluidez (medida_en, aparato, navegador, nav_mayor, perfil, finca, modo, vr, mediana_ms, p95_ms, peor_ms, fotogramas, duracion_s, version) VALUES (now(), 'tele', 'X', 1, 0, 'f', 'm', false, 1, 1, 1, 10, 60, '1')"), /check/);
  await assert.rejects(bd.app.query("DELETE FROM medidas_fluidez"), /permission|permiso/);
  await assert.rejects(bd.app.query("UPDATE medidas_fluidez SET p95_ms = 0"), /permission|permiso/);
});

test("guardar: 201, la fila lleva solo lo del cuerpo; lo no creíble, 422 y no se guarda", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  let r = await pide("POST", "/api/medidas", ana, medida());
  assert.equal(r.statusCode, 201, r.body); assert.deepEqual(r.json(), { guardada: true });
  const fila = (await bd.dueno.query("SELECT * FROM medidas_fluidez ORDER BY id DESC LIMIT 1")).rows[0];
  assert.equal(fila.aparato, "quest"); assert.equal(fila.navegador, "Quest Browser"); assert.equal(fila.nav_mayor, 38); assert.equal(fila.vr, true);
  assert.ok(!/Mozilla|Linux|198\.51\.100|ana-medidas/.test(JSON.stringify(fila)), "ni IP, ni agente de usuario, ni correo en la fila: " + JSON.stringify(fila));
  assert.ok(!(await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion ILIKE '%medida%'")).rows.length, "no se audita el envío");
  const antes = (await bd.dueno.query<{ n: number }>("SELECT count(*)::int AS n FROM medidas_fluidez")).rows[0]!.n;
  for (const payload of [medida({ p95_ms: 1 }), medida({ medida_en: new Date(Date.now() + 3_600_000).toISOString() }), medida({ medida_en: new Date(Date.now() - 30 * 86_400_000).toISOString() })]) {
    r = await pide("POST", "/api/medidas", ana, payload);
    assert.equal(r.statusCode, 422, JSON.stringify(payload)); assert.equal(r.json().error, "medida_no_creible");
  }
  assert.equal((await bd.dueno.query<{ n: number }>("SELECT count(*)::int AS n FROM medidas_fluidez")).rows[0]!.n, antes);
});

test("límite por hogar y día: pasadas " + MEDIDAS_POR_DIA + " medidas, 429 con texto propio; otro hogar sigue pudiendo", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS);
  let ultimo: LightMyRequestResponse | null = null;
  for (let i = 0; i <= MEDIDAS_POR_DIA; i++) ultimo = await pide("POST", "/api/medidas", luis, medida({ aparato: "movil", navegador: "Safari", nav_mayor: 17, vr: false, perfil: -1, p95_ms: 30, mediana_ms: 20, peor_ms: 90 }));
  assert.equal(ultimo!.statusCode, 429); assert.equal(ultimo!.json().error, "demasiadas_peticiones");
  assert.equal((await pide("POST", "/api/medidas", await entra(ANA), medida())).statusCode, 201, "el límite es por hogar");
});

test("la oficina lee el agregado por día, aparato y VR con filtros; un hogar no lo lee; nada de ids ni hogares", async t => {
  if (salta(t)) return;
  const ofi = await entra(OFI), ana = await entra(ANA);
  assert.equal((await pide("GET", "/api/admin/medidas", ana)).statusCode, 403);
  const r = await pide("GET", "/api/admin/medidas", ofi);
  assert.equal(r.statusCode, 200, r.body); assert.equal(r.headers["cache-control"], "no-store");
  const j = r.json();
  assert.deepEqual(j.objetivos_p95_ms, { escritorio: null, movil: null, quest: 13.9 });
  const q = j.filas.find((f: { aparato: string }) => f.aparato === "quest");
  assert.ok(q && q.vr === true && q.medidas >= 2 && q.p95_mediano_ms <= 13.9 && q.cumple === true && q.objetivo_p95_ms === 13.9, JSON.stringify(q));
  const m = j.filas.find((f: { aparato: string }) => f.aparato === "movil");
  assert.ok(m && m.objetivo_p95_ms === null && m.cumple === null, JSON.stringify(m));
  assert.ok(!/hogar|ana-medidas|luis-medidas|"id"/.test(r.body), "ni hogares ni ids: " + r.body);
  const soloMovil = (await pide("GET", "/api/admin/medidas?aparato=movil", ofi)).json();
  assert.ok(soloMovil.filas.length >= 1 && soloMovil.filas.every((f: { aparato: string }) => f.aparato === "movil"));
  assert.equal((await pide("GET", "/api/admin/medidas?desde=2999-01-01", ofi)).json().filas.length, 0);
  assert.equal((await pide("GET", "/api/admin/medidas?hasta=2000-01-01", ofi)).json().filas.length, 0);
  assert.equal((await pide("GET", "/api/admin/medidas?desde=2026-02-30", ofi)).statusCode, 400, "fecha que no existe");
});
