// Sistema de la oficina (OF5) contra PostGIS en un contenedor: la salud juntada, OlivarTrack tras una sincronía, el correo de prueba a la propia
// cuenta, la auditoría filtrada y paginada, y que ni un hogar entra ni sale un secreto. Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { hashToken } from "../../src/seguridad/cripto.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb, GRABACIONES } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: Sistema de la oficina con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const ADMIN = "admin-sistema@example.com", OFI = "ofi-sistema@example.com", ANA = "ana-sistema@example.com";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[ADMIN, "admin"], [OFI, "oficina"], [ANA, "hogar"]] as const) await bd.dueno.query("INSERT INTO hogares (correo, rol) VALUES ($1, $2)", [c, rol]);
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_OT: "grabado", GEMELO_OT_GRABACIONES: GRABACIONES }));
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
/** Entra con enlace; si es de oficina, aprueba su aparato (como la consola del RUNBOOK). Devuelve la cookie de sesión. */
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
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion }), ...(payload ? { payload } : {}) });

test("un hogar no entra en Sistema", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  for (const url of ["/api/admin/sistema", "/api/admin/auditoria"]) assert.equal((await pide("GET", url, ana)).statusCode, 403, url);
  assert.equal((await pide("POST", "/api/admin/correo/prueba", ana, {})).statusCode, 403);
});

test("la salud junta api, base, LiveKit, correo y hornero; Vigía sin conector; nada de secretos", async t => {
  if (salta(t)) return;
  const s = await entra(ADMIN);
  const r = await pide("GET", "/api/admin/sistema", s);
  assert.equal(r.statusCode, 200, r.body);
  const j = r.json();
  assert.deepEqual(j.salud.map((x: { id: string }) => x.id), ["api", "base", "livekit", "correo", "hornero"]);
  const por = Object.fromEntries(j.salud.map((x: { id: string; estado: string }) => [x.id, x.estado]));
  assert.deepEqual([por.api, por.base, por.livekit, por.hornero], ["ok", "ok", "apagado", "apagado"]);
  assert.equal(por.correo, "aviso", "sin probar todavía");
  assert.equal(j.correo.modo, "buzon"); assert.equal(j.correo.ultima_prueba, null);
  assert.equal(j.vigia.conector, false); assert.equal(j.vigia.modo, "no");
  assert.equal(j.hornero.conectado, false);
  assert.equal(r.headers["cache-control"], "no-store");
  const crudo = r.body;
  for (const prohibido of [/token/i, /secreto/i, /clave/i, /password/i, /postgres/i, /127\.0\.0\.1/, /[A-Za-z]:\\/]) assert.ok(!prohibido.test(crudo), "la respuesta no menciona " + prohibido);
});

test("OlivarTrack: sin sincronías, vacío; tras sincronizar, una fila por herramienta con de cuándo es el dato", async t => {
  if (salta(t)) return;
  const s = await entra(ADMIN);
  const antes = (await pide("GET", "/api/admin/sistema", s)).json().olivartrack;
  assert.equal(antes.modo, "grabado"); assert.equal(antes.puede_sincronizar, true); assert.deepEqual(antes.herramientas, []);
  assert.equal((await pide("POST", "/api/admin/sincronia", s, {})).statusCode, 200);
  const o = (await pide("GET", "/api/admin/sistema", s)).json().olivartrack;
  assert.deepEqual(o.herramientas.map((h: { herramienta: string }) => h.herramienta).sort(), ["aforo_y_avance_de_recoleccion", "novedades", "pases_del_periodo"]);
  for (const h of o.herramientas) {
    assert.ok(["ok", "truncado", "parcial", "error"].includes(h.estado));
    assert.equal(h.completa, h.estado === "ok");
    assert.ok(h.intentada_en);
  }
  assert.ok(!("cursor" in o.herramientas[0]), "el cursor interno no sale");
});

test("correo de prueba: va a la propia cuenta, queda en la auditoría y la salud lo recuerda", async t => {
  if (salta(t)) return;
  const s = await entra(OFI);
  const antes = ctx.cartero.mensajes.length;
  const r = await pide("POST", "/api/admin/correo/prueba", s, {});
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(ctx.cartero.mensajes.length, antes + 1);
  const m = ctx.cartero.mensajes[ctx.cartero.mensajes.length - 1]!;
  assert.equal(m.para, OFI); assert.match(m.asunto, /Prueba/);
  assert.ok(!/entrar\?t=/.test(m.texto), "no lleva enlace");
  const j = (await pide("GET", "/api/admin/sistema", s)).json();
  assert.equal(j.correo.ultima_prueba.ok, true);
  assert.equal(j.salud.find((x: { id: string }) => x.id === "correo").estado, "ok");
  // un fallo del envío: 502, auditado como fallido, y la salud lo dice
  ctx.cartero.falla = true;
  const mal = await pide("POST", "/api/admin/correo/prueba", s, {});
  ctx.cartero.falla = false;
  assert.equal(mal.statusCode, 502); assert.equal(mal.json().error, "correo_fallido");
  assert.ok(!/fallo simulado/.test(mal.body), "no se cuela el texto del error");
  assert.equal((await pide("GET", "/api/admin/sistema", s)).json().correo.ultima_prueba.ok, false);
});

