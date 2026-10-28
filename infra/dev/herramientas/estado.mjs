// Salud del entorno de desarrollo: `npm run dev:estado`. Sale con 1 si algo no está sano.
// Dos miradas: lo que dice Docker (estado y healthcheck de cada contenedor) y una prueba desde fuera, como la haría un cliente
// (HTTP a Caddy, consulta SQL a PostGIS con su clave, listado de salas de LiveKit firmado con sus claves, API de Mailpit).
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cargaEnv, compose, motivoSinDocker, puertos } from "./_comun.mjs";

const SERVICIOS = ["web", "db", "livekit", "correo"];

/** Estado según Docker: { servicio: { estado, salud } } */
export function estadoDocker() {
  const r = compose(["ps", "--all", "--format", "json"], { captura: true });
  if (r.status !== 0) throw new Error("docker compose ps falló: " + r.stderr);
  const txt = r.stdout.trim(), filas = !txt ? [] : txt.startsWith("[") ? JSON.parse(txt) : txt.split("\n").map(l => JSON.parse(l));
  const out = {};
  for (const f of filas) out[f.Service] = { estado: f.State, salud: f.Health || "(sin healthcheck)" };
  return out;
}

const conTiempo = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("sin respuesta en " + ms + " ms")), ms))]);

async function http(url) {
  const r = await conTiempo(5000, fetch(url));
  return { status: r.status, texto: await r.text(), cabeceras: r.headers };
}
/** HTTPS contra la CA local de Caddy (no instalada): solo aquí y solo contra 127.0.0.1 se acepta un certificado no confiable */
function httpsLocal(puerto, ruta) {
  return conTiempo(5000, new Promise((ok, no) => {
    https.get({ host: "127.0.0.1", port: puerto, path: ruta, servername: "localhost", headers: { host: "localhost:" + puerto }, rejectUnauthorized: false }, r => {
      const cert = r.socket.getPeerCertificate().issuer; let b = "";
      r.on("data", d => { b += d; }); r.on("end", () => ok({ status: r.statusCode, texto: b, cert }));
    }).on("error", no);
  }));
}

/** Pruebas desde fuera. Devuelve [{ servicio, ok, detalle }] */
export async function pruebasExternas() {
  const p = puertos(), e = process.env, res = [];
  const prueba = async (servicio, fn) => { try { res.push({ servicio, ok: true, detalle: await fn() }); } catch (err) { res.push({ servicio, ok: false, detalle: String(err.message || err) }); } };

  await prueba("web (http)", async () => {
    const s = await http("http://127.0.0.1:" + p.web + "/salud"); if (s.status !== 200) throw new Error("/salud → " + s.status);
    const i = await http("http://127.0.0.1:" + p.web + "/"); if (i.status !== 200 || !i.texto.includes('id="datos"')) throw new Error("/ → " + i.status + " sin la página del gemelo");
    return "/ y /salud 200";
  });
  await prueba("web (https)", async () => {
    const s = await httpsLocal(p.https, "/salud"); if (s.status !== 200) throw new Error("/salud → " + s.status);
    return "200, certificado de " + ((s.cert && (s.cert.CN || s.cert.O)) || "CA local");
  });
  await prueba("db", async () => {
    const { default: pg } = await import("pg");
    const c = new pg.Client({ host: "127.0.0.1", port: p.db, user: "gemelo", database: "gemelo", password: e.GEMELO_DEV_PG_CLAVE, connectionTimeoutMillis: 5000 });
    await c.connect();
    try { const r = await c.query("select current_setting('server_version') as pg, postgis_lib_version() as postgis"); return "PostgreSQL " + r.rows[0].pg + ", PostGIS " + r.rows[0].postgis; }
    finally { await c.end(); }
  });
  await prueba("livekit", async () => {
    const s = await http("http://127.0.0.1:" + p.livekit + "/"); if (s.status !== 200) throw new Error("/ → " + s.status);
    const { RoomServiceClient } = await import("livekit-server-sdk");
    const salas = await conTiempo(5000, new RoomServiceClient("http://127.0.0.1:" + p.livekit, e.GEMELO_DEV_LIVEKIT_CLAVE, e.GEMELO_DEV_LIVEKIT_SECRETO).listRooms());
    return "señalización 200; claves válidas (" + salas.length + " salas)";
  });
  await prueba("correo", async () => {
    const s = await http("http://127.0.0.1:" + p.correoWeb + "/readyz"); if (s.status !== 200) throw new Error("/readyz → " + s.status);
    const i = JSON.parse((await http("http://127.0.0.1:" + p.correoWeb + "/api/v1/info")).texto);
    return "Mailpit " + i.Version + ", " + i.Messages + " mensajes";
  });
  return res;
}

export async function estado() {
  const sin = motivoSinDocker();
  if (sin) return { ok: false, docker: {}, externas: [], motivo: sin };
  cargaEnv();
  const docker = estadoDocker(), externas = await pruebasExternas();
  const okDocker = SERVICIOS.every(s => docker[s] && docker[s].estado === "running" && ["healthy", "(sin healthcheck)"].includes(docker[s].salud));
  return { ok: okDocker && externas.every(x => x.ok), docker, externas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await estado();
  if (r.motivo) { console.error("✗ " + r.motivo); process.exit(1); }
  console.log("Docker (proyecto gemelo-dev):");
  for (const s of SERVICIOS) { const d = r.docker[s]; console.log("  " + (d && d.salud === "healthy" ? "✓" : "✗") + " " + s.padEnd(8) + (d ? d.estado + ", " + d.salud : "no existe")); }
  console.log("Desde fuera:");
  for (const x of r.externas) console.log("  " + (x.ok ? "✓" : "✗") + " " + x.servicio.padEnd(12) + x.detalle);
  process.exit(r.ok ? 0 : 1);
}
