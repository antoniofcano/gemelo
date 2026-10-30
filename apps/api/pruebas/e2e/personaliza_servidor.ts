// Servidor de pruebas para el recorrido de Chrome de la personalización de los árboles (pruebas/guardianes/personalizacion_e2e.test.js, P7f):
// la api REAL contra PostGIS en un contenedor (Testcontainers; NO el entorno de la persona), con la carpeta de fotos (GEMELO_MEDIOS) en una
// carpeta temporal, la página del motor servida en /mundo/ tras la misma guarda que el Caddy (forward_auth a /api/interno/autoriza) y la
// finca del fixture sintético con sus olivos medidos y cuatro hazas (dos por parcela). Dos familias: Ruiz (H-01) y Olid (H-02), más unas gafas
// vinculadas de Ruiz (sesión de aparato, sin titularidad). Va dentro del turno del banco (lo pide quien lo lanza).
// Escribe «LISTO {json}» cuando está en marcha.
//   node pruebas/e2e/personaliza_servidor.ts <carpeta de la página del motor (index.html, indice.json, t/)> <carpeta de la finca del fixture (indice.json)>
// Ayudas (solo aquí, nunca en la api): /__prueba/enlace?para=<correo> · /__prueba/vinculo?para=<correo> (la sesión más nueva de ese hogar pasa a ser la de unas gafas vinculadas)
// · /__prueba/estado (denuncias, bandeja y personalizaciones tal como están en la base) · /__prueba/medios (cuántos ficheros hay en la carpeta de fotos)
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import https from "node:https";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { construyeApp } from "../../src/app.ts";
import { hashToken, nuevoToken } from "../../src/seguridad/cripto.ts";
import { hayDocker, levantaBd } from "../apoyo/bd.ts";
import { LectorVigiaFixture } from "../../src/vigia/lector-fixture.ts";
import { ServicioTiempo } from "../../src/vigia/servicio.ts";
import { configDePrueba, contexto, GRABACIONES } from "../apoyo/contexto.ts";

const pagina = process.argv[2];
const finca = process.argv[3];
if (!pagina || !existsSync(join(pagina, "index.html")) || !finca || !existsSync(join(finca, "indice.json"))) { console.error("uso: personaliza_servidor.ts <página del motor> <finca del fixture>"); process.exit(2); }
if (!hayDocker()) { console.error("SIN_DOCKER"); process.exit(3); }

const CADDYFILE = fileURLToPath(new URL("../../../../infra/Caddyfile", import.meta.url));
const csp = /Content-Security-Policy-Report-Only "([^"]+)"/.exec(readFileSync(CADDYFILE, "utf8"))![1]!.split(";").map(x => x.trim()).filter(x => x && !x.startsWith("report-uri")).join("; ");
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".glb": "model/gltf-binary", ".b3dm": "application/octet-stream", ".bin": "application/octet-stream", ".webmanifest": "application/manifest+json" };

// HTTPS con un certificado de usar y tirar: Chrome no guarda las cookies `__Host-` (Secure) que llegan por http. El navegador de la prueba se abre con ignoreHTTPSErrors.
const carpetaCert = mkdtempSync(join(tmpdir(), "personaliza-cert-"));
try {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
    "-keyout", join(carpetaCert, "k.pem"), "-out", join(carpetaCert, "c.pem")], { stdio: "pipe" });
} catch { console.error("SIN_OPENSSL"); process.exit(4); }
const servidor = https.createServer({ key: readFileSync(join(carpetaCert, "k.pem")), cert: readFileSync(join(carpetaCert, "c.pem")) });
rmSync(carpetaCert, { recursive: true, force: true });
await new Promise<void>(ok => servidor.listen(0, ok));
const url = "https://localhost:" + (servidor.address() as { port: number }).port;

const bd = await levantaBd();
const medios = mkdtempSync(join(tmpdir(), "personaliza-medios-"));
const ctx = contexto(bd.app, configDePrueba({ GEMELO_URL_PUBLICA: url, GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000", GEMELO_OT: "grabado", GEMELO_OT_GRABACIONES: GRABACIONES,
  GEMELO_VIGIA: "fixture", GEMELO_VIGIA_FIXTURE: GRABACIONES + "../vigia", GEMELO_MEDIOS: medios, GEMELO_MEDIOS_SUBIDAS_HORA: "20" }));
ctx.tiempo = new ServicioTiempo(new LectorVigiaFixture(GRABACIONES + "../vigia"));
const app = await construyeApp(ctx);
await app.ready();

