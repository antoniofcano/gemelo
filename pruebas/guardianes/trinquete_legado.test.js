"use strict";
// Trinquete del legado (ADR-0033 §6, MUNDOS §8 y §10): las líneas de apps/web/motor/*.js SOLO BAJAN. El tope está escrito aquí (TOPE) y es
// un techo: si el motor sube, falla («quien toca, migra»: lo nuevo va a apps/web/src/). Si baja, solo lo avisa: con varios agentes en
// paralelo, un tope exacto haría chocar cada fusión; quien coordina baja TOPE al número nuevo al fusionar (decisión del 2026-11-06, A1-7).
// No se cumple el tope comprimiendo código ni quitando comentarios útiles del legado: si el cableado de una migración lo sube, se sube
// TOPE en el mismo commit con su motivo (decisión del 2026-11-06, tras MU2-2 y MU2-3). Lo que no es cableado va a apps/web/src/.
// Se cuentan las líneas de código de cada módulo SIN su cabecera «Expone / Consume» (la deriva pruebas/contrato_modulos.js del código y
// puede crecer o encoger sola al regenerarse: no es código del legado).
const test = require("node:test"), assert = require("node:assert");
const { RAIZ, fs, path } = require("./_util");
const C = require(path.join(RAIZ, "pruebas", "contrato_modulos.js"));

// 2026-11-06, A1-7 (el puente, sin ningún módulo migrado aún): 92 ficheros, 19.774 líneas sin cabeceras (511 más de cabeceras)
// 2026-11-06, A1-10 (MU1-6, 02b_cola.js pasa a talón en apps/web/src/nucleo/cola.ts): 19.712 líneas (de 19.774)
// 2026-11-06, A1-11 (MU1-7, 02h_render.js pasa a talón en apps/web/src/nucleo/render.ts; 03_escena.js +1 línea: Render.enlaza): 19.632 líneas (de 19.712)
// 2026-11-06, A1-11 (MU1-7, 02f_xr_perillas.js pasa a talón en apps/web/src/nucleo/xr-perillas.ts): 19.496 líneas (de 19.632)
// 2026-11-06, A1-11 (MU1-7, 02e_entidades.js entrega EntidadesPuro a apps/web/src/nucleo/entidades.ts y conserva Entidades y Usables, que tocan el DOM): 19.449 líneas (de 19.496)
// 2026-11-06, A1-11 (MU1-7, 12b_llegada.js y 12c_ir_a.js entregan LlegadaPuro e IrAPuro a apps/web/src/nucleo/locomocion.ts y conservan Llegada e IrA, que tocan THREE y el DOM): 19.303 líneas (de 19.449)
// 2026-11-06, A1-12 (MU1-8, 02g_vr_presupuesto.js pasa a talón en apps/web/src/nucleo/presupuesto.ts): 19.135 líneas (de 19.303)
// 2026-11-06, A1-14 (MU1-10, el bucle de 90_final.js pasa a apps/web/src/nucleo/bucle.ts; 29_vr.js +6 líneas: vrRecoloca): 19.124 líneas (de 19.135)
// 2026-11-06, C1 (decisión 229: la historia y el avance árbol a árbol de la finca que salió del mundo, fuera de 14_historia.js): 18.958 líneas (de 19.135)
// 2026-11-06, al fusionar A1-14 y C1: 18.947 líneas
// 2026-11-06, MU2-3 (el exterior como primer mundo: el cableado del gestor entra en 90_final.js y actualizaCarga sale a apps/web/src/mundos/exterior.ts; sin cambio neto): 18.947 líneas (sin cambio)
// 2026-11-06, A2 (MU2-5, 02c_componentes.js entrega ComponentesPuro y Componentes a apps/web/src/nucleo/componentes.ts y conserva Bus, Reparto, Pausa, Teclas y Config): 18.780 líneas (de 18.947)
// 2026-11-06, al fusionar MU2-3 y MU2-5: 18780 líneas
// 2026-11-06, MU2-4 (la locomoción pregunta al mundo activo): 18.777 líneas
// 2026-11-06, MU2-6 (congelar el exterior; SUBE +10, todo cableado: en 90_final.js las raíces, el HUD y la pose que se le dan al exterior, avisa y el contexto del
//   gestor, el registro del vacío y ?mundo=vacio, y los pasos de todo mundo que salen del exterior al Bucle; en 02b_cola.js, ColaExt; lo demás va a apps/web/src/): 18.787 líneas
// 2026-11-06, MU2-7 (el Ambiente de cada mundo; SUBE +4, todo cableado: en 90_final.js lo que el Ambiente del exterior lee del legado, dónde se aplica
//   —scene, cámara, renderer, Estado y las fábricas de THREE.Color y THREE.Fog—, la fábrica de luces del vacío y el tema que vuelve a aplicar el Ambiente
//   del activo; 03_escena.js baja 3 —el fondo, la niebla, el near/far y colgar las luces son del Ambiente—; los valores y el aplicador, en apps/web/src/): 18.791 líneas
// 2026-11-06, MU5-0 (la fábrica de materiales: 02i_materiales.js pasa a talón en apps/web/src/nucleo/materiales.ts; 90_final.js, sin línea nueva, libera los
//   materiales del mundo con su contexto): 18.707 líneas (de 18.791)
const TOPE = 18707;

/** líneas de un texto (la última sin salto también cuenta) */
const lineas = s => s === "" ? 0 : s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
/** el texto de un módulo sin la cabecera de contrato, como lo lee contrato_modulos.js */
const sinCabecera = s => s.startsWith(C.MARCA_I) ? s.slice(s.indexOf(C.MARCA_F) + C.MARCA_F.length + 1) : s;

function cuenta(dir = C.SRC) {
  const por = {};
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".js")).sort()) por[f] = lineas(sinCabecera(fs.readFileSync(path.join(dir, f), "utf8")));
  return { total: Object.values(por).reduce((a, n) => a + n, 0), por };
}

test("trinquete del legado: las líneas de apps/web/motor/*.js (sin cabeceras) no pasan del tope y el tope está al día", t => {
  const { total, por } = cuenta();
  const grandes = Object.entries(por).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([f, n]) => f + " " + n).join(", ");
  t.diagnostic("legado: " + total + " líneas en " + Object.keys(por).length + " ficheros (tope " + TOPE + "); los más grandes: " + grandes);
  assert.ok(total <= TOPE, "el legado ha SUBIDO a " + total + " líneas (tope " + TOPE + ", +" + (total - TOPE) + "). Lo nuevo va a apps/web/src/ " +
    "(CLAUDE.md §5 «Código nuevo», ADR-0033 §6); si de verdad hay que tocar el legado, que no crezca");
  if (total < TOPE) t.diagnostic("el legado ha bajado a " + total + " líneas: quien fusiona baja TOPE a " + total + " (el trinquete solo baja)");
});

test("trinquete: el contador no se engaña (cabecera fuera, última línea sin salto dentro)", () => {
  assert.strictEqual(lineas(""), 0);
  assert.strictEqual(lineas("a\nb\n"), 2);
  assert.strictEqual(lineas("a\nb"), 2);
  const cab = C.MARCA_I + "\n// Expone: X\n// Consume: (nada de otros módulos)\n" + C.MARCA_F + "\n";
  assert.strictEqual(lineas(sinCabecera(cab + "  var X = 1;\n")), 1);
});
