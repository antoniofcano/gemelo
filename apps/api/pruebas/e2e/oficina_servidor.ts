// Servidor de pruebas para el recorrido de Chrome de la oficina (pruebas/guardianes/oficina_familias.test.js): la api REAL contra
// PostGIS en un contenedor (Testcontainers), el build de la oficina servido en /oficina/ detrás de la misma guarda que el Caddy
// (forward_auth a /api/interno/autoriza?para=oficina) y con la CSP de infra/Caddyfile IMPUESTA (no solo informada).
// Va dentro del turno del banco (lo pide quien lo lanza). Escribe en la salida estándar una línea «LISTO {json}» cuando está en marcha.
//   node pruebas/e2e/oficina_servidor.ts <carpeta del build de la oficina>
// Rutas de ayuda (solo aquí, nunca en la api): /__prueba/enlace?para=<correo> · /__prueba/buzon?para=<correo> · /__prueba/hogar?correo=<correo>
import { readFileSync, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { construyeApp } from "../../src/app.ts";
import { hashToken, nuevoToken } from "../../src/seguridad/cripto.ts";
import { hayDocker, levantaBd } from "../apoyo/bd.ts";
import { configDePrueba, contexto } from "../apoyo/contexto.ts";

const dist = process.argv[2];
if (!dist || !existsSync(join(dist, "index.html"))) { console.error("uso: oficina_servidor.ts <carpeta del build de la oficina>"); process.exit(2); }
if (!hayDocker()) { console.error("SIN_DOCKER"); process.exit(3); }

const CADDYFILE = fileURLToPath(new URL("../../../../infra/Caddyfile", import.meta.url));
const csp = /Content-Security-Policy-Report-Only "([^"]+)"/.exec(readFileSync(CADDYFILE, "utf8"))![1]!.split(";").map(x => x.trim()).filter(x => x && !x.startsWith("report-uri")).join("; ");
const TIPOS: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

const servidor = http.createServer();
await new Promise<void>(ok => servidor.listen(0, ok));
const puerto = (servidor.address() as { port: number }).port;
const url = "http://localhost:" + puerto;

const bd = await levantaBd();
const ctx = contexto(bd.app, configDePrueba({ GEMELO_URL_PUBLICA: url, GEMELO_ENLACE_POR_CORREO: "100", GEMELO_ENLACE_POR_IP: "1000" }));
const app = await construyeApp(ctx);
await app.ready();

// ---------------------------------------------------------------- datos de partida (sintéticos)
const ADMIN = "oficina@example.com";
const dueno = bd.dueno;
const idDe = async (correo: string) => Number((await dueno.query<{ id: number }>("SELECT id FROM hogares WHERE correo = $1", [correo])).rows[0]!.id);
await dueno.query("INSERT INTO hogares (correo, rol) VALUES ($1, 'admin')", [ADMIN]);
for (const [codigo, nombre] of [["H-01", "La Loma"], ["H-02", "El Pilar"], ["H-03", "Los Almendros"], ["H-04", "La Fuente"]]) {
  await dueno.query("INSERT INTO hazas (codigo, nombre, finca, geom) VALUES ($1, $2, 'hituelo', ST_Multi(ST_GeomFromText('POLYGON((0 0,10 0,10 10,0 10,0 0))', 25830)))", [codigo, nombre]);
}
const familias: [string, string, string | null, boolean][] = [   // correo, nombre interno, haza, ya aceptó las normas
  ["ruiz@example.com", "Ruiz Molina", "H-01", true], ["olid@example.com", "Olid", "H-02", true], ["pozo@example.com", "Pozo", null, false]];
for (const [correo, interno, haza, normas] of familias) {
  await dueno.query("INSERT INTO hogares (correo, nombre_interno, alias, normas_version, normas_aceptadas_en) VALUES ($1, $2, $3, $4, $5)",
    [correo, interno, normas ? interno.split(" ")[0] : null, normas ? 1 : null, normas ? new Date() : null]);
  if (haza) await dueno.query("UPDATE hazas SET hogar_id = $1 WHERE codigo = $2", [await idDe(correo), haza]);
}
// una sesión abierta de Ruiz en un móvil
await dueno.query("INSERT INTO sesiones (hogar_id, hash, expira_en, aparato_nombre) VALUES ($1, $2, now() + interval '7 days', 'Android · Chrome')",
  [await idDe("ruiz@example.com"), hashToken(nuevoToken())]);
