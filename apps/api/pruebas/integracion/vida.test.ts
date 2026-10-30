// Integración de la vida de las hazas (migración 0004) contra PostGIS en un contenedor (la misma imagen que producción):
// ids de olivo congelados, permisos (titular sí, otro hogar no, aparato vinculado no, la oficina retira), denuncia →
// bandeja, subida que rechaza tipos y quita EXIF/GPS, lista blanca de lo que ve un hogar ajeno y RGPD. Datos SINTÉTICOS
// (correos @example.com, olivos «hituelo:9000xx» inventados dentro de las hazas de tuberia/hazas/ejemplo). Sin Docker se
// SALTA con aviso.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import sharp from "sharp";
import { construyeApp } from "../../src/app.ts";
import { purgaMedios } from "../../src/vida/medios.ts";
import { jpegConExif, tieneGps } from "../apoyo/imagenes.ts";
import { type BdDePrueba, hayDocker, levantaBd, sqlDeEjemplo } from "../apoyo/bd.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { validadorOlivosHaza } from "../apoyo/esquemas.ts";

const SALTO = hayDocker() ? null : "Docker no disponible: la integración de la vida con PostGIS NO se ha comprobado";
let bd: BdDePrueba, app: FastifyInstance, ctx: ReturnType<typeof contexto>, carpeta: string;
const ids: Record<string, number> = {};
const valida = validadorOlivosHaza();
let ipN = 0;
const ADMIN = "oficina@example.com", ANA = "ana@example.com", LUIS = "luis@example.com";

before(async () => {
  if (SALTO) return;
  bd = await levantaBd();
  await bd.dueno.query(sqlDeEjemplo());
  for (const [c, rol] of [[ADMIN, "admin"], [ANA, "hogar"], [LUIS, "hogar"]] as const) {
    ids[c] = (await bd.dueno.query<{ id: number }>("INSERT INTO hogares (correo, rol) VALUES ($1, $2) RETURNING id", [c, rol])).rows[0]!.id;
  }
  for (const r of (await bd.dueno.query<{ id: number; codigo: string }>("SELECT id, codigo FROM hazas")).rows) ids[r.codigo] = r.id;
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-S01'", [ids[ANA]]);
  await bd.dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-S02'", [ids[LUIS]]);
  // olivos con id «finca:copas_id» (como los carga tuberia/hazas desde el índice): dos en H-S01 (Ana), uno en H-S02 (Luis)
  await bd.dueno.query(`INSERT INTO olivos (id_estable, geom, fuente) VALUES
    ('hituelo:900001', ST_SetSRID(ST_MakePoint(500050, 4100050), 25830), 'lidar'),
    ('hituelo:900002', ST_SetSRID(ST_MakePoint(500050, 4100060), 25830), 'lidar'),
    ('hituelo:900003', ST_SetSRID(ST_MakePoint(500150, 4100050), 25830), 'lidar')`);
  carpeta = mkdtempSync(join(tmpdir(), "gemelo-medios-"));
  ctx = contexto(bd.app, configDePrueba({ GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_MEDIOS: carpeta, GEMELO_MEDIOS_SUBIDAS_HORA: "10" }));
  app = await construyeApp(ctx);
  await app.ready();
}, { timeout: 240_000 });

after(async () => {
  if (SALTO) return;
  await app.close(); await bd.cierra();
  rmSync(carpeta, { recursive: true, force: true });
});

