"use strict";
// Servidor de la fase F1a (apps/api, infra/, tuberia/hazas; contratos/publicacion-vps.json).
//  - Siempre: imágenes de producción = contrato = infra/dev, con versión y digest; ningún puerto publicado; ningún
//    secreto escrito en el compose; el Dockerfile usa la imagen de Node del contrato; dependencias npm fijadas; el
//    OpenAPI y la ficha se leen; el cargador de hazas convierte el ejemplo sintético.
//  - Si apps/api tiene sus dependencias instaladas: tipos (tsc) y pruebas unitarias (sin base). Si no, se SALTA con aviso.
//  - Opcional (GEMELO_DOCKER=1): integración contra PostGIS en contenedor (21 pruebas) e infra/probar-caddy.sh.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { RAIZ, lee, python, ejecuta, fs, path, os } = require("./_util");

const API = path.join(RAIZ, "apps", "api");
const CONTRATO = JSON.parse(lee("contratos/publicacion-vps.json"));
const sinComentarios = f => lee(f).split("\n").filter(l => !/^\s*#/.test(l)).join("\n");
const imagenes = f => [...sinComentarios(f).matchAll(/^\s*image:\s*(\S+)\s*$/gm)].map(m => m[1]).filter(i => !i.startsWith("gemelo-"));
const PRELIMINAR = /(^|[-.\d])(latest|edge|master|main|dev|devel|nightly|snapshot|rc\d*|beta\d*|alpha\d*|preview|canary|unstable)([-.\d]|$)/i;
const CON_DIGEST = /^([a-z0-9._/-]+):([A-Za-z0-9._-]+)@sha256:[a-f0-9]{64}$/;
const HAY_DEPS = fs.existsSync(path.join(API, "node_modules", "fastify"));
const SIN_DEPS = "apps/api sin dependencias (cd apps/api && npm ci)";
// el hijo NO debe heredar NODE_TEST_CONTEXT (si no, habla en el protocolo interno de node:test y no en texto)
const ENTORNO_HIJO = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== "NODE_TEST_CONTEXT"));
const pruebas = (args, extra) => spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...args],
  Object.assign({ cwd: API, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, env: ENTORNO_HIJO }, extra || {}));

test("imágenes de producción: versión exacta y digest, sin preliminares, y las del contrato", () => {
  const prod = imagenes("infra/compose.yml");
  assert.deepStrictEqual(prod.slice().sort(), [CONTRATO.imagenes.db, CONTRATO.imagenes.web, CONTRATO.imagenes_fase_2.livekit].sort());
  const todas = [...prod, ...Object.values(CONTRATO.imagenes), ...Object.values(CONTRATO.imagenes_fase_2)];
  for (const i of todas) {
    const m = CON_DIGEST.exec(i);
    assert.ok(m, i + ": debe ser imagen:versión@sha256:<64 hex>");
    assert.ok(!PRELIMINAR.test(m[2]), i + ": etiqueta preliminar o móvil");
    assert.match(m[2], /\d+\.\d+|\d+-\d+\.\d+/, i + ": la etiqueta debe fijar la versión (no solo la mayor)");
  }
});

test("dev y producción usan las mismas imágenes de base, web y LiveKit", () => {
  const dev = imagenes("infra/dev/compose.yml");
  for (const i of [CONTRATO.imagenes.db, CONTRATO.imagenes.web, CONTRATO.imagenes_fase_2.livekit]) {
    assert.ok(dev.includes(i), "infra/dev/compose.yml no usa " + i + " (dev: " + dev.join(", ") + ")");
  }
});

