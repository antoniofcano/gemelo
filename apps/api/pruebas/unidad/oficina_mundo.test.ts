// OF10: el mundo en modo oficina sin LiveKit ni base. La oficina entra con el alias «Oficina» (decisión 107), las salas por clave (la general y la de
// la visita), los mensajes que manda la api por la sala (anuncio, invitación a otra sala, balizas) y lo que las rutas deciden ANTES de la sesión o de
// la base (Origin, forma del cuerpo, sesión). Lo que pide sesión de oficina y base (poner, mover y quitar balizas, la auditoría) está en
// pruebas/integracion/oficina_mundo.test.ts (PostGIS en un contenedor, por el banco). Claves sintéticas: ninguna es de un LiveKit real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { TokenVerifier } from "livekit-server-sdk";
import pg from "pg";
import { construyeApp } from "../../src/app.ts";
import type { ConfigLiveKit } from "../../src/config.ts";
import { ALIAS_OFICINA, CLAVES_SALA, esRolOficina, firmaToken, type ModeradorSala, SALAS, TEMAS_OFICINA } from "../../src/presencia/livekit.ts";
import { ANUNCIO_MAX, limpiaTexto, mensaje, salasDe } from "../../src/presencia/oficina_mundo.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS } from "../apoyo/esquemas.ts";

const LK: ConfigLiveKit = { url: "http://livekit:7880", urlPublica: "ws://localhost:7880", clave: "devprueba01", secreto: "s".repeat(16) + "-sintetico-de-prueba-123" };
const lkDevSinBase = { GEMELO_LIVEKIT_URL: "http://127.0.0.1:1", GEMELO_LIVEKIT_URL_PUBLICA: "ws://localhost:7880", GEMELO_LIVEKIT_CLAVE: "devprueba02", GEMELO_LIVEKIT_SECRETO: "q".repeat(32) };
const ROLES = JSON.parse(readFileSync(CONTRATOS + "livekit-roles.json", "utf8")) as {
  version: number; salas: Record<string, { nombre: string; clave?: string }>; temas_de_datos: Record<string, { fiable: boolean; lo_manda?: string }>; roles: Record<string, Record<string, unknown>>;
};
const META = { alias: "Pepa Oficina Real", avatar: { camisa: 1, sombrero: "paja" as const, piel: 2 }, rol: "oficina" as const, dispositivo: "escritorio" as const };

test("contrato livekit-roles v4: las salas por clave y los temas que solo manda la api son los del código", () => {
  assert.ok(ROLES.version >= 4, "OF10 sube la versión del contrato");
  const porClave = Object.fromEntries(Object.values(ROLES.salas).filter(s => s.clave).map(s => [s.clave!, s.nombre]));
  assert.deepEqual(porClave, { ...SALAS }, "general → hituelo-libre y visita → hituelo-visita");
  assert.deepEqual(CLAVES_SALA, ["general", "visita"]);
  for (const t of Object.values(TEMAS_OFICINA)) {
    assert.ok(ROLES.temas_de_datos[t], "el tema «" + t + "» está en el contrato");
    assert.equal(ROLES.temas_de_datos[t]!.fiable, true, t + ": fiable");
    assert.equal(ROLES.temas_de_datos[t]!.lo_manda, "api", t + ": solo lo manda la api (sin participante)");
  }
  for (const p of Object.values(ROLES.roles)) assert.equal(p["roomAdmin"], false, "ningún token de cliente lleva roomAdmin (ADR-0024)");
});

test("la oficina entra con el alias «Oficina» (decisión 107: sin nombre propio) y su rol; un hogar, con el suyo; la sala por clave", async () => {
  assert.ok(esRolOficina("oficina") && esRolOficina("admin") && !esRolOficina("hogar") && !esRolOficina("guia"));
  const v = new TokenVerifier(LK.clave, LK.secreto);
  for (const rol of ["oficina", "admin"] as const) {
    const c = await v.verify((await firmaToken(LK, 5, "ses-of", { ...META, rol })).token);
    assert.equal(c.name, ALIAS_OFICINA, rol);
    const m = JSON.parse(c.metadata!);
    assert.equal(m.alias, "Oficina"); assert.equal(m.rol, rol);
    assert.ok(!JSON.stringify(c).includes("Pepa"), "su alias de cuenta no viaja");
  }
  const h = await v.verify((await firmaToken(LK, 6, "ses-h", { ...META, alias: "Mirlo", rol: "hogar" })).token);
  assert.equal(h.name, "Mirlo"); assert.equal(JSON.parse(h.metadata!).alias, "Mirlo");
  const t = await firmaToken(LK, 6, "ses-h", { ...META, rol: "hogar" }, Date.now(), "visita");
  assert.equal(t.sala, "hituelo-visita");
  assert.equal((await v.verify(t.token)).video!.room, "hituelo-visita");
  assert.equal((await firmaToken(LK, 6, "ses-h", { ...META, rol: "hogar" })).sala, "hituelo-libre", "por omisión, la general");
});

test("el texto de un anuncio se limpia como el chat del motor: sin control ni dirección, espacios juntos, ≤ 280 caracteres; vacío → null", () => {
  assert.equal(limpiaTexto("  Hola   a \n todos  ", ANUNCIO_MAX), "Hola a todos");
  assert.equal(limpiaTexto("a" + String.fromCharCode(0x202e) + "b" + String.fromCharCode(0) + "c", ANUNCIO_MAX), "a b c", "los de dirección y control no pasan");
  assert.equal(limpiaTexto("   ", ANUNCIO_MAX), null); assert.equal(limpiaTexto(7, ANUNCIO_MAX), null);
  assert.equal(Array.from(limpiaTexto("ñ".repeat(400), ANUNCIO_MAX)!).length, 280);
  assert.equal(limpiaTexto("😀".repeat(300), ANUNCIO_MAX), "😀".repeat(280), "cuenta caracteres, no unidades de UTF-16");
});