// ---------------------------------------------------------------- datos de partida (sintéticos)
const dueno = bd.dueno;
const idDe = async (correo: string) => Number((await dueno.query<{ id: number }>("SELECT id FROM hogares WHERE correo = $1", [correo])).rows[0]!.id);
for (const [correo, interno, haza] of [["ruiz@example.com", "Ruiz Molina", "H-01"], ["olid@example.com", "Olid", "H-02"]] as const) {
  await dueno.query("INSERT INTO hogares (correo, nombre_interno, alias, normas_version, normas_aceptadas_en) VALUES ($1, $2, $3, 1, now())", [correo, interno, interno.split(" ")[0]]);
}
for (const [codigo, nombre] of [["H-01", "La Loma"], ["H-02", "El Pilar"], ["H-03", "Los Almendros"], ["H-04", "La Fuente"]]) {
  await dueno.query("INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $2, 'hituelo', ST_Multi(ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))', 25830)))", [codigo, nombre]);
}
await dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-01'", [await idDe("ruiz@example.com")]);
await dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = 'H-02'", [await idDe("olid@example.com")]);
// la finca del fixture: sus copas como olivos medidos y las hazas sobre sus parcelas, cada parcela en dos (como oficina_servidor.ts)
const d = JSON.parse(readFileSync(join(finca, "indice.json"), "utf8")) as { centro_utm: [number, number]; finca_id: string; copas: number[][]; copas_id: number[]; parcelas: { linde: number[][] }[] };
const [cx, cy] = d.centro_utm;
for (let i = 0; i < d.copas.length; i++) {
  await dueno.query("INSERT INTO olivos (id_estable, geom, fuente) VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 25830), 'lidar')", [d.finca_id + ":" + d.copas_id[i], cx + d.copas[i]![0]!, cy + d.copas[i]![1]!]);
}
let n = 1;
for (const p of d.parcelas) {
  const xs = p.linde.map(q => q[0]!), ys = p.linde.map(q => q[1]!), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), xm = (x0 + x1) / 2;
  for (const [a, b] of [[x0, xm], [xm, x1]] as const) {
    const wkt = "POLYGON((" + ([[a, y0], [b, y0], [b, y1], [a, y1], [a, y0]] as [number, number][]).map(([x, y]) => (cx + x) + " " + (cy + y)).join(",") + "))";
    await dueno.query("UPDATE hazas SET geom = ST_Multi(ST_GeomFromText($1, 25830)), finca = $2 WHERE codigo = $3", [wkt, d.finca_id, "H-0" + n++]);
  }
}

// ---------------------------------------------------------------- servidor: api, el mundo guardado y ayudas
const json = (res: import("node:http").ServerResponse, codigo: number, cuerpo: unknown) => { res.writeHead(codigo, { "content-type": "application/json" }); res.end(JSON.stringify(cuerpo)); };
servidor.on("request", (req, res) => {
  const [ruta = "/", consulta = ""] = (req.url ?? "/").split("?");
  const q = new URLSearchParams(consulta);
  if (ruta.startsWith("/api/")) {
    req.headers["x-forwarded-proto"] = "https"; req.headers["x-forwarded-for"] = "203.0.113.9";   // lo que pone el Caddy delante de la api
    app.routing(req, res);
    return;
  }
  void (async () => {
    if (ruta === "/__prueba/enlace") {
      const para = q.get("para") ?? "";
      await app.inject({ method: "POST", url: "/api/auth/enlace", headers: { origin: url, "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.10" }, payload: { correo: para } });
      await new Promise(r => setImmediate(r));
      const t = /entrar\?t=([A-Za-z0-9_-]{43})/.exec(ctx.cartero.ultimoPara(para)?.texto ?? "")?.[1];
      return t ? json(res, 200, { url: url + "/api/auth/entrar?t=" + t }) : json(res, 404, { error: "sin_correo" });
    }
    if (ruta === "/__prueba/vinculo") {   // la sesión MÁS NUEVA de ese hogar pasa a ser la de un aparato vinculado (unas gafas): origen «vinculo», sin titularidad (decisión 96)
      await dueno.query("UPDATE sesiones SET origen = 'vinculo' WHERE id = (SELECT max(id) FROM sesiones WHERE hogar_id = $1)", [await idDe(q.get("para") ?? "")]);
      return json(res, 200, { ok: true });
    }
    if (ruta === "/__prueba/estado") {
      const pe = (await dueno.query("SELECT p.id, p.nombre, p.estado, p.objeto_tipo, p.medio_id IS NOT NULL AS con_medio, o.id_estable, h.codigo FROM personalizaciones p JOIN olivos o ON o.id = p.olivo_id JOIN hazas h ON h.id = p.haza_id ORDER BY p.id")).rows;
      const de = (await dueno.query("SELECT d.motivo, d.texto, d.personalizacion_id, g.correo FROM denuncias d JOIN hogares g ON g.id = d.hogar_id ORDER BY d.id")).rows;
      const ba = (await dueno.query("SELECT tipo, estado, texto FROM bandeja ORDER BY id")).rows;
      const me = (await dueno.query("SELECT tipo_mime, ancho, alto, bytes, aviso_version, aviso_aceptado_en IS NOT NULL AS acepto FROM medios ORDER BY id")).rows;
      return json(res, 200, { personalizaciones: pe, denuncias: de, bandeja: ba, medios: me });
    }
    if (ruta === "/__prueba/ficheros") return json(res, 200, { n: readdirSync(medios).length });
    if (ruta === "/mundo" || ruta === "/mundo/") { res.writeHead(301, { location: "/mundo/index.html" + (consulta ? "?" + consulta : "") }); return void res.end(); }
    if (ruta.startsWith("/mundo/")) {
      // la guarda del Caddy para /finca y /teselas: cualquier sesión válida
      const g = await app.inject({ method: "GET", url: "/api/interno/autoriza", headers: { cookie: req.headers.cookie ?? "" } });
      if (g.statusCode !== 204) { res.writeHead(g.statusCode); return void res.end(); }
      const rel = normalize(ruta.slice("/mundo/".length));
      const f = join(pagina, rel);
      if (rel.startsWith("..") || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return void res.end(); }
      res.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream", "content-security-policy": csp, "cache-control": "no-store" });
      return void res.end(readFileSync(f));
    }
    res.writeHead(404); res.end();
  })().catch(e => { console.error(e); res.writeHead(500); res.end(); });
});

console.log("LISTO " + JSON.stringify({ url, centro: d.centro_utm, finca: d.finca_id }));
const cierra = async () => { try { await app.close(); await bd.cierra(); } finally { rmSync(medios, { recursive: true, force: true }); process.exit(0); } };
process.on("SIGTERM", () => void cierra());
process.on("SIGINT", () => void cierra());
process.stdin.on("end", () => void cierra());
process.stdin.resume();
