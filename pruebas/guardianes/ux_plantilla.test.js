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
// MU5-n (A3-6a): también lo migrado a apps/web/src/ (sin las pruebas): ahí crea la presencia su #presenciaGente
// A3-8c: el cliente entero es apps/web/src/ (el arranque y sus módulos, sin las pruebas ni las declaraciones de tipos): [fichero, texto]
const CLIENTE = ficheros().filter(f => /^apps\/web\/src\/.+(?<!\.test)(?<!\.d)\.ts$/.test(f)).sort().map(f => [f, lee(f)]);
const MOTOR = CLIENTE.map(([, t]) => t).join("\n");
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
  for (const [f, t] of CLIENTE) {
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
  assert.match(css, /\.ayuda \{[^}]*font-size: \.7188rem[^}]*pointer-events: none/, "discretos: pequeños (11,5 px en rem, L6-01) y sin comerse los toques");
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
  const sin = [];
  for (const m of PL.matchAll(/<(input|select|textarea)\b[^>]*>/gi)) if (!/\b(id|name)\s*=/.test(m[0])) sin.push("plantilla.html: " + m[0].slice(0, 80));
  // los campos que crea el motor: la sentencia (la línea y las 3 siguientes) debe poner id o name. 39_oficina_mundo.js lo arregla otro encargo: pendiente anotado
  const PENDIENTES = [];
  for (const [f, texto] of CLIENTE.filter(([x]) => !PENDIENTES.includes(x))) {
    const l = texto.split("\n");
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

// ---------- la pasada de accesibilidad de la auditoría de noviembre (lente 6). En Node, leyendo el CSS y el TS: lo que solo un navegador mide (estilos calculados, cajas,
// contrastes sobre el fotograma) va al banco (ver «ajustes_ui.test.js»); en el iPhone y en el Quest, NO probado.
const reglas = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].replace(/^[\s\S]*@media[^{]*$/, "").trim(), cuerpo: m[2] }));

test("L6-01: el tamaño del texto escala la raíz y TODO texto de la página va en rem (el HUD, el menú, las ventanas y las cajas que crea el cliente)", () => {
  assert.match(css, /:root \{ font-size: calc\(100% \* var\(--escala-texto\)\); \}/, "la raíz escala con --escala-texto (Configuración → Accesibilidad)");
  assert.match(css, /--escala-texto: 1;/, "con su valor por defecto");
  const px = reglas.filter(r => /font(-size)?:\s*[^;]*\b\d+(\.\d+)?px/.test(r.cuerpo)).map(r => r.sel);
  assert.deepStrictEqual(px, [], "font-size en px en plantilla.css (no crece con el ajuste): pásalo a rem");
  const ajustes = lee("apps/web/src/ui/ajustes.ts");
  assert.match(ajustes, /setProperty\("--escala-texto"/, "ajustes.ts pone --escala-texto en <html>");
  // el DOM que crea el cliente con estilos en línea: font-size y font en rem (los lienzos, cx.font = "…px", no son CSS y no cuentan)
  const malos = [];
  for (const [f, t] of CLIENTE) for (const m of t.matchAll(/(font-size:\s*\d+(\.\d+)?px|\bfont:\s*(\d{3} )?\d+(\.\d+)?px)/g)) malos.push(f + ": " + m[0]);
  assert.deepStrictEqual(malos, [], "estilos en línea con el texto en px: no crecen con «Tamaño del texto»");
});

test("L6-02: el alto contraste no borra pulsado, abierto, elegido ni actual", () => {
  const r = reglas.find(x => /data-contraste="alto"/.test(x.sel) && /aria-pressed="true"/.test(x.sel));
  assert.ok(r, "falta la regla de alto contraste para los estados");
  for (const a of ["aria-pressed", "aria-expanded", "aria-selected", "aria-checked", "aria-current"]) assert.match(r.sel, new RegExp(a + '="true"'), "el estado " + a);
  assert.match(r.cuerpo, /background: #fff !important/); assert.match(r.cuerpo, /color: #000 !important/);
});

test("L6-03 (CSS): «Movimiento: Normal» manda sobre la preferencia del sistema; «Reducido» apaga las animaciones", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ :root:not\(\[data-movimiento="normal"\]\) \*/);
  assert.match(css, /:root\[data-movimiento="reducido"\] \*/);
});

test("L6-14 y L6-15: la pestaña activa de Configuración y los textos fijos del HUD con contraste (texto oscuro sobre el olivo; texto claro sobre el cristal)", () => {
  assert.match(css, /\.ajustes \.aj-pestanas \[aria-selected="true"\] \{[^}]*color: var\(--sobre-olivo\)/);
  assert.match(css, /\.ayuda \{[^}]*color: var\(--hud-txt\); background: var\(--hud\)/, ".ayuda");
  assert.match(css, /\.hud-atrib \{[^}]*color: var\(--hud-txt\); background: var\(--hud\)/, ".hud-atrib");
});

