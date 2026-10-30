// La vida de las hazas sin base de datos: el filtro del nombre, la re-codificación de imágenes (tipos, EXIF/GPS, tamaño),
// la lista blanca contra su contrato y su ejemplo sintético, y lo que se decide antes de tocar la base (Origin, sesión,
// forma). Lo que necesita PostGIS está en pruebas/integracion/vida.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import type { FastifyInstance } from "fastify";
import pg from "pg";
import sharp from "sharp";
import { construyeApp } from "../../src/app.ts";
import { revisaNombre, revisaTexto } from "../../src/vida/filtro.ts";
import { ImagenNoValida, LADO_MAX, procesaImagen } from "../../src/vida/medios.ts";
import { olivoPublico } from "../../src/vida/rutas.ts";
import { configDePrueba, contexto, deLaWeb } from "../apoyo/contexto.ts";
import { CONTRATOS, validadorOlivosHaza } from "../apoyo/esquemas.ts";
import { jpegConExif, tieneGps } from "../apoyo/imagenes.ts";

let app: FastifyInstance;
const bd = new pg.Pool({ host: "127.0.0.1", port: 1, user: "nadie", database: "nada", connectionTimeoutMillis: 300 });
before(async () => { app = await construyeApp(contexto(bd, configDePrueba({ GEMELO_MEDIOS: "/no/existe" }))); await app.ready(); });
after(async () => { await app.close(); await bd.end(); });

const motivo = async (p: Promise<unknown>) => { try { await p; return null; } catch (e) { return e instanceof ImagenNoValida ? e.motivo : "otro"; } };

test("nombre: vale lo normal; fuera enlaces, teléfonos, correos, caracteres raros y palabras gruesas (también con tildes o mayúsculas)", () => {
  for (const n of ["El abuelo", "La niña", "Olivo de Lucía (2026)", "¡Viva el aceite!", "Picual nº 3"]) assert.equal(revisaNombre(n), null, n);
  assert.equal(revisaNombre("www.algo.com"), "enlace");
  assert.equal(revisaNombre("visita ejemplo.es"), "enlace");
  assert.equal(revisaNombre("600 12 34 56"), "numero");
  assert.equal(revisaNombre("<b>hola</b>"), "caracteres");
  assert.equal(revisaNombre("ana@example.com"), "caracteres");
  assert.equal(revisaNombre("Qué MIERDA"), "palabra");
  assert.equal(revisaNombre("Cabrón"), "palabra");
  assert.equal(revisaNombre("Escabroso"), null, "palabra entera, no trozos");
  assert.equal(revisaTexto("mira https://x.y"), "enlace");
  assert.equal(revisaTexto("Rama rota en el olivo del linde"), null);
});

test("imagen: solo JPEG, PNG y WebP de verdad (por el contenido, no por la cabecera)", async () => {
  const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#406020" } }).png().toBuffer();
  const webp = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#406020" } }).webp().toBuffer();
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  assert.equal(await motivo(procesaImagen(png, "image/png")), null);
  assert.equal(await motivo(procesaImagen(webp, "image/webp")), null);
  assert.equal(await motivo(procesaImagen(gif, "image/gif")), "tipo_no_admitido");
  assert.equal(await motivo(procesaImagen(gif, "image/jpeg")), "tipo_no_admitido", "un GIF que dice ser JPEG");
  assert.equal(await motivo(procesaImagen(png, "image/jpeg")), "tipo_no_admitido", "un PNG que dice ser JPEG");
  assert.equal(await motivo(procesaImagen(svg, "image/png")), "tipo_no_admitido", "SVG, nunca");
  assert.equal(await motivo(procesaImagen(Buffer.from("hola"), "image/png")), "no_es_imagen");
  assert.equal(await motivo(procesaImagen(png.subarray(0, 40), "image/png")), "no_es_imagen", "truncada");
});

test("imagen: se endereza por el EXIF, se reduce a 1600 px y sale WebP SIN EXIF, GPS, XMP ni ICC", async () => {
  const jpg = await jpegConExif();
  const ent = await sharp(jpg).metadata();
  assert.equal(ent.orientation, 6);
  assert.ok(tieneGps(ent.exif), "la entrada lleva GPS");
  assert.ok(jpg.includes(Buffer.from("Persona Secreta")));
  const r = await procesaImagen(jpg, "image/jpeg");
  assert.deepEqual([r.ancho, r.alto], [800, LADO_MAX]);
  const sal = await sharp(r.datos).metadata();
  assert.equal(sal.format, "webp");
  assert.equal(sal.exif, undefined); assert.equal(sal.xmp, undefined); assert.equal(sal.icc, undefined);
  assert.equal(sal.orientation, undefined, "ya enderezada: no hace falta orientación");
  assert.ok(!r.datos.includes(Buffer.from("Persona Secreta")));
  assert.equal(r.sha256.length, 32);
  const pequena = await procesaImagen(await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } }).jpeg().toBuffer(), "image/jpeg");
  assert.deepEqual([pequena.ancho, pequena.alto], [300, 200], "no se agranda");
});