// ---------------------------------------------------------------- ayudas
const ip = () => "198.51.100." + (++ipN % 250);
const cookieDe = (r: LightMyRequestResponse) => /^__Host-gemelo=([^;]+)/.exec(([] as string[]).concat(r.headers["set-cookie"] ?? []).find(c => c.startsWith("__Host-gemelo=")) ?? "")?.[1] ?? null;
async function entra(correo: string): Promise<string> {
  await app.inject({ method: "POST", url: "/api/auth/enlace", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { correo } });
  await new Promise(r => setImmediate(r));
  const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(correo)?.texto ?? "")![1]!;
  const r = await app.inject({ method: "POST", url: "/api/auth/entrar", headers: deLaWeb({ "content-type": "application/json", "x-forwarded-for": ip() }), payload: { t } });
  assert.equal(r.statusCode, 200, r.body);
  // la cuenta de oficina entra desde un aparato nuevo (pendiente, ADR-0024): se aprueba desde la consola, como el arranque del RUNBOOK
  if (correo === ADMIN) await bd.dueno.query("UPDATE aparatos_oficina SET aprobado_en = now(), aprobado_como = 'consola' WHERE aprobado_en IS NULL AND hogar_id = $1", [ids[ADMIN]]);
  return cookieDe(r)!;
}
/** Una sesión de aparato vinculado (las gafas), aprobada desde la sesión del titular. */
async function gafas(titular: string): Promise<string> {
  const p = (await app.inject({ method: "POST", url: "/api/auth/vincula", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: {} })).json();
  const d = await app.inject({ method: "POST", url: "/api/yo/dispositivos/vincular", headers: deLaWeb({ cookie: "__Host-gemelo=" + titular, "x-forwarded-for": ip() }), payload: { codigo: p.codigo, aprobar: true } });
  assert.equal(d.statusCode, 204);
  const s = await app.inject({ method: "POST", url: "/api/auth/vincula/sondeo", headers: deLaWeb({ "x-forwarded-for": ip() }), payload: { sondeo: p.sondeo } });
  return cookieDe(s)!;
}
const con = (method: "GET" | "POST" | "PUT" | "DELETE", url: string, cookie: string, payload?: object) =>
  app.inject({ method, url, headers: deLaWeb({ cookie: "__Host-gemelo=" + cookie, "x-forwarded-for": ip() }), ...(payload ? { payload } : {}) });
const sube = (cookie: string, datos: Buffer, tipo: string, acepto = "true") =>
  app.inject({ method: "POST", url: "/api/medios?acepto=" + acepto, headers: deLaWeb({ cookie: "__Host-gemelo=" + cookie, "content-type": tipo, "x-forwarded-for": ip() }), payload: datos });
const salta = (t: { skip: (m: string) => void }) => { if (SALTO) { t.skip(SALTO); return true; } return false; };

