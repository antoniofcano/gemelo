"use strict";
// La pantalla «Revisa tu correo» de la portada (OF13b-1, decisiones 183-187), sin Chrome:
//  - el texto de aceptado es el de la api (apps/api/src/auth/rutas.ts) y el de la pantalla dice lo mismo;
//  - el correo escrito se pinta con textContent y «¿No es ese? Cambiarlo» vuelve al campo con su valor;
//  - la frase de dónde mirar nombra el remitente solo si la portada lo conoce (hoy no, y no se inventa);
//  - nada en línea ni de otro origen, zonas de toque de 44 px y el aviso en vivo.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const html = lee("apps/web/portada/index.html");
const js = lee("apps/web/portada/portada.js");
const css = lee("apps/web/portada/portada.css");
const api = lee("apps/api/src/auth/rutas.ts");

const seccion = (id) => {
  const m = new RegExp('<section[^>]*id="' + id + '"[\\s\\S]*?</section>').exec(html);
  assert.ok(m, "existe la sección " + id);
  return m[0];
};
const sinEtiquetas = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("el texto de aceptado de la api y el de la pantalla son el mismo (con el correo dentro)", () => {
  const texto = /TEXTO_ACEPTADO = "([^"]+)"/.exec(api);
  assert.ok(texto, "TEXTO_ACEPTADO en rutas.ts");
  assert.ok(texto[1].startsWith("Si ese correo tiene cuenta, te llegará un enlace."), "la api dice «Si ese correo tiene cuenta, te llegará un enlace.»");
  const pantalla = sinEtiquetas(seccion("p-revisa"));
  assert.ok(pantalla.includes("Si ese correo tiene cuenta, te llegará un enlace. Caduca en 15 minutos y sirve una sola vez."), pantalla);
  assert.ok(!/puede entrar|te acabamos de mandar/.test(html), "el texto antiguo ya no está");
});

test("«Revisa tu correo» enseña el correo escrito, y «¿No es ese? Cambiarlo» vuelve al campo con su valor", () => {
  const s = seccion("p-revisa");
  assert.match(s, /<h1 id="t-revisa" tabindex="-1">Revisa tu correo<\/h1>/);
  assert.match(s, /<strong id="correoEco">/, "el correo va en su propio elemento, que se rellena con textContent");
  assert.match(s, /<a class="btn btn-txt" href="#entrar" id="lnkCambiar">¿No es ese\? Cambiarlo<\/a>/);
  assert.match(js, /\$\("correoEco"\)\.textContent = v/, "el correo escrito se pinta como texto");
  assert.match(js, /\$\("lnkCambiar"\)\.addEventListener\("click", e => \{\s*e\.preventDefault\(\);\s*const i = \$\("correo"\);\s*i\.value = S\.correo;/,
    "el enlace copia el correo guardado al campo");
  assert.match(js, /ir\("entrar", \{ foco: false \}\);\s*i\.focus\(\);/, "y el foco va al campo, no al título");
});

test("la frase de dónde mirar: «Si no lo ves, mira en el spam.», sin nombrar remitente (la portada no lo conoce)", () => {
  assert.match(seccion("p-revisa"), /id="spamTxt"[^>]*>Si no lo ves, mira en el spam\.</);
  assert.ok(!/Correo no deseado/.test(html), "ya no dice «Correo no deseado»");
  assert.ok(!/mensaje viene de/.test(html + js), "sin remitente inventado");
});

test("nada en línea ni de otro origen; el correo nunca va como HTML; el arranque no importa nada (guardián de avatar_portada)", () => {
  for (const [n, c] of [["portada.js", js]]) {
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/.test(c), n + ": nada de HTML a mano ni código dinámico");
    // el espacio de nombres SVG no es una petición
    assert.ok(!/https?:\/\//.test(c.replace("http://www.w3.org/2000/svg", "")), n + ": solo su mismo origen");
  }
  assert.ok(!/<style|\sstyle\s*=|\son[a-z]+\s*=/i.test(html), "index.html sin estilos ni manejadores en línea");
});

test("zonas de toque de 44 px o más y anuncio en vivo para los cambios de pantalla", () => {
  assert.match(css, /--toque: 44px/);
  assert.match(css, /\.btn \{[^}]*min-height: var\(--toque\)/, "los botones y enlaces .btn tienen la altura de toque");
  assert.match(html, /<p class="vh" id="anuncio" role="status" aria-live="polite"><\/p>/);
  assert.match(html, /<div class="aviso aviso-err" id="avRevisa" role="alert" hidden>/, "los errores de «Revisa» se anuncian");
});
