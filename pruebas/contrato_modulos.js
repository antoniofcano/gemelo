// Contrato de los módulos de src/: la cabecera «Expone / Consume» de cada fichero se DERIVA del código (no se escribe a mano).
//   node pruebas/contrato_modulos.js --comprueba   sale con 1 y lista las cabeceras que ya no coinciden (lo usa pruebas/guardianes/contratos.test.js)
//   node pruebas/contrato_modulos.js --escribe     reescribe las cabeceras (hazlo tras añadir o quitar una declaración compartida entre módulos)
// Expone  = declaraciones de primer nivel (dos espacios de sangría, `var`/`function`) que otro módulo usa.
// Consume = nombres expuestos por otros módulos que este usa. Es una derivación textual: un nombre local que coincida puede colarse; la cabecera lo dice.
"use strict";
const fs = require("fs"), path = require("path");
const SRC = path.join(__dirname, "..", "apps", "web", "motor");
const MARCA_I = "// ===== CONTRATO DEL MÓDULO (lo comprueba pruebas/guardianes/contratos.test.js) =====";
const MARCA_F = "// ===============================================================================";
const NOTAS = {
  "01_datos.js": "Abre la IIFE que cierra 99_cierre.js y activa \"use strict\". Primer módulo: define D (los datos de la finca) y las utilidades.",
  "02c_componentes.js": "Núcleo de componentes (ADR-0023): ComponentesPuro, Bus (catálogo en contratos/eventos.json), Teclas, Componentes (registro, encendido URL > servidor > defecto, fases del bucle) y Config (GET /api/config del mismo origen al cargar, solo con D.base /teselas/… o ?api=; caída al código; contratos/config.schema.json). Publica además window.__componentes y window.__config (pruebas y ?debug). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/componentes.test.js.",
  "02d_laminas.js": "Servicio del núcleo (ADR-0023, C8): LaminasPuro y Laminas (un lienzo 2D como textura de un cartel en el mundo: colocación delante a la altura de los ojos, giro suave, cierre por distancia o al salir de VR, repintado solo si cambia la firma, liberado entero y alTocar(u, v) para el rayo y el gatillo). Sin reloj propio: lo mueve 90_final (Laminas.revisa) y 29_vr (Laminas.toca). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/laminas.test.js.",
  "02e_entidades.js": "Servicio del núcleo (ADR-0023, C7): EntidadesPuro, Entidades (registro de tipos de cosas del mundo con id estable; cada módulo registra su tipo y responde por sus cosas) y Usables (la selección única para toque, clic, rayo VR y cercanía, la ficha común #ficha, el anillo de resaltado y los eventos usable:*). Publica además window.__usables (pruebas). Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/entidades.test.js.",
  "11_sol.js": "Define sol2() (sol según hora y fecha); se engancha al control de hora dentro del propio módulo.",
  "12b_llegada.js": "Publica además window.__llegada (pruebas). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/llegada.test.js.",
  "13b_hazas.js": "Sin D.base /teselas/… ni ?api= no pide nada ni crea nada; el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/hazas.test.js.",
  "15_tiempo.js": "Lee /api/tiempo (mismo origen) solo con D.base /teselas/… o ?api=; si no, el conector de claude.ai; si no, el tiempo simulado, dicho. Expone TiempoVivo (contratos/interfaces.json). El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/tiempo_motor.test.js.",
  "23_estacion.js": "Publica además window.__otDebug (depuración del olivo estacional).",
  "25_perros.js": "Publica además window.__perrosDebug (depuración).",
  "26_presencia.js": "Publica además window.__presencia (pruebas). Sin ?presencia=sim o ?presencia=red no crea nada (con red, import(\"livekit-client\") y el panel Gente); el trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/presencia.test.js.",
  "26b_avatares.js": "Sin presencia no crea nada; con ella, pide /avatares/catalogo.json solo si alguien lleva avatar (o con &vrm=1 en la simulación) e import(\"@pixiv/three-vrm\") solo entonces. El trozo entre [puro:inicio] y [puro:fin] lo evalúa en Node pruebas/guardianes/avatares.test.js.",
  "27_debug.js": "Publica window.__g, el gancho de las pruebas (contrato en doc/sistema/CONTRATOS.md).",
  "19_balizas.js": "Registra el tipo baliza en Entidades (C7). Publica además window.__vrBalizas (pruebas VR: el pie de cada columna de luz).",
  "29_vr.js": "Publica además window.__vrDebug, __vrOlivo, __vrBotones, __vrVuelo y VR_ESTADO (depuración y pruebas VR).",
  "35_fichas_tiempo.js": "Componente «fichas-tiempo» (ADR-0023): solo se registra (Componentes.registra); nadie lo nombra. Montado, publica window.__fichaTiempo (pruebas), la tecla P, la fila del tiempo del panel VR y escucha «prevision:alterna». Lee TiempoVivo si el motor lo expone; si no, un respaldo simulado. Los trozos [puro:…] y [motor:…] los evalúa en Node pruebas/guardianes/fichas_tiempo.test.js.",
  "40_juegos.js": "Componente «juegos» (ADR-0023, C9a): el anfitrión de juegos casuales. Solo se registra; nadie lo nombra. Montado: icono y ventana «Juegos», tecla J, recoge los juegos por el Bus («juego:ofrece» / «juego:pide» / «juego:retira»), abre uno a pantalla completa con el mundo en pausa (Pausa de 02c; su fase «pausa») y guarda el récord (localStorage y, con servidor, /api/juegos/<id>/…). Publica window.__juegos (pruebas). El trozo [puro:…] lo evalúa en Node pruebas/guardianes/juego_cosecha.test.js.",
  "41_cae_la_cosecha.js": "Componente «cae-la-cosecha» (ADR-0023, C9a): el primer juego casual (diseño propio del género «piezas que caen»). Solo se registra; nadie lo nombra. Se ofrece al anfitrión por el Bus y pide sus sonidos con «sonido:juego». Los trozos [puro:…] (las reglas, con semilla) y [dibujo:…] los evalúa en Node pruebas/guardianes/juego_cosecha.test.js.",
  "90_final.js": "Arranque y bucle: Mundo.arranca, Componentes.arranca, cuadro() y requestAnimationFrame. Define el orden de las actualizaciones por fotograma: los módulos que aún no son componentes a mano y los componentes por fases (mundo, tarde, trasRender).",
  "99_cierre.js": "Cierra la IIFE abierta en 01_datos.js.",
};

