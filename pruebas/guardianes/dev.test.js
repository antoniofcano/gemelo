"use strict";
// Entorno de desarrollo con Docker (infra/dev/, doc/operacion/DESARROLLO-LOCAL.md).
//  - Siempre: el compose es válido (`docker compose config`; sin Docker esa parte se SALTA con aviso), imágenes con versión fija,
//    ningún puerto fuera de 127.0.0.1, ningún secreto escrito, límites de memoria, restart y la red propia; la api enchufada
//    (construida de apps/api, sin puertos, con healthcheck y sus migraciones); el Caddyfile con la forma de producción
//    (portada pública, /finca/ y /teselas/ tras sesión); la siembra sintética.
//  - Opcional (GEMELO_DOCKER=1): el recorrido de entrada de punta a punta. Levanta el entorno; sin sesión solo la portada;
//    pide el enlace mágico para el hogar de prueba, lo lee en la API de Mailpit y lo abre en Chrome (cookie HttpOnly); el
//    mundo carga en /finca/ con 0 errores; /api/hazas, la ficha propia y dos ajenas cumplen la lista blanca; salir cierra
//    la sesión; las lindes de las hazas dibujadas (LineSegments en __g.scene); las gafas (UA de Quest) vinculadas por código;
//    las recetas horneadas por Caddy (O7d: objeto .br con Content-Encoding br e immutable y manifiesto con no-cache, con sesión; 401 sin
//    ella; se escriben aquí con el hornero de referencia o son las de GEMELO_DEV_OLIVOS),
//    el tileset por Caddy (200 con sesión, 401 sin ella; con el fixture se genera aquí) y /finca/ (la escena 3D Tiles, la única) y ?olivos=gen sin
//    errores ni avisos de CSP. Mide tiempos y lo baja (si ya estaba levantado antes, lo deja como estaba).
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { pathToFileURL } = require("url");
const { RAIZ, lee, python, ejecuta, fs, path, os } = require("./_util");
const { motivoSalto, lanza, mide } = require("./_navegador");

const DEV = path.join(RAIZ, "infra", "dev");
const COMPOSE = path.join(DEV, "compose.yml");
const EJEMPLO = path.join(DEV, "ejemplo.env");
const HERR = path.join(DEV, "herramientas");
// con GEMELO_DEV_TESELAS o GEMELO_DEV_FINCA_CARPETA (datos reales en local) la siembra es la de prueba, no la del fixture
const DE_PRUEBA = !!(process.env.GEMELO_DEV_TESELAS || process.env.GEMELO_DEV_FINCA_CARPETA);
const SERVICIOS = ["web", "db", "livekit", "correo", "migra", "api", "hornero"];
const DE_UNA_VEZ = ["migra"];                   // termina al aplicar las migraciones
const CONSTRUIDOS = ["migra", "api"];           // imagen propia, construida de apps/api/Dockerfile (el hornero, de tuberia/olivos/Dockerfile: ver su test)

function hayDocker() {
  const v = spawnSync("docker", ["compose", "version", "--short"], { encoding: "utf8" });
  if (v.error || v.status !== 0) return "no hay `docker compose`";
  const s = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], { encoding: "utf8" });
  return s.status === 0 ? null : "el demonio de Docker no responde";
}
const SIN_DOCKER = hayDocker();
/** El compose tal como lo ve Docker, con la plantilla de variables (sin el .env de este equipo ni COMPOSE_PROJECT_NAME, para que valga en cualquier máquina) */
function config() {
  const env = Object.assign({}, process.env, { GEMELO_DEV_TESELAS: "", GEMELO_DEV_FINCA_CARPETA: "", GEMELO_DEV_TILESET: "" });
  delete env.COMPOSE_PROJECT_NAME;
  const r = spawnSync("docker", ["compose", "-f", COMPOSE, "--env-file", EJEMPLO, "config", "--format", "json"], { cwd: DEV, encoding: "utf8", env });
  assert.strictEqual(r.status, 0, "docker compose config falló:\n" + r.stderr);
  return JSON.parse(r.stdout);
}
const composeSinComentarios = () => lee("infra/dev/compose.yml").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");

// versión fija: 2.11.7-alpine, v1.13.11, 18-3.6-alpine (PostgreSQL-PostGIS)… nunca latest/edge/master ni solo la mayor (2, v1)
const TAG_FIJO = /^(v?\d+\.\d+(\.\d+)?|\d+-\d+\.\d+)(-[a-z0-9.]+)?$/;

// etiquetas preliminares o móviles: nunca (Antonio, 2026-10-28: versiones estables, pensando en producción)
const PRELIMINAR = /(^|[-.\d])(latest|edge|master|main|dev|devel|nightly|snapshot|rc\d*|beta\d*|alpha\d*|preview|canary|testing|unstable)([-.\d]|$)/i;

