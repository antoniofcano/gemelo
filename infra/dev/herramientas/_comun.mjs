// Piezas comunes de levanta.mjs, para.mjs y estado.mjs (y de pruebas/guardianes/dev.test.js).
// Sin lógica propia de espera ni de salud: la pone Docker Compose (healthchecks + `up --wait`).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export const HERRAMIENTAS = path.dirname(fileURLToPath(import.meta.url));
export const DEV = path.dirname(HERRAMIENTAS);
export const RAIZ = path.resolve(DEV, "..", "..");
export const COMPOSE = path.join(DEV, "compose.yml");
export const ENV = path.join(DEV, ".env");
export const EJEMPLO_ENV = path.join(DEV, "ejemplo.env");
export const FIXTURE = path.join(RAIZ, "pruebas", "salida", "fixture");
export const SALIDA_DEV = path.join(RAIZ, "pruebas", "salida", "dev");
export const WEB = path.join(RAIZ, "apps", "web");

// las utilidades de los guardianes (python(), chrome(), playwright()) se reutilizan, no se copian
export const util = createRequire(import.meta.url)(path.join(RAIZ, "pruebas", "guardianes", "_util.js"));

/** Claves aleatorias nuevas para cada variable que la plantilla marca con «la-genera-levanta» */
function clavesNuevas() {
  const aleatorio = n => crypto.randomBytes(n).toString("base64url");
  return {
    GEMELO_DEV_PG_CLAVE: aleatorio(24),
    GEMELO_DEV_PG_API_CLAVE: aleatorio(24),
    GEMELO_DEV_LIVEKIT_CLAVE: "dev" + crypto.randomBytes(6).toString("hex"),
    GEMELO_DEV_LIVEKIT_SECRETO: aleatorio(32),
    GEMELO_DEV_SESION_SECRETO: aleatorio(32),
  };
}

/**
 * Crea infra/dev/.env con claves ALEATORIAS si no existe (git lo ignora). Nunca se sobrescribe un valor: si el .env es
 * de antes y le falta una clave nueva de la plantilla (p. ej. GEMELO_DEV_SESION_SECRETO), solo se AÑADE esa.
 * Devuelve "creado", la lista de claves añadidas, o false si no hizo nada.
 */
export function aseguraEnv() {
  const valores = clavesNuevas();
  if (!fs.existsSync(ENV)) {
    const plantilla = fs.readFileSync(EJEMPLO_ENV, "utf8").replace(/^(GEMELO_DEV_[A-Z_]+)=la-genera-levanta$/gm, (_, k) => k + "=" + valores[k]);
    fs.writeFileSync(ENV, "# Generado por infra/dev/herramientas/levanta.mjs: claves aleatorias SOLO para este equipo. No se versiona.\n" + plantilla, { mode: 0o600 });
    return "creado";
  }
  const actual = fs.readFileSync(ENV, "utf8");
  const faltan = [...fs.readFileSync(EJEMPLO_ENV, "utf8").matchAll(/^(GEMELO_DEV_[A-Z_]+)=la-genera-levanta$/gm)].map(m => m[1])
    .filter(k => !new RegExp("^" + k + "=", "m").test(actual));
  if (!faltan.length) return false;
  fs.appendFileSync(ENV, (actual.endsWith("\n") ? "" : "\n") + "# añadidas por levanta.mjs (claves nuevas de la plantilla)\n" +
    faltan.map(k => k + "=" + valores[k] + "\n").join(""));
  return faltan;
}

/** Roles de Postgres, los mismos que en producción (decisión 55): el dueño migra y siembra; la api solo toca filas */
export const PG_DUENO = "gemelo_dueno";
export const PG_API = "gemelo_api";

/** Carga infra/dev/.env en process.env (sin pisar lo que ya venga del entorno) */
export function cargaEnv() {
  if (fs.existsSync(ENV)) process.loadEnvFile(ENV);
}

export function puertos() {
  const e = process.env, n = (k, d) => Number(e[k] || d);
  return {
    web: n("GEMELO_DEV_PUERTO_WEB", 8780), https: n("GEMELO_DEV_PUERTO_HTTPS", 8743), db: n("GEMELO_DEV_PUERTO_DB", 55432),
    livekit: n("GEMELO_DEV_PUERTO_LIVEKIT", 7880), correoWeb: n("GEMELO_DEV_PUERTO_CORREO_WEB", 8025), smtp: n("GEMELO_DEV_PUERTO_SMTP", 1025),
  };
}