test("V7/V10: volúmenes de medios y de configuración publicada (la api escribe, el hornero lee), y /api/medios hasta 9 MB en los dos Caddy y el borde", () => {
  const V = CONTRATO.volumenes_api, L = CONTRATO.limites_cuerpo_mb;
  const re = (s, f) => new RegExp(s, f);
  for (const f of ["infra/compose.yml", "infra/dev/compose.yml"]) {
    const c = sinComentarios(f).replace(/\s+#.*$/gm, "");   // sin comentarios al final de línea
    assert.match(c, re("^\\s*- medios:" + V.medios + "\\s*$", "m"), f + ": el volumen medios en " + V.medios);
    assert.match(c, re("^\\s*- config_publicada:" + V.config_publicada + "\\s*$", "m"), f + ": la api escribe la configuración publicada");
    assert.match(c, re("GEMELO_MEDIOS:\\s*" + V.medios + "\\s*$", "m"), f + ": GEMELO_MEDIOS");
    assert.match(c, re("GEMELO_CONFIG_SALIDA:\\s*" + V.config_publicada + "/publicada\\.json\\s*$", "m"), f + ": GEMELO_CONFIG_SALIDA");
    assert.match(c, /^\s*- config_publicada:\/config:ro\s*$/m, f + ": el hornero lee la configuración, de solo lectura");
    assert.match(c, /GEMELO_HORNERO_CONFIG:\s*\/config\/publicada\.json/, f + ": GEMELO_HORNERO_CONFIG");
    // OF9: re-hornear. La petición va en el MISMO volumen de la configuración publicada (la api escribe, el hornero la lee de solo lectura: junto a GEMELO_HORNERO_CONFIG,
    // sin otra variable); la api ve el latido del hornero (su volumen de estado, de solo lectura) y así dice «pedido / atendido»
    assert.match(c, /GEMELO_HORNERO_ESTADO:\s*\/datos\/hornero\s*$/m, f + ": la api conoce el estado del hornero");
    assert.match(c, /^\s*- hornero_estado:\/datos\/hornero:ro\s*$/m, f + ": la api lee el estado del hornero, de solo lectura");
    assert.match(c, /^\s*- hornero_estado:\/estado\s*$/m, f + ": el hornero escribe su estado (donde anota la petición atendida)");
    assert.ok(!/GEMELO_HORNERO_PEDIDO/.test(c), f + ": la petición va por defecto junto a la configuración publicada (api: dirname de GEMELO_CONFIG_SALIDA; hornero: dirname de GEMELO_HORNERO_CONFIG)");
    assert.match(c, /GEMELO_HORNERO_SALIDA:/, f + ": la api lee el manifiesto horneado (solo lectura)");
    assert.match(c, /^  medios: \{\}/m, f + ": volumen medios declarado");
    assert.match(c, /^  config_publicada: \{\}/m, f + ": volumen config_publicada declarado");
  }
  assert.match(lee("apps/api/Dockerfile"), /mkdir -p \/datos\/medios \/datos\/config \/datos\/hornero && chown node:node \/datos\/medios \/datos\/config \/datos\/hornero/, "los puntos de montaje son del usuario node (un volumen nuevo hereda su dueño)");
  for (const f of ["infra/Caddyfile", "infra/dev/Caddyfile"]) {
    const c = sinComentarios(f);
    assert.match(c, re("handle /api/medios \\{\\s*request_body \\{\\s*max_size " + L.api_medios + "MB"), f + ": /api/medios hasta " + L.api_medios + " MB");
    assert.match(c, re("handle /api/\\* \\{\\s*request_body \\{\\s*max_size " + L.api + "MB"), f + ": el resto de /api/* sigue en " + L.api + " MB");
    assert.ok(c.indexOf("handle /api/medios") < c.indexOf("handle /api/*"), f + ": /api/medios va antes que /api/*");
  }
  const b = sinComentarios("infra/bloque-borde.txt");
  assert.match(b, re("handle /api/medios \\{\\s*request_body \\{\\s*max_size " + L.api_medios + "MB"), "borde: /api/medios hasta " + L.api_medios + " MB");
  assert.match(b, re("handle \\{\\s*request_body \\{\\s*max_size " + L.borde + "MB"), "borde: el resto en " + L.borde + " MB");
  // OF3b: la api admite 4 MiB en el contorno; los tres Caddy, algo más, y con matcher de ruta en línea (uno con nombre quedaría detrás de /api/*)
  for (const [f, c] of [["infra/Caddyfile", sinComentarios("infra/Caddyfile")], ["infra/dev/Caddyfile", sinComentarios("infra/dev/Caddyfile")], ["infra/bloque-borde.txt", b]]) {
    assert.match(c, re("handle /api/admin/fincas/\\*/contorno \\{\\s*request_body \\{\\s*max_size " + L.api_contorno + "MB"), f + ": el contorno hasta " + L.api_contorno + " MB");
  }
  assert.match(lee("apps/api/src/admin/contorno.ts"), /bodyLimit: 4 \* 1024 \* 1024/, "si cambia el tope del contorno en la api, cambia limites_cuerpo_mb.api_contorno y los tres Caddy");
  const e = lee("infra/entorno.ejemplo");
  for (const v of ["GEMELO_MEDIOS_MAX_MB", "GEMELO_MEDIOS_RETENCION_DIAS", "GEMELO_MEDIOS_SUBIDAS_HORA", "GEMELO_RESPALDO_MEDIOS"]) assert.match(e, re("^" + v + "=", "m"), "entorno.ejemplo: " + v);
  assert.match(lee("infra/respaldo.sh"), /gemelo-medios-\$SELLO\.tar\.age/, "respaldo.sh copia el volumen de medios");
  assert.match(lee("infra/ensayar-restauracion.sh"), /gemelo-medios-/, "el ensayo restaura la copia de medios");
});

test("producción: ningún puerto publicado, secretos solo por fichero, red de borde externa", () => {
  const c = sinComentarios("infra/compose.yml");
  // los únicos puertos publicados son los de medios de LiveKit, en su perfil (ADR-0027): todo lo demás entra por la red borde
  const bloques = c.split(/^(?=  [a-z]+:\s*$)/m), conPuertos = bloques.filter(s => /^\s*ports:/m.test(s));
  assert.strictEqual(conPuertos.length, 1, "solo LiveKit publica puertos");
  assert.match(conPuertos[0], /^  livekit:/, "solo LiveKit publica puertos");
  assert.match(conPuertos[0], new RegExp("profiles: \\[" + CONTRATO.livekit.perfil + "\\]"), "LiveKit, solo con su perfil: un up -d normal no abre puertos");
  assert.deepStrictEqual([...conPuertos[0].matchAll(/^\s*- "(\d+):\1\/(tcp|udp)"/gm)].map(m => m[1] + "/" + m[2]), CONTRATO.livekit.puertos_publicados, "puertos de LiveKit del contrato");
  assert.ok(!/borde/.test(conPuertos[0]) && !/LIVEKIT_KEYS/.test(conPuertos[0]), "LiveKit, fuera de la red borde y con las claves en key_file");
  const yaml = lee("infra/livekit.yaml");
  assert.match(yaml, /^key_file: \/run\/secrets\/livekit_claves$/m, "livekit.yaml: las claves, por fichero");
  assert.ok(!/^\s*(keys|node_ip)\s*:/m.test(yaml), "livekit.yaml sin claves ni IP");
  // sin swap y con vecinos: cada servicio con su tope de memoria
  for (const s of bloques.slice(1).filter(s => /^  [a-z]+:\s*$/m.test(s.split("\n")[0]) && /^\s+(image|build):/m.test(s))) assert.match(s, /^\s+mem_limit: \d+[mg]$/m, "sin mem_limit: " + s.split("\n")[0]);
  assert.ok(!/(PASSWORD|CLAVE|SECRETO|TOKEN)(_[A-Z]+)*:\s*["']?[^"'\s/][^\n]*$/m.test(c.replace(/_FICHERO:\s*\/run\/secrets\/\S+/g, "")),
    "hay un secreto escrito en el compose: van en /run/secrets (secretos de Docker)");
  assert.match(c, /borde:\s*\n\s*external:\s*true/, "la red borde debe ser externa (la crea Oficultor)");
  assert.match(c, /pg_datos:\/var\/lib\/postgresql\s*$/m, "con PostgreSQL 18 el volumen va en " + CONTRATO.volumen_bd);
  for (const s of CONTRATO.secretos) assert.match(c, new RegExp("^\\s*" + s + ":\\s*\\{\\s*file:\\s*/etc/gemelo/secretos/" + s + "\\s*\\}", "m"), "secreto " + s);
});

test("infra/Caddyfile de producción deja pasar la voz y no registra el token de LiveKit", () => {
  const c = sinComentarios("infra/Caddyfile");
  assert.match(c, /Permissions-Policy "[^"]*microphone=\(self\)/, "con microphone=() el navegador niega el micrófono y la voz (F3) no abre");
  assert.match(c, /handle_path \/rtc\/\* \{\s*reverse_proxy livekit:7880/, "la señalización de LiveKit por el mismo origen, como en dev");
  assert.match(c, /replace access_token REDACTADO/, "el token de LiveKit va en la URL de /rtc");
  assert.match(c, /handle_errors \{/, "un 404 en assets/ no debe heredar immutable");
});

test("infra/respaldo.sh aguanta el entorno real: el remitente con espacios y <…> no es shell (sin Docker, con sustitutos)", t => {
  const hay = h => spawnSync("bash", ["-c", "command -v " + h], { encoding: "utf8" }).status === 0;
  if (!hay("bash") || !hay("sha256sum")) return t.skip("sin bash o sha256sum: respaldo.sh NO se ha ejecutado");
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-respaldo-")), b = d.replace(/\\/g, "/");
  try {
    fs.writeFileSync(path.join(d, "docker"), "#!/bin/sh\necho volcado\n");
    fs.writeFileSync(path.join(d, "age"), "#!/bin/sh\nwhile [ $# -gt 0 ]; do [ \"$1\" = --output ] && o=$2; shift; done\ncat > \"$o\"\n");
    fs.chmodSync(path.join(d, "docker"), 0o755); fs.chmodSync(path.join(d, "age"), 0o755);
    fs.writeFileSync(path.join(d, "clave.pub"), "age1sintetica\n");
    fs.writeFileSync(path.join(d, "entorno"), lee("infra/entorno.ejemplo")
      .replace(/^GEMELO_RESPALDO_DESTINATARIO_FICHERO=.*$/m, "GEMELO_RESPALDO_DESTINATARIO_FICHERO=" + b + "/clave.pub")
      .replace(/^GEMELO_RESPALDO_LOCAL=.*$/m, "GEMELO_RESPALDO_LOCAL=" + b + "/copias"));
    const k = Object.keys(ENTORNO_HIJO).find(n => /^path$/i.test(n));
    const r = spawnSync("bash", ["infra/respaldo.sh", "--sin-subir"], { cwd: RAIZ, encoding: "utf8",
      env: Object.assign({}, ENTORNO_HIJO, { [k]: d + path.delimiter + ENTORNO_HIJO[k], GEMELO_ENTORNO: b + "/entorno", GEMELO_AGE: b + "/age" }) });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert.ok(fs.readdirSync(path.join(d, "copias")).some(f => /^gemelo-medios-.*\.tar\.age$/.test(f)), "copia de la base y de los medios: " + r.stdout);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("el Dockerfile usa la imagen de Node del contrato y corre sin root", () => {
  const d = lee("apps/api/Dockerfile");
  const froms = [...d.matchAll(/^FROM\s+(\S+)/gm)].map(m => m[1]);
  assert.ok(froms.length >= 1 && froms.every(f => f === CONTRATO.imagenes.node), "FROM distinto del contrato: " + froms.join(", "));
  assert.match(d, /^USER node$/m);
  assert.match(d, new RegExp("^EXPOSE " + CONTRATO.puerto_api + "$", "m"));
});

test("la imagen de la api lleva todos los esquemas de contratos/ que la api lee (sin uno, no arranca: ENOENT y contenedor unhealthy)", () => {
  const usados = new Set();
  const recorre = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) recorre(f);
    else if (/\.ts$/.test(e.name)) for (const l of fs.readFileSync(f, "utf8").split("\n")) {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) continue;   // los comentarios citan contratos sin leerlos
      for (const m of l.matchAll(/"([a-z0-9-]+\.schema\.json)"/g)) usados.add(m[1]);
    }
  } };
  recorre(path.join(API, "src"));
  assert.ok(usados.has("tiempo.schema.json") && usados.has("haza.schema.json"), "no se encuentran las lecturas de esquemas: " + [...usados].join(", "));
  const copia = /^COPY\s+(.+?)\s+\.\/contratos\/\s*$/m.exec(lee("apps/api/Dockerfile"));
  assert.ok(copia, "el Dockerfile copia los esquemas a ./contratos/");
  const copiados = new Set(copia[1].split(/\s+/).map(f => f.replace(/^contratos\//, "")));
  const faltan = [...usados].filter(f => !copiados.has(f));
  assert.deepStrictEqual(faltan, [], "esquemas que la api lee y la imagen no lleva (apps/api/Dockerfile, COPY … ./contratos/)");
  for (const f of copiados) assert.ok(fs.existsSync(path.join(RAIZ, "contratos", f)), "el Dockerfile copia un esquema que no existe: " + f);
  // y el contexto de construcción los deja pasar (Dockerfile.dockerignore es una lista blanca: sin su «!», «not found» al construir)
  const pasan = new Set([...lee("apps/api/Dockerfile.dockerignore").matchAll(/^!contratos\/(\S+)\s*$/gm)].map(m => m[1]));
  assert.deepStrictEqual([...copiados].filter(f => !pasan.has(f)), [], "esquemas que el Dockerfile copia y apps/api/Dockerfile.dockerignore no deja pasar");
});

test("migraciones: ninguna expresión regular con repeticiones de más de 255 (PostgreSQL no las admite y la restricción rompe al insertar)", () => {
  const dir = path.join(API, "migraciones");
  const malas = [];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".sql")).sort()) {
    const s = fs.readFileSync(path.join(dir, f), "utf8").split("\n").filter(l => !/^\s*--/.test(l)).join("\n");
    for (const m of s.matchAll(/\{(\d+)(?:,(\d+))?\}/g)) if (Math.max(Number(m[1]), Number(m[2] || 0)) > 255) malas.push(f + ": " + m[0]);
  }
  // la 0013 la trae (credencial_id {16,1366}) y la 0015 la sustituye: las migraciones no se editan una vez escritas
  assert.deepStrictEqual(malas, ["0013_llaves_oficina.sql: {16,1366}"], "expresiones con más de 255 repeticiones (RE_DUP_MAX): pártelas en alfabeto + char_length");
  assert.match(lee("apps/api/migraciones/0015_llaves_credencial.sql"), /DROP CONSTRAINT llaves_oficina_credencial_id_check/);
});

test("dependencias de apps/api fijadas a versión exacta y con package-lock", () => {
  const p = JSON.parse(lee("apps/api/package.json"));
  for (const [n, v] of Object.entries({ ...p.dependencies, ...p.devDependencies })) assert.match(v, /^\d+\.\d+\.\d+$/, n + "@" + v + ": versión sin fijar");
  assert.ok(fs.existsSync(path.join(API, "package-lock.json")), "falta apps/api/package-lock.json");
});

test("las variables que lee la api están declaradas en contratos/publicacion-vps.json", () => {
  const leidas = new Set();
  for (const f of fs.readdirSync(path.join(API, "src"), { recursive: true }).filter(f => String(f).endsWith(".ts"))) {
    const s = fs.readFileSync(path.join(API, "src", String(f)), "utf8");
    for (const m of s.matchAll(/"((?:GEMELO|NODE)_[A-Z_]+)"/g)) leidas.add(m[1]);
  }
  const conocidas = new Set(CONTRATO.variables_api.flatMap(v => [v, v.replace(/_FICHERO$/, "")]));
  const faltan = [...leidas].filter(v => !conocidas.has(v) && !conocidas.has(v + "_FICHERO"));
  assert.deepStrictEqual(faltan, [], "variables sin declarar en contratos/publicacion-vps.json");
});

test("contratos de la api: OpenAPI y ficha de haza se leen y la ficha es lista blanca", () => {
  const o = lee("contratos/api.openapi.yaml");
  assert.match(o, /^openapi: 3\.1\.0$/m);
  const h = JSON.parse(lee("contratos/haza.schema.json"));
  assert.strictEqual(h.additionalProperties, false);
  for (const p of ["titular", "kg", "correo"]) assert.ok(!(p in (h.properties || {})), "la ficha no puede tener " + p);
});

test("tuberia/hazas: el ejemplo sintético se convierte a SQL idempotente", t => {
  const py = python();
  if (!py) return t.skip("sin Python 3: el cargador de hazas NO se ha comprobado");
  const dep = spawnSync(py, ["-c", "import jsonschema"], { encoding: "utf8" });
  if (dep.status !== 0) return t.skip("sin jsonschema (pip install -r tuberia/hazas/requirements.txt): el cargador NO se ha comprobado");
  const sal = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "gemelo-hazas-")), "h.sql");
  const r = ejecuta(py, ["tuberia/hazas/carga_hazas.py", "--hazas", "tuberia/hazas/ejemplo/hazas.sintetico.geojson",
    "--olivos", "tuberia/hazas/ejemplo/olivos.sintetico.geojson", "--salida", sal]);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), { hazas: 3, olivos: 37, salida: "h.sql" });
  const sql = fs.readFileSync(sal, "utf8");
  assert.match(sql, /ON CONFLICT \(codigo\) DO UPDATE/);
  assert.ok(!/hogar_id/.test(sql.split("INSERT INTO haza_parcela")[0].split("INSERT INTO hazas")[1] || ""), "el cargador no debe tocar hogar_id");
});