// ---------------------------------------------------------------- migración
test("0004: tablas nuevas, ids de olivo derivados y congelados, sesiones con origen", async t => {
  if (salta(t)) return;
  const tablas = (await bd.dueno.query<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'")).rows.map(r => r.t);
  for (const n of ["medios", "personalizaciones", "denuncias", "bandeja", "diario_haza", "avisos", "avisos_hogar", "lotes", "lote_haza", "lote_hogar"]) assert.ok(tablas.includes(n), n);
  const o = (await bd.dueno.query("SELECT finca, copas_id FROM olivos WHERE id_estable = 'hituelo:900001'")).rows[0];
  assert.deepEqual(o, { finca: "hituelo", copas_id: 900001 });
  assert.equal((await bd.dueno.query("SELECT copas_id FROM olivos WHERE id_estable = 'sint-001'")).rows[0].copas_id, null, "un id sin forma finca:n no inventa copas_id");
  await assert.rejects(bd.dueno.query("UPDATE olivos SET copas_id = 1 WHERE id_estable = 'hituelo:900001'"), /congelado/);
  await assert.rejects(bd.dueno.query("UPDATE olivos SET id_estable = 'hituelo:1' WHERE id_estable = 'hituelo:900001'"), /congelado/);
  await bd.dueno.query("UPDATE olivos SET geom = ST_SetSRID(ST_MakePoint(500051, 4100050), 25830), visto_en_vuelo = 'pnoa-2024' WHERE id_estable = 'hituelo:900001'");
  await bd.dueno.query(sqlDeEjemplo());   // recargar las hazas de ejemplo sigue siendo idempotente con el disparador
  await bd.dueno.query("INSERT INTO olivos (id_estable, geom, fuente) VALUES ('otra:900001', ST_SetSRID(ST_MakePoint(1, 1), 25830), 'lidar')");
  await assert.rejects(bd.dueno.query("INSERT INTO olivos (id_estable, geom, fuente) VALUES ('otra:0900001', ST_SetSRID(ST_MakePoint(1, 1), 25830), 'lidar')"), /duplicate|duplicad/, "(finca, copas_id) es único");
  const v = (await bd.dueno.query("SELECT conname FROM pg_constraint WHERE conname = 'visitas_tipo_check'")).rowCount;
  assert.equal(v, 1);
});

// ---------------------------------------------------------------- subir
test("subida: rechaza tipos y formatos cambiados, exige el aviso, quita EXIF y GPS y reduce a 1600 px", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  assert.equal((await sube(ana, gif, "image/gif")).statusCode, 415, "GIF: tipo no admitido");
  const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#808080" } }).png().toBuffer();
  assert.equal((await sube(ana, png, "image/jpeg")).statusCode, 415, "un PNG que dice ser JPEG");
  assert.equal((await sube(ana, Buffer.from("esto no es una imagen"), "image/jpeg")).statusCode, 415);
  const jpg = await jpegConExif();
  assert.ok(tieneGps((await sharp(jpg).metadata()).exif), "la entrada sí lleva EXIF con GPS");
  assert.ok(jpg.includes(Buffer.from("Persona Secreta")));
  assert.equal((await sube(ana, jpg, "image/jpeg", "false")).statusCode, 400, "sin aceptar el aviso");
  assert.equal((await app.inject({ method: "POST", url: "/api/medios", headers: deLaWeb({ cookie: "__Host-gemelo=" + ana, "content-type": "image/jpeg" }), payload: jpg })).statusCode, 400, "sin el campo de aceptación");
  const r = await sube(ana, jpg, "image/jpeg");
  assert.equal(r.statusCode, 201, r.body);
  const { id, url, ancho, alto } = r.json();
  assert.match(url, /^\/api\/medios\/[a-f0-9]{32}\.webp$/);
  assert.deepEqual([ancho, alto], [800, 1600], "enderezada por la orientación EXIF (6 = 90°) y reducida a 1600 px");
  const fichero = readdirSync(carpeta).find(f => url.endsWith(f))!;
  const guardado = (await app.inject({ method: "GET", url, headers: deLaWeb({ cookie: "__Host-gemelo=" + ana }) }));
  assert.equal(guardado.statusCode, 200);
  assert.equal(guardado.headers["content-type"], "image/webp");
  const datos = guardado.rawPayload;
  const m = await sharp(datos).metadata();
  assert.equal(m.format, "webp");
  assert.equal(m.exif, undefined, "sin EXIF");
  assert.equal(m.xmp, undefined, "sin XMP");
  assert.ok(!datos.includes(Buffer.from("Persona Secreta")), "ni el autor en el fichero");
  assert.ok(fichero);
  const fila = (await bd.dueno.query("SELECT hogar_id, sesion_id, aviso_version, aviso_aceptado_en IS NOT NULL AS acepto FROM medios WHERE id = $1", [id])).rows[0];
  assert.equal(Number(fila.hogar_id), ids[ANA]);
  assert.ok(fila.sesion_id, "queda desde qué sesión se subió");
  assert.deepEqual([fila.aviso_version, fila.acepto], [1, true]);
  // otro hogar no ve un fichero que no está colgado
  const luis = await entra(LUIS);
  assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb({ cookie: "__Host-gemelo=" + luis }) })).statusCode, 404);
  ids["medio_ana"] = id;
});

