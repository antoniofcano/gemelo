// Piezas comunes de levanta.mjs, para.mjs y estado.mjs (y de pruebas/guardianes/dev.test.js).
// Sin lógica propia de espera ni de salud: la pone Docker Compose (healthchecks + `up --wait`).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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

/** Crea infra/dev/.env con claves ALEATORIAS si no existe (git lo ignora). Nunca se sobrescribe. */
export function aseguraEnv() {
  if (fs.existsSync(ENV)) return false;
  const aleatorio = n => crypto.randomBytes(n).toString("base64url");
  const valores = {
    GEMELO_DEV_PG_CLAVE: aleatorio(24),
    GEMELO_DEV_LIVEKIT_CLAVE: "dev" + crypto.randomBytes(6).toString("hex"),
    GEMELO_DEV_LIVEKIT_SECRETO: aleatorio(32),
  };
  const plantilla = fs.readFileSync(EJEMPLO_ENV, "utf8").replace(/^(GEMELO_DEV_[A-Z_]+)=la-genera-levanta$/gm, (_, k) => k + "=" + valores[k]);
  fs.writeFileSync(ENV, "# Generado por infra/dev/herramientas/levanta.mjs: claves aleatorias SOLO para este equipo. No se versiona.\n" + plantilla, { mode: 0o600 });
  return true;
}

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

/** Instala las dependencias de infra/dev/herramientas (versiones fijas del package-lock) si faltan */
export function aseguraDependencias() {
  if (!fs.existsSync(path.join(HERRAMIENTAS, "node_modules", "livekit-server-sdk"))) npm(["ci", "--no-audit", "--no-fund"], HERRAMIENTAS);
}