function lee() {
  const fich = fs.readdirSync(SRC).filter(f => f.endsWith(".js")).sort();
  const txt = {};
  for (const f of fich) {
    let s = fs.readFileSync(path.join(SRC, f), "utf8");
    if (s.startsWith(MARCA_I)) s = s.slice(s.indexOf(MARCA_F) + MARCA_F.length + 1);   // sin la cabecera: se deriva del código
    txt[f] = s;
  }
  return txt;
}

function declaradas(s) {
  const out = [];
  for (const ln of s.split("\n")) {
    let m = /^  function\*?\s+([\w$]+)/.exec(ln);
    if (m) { out.push(m[1]); continue; }
    m = /^  var\s+(.*)$/.exec(ln);
    if (!m) continue;
    let depth = 0, cur = "", instr = null; const partes = [];
    for (const ch of m[1]) {
      if (instr) { cur += ch; if (ch === instr) instr = null; continue; }
      if ("\"'`".includes(ch)) { instr = ch; cur += ch; continue; }
      if ("([{".includes(ch)) depth++; else if (")]}".includes(ch)) depth--;
      if (ch === "," && depth === 0) { partes.push(cur); cur = ""; continue; }
      cur += ch;
    }
    partes.push(cur);
    for (const p of partes) { const mm = /^\s*([\w$]+)\s*(=|;|$)/.exec(p); if (mm) out.push(mm[1]); }
  }
  return out;
}
const esc = n => n.replace(/[$]/g, "\\$");
function usa(n, s) { return new RegExp("(?<![\\w$.])" + esc(n) + "(?![\\w$])").test(s); }