test("subida: solo el titular (no las gafas vinculadas ni sin sesión), y con límite por hogar", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const quest = await gafas(ana);
  assert.equal((await app.inject({ method: "GET", url: "/api/sesion", headers: deLaWeb({ cookie: "__Host-gemelo=" + quest }) })).json().titular, false);
  assert.equal((await app.inject({ method: "GET", url: "/api/sesion", headers: deLaWeb({ cookie: "__Host-gemelo=" + ana }) })).json().titular, true);
  const png = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#406020" } }).png().toBuffer();
  const g = await sube(quest, png, "image/png");
  assert.equal(g.statusCode, 403); assert.equal(g.json().error, "solo_titular");
  assert.equal((await app.inject({ method: "POST", url: "/api/medios?acepto=true", headers: deLaWeb({ "content-type": "image/png" }), payload: png })).statusCode, 401);
  // GEMELO_MEDIOS_SUBIDAS_HORA = 10, y cuenta todo intento que llega al proceso (también los rechazados por tipo): la prueba
  // anterior gastó 3 (PNG disfrazado, texto y la buena; el GIF y las de forma mala no llegan al proceso), así que quedan 7
  const rs = [];
  for (let i = 0; i < 8; i++) rs.push((await sube(ana, png, "image/png")).statusCode);
  assert.deepEqual(rs, [201, 201, 201, 201, 201, 201, 201, 429]);
});

// ---------------------------------------------------------------- personalizar: permisos
test("personalizar: el titular en SU haza sí; otro hogar no; las gafas no; nombre filtrado; foto ajena no", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS), quest = await gafas(ana);
  const objeto = { tipo: "foto", medio_id: ids["medio_ana"] };
  const ok = await con("PUT", "/api/olivos/hituelo/900001", ana, { nombre: "  El   abuelo ", objeto });
  assert.equal(ok.statusCode, 200, ok.body);
  ids["p1"] = ok.json().id;
  assert.equal((await con("PUT", "/api/olivos/hituelo/900002", ana, { nombre: "La niña", objeto: null })).statusCode, 200);
  const ajena = await con("PUT", "/api/olivos/hituelo/900001", luis, { nombre: "Mío", objeto: null });
  assert.equal(ajena.statusCode, 403); assert.equal(ajena.json().error, "no_es_tu_haza");
  assert.equal((await con("PUT", "/api/olivos/hituelo/900003", ana, { nombre: "Del vecino", objeto: null })).json().error, "no_es_tu_haza");
  const g = await con("PUT", "/api/olivos/hituelo/900001", quest, { nombre: "Desde las gafas", objeto: null });
  assert.equal(g.statusCode, 403); assert.equal(g.json().error, "solo_titular");
  assert.equal((await con("PUT", "/api/olivos/hituelo/999999", ana, { nombre: "Nadie", objeto: null })).statusCode, 404);
  for (const nombre of ["www.ejemplo.com", "llama al 600 123 456", "puta", "<script>"]) {
    const r = await con("PUT", "/api/olivos/hituelo/900002", ana, { nombre, objeto: null });
    assert.equal(r.statusCode, 400, nombre); assert.equal(r.json().error, "nombre_no_valido");
  }
  // Luis no puede colgar en SU olivo la foto de Ana
  assert.equal((await con("PUT", "/api/olivos/hituelo/900003", luis, { nombre: null, objeto })).json().error, "medio_no_valido");
  const fila = (await bd.dueno.query("SELECT nombre, objeto_tipo, hogar_id, sesion_id FROM personalizaciones WHERE id = $1", [ids["p1"]])).rows[0];
  assert.equal(fila.nombre, "El abuelo"); assert.equal(fila.objeto_tipo, "foto"); assert.equal(Number(fila.hogar_id), ids[ANA]); assert.ok(fila.sesion_id);
  const aud = (await bd.dueno.query("SELECT detalle FROM auditoria WHERE accion = 'vida.personalizacion' AND hogar_id = $1 ORDER BY id", [ids[ANA]])).rows.map(r => r.detalle.personalizacion);
  assert.ok(aud.includes(ids["p1"]), "queda en la auditoría");
});

