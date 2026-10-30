// Integración de la sección Hazas de la oficina (OF3, doc/sistema/OFICINA.md §4) contra PostGIS en un contenedor: crear con el recuento
// del servidor, rechazar lo que no vale (geometría inválida, anillo abierto, fuera de la finca, solape, código repetido), guardar sobre una
// versión (409 si otra persona guardó antes), olivos en la linde, volver = copia, el historial solo-añadir, partir (ST_Split), juntar
// (ST_Union, con confirmación reciente; lo colgado pasa a la que queda) y borrar. Datos sintéticos (una finca «prueba» inventada).
// Sin Docker se SALTA con aviso.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { construyeApp } from "../../src/app.ts";
import { type BdDePrueba, hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: las hazas de la oficina con PostGIS NO se han comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>;
let ipN = 0;
const OFI = "ofi-hz@example.com", ANA = "ana-hz@example.com", LUIS = "luis-hz@example.com";
const ids: Record<string, number> = {};
const E0 = 430_000, N0 = 4_180_000;   // nada de esto es real

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  for (const [c, rol] of [[OFI, "oficina"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = Number((await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id);
  }
  // 100 olivos medidos en rejilla de 10 m: x, y = 5, 15, …, 95 (relativos a E0, N0)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 10; j++) {
    await bd.dueno.query("INSERT INTO olivos (id_estable, geom, fuente) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 25830), 'lidar')",
      ["prueba:" + (i * 10 + j + 1), E0 + 5 + i * 10, N0 + 5 + j * 10]);
  }
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
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
async function entra(correo: string): Promise<{ sesion: string; aparato: string | null }> {
  const p = await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  assert.equal(p.statusCode, 202);
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")?.[1];
  assert.ok(t, "no llegó el correo a " + correo);
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip() }), payload: "t=" + t });
  assert.equal(r.statusCode, 303, r.body);
  return { sesion: galleta(r, "__Host-gemelo")!, aparato: galleta(r, "__Host-gemelo-aparato") };
}
async function oficina(correo: string): Promise<string> {
  const e = await entra(correo);
  const { hashToken } = await import("../../src/seguridad/cripto.ts");
  await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE hash = $1", [hashToken(e.aparato!)]);
  return e.sesion;
}
let ofi = "";
const pide = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, payload?: object, sesion = ofi) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + sesion }), ...(payload ? { payload } : {}) });
/** Polígono a partir de vértices relativos a (E0, N0), cerrado. */
const pol = (...v: [number, number][]) => ({ type: "Polygon", coordinates: [[...v, v[0]!].map(([x, y]) => [E0 + x, N0 + y])] });
const rect = (x0: number, y0: number, x1: number, y1: number) => pol([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
const haza = async (codigo: string) => ((await pide("GET", "/api/admin/hazas?finca=prueba&geometria=true")).json().hazas as Record<string, any>[]).find(z => z["codigo"] === codigo)!;
const versiones = async (id: number) => (await pide("GET", "/api/admin/hazas/" + id + "/versiones")).json().versiones as Record<string, any>[];

test("solo la oficina: un hogar 403 y sin sesión 401", async t => {
  if (salta(t)) return;
  ofi = await oficina(OFI);
  const ana = await entra(ANA);
  assert.equal((await pide("GET", "/api/admin/hazas", undefined, ana.sesion)).statusCode, 403);
  assert.equal((await pide("POST", "/api/admin/hazas", { codigo: "X", nombre: "x", finca: "prueba", geometria: rect(0, 0, 50, 100) }, ana.sesion)).statusCode, 403);
  assert.equal((await app.inject({ method: "GET", url: "/api/admin/hazas", headers: deLaWeb() })).statusCode, 401);
});

test("crear: el servidor cuenta los olivos y mide la superficie; versión 1 en el historial con su autor", async t => {
  if (salta(t)) return;
  const r = await pide("POST", "/api/admin/hazas", { codigo: "H-A", nombre: "La de prueba A", finca: "prueba", geometria: rect(0, 0, 50, 100), nota: "primer trazo" });
  assert.equal(r.statusCode, 201, r.body);
  const z = r.json().haza;
  ids["H-A"] = z.id;
  assert.equal(z.olivos, 50); assert.equal(z.superficie_ha, 0.5); assert.equal(z.version, 1); assert.equal(z.hogar_id, null);
  assert.equal(z.olivos_borde, 0); assert.deepEqual(z.solapes, []); assert.equal(z.geometria.type, "MultiPolygon");
  const v = await versiones(z.id);
  assert.equal(v.length, 1); assert.equal(v[0]!["accion"], "crear"); assert.equal(v[0]!["autor"], OFI); assert.equal(v[0]!["nota"], "primer trazo");
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'admin.haza_creada' AND (detalle->>'haza')::int = $1", [z.id])).rowCount, 1);
  // la ficha pública dice lo mismo (mismo recuento) y no enseña nada de la oficina
  const b = await pide("POST", "/api/admin/hazas", { codigo: "H-B", nombre: "La de prueba B", finca: "prueba",
    geometria: pol([50, 0], [70, 0], [100, 0], [100, 100], [70, 100], [50, 100]) });   // comparte linde con H-A: no es solape
  assert.equal(b.statusCode, 201, b.body);
  ids["H-B"] = b.json().haza.id;
  assert.equal(b.json().haza.olivos, 50); assert.deepEqual(b.json().haza.solapes, []);
});

test("lo que no vale no se guarda: inválida, anillo abierto, fuera de la finca, finca sin olivos, solape, código repetido, campos de más", async t => {
  if (salta(t)) return;
  const prueba = async (cuerpo: object, codigo: number, error: string) => {
    const r = await pide("POST", "/api/admin/hazas", { codigo: "H-X", nombre: "x", finca: "prueba", ...cuerpo });
    assert.equal(r.statusCode, codigo, JSON.stringify(cuerpo).slice(0, 80) + " → " + r.body); assert.equal(r.json().error, error);
    return r.json();
  };
  const lazo = await prueba({ geometria: pol([0, 200], [40, 240], [40, 200], [0, 240]) }, 400, "geometria_no_valida");   // se cruza consigo misma
  assert.match(String(lazo.motivo), /Self-intersection/i);
  await prueba({ geometria: { type: "Polygon", coordinates: [[[E0, N0], [E0 + 10, N0], [E0 + 10, N0 + 10], [E0, N0 + 10]]] } }, 400, "anillo_abierto");
  await prueba({ geometria: { type: "Polygon", coordinates: [[[-3.7, 40.4], [-3.6, 40.4], [-3.6, 40.5], [-3.7, 40.4]]] } }, 400, "fuera_de_utm");
  await prueba({ geometria: rect(1000, 1000, 1050, 1050) }, 400, "fuera_de_finca");
  await prueba({ finca: "otra", geometria: rect(0, 0, 10, 10) }, 400, "finca_desconocida");
  await prueba({ geometria: rect(0, 0, 2, 2) }, 400, "demasiado_pequena");
  const s = await prueba({ geometria: rect(40, 40, 60, 60) }, 409, "solape");
  assert.deepEqual(s.solapes.map((x: { codigo: string }) => x.codigo), ["H-A", "H-B"]); assert.equal(s.solapes[0].m2, 200);
  const r = await pide("POST", "/api/admin/hazas", { codigo: "H-A", nombre: "x", finca: "prueba", geometria: rect(100, 0, 140, 40) });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "codigo_repetido");
  assert.equal((await pide("POST", "/api/admin/hazas", { codigo: "H-Y", nombre: "x", finca: "prueba", geometria: rect(100, 0, 140, 40), hogar_id: 1 })).statusCode, 400);
  assert.equal((await bd.dueno.query("SELECT 1 FROM hazas WHERE codigo IN ('H-X', 'H-Y')")).rowCount, 0);
});

test("guardar sobre una versión: sube la versión, avisa de olivos en la linde y 409 si otra persona guardó antes", async t => {
  if (salta(t)) return;
  // el lado este de H-A se retira a x = 45,5: los olivos de x = 45 quedan dentro a 0,5 m de la linde (y H-A ya no toca H-B)
  let r = await pide("PUT", "/api/admin/hazas/" + ids["H-A"] + "/geom", { geometria: rect(0, 0, 45.5, 100), version: 1, nota: "linde del camino" });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().haza.version, 2); assert.equal(r.json().haza.olivos, 50); assert.equal(r.json().haza.olivos_borde, 10); assert.equal(r.json().sin_cambios, false);
  // otra persona tenía abierta la versión 1
  r = await pide("PUT", "/api/admin/hazas/" + ids["H-A"] + "/geom", { geometria: rect(0, 0, 30, 100), version: 1 });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "version_cambiada"); assert.equal(r.json().actual.version, 2);
  assert.equal((await haza("H-A"))["olivos"], 50, "no se pisó");
  // pisar a la vecina tampoco
  r = await pide("PUT", "/api/admin/hazas/" + ids["H-A"] + "/geom", { geometria: rect(0, 0, 60, 100), version: 2 });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "solape");
  // guardar lo mismo no hace versión
  r = await pide("PUT", "/api/admin/hazas/" + ids["H-A"] + "/geom", { geometria: rect(0, 0, 45.5, 100), version: 2 });
  assert.equal(r.statusCode, 200); assert.equal(r.json().sin_cambios, true); assert.equal(r.json().haza.version, 2);
});

