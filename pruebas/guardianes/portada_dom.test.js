"use strict";
// La portada con un DOM de mentira (OF13b-8b), solo Node: portada.js y @simplewebauthn/browser REALES contra un `document`, un `fetch` y un `navigator.credentials`
// falsos (pruebas/guardianes/portada_dom_ejecuta.mjs, un proceso por escenario). Comprueba: «Mis llaves» con su aviso y «Probar otra vez» cuando falla la lista (y el
// texto propio del 429), «Salir de todos y quitar las llaves» con su <dialog> (foco en la salida segura, un solo POST con { confirmar: true }, la sesión se cierra en
// pantalla y si falla sigue abierta), que no se ofrece a la oficina ni desde unas gafas, y que «Entrar con mi llave» pulsado varias veces no deja ceremonias colgadas.
// NO prueba: el foco real ni el <dialog> real de un navegador, ningún lector de pantalla, Windows Hello, iPhone ni Android. Eso sigue sin probarse.
const test = require("node:test"), assert = require("node:assert");
const { spawnSync } = require("child_process");
const { RAIZ, path } = require("./_util");

const EJECUTOR = path.join(RAIZ, "pruebas", "guardianes", "portada_dom_ejecuta.mjs");
function corre(escenario) {
  const r = spawnSync(process.execPath, [EJECUTOR, escenario, RAIZ.replace(/\\/g, "/")], { encoding: "utf8", timeout: 60_000, cwd: RAIZ });
  const m = /^RESULTADO (.*)$/m.exec(r.stdout || "");
  assert.ok(m, "el escenario " + escenario + " no dio resultado: " + (r.stderr || r.stdout || "").slice(0, 800));
  return JSON.parse(m[1]);
}

test("dom: si falla la lista de llaves, «Mis llaves» enseña el aviso y «Probar otra vez» (sin desaparecer) y el reintento la repinta", () => {
  const s = corre("lista_falla");
  assert.strictEqual(s.fallo.tarjeta_oculta, false, "la tarjeta no desaparece sin mensaje");
  assert.strictEqual(s.fallo.aviso_visible, true);
  assert.strictEqual(s.fallo.aviso, "No hemos podido leer tus llaves. Prueba otra vez.");
  assert.strictEqual(s.fallo.aviso, s.fallo.texto_esperado);
  assert.strictEqual(s.fallo.reintento_visible, true);
  assert.strictEqual(s.fallo.lista_vacia, true); assert.strictEqual(s.fallo.vacio_oculto, true, "no se enseña «todavía no tienes ninguna llave»: engañaría");
  assert.strictEqual(s.fallo.salida_total_visible, true, "el resto de «Mis dispositivos» sigue");
  assert.deepStrictEqual(s.tras, { tarjeta_oculta: false, aviso_oculto: true, reintento_oculto: true, llaves: 1, peticiones_lista: 2 });
});

test("dom: el 429 de la lista usa su texto propio y neutro, no el de los enlaces", () => {
  const s = corre("lista_429");
  assert.strictEqual(s.fallo.aviso, s.fallo.texto_esperado);
  assert.match(s.fallo.aviso, /^Has pedido la lista muchas veces seguidas\./);
  assert.ok(!/enlace/i.test(s.fallo.aviso), "no habla de enlaces");
  assert.strictEqual(s.fallo.reintento_visible, true);
});

test("dom: «Salir de todos y quitar las llaves» confirma con <dialog>, foco en «No, volver», un solo POST y la sesión se cierra en pantalla", () => {
  const s = corre("salida_total");
  assert.strictEqual(s.visible, true);
  assert.strictEqual(s.dialogo.abierto, true); assert.strictEqual(s.dialogo.texto, s.dialogo.texto_esperado);
  assert.match(s.dialogo.texto, /también en este/); assert.match(s.dialogo.texto, /enlace que te mandamos al correo/); assert.match(s.dialogo.texto, /llave nueva/);
  assert.strictEqual(s.dialogo.foco_en_no, true, "el foco empieza en la salida segura");
  assert.deepStrictEqual(s.tras_no, { cerrado: true, posts: 0, foco_en_boton: true }, "«No, volver» no llama a nada y devuelve el foco");
  assert.strictEqual(s.tras_si.cerrado, true);
  assert.deepStrictEqual(s.tras_si.posts, [{ k: "POST /api/yo/llaves/quitar-todas", cuerpo: { confirmar: true } }], "un solo POST, con el cuerpo estricto");
  assert.strictEqual(s.tras_si.sesion_cerrada, true); assert.strictEqual(s.tras_si.aviso_error, null);
  assert.strictEqual(s.tras_si.anuncio, s.tras_si.anuncio_esperado, "se anuncia a quien usa un lector de pantalla");
  assert.strictEqual(s.tras_si.boton_libre, true);
});

test("dom: si la api falla, la sesión sigue abierta y se dice con un aviso (role=alert) para reintentar", () => {
  const s = corre("salida_total_falla");
  assert.strictEqual(s.tras_si.sesion_cerrada, false, "no se cierra en pantalla lo que la api no cerró");
  assert.match(s.tras_si.aviso_error, /Tu sesión sigue abierta/);
  assert.strictEqual(s.tras_si.boton_libre, true);
});

test("dom: «Salir de todos y quitar las llaves» no se ofrece a una cuenta de la oficina ni desde unas gafas", () => {
  assert.strictEqual(corre("salida_total_oficina").visible, false);
  assert.strictEqual(corre("salida_total_gafas").visible, false);
});

test("dom: «Entrar con mi llave» pulsado varias veces no deja ceremonias colgadas (una sola viva) y al salir de la pantalla no queda ninguna", () => {
  const s = corre("ceremonias");
  assert.strictEqual(s.tras_boton.vivas, 1);
  assert.strictEqual(s.tras_tres.vivas, 1, "tres pulsaciones, una sola ceremonia viva");
  assert.strictEqual(s.tras_tres.empezadas, 3);
  assert.strictEqual(s.tras_tres.max, 1, "nunca dos a la vez");
  assert.strictEqual(s.al_salir.vivas, 0, "al salir de «Entrar» se aborta la última");
});