test("ver: un hogar ajeno ve la lista blanca (sin quién ni cuándo) y la foto colgada", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS);
  const r = await con("GET", "/api/hazas/" + ids["H-S01"] + "/olivos", luis);
  assert.equal(r.statusCode, 200);
  const cuerpo = r.json();
  assert.ok(valida(cuerpo), JSON.stringify(valida.errors));
  assert.equal(cuerpo.es_mia, false);
  assert.deepEqual(cuerpo.olivos.map((o: { copas_id: number; nombre: string }) => [o.copas_id, o.nombre]), [[900001, "El abuelo"], [900002, "La niña"]]);
  for (const o of cuerpo.olivos) assert.deepEqual(Object.keys(o).sort(), ["copas_id", "finca", "id", "nombre", "objeto"], "ni hogar, ni sesión, ni fechas");
  assert.ok(!JSON.stringify(cuerpo).includes("example.com"));
  const foto = cuerpo.olivos[0].objeto;
  assert.equal(foto.tipo, "foto");
  assert.equal((await con("GET", foto.url, luis)).statusCode, 200, "colgada y visible: la ve cualquier hogar con sesión");
  assert.equal((await app.inject({ method: "GET", url: foto.url, headers: deLaWeb() })).statusCode, 401, "sin sesión, nada");
  assert.equal((await con("GET", "/api/hazas/" + ids["H-S01"] + "/olivos", await entra(ANA))).json().es_mia, true);
});

// ---------------------------------------------------------------- denuncia → bandeja → retirar
test("denuncia → bandeja; la oficina retira en un clic: deja de verse y de servirse, aviso al hogar y auditoría", async t => {
  if (salta(t)) return;
  const luis = await entra(LUIS), admin = await entra(ADMIN), ana = await entra(ANA);
  const d = await con("POST", "/api/personalizaciones/" + ids["p1"] + "/denuncias", luis, { motivo: "datos_personales", texto: "Se lee una matrícula" });
  assert.equal(d.statusCode, 201, d.body);
  assert.equal((await con("POST", "/api/personalizaciones/" + ids["p1"] + "/denuncias", luis, { motivo: "otro" })).statusCode, 409, "una por hogar");
  assert.equal((await con("POST", "/api/personalizaciones/" + ids["p1"] + "/denuncias", luis, { motivo: "spam" })).statusCode, 400);
  // la bandeja: solo la oficina
  assert.equal((await con("GET", "/api/admin/bandeja", luis)).statusCode, 403);
  const b = (await con("GET", "/api/admin/bandeja?estado=nueva", admin)).json().bandeja as { id: number; tipo: string; contenido: { id: number; denuncias_abiertas: number } | null; denuncia_motivo: string | null }[];
  const den = b.find(x => x.tipo === "denuncia")!;
  assert.equal(den.denuncia_motivo, "datos_personales");
  assert.equal(den.contenido!.id, ids["p1"]); assert.equal(den.contenido!.denuncias_abiertas, 1);
  assert.ok(b.some(x => x.tipo === "contenido_nuevo" && x.contenido?.id === ids["p1"]), "lo colgado entró como contenido nuevo");
  // solo la oficina retira
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + ids["p1"] + "/retirar", luis, { motivo: "x" })).statusCode, 403);
  const url = (await con("GET", "/api/hazas/" + ids["H-S01"] + "/olivos", luis)).json().olivos[0].objeto.url;
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + ids["p1"] + "/retirar", admin, { motivo: "Datos personales en la foto" })).statusCode, 204);
  assert.equal((await con("POST", "/api/admin/personalizaciones/" + ids["p1"] + "/retirar", admin, { motivo: "otra vez" })).statusCode, 404);
  const ahora = (await con("GET", "/api/hazas/" + ids["H-S01"] + "/olivos", luis)).json();
  assert.deepEqual(ahora.olivos.map((o: { copas_id: number }) => o.copas_id), [900002], "ya no se ve");
  assert.equal((await con("GET", url, luis)).statusCode, 404, "ni se sirve");
  assert.equal((await con("GET", url, admin)).statusCode, 200, "la oficina aún la ve (hasta la purga)");
  const den2 = (await bd.dueno.query("SELECT resolucion FROM denuncias WHERE id = $1", [d.json().id])).rows[0];
  assert.equal(den2.resolucion, "retirado");
  const aviso = (await bd.dueno.query("SELECT a.titulo FROM avisos_hogar ah JOIN avisos a ON a.id = ah.aviso_id WHERE ah.hogar_id = $1", [ids[ANA]])).rows;
  assert.equal(aviso.length, 1);
  const aud = (await bd.dueno.query("SELECT hogar_id, detalle FROM auditoria WHERE accion = 'admin.contenido_retirado'")).rows[0];
  assert.equal(Number(aud.hogar_id), ids[ADMIN]); assert.equal(aud.detalle.personalizacion, ids["p1"]);
  // pasar a OlivarTrack exige el id de la propuesta
  assert.equal((await con("POST", "/api/admin/bandeja/" + den.id + "/estado", admin, { estado: "pasada_ot" })).statusCode, 400);
  assert.equal((await con("POST", "/api/admin/bandeja/" + den.id + "/estado", admin, { estado: "pasada_ot", ot_propuesta_id: "prop-sint-1" })).statusCode, 204);
  assert.equal((await bd.dueno.query("SELECT estado, ot_propuesta_id FROM bandeja WHERE id = $1", [den.id])).rows[0].ot_propuesta_id, "prop-sint-1");
  // el titular puede volver a colgar algo en ese olivo (la retirada queda como registro)
  assert.equal((await con("PUT", "/api/olivos/hituelo/900001", ana, { nombre: "El abuelo", objeto: null })).statusCode, 200);
});