test("volver = guardar una copia como versión nueva; el historial no se reescribe (ni la api puede)", async t => {
  if (salta(t)) return;
  let r = await pide("POST", "/api/admin/hazas/" + ids["H-A"] + "/volver/1", { version_actual: 2 });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(r.json().haza.version, 3); assert.equal(r.json().haza.superficie_ha, 0.5); assert.equal(r.json().haza.olivos_borde, 0);
  const v = await versiones(ids["H-A"]!);
  assert.deepEqual(v.map(x => [x["version"], x["accion"], x["desde_version"]]), [[3, "volver", 1], [2, "editar", null], [1, "crear", null]]);
  assert.equal(v[1]!["nota"], "linde del camino"); assert.equal(v[1]!["superficie_ha"], 0.455);
  r = await pide("POST", "/api/admin/hazas/" + ids["H-A"] + "/volver/3", { version_actual: 3 });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "sin_cambios");
  assert.equal((await pide("POST", "/api/admin/hazas/" + ids["H-A"] + "/volver/9", { version_actual: 3 })).statusCode, 404);
  // el rol de la api no puede cambiar ni borrar versiones (solo-añadir, como la auditoría)
  await assert.rejects(bd.app.query("UPDATE hazas_versiones SET nota = 'x'"), /permission denied/);
  await assert.rejects(bd.app.query("DELETE FROM hazas_versiones"), /permission denied/);
  // la versión no se toca a mano
  await bd.dueno.query("UPDATE hazas SET version = 99 WHERE id = $1", [ids["H-A"]]);
  assert.equal((await haza("H-A"))["version"], 3);
});