test("apps/api: tipos y pruebas unitarias (sin base de datos)", { timeout: 600_000 }, t => {
  if (!HAY_DEPS) return t.skip(SIN_DEPS + ": tipos y unitarias de la api NO comprobados");
  const tsc = spawnSync(process.execPath, [path.join(API, "node_modules", "typescript", "bin", "tsc"), "--noEmit", "-p", "tsconfig.json"], { cwd: API, encoding: "utf8" });
  assert.strictEqual(tsc.status, 0, "tsc:\n" + tsc.stdout + tsc.stderr);
  const u = pruebas(["pruebas/unidad/*.test.ts"]);
  assert.strictEqual(u.status, 0, "pruebas unitarias de la api:\n" + u.stdout.split("\n").filter(l => /^(✖|not ok|ℹ)/.test(l)).join("\n"));
});

test("apps/api: integración contra PostGIS en contenedor (opcional, GEMELO_DOCKER=1)", { timeout: 600_000 }, t => {
  if (process.env.GEMELO_DOCKER !== "1") return t.skip("opcional: GEMELO_DOCKER=1 para la integración con PostGIS");
  if (!HAY_DEPS) return t.skip(SIN_DEPS);
  const r = pruebas(["--test-concurrency=1", "--test-timeout=240000", "pruebas/integracion/*.test.ts"]);
  const resumen = r.stdout.split("\n").filter(l => /^(✖|ℹ (pass|fail|skipped))/.test(l)).join("\n");
  assert.strictEqual(r.status, 0, "integración:\n" + resumen);
  // Con Docker no se salta nada por Docker. Las que piden un servicio de infra/dev (Mailpit, LiveKit de desarrollo: GEMELO_MAILPIT_URL,
  // GEMELO_DEV_LIVEKIT_*) se saltan solas sin él y lo dicen; esas se cuentan aparte y se avisan, no tumban la puerta.
  const saltadas = r.stdout.split("\n").filter(l => /^\s*﹣ /.test(l));
  assert.strictEqual(saltadas.length, Number(/ℹ skipped (\d+)/.exec(r.stdout)?.[1] ?? -1), "no se ven todas las saltadas:\n" + resumen);
  const porServicio = saltadas.filter(l => /# sin GEMELO_(MAILPIT_URL|DEV_LIVEKIT_)/.test(l));
  assert.deepStrictEqual(saltadas.filter(l => !porServicio.includes(l)), [], "alguna prueba de integración se saltó (¿Docker?):\n" + resumen);
  for (const l of porServicio) t.diagnostic("integración NO comprobada sin su servicio de infra/dev: " + l.trim());
});

test("infra/Caddyfile: cabeceras, sesión y registros (opcional, GEMELO_DOCKER=1)", { timeout: 300_000 }, t => {
  if (process.env.GEMELO_DOCKER !== "1") return t.skip("opcional: GEMELO_DOCKER=1 para infra/probar-caddy.sh");
  const r = spawnSync("bash", ["infra/probar-caddy.sh"], { cwd: RAIZ, encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stdout.split("\n").filter(l => /MAL|fallos/.test(l)).join("\n") + r.stderr);
});

// infra/comprobar-despliegue.sh: la comprobación posterior al despliegue SOLO LEE (RUNBOOK-VPS). Se mira que no tenga
// órdenes que cambien nada y se ejecuta contra un servidor falso en 127.0.0.1 que imita al Caddy interno (sin Docker).
const COMPRUEBA = "infra/comprobar-despliegue.sh";
const ESCRIBE = new RegExp([
  /docker\s+compose[^\n]*\s(up|down|rm|restart|stop|start|kill|build|pull|create|run)\b/,
  /docker\s+(rm|rmi|stop|kill|restart|run|network\s+(create|rm|connect|disconnect)|volume\s+rm|system\s+prune|builder\s+prune)\b/,
  /curl\b[^|\n]*\s-(X|d|F|T)\s|--data/, /\bufw\s+(allow|deny|delete|enable|disable|reset)\b/,
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\s/, /caddy\s+reload/,
  /systemctl\s+(start|stop|restart|enable|disable)/, /\brm\s+-/, /\bmv\s/, />\s*\/(etc|srv|var)\//,
].map(r => r.source).join("|"));

test("infra/comprobar-despliegue.sh solo lee: sin órdenes que cambien nada", () => {
  const mal = sinComentarios(COMPRUEBA).split("\n").filter(l => ESCRIBE.test(l));
  assert.deepStrictEqual(mal, [], "el guion de comprobación posterior no puede cambiar nada");
});

test("infra/comprobar-despliegue.sh contra un servidor falso que imita al Caddy interno (sin Docker)", { timeout: 240_000 }, async t => {
  const hay = h => spawnSync("bash", ["-c", "command -v " + h], { encoding: "utf8" }).status === 0;
  if (!hay("bash") || !hay("curl")) return t.skip("sin bash o curl: el guion de comprobación NO se ha ejecutado");
  assert.strictEqual(spawnSync("bash", ["-n", COMPRUEBA], { cwd: RAIZ, encoding: "utf8" }).status, 0, "bash -n " + COMPRUEBA);
  const http = require("http"), { spawn } = require("child_process");
  const SEG = {
    "Strict-Transport-Security": "max-age=31536000", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin", "Cross-Origin-Opener-Policy": "same-origin",
    "Permissions-Policy": "xr-spatial-tracking=(self), microphone=(self), camera=()",
    "Content-Security-Policy-Report-Only": "default-src 'self'; script-src 'self'; object-src 'none'",
  };
  const arranca = roto => new Promise(res => {
    const srv = http.createServer((req, rep) => {
      const h = Object.assign({}, SEG), u = req.url.split("?")[0];
      if (roto) delete h["Referrer-Policy"];
      if (u === "/") { h["Cache-Control"] = "no-cache"; rep.writeHead(200, h); return rep.end("<!doctype html>"); }
      if (u === "/api/salud") { h["Cache-Control"] = "no-store"; rep.writeHead(200, h); return rep.end(roto ? '{"estado":"mal","bd":"mal"}' : '{"estado":"ok","bd":"ok"}'); }
      if (u.startsWith("/api/interno/")) { rep.writeHead(roto ? 204 : 404, h); return rep.end(); }
      if (u === "/api/avisos/baja") { rep.writeHead(roto ? 401 : 400, h); return rep.end(); }
      if (u === "/rtc/") { rep.writeHead(502, h); return rep.end(); }
      if ((u.startsWith("/finca") || u.startsWith("/oficina")) && req.headers["sec-fetch-mode"] === "navigate") { h.Location = "/"; rep.writeHead(303, h); return rep.end(); }
      rep.writeHead(401, h); rep.end();
    });
    srv.listen(0, "127.0.0.1", () => res(srv));
  });
  const corre = srv => new Promise(res => {
    const p = spawn("bash", [COMPRUEBA, "http://127.0.0.1:" + srv.address().port], { cwd: RAIZ, env: Object.assign({}, ENTORNO_HIJO, { NO_PROXY: "127.0.0.1" }) });
    let out = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => res({ code, out }));
  });
  const bueno = await arranca(false);
  try {
    const r = await corre(bueno);
    assert.strictEqual(r.code, 0, "contra el servidor falso bien configurado:\n" + r.out.split("\n").filter(l => /MAL|fallos/.test(l)).join("\n"));
  } finally { bueno.close(); }
  const malo = await arranca(true);
  try {
    const r = await corre(malo);
    assert.strictEqual(r.code, 1, "contra un servidor mal configurado debe fallar:\n" + r.out);
    for (const s of ["falta Referrer-Policy", "/api/salud responde", "/api/interno accesible desde fuera", "/api/avisos/baja sin sesión"]) assert.ok(r.out.includes(s), "no detecta: " + s + "\n" + r.out);
  } finally { malo.close(); }
});