test("imagen: una «bomba» de píxeles se rechaza antes de descomprimirla", async () => {
  const enorme = await sharp({ create: { width: 10000, height: 5000, channels: 3, background: "#000" } }).png({ compressionLevel: 9, palette: true, colours: 2 }).toBuffer();
  assert.equal(await motivo(procesaImagen(enorme, "image/png")), "demasiado_grande");
});

test("lista blanca: el ejemplo del contrato valida; olivoPublico no deja pasar nada más; el contrato rechaza quién lo subió", () => {
  const valida = validadorOlivosHaza();
  const ejemplo = JSON.parse(readFileSync(CONTRATOS + "olivos-haza-ejemplo.json", "utf8"));
  assert.ok(valida(ejemplo), JSON.stringify(valida.errors));
  const fila = { id: 3, finca: "hituelo", copas_id: 12, nombre: "X", objeto_tipo: "foto" as const, clave: "a".repeat(32) + ".webp", ancho: 10, alto: 20, hogar_id: 99, sesion_id: 5, creada_en: new Date() };
  const pub = olivoPublico(fila);
  assert.deepEqual(Object.keys(pub).sort(), ["copas_id", "finca", "id", "nombre", "objeto"]);
  assert.deepEqual(pub.objeto, { tipo: "foto", url: "/api/medios/" + "a".repeat(32) + ".webp", ancho: 10, alto: 20 });
  assert.ok(valida({ haza_id: 1, es_mia: true, olivos: [pub] }));
  assert.ok(!valida({ haza_id: 1, es_mia: true, olivos: [{ ...pub, hogar_id: 99 }] }), "un campo de más no cabe en el contrato");
  assert.ok(!valida({ haza_id: 1, es_mia: true, olivos: [{ ...pub, objeto: { ...pub.objeto, url: "https://otro.example/x.webp" } }] }), "solo URLs de la propia api");
});

test("rutas de la vida: sin Origin 403; sin sesión 401; forma mala 400 (sin tocar la base)", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
  const sinOrigen = await app.inject({ method: "POST", url: "/api/medios?acepto=true", headers: { "x-forwarded-proto": "https", "content-type": "image/png" }, payload: png });
  assert.equal(sinOrigen.statusCode, 403);
  for (const [method, url, payload] of [
    ["PUT", "/api/olivos/hituelo/1", { nombre: "A", objeto: null }],
    ["DELETE", "/api/olivos/hituelo/1", undefined],
    ["POST", "/api/personalizaciones/1/denuncias", { motivo: "otro" }],
    ["POST", "/api/hazas/1/sugerencias", { texto: "hola" }],
    ["POST", "/api/admin/bandeja/1/estado", { estado: "vista" }],
    ["POST", "/api/admin/personalizaciones/1/retirar", { motivo: "x" }],
  ] as const) {
    const r = await app.inject({ method, url, headers: deLaWeb(), ...(payload ? { payload } : {}) });
    assert.equal(r.statusCode, 401, method + " " + url);
  }
  for (const url of ["/api/hazas/1/olivos", "/api/medios/" + "a".repeat(32) + ".webp", "/api/admin/bandeja"]) assert.equal((await app.inject({ method: "GET", url, headers: deLaWeb() })).statusCode, 401, url);
  assert.equal((await app.inject({ method: "POST", url: "/api/medios?acepto=true", headers: deLaWeb({ "content-type": "image/png" }), payload: png })).statusCode, 401, "subir sin sesión: 401 antes de leer el cuerpo");
  assert.equal((await app.inject({ method: "PUT", url: "/api/olivos/hituelo/1", headers: deLaWeb(), payload: { nombre: "A", objeto: null, hogar_id: 3 } })).statusCode, 400, "campo de más");
  assert.equal((await app.inject({ method: "PUT", url: "/api/olivos/hituelo/1", headers: deLaWeb(), payload: {} })).statusCode, 400, "al menos nombre u objeto");
  assert.notEqual((await app.inject({ method: "PUT", url: "/api/olivos/hituelo/1", headers: deLaWeb(), payload: { nombre: "Solo nombre" } })).statusCode, 400, "solo el nombre vale (P7f): el objeto se queda como estaba");
  assert.equal((await app.inject({ method: "PUT", url: "/api/olivos/HITUELO/1", headers: deLaWeb(), payload: { nombre: "A", objeto: null } })).statusCode, 400, "finca con mayúsculas");
  assert.equal((await app.inject({ method: "PUT", url: "/api/olivos/hituelo/4294967296", headers: deLaWeb(), payload: { nombre: "A", objeto: null } })).statusCode, 400, "copas_id fuera de rango");
  assert.equal((await app.inject({ method: "POST", url: "/api/personalizaciones/1/denuncias", headers: deLaWeb(), payload: { motivo: "porque sí" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "GET", url: "/api/medios/../../etc/passwd", headers: deLaWeb() })).statusCode, 404);
});
