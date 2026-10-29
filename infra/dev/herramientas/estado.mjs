// Salud del entorno de desarrollo: `npm run dev:estado`. Sale con 1 si algo no está sano.
// Dos miradas: lo que dice Docker (estado y healthcheck de cada contenedor) y una prueba desde fuera, como la haría un cliente
// (HTTP a Caddy, consulta SQL a PostGIS con su clave, listado de salas de LiveKit firmado con sus claves, API de Mailpit).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { caLocal, cargaEnv, compose, motivoSinDocker, pideHttps, puertos, PG_API, PG_DUENO } from "./_comun.mjs";

const SERVICIOS = ["web", "db", "livekit", "correo", "api"];
/** Servicios de una sola vez: deben haber terminado con 0 (las migraciones) */
const DE_UNA_VEZ = ["migra"];

/** Estado según Docker: { servicio: { estado, salud } } */
export function estadoDocker() {
  const r = compose(["ps", "--all", "--format", "json"], { captura: true });
  if (r.status !== 0) throw new Error("docker compose ps falló: " + r.stderr);
  const txt = r.stdout.trim(), filas = !txt ? [] : txt.startsWith("[") ? JSON.parse(txt) : txt.split("\n").map(l => JSON.parse(l));
  const out = {};
  for (const f of filas) out[f.Service] = { estado: f.State, salud: f.Health || "(sin healthcheck)", salida: f.ExitCode };
  return out;
}

const conTiempo = (ms, p) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("sin respuesta en " + ms + " ms")), ms))]);

async function http(url) {
  const r = await conTiempo(5000, fetch(url));
  return { status: r.status, texto: await r.text(), cabeceras: r.headers };
}
/** Pruebas desde fuera. Devuelve [{ servicio, ok, detalle }] */
export async function pruebasExternas() {
  const p = puertos(), e = process.env, res = [];
  const prueba = async (servicio, fn) => { try { res.push({ servicio, ok: true, detalle: await fn() }); } catch (err) { res.push({ servicio, ok: false, detalle: String(err.message || err) }); } };
  // por https, con la CA local de Caddy si se puede leer (verifica el certificado); si no, sin verificarlo (solo 127.0.0.1)
  let ca = null;
  try { ca = caLocal(); } catch { /* sin CA: se mira igual, sin verificar */ }
  const hs = (ruta, cab) => conTiempo(10000, pideHttps(p.https, ruta, { headers: cab, ca }));

  await prueba("web (http)", async () => {
    const s = await http("http://127.0.0.1:" + p.web + "/salud"); if (s.status !== 200) throw new Error("/salud → " + s.status);
    const r = await conTiempo(5000, fetch("http://localhost:" + p.web + "/finca/", { redirect: "manual" }));
    const destino = "https://localhost:" + p.https + "/finca/";
    if (r.status !== 308 || r.headers.get("location") !== destino) throw new Error("/finca/ → " + r.status + " " + r.headers.get("location") + " (se esperaba 308 a " + destino + ")");
    return "/salud 200; lo demás, 308 a https";
  });
  await prueba("web (https)", async () => {
    const s = await hs("/salud"); if (s.status !== 200) throw new Error("/salud → " + s.status);
    const i = await hs("/"); if (i.status !== 200 || !i.texto.includes('action="/api/auth/enlace"')) throw new Error("/ → " + i.status + " sin la portada");
    // decisión 16: sin sesión, el mundo y las teselas no se sirven
    const f = await hs("/finca/", { "sec-fetch-mode": "navigate" });
    if (f.status !== 303 || f.cabeceras.location !== "/") throw new Error("/finca/ sin sesión → " + f.status + " (se esperaba 303 a /)");
    const t = await hs("/teselas/hituelo/indice.json");
    if (t.status !== 401) throw new Error("/teselas/ sin sesión → " + t.status + " (se esperaba 401)");
    return "portada y /salud 200; sin sesión /finca/ → 303 y /teselas/ → 401; certificado de " + ((s.cert && (s.cert.CN || s.cert.O)) || "CA local") + (ca ? " (verificado)" : " (SIN verificar)");
  });
  await prueba("api", async () => {
    const s = await hs("/api/salud");
    if (s.status !== 200 || JSON.parse(s.texto).bd !== "ok") throw new Error("/api/salud → " + s.status + " " + s.texto.slice(0, 80));
    const h = await hs("/api/hazas"); if (h.status !== 401) throw new Error("/api/hazas sin sesión → " + h.status);
    return "/api/salud 200 (bd ok), /api/hazas sin sesión 401";
  });
  await prueba("db", async () => {
    const { default: pg } = await import("pg");
    const cliente = (user, password) => new pg.Client({ host: "127.0.0.1", port: p.db, user, database: "gemelo", password, connectionTimeoutMillis: 5000 });
    const c = cliente(PG_DUENO, e.GEMELO_DEV_PG_CLAVE);
    await c.connect();
    let v;
    try { v = (await c.query("select current_setting('server_version') as pg, postgis_lib_version() as postgis")).rows[0]; }
    finally { await c.end(); }
    // el rol de la api entra con su clave y NO es superusuario ni dueño de nada (si no, los fallos de permisos no saldrían aquí)
    const a = cliente(PG_API, e.GEMELO_DEV_PG_API_CLAVE);
    await a.connect();
    try {
      const r = (await a.query("select rolsuper, rolcreaterole, rolcreatedb, (select count(*) from pg_class where relowner = pg_roles.oid)::int as suyas from pg_roles where rolname = current_user")).rows[0];
      if (r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.suyas) throw new Error(PG_API + " tiene más permisos de los mínimos: " + JSON.stringify(r));
    } finally { await a.end(); }
    return "PostgreSQL " + v.pg + ", PostGIS " + v.postgis + "; " + PG_DUENO + " y " + PG_API + " (sin superusuario ni objetos propios) entran";
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
  const okDocker = SERVICIOS.every(s => docker[s] && docker[s].estado === "running" && ["healthy", "(sin healthcheck)"].includes(docker[s].salud))
    && DE_UNA_VEZ.every(s => docker[s] && docker[s].estado === "exited" && docker[s].salida === 0);
  return { ok: okDocker && externas.every(x => x.ok), docker, externas };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = await estado();
  if (r.motivo) { console.error("✗ " + r.motivo); process.exit(1); }
  console.log("Docker (proyecto gemelo-dev):");
  for (const s of SERVICIOS) { const d = r.docker[s]; console.log("  " + (d && d.salud === "healthy" ? "✓" : "✗") + " " + s.padEnd(8) + (d ? d.estado + ", " + d.salud : "no existe")); }
  for (const s of DE_UNA_VEZ) { const d = r.docker[s]; console.log("  " + (d && d.estado === "exited" && d.salida === 0 ? "✓" : "✗") + " " + s.padEnd(8) + (d ? d.estado + ", salida " + d.salida : "no existe")); }
  console.log("Desde fuera:");
  for (const x of r.externas) console.log("  " + (x.ok ? "✓" : "✗") + " " + x.servicio.padEnd(12) + x.detalle);
  process.exit(r.ok ? 0 : 1);
}