test("L6-17: los controles que se tocan miden 44 px como mínimo (min-height, alto o ancho en px por debajo de 44)", () => {
  const TOCABLES = /(button|select|input|\.boton|\.chip|\.h-btn|\.h-punto|\.reiniciar|\[role="tab"\]|summary)(?![\w-])/;
  const EXCEPCION = { ".hud-atrib": "solo en escritorio (en táctil va al menú, plantilla.css); 24 px, WCAG 2.5.8" };
  const malos = [];
  for (const r of reglas) {
    if (!TOCABLES.test(r.sel) && !/\.hud-atrib/.test(r.sel)) continue;
    if (/::?(before|after)|:disabled|\.capa input|label\.aj-fila input|\.insignia/.test(r.sel)) continue;   // el dibujo del punto; las casillas van dentro de su etiqueta de 44 px
    for (const m of r.cuerpo.matchAll(/(?:^|;)\s*(min-height|height|min-width|width):\s*(\d+)px/g)) {
      if (Number(m[2]) >= 44) continue;
      const exc = Object.keys(EXCEPCION).find(k => r.sel.includes(k));
      if (!exc) malos.push(r.sel + " → " + m[1] + ": " + m[2] + "px");
    }
  }
  assert.deepStrictEqual(malos, [], "zonas táctiles por debajo de 44 px");
  // y los botones de la lista del corro (L6-17 citaba sus 32 px)
  assert.doesNotMatch(lee("apps/web/src/mundos/comun/corro.ts"), /min-height:32px/, "los botones del corro, a 44 px (56 en el Quest)");
});

test("L6-18: en táctil la ficha y la baliza del paseo caen bajo «lo tuyo» (la fila acaba en y = 154)", () => {
  const top = s => { const r = reglas.find(x => x.sel.startsWith(s)); const m = r && /top: calc\(var\(--sa-t\) \+ (\d+)px\)/.exec(r.cuerpo); return m ? Number(m[1]) : 0; };
  assert.ok(top('[data-tactil="si"] .ficha') >= 158, "la ficha");
  assert.ok(top('[data-tactil="si"] .visor.paseo .t-baliza') >= 158, "la baliza del paseo");
});

test("L6-21 y botones solo-icono: todo botón de la plantilla sin letras visibles lleva aria-label (o un .vh), y el aria-label contiene el rótulo visible (WCAG 2.5.3)", () => {
  const sinNombre = [], noContiene = [];
  for (const m of PL.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const at = m[1], dentro = m[2], id = (/\bid="([^"]+)"/.exec(at) || [, "?"])[1];
    const visible = dentro.replace(/<span class="vh">[\s\S]*?<\/span>/g, "").replace(/<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[a-z]+>/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const oculto = /class="vh"/.test(dentro), label = (/aria-label="([^"]*)"/.exec(at) || [])[1];
    const letras = /\p{L}{2,}/u.test(visible);
    if (!letras && !label && !oculto) sinNombre.push(id);
    if (letras && label && !label.toLowerCase().includes(visible.toLowerCase().replace(/ ?[▾]$/, ""))) noContiene.push(id + ": «" + visible + "» ⊄ «" + label + "»");
  }
  assert.deepStrictEqual(sinNombre, [], "botones solo-icono sin nombre accesible");
  assert.deepStrictEqual(noContiene, [], "aria-label que no contiene el texto visible");
});

test("L6-09: la Ayuda describe los controles de hoy (la palanca, tocar el suelo para ir andando) y su tabla trae todas las teclas reservadas y la T de hablar", () => {
  const ayuda = PL.slice(PL.indexOf('id="ventanaAyuda"'), PL.indexOf("</section>", PL.indexOf('id="ventanaAyuda"')));
  assert.doesNotMatch(ayuda, /al pasear, la cruceta va abajo/, "la cruceta ya no es lo de por defecto (la palanca, EV2-B2)");
  assert.match(ayuda, /palanca/i); assert.match(ayuda, /toque corto en el suelo te lleva andando/);
  const kbd = new Set([...ayuda.matchAll(/<kbd>([^<]+)<\/kbd>/g)].map(m => m[1]));
  for (const k of ["W A S D", "Mayús", "Intro", "Inicio", "0", "Q", "E", "V", "Espacio", "C", "L", "1", "6", "M", "H", "F", "F1", "Esc", "←", "→", "T"]) assert.ok(kbd.has(k), "falta <kbd>" + k + "</kbd> en la Ayuda");
});

test("L6-05: la voz (la palabra de la guiada, el micro y el corro) tiene su sitio reservado en la columna del estado, bajo «lo tuyo», y sus módulos lo usan", () => {
  const estado = PL.slice(PL.indexOf('id="hudEstado"'), PL.indexOf("<!-- arriba a la derecha"));
  assert.ok(estado.indexOf('id="hudVoz"') > estado.indexOf('id="hudPersonal"'), "#hudVoz dentro de #hudEstado, después de «lo tuyo»");
  assert.match(css, /\.hud-estado \{ z-index: 23; \}/, "la columna por encima de la palanca y los flotantes");
  // y su hueco vacío no se come los toques de la barra de la derecha (en 360 px tapaba «⋯», #bMas: guiada_interior_dev y voz_guiada_dev no abrían la Agenda)
  assert.match(css, /\.hud-estado \{ pointer-events: none; \}\s*\n\.hud-estado > \* \{ pointer-events: auto; \}/, "la columna deja pasar los toques por su hueco; sus piezas, no");
  for (const f of ["apps/web/src/mundos/comun/corro.ts", "apps/web/src/mundos/comun/habla.ts", "apps/web/src/ui/guiada.ts"]) assert.match(lee(f), /getElementById\("hudVoz"\)/, f + " usa #hudVoz");
  assert.match(lee("apps/web/src/ui/hud.ts"), /"hudEstado"/, "Hud.zonasProhibidas guarda la columna del estado (con la voz dentro) de los flotantes");
});
