"use strict";
// El Ambiente de cada mundo en el legado (MU2-7, MUNDOS §4). En Node, sin navegador, leyendo el código del motor:
//   1. 03_escena.js ya no fija por su cuenta lo que ahora es del Ambiente: ni el fondo (scene.background), ni la niebla (scene.fog), ni cuelga el
//      hemisferio y el sol (scene.add), ni da near/far a la cámara, ni escucha el tema para repintar el fondo. Lo aplica el gestor (90_final.js:
//      aplicaAmbiente) con el Ambiente del mundo activo (src/mundos/exterior.ts: ambienteExterior; src/mundos/vacio.ts).
//   2. 15_tiempo.js no toca la escena con el exterior congelado: lo único suyo que escribe en la scene por fotograma está en actualizaTiempo, que
//      solo se llama desde los pasos del exterior en 90_final.js (y el exterior congelado no los recorre: lo prueba Vitest, congelado.test.ts);
//      fuera de actualizaTiempo, solo cuelga sus objetos al montarse (scene.add en el nivel del módulo), y nada de lo que corre por un evento
//      (el tema: pintaFondoTiempo y temaBarrera) toca la scene.
//   3. 29_vr.js y 90_final.js cablean el Ambiente: el near/far de VR sale de gm.ambiente() y el tema vuelve a aplicar el del activo.
// HONESTIDAD: esto lee el código; que el exterior se vea igual (sin cambio visible) lo mira el banco con Chrome, no esto.
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, lee, fs, path } = require("./_util");
const acorn = require("acorn");

const sinCabecera = s => s.replace(/^\/\/ =====[\s\S]*?\/\/ =+\n/, "");
/** El módulo como programa (una IIFE de mentira alrededor, como en el montaje: los módulos son trozos de la IIFE de 01_datos/99_cierre). */
function arbol(fichero) { return acorn.parse("(function () {\n" + sinCabecera(lee("apps/web/motor/" + fichero)) + "\n})();", { ecmaVersion: "latest", locations: true }); }
/** Recorre el árbol y llama a fn(nodo, pila de funciones que lo envuelven). */
function recorre(n, fn, pila = []) {
  if (!n || typeof n.type !== "string") return;
  const esF = /Function/.test(n.type), p = esF ? pila.concat([n]) : pila;
  fn(n, pila);
  for (const k of Object.keys(n)) {
    if (k === "loc") continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(h => recorre(h, fn, p)); else if (v && typeof v.type === "string") recorre(v, fn, p);
  }
}
const nombreDe = f => (f.id && f.id.name) || "(anónima)";
/** Cada uso de scene.<prop>: [prop, escribe?, funciones que lo envuelven (sin contar la IIFE)] */
function usosDeScene(fichero) {
  const usos = [];
  recorre(arbol(fichero), (n, pila) => {
    if (n.type === "MemberExpression" && n.object.type === "Identifier" && n.object.name === "scene" && !n.computed) usos.push({ prop: n.property.name, linea: n.loc.start.line - 1, funciones: pila.slice(1).map(nombreDe) });
  });
  recorre(arbol(fichero), n => {
    if (n.type === "AssignmentExpression" && n.left.type === "MemberExpression" && n.left.object.type === "Identifier" && n.left.object.name === "scene") {
      const u = usos.find(x => x.linea === n.left.loc.start.line - 1 && x.prop === n.left.property.name); if (u) u.escribe = true;
    }
  });
  return usos;
}

test("03_escena ya no fija lo que es del Ambiente: ni fondo, ni niebla, ni luces colgadas, ni near/far, ni escucha el tema", () => {
  const e = sinCabecera(lee("apps/web/motor/03_escena.js"));
  const usos = usosDeScene("03_escena.js");
  assert.deepStrictEqual(usos.filter(u => u.prop === "background" || u.prop === "fog" || u.prop === "add"), [], "03_escena no escribe scene.background ni scene.fog ni cuelga nada");
  assert.ok(!/\bFOG[01]\b|\bEXT\b|pintaFondo/.test(e), "03_escena no lee FOG0/FOG1/EXT ni repinta el fondo (eso es del Ambiente del exterior)");
  assert.ok(!/MutationObserver|prefers-color-scheme/.test(e), "el tema lo escucha 90_final (gm.reaplicaAmbiente), no 03_escena");
  assert.match(e, /camera = new THREE\.PerspectiveCamera\(42, 1\);/, "la cámara nace sin near/far propios: los pone el Ambiente");
  assert.ok(!/camera\.(near|far)\s*=/.test(e));
  // las luces del exterior se siguen creando aquí (las mueven 11_sol y 15_tiempo, que las consumen al montarse), pero no se cuelgan
  assert.match(e, /var hemi = new THREE\.HemisphereLight\(0xffffff, 0x8a7a60, 0\.95 \* LUZ_CIELO\);\n/);
  assert.match(e, /var sol = new THREE\.DirectionalLight\(0xfff0d0, 0\.55 \* LUZ_SOL\); sol\.position\.set\(-120, 160, 90\);\n/);
  // y en ningún módulo del motor se fija ya el near/far a mano, salvo la cámara de las siluetas de 07ac (es otra: cam)
  const fin = sinCabecera(lee("apps/web/motor/90_final.js"));
  assert.ok(!/camera\.(near|far)\s*=/.test(fin) && !/camera\.(near|far)\s*=/.test(sinCabecera(require("./_fuente").fuenteMotor("29_vr.js"))));
});

