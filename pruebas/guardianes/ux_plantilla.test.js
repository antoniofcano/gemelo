"use strict";
// U1 · la página ES el visor (doc/sistema/UX-FINCA-JUEGO.md §4.1, decisión 83): en Node, sin navegador, sobre apps/web/plantilla.html.
// Que el visor ocupe toda la ventana sin desplazar la página, que la cabecera y el pie vivan en el menú, que existan los contenedores del pacto de la UX
// (#hud, #hudBarra, #hudEstado, #capaFlotantes, <dialog id="menu"> con #menuAjustes, #menuCreditos y #menuFinca) y que los ids que buscan el motor
// y las pruebas sigan ahí (los controles se MUEVEN, no se renombran). La comprobación en Chrome (capturas a 1280 × 800, 390 × 844 y 844 × 390) va por el banco.
const test = require("node:test"), assert = require("node:assert");
const path = require("path"), { pathToFileURL } = require("url");
const { lee, ficheros, RAIZ } = require("./_util");

const PL = lee("apps/web/plantilla.html");
const ids = s => [...s.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
const IDS = ids(PL);
const MOTOR = ficheros().filter(f => /^apps\/web\/motor\/[^/]+\.js$/.test(f)).sort().map(lee).join("\n");
const css = lee("apps/web/plantilla.css");   // V12: los estilos salieron del <style> de la plantilla

test("V12: la plantilla cumple la CSP estricta: sin style=\"…\" ni <style> en línea, sin Google Fonts ni otro origen en sus <link>", () => {
  assert.ok(!/\sstyle\s*=/i.test(PL), "la plantilla lleva un atributo style (style-src 'self' lo rechaza): usa una clase de plantilla.css");
  assert.ok(!/<style/i.test(PL), "la plantilla lleva un <style> en línea: va en apps/web/plantilla.css");
  assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(PL + css), "las tipografías salen del mismo origen (@fontsource), no de Google");
  for (const m of PL.matchAll(/<link\b[^>]*\bhref="([^"]*)"/g)) assert.ok(!/^(https?:)?\/\//.test(m[1]), "un <link> a otro origen: " + m[1]);
  for (const m of css.matchAll(/@import\s+"([^"]+)"/g)) assert.ok(/^@fontsource\//.test(m[1]), "@import inesperado en plantilla.css: " + m[1]);
  assert.match(css, /@fontsource\/fraunces\/latin-600\.css/);
  assert.match(css, /@fontsource\/instrument-sans\/latin-500\.css/);
});