// el aparato de oficina ya aprobado (como lo deja el RUNBOOK): el navegador de la prueba trae su secreto en la cookie de aparato
const secretoAparato = nuevoToken();
await dueno.query("INSERT INTO aparatos_oficina (hogar_id, nombre, hash, aprobado_en, aprobado_como) VALUES ($1, 'Aparato de la prueba', $2, now(), 'consola')",
  [await idDe(ADMIN), hashToken(secretoAparato)]);

// ---------------------------------------------------------------- servidor: api, oficina guardada y ayudas
const json = (res: http.ServerResponse, codigo: number, cuerpo: unknown) => { res.writeHead(codigo, { "content-type": "application/json" }); res.end(JSON.stringify(cuerpo)); };
servidor.on("request", (req, res) => {
  const [ruta = "/", consulta = ""] = (req.url ?? "/").split("?");
  const q = new URLSearchParams(consulta);
  if (ruta.startsWith("/api/")) {
    // lo que pone el Caddy delante de la api: https y la IP del cliente
    req.headers["x-forwarded-proto"] = "https"; req.headers["x-forwarded-for"] = "203.0.113.9";
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
    if (ruta === "/__prueba/buzon") { const m = ctx.cartero.ultimoPara(q.get("para") ?? ""); return json(res, m ? 200 : 404, m ?? { error: "sin_correo" }); }
    if (ruta === "/__prueba/hogar") {
      const h = (await dueno.query(
        `SELECT g.activo, g.baja_en IS NOT NULL AS con_baja, g.nombre_interno,
                coalesce((SELECT array_agg(h.codigo ORDER BY h.codigo) FROM hazas h WHERE h.hogar_id = g.id), '{}') AS hazas,
                (SELECT count(*)::int FROM sesiones s WHERE s.hogar_id = g.id AND s.revocada_en IS NULL AND s.expira_en > now()) AS sesiones
           FROM hogares g WHERE g.correo = $1`, [q.get("correo")])).rows[0];
      return json(res, h ? 200 : 404, h ?? { error: "no_existe" });
    }
    if (ruta === "/oficina") { res.writeHead(301, { location: "/oficina/" }); return void res.end(); }
    if (ruta.startsWith("/oficina/")) {
      // la guarda del Caddy: forward_auth a la api con la cookie de la petición
      const g = await app.inject({ method: "GET", url: "/api/interno/autoriza?para=oficina", headers: { cookie: req.headers.cookie ?? "", "sec-fetch-mode": String(req.headers["sec-fetch-mode"] ?? "") } });
      if (g.statusCode !== 204) { res.writeHead(g.statusCode === 303 ? 303 : g.statusCode, g.statusCode === 303 ? { location: String(g.headers.location) } : {}); return void res.end(); }
      const rel = normalize(ruta.slice("/oficina/".length) || "index.html");
      const f = join(dist, rel.endsWith("/") ? rel + "index.html" : rel);
      if (rel.startsWith("..") || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); return void res.end(); }
      res.writeHead(200, { "content-type": TIPOS[extname(f)] ?? "application/octet-stream", "content-security-policy": csp, "cache-control": "no-store" });
      return void res.end(readFileSync(f));
    }
    if (ruta === "/" || ruta.startsWith("/finca")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return void res.end("<!doctype html><title>Portada de la prueba</title><p>portada"); }
    res.writeHead(404); res.end();
  })().catch(e => { console.error(e); res.writeHead(500); res.end(); });
});

console.log("LISTO " + JSON.stringify({ url, secretoAparato, admin: ADMIN }));
const cierra = async () => { try { await app.close(); await bd.cierra(); } finally { process.exit(0); } };
process.on("SIGTERM", () => void cierra());
process.on("SIGINT", () => void cierra());
process.stdin.on("end", () => void cierra());
process.stdin.resume();