test("partir por dos vértices (ST_Split): el trozo mayor se queda, el otro es una haza nueva sin familia", async t => {
  if (salta(t)) return;
  await bd.dueno.query("INSERT INTO haza_parcela (haza_id, parcela_ot) VALUES ($1, 'prueba:P1')", [ids["H-B"]]);
  // un corte que no va de vértice a vértice
  let r = await pide("POST", "/api/admin/hazas/" + ids["H-B"] + "/partir", { a: [E0 + 60, N0], b: [E0 + 70, N0 + 100], version: 1, codigo: "H-C", nombre: "Trozo" });
  assert.equal(r.statusCode, 400); assert.equal(r.json().error, "corte_no_valido");
  // dos vértices vecinos (el corte va por la linde: no parte nada)
  r = await pide("POST", "/api/admin/hazas/" + ids["H-B"] + "/partir", { a: [E0 + 50, N0], b: [E0 + 70, N0], version: 1, codigo: "H-C", nombre: "Trozo" });
  assert.equal(r.statusCode, 400); assert.equal(r.json().error, "corte_no_valido");
  r = await pide("POST", "/api/admin/hazas/" + ids["H-B"] + "/partir", { a: [E0 + 70.004, N0], b: [E0 + 70, N0 + 100], version: 1, codigo: "H-C", nombre: "Trozo de B" });
  assert.equal(r.statusCode, 201, r.body);
  const { haza: b, nueva: c } = r.json();
  ids["H-C"] = c.id;
  assert.equal(b.version, 2); assert.equal(b.superficie_ha, 0.3); assert.equal(b.olivos, 30);
  assert.equal(c.codigo, "H-C"); assert.equal(c.superficie_ha, 0.2); assert.equal(c.olivos, 20); assert.equal(c.hogar_id, null); assert.equal(c.version, 1);
  assert.deepEqual(c.parcelas.map((p: { id: string }) => p.id), ["prueba:P1"], "las mismas parcelas de OlivarTrack");
  const v = await versiones(c.id);
  assert.equal(v[0]!["accion"], "partida_de"); assert.match(String(v[0]!["nota"]), /sale de H-B/);
  assert.equal((await versiones(b.id))[0]!["accion"], "partir");
});