/** Carpeta de teselas que se monta en /teselas (absoluta). Los datos reales nunca dentro del repo salvo en pruebas/salida/ (ignorada). */
export function carpetaTeselas() {
  const v = process.env.GEMELO_DEV_TESELAS;
  if (!v) return FIXTURE;
  const abs = path.resolve(DEV, v);                                // igual que la resuelve Compose (relativa a infra/dev/)
  const rel = path.relative(RAIZ, abs);
  const dentro = !rel.startsWith("..") && !path.isAbsolute(rel);
  if (dentro && !rel.split(path.sep).join("/").startsWith("pruebas/salida/")) {
    throw new Error("GEMELO_DEV_TESELAS apunta dentro del repo (" + rel + "): los datos reales van FUERA del repo (es público)");
  }
  return abs;
}

/** docker compose -f infra/dev/compose.yml <args>. `captura` devuelve la salida en vez de mostrarla. */
export function compose(args, { captura = false, env } = {}) {
  // sin .env (aún no se ha levantado nunca) Compose no podría interpolar las claves: para `config`, `ps` o `down` basta la plantilla
  const base = ["compose", "-f", COMPOSE].concat(fs.existsSync(ENV) ? [] : ["--env-file", EJEMPLO_ENV]);
  const r = spawnSync("docker", base.concat(args), {
    cwd: DEV, encoding: "utf8", stdio: captura ? "pipe" : "inherit", env: Object.assign({}, process.env, env || {}), maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  return r;
}

/** ¿Hay Docker con Compose v2 y un demonio que responde? Devuelve el motivo si no. */
export function motivoSinDocker() {
  const v = spawnSync("docker", ["compose", "version", "--short"], { encoding: "utf8" });
  if (v.error || v.status !== 0) return "no hay `docker compose` (Docker con Compose v2)";
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  if (s.status !== 0) return "el demonio de Docker no responde (¿Docker Desktop parado?)";
  return null;
}

/** npm en Windows es npm.cmd: se lanza con shell. Solo con argumentos fijos, sin entrada del usuario. */
export function npm(args, cwd, env) {
  const r = spawnSync(["npm"].concat(args).join(" "), { cwd, stdio: "inherit", shell: true, env: Object.assign({}, process.env, env || {}) });
  if (r.status !== 0) throw new Error("npm " + args.join(" ") + " falló en " + path.relative(RAIZ, cwd));
}

/**
 * La raíz de la CA local de Caddy (`tls internal`), leída del contenedor web: se regenera en cada arranque (tmpfs) y no
 * se instala en el sistema. Con ella las herramientas VERIFICAN el certificado de https://localhost en vez de ignorarlo.
 */
export function caLocal() {
  const r = compose(["exec", "-T", "web", "cat", "/data/caddy/pki/authorities/local/root.crt"], { captura: true });
  if (r.status !== 0 || !r.stdout.includes("BEGIN CERTIFICATE")) throw new Error("no puedo leer la CA local de Caddy: " + r.stderr);
  return r.stdout;
}

/**
 * Petición a https://localhost:<puerto><ruta> con node:https (no con fetch): fetch no deja poner las cabeceras
 * Sec-Fetch-* (para simular una NAVEGACIÓN) ni pasar la CA local. Sin `ca` acepta cualquier certificado: solo para
 * mirar la salud desde fuera, y solo contra 127.0.0.1. Devuelve { status, cabeceras, texto, cert }.
 */
export function pideHttps(puerto, ruta, { method = "GET", headers = {}, body, ca } = {}) {
  return new Promise((ok, no) => {
    const q = https.request({
      host: "127.0.0.1", port: puerto, path: ruta, method, servername: "localhost", timeout: 10000,
      headers: Object.assign({ host: "localhost:" + puerto }, headers, body !== undefined ? { "content-length": Buffer.byteLength(body) } : {}),
      ...(ca ? { ca } : { rejectUnauthorized: false }),
    }, r => {
      const trozos = [];
      const cert = r.socket.getPeerCertificate().issuer;
      r.on("data", d => trozos.push(d));
      r.on("end", () => ok({ status: r.statusCode, cabeceras: r.headers, texto: Buffer.concat(trozos).toString("utf8"), cert }));
    });
    q.on("timeout", () => q.destroy(new Error("sin respuesta en 10000 ms"))).on("error", no);
    if (body !== undefined) q.write(body);
    q.end();
  });
}

/** Instala las dependencias de infra/dev/herramientas (versiones fijas del package-lock) si faltan */
export function aseguraDependencias() {
  if (!fs.existsSync(path.join(HERRAMIENTAS, "node_modules", "livekit-server-sdk"))) npm(["ci", "--no-audit", "--no-fund"], HERRAMIENTAS);
}