test("V12: el HTML que arma el motor no lleva atributos style (la CSP los rechaza); lo variable va en data-fondo / data-ancho y lo pasa tinta()", () => {
  const fs = require("node:fs"), dir = path.join(RAIZ, "apps", "web", "motor");
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js"))) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    assert.ok(!/\sstyle\s*=\s*[\\"']/.test(t), f + " escribe un atributo style en un HTML: usa una clase de plantilla.css o data-fondo / data-ancho + tinta()");
    assert.ok(!/setAttribute\(\s*["']style["']/.test(t), f + " pone el atributo style con setAttribute: usa .style.propiedad o classList (CSSOM sí vale)");
    // un <style> creado por JS también es estilo en línea para la CSP (style-src-elem): 33_ajustes lo hacía y la CSP de dev lo denunciaba en /finca/
    assert.ok(!/createElement\(\s*["']style["']\s*\)/.test(t), f + " crea un <style> (la CSP style-src 'self' lo rechaza): sus reglas van en apps/web/plantilla.css");
    if (/data-(fondo|ancho)=/.test(t)) assert.ok(/tinta\(/.test(t), f + " usa data-fondo / data-ancho y no llama a tinta()");
  }
});

test("el visor ocupa toda la ventana y la página no se desplaza", () => {
  assert.match(css, /html, body \{[^}]*height: 100%[^}]*overflow: hidden/, "html y body: alto completo y sin desplazamiento");
  assert.match(css, /\.visor \{ position: fixed; inset: 0;[^}]*overflow: hidden/, "el visor, fijo a toda la ventana");
  assert.match(css, /env\(safe-area-inset-top/, "márgenes de zona segura (muescas)");
  assert.doesNotMatch(PL, /class="pagina"|<header>\s*<h1>|<aside|class="lateral"/, "sin la página de antes: cabecera, columna lateral ni envoltorio");
  assert.doesNotMatch(css, /\.visor \{[^}]*height: clamp/, "el visor ya no es una caja de alto fijo");
});

test("sin ids repetidos en la plantilla", () => {
  const vistos = new Set(), rep = IDS.filter(i => vistos.has(i) || !vistos.add(i));
  assert.deepStrictEqual(rep, []);
});

test("los contenedores del pacto de la UX existen (los rellenan otros módulos)", () => {
  for (const id of ["hud", "hudBarra", "hudEstado", "capaFlotantes", "menu", "menuAjustes", "menuCreditos", "menuFinca", "ventanaGente"]) assert.ok(IDS.includes(id), "falta #" + id);
  assert.match(PL, /<dialog id="menu"/, "el menú es un <dialog> nativo");
  for (const p of ["menuAjustes", "menuCreditos", "menuFinca"]) assert.match(PL, new RegExp('role="tab"[^>]*aria-controls="' + p + '"'), "pestaña del menú para #" + p);
});

test("la cabecera y el pie de antes viven en el menú (Acerca de la finca y Créditos), y la atribución corta queda abajo", () => {
  const finca = PL.slice(PL.indexOf('id="menuFinca"'), PL.indexOf("</dialog>"));
  assert.match(finca, /<h1>[\s\S]*?<\/h1>\s*<p>/, "título y entradilla en «Acerca de la finca»");
  assert.match(finca, /<p class="pie">/, "la nota del pie (modelo de trabajo, troncos ilustrativos)");
  assert.match(PL, /id="menuCreditos"[\s\S]*IGN-CNIG[\s\S]*CC BY 4\.0[\s\S]*Copernicus[\s\S]*ISRIC/, "créditos completos con licencia");
  assert.match(PL, /id="hudAtrib"[^>]*>© IGN-CNIG CC BY 4\.0 · Copernicus · ISRIC/, "línea de atribución en el HUD");
});

test("los ids que usa el motor con $(…) existen en la plantilla o los crea el propio motor", () => {
  const usados = [...new Set([...MOTOR.matchAll(/\$\("([\w-]+)"\)/g)].map(m => m[1]))];
  const creados = new Set([...MOTOR.matchAll(/(?:\.id = |id: |\bid=\\?["'])["']?([\w-]+)/g)].map(m => m[1]));
  const RESPALDO = new Set(["hSel"]);   // 29_vr.js lo busca solo como respaldo: $("hSel") ? "hSel" : "ndviSel"
  const faltan = usados.filter(i => !IDS.includes(i) && !creados.has(i) && !RESPALDO.has(i));
  assert.deepStrictEqual(faltan, [], "ids que el motor busca y no están");
});

test("los controles que buscan las pruebas conservan su id (se mueven, no se renombran)", () => {
  // escena3d, llegada, presencia_dev, prueba_arb, mide y vr: #btnPaseo, #padAterriza, #lienzo, #visor, #sinEscena; #btnVR lo crea 29_vr.js junto a #btnPantalla
  for (const id of ["visor", "lienzo", "btnPaseo", "padAterriza", "sinEscena", "btnPantalla", "ficha", "mapita", "pad-up", "pad-left", "pad-right", "pad-down", "padRun", "padCam", "padQuad", "padDron", "padSube", "padBaja"]) assert.ok(IDS.includes(id), "falta #" + id);
  assert.match(MOTOR, /b\.id = "btnVR"/, "29_vr.js sigue creando #btnVR");
});

test("decisión 89: se quitan «+6 h», «Mañana a las 12:00», el pasear duplicado y el segundo deslizador de fecha; los textos de ayuda fijos se quedan", () => {
  for (const id of ["tMas6", "tManana", "btnPaseoV", "hSel"]) assert.ok(!IDS.includes(id), "#" + id + " debía quitarse");
  assert.ok(IDS.includes("ayuda") && IDS.includes("ayudaPaseo"), "los textos de ayuda fijos se quedan (reubicados)");
  assert.match(css, /\.ayuda \{[^}]*font-size: 11\.5px[^}]*pointer-events: none/, "discretos: pequeños y sin comerse los toques");
  // los duplicados que aún usan otros módulos siguen existiendo, pero fuera de la vista
  const reserva = PL.slice(PL.indexOf('<div id="reserva" hidden>'), PL.indexOf("</div>", PL.indexOf('<div id="reserva" hidden>')));
  for (const id of ["btnSonido", "btnQuad", "btnDron", "hora"]) assert.ok(reserva.includes('id="' + id + '"'), "#" + id + " debía quedar en la reserva oculta");
});

test("genera_motor.mjs sigue cambiando los textos de la finca en la plantilla nueva", async () => {
  const { textosFinca } = await import(pathToFileURL(path.join(RAIZ, "apps", "web", "herramientas", "genera_motor.mjs")).href);
  const T = { finca: "Hituelo", fincas: 3, parcelas: 12, olivos: 4000, ha: 40.2, intro_historia: "Intro de prueba", sin_historia: true };
  const out = textosFinca(PL, T);
  assert.match(out, /<title>Gemelo de Hituelo<\/title>/);
  assert.match(out, /<h1>Hituelo, en 3D<\/h1>\s*<p>Gemelo de las 3 fincas de Hituelo/);
  assert.match(out, /<p class="pie">Gemelo de las 3 fincas de Hituelo/);
  assert.match(out, /Vista 3D de las fincas de Hituelo;/);
  assert.match(out, /Los puntos guardados en OlivarTrack se marcaron sobre la ortofoto/);
  assert.match(out, /id="hIntro">Intro de prueba</);
  assert.match(out, /id="historia" data-sin/);
  assert.match(css, /#historia\[data-sin\] \{ display: none !important; \}/, "plantilla.css oculta la historia de las fincas que no la tienen");
});

test("accesibilidad: todo <input>, <select> y <textarea> lleva id o name (DevTools: «A form field element should have an id or name attribute»; afecta al autorrelleno y a los lectores de pantalla)", () => {
  const fs = require("node:fs"), dir = path.join(RAIZ, "apps", "web", "motor");
  const sin = [];
  for (const m of PL.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) if (!/\b(id|name)\s*=/.test(m[0])) sin.push("plantilla.html: " + m[0].slice(0, 80));
  // los campos que crea el motor: la sentencia (la línea y las 3 siguientes) debe poner id o name. 39_oficina_mundo.js lo arregla otro encargo: pendiente anotado
  const PENDIENTES = ["39_oficina_mundo.js"];
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith(".js") && !PENDIENTES.includes(x))) {
    const texto = fs.readFileSync(path.join(dir, f), "utf8"), l = texto.split("\n");
    l.forEach((t, i) => {
      if (!/(createElement|\bel)\(\s*["'](input|select|textarea)["']/.test(t)) return;
      const ventana = l.slice(i, i + 4).join("\n");
      if (!/\.(id|name)\s*=|\b(id|name)\s*:|setAttribute\(\s*["'](id|name)["']/.test(ventana)) sin.push(f + ":" + (i + 1));
    });
    for (const m of texto.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) if (!/\b(id|name)\s*=/.test(m[0])) sin.push(f + ": HTML " + m[0].slice(0, 60));
  }
  assert.deepStrictEqual(sin, [], "campos de formulario sin id ni name (añade uno único y estable): " + sin.join(" | "));
  const vistos = new Set(), rep = IDS.filter(i => vistos.has(i) || !vistos.add(i));
  assert.deepStrictEqual(rep, [], "ids repetidos en plantilla.html");
});