test("el Ambiente del exterior tiene los valores de antes (los que fijaban 03_escena y 29_vr) y 90_final se lo da al exterior y al gestor", () => {
  const x = lee("apps/web/src/mundos/exterior.ts"), fin = sinCabecera(lee("apps/web/motor/90_final.js"));
  assert.match(x, /export const NEAR_EXTERIOR = 0\.5;/);
  assert.match(x, /export const FAR_VR_EXTERIOR = 6000;/);
  assert.match(x, /return Math\.max\(5000, extension \* 4\);/);
  assert.match(x, /cielo: "exterior", fondo: c, niebla: \{ color: c, cerca: d\.niebla\.cerca, lejos: d\.niebla\.lejos \}, luces: d\.luces,/);
  assert.match(fin, /fondo: function \(\) \{ return colorCss\("--sky"\)\.getHex\(\); \}, niebla: \{ cerca: FOG0, lejos: FOG1 \}, luces: \[hemi, sol\], extension: EXT,/);
  assert.match(fin, /exag: function \(\) \{ return Number\(\$\("exag"\)\.value\) \|\| 1; \}/, "la exag del exterior es la del usuario: el deslizador");
  assert.match(fin, /aplicaAmbiente: function \(a\) \{ Nucleo\.aplicaAmbiente\(a, escenaAmb\); \}/);
  assert.match(fin, /var escenaAmb = \{ scene: scene, camara: camera, renderer: renderer, estado: Estado, color: function \(h\) \{ return new THREE\.Color\(h\); \}, niebla: function \(h, c, l\) \{ return new THREE\.Fog\(h, c, l\); \} \};/);
  assert.match(fin, /Mundos\.creaVacio\(\{ pose: poseDelPaseo, luz: luzDe \}\)/, "el vacío recibe cómo crear sus luces");
  assert.match(fin, /reambienta = function \(\) \{ gm\.reaplicaAmbiente\(\); \}/);
  assert.match(fin, /new MutationObserver\(reambienta\)\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \["data-theme"\] \}\);/);
});

test("15_tiempo no toca la escena con el exterior congelado: lo que escribe en ella por fotograma está en actualizaTiempo, que es un paso del exterior", () => {
  const usos = usosDeScene("15_tiempo.js");
  // fuera de cualquier función (al montarse): solo scene.add de sus objetos (el grupo del cielo, el sol, las estrellas, la lluvia…)
  const alMontar = usos.filter(u => !u.funciones.length);
  assert.ok(alMontar.length >= 2 && alMontar.every(u => u.prop === "add"), "al montarse 15_tiempo solo cuelga sus objetos: " + JSON.stringify(alMontar));
  // dentro de funciones: solo en actualizaTiempo (y en las que se llaman al montarse con scene.add, como la que crea las estrellas o la lluvia)
  const enFunciones = usos.filter(u => u.funciones.length);
  const fuera = enFunciones.filter(u => u.funciones.indexOf("actualizaTiempo") < 0 && u.prop !== "add");
  assert.deepStrictEqual(fuera, [], "15_tiempo solo lee o escribe la scene en actualizaTiempo");
  const escribe = enFunciones.filter(u => u.escribe).map(u => u.prop + "@" + u.funciones.join(">"));
  assert.deepStrictEqual([...new Set(escribe)], ["background@actualizaTiempo"], "lo que reescribe por fotograma es el fondo (la niebla la mueve en su sitio)");
  // lo que corre por un evento (el tema) no toca la scene
  const src = sinCabecera(lee("apps/web/motor/15_tiempo.js"));
  for (const f of ["pintaFondoTiempo", "temaBarrera"]) {
    const i = src.indexOf("function " + f + "("); assert.ok(i >= 0, f);
    let n = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) { if (src[k] === "{") n++; else if (src[k] === "}" && --n === 0) { j = k; break; } }
    assert.ok(!/\bscene\./.test(src.slice(i, j)), f + " no toca la scene");
  }
  // actualizaTiempo solo la llama el paso «tiempo» del exterior (90_final.js), que no corre con el exterior congelado
  const fin = sinCabecera(lee("apps/web/motor/90_final.js"));
  const llamadas = fin.split("\n").filter(l => /actualizaTiempo\(/.test(l));
  assert.strictEqual(llamadas.length, 1);
  assert.match(llamadas[0], /\{ bloque: Reparto\.reg\("tiempo"\), fn: function \(dt, t\) \{ actualizaTiempo\(dt, t\); \} \}/);
  const i = fin.indexOf("var exterior = Mundos.creaExterior("), j = fin.indexOf("], antesDelRender:", i), k = fin.indexOf(llamadas[0]);
  assert.ok(i >= 0 && j > i && k > i && k < j, "la llamada a actualizaTiempo está en los pasos del exterior");
  const otros = fs.readdirSync(path.join(RAIZ, "apps", "web", "motor")).filter(f => f.endsWith(".js") && f !== "15_tiempo.js" && f !== "90_final.js")
    .filter(f => /actualizaTiempo\(/.test(sinCabecera(lee("apps/web/motor/" + f))));
  assert.deepStrictEqual(otros, [], "nadie más llama a actualizaTiempo");
});