test("auditoría: filtra por acción, pagina hacia atrás por cursor y no enseña correos", async t => {
  if (salta(t)) return;
  const s = await entra(ADMIN);
  const p1 = (await pide("GET", "/api/admin/auditoria?limite=2", s)).json();
  assert.equal(p1.filas.length, 2); assert.ok(p1.siguiente > 0);
  assert.ok(p1.acciones.includes("oficina.correo_prueba") && p1.acciones.includes("admin.sincronia"));
  assert.ok(p1.filas[0].id > p1.filas[1].id, "de la más reciente a la más antigua");
  const p2 = (await pide("GET", "/api/admin/auditoria?limite=2&antes=" + p1.siguiente, s)).json();
  assert.ok(p2.filas.length > 0 && p2.filas.every((f: { id: number }) => f.id < p1.siguiente));
  assert.equal(p2.acciones, undefined, "las acciones solo vienen en la primera página");
  const f = (await pide("GET", "/api/admin/auditoria?accion=oficina.correo_prueba", s)).json();
  assert.ok(f.filas.length >= 2 && f.filas.every((x: { accion: string }) => x.accion === "oficina.correo_prueba"));
  assert.deepEqual(f.filas.map((x: { detalle: { ok: boolean } }) => x.detalle.ok), [false, true], "el fallo y el éxito");
  assert.ok(f.filas[0].quien.rol === "oficina" && typeof f.filas[0].quien.hogar === "number");
  assert.ok(!/@example\.com/.test(JSON.stringify(p1) + JSON.stringify(f)), "ni un correo en la auditoría");
  // entradas no válidas: 400
  for (const q of ["accion=MAL%20valor", "limite=0", "limite=1000", "antes=abc", "otra=1"]) assert.equal((await pide("GET", "/api/admin/auditoria?" + q, s)).statusCode, 400, q);
});

test("re-hornear (OF9): solo admin con confirmación reciente; deja el fichero de la petición, la audita, no se repite mientras espera y Sistema la ve atendida cuando el hornero lo anota", async t => {
  if (salta(t)) return;
  const dir = mkdtempSync(join(tmpdir(), "rehornear-")), previo = ctx.config.hornero;
  const pon = (h: unknown) => { (ctx.config as { hornero: unknown }).hornero = h; };
  try {
    const estado = join(dir, "estado"), pedido = join(dir, "config", "pedido-rehornear.json");
    mkdirSync(estado, { recursive: true }); mkdirSync(join(dir, "config"), { recursive: true });
    const latido = (extra: Record<string, unknown>) => writeFileSync(join(estado, "servicio.json"), JSON.stringify({ v: 1, latido_en: new Date().toISOString(), comprueba_s: 600, fincas: { hituelo: { durmiendo_hasta: null, ultimo_motivo: "arranque", ...extra } } }));
    latido({});
    pon({ estado, salida: null, pedido });
    const ofi = await entra(OFI), admin = await entra(ADMIN);
    assert.equal((await pide("POST", "/api/admin/hornero/rehornear", ofi, {})).statusCode, 403, "oficina no puede");
    assert.ok(!existsSync(pedido));
    // sin confirmación reciente
    await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '1 day' WHERE hogar_id = (SELECT id FROM hogares WHERE correo = $1)", [ADMIN]);
    const sin = await pide("POST", "/api/admin/hornero/rehornear", admin, {});
    assert.equal(sin.statusCode, 403); assert.equal(sin.json().error, "confirmacion_requerida"); assert.ok(!existsSync(pedido));
    await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = (SELECT id FROM hogares WHERE correo = $1)", [ADMIN]);
    const ok = await pide("POST", "/api/admin/hornero/rehornear", admin, {});
    assert.equal(ok.statusCode, 202, ok.body);
    const p = ok.json(); assert.match(p.id, /^[0-9a-f-]{36}$/); assert.equal(p.estado, "pendiente");
    assert.equal(JSON.parse(readFileSync(pedido, "utf8")).id, p.id, "el fichero lleva el id que se devolvió");
    // mientras espera: no se amontonan peticiones, y Sistema la ve pendiente
    const otra = await pide("POST", "/api/admin/hornero/rehornear", admin, {});
    assert.equal(otra.statusCode, 409); assert.equal(otra.json().error, "ya_pedido");
    const s1 = (await pide("GET", "/api/admin/sistema", admin)).json().hornero;
    assert.equal(s1.puede_rehornear, true); assert.equal(s1.pedido.estado, "pendiente"); assert.equal(s1.pedido.id, p.id);
    assert.ok(!JSON.stringify(s1).includes(dir), "ni una ruta del servidor");
    // el hornero la atiende y la anota en su latido
    latido({ pedido_atendido: p.id, pedido_atendido_en: new Date().toISOString() });
    const s2 = (await pide("GET", "/api/admin/sistema", admin)).json().hornero;
    assert.equal(s2.pedido.estado, "atendido"); assert.ok(s2.pedido.atendido_en);
    // atendida, se puede pedir otra
    assert.equal((await pide("POST", "/api/admin/hornero/rehornear", admin, {})).statusCode, 202);
    const aud = (await pide("GET", "/api/admin/auditoria?accion=hornero.rehornear", admin)).json();
    assert.equal(aud.filas.length, 2); assert.equal(aud.filas[1].detalle.pedido, p.id);
    // sin dónde dejarla: 503 claro
    pon({ estado, salida: null, pedido: null });
    assert.equal((await pide("POST", "/api/admin/hornero/rehornear", admin, {})).json().error, "hornero_no_conectado");
  } finally { pon(previo); rmSync(dir, { recursive: true, force: true }); }
});