test("juntar (ST_Union) pide confirmación reciente; lo colgado pasa a la que queda; con familias distintas no", async t => {
  if (salta(t)) return;
  // C es de Ana y tiene un árbol con nombre; B no tiene familia
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE id = $2", [ids[ANA], ids["H-C"]]);
  const olivo = (await bd.dueno.query<{ id: number }>("SELECT id FROM olivos WHERE id_estable = 'prueba:52'")).rows[0]!.id;   // x = 55, y = 15: en H-C
  await bd.dueno.query("INSERT INTO personalizaciones (olivo_id, haza_id, hogar_id, nombre) VALUES ($1, $2, $3, 'La Abuela')", [olivo, ids["H-C"], ids[ANA]]);
  const cuerpo = { a: ids["H-B"], b: ids["H-C"], version_a: 2, version_b: 1 };
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[OFI]]);
  let r = await pide("POST", "/api/admin/hazas/juntar", cuerpo);
  assert.equal(r.statusCode, 403); assert.equal(r.json().error, "confirmacion_requerida");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[OFI]]);
  // familias distintas: no
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE id = $2", [ids[LUIS], ids["H-B"]]);
  r = await pide("POST", "/api/admin/hazas/juntar", cuerpo);
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "titulares_distintos");
  await bd.dueno.query("UPDATE hazas SET hogar_id = NULL WHERE id = $1", [ids["H-B"]]);
  // una haza suelta, a 10 m de H-A: no son vecinas
  const d = await pide("POST", "/api/admin/hazas", { codigo: "H-D", nombre: "Suelta", finca: "prueba", geometria: rect(0, 110, 40, 140) });
  assert.equal(d.statusCode, 201, d.body);
  r = await pide("POST", "/api/admin/hazas/juntar", { a: ids["H-A"], b: d.json().haza.id, version_a: 3, version_b: 1 });
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "no_vecinas");
  r = await pide("POST", "/api/admin/hazas/juntar", cuerpo);
  assert.equal(r.statusCode, 200, r.body);
  const z = r.json().haza;
  assert.equal(z.superficie_ha, 0.5); assert.equal(z.olivos, 50); assert.equal(z.version, 3); assert.equal(z.hogar_id, ids[ANA], "la familia de la segunda pasa a la primera");
  assert.equal(z.geometria.coordinates.length, 1, "un solo polígono");
  assert.deepEqual(r.json().quitada, { id: ids["H-C"], codigo: "H-C" });
  assert.equal((await bd.dueno.query("SELECT haza_id::int AS h FROM personalizaciones WHERE olivo_id = $1", [olivo])).rows[0]!.h, ids["H-B"]);
  assert.equal((await bd.dueno.query("SELECT 1 FROM hazas WHERE id = $1", [ids["H-C"]])).rowCount, 0);
  // la historia de H-C sigue ahí
  const v = await versiones(ids["H-C"]!);
  assert.deepEqual(v.map(x => x["accion"]), ["juntada_en", "partida_de"]); assert.match(String(v[0]!["nota"]), /juntada en H-B/);
  assert.equal((await bd.dueno.query("SELECT 1 FROM auditoria WHERE accion = 'admin.hazas_juntadas'")).rowCount, 1);
});

test("borrar: con confirmación reciente, sin familia ni nada colgado; la historia queda", async t => {
  if (salta(t)) return;
  let r = await pide("DELETE", "/api/admin/hazas/" + ids["H-B"] + "?version=3");
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "con_titular");
  await bd.dueno.query("UPDATE hazas SET hogar_id = NULL WHERE id = $1", [ids["H-B"]]);
  r = await pide("DELETE", "/api/admin/hazas/" + ids["H-B"] + "?version=3");
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "con_contenido", "tiene un árbol con nombre");
  r = await pide("DELETE", "/api/admin/hazas/" + ids["H-A"] + "?version=2");
  assert.equal(r.statusCode, 409); assert.equal(r.json().error, "version_cambiada");
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() - interval '20 minutes' WHERE hogar_id = $1", [ids[OFI]]);
  assert.equal((await pide("DELETE", "/api/admin/hazas/" + ids["H-A"] + "?version=3")).statusCode, 403);
  await bd.dueno.query("UPDATE sesiones SET confirmada_en = now() WHERE hogar_id = $1", [ids[OFI]]);
  r = await pide("DELETE", "/api/admin/hazas/" + ids["H-A"] + "?version=3");
  assert.equal(r.statusCode, 204, r.body);
  assert.equal((await versiones(ids["H-A"]!))[0]!["accion"], "borrar");
  assert.deepEqual((await pide("GET", "/api/admin/hazas?finca=prueba")).json().hazas.map((z: { codigo: string }) => z.codigo), ["H-B", "H-D"]);
});