test("compose de desarrollo: `docker compose config` lo acepta y tiene sus servicios (con la api enchufada)", t => {
  if (SIN_DOCKER) return t.skip(SIN_DOCKER + ": la validación del compose con Docker NO se ha comprobado (las de texto sí)");
  const c = config();
  assert.strictEqual(c.name, "gemelo-dev");
  assert.deepStrictEqual(Object.keys(c.services).sort(), SERVICIOS.slice().sort());
  for (const [n, s] of Object.entries(c.services)) {
    assert.strictEqual(s.restart, DE_UNA_VEZ.includes(n) ? "no" : "unless-stopped", n + ": restart");
    assert.ok(s.deploy && s.deploy.resources && s.deploy.resources.limits && s.deploy.resources.limits.memory, n + ": sin límite de memoria");
    assert.deepStrictEqual(Object.keys(s.networks || {}), ["interna"], n + ": debe estar solo en la red interna del proyecto");
    for (const p of s.ports || []) assert.strictEqual(p.host_ip, "127.0.0.1", n + ": puerto " + p.published + " publicado fuera de 127.0.0.1");
  }
  for (const n of CONSTRUIDOS) {
    const s = c.services[n];
    assert.ok(s.build && /apps[\\/]api[\\/]Dockerfile$/.test(path.join(s.build.context, s.build.dockerfile)), n + ": se construye de apps/api/Dockerfile");
    assert.ok(!s.ports || !s.ports.length, n + ": no publica puertos (se entra por Caddy en /api/)");
    assert.strictEqual(s.user, "1000:1000", n + ": sin root");
    assert.strictEqual(s.read_only, true, n + ": sistema de ficheros de solo lectura");
    assert.deepStrictEqual(s.cap_drop, ["ALL"], n + ": sin capacidades");
  }
  const api = c.services.api, e = api.environment;
  assert.ok(api.healthcheck && api.healthcheck.test.join(" ").includes("/api/salud"), "api: healthcheck contra /api/salud");
  assert.strictEqual(api.depends_on.migra.condition, "service_completed_successfully", "api: espera a las migraciones");
  for (const [k, v] of Object.entries({ GEMELO_API_PUERTO: "8000", GEMELO_CORREO: "smtp", GEMELO_SMTP_HOST: "correo", GEMELO_SMTP_PUERTO: "1025", GEMELO_SMTP_TLS: "no", GEMELO_OT: "no" })) {
    assert.strictEqual(e[k], v, "api: " + k);
  }
  assert.ok(!e.GEMELO_SMTP_USUARIO, "api: Mailpit sin usuario");
  assert.match(e.GEMELO_URL_PUBLICA, /^https:\/\/localhost:\d+$/, "api: GEMELO_URL_PUBLICA por https (la cookie de sesión es Secure)");
  assert.strictEqual(e.GEMELO_API_ORIGENES, e.GEMELO_URL_PUBLICA, "api: el único origen admitido es el https de localhost");
  // decisión 55: los mismos roles que producción (infra/compose.yml): la api con gemelo_api, las migraciones con el dueño
  assert.strictEqual(e.GEMELO_DB_URL, "postgresql://gemelo_api@db:5432/gemelo", "api: entra con el rol de permisos mínimos, sin clave en la URL");
  assert.strictEqual(c.services.migra.environment.GEMELO_DB_URL, "postgresql://gemelo_dueno@db:5432/gemelo", "migra: con el dueño del esquema");
  assert.match(composeSinComentarios(), /^\s+GEMELO_DB_CLAVE: \$\{GEMELO_DEV_PG_API_CLAVE:/m, "api: con la clave de su rol, no con la del dueño");
  const db = c.services.db, dbe = db.environment;
  assert.strictEqual(dbe.POSTGRES_USER, "gemelo_dueno", "db: el dueño se llama como en producción");
  assert.deepStrictEqual([dbe.POSTGRES_PASSWORD_FILE, dbe.GEMELO_PG_API_CLAVE_FICHERO], ["/run/secrets/pg_dueno", "/run/secrets/pg_api"], "db: claves por fichero, como en producción");
  const init = (db.volumes || []).find(v => v.target === "/docker-entrypoint-initdb.d");
  assert.ok(init && path.resolve(init.source) === path.join(RAIZ, "infra", "bd-inicial") && init.read_only, "db: los roles los crea el MISMO infra/bd-inicial de producción (solo lectura)");
  assert.notStrictEqual(e.NODE_ENV, "production", "api: en local no es producción (config.ts exigiría TLS y secretos en fichero)");
  assert.deepStrictEqual(c.services.migra.command, ["node", "dist/src/bd/migra-cli.js"], "migra: aplica las migraciones");
});

test("imágenes estables con versión fija Y digest (imagen:versión@sha256:…), sin etiquetas preliminares; la api, construida", () => {
  const todas = [...composeSinComentarios().matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map(m => m[1]);
  const imgs = todas.filter(i => !i.startsWith("gemelo-"));          // las propias (gemelo-api) se construyen aquí: su base va fijada en el Dockerfile
  assert.strictEqual(imgs.length, 4, "se esperaban 4 imágenes de fuera: " + imgs.join(", "));
  assert.deepStrictEqual([...new Set(todas.filter(i => i.startsWith("gemelo-")))].sort(), ["gemelo-api:local", "gemelo-hornero:local"], "las imágenes propias: la api y el hornero");
  for (const i of imgs) {
    const m = /^([a-z0-9._/-]+):([A-Za-z0-9._-]+)@sha256:([a-f0-9]{64})$/.exec(i);
    assert.ok(m, i + ": debe ser imagen:versión@sha256:<64 hex>");
    assert.match(m[2], TAG_FIJO, i + ": la etiqueta debe ser una versión fija (no solo la mayor)");
    assert.ok(!PRELIMINAR.test(m[2]), i + ": etiqueta preliminar o móvil");
  }
  assert.match(lee("apps/api/Dockerfile"), /^FROM node:24\.\d+\.\d+-alpine[\d.]*@sha256:[a-f0-9]{64}/m, "la base de la api: node 24 con versión y digest");
  assert.match(lee("tuberia/olivos/Dockerfile"), /^FROM node:24\.\d+\.\d+-alpine[\d.]*@sha256:[a-f0-9]{64}/m, "la base del hornero: node 24 con versión y digest");
  const baseDe = f => /^FROM (node:\S+)/m.exec(lee(f))[1];
  assert.strictEqual(baseDe("tuberia/olivos/Dockerfile"), baseDe("apps/api/Dockerfile"), "el hornero y la api, sobre la misma imagen de node");
});

test("hornero (O7f), en dev y en producción: sin puertos, usuario no root, solo lectura salvo su salida y su estado, sin capacidades, índice de solo lectura, healthcheck, candado", () => {
  const trozo = (txt, nombre) => { const m = new RegExp("^  " + nombre + ":\\n((?:    .*\\n|\\s*\\n)+)", "m").exec(txt); assert.ok(m, "no encuentro el servicio " + nombre); return m[1].split("\n").filter(l => !/^\s*#/.test(l)).join("\n"); };
  const sinCom = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n") + "\n";
  for (const [f, tag] of [["infra/dev/compose.yml", "gemelo-hornero:local"], ["infra/compose.yml", "gemelo-hornero:0.2.0"]]) {
    const h = trozo(sinCom(f), "hornero");
    assert.ok(!/^\s+ports:/m.test(h), f + ": el hornero no publica puertos");
    assert.match(h, /^\s+user: "1000:1000"/m, f + ": usuario no root");
    assert.match(h, /^\s+read_only: true/m, f + ": sistema de ficheros de solo lectura");
    assert.match(h, /^\s+cap_drop: \[ALL\]/m, f + ": sin capacidades");
    assert.ok(/no-new-privileges:true/.test(h) || /<<: \*comun/.test(h), f + ": sin nuevos privilegios (propio o por el ancla comun)");
    assert.match(h, new RegExp("image: " + tag.replace(/[.]/g, "\\.")), f + ": imagen propia " + tag);
    assert.match(h, /tuberia\/olivos\/Dockerfile/, f + ": se construye de tuberia/olivos/Dockerfile");
    assert.match(h, /^\s+- .*:\/datos\/\S+:ro$/m, f + ": el índice de la finca, de solo lectura");
    assert.match(h, /^\s+- .*:\/salida\/\S+\/olivos$/m, f + ": SU salida es la carpeta olivos/ de la finca (rw), nada más");
    assert.match(h, /^\s+- \S+:\/estado(\s+#.*)?$/m, f + ": su estado, en un volumen propio, fuera de la carpeta servida");
    assert.ok(!/:\/salida\/\S+:ro\s*$/m.test(h), f + ": la salida no puede ir en solo lectura");
    assert.match(h, /healthcheck:\s*\n\s+test: \["CMD", "node", "tuberia\/olivos\/salud\.mjs"\]/, f + ": healthcheck que lee estado.json (salud.mjs)");
    assert.match(h, /GEMELO_HORNERO_FINCAS:/, f + ": la finca que hornea");
    assert.ok(!/\/estado\/?:ro|\/estado.*olivos/.test(h), f + ": estado.json fuera de lo servido");
  }
  // el estado NO va a la carpeta servida: el servicio escribe en GEMELO_HORNERO_ESTADO y nunca en <salida>/<finca>/olivos/estado.json
  const sv = lee("tuberia/olivos/servicio.mjs");
  assert.match(sv, /estado: path\.join\(cfg\.estado, finca \+ "\.json"\)/, "servicio: pasa --estado fuera de la carpeta servida");
  // candado por finca con una librería mantenida (regla 12), liberado siempre, y sin vuelta diaria
  assert.match(sv, /import lockfile from "proper-lockfile"/); assert.match(sv, /ELOCKED/); assert.match(sv, /finally \{ await libera\(\)/, "el candado se libera siempre");
  assert.ok(!/diari/i.test(sv.split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n")), "sin vuelta diaria (decisión de Antonio): despierta con el cambio de época o con un sello distinto");
  assert.match(lee("tuberia/olivos/package.json"), /"proper-lockfile": "4\.1\.2"/); assert.match(lee("tuberia/olivos/package.json"), /"ajv": "8\.20\.0"/);
  const df = lee("tuberia/olivos/Dockerfile");
  assert.match(df, /^USER node$/m, "Dockerfile: usuario node"); assert.match(df, /npm ci --omit=dev/, "Dockerfile: dependencias del lock, sin desarrollo");
  assert.match(df, /^CMD \["node", "tuberia\/olivos\/servicio\.mjs"\]/m);
  // levanta.mjs y estado.mjs lo conocen
  assert.match(lee("infra/dev/herramientas/estado.mjs"), /const SERVICIOS = \[[^\]]*"hornero"\]/, "dev:estado enseña el hornero");
  assert.match(lee("infra/dev/herramientas/estado.mjs"), /salud\.mjs", "--json"/, "dev:estado lee la salud del hornero");
  assert.match(lee("infra/dev/herramientas/levanta.mjs"), /GEMELO_DEV_OLIVOS: olivosDestino\(\)/, "levanta: la carpeta del hornero la sirve Caddy");
});

test("ningún puerto publicado fuera de 127.0.0.1 (ni 0.0.0.0, ni sin IP)", () => {
  const txt = composeSinComentarios();
  assert.ok(!/0\.0\.0\.0|::\]?:/.test(txt), "aparece 0.0.0.0 o [::]");
  const bloques = [...txt.matchAll(/^\s+ports:\n((?:\s+- .*\n)+)/gm)].map(m => m[1]);
  assert.ok(bloques.length >= 4, "no encuentro los bloques ports:");
  for (const b of bloques) for (const l of b.split("\n").filter(Boolean)) assert.match(l, /^\s+- "127\.0\.0\.1:/, "puerto sin 127.0.0.1: " + l.trim());
  assert.ok(!/network_mode:\s*host/.test(txt), "network_mode: host salta el aislamiento");
});

// Interruptor de red local (--red-local, compose.red-local.yml): sin él, nada fuera de 127.0.0.1; con él, SOLO el https de la web
const IP_EJEMPLO = "192.0.2.10";                // TEST-NET-1 (RFC 5737): no es de nadie; solo para interpolar
test("red local: sin el interruptor todo en 127.0.0.1; con él solo el https de la web y los medios de LiveKit (7881/tcp, 7882/udp) en GEMELO_DEV_IP", t => {
  const extra = lee("infra/dev/compose.red-local.yml").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  assert.ok(!/0\.0\.0\.0|::\]?:/.test(extra), "el interruptor no abre a todas las interfaces");
  const puertosExtra = [...extra.matchAll(/^\s+- "(.*)"$/gm)].map(m => m[1]);
  assert.deepStrictEqual(puertosExtra, ["${GEMELO_DEV_IP:?falta GEMELO_DEV_IP (la pone levanta.mjs --red-local)}:${GEMELO_DEV_PUERTO_HTTPS:-8743}:8443",
    "${GEMELO_DEV_IP}:7881:7881", "${GEMELO_DEV_IP}:7882:7882/udp"], "el interruptor abre el https de Caddy y los medios de LiveKit, nada más (ni 7880)");
  assert.match(lee("infra/dev/compose.yml"), /SITIOS: "https:\/\/localhost:8443"/, "sin el interruptor, Caddy solo sirve https://localhost");
  assert.match(lee("infra/dev/Caddyfile"), /^\{\$SITIOS\} \{\n\ttls internal/m, "el sitio https sale de SITIOS, con la CA local");
  if (SIN_DOCKER) return t.skip(SIN_DOCKER + ": la validación con `docker compose config` NO se ha comprobado (las de texto sí)");
  const env = Object.assign({}, process.env, { GEMELO_DEV_TESELAS: "", GEMELO_DEV_FINCA_CARPETA: "", GEMELO_DEV_TILESET: "", GEMELO_DEV_IP: IP_EJEMPLO });
  delete env.COMPOSE_PROJECT_NAME;
  const conf = archivos => {
    const r = spawnSync("docker", ["compose"].concat(...archivos.map(f => ["-f", path.join(DEV, f)]), ["--env-file", EJEMPLO, "config", "--format", "json"]), { cwd: DEV, encoding: "utf8", env });
    assert.strictEqual(r.status, 0, "docker compose config falló:\n" + r.stderr);
    return JSON.parse(r.stdout);
  };
  const fuera = c => Object.entries(c.services).flatMap(([n, s]) => (s.ports || []).filter(p => p.host_ip !== "127.0.0.1").map(p => n + " " + p.host_ip + ":" + p.published + "->" + p.target));
  const sin = conf(["compose.yml"]);
  assert.deepStrictEqual(fuera(sin), [], "sin el interruptor (aunque GEMELO_DEV_IP esté puesta) nada escucha fuera de 127.0.0.1");
  const con = conf(["compose.yml", "compose.red-local.yml"]);
  assert.deepStrictEqual(fuera(con).sort(), ["livekit " + IP_EJEMPLO + ":7881->7881", "livekit " + IP_EJEMPLO + ":7882->7882", "web " + IP_EJEMPLO + ":8743->8443"], "con el interruptor, solo el https de la web y los medios de LiveKit en la IP de la red");
  assert.strictEqual(con.services.livekit.environment.NODE_IP, IP_EJEMPLO, "LiveKit anuncia la IP de la red como candidato ICE");
  assert.strictEqual(sin.services.livekit.environment.NODE_IP, "127.0.0.1", "sin el interruptor, el anfitrión");
  assert.ok(!/^\s*node_ip\s*:/m.test(lee("infra/dev/livekit.yaml")), "livekit.yaml no lleva node_ip: mandaría sobre NODE_IP y --red-local no serviría");
  assert.ok(con.services.web.ports.some(p => p.host_ip === "127.0.0.1" && p.target === 8443), "y sigue en 127.0.0.1");
  assert.strictEqual(con.services.web.environment.SITIOS, "https://localhost:8443, https://" + IP_EJEMPLO + ":8443");
  const a = con.services.api.environment;
  assert.strictEqual(a.GEMELO_URL_PUBLICA, "https://" + IP_EJEMPLO + ":8743", "el enlace del correo apunta a la IP");
  assert.deepStrictEqual(a.GEMELO_API_ORIGENES.split(","), ["https://localhost:8743", "https://" + IP_EJEMPLO + ":8743"], "la api admite los dos orígenes");
  assert.ok(!con.services.api.ports || !con.services.api.ports.length, "la api sigue sin puerto");
});

test("red local: solo se acepta una IPv4 privada (RFC 1918) como GEMELO_DEV_IP", async () => {
  const { esIpPrivada } = await import(pathToFileURL(path.join(HERR, "_comun.mjs")).href);
  for (const ip of ["192.168.1.20", "10.0.0.5", "172.16.0.1", "172.31.255.254"]) assert.ok(esIpPrivada(ip), ip);
  for (const ip of ["0.0.0.0", "127.0.0.1", "8.8.8.8", "172.32.0.1", "192.169.0.1", "256.1.1.1", "", "localhost", "::1", "192.168.1"]) assert.ok(!esIpPrivada(ip), ip);
});

test("ningún secreto escrito: las claves salen de infra/dev/.env (ignorado), la plantilla no trae valores y LiveKit no lleva keys", () => {
  const txt = composeSinComentarios();
  for (const m of txt.matchAll(/^\s*([A-Z_]*(?:PASSWORD|CLAVE|SECRETO|SECRET|KEYS?|TOKEN)[A-Z_]*):\s*(.+)$/gm)) assert.match(m[2], /^("?\$\{|\/run\/secrets\/[a-z_]+$)/, m[1] + " debe venir de una variable o de un secreto, no escrito: " + m[2]);
  for (const m of lee("infra/dev/ejemplo.env").matchAll(/^(GEMELO_DEV_[A-Z_]*(?:CLAVE|SECRETO))=(.*)$/gm)) assert.strictEqual(m[2], "la-genera-levanta", m[1] + ": la plantilla no lleva valores");
  assert.ok(/^GEMELO_DEV_SESION_SECRETO=la-genera-levanta$/m.test(lee("infra/dev/ejemplo.env")), "la plantilla declara el secreto de la sesión");
  assert.ok(/^GEMELO_DEV_PG_API_CLAVE=la-genera-levanta$/m.test(lee("infra/dev/ejemplo.env")), "la plantilla declara la clave del rol de la api");
  for (const m of txt.matchAll(/^\s+(pg_[a-z]+):\s*\{\s*environment:\s*(\w+)\s*\}/gm)) assert.match(m[2], /^GEMELO_DEV_[A-Z_]*CLAVE$/, "secreto " + m[1] + ": de una clave de .env");
  assert.ok(!/^\s*keys\s*:/m.test(lee("infra/dev/livekit.yaml")), "livekit.yaml no debe llevar claves");
  const ign = spawnSync("git", ["check-ignore", "-q", "infra/dev/.env"], { cwd: RAIZ });
  assert.strictEqual(ign.status, 0, "infra/dev/.env debe estar ignorado por git");
});

test("Caddyfile de dev con la forma de producción: portada pública, /finca/ y /teselas/ tras sesión, /api/interno cerrada", () => {
  const c = lee("infra/dev/Caddyfile").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  assert.match(c, /handle \/api\/interno\/\* \{\s*respond 404\s*\}/, "/api/interno/* debe dar 404 desde fuera");
  assert.match(c, /handle \/api\/\* \{[^}]*\{[^}]*\}\s*reverse_proxy api:8000/, "/api/* va a la api");
  assert.match(c, /@con_sesion path \/finca \/finca\/\* \/teselas\/\*/, "/finca y /teselas en el matcher de sesión");
  assert.match(c, /handle @con_sesion \{\s*forward_auth api:8000 \{\s*uri \/api\/interno\/autoriza\s*\}/, "forward_auth a /api/interno/autoriza");
  assert.ok(c.indexOf("handle_path /teselas/*") > c.indexOf("handle @con_sesion"), "las teselas, dentro del bloque con sesión");
  assert.ok(c.indexOf("handle_path /finca/*") > c.indexOf("handle @con_sesion"), "el mundo, dentro del bloque con sesión");
  assert.match(c, /root \* \/srv\/portada/, "la portada pública");
  assert.match(lee("infra/dev/compose.yml"), /\.\.\/\.\.\/apps\/web\/dist-portada:\/srv\/portada:ro/, "la portada es el build de apps/web/portada");
});

test("la oficina (ADR-0024): /oficina/ solo con sesión de oficina en los dos Caddyfile; su página, sin three ni nada en línea", () => {
  const sinComentarios = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  for (const f of ["infra/Caddyfile", "infra/dev/Caddyfile"]) {
    const c = sinComentarios(f);
    assert.match(c, /@oficina path \/oficina \/oficina\/\*/, f + ": /oficina en su matcher");
    assert.match(c, /handle @oficina \{\s*forward_auth api:8000 \{\s*uri \/api\/interno\/autoriza\?para=oficina\s*\}/, f + ": forward_auth con ?para=oficina, lo primero del bloque");
    const bloque = c.slice(c.indexOf("handle @oficina {"), c.indexOf("@con_sesion"));
    assert.ok(c.indexOf("handle @oficina {") >= 0 && bloque.length > 0, f + ": el bloque de la oficina va antes del de sesión");
    assert.ok(!/\/srv\/(portada|web)\b|\/finca/.test(bloque.replace(/redir \/oficina \/oficina\/ 308/, "")), f + ": la oficina no sirve la portada ni el mundo");
    assert.ok(!/@con_sesion path[^\n]*oficina/.test(c), f + ": /oficina no cuelga de la sesión de hogar");
  }
  assert.match(lee("infra/dev/compose.yml"), /\.\.\/\.\.\/apps\/web\/dist-oficina:\/srv\/oficina:ro/, "la oficina es el build de apps/web/oficina");
  assert.match(lee("apps/web/package.json"), /"build:oficina": "vite build --config vite.oficina.config.js"/);
  assert.match(lee("apps/web/vite.oficina.config.js"), /base: "\/oficina\/"/);
  const html = lee("apps/web/oficina/index.html"), js = lee("apps/web/oficina/oficina.js"), css = lee("apps/web/oficina/oficina.css");
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(html), "nada de estilos ni manejadores en línea");
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) assert.strictEqual(m[1].trim(), "", "un <script> con código en línea");
  // desde OF2 la oficina importa sus propios módulos (y OpenLayers en Hazas): lo que no puede es cargar three ni el motor
  const fuentesOf = fs.readdirSync(path.join(RAIZ, "apps/web/oficina")).filter(f => f.endsWith(".js")).map(f => lee("apps/web/oficina/" + f)).join("\n");
  assert.ok(js.length > 0 && !/from\s+["']three["']|from\s+["'][^"']*motor\//.test(fuentesOf), "la oficina no carga three ni el motor");
  assert.ok(!/https?:\/\//.test(js) && !/@import|url\(\s*["']?https?:/i.test(css), "solo su mismo origen");
  assert.ok(!/innerHTML|insertAdjacentHTML|eval\(|new Function/.test(js), "sin HTML a mano");
  assert.match(html, /<html lang="es"/);
});

test("portada y entrada (apps/web/portada): sin nada en línea (CSP estricta), solo su mismo origen, accesible y con la versión de normas de la api", () => {
  const html = lee("apps/web/portada/index.html"), js = lee("apps/web/portada/portada.js"), css = lee("apps/web/portada/portada.css");
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(html), "nada de estilos ni manejadores en línea (style-src 'self', script-src 'self')");
  for (const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) assert.strictEqual(m[1].trim(), "", "un <script> con código en línea");
  assert.ok(!/\.style\b|setAttribute\(\s*["']style|innerHTML|insertAdjacentHTML|eval\(|new Function/.test(js), "el JS no escribe estilos en línea ni HTML a mano");
  assert.ok(!/https?:\/\//.test(js.replace(/http:\/\/www\.w3\.org\/2000\/svg/g, "")), "el JS solo pide a su mismo origen");
  assert.ok(!/@import|url\(\s*["']?https?:/i.test(css), "el CSS no trae nada de fuera");
  assert.match(html, /<form id="fEntrar"[^>]*method="post" action="\/api\/auth\/enlace"/, "sin JS, el formulario manda el enlace igual");
  assert.match(html, /<html lang="es"/);
  assert.ok(!/@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/i.test(html + js), "la portada no nombra correos reales");
  // cada pantalla con su h1 enfocable; cada campo con su etiqueta
  const pantallas = [...html.matchAll(/<section class="pant[^"]*" id="p-([a-z]+)"/g)].map(m => m[1]);
  assert.deepStrictEqual(pantallas, ["portada", "entrar", "revisa", "vincular", "bienvenida", "alias", "avatar", "creditos", "dispositivos"]);
  assert.strictEqual((html.match(/<h1 id="t-[a-z]+" tabindex="-1">/g) || []).length, pantallas.length, "un h1 enfocable por pantalla");
  for (const m of html.matchAll(/<input id="([A-Za-z]+)" type="(?:text|email)"/g)) assert.match(html, new RegExp('<label for="' + m[1] + '">'), "el campo " + m[1] + " sin etiqueta");
  assert.match(css, /--toque: 44px/); assert.match(css, /html\[data-disp="quest"\][^}]*--toque: 56px/);
  const api = /export const NORMAS_VERSION = (\d+);/.exec(lee("apps/api/src/auth/servicio.ts")), web = /export const NORMAS_VERSION = (\d+);/.exec(js);
  assert.ok(api && web && api[1] === web[1], "NORMAS_VERSION distinta en la api y en la portada");
});

test("siembra sintética: desde_fixture.py da 4 hazas y los olivos del fixture, y se niega con un índice no sintético", t => {
  const py = python();
  if (!py) return t.skip("sin Python 3: la siembra NO se ha comprobado");
  if (spawnSync(py, ["-c", "import jsonschema"], { encoding: "utf8" }).status !== 0) return t.skip("sin jsonschema (pip install -r tuberia/hazas/requirements.txt): la siembra NO se ha comprobado");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-siembra-"));
  const fx = ejecuta(py, ["-I", "pruebas/genera_fixture.py", "--salida", path.join(tmp, "fx"), "--sin-tileset"]);
  assert.strictEqual(fx.status, 0, fx.stderr);
  const indice = path.join(tmp, "fx", "hituelo", "indice.json");
  const r = ejecuta(py, ["tuberia/hazas/desde_fixture.py", "--indice", indice, "--salida", path.join(tmp, "s")]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), { hazas: 4, olivos: 140, salida: "hazas.sql" });
  const hz = JSON.parse(fs.readFileSync(path.join(tmp, "s", "hazas.sintetico.geojson"), "utf8"));
  assert.strictEqual(hz.sintetico, true);
  assert.deepStrictEqual(hz.features.map(f => f.properties.codigo), ["H-D01", "H-D02", "H-D03", "H-D04"]);
  // un índice que no diga que es sintético no se convierte (las hazas reales las dibuja la oficina)
  const I = JSON.parse(fs.readFileSync(indice, "utf8")); I.paisaje.fuente = "IGN";
  fs.writeFileSync(path.join(tmp, "real.json"), JSON.stringify(I));
  const no = ejecuta(py, ["tuberia/hazas/desde_fixture.py", "--indice", path.join(tmp, "real.json"), "--salida", path.join(tmp, "n")]);
  assert.notStrictEqual(no.status, 0, "debía negarse con un índice no sintético");
  const s = lee("infra/dev/herramientas/siembra.mjs");
  for (const m of s.matchAll(/correo:\s*"([^"]+)"/g)) assert.match(m[1], /@example\.com$/, "hogar de prueba fuera de example.com: " + m[1]);
});

test("Hituelo v3 en local: finca y tileset fuera del repo se montan de solo lectura y Caddy los sirve en /teselas/<finca>/ y /teselas/<finca>/tileset/", async () => {
  const comp = composeSinComentarios();
  assert.match(comp, /GEMELO_DEV_FINCA_CARPETA:-.*:\/srv\/finca:ro/, "la carpeta de la finca, de solo lectura");
  assert.match(comp, /\$\{GEMELO_DEV_TILESET:-[^}]+\}:\/srv\/tileset:ro/, "el tileset, de solo lectura");
  assert.match(comp, /FINCA_SERVIDA: "\$\{GEMELO_DEV_FINCA:-hituelo\}"/);
  const c = lee("infra/dev/Caddyfile").split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  assert.match(c, /@tileset path \/\{\$FINCA_SERVIDA:hituelo\}\/tileset\/\*/, "Caddy sirve el tileset de la finca servida");
  assert.match(c, /root \* \/srv\/tileset/); assert.match(c, /root \* \/srv\/finca/); assert.match(c, /root \* \/srv\/teselas/);
  assert.ok(c.indexOf("@tileset") < c.indexOf("@finca"), "el tileset antes que el resto de la finca (si no, /srv/finca lo taparía)");
  // las rutas de datos reales no pueden caer dentro del repo (salvo pruebas/salida/, ignorada)
  const cm = await import(pathToFileURL(path.join(HERR, "_comun.mjs")).href);
  const antes = { f: process.env.GEMELO_DEV_FINCA_CARPETA, t: process.env.GEMELO_DEV_TILESET };
  try {
    for (const [v, f] of [["GEMELO_DEV_FINCA_CARPETA", cm.carpetaFinca], ["GEMELO_DEV_TILESET", cm.carpetaTileset]]) {
      process.env[v] = path.join(RAIZ, "apps");
      assert.throws(f, /dentro del repo/, v + " dentro del repo");
      process.env[v] = path.join(RAIZ, "pruebas", "salida", "x");
      assert.ok(f().endsWith("x"), v + " en pruebas/salida/ sí vale");
      process.env[v] = path.join(os.tmpdir(), "fuera");
      assert.strictEqual(f(), path.join(os.tmpdir(), "fuera"));
    }
  } finally {
    for (const [v, a] of [["GEMELO_DEV_FINCA_CARPETA", antes.f], ["GEMELO_DEV_TILESET", antes.t]]) { if (a === undefined) delete process.env[v]; else process.env[v] = a; }
  }
  // el build del entorno local pide el constructor de olivos y 3DTilesRendererJS, no sus sustitutos vacíos
  const l = lee("infra/dev/herramientas/levanta.mjs");
  assert.match(l, /three-gen/); assert.match(l, /3d-tiles-renderer/);
});

test("avatares VRM (P7b): /avatares/<id>.vrm y catalogo.json solo con sesión, el .vrm inmutable (se pide con ?v=<sha256>), el catálogo revalidado, lo demás 404, en dev y en producción", async () => {
  const sinC = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  for (const [nombre, f] of [["dev", "infra/dev/Caddyfile"], ["producción", "infra/Caddyfile"]]) {
    const c = sinC(f);
    assert.match(c, /@con_sesion path [^\n]*\/avatares \/avatares\/\*/, nombre + ": /avatares va en el bloque con sesión (forward_auth)");
    assert.ok(c.indexOf("@avatares path") > c.indexOf("handle @con_sesion"), nombre + ": dentro del bloque con sesión");
    assert.match(c, /@avatar_permitido path_regexp \^\/avatares\/\(\[a-z0-9-\]\{1,32\}\\\.vrm\|catalogo\\\.json\)\$/, nombre + ": SOLO <id>.vrm y catalogo.json");
    assert.match(c, /header @avatar_vrm \{\s*Content-Type "model\/gltf-binary"\s*Cache-Control "private, max-age=31536000, immutable"\s*\}/, nombre + ": el .vrm, inmutable y con su tipo");
    assert.match(c, /@avatar_catalogo path \/avatares\/catalogo\.json\s*header @avatar_catalogo Cache-Control "private, no-cache"/, nombre + ": el catálogo se revalida");
    assert.match(c, /root \* \/srv\/avatares\s*file_server \{\s*precompressed br zstd gzip\s*hide \.\*\s*\}/, nombre + ": desde /srv/avatares, con los precomprimidos");
    assert.match(c, /handle @avatar_permitido \{[\s\S]*?\}\s*handle \{\s*header Cache-Control "no-store"\s*respond "404 Not Found" 404\s*\}\s*\}/, nombre + ": lo demás de avatares/ (los .br, .zst, .gz pedidos directamente, ficheros ocultos…) da 404");
  }
  assert.match(composeSinComentarios(), /\$\{GEMELO_AVATARES:-\.\.\/\.\.\/pruebas\/salida\/avatares\}:\/srv\/avatares:ro/, "dev: la carpeta del catálogo, de solo lectura, por defecto en pruebas/salida");
  assert.match(lee("infra/compose.yml"), /\/srv\/gemelo\/publicado:\/srv:ro/, "producción: /srv/avatares sale de /srv/gemelo/publicado/avatares");
  assert.match(lee("infra/dev/herramientas/levanta.mjs"), /GEMELO_AVATARES: carpetaAvatares\(\)/, "levanta pasa la carpeta al compose");
  assert.match(lee("infra/dev/ejemplo.env"), /GEMELO_AVATARES=/, "documentada en ejemplo.env");
  const cm = await import(pathToFileURL(path.join(HERR, "_comun.mjs")).href), antes = process.env.GEMELO_AVATARES;
  try {
    delete process.env.GEMELO_AVATARES; assert.ok(cm.carpetaAvatares().endsWith(path.join("pruebas", "salida", "avatares")));
    process.env.GEMELO_AVATARES = path.join(RAIZ, "apps"); assert.throws(cm.carpetaAvatares, /dentro del repo/);
  } finally { if (antes === undefined) delete process.env.GEMELO_AVATARES; else process.env.GEMELO_AVATARES = antes; }
});

test("recetas horneadas (O7d): /teselas/<finca>/olivos/<huella>.br sale en brotli e inmutable y los manifiestos se revalidan, en dev y en producción, tras sesión", async () => {
  const sinC = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
  const objeto = "Content-Type \"application/octet-stream\"\\s*Content-Encoding \"br\"\\s*Cache-Control \"private, max-age=31536000, immutable\"";
  // desarrollo: dentro del bloque con sesión, antes que el resto de la finca (si no, /srv/finca lo taparía), desde /srv/olivos
  const d = sinC("infra/dev/Caddyfile");
  assert.match(d, /@olivos path \/\{\$FINCA_SERVIDA:hituelo\}\/olivos\/\*/, "Caddy de dev: la ruta de las recetas de la finca servida");
  assert.ok(d.indexOf("@olivos path") > d.indexOf("handle @con_sesion") && d.indexOf("@olivos path") < d.indexOf("@finca path"), "tras sesión y antes que @finca");
  assert.match(d, /root \* \/srv\/olivos/, "dev: las recetas salen de /srv/olivos");
  assert.match(d, new RegExp("@objeto_horneado path_regexp \\^/\\{\\$FINCA_SERVIDA:hituelo\\}/olivos/\\[0-9a-f\\]\\{32\\}\\\\\\.br\\$\\s*header @objeto_horneado \\{\\s*" + objeto), "dev: el objeto (32 hex), octet-stream + br + immutable");
  assert.match(d, /@manifiesto path \/\{\$FINCA_SERVIDA:hituelo\}\/olivos\/manifiesto\.json\s*header @manifiesto Cache-Control "private, no-cache"/, "dev: el manifiesto se revalida (con la ruta entera: el header se evalúa antes que el uri strip_prefix)");
  assert.match(d, /@permitido path_regexp \^\/\{\$FINCA_SERVIDA:hituelo\}\/olivos\/\(manifiesto\\\.json\|\[0-9a-f\]\{32\}\\\.br\|\[0-9a-f\]\{32\}\\\.webp\)\$\s*handle @permitido \{/, "dev: SOLO manifiesto.json y <huella>.br");
  assert.match(d, /handle @permitido \{[\s\S]*?\}\s*handle \{\s*header Cache-Control "no-store"\s*respond "404 Not Found" 404\s*\}/, "dev: lo demás de olivos/ (estado.json, manifiesto.anterior.json, t/…) da 404");
  assert.match(composeSinComentarios(), /\$\{GEMELO_DEV_OLIVOS:-.+\}:\/srv\/olivos:ro/, "dev: la carpeta del hornero, de solo lectura");
  // producción: el mismo contrato; el resto de /teselas/ conserva su caché (el matcher excluye lo horneado: no depende del orden)
  const p = sinC("infra/Caddyfile");
  assert.ok(p.indexOf("@olivos_objeto") > p.indexOf("handle @con_sesion"), "producción: tras sesión");
  assert.match(p, new RegExp("@olivos_objeto path_regexp \\^/teselas/\\[\\^/\\]\\+/olivos/\\[0-9a-f\\]\\{32\\}\\\\\\.br\\$\\s*header @olivos_objeto \\{\\s*" + objeto), "producción: el objeto (32 hex)");
  // O8c: los atlas de los impostores (contratos/olivo-impostor.md §4), en los dos: image/webp, inmutables y SIN Content-Encoding (el WebP ya va comprimido)
  const bloque = (txt, m) => { const i = txt.indexOf(m + " path_regexp "); const j = txt.indexOf("header " + m + " {", i); return i < 0 || j < 0 ? "" : txt.slice(i, txt.indexOf("}", j) + 1); };
  for (const [nombre, txt, m, ruta] of [["dev", d, "@atlas_impostor", "^/{$FINCA_SERVIDA:hituelo}/olivos/[0-9a-f]{32}\\.webp$"], ["producción", p, "@olivos_atlas", "^/teselas/[^/]+/olivos/[0-9a-f]{32}\\.webp$"]]) {
    const b = bloque(txt, m);
    assert.ok(b.startsWith(m + " path_regexp " + ruta), nombre + ": el atlas (32 hex .webp): " + b.slice(0, 120));
    assert.ok(b.includes("Content-Type \"image/webp\"") && b.includes("Cache-Control \"private, max-age=31536000, immutable\"") && !b.includes("Content-Encoding"), nombre + ": el atlas, image/webp + immutable y sin Content-Encoding");
  }
  assert.ok(p.indexOf("@olivos_atlas") > p.indexOf("handle @con_sesion"), "producción: el atlas, tras sesión");
  assert.match(p, /@olivos_manifiesto path_regexp \^\/teselas\/\[\^\/\]\+\/olivos\/manifiesto\\\.json\$\s*header @olivos_manifiesto Cache-Control "private, no-cache"/, "producción: el manifiesto");
  assert.match(p, /@olivos_otros \{\s*path_regexp \^\/teselas\/\[\^\/\]\+\/olivos\(\/\|\$\)\s*not path_regexp \^\/teselas\/\[\^\/\]\+\/olivos\/\(manifiesto\\\.json\|\[0-9a-f\]\{32\}\\\.br\|\[0-9a-f\]\{32\}\\\.webp\)\$\s*\}\s*header @olivos_otros Cache-Control "no-store"\s*respond @olivos_otros "404 Not Found" 404/, "producción: lo demás de olivos/ (estado.json, manifiesto.anterior.json, t/…) da 404");
  assert.match(p, /@teselas \{\s*path \/teselas\/\*\s*not path_regexp \^\/teselas\/\[\^\/\]\+\/olivos\(\/\|\$\)\s*\}\s*header @teselas Cache-Control "private, max-age=3600"/, "producción: el resto de /teselas/ no cambia y no pisa lo horneado");
  // el contrato lo dice igual
  assert.match(lee("contratos/olivo-horneado.md"), /Content-Encoding: br/);
  // la variable apunta a una carpeta fuera del repo (o pruebas/salida/)
  const cm = await import(pathToFileURL(path.join(HERR, "_comun.mjs")).href), antes = process.env.GEMELO_DEV_OLIVOS;
  try {
    delete process.env.GEMELO_DEV_OLIVOS; assert.strictEqual(cm.carpetaOlivos(), null);
    process.env.GEMELO_DEV_OLIVOS = path.join(RAIZ, "apps"); assert.throws(cm.carpetaOlivos, /dentro del repo/);
    process.env.GEMELO_DEV_OLIVOS = path.join(RAIZ, "pruebas", "salida", "olivos-x"); assert.ok(cm.carpetaOlivos().endsWith("olivos-x"));
  } finally { if (antes === undefined) delete process.env.GEMELO_DEV_OLIVOS; else process.env.GEMELO_DEV_OLIVOS = antes; }
});

test("levanta.mjs reinstala con `npm ci` cuando el package-lock ya no corresponde a node_modules (una dependencia nueva), no solo cuando falta", async () => {
  const cm = await import(pathToFileURL(path.join(HERR, "_comun.mjs")).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-lock-"));
  try {
    const lock = pk => JSON.stringify({ lockfileVersion: 3, packages: Object.assign({ "": {} }, pk) });
    const escribe = (f, c) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), c); };
    escribe("package-lock.json", lock({ "node_modules/a": { version: "1.0.0" }, "node_modules/d": { version: "2.0.0", dev: true } }));
    assert.strictEqual(cm.lockAlDia(dir), false, "sin node_modules");
    escribe("node_modules/.package-lock.json", lock({ "node_modules/a": { version: "1.0.0" } }));
    assert.strictEqual(cm.lockAlDia(dir), false, "falta un paquete de desarrollo instalado");
    assert.strictEqual(cm.lockAlDia(dir, { sinDev: true }), true, "con --omit=dev los de desarrollo no cuentan (y deja el sello)");
    assert.strictEqual(cm.lockAlDia(dir, { sinDev: true }), true, "con sello, igual");
    // el lock gana una dependencia (livekit-client): el sello ya no coincide
    escribe("package-lock.json", lock({ "node_modules/a": { version: "1.0.0" }, "node_modules/livekit-client": { version: "2.0.0" } }));
    assert.strictEqual(cm.lockAlDia(dir, { sinDev: true }), false, "dependencia nueva en el lock");
    // sin sello y con otra versión instalada
    fs.rmSync(path.join(dir, "node_modules", ".gemelo-lock-sello"));
    escribe("package-lock.json", lock({ "node_modules/a": { version: "1.1.0" } }));
    assert.strictEqual(cm.lockAlDia(dir), false, "otra versión de la misma dependencia");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  const l = lee("infra/dev/herramientas/levanta.mjs");
  assert.match(l, /aseguraNpmCi\(WEB,/); assert.match(l, /aseguraNpmCi\(olivo, \{ sinDev: true/);
  assert.match(lee("infra/dev/herramientas/_comun.mjs"), /aseguraNpmCi\(HERRAMIENTAS,/);
});

test("siembra de prueba: de_prueba.py coloca 4 hazas inventadas DENTRO de las copas de cualquier finca, sin olivos y marcadas como de prueba", t => {
  const py = python();
  if (!py) return t.skip("sin Python 3: la siembra de prueba NO se ha comprobado");
  if (spawnSync(py, ["-c", "import jsonschema"], { encoding: "utf8" }).status !== 0) return t.skip("sin jsonschema: la siembra de prueba NO se ha comprobado");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-prueba-"));
  // un índice con copas repartidas por una caja grande, como el de una finca real (inventado aquí)
  const copas = []; for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) copas.push([-400 + i * 20, -300 + j * 15, 4]);
  const ind = path.join(tmp, "indice.json");
  fs.writeFileSync(ind, JSON.stringify({ finca_id: "hituelo", centro_utm: [405775, 4178870], copas }));
  const r = ejecuta(py, ["tuberia/hazas/de_prueba.py", "--indice", ind, "--salida", path.join(tmp, "s")]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), { hazas: 4, olivos: 0, salida: "hazas.sql" });
  const hz = JSON.parse(fs.readFileSync(path.join(tmp, "s", "hazas.prueba.geojson"), "utf8"));
  assert.strictEqual(hz.sintetico, true);
  assert.deepStrictEqual(hz.features.map(f => f.properties.codigo), ["H-D01", "H-D02", "H-D03", "H-D04"], "los códigos de los hogares de prueba");
  for (const f of hz.features) {
    assert.match(f.properties.nombre, /de prueba, inventada/);
    assert.strictEqual(f.properties.olivos_declarados, null); assert.deepStrictEqual(f.properties.parcelas_ot, []);
    for (const [x, y] of f.geometry.coordinates[0]) assert.ok(x > 405775 - 450 && x < 405775 + 450 && y > 4178870 - 350 && y < 4178870 + 350, "dentro de la caja de copas");
  }
  const s = lee("infra/dev/herramientas/siembra.mjs");
  assert.match(s, /de_prueba\.py/); assert.match(s, /DELETE FROM olivos/);
});

test("scripts dev:arriba, dev:abajo y dev:estado en el package.json raíz, y dependencias de las herramientas con versión exacta", () => {
  const s = JSON.parse(lee("package.json")).scripts;
  for (const [k, f] of [["dev:arriba", "levanta.mjs"], ["dev:abajo", "para.mjs"], ["dev:estado", "estado.mjs"]]) {
    assert.strictEqual(s[k], "node infra/dev/herramientas/" + f, k);
    assert.ok(fs.existsSync(path.join(HERR, f)), f + " no existe");
  }
  const deps = JSON.parse(lee("infra/dev/herramientas/package.json")).dependencies;
  for (const [n, v] of Object.entries(deps)) assert.match(v, /^\d+\.\d+\.\d+$/, n + "@" + v + ": versión exacta");
  assert.ok(fs.existsSync(path.join(HERR, "package-lock.json")), "falta infra/dev/herramientas/package-lock.json");
});

// ——— e2e opcional ———
const SALTO_E2E = process.env.GEMELO_DOCKER !== "1" ? "e2e de Docker opcional (GEMELO_DOCKER=1): el entorno levantado y el recorrido de entrada NO se han comprobado"
  : SIN_DOCKER ? SIN_DOCKER + ": el entorno levantado NO se ha comprobado" : motivoSalto("el recorrido de entrada");

const COOKIE = "__Host-gemelo";
/** Claves que nunca pueden salir en una ficha ni en el GeoJSON (titular, kilos, personas, GPS) */
const PROHIBIDAS = /titular|hogar|correo|e?mail|kilo|persona|usuario|tel[eé]fono|gps|(^|_)(kg|lat|lon|lng|ip)(_|$)/i;
function revisaListaBlanca(o, ruta, correos) {
  if (Array.isArray(o)) return o.forEach((v, i) => revisaListaBlanca(v, ruta + "[" + i + "]", correos));
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o)) { assert.ok(!PROHIBIDAS.test(k), "campo prohibido " + ruta + "." + k); revisaListaBlanca(v, ruta + "." + k, correos); }
    return;
  }
  if (typeof o === "string") {
    assert.ok(!o.includes("@"), "un correo en " + ruta + ": " + o);
    for (const c of correos) assert.ok(!o.includes(c.split("@")[0]), "el correo de un hogar en " + ruta);
  }
}

test("e2e: recorrido de entrada en local (enlace mágico por Mailpit, sesión, hazas con lista blanca, el mundo en /finca/) y lo baja", { timeout: 900000 }, async t => {
  if (SALTO_E2E) return t.skip(SALTO_E2E);
  const sueltaTurno = await require("../banco/turno").pide("docker: e2e de entrada");   // un solo Docker o Chrome de pruebas a la vez (TESTING.md)
  try {
  const imp = f => import(pathToFileURL(path.join(HERR, f)).href);
  const { levanta } = await imp("levanta.mjs"), { para } = await imp("para.mjs"), { estado } = await imp("estado.mjs");
  const comun = await imp("_comun.mjs"), { HOGARES, HAZAS_SIN_ASIGNAR } = await imp("siembra.mjs");
  const Ajv = require("ajv");
  const antes = comun.compose(["ps", "-q"], { captura: true }).stdout.trim() !== "";
  // el tileset 3D Tiles que sirve Caddy: el de GEMELO_DEV_TILESET (datos reales, fuera del repo) o, sin él, el tileset/ del fixture, que
  // levanta.mjs genera con el fixture si falta (T8 fase 2: npm run fixture trae el tileset de las dos fincas). Sin Python, esa parte se salta y se dice
  let tilesetMotivo = "";
  if (!process.env.GEMELO_DEV_TILESET && !DE_PRUEBA && !python()) tilesetMotivo = "sin Python 3 para generar el fixture (y su tileset)";
  // la carpeta del hornero de este e2e: vacía al empezar (así se mide la primera vuelta desde cero) y distinta de la del entorno de uso
  // (pruebas/salida/olivos-dev/<finca>); con GEMELO_DEV_OLIVOS dada, es la de la persona y no se toca
  if (!process.env.GEMELO_DEV_OLIVOS) {
    const dir = path.join(RAIZ, "pruebas", "salida", "olivos-e2e");
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    // el estado del hornero (su índice clave → huella) vive en un volumen que `down` conserva: con la carpeta vacía y el volumen de una pasada anterior
    // creería que todo está horneado y no escribiría nada (sin manifiesto). Con el entorno parado, el volumen no lo usa nadie: se borra (solo el de este proyecto)
    if (!antes) spawnSync("docker", ["volume", "rm", "-f", (process.env.COMPOSE_PROJECT_NAME || "gemelo-dev") + "_hornero_estado"], { encoding: "utf8" });
    process.env.GEMELO_DEV_OLIVOS = dir;
  }
  const tiempos = {}, reloj = () => { const t0 = Date.now(); return () => ((Date.now() - t0) / 1000); };
  let r0 = reloj();
  const { sembrado } = await levanta();
  tiempos.arriba = r0();
  // las recetas horneadas (O7f): `levanta` esperó a que el servicio hornero estuviera sano; su manifiesto es el real (fixture, brotli 9) y el
  // objeto es uno de los suyos. Lo que NO debe salir (estado, manifiesto anterior, un manifiesto de tesela) se planta aquí al lado, como decoy.
  let olivosHorneados = null, primeraVuelta = null;
  {
    const dir = process.env.GEMELO_DEV_OLIVOS;
    const mp = path.join(dir, "manifiesto.json");
    // `up --wait` da por sano al hornero mientras hornea (la salud admite una vuelta en curso): se espera al manifiesto, que se escribe el último
    for (let i = 0; i < 240 && !fs.existsSync(mp); i++) await new Promise(ok => setTimeout(ok, 500));
    assert.ok(fs.existsSync(mp), "el hornero debió dejar " + mp + " antes de que `up --wait` diera el entorno por sano");
    const man = JSON.parse(fs.readFileSync(mp, "utf8")), h = man.variantes[0].huella;
    for (const n of ["estado.json", "manifiesto.anterior.json"]) fs.writeFileSync(path.join(dir, n), "{}");
    fs.mkdirSync(path.join(dir, "t"), { recursive: true }); fs.writeFileSync(path.join(dir, "t", "0_0.olivos"), Buffer.from("OLVT"));
    fs.writeFileSync(path.join(dir, "0123456789abcdef0123456789abcdef.webp"), Buffer.from("RIFF0000WEBP"));   // O8c: un atlas de impostor (el hornero alpine no los hace)
    olivosHorneados = { huella: h, bytesBr: fs.statSync(path.join(dir, h + ".br")).size, bytesManifiesto: fs.statSync(mp).size, variantes: man.variantes.length };
    // el estado del hornero vive en su volumen (fuera de la carpeta servida): de ahí sale cuánto tardó la primera vuelta
    let e, st;
    for (let i = 0; i < 60; i++) {   // tras el manifiesto aún limpia y escribe «listo»
      e = comun.compose(["exec", "-T", "hornero", "cat", "/estado/" + comun.fincaServida() + ".json"], { captura: true });
      assert.strictEqual(e.status, 0, "estado del hornero: " + e.stderr);
      st = JSON.parse(e.stdout);
      if (st.fase === "listo") break;
      await new Promise(ok => setTimeout(ok, 500));
    }
    assert.strictEqual(st.fase, "listo"); assert.strictEqual(st.error, null);
    assert.strictEqual(st.hechas, st.total, "el hornero horneó todo lo que quería");
    primeraVuelta = { ms: Date.parse(st.terminado_en) - Date.parse(st.empezado_en), total: st.total, horneadas: st.horneadas, bytesBr: man.variantes.reduce((s, f) => s + f.bytes_br, 0) };
    assert.ok(!fs.existsSync(path.join(dir, "estado.json")) || fs.readFileSync(path.join(dir, "estado.json"), "utf8") === "{}", "el hornero no escribe su estado en la carpeta servida");
  }
  try {
    // todo por https://localhost (la cookie de sesión es Secure: por http no hay sesión), verificando con la CA local de Caddy
    const p = comun.puertos(), base = "https://localhost:" + p.https, buzon = "http://127.0.0.1:" + p.correoWeb, ca = comun.caLocal();
    const yo = HOGARES[0], vecino = HOGARES[1], mirlo = HOGARES[2], correos = HOGARES.map(h => h.correo);
    assert.deepStrictEqual({ hazas: sembrado.hazas, hogares: sembrado.hogares }, { hazas: 4, hogares: 3 }, "siembra");
    const e = await estado();
    assert.ok(e.ok, "estado no sano:\n" + JSON.stringify(e, null, 1));
    assert.deepStrictEqual(e.red, { abiertos: [], indebidos: [] }, "sin --red-local, Docker no publica nada fuera de 127.0.0.1");
    t.diagnostic("arriba (build de la web y de la api, migraciones y siembra) en " + tiempos.arriba.toFixed(1) + " s; " + e.externas.map(x => x.servicio + ": " + x.detalle).join(" | "));

    // node:https y no fetch: fetch no deja poner Sec-Fetch-Mode (para simular una navegación) ni pasar la CA
    const pide = (ruta, o = {}) => comun.pideHttps(p.https, ruta, { method: o.method, body: o.body, ca,
      headers: Object.assign({}, o.headers, o.cookie ? { cookie: COOKIE + "=" + o.cookie } : {}) });
    const json = async (ruta, cookie) => { const r = await pide(ruta, { cookie }); return { status: r.status, cuerpo: r.status === 200 ? JSON.parse(r.texto) : r.texto, r }; };

    // 0. por http solo la salud; lo demás va a https
    const h = await fetch("http://localhost:" + p.web + "/finca/", { redirect: "manual" });
    assert.deepStrictEqual([h.status, h.headers.get("location")], [308, base + "/finca/"], "http redirige a https");

    // 1. sin sesión, solo la portada (decisión 16)
    const portada = await pide("/");
    assert.strictEqual(portada.status, 200);
    for (const h of ["content-security-policy-report-only", "x-content-type-options", "referrer-policy", "permissions-policy", "cross-origin-opener-policy"]) assert.ok(portada.cabeceras[h], "falta la cabecera " + h);
    assert.ok(!portada.cabeceras.server, "Caddy no debe anunciarse (Server)");
    assert.match(portada.texto, /action="\/api\/auth\/enlace"/);
    const nav303 = await pide("/finca/", { headers: { "sec-fetch-mode": "navigate" } });
    assert.deepStrictEqual([nav303.status, nav303.cabeceras.location], [303, "/"], "abrir /finca/ sin sesión lleva a la portada");
    for (const ruta of ["/finca/", "/teselas/hituelo/indice.json", "/api/hazas", "/api/hazas/1", "/api/sesion"]) assert.strictEqual((await pide(ruta)).status, 401, ruta + " sin sesión");
    assert.strictEqual((await pide("/api/interno/autoriza")).status, 404, "/api/interno cerrada desde fuera");

    // 2. pedir el enlace desde la portada, en Chrome, con su formulario (sin JS); sin Origin, 403; mismo 202 exista o no la cuenta
    const cuerpo = c => ({ method: "POST", body: JSON.stringify({ correo: c }), headers: { "content-type": "application/json", origin: base } });
    const sinOrigen = await pide("/api/auth/enlace", { method: "POST", body: JSON.stringify({ correo: yo.correo }), headers: { "content-type": "application/json" } });
    assert.strictEqual(sinOrigen.status, 403, "un POST sin Origin se rechaza (CSRF)");
    const antesBuzon = (await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json()).messages_count;
    {   // el volumen de la base se conserva entre pasadas: el hogar de prueba vuelve a estar en su primer acceso
      const Pg0 = require(path.join(HERR, "node_modules", "pg"));
      const k = new Pg0.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user: comun.PG_DUENO, password: process.env.GEMELO_DEV_PG_CLAVE });
      await k.connect();
      try { await k.query("UPDATE hogares SET normas_version = NULL, normas_aceptadas_en = NULL WHERE correo = $1", [yo.correo]); } finally { await k.end(); }
    }
    const nav = await lanza();
    let cookie, msg = null, enlace;
    try {
      // la CA local no está instalada en el sistema: Chrome la acepta solo en esta prueba (ignoreHTTPSErrors)
      const ctx = await nav.newContext({ viewport: { width: 900, height: 650 }, ignoreHTTPSErrors: true });
      await ctx.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      const cspPortada = [];
      // lo que pide la CSP de PRODUCCIÓN (style-src 'self'; script-src 'self'), que la de dev (Report-Only) deja pasar
      const enLinea = pg => pg.evaluate(() => ({ estilos: document.querySelectorAll("[style]").length, scripts: [...document.scripts].filter(s => !s.src && s.textContent.trim()).length, csp: window.__csp.slice() }));
      const pp = await ctx.newPage();
      await pp.goto(base + "/");
      await pp.waitForSelector("html[data-listo]");
      assert.ok(await pp.isVisible("#t-portada"), "la portada pública");
      assert.ok(await pp.isVisible("#btnEntrar") && !(await pp.isVisible("#btnSeguir")), "sin sesión: «Entrar», no «Seguir a la finca»");
      await pp.click("#btnEntrar");
      await pp.waitForSelector("#t-entrar", { state: "visible" });
      assert.strictEqual(await pp.evaluate(() => document.activeElement && document.activeElement.id), "t-entrar", "el foco va al h1 de la pantalla");
      await pp.fill("#correo", "mal-formado");
      await pp.click("#btnMandar");
      assert.ok(await pp.isVisible("#eCorreo") && (await pp.getAttribute("#correo", "aria-invalid")) === "true", "correo mal formado: error junto al campo");
      await pp.fill("#correo", yo.correo);
      r0 = reloj();
      const [resp] = await Promise.all([pp.waitForResponse(x => new URL(x.url()).pathname === "/api/auth/enlace" && x.request().method() === "POST"), pp.click("#btnMandar")]);
      assert.strictEqual(resp.status(), 202, "el formulario de la portada: " + resp.status() + " " + (await resp.text()).slice(0, 200));
      const aceptado = await resp.json();
      await pp.waitForSelector("#t-revisa", { state: "visible" });
      assert.strictEqual(await pp.textContent("#correoEco"), yo.correo, "«Revisa tu correo» repite el correo");
      assert.ok(await pp.isDisabled("#btnReenviar"), "reenviar espera 30 s");
      const l1 = await enLinea(pp); cspPortada.push(...l1.csp);
      assert.deepStrictEqual([l1.estilos, l1.scripts], [0, 0], "la portada no lleva estilos ni scripts en línea");
      await pp.close();
      const nadie = await pide("/api/auth/enlace", cuerpo("nadie.prueba@example.com"));
      assert.strictEqual(nadie.status, 202);
      assert.deepStrictEqual(JSON.parse(nadie.texto), aceptado, "la misma respuesta para un correo sin cuenta");

      // 3. leer el correo en la API de Mailpit
      // (msg y enlace se usan tras cerrar el navegador)
      for (let i = 0; i < 100 && !msg; i++) {
        const b = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:" + yo.correo))).json();
        if (b.messages_count > antesBuzon) msg = b.messages[0];
        else await new Promise(ok => setTimeout(ok, 200));
      }
      assert.ok(msg, "el enlace no llegó al buzón en 20 s");
      tiempos.correo = r0();
      const completo = await (await fetch(buzon + "/api/v1/message/" + msg.ID)).json();
      assert.strictEqual(completo.Subject, "Tu enlace para entrar");
      assert.ok(!completo.HTML, "el correo es solo texto");
      enlace = (/(https:\/\/localhost:\d+\/api\/auth\/entrar\?t=[A-Za-z0-9_-]{43})/.exec(completo.Text) || [])[1];
      assert.ok(enlace && enlace.startsWith(base + "/"), "el correo no trae el enlace a " + base + ": " + completo.Text.slice(0, 300));
      t.diagnostic("enlace en el buzón en " + tiempos.correo.toFixed(2) + " s");

      // 4. abrir el enlace en Chrome: página intermedia (el GET no gasta) → botón → primer acceso (normas, alias, avatar) en la
      //    portada → «Seguir a la finca» → /finca/, con la cookie de sesión HttpOnly
      const pg = await ctx.newPage();
      r0 = reloj();
      await pg.goto(enlace);
      assert.strictEqual(await pg.title(), "Entrar");
      await Promise.all([pg.waitForURL(base + "/#bienvenida"), pg.click("button[type=submit]")]);
      tiempos.entrar = r0();
      await pg.waitForSelector("#t-bienvenida", { state: "visible" });
      await pg.click("#fBienvenida button[type=submit]");
      assert.ok(await pg.isVisible("#eBienvenida"), "sin las casillas obligatorias, el aviso");
      for (const id of ["#cPriv", "#cNormas", "#cAdulto"]) await pg.check(id);
      await pg.click("#fBienvenida button[type=submit]");
      await pg.waitForSelector("#t-alias", { state: "visible" });
      assert.strictEqual(await pg.inputValue("#alias"), yo.alias, "el alias que ya tenía, puesto");
      await pg.click("#fAlias button[type=submit]");
      await pg.waitForSelector("#t-avatar", { state: "visible" });
      // AV4: el avatar por piezas; el color de arriba (antes «camisa») está en «Ropa», que empieza plegada
      await pg.click("details:has(#mArriba) > summary");
      await pg.click("#mArriba label:nth-child(3)");
      assert.strictEqual(await pg.$eval("#mArriba input:checked", e => e.value), "2", "el tercer color de arriba, elegido");
      await pg.click("#fAvatar button[type=submit]");
      await pg.waitForSelector("#btnSeguir", { state: "visible" });
      const l2 = await enLinea(pg); cspPortada.push(...l2.csp);
      assert.deepStrictEqual([l2.estilos, l2.scripts], [0, 0], "el primer acceso no lleva estilos ni scripts en línea");
      await Promise.all([pg.waitForURL(base + "/finca/"), pg.click("#btnSeguir")]);
      tiempos.primerAcceso = r0() - tiempos.entrar;
      const c = (await ctx.cookies(base)).find(x => x.name === COOKIE);
      assert.ok(c, "no hay cookie " + COOKIE + " en el navegador");
      assert.deepStrictEqual({ httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite, path: c.path }, { httpOnly: true, secure: true, sameSite: "Lax", path: "/" }, "atributos de la cookie");
      assert.strictEqual(await pg.evaluate(() => document.cookie), "", "la cookie no se ve desde JS (HttpOnly)");
      await pg.close();
      cookie = c.value;

      // el mundo, con la sesión del navegador: 0 errores, teselas pedidas a /teselas/ y CSP Report-Only sin avisos
      r0 = reloj();
      const m = await mide(ctx, base + "/finca/");
      tiempos.mundo = r0();
      t.diagnostic("entrar (botón → /finca/) en " + tiempos.entrar.toFixed(2) + " s; mundo listo y medido en " + tiempos.mundo.toFixed(1) + " s; lejos: " + JSON.stringify(m.medidas.lejos));
      assert.deepStrictEqual(m.errores, [], "errores en la consola");
      assert.deepStrictEqual(m.fallos, [], "peticiones fallidas");
      assert.ok(m.medidas.lejos.triangulos > 0, "no se dibuja nada");
      const pw = await ctx.newPage(), pedidas = [], avisos = [];
      pw.on("response", x => { if (x.url().includes("/teselas/")) pedidas.push(x.status() + " " + new URL(x.url()).pathname); });
      pw.on("console", x => { if (/Content Security Policy|Report Only/i.test(x.text())) avisos.push(x.text().slice(0, 200)); });
      await pw.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
      await pw.goto(base + "/finca/");
      await pw.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 60000 });
      await pw.waitForTimeout(1500);
      avisos.push(...await pw.evaluate(() => window.__csp));
      const vistos = avisos.slice();
      const control = await pw.evaluate(() => new Promise(ok => { const n = window.__csp.length, s = document.createElement("script"); s.textContent = "void 0"; document.head.appendChild(s); setTimeout(() => ok(window.__csp.slice(n)), 500); }));
      await pw.close();
      assert.ok(control.some(v => /^script-src/.test(v)), "la CSP Report-Only no denuncia un script en línea: ¿no llega la cabecera? " + JSON.stringify(control));
      assert.ok(pedidas.some(x => /^200 \/teselas\/hituelo\/t\/\d+_\d+\.json$/.test(x)), "el motor no pidió teselas a /teselas/hituelo/t/: " + pedidas.join(", "));
      assert.deepStrictEqual(vistos, [], "la CSP (Report-Only) avisa de violaciones");

      // 4a. A4: las lindes de las hazas dibujadas (LineSegments «linde de las hazas»), la propia con otro color que las ajenas;
      //     A3: el tileset por Caddy (200 con sesión, 401 sin ella) y /finca/ (escena 3D Tiles) y ?olivos=gen sin errores ni avisos de CSP
      const finca = process.env.GEMELO_DEV_FINCA || "hituelo";
      const abre = async (ruta, esperaFn, c = ctx) => {
        const q = await c.newPage(), errs = [], csp = [];
        q.on("pageerror", e => errs.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
        // el 404 del manifiesto de olivos horneados (ADR-0018) es lo esperado mientras el hornero no haya horneado la finca: el motor calcula (plan B)
        const sinManifiesto = u => /\/teselas\/[a-z0-9_]+\/olivos\/manifiesto\.json$/.test(String(u || "").split("?")[0]);
        q.on("console", x => { if (x.type() === "error" && /status of 404/.test(x.text()) && sinManifiesto(x.location().url)) return; if (x.type() === "error" || /Content Security Policy|Report Only/i.test(x.text())) errs.push("CONSOLE " + x.text().slice(0, 300)); });
        q.on("response", x => { if (x.status() === 404 && sinManifiesto(x.url())) return; if (x.status() >= 400) errs.push(x.status() + " " + x.url()); });
        await q.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
        await q.goto(base + ruta);
        await q.waitForFunction(() => window.__g && window.__g.listo(), null, { timeout: 90000 });
        if (esperaFn) await q.waitForFunction(esperaFn, null, { timeout: 90000, polling: 500 });
        await q.waitForTimeout(1500);
        csp.push(...await q.evaluate(() => window.__csp));
        return { q, errs, csp };
      };
      r0 = reloj();
      {
        const { q, errs, csp } = await abre("/finca/", () => { let n = 0; window.__g.scene.traverse(o => { if (o.name === "linde de las hazas") n++; }); return n > 0; });
        const l = await q.evaluate(() => {
          let o = null; window.__g.scene.traverse(x => { if (x.name === "linde de las hazas") o = x; });
          const col = o.geometry.getAttribute("color").array, ds = new Set();
          for (let i = 0; i < col.length; i += 3) ds.add(col[i].toFixed(2) + "," + col[i + 1].toFixed(2) + "," + col[i + 2].toFixed(2));
          return { tipo: o.type, vertices: o.geometry.getAttribute("position").count, colores: ds.size, visible: o.visible };
        });
        await q.close();
        assert.strictEqual(l.tipo, "LineSegments"); assert.ok(l.vertices >= 8 && l.vertices % 2 === 0, "vértices de las lindes: " + l.vertices);
        assert.ok(l.colores >= 2, "la linde propia debe verse distinta de las ajenas: " + l.colores + " color(es)"); assert.ok(l.visible);
        assert.deepStrictEqual(errs, [], "errores en /finca/ con las lindes"); assert.deepStrictEqual(csp, [], "CSP en /finca/");
        t.diagnostic("lindes de las hazas: LineSegments con " + l.vertices + " vértices y " + l.colores + " colores, en " + r0().toFixed(1) + " s");
      }
      const turl = "/teselas/" + finca + "/tileset/tileset.json";
      if (tilesetMotivo) t.diagnostic("TILESET NO COMPROBADO: " + tilesetMotivo);
      else {
        const ts = await pide(turl, { cookie }), sin = await pide(turl);
        assert.strictEqual(ts.status, 200, turl + " con sesión: " + ts.status);
        assert.strictEqual(JSON.parse(ts.texto).asset.version, "1.1", "tileset 3D Tiles 1.1");
        assert.match(ts.cabeceras["cache-control"] || "", /private/, "el tileset, tras sesión, con caché privada");
        assert.strictEqual(sin.status, 401, turl + " sin sesión");
        r0 = reloj();
        const { q, errs, csp } = await abre("/finca/", () => { const r = window.__g.Escena3D.resumen(); return r.estado === "activo" && r.visibles > 0; });
        const rs = await q.evaluate(() => { const r = window.__g.Escena3D.resumen(); return { estado: r.estado, motivo: r.motivo, errores: r.errores, visibles: r.visibles }; });
        await q.close();
        assert.deepStrictEqual([rs.estado, rs.errores], ["activo", 0], "escena 3D Tiles: " + JSON.stringify(rs));
        assert.deepStrictEqual(errs, [], "errores en /finca/ (escena 3D Tiles)"); assert.deepStrictEqual(csp, [], "CSP en /finca/ (escena 3D Tiles)");
        t.diagnostic("tileset por Caddy 200/401 y la escena 3D Tiles activa con " + rs.visibles + " tesela(s) con contenido, sin errores ni CSP, en " + r0().toFixed(1) + " s");
      }
      {   // O7d: las recetas horneadas, tras sesión: el objeto en brotli e inmutable, el manifiesto revalidado, sin sesión 401
        const base_ = "/teselas/" + finca + "/olivos/", obj = base_ + olivosHorneados.huella + ".br", mf = base_ + "manifiesto.json";
        const o = await pide(obj, { cookie }), m = await pide(mf, { cookie });
        assert.strictEqual(o.status, 200, obj + " con sesión: " + o.status);
        assert.strictEqual(o.cabeceras["content-type"], "application/octet-stream", "el objeto horneado: Content-Type");
        assert.strictEqual(o.cabeceras["content-encoding"], "br", "el objeto horneado: Content-Encoding");
        assert.strictEqual(o.cabeceras["cache-control"], "private, max-age=31536000, immutable", "el objeto horneado: Cache-Control");
        assert.strictEqual(m.status, 200, mf + " con sesión: " + m.status);
        assert.strictEqual(m.cabeceras["cache-control"], "private, no-cache", "el manifiesto se revalida");
        assert.match(m.cabeceras["content-type"] || "", /json/);
        assert.strictEqual(JSON.parse(m.texto).variantes[0].huella, olivosHorneados.huella);
        // solo manifiesto.json y <huella de 32 hex>.br: estado.json, manifiesto.anterior.json, t/… y una huella que no existe dan 404 (con sesión)
        for (const u of ["estado.json", "manifiesto.anterior.json", "t/0_0.olivos", "no-existe.br", olivosHorneados.huella + "0.br", ""]) {
          const x = await pide(base_ + u, { cookie });
          assert.strictEqual(x.status, 404, base_ + u + " con sesión debe dar 404: " + x.status);
          assert.ok(!(x.cabeceras["cache-control"] || "").includes("immutable"), "un 404 no puede quedar inmutable en la caché");
        }
        // O8c: el atlas de un impostor, image/webp e inmutable, sin Content-Encoding; un nombre que no es una huella, 404
        const at = base_ + "0123456789abcdef0123456789abcdef.webp", a = await pide(at, { cookie });
        assert.strictEqual(a.status, 200, at + " con sesión: " + a.status);
        assert.strictEqual(a.cabeceras["content-type"], "image/webp", "el atlas: Content-Type");
        assert.ok(!a.cabeceras["content-encoding"], "el atlas no lleva Content-Encoding");
        assert.strictEqual(a.cabeceras["cache-control"], "private, max-age=31536000, immutable", "el atlas: Cache-Control");
        assert.strictEqual((await pide(base_ + "0123456789abcdef0123456789abcdef0.webp", { cookie })).status, 404, "un .webp que no es una huella da 404");
        for (const u of [obj, mf, at, base_ + "estado.json"]) assert.strictEqual((await pide(u)).status, 401, u + " sin sesión");
        assert.notStrictEqual((await pide("/teselas/" + finca + "/indice.json", { cookie })).cabeceras["cache-control"], o.cabeceras["cache-control"], "el resto de /teselas/ conserva su caché");
        t.diagnostic("recetas horneadas por Caddy: objeto con br+immutable, manifiesto con no-cache, estado.json y demás 404, 401 sin sesión");
        t.diagnostic("hornero (primera vuelta desde cero, fixture, brotli 9): " + primeraVuelta.ms + " ms, " + primeraVuelta.horneadas + "/" + primeraVuelta.total + " recetas horneadas, " + (primeraVuelta.bytesBr / 1048576).toFixed(2) + " MB br; el objeto y el manifiesto salen por Caddy tras sesión y estado.json no");
      }
      {   // ?olivos=gen: sin errores de consola (no se espera a los generados)
        r0 = reloj();
        const { q, errs, csp } = await abre("/finca/?olivos=gen");
        await q.close();
        assert.deepStrictEqual(errs, [], "errores en /finca/?olivos=gen"); assert.deepStrictEqual(csp, [], "CSP en /finca/?olivos=gen");
        t.diagnostic("?olivos=gen sin errores ni CSP en " + r0().toFixed(1) + " s (sin esperar a los generados)");
      }

      {   // O7g (ADR-0018): de punta a punta. El hornero horneó (arriba), Caddy sirve tras sesión y el motor, con los propios apagados (todo lo cercano
          // son variantes), dibuja los generados con las variantes DESCARGADAS: 0 calculadas en el aparato, huellas comprobadas con Web Crypto por https.
          // Contraprueba: con ?olivosHorneado=0 las calcula. Cada pasada va en un contexto limpio (con la cookie de sesión) para que la caché de O5
          // (IndexedDB) no dé las variantes hechas: se mide la descarga, no la caché.
        const TOPE = Number(process.env.GEMELO_TOPE_MEDIDA || 240) * 1000;
        const nuevoCtx = async () => {
          const c2 = await nav.newContext({ viewport: { width: 900, height: 650 }, ignoreHTTPSErrors: true });
          await c2.addCookies(await ctx.cookies(base));
          // marcas de la página (ms desde que empezó a cargar): cuándo hubo el primer generado dibujado, la primera variante horneada y la primera calculada
          await c2.addInitScript(() => {
            window.__marcas = {}; const reloj = () => Math.round(performance.now());
            setInterval(() => {
              // la cámara del escenario «cerca» de mide() (_navegador.js), en cuanto el mundo está listo: los generados solo entran cerca del suelo
              if (window.__g && window.__g.listo && window.__g.listo() && window.__marcas.camara === undefined) {
                const g = window.__g; g.orb.az = -0.4; g.orb.el = 0.5; g.orb.dist = 45; g.objetivo.x = -130; g.objetivo.z = 125; g.objetivo.y = g.suelo(-130, -125) + 4; g.pon("gem");
                window.__marcas.camara = reloj();
              }
              if (!window.__olivosGen) return;
              const g = window.__olivosGen(), h = g.horneado || {};
              if (g.primero && window.__marcas.primero === undefined) window.__marcas.primero = reloj();
              if (h.horneadas > 0 && window.__marcas.horneada === undefined) window.__marcas.horneada = reloj();
              if (h.calculadas > 0 && window.__marcas.calculada === undefined) window.__marcas.calculada = reloj();
            }, 50);
          });
          return c2;
        };
        const pasada = async ruta => {
          const c2 = await nuevoCtx(), r0g = reloj();
          try {
            const { q, errs, csp } = await abre(ruta, null, c2);
            const tListo = r0g();
            const fin = Date.now() + TOPE;
            let g = null;
            for (;;) {
              g = await q.evaluate(() => ({ g: window.__olivosGen(), marcas: window.__marcas, seguro: window.isSecureContext && !!(window.crypto && window.crypto.subtle) }));
              const h = g.g.horneado;
              if (g.g.primero && (h.horneadas > 0 || h.calculadas > 0) && g.g.pidiendo === 0) break;
              if (Date.now() > fin) break;
              await q.waitForTimeout(500);
            }
            const csp2 = csp.concat(await q.evaluate(() => window.__csp));
            await q.close();
            return { g: g.g, marcas: g.marcas, seguro: g.seguro, errs, csp: csp2, tListo, tTotal: r0g() };
          } finally { await c2.close(); }
        };
        const hor = await pasada("/finca/?olivos=gen&olivosPropios=0");
        const H = hor.g.horneado;
        assert.strictEqual(hor.seguro, true, "https debe ser contexto seguro con Web Crypto (la huella de las recetas se comprueba con crypto.subtle)");
        assert.deepStrictEqual(hor.errs, [], "errores en /finca/?olivos=gen&olivosPropios=0"); assert.deepStrictEqual(hor.csp, [], "CSP en /finca/?olivos=gen&olivosPropios=0");
        assert.ok(hor.g.primero, "no se dibujó ningún olivo generado (estado: " + JSON.stringify(hor.g) + ")");
        assert.strictEqual(H.estado, "activo", "el motor leyó el manifiesto del hornero: " + JSON.stringify(H));
        assert.ok(H.horneadas > 0, "ninguna variante horneada descargada: " + JSON.stringify(H));
        assert.strictEqual(H.calculadas, 0, "con el hornero, el aparato no debe calcular variantes: " + JSON.stringify(H));
        assert.strictEqual(H.fallos, 0, "fallos al descargar o verificar variantes horneadas: " + JSON.stringify(H));
        assert.strictEqual(H.propiosCalculados, 0, "con ?olivosPropios=0 no hay propios");
        const cont = await pasada("/finca/?olivos=gen&olivosPropios=0&olivosHorneado=0");
        const C = cont.g.horneado;
        assert.deepStrictEqual(cont.errs, [], "errores en la contraprueba"); assert.deepStrictEqual(cont.csp, [], "CSP en la contraprueba");
        assert.ok(cont.g.primero, "contraprueba: no se dibujó ningún generado (estado: " + JSON.stringify(cont.g) + ")");
        assert.strictEqual(C.horneadas, 0, "con ?olivosHorneado=0 no se descarga nada: " + JSON.stringify(C));
        assert.ok(C.calculadas > 0, "con ?olivosHorneado=0 el aparato las calcula: " + JSON.stringify(C));
        const ms = x => x === undefined ? "n/d" : x + " ms";
        t.diagnostic("O7g e2e del hornero (fixture, propios apagados, SwiftShader, contexto limpio): CON hornero " + H.horneadas + " horneadas, 0 calculadas, 0 fallos; cámara «cerca» puesta a los " + ms(hor.marcas.camara) + ", primer generado dibujado a los " + ms(hor.marcas.primero) + " y primera variante horneada a los " + ms(hor.marcas.horneada)
          + " (hornero desde cero: " + primeraVuelta.ms + " ms) | SIN hornero (?olivosHorneado=0) " + C.calculadas + " calculadas, 0 horneadas; primer generado a los " + ms(cont.marcas.primero) + " y primera calculada a los " + ms(cont.marcas.calculada) + "; Web Crypto en https: sí");
      }

      // 4b. gafas (navegador de Quest simulado, SIN sesión y con su propio tarro de cookies) → código corto → aprobado desde
      //     «Mis dispositivos» del aparato con sesión → las gafas reciben SU sesión y entran en /finca/
      const UA_QUEST = "Mozilla/5.0 (X11; Linux x86_64; Quest 3) AppleWebKit/537.36 (KHTML, like Gecko) OculusBrowser/35.2.0.0 SamsungBrowser/4.0 Chrome/126.0.0.0 VR Safari/537.36";
      const ctxG = await nav.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true, userAgent: UA_QUEST });
      try {
        await ctxG.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", e => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
        const gq = await ctxG.newPage();
        r0 = reloj();
        await gq.goto(base + "/");
        await gq.waitForSelector("html[data-listo]");
        assert.strictEqual(await gq.getAttribute("html", "data-disp"), "quest", "las Quest se detectan");
        assert.strictEqual(await gq.evaluate(() => getComputedStyle(document.documentElement).fontSize), "19px", "en las Quest, texto de 19 px");
        await gq.click("#btnEntrar");
        await gq.click("#opcGafas a");
        await gq.waitForFunction(() => /^[2-9A-HJKMNP-Z]{3}-[2-9A-HJKMNP-Z]{3}$/.test(document.getElementById("codigo").textContent), null, { timeout: 15000 });
        const codigo = await gq.textContent("#codigo");
        tiempos.codigo = r0();
        const altoBtn = await gq.evaluate(() => document.getElementById("btnPrefieroCorreo").getBoundingClientRect().height);
        assert.ok(altoBtn >= 56, "en las Quest, botones de ≥ 56 px: " + altoBtn);
        assert.match(await gq.textContent("#avVincularTxt"), /Esperando/);
        assert.strictEqual((await ctxG.cookies(base)).filter(x => x.name === COOKIE).length, 0, "las gafas aún no tienen sesión");
        // en el aparato con sesión: Mis dispositivos → Vincular
        const pd = await ctx.newPage();
        await pd.goto(base + "/#dispositivos");
        await pd.waitForSelector("#t-dispositivos", { state: "visible" });
        await pd.fill("#codigoTecleado", "K0Q-4M2");
        await pd.click("#btnAprobar");
        assert.match(await pd.textContent("#eCodigo"), /0, O, 1, I ni L/, "un ambiguo se explica sin preguntar a la api");
        await pd.fill("#codigoTecleado", codigo.toLowerCase());
        r0 = reloj();
        const [ap] = await Promise.all([pd.waitForResponse(x => new URL(x.url()).pathname === "/api/yo/dispositivos/vincular"), pd.click("#btnAprobar")]);
        assert.strictEqual(ap.status(), 204, "aprobar el código");
        await pd.waitForSelector("#okVincular", { state: "visible" });
        const l3 = await enLinea(pd); cspPortada.push(...l3.csp);
        await pd.close();
        await gq.waitForSelector("#btnGafasFinca", { state: "visible", timeout: 15000 });
        tiempos.aprobado = r0();
        const cg = (await ctxG.cookies(base)).find(x => x.name === COOKIE);
        assert.ok(cg && cg.httpOnly && cg.secure && cg.sameSite === "Lax", "las gafas reciben su cookie de sesión");
        assert.notStrictEqual(cg.value, (await ctx.cookies(base)).find(x => x.name === COOKIE).value, "y es SU sesión, no la del otro aparato");
        const l4 = await enLinea(gq); cspPortada.push(...l4.csp);
        assert.deepStrictEqual([l4.estilos, l4.scripts], [0, 0], "la pantalla de las gafas no lleva estilos ni scripts en línea");
        await Promise.all([gq.waitForURL(base + "/finca/"), gq.click("#btnGafasFinca")]);
        const sg = JSON.parse((await pide("/api/sesion", { cookie: cg.value })).texto);
        assert.deepStrictEqual({ rol: sg.rol, alias: sg.alias, primer_acceso: sg.primer_acceso, titular: sg.titular }, { rol: "hogar", alias: yo.alias, primer_acceso: false, titular: false }, "la sesión de las gafas es la del hogar que aprobó (y no es titular: nació del código corto)");
        t.diagnostic("gafas: código en pantalla en " + tiempos.codigo.toFixed(2) + " s; de «Aprobar» a la sesión en las gafas " + tiempos.aprobado.toFixed(2) + " s (sondeo cada 3 s)");
        // un solo uso: el mismo código ya no se aprueba otra vez
        const otraVez = await pide("/api/yo/dispositivos/vincular", { method: "POST", cookie: (await ctx.cookies(base)).find(x => x.name === COOKIE).value, body: JSON.stringify({ codigo, aprobar: true }), headers: { "content-type": "application/json", origin: base } });
        assert.strictEqual(otraVez.status, 404, "un código ya usado no sirve otra vez");
        t.diagnostic("paso: código usado rechazado");
        // a 390 px (móvil): sin desplazamiento horizontal en las pantallas de entrada
        const pm = await ctxG.newPage({ viewport: { width: 390, height: 844 } });
        await pm.setViewportSize({ width: 390, height: 844 });
        for (const h of ["#portada", "#dispositivos"]) {
          await pm.goto(base + "/" + h); await pm.waitForSelector("html[data-listo]");
          const anchos = await pm.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
          assert.ok(anchos[0] <= anchos[1], h + " a 390 px desborda: " + anchos.join(" > "));
        }
        await pm.close();
        t.diagnostic("paso: 390 px sin desbordar");
      } finally { await ctxG.close(); }
      assert.deepStrictEqual(cspPortada, [], "la CSP (Report-Only) avisa de violaciones en la portada y la entrada");
      await ctx.close();
    } finally { await nav.close(); }

    // el enlace ya no sirve otra vez
    const otra = await pide(enlace.slice(base.length));
    assert.strictEqual(otra.status, 400, "un enlace usado no vuelve a abrir");
    assert.match(otra.texto, /ya se usó/);

    t.diagnostic("paso: enlace usado rechazado");
    // 5. con sesión: la web precomprimida y con caché, las teselas, la sesión y las hazas
    r0 = reloj();
    const w = await pide("/finca/", { cookie, headers: { "accept-encoding": "br" } });
    assert.strictEqual(w.status, 200);
    assert.strictEqual(w.cabeceras["content-encoding"], "br", "la página debe servirse precomprimida en brotli");
    const js = /assets\/[^"]+\.js/.exec((await pide("/finca/", { cookie })).texto)[0];
    assert.match((await pide("/finca/" + js, { cookie })).cabeceras["cache-control"] || "", /immutable/, "assets/ debe llevar caché inmutable");
    const ti = await pide("/teselas/hituelo/indice.json", { cookie });
    assert.strictEqual(ti.status, 200, "/teselas/hituelo/indice.json con sesión");
    assert.match(ti.cabeceras["cache-control"] || "", /private/, "las teselas, tras sesión, con caché privada");
    const I = JSON.parse(ti.texto), [cx, cy] = I.centro_utm;

    const s = await json("/api/sesion", cookie);
    assert.deepStrictEqual(s.cuerpo, { rol: "hogar", alias: yo.alias, alias_visible: true, primer_acceso: false, titular: true }, "con el primer acceso hecho (y titular: la sesión nació del enlace mágico)");

    const g = await json("/api/hazas", cookie);
    assert.strictEqual(g.status, 200);
    assert.strictEqual(g.cuerpo.type, "FeatureCollection");
    assert.strictEqual(g.cuerpo.srs, "EPSG:25830");
    assert.deepStrictEqual(g.cuerpo.features.map(f => f.properties.codigo), ["H-D01", "H-D02", "H-D03", "H-D04"]);
    for (const f of g.cuerpo.features) {
      assert.deepStrictEqual(Object.keys(f).sort(), ["geometry", "id", "properties", "type"]);
      assert.deepStrictEqual(Object.keys(f.properties).sort(), ["codigo", "es_mia", "finca", "nombre"], "propiedades del GeoJSON");
      assert.strictEqual(f.properties.finca, "hituelo");
      assert.strictEqual(f.properties.es_mia, f.properties.codigo === yo.haza, f.properties.codigo + ": es_mia");
      for (const [x, y] of f.geometry.coordinates.flat(2)) assert.ok(x >= cx + I.ext[0] && x <= cx + I.ext[2] && y >= cy + I.ext[3] && y <= cy + I.ext[1], f.properties.codigo + ": la linde cae fuera del mundo");
    }
    revisaListaBlanca(g.cuerpo, "hazas", correos);
    const id = codigo => g.cuerpo.features.find(f => f.properties.codigo === codigo).id;

    // fichas: la propia, una ajena con alias oculto, una con alias visible y una sin asignar; todas validan contra el contrato
    const valida = new Ajv({ strict: false, validateFormats: false, allErrors: true }).compile(JSON.parse(lee("contratos/haza.schema.json")));
    const esperado = { [yo.haza]: { es_mia: true, alias: yo.alias }, [vecino.haza]: { es_mia: false, alias: null }, [mirlo.haza]: { es_mia: false, alias: mirlo.alias }, [HAZAS_SIN_ASIGNAR[0]]: { es_mia: false, alias: null } };
    for (const [codigo, esp] of Object.entries(esperado)) {
      const f = await json("/api/hazas/" + id(codigo), cookie);
      assert.strictEqual(f.status, 200, codigo);
      assert.ok(valida(f.cuerpo), codigo + ": la ficha no cumple contratos/haza.schema.json: " + JSON.stringify(valida.errors));
      assert.deepStrictEqual({ es_mia: f.cuerpo.es_mia, alias: f.cuerpo.alias }, esp, codigo + ": titularidad y alias");
      revisaListaBlanca(f.cuerpo, "ficha " + codigo, correos);
      if (DE_PRUEBA) {   // finca que no es el fixture: hazas inventadas sin olivos ni recuentos (tuberia/hazas/de_prueba.py)
        assert.strictEqual(f.cuerpo.olivos.lidar.n, 0, codigo + ": las hazas de prueba no llevan olivos en la base");
        assert.strictEqual(f.cuerpo.olivos.declarado.n, null, codigo + ": sin recuento declarado");
      } else {
        assert.ok(f.cuerpo.olivos.lidar.n > 0, codigo + ": sin olivos dentro");
        assert.strictEqual(f.cuerpo.olivos.declarado.n, 35, codigo + ": olivos declarados (sintéticos)");
      }
      assert.deepStrictEqual(f.cuerpo.avisos, ["ot_sin_sincronia"], codigo + ": sin OlivarTrack en local, la ficha lo dice");
      assert.strictEqual(f.cuerpo.completo, false);
    }
    assert.strictEqual((await pide("/api/hazas/999999", { cookie })).status, 404);
    tiempos.api = r0();
    t.diagnostic("con sesión: web, teselas, /api/sesion, /api/hazas y 4 fichas en " + tiempos.api.toFixed(2) + " s");

    // 5b. decisión 55: la api corre con el rol de permisos mínimos de producción, y ese rol NO puede cambiar el esquema
    //     ni tocar lo que no le toca (así un fallo de permisos sale aquí y no en el VPS)
    const Pg = require(path.join(HERR, "node_modules", "pg"));
    const conecta = async (user, password) => { const k = new Pg.Client({ host: "127.0.0.1", port: p.db, database: "gemelo", user, password, connectionTimeoutMillis: 5000 }); await k.connect(); return k; };
    const dueno = await conecta(comun.PG_DUENO, process.env.GEMELO_DEV_PG_CLAVE);
    try {
      const usos = (await dueno.query("SELECT DISTINCT usename FROM pg_stat_activity WHERE application_name = 'gemelo-api'")).rows.map(x => x.usename);
      assert.deepStrictEqual(usos, [comun.PG_API], "las conexiones de la api a la base son de " + comun.PG_API);
    } finally { await dueno.end(); }
    const api = await conecta(comun.PG_API, process.env.GEMELO_DEV_PG_API_CLAVE);
    try {
      assert.strictEqual((await api.query("SELECT count(*)::int AS n FROM hazas WHERE codigo LIKE 'H-D%'")).rows[0].n, 4, "el rol de la api lee las hazas");
      const prohibidas = {
        "crear una tabla": "CREATE TABLE intrusa (x int)",
        "crear un esquema": "CREATE SCHEMA intruso",
        "cambiar una tabla": "ALTER TABLE hazas ADD COLUMN intrusa int",
        "borrar una tabla": "DROP TABLE olivos",
        "vaciar una tabla": "TRUNCATE sesiones",
        "cambiar la auditoría": "UPDATE auditoria SET accion = 'x'",
        "borrar la auditoría": "DELETE FROM auditoria",
        "escribir en el registro de migraciones": "INSERT INTO esquema_migraciones (name, run_on) VALUES ('9999_intrusa', now())",
      };
      for (const [que, sql] of Object.entries(prohibidas)) {
        await assert.rejects(api.query(sql), x => x.code === "42501", comun.PG_API + " no debe poder " + que + " (" + sql + ")");
      }
      t.diagnostic(comun.PG_API + ": lee filas y se le niegan (42501) " + Object.keys(prohibidas).length + " operaciones de esquema o fuera de sus permisos");
    } finally { await api.end(); }

    // 6. salir: la cookie deja de servir; y al correo sin cuenta no le llegó nada
    const sal = await pide("/api/sesion/salir", { method: "POST", cookie, headers: { origin: base } });
    assert.strictEqual(sal.status, 204);
    assert.strictEqual((await pide("/api/hazas", { cookie })).status, 401, "tras salir, la cookie no sirve");
    const aNadie = await (await fetch(buzon + "/api/v1/search?query=" + encodeURIComponent("to:nadie.prueba@example.com"))).json();
    assert.strictEqual(aNadie.messages_count, 0, "se mandó un correo a una cuenta que no existe");
    await fetch(buzon + "/api/v1/messages", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ IDs: [msg.ID] }) });
  } finally {
    if (!antes) { r0 = reloj(); para(); t.diagnostic("bajado en " + r0().toFixed(1) + " s (el volumen de la db se conserva)"); }
    else t.diagnostic("ya estaba levantado antes de la prueba: se deja levantado");
  }
  } finally { await sueltaTurno(); }
});