test("lo que viaja por la sala (JSON v1 en UTF-8) y a qué salas va «todas»", () => {
  const d = new TextDecoder();
  assert.deepEqual(JSON.parse(d.decode(mensaje.anuncio("Se recoge en la loma"))), { v: 1, texto: "Se recoge en la loma" });
  assert.deepEqual(JSON.parse(d.decode(mensaje.sala("visita"))), { v: 1, a: "visita" });
  assert.deepEqual(JSON.parse(d.decode(mensaje.balizas("hituelo"))), { v: 1, finca: "hituelo" });
  assert.deepEqual(salasDe("todas"), ["hituelo-libre", "hituelo-visita"]); assert.deepEqual(salasDe("visita"), ["hituelo-visita"]);
});

// ---------------------------------------------------------------- las rutas, sin base (lo que se decide antes de consultarla)
test("rutas de OF10: sin Origin 403, cuerpo raro 400, sin sesión 401 (y nada sale por LiveKit)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const enviados: string[] = [];
  const moderador: ModeradorSala = { expulsaHogar: async () => 0, envia: async (s, t) => { enviados.push(s + "/" + t); return true; } };
  const app = await construyeApp({ ...contexto(pool, configDePrueba({ ...lkDevSinBase })), moderador });
  try {
    let n = 0;   // una IP por petición: el límite por minuto de anunciar y llevar (6) no es lo que se prueba aquí
    const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, cab = deLaWeb({ "x-forwarded-for": "198.51.100." + (++n % 250) })) =>
      app.inject({ method, url, headers: cab, ...(payload ? { payload } : {}) });
    // anunciar
    const A = "/api/admin/presencia/anuncio";
    assert.equal((await pide("POST", A, { texto: "hola", sala: "general" }, { "x-forwarded-proto": "https" })).statusCode, 403, "sin Origin");
    for (const malo of [{}, { texto: "hola" }, { texto: "", sala: "general" }, { texto: "x".repeat(ANUNCIO_MAX + 1), sala: "general" }, { texto: "hola", sala: "otra" }, { texto: "hola", sala: "todas", extra: 1 }])
      assert.equal((await pide("POST", A, malo)).statusCode, 400, JSON.stringify(malo));
    for (const sala of ["general", "visita", "todas"]) assert.equal((await pide("POST", A, { texto: "hola", sala })).statusCode, 401, sala);
    // llevar a otra sala
    const L = "/api/admin/presencia/llevar";
    for (const malo of [{}, { de: "general" }, { de: "general", a: "otra" }, { de: "x", a: "visita" }]) assert.equal((await pide("POST", L, malo)).statusCode, 400, JSON.stringify(malo));
    assert.equal((await pide("POST", L, { de: "general", a: "visita" })).statusCode, 401);
    // balizas
    assert.equal((await pide("GET", "/api/balizas-oficiales?finca=hituelo")).statusCode, 401);
    for (const q of ["", "?finca=Hituelo", "?finca=hituelo&x=1"]) assert.equal((await pide("GET", "/api/balizas-oficiales" + q)).statusCode, 400, q);
    const B = { finca: "hituelo", x: 400100, y: 4100100, titulo: "Aquí se recoge hoy" };
    for (const malo of [{ ...B, x: 50 }, { ...B, y: 5_000_000 }, { ...B, titulo: "" }, { ...B, titulo: "t".repeat(61) }, { ...B, texto: "t".repeat(281) }, { ...B, horas: 0 }, { ...B, horas: 169 }, { ...B, horas: 1.5 }, { ...B, finca: "a b" }, { ...B, autor: 1 }])
      assert.equal((await pide("POST", "/api/admin/balizas", malo)).statusCode, 400, JSON.stringify(malo));
    assert.equal((await pide("POST", "/api/admin/balizas", { ...B, texto: "Traed agua", horas: 4 })).statusCode, 401);
    assert.equal((await pide("PUT", "/api/admin/balizas/0", { x: 400100, y: 4100100 })).statusCode, 400);
    assert.equal((await pide("PUT", "/api/admin/balizas/3", { x: 400100 })).statusCode, 400);
    assert.equal((await pide("PUT", "/api/admin/balizas/3", { x: 400100, y: 4100100 })).statusCode, 401);
    assert.equal((await pide("DELETE", "/api/admin/balizas/abc")).statusCode, 400);
    assert.equal((await pide("DELETE", "/api/admin/balizas/3")).statusCode, 401);
    // el token admite la sala por clave (y nada más)
    assert.equal((await pide("POST", "/api/presencia/token", { dispositivo: "escritorio", sala: "visita" })).statusCode, 401, "sala válida: pide sesión");
    assert.equal((await pide("POST", "/api/presencia/token", { dispositivo: "escritorio", sala: "hituelo-visita" })).statusCode, 400, "por clave, no por nombre de LiveKit");
    assert.deepEqual(enviados, [], "nada sale por LiveKit sin sesión de oficina");
  } finally { await app.close(); await pool.end(); }
});

test("sin LiveKit (GEMELO_LIVEKIT_URL vacía), anunciar y llevar no existen para el servidor: piden sesión antes de decir 503 (como expulsar)", async () => {
  const pool = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
  const app = await construyeApp(contexto(pool, configDePrueba()));
  try {
    assert.equal((await app.inject({ method: "POST", url: "/api/admin/presencia/anuncio", headers: deLaWeb(), payload: { texto: "hola", sala: "general" } })).statusCode, 401);
  } finally { await app.close(); await pool.end(); }
});