function deriva() {
  const txt = lee(), dec = {}, expone = {}, cons = {};
  for (const f in txt) dec[f] = declaradas(txt[f]);
  for (const f in txt) {
    expone[f] = [];
    for (const n of dec[f]) if (!expone[f].includes(n) && Object.keys(txt).some(g => g !== f && usa(n, txt[g]))) expone[f].push(n);
  }
  const dueno = {};
  for (const f in expone) for (const n of expone[f]) if (!(n in dueno)) dueno[n] = f;
  for (const f in txt) {
    const c = {};
    for (const n in dueno) {
      const g = dueno[n];
      if (g === f || dec[f].includes(n)) continue;
      if (n.length < 3 && n !== "D" && n !== "$") continue;
      if (usa(n, txt[f])) (c[g.slice(0, -3)] = c[g.slice(0, -3)] || []).push(n);
    }
    cons[f] = c;
  }
  return { txt, expone, cons };
}

function envuelve(clave, items, ancho = 150) {
  const lin = []; let cur = "// " + clave + ": ";
  items.forEach((it, i) => {
    const t = it + (i < items.length - 1 ? "," : "");
    if (cur.length + t.length + 1 > ancho && cur.trim() !== "//" && cur.trim() !== "// " + clave + ":") { lin.push(cur.trimEnd()); cur = "//   "; }
    cur += t + " ";
  });
  lin.push(cur.trimEnd()); return lin;
}
function cabecera(f, d) {
  const L = [MARCA_I];
  L.push(...(d.expone[f].length ? envuelve("Expone", d.expone[f]) : ["// Expone: (nada al resto de módulos)"]));
  const mods = Object.keys(d.cons[f]).sort();
  L.push(...(mods.length ? envuelve("Consume", mods.map(m => m + " (" + d.cons[f][m].join(", ") + ")")) : ["// Consume: (nada de otros módulos)"]));
  if (NOTAS[f]) L.push("// Nota: " + NOTAS[f]);
  L.push(MARCA_F);
  return L.join("\n") + "\n";
}

/** Lee la cabecera de un fichero: { expone: [...], consume: { modulo: [...] } } o null si no la tiene */
function leeCabecera(s) {
  if (!s.startsWith(MARCA_I)) return null;
  const bloque = s.slice(0, s.indexOf(MARCA_F)).split("\n").slice(1);
  const claves = {}; let k = null;
  for (const l of bloque) {
    const m = /^\/\/ (Expone|Consume|Nota): ?(.*)$/.exec(l);
    if (m) { k = m[1]; claves[k] = m[2]; } else if (k && l.startsWith("//   ")) claves[k] += " " + l.slice(5).trim();
  }
  const expone = (claves.Expone || "").startsWith("(") ? [] : (claves.Expone || "").split(",").map(x => x.trim()).filter(Boolean);
  const consume = {};
  if (claves.Consume && !claves.Consume.startsWith("(")) {
    const re = /([\w]+) \(([^)]*)\)/g; let m;
    while ((m = re.exec(claves.Consume))) consume[m[1]] = m[2].split(",").map(x => x.trim()).filter(Boolean);
  }
  return { expone, consume };
}

function comprueba() {
  const d = deriva(), mal = [];
  for (const f in d.txt) {
    const real = fs.readFileSync(path.join(SRC, f), "utf8");
    if (real !== cabecera(f, d) + d.txt[f]) mal.push(f);
  }
  return mal;
}
function escribe() {
  const d = deriva();
  for (const f in d.txt) fs.writeFileSync(path.join(SRC, f), cabecera(f, d) + d.txt[f], { encoding: "utf8" });
  return Object.keys(d.txt).length;
}

module.exports = { deriva, leeCabecera, comprueba, escribe, MARCA_I, MARCA_F, SRC };

if (require.main === module) {
  if (process.argv.includes("--escribe")) console.log("cabeceras escritas:", escribe());
  else {
    const mal = comprueba();
    if (mal.length) { console.error("Cabeceras desactualizadas (ejecuta: node pruebas/contrato_modulos.js --escribe):\n  " + mal.join("\n  ")); process.exit(1); }
    console.log("cabeceras de contrato al día");
  }
}