test("sugerencia del titular sobre su haza → bandeja; de otro hogar o de las gafas, no", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA), luis = await entra(LUIS);
  assert.equal((await con("POST", "/api/hazas/" + ids["H-S01"] + "/sugerencias", ana, { texto: "Este olivo tiene una rama rota", finca: "hituelo", copas_id: 900002 })).statusCode, 201);
  assert.equal((await con("POST", "/api/hazas/" + ids["H-S01"] + "/sugerencias", ana, { texto: "Fuera", finca: "hituelo", copas_id: 900003 })).statusCode, 400, "olivo de otra haza");
  assert.equal((await con("POST", "/api/hazas/" + ids["H-S01"] + "/sugerencias", luis, { texto: "No es mía" })).statusCode, 403);
  assert.equal((await con("POST", "/api/hazas/" + ids["H-S01"] + "/sugerencias", await gafas(ana), { texto: "Desde las gafas" })).statusCode, 403);
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM bandeja WHERE tipo = 'sugerencia'")).rows[0].n, 1);
});

// ---------------------------------------------------------------- RGPD y purga
test("RGPD: mis datos incluyen la vida; borrar el hogar se lleva filas y ficheros; la purga limpia lo suelto", async t => {
  if (salta(t)) return;
  const ana = await entra(ANA);
  const datos = (await con("GET", "/api/yo/datos", ana)).json();
  assert.ok(datos.olivos_personalizados.length >= 2 && datos.fotos_subidas.length >= 1 && datos.sugerencias.length === 1 && datos.avisos.length === 1);
  const ficherosAna = (await bd.dueno.query<{ clave: string }>("SELECT clave FROM medios WHERE hogar_id = $1", [ids[ANA]])).rows.map(r => r.clave);
  assert.ok(ficherosAna.length >= 2);
  assert.equal((await con("DELETE", "/api/yo", ana)).statusCode, 204);
  for (const c of ficherosAna) assert.ok(!existsSync(join(carpeta, c)), "fichero borrado con el hogar: " + c);
  for (const tabla of ["medios", "personalizaciones"]) {
    assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM " + tabla + " WHERE hogar_id = $1", [ids[ANA]])).rows[0].n, 0, tabla);
  }
  assert.equal((await bd.dueno.query("SELECT count(*)::int AS n FROM denuncias")).rows[0].n, 0, "las denuncias sobre lo suyo se van con ello");
  assert.ok((await bd.dueno.query("SELECT count(*)::int AS n FROM bandeja")).rows[0].n >= 1, "la bandeja queda, sin el contenido");
  assert.equal(await purgaMedios(bd.app, carpeta, 30), 0);
});
