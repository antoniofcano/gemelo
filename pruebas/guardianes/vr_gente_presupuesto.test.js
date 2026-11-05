"use strict";
// Q0c-c: el presupuesto de VR cuenta los avatares (apps/web/motor/26b_avatares.js: GENTE_VR, distVrm, reparte; 02g_vr_presupuesto.js: sueloGente, decide(…, suelo),
// VrPresupuesto.ponGente/suelo; 02f: ?xrgente=; 29_vr.js: vrAdapta; doc/sistema/VR.md#la-gente-en-el-presupuesto-q0c-c). En Node, sin navegador ni casco:
//   · la tabla por nivel (cuántos VRM y a qué distancia pasan a muñeco), una fila por perfil de VR y el nivel 0 igual que antes;
//   · la bajada anticipada con más de N personas a la vista (un escalón, con histéresis) y la perilla ?xrgente=;
//   · con 0 personas, el controlador es IDÉNTICO al de antes (misma serie de decisiones);
//   · el cambio va por la Cola (vrNivelPorCola) y el recuento de personas se hace a 2 Hz y solo en VR.
// Lo que NO dice: que 8 personas, las distancias o los cupos sean los buenos para un Quest. [PROPUESTA], no probado en Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const F02G = lee("apps/web/motor/02g_vr_presupuesto.js"), F02F = lee("apps/web/motor/02f_xr_perillas.js"), F26B = lee("apps/web/motor/26b_avatares.js"), VR = lee("apps/web/motor/29_vr.js");
function trozo(f, ini, fin) { const i = f.indexOf(ini), j = f.indexOf(fin); assert.ok(i >= 0 && j > i, "falta " + ini + " … " + fin); return f.slice(i, j); }
const P02G = trozo(F02G, "// [puro:inicio]", "// [puro:fin]"), M02G = trozo(F02G, "// [motor:inicio]", "// [motor:fin]");
const C = new Function("\"use strict\";\n" + P02G + "\nreturn VrControlPuro;")();
const nuevoPresupuesto = () => new Function("\"use strict\";\n" + P02G + M02G + "\nreturn VrPresupuesto;")();
const AP = new Function("\"use strict\";\n" + trozo(F26B, "// [puro:inicio]", "// [puro:fin]") + "\nreturn AvataresPuro;")();
const XP = new Function("\"use strict\";\n" + trozo(F02F, "// [puro:inicio]", "// [puro:fin]") + "\nreturn XrPerillasPuro;")();

const FPS = 72, DT = 1 / FPS;
const estadoNuevo = () => ({ emaDt: 13.9, emaJs: 6, tNivel: 0, tEstable: 0 });
// avanza `seg` s con js(t) y gente(t) (personas a la vista); `suelo` como lo calcula VrPresupuesto.suelo(umbral). Devuelve los cambios [t, de, a]
function corre({ js, gente, seg, umbral = 8, nivel = 0, fijo = false, usaSuelo = true }) {
  const e = estadoNuevo(), V = nuevoPresupuesto(), cambios = []; let n = nivel;
  for (let i = 0; i < Math.round(seg * FPS); i++) {
    const t = i * DT; V.ponGente(gente(t));
    const s = usaSuelo ? V.suelo(umbral) : undefined, d = C.decide(e, 13.9, js(t), DT, n, 3, 8, 5, 10, fijo, s);
    if (d) { cambios.push([+t.toFixed(2), n, n + d]); n += d; }
  }
  return { cambios, nivel: n };
}

test("tabla: una fila por perfil de VR; el cupo de siempre (3/2/1/0) y la distancia del nivel 0 es la de pantalla", () => {
  assert.deepStrictEqual(AP.GENTE_VR.map(f => f.vrm), [3, 2, 1, 0]);
  assert.deepStrictEqual(AP.CUPO_VR, [3, 2, 1, 0], "CUPO_VR sale de la tabla");
  assert.strictEqual((/var VR_PERFILES = \[(.*?)\];/.exec(VR)[1].match(/\{ n:/g) || []).length, AP.GENTE_VR.length, "una fila de gente por perfil de VR");
  assert.deepStrictEqual([0, 1, 2, 3].map(n => AP.cupo("quest", true, n)), [3, 2, 1, 0]);
  assert.strictEqual(AP.distVrm(false, 3), AP.DMAX, "fuera de VR, la de siempre (40 m)");
  assert.strictEqual(AP.distVrm(true, 0), AP.DMAX, "el nivel 0 es lo de hoy");
  const d = [0, 1, 2, 3].map(n => AP.distVrm(true, n));
  for (let i = 1; i < d.length; i++) assert.ok(d[i] < d[i - 1], "cada escalón acerca el límite: " + d);
  assert.strictEqual(AP.distVrm(true, 9), d[3], "un nivel de más se queda en el último");
  assert.match(F26B, /\[PROPUESTA\]/, "la tabla lo dice: sin medir en gafas");
});

test("la distancia manda en el reparto: a 25 m, con VRM en el nivel 0 y 1, muñeco en el 2; sin distancia, como antes (40 m)", () => {
  const cand = [{ id: "a", d: 5 }, { id: "b", d: 25 }, { id: "c", d: 35 }];
  const quien = nivel => Object.keys(AP.reparte({}, cand, AP.cupo("quest", true, nivel), AP.distVrm(true, nivel))).sort().join("");
  assert.strictEqual(quien(0), "abc", "nivel 0: los tres (35 < 40)");
  assert.strictEqual(quien(1), "ab", "nivel 1: 2 plazas; a 25 m (< 30) entra");
  assert.strictEqual(quien(2), "a", "nivel 2: 1 plaza");
  assert.strictEqual(quien(3), "", "nivel 3: ninguno");
  assert.strictEqual(Object.keys(AP.reparte({}, [{ id: "b", d: 25 }], 3, AP.distVrm(true, 2))).length, 0, "a 25 m con el límite de 20: muñeco");
  assert.deepStrictEqual(AP.reparte({}, cand, 3), AP.reparte({}, cand, 3, AP.DMAX), "sin cuarto argumento, DMAX (como antes)");
  // la histéresis se mueve con el límite: quien ya lo lleva sigue hasta 1,1 × la distancia
  assert.ok(AP.reparte({ b: true }, [{ id: "b", d: 21 }], 1, 20).b, "ya lo llevaba y está a 21 m (< 22): sigue");
  assert.ok(!AP.reparte({ b: true }, [{ id: "b", d: 23 }], 1, 20).b, "a 23 m (> 22): pasa a muñeco");
});

test("sueloGente: 0 personas, 0; más de N, un escalón; con histéresis para no oscilar en el borde", () => {
  assert.strictEqual(C.sueloGente(0, 8, 0), 0); assert.strictEqual(C.sueloGente(0, 8, 1), 0, "sin gente nunca hay suelo, ni con un suelo previo");
  assert.strictEqual(C.sueloGente(8, 8, 0), 0, "justo N no basta: más de N");
  assert.strictEqual(C.sueloGente(9, 8, 0), 1);
  assert.strictEqual(C.sueloGente(40, 8, 0), 1, "con 40 personas sigue siendo UN escalón de antelación, no más");
  assert.strictEqual(C.sueloGente(8, 8, 1), 1, "ya pedido: sigue con N");
  assert.strictEqual(C.sueloGente(7, 8, 1), 1, "y con N − 1");
  assert.strictEqual(C.sueloGente(6, 8, 1), 0, "se suelta con N − 2 o menos");
  assert.strictEqual(C.sueloGente(NaN, 8, 0), 0); assert.strictEqual(C.sueloGente(10, 0, 0), 0, "N inválido: sin efecto");
});

test("con 0 personas el controlador es idéntico al de antes (misma serie de cambios, con y sin el argumento nuevo)", () => {
  const series = [
    t => 11 - 0.5 * Math.sin(t) + 0.6 * Math.sin(t * 5.3),   // pesada: baja
    t => 4 + 0.5 * Math.sin(t * 3.1),                         // ligera: no cambia
    t => (Math.floor(t / 40) % 2 ? 4 : 10) + 0.3 * Math.sin(t * 2.7)   // alterna: baja y sube
  ];
  for (const js of series) {
    const antes = corre({ js, gente: () => 0, seg: 300, usaSuelo: false }), con0 = corre({ js, gente: () => 0, seg: 300 }), conCero = (() => {
      const e = estadoNuevo(), r = []; let n = 0;
      for (let i = 0; i < 300 * FPS; i++) { const d = C.decide(e, 13.9, js(i * DT), DT, n, 3, 8, 5, 10, false, 0); if (d) { r.push([+(i * DT).toFixed(2), n, n + d]); n += d; } }
      return { cambios: r, nivel: n };
    })();
    assert.deepStrictEqual(con0.cambios, antes.cambios, "0 personas = sin el argumento"); assert.deepStrictEqual(conCero.cambios, antes.cambios, "suelo 0 = sin el argumento");
  }
  assert.ok(corre({ js: series[0], gente: () => 0, seg: 300 }).cambios.length >= 1, "la serie pesada sí baja (la prueba no es vacía)");
  // y sin ningún aparato de gente (ponGente sin llamar): suelo 0
  assert.strictEqual(nuevoPresupuesto().suelo(8), 0);
});

test("bajada anticipada: con más de N personas baja UN escalón sin esperar al JS (que está holgado), no baja más y no sube mientras siga la gente", () => {
  const holgado = () => 4;
  const r = corre({ js: holgado, gente: () => 12, seg: 120 });
  assert.deepStrictEqual(r.cambios.map(c => [c[1], c[2]]), [[0, 1]], "un solo cambio, 0 → 1");
  assert.ok(r.cambios[0][0] >= C.DEF.guarda, "respeta la guarda de " + C.DEF.guarda + " s (no es de golpe en el primer fotograma): " + r.cambios[0][0]);
  assert.strictEqual(r.nivel, 1, "y se queda en 1 aunque el JS esté a 4 ms (la subida no baja del suelo)");
  // sin la gente, con ese JS el nivel no se movería
  assert.deepStrictEqual(corre({ js: holgado, gente: () => 3, seg: 120 }).cambios, [], "con 3 personas (< 8) no pasa nada");
  assert.deepStrictEqual(corre({ js: holgado, gente: () => 8, seg: 120 }).cambios, [], "con exactamente N, tampoco");
  // se va la gente: sube de nuevo (la regla de subir, con su JS holgado, sigue siendo la de siempre)
  const va = corre({ js: holgado, gente: t => t < 30 ? 12 : 2, seg: 120 });
  assert.deepStrictEqual(va.cambios.map(c => [c[1], c[2]]), [[0, 1], [1, 0]]);
  assert.ok(va.cambios[1][0] >= 30, "no sube mientras haya gente: " + va.cambios[1][0]);   // el JS lleva holgado todo el rato, así que los segundos estables ya están cumplidos
  // en el borde (9 ↔ 7 personas) no oscila
  assert.strictEqual(corre({ js: holgado, gente: t => Math.floor(t) % 2 ? 7 : 9, seg: 200 }).cambios.length, 1, "9/7 a 1 Hz: baja una vez y no vuelve a subir");
  // si el JS ya exige bajar más, baja más (la gente es un suelo, no un techo)
  assert.strictEqual(corre({ js: () => 12, gente: () => 12, seg: 120 }).nivel, 3);
  // la perilla ?xrnivel (fijo) apaga también la bajada anticipada
  assert.deepStrictEqual(corre({ js: holgado, gente: () => 40, seg: 60, fijo: true }).cambios, []);
  // la perilla ?xrgente cambia el umbral
  assert.strictEqual(corre({ js: holgado, gente: () => 12, seg: 60, umbral: 20 }).cambios.length, 0, "con N = 20, 12 personas no bajan");
  assert.strictEqual(corre({ js: holgado, gente: () => 4, seg: 60, umbral: 3 }).cambios.length, 1, "con N = 3, 4 personas sí");
});

test("al salir de VR (ponEscalon(null)) la gente contada y el suelo se olvidan", () => {
  const V = nuevoPresupuesto(); V.ponGente(20); assert.strictEqual(V.suelo(8), 1); assert.strictEqual(V.estado().gente, 20);
  V.ponEscalon(null); assert.strictEqual(V.estado().gente, 0); assert.strictEqual(V.suelo(8), 0);
  V.ponGente(-3); assert.strictEqual(V.estado().gente, 0, "un recuento negativo no vale"); V.ponGente(7.9); assert.strictEqual(V.estado().gente, 7);
});

test("perilla ?xrgente=: defecto 8, rango 2-64 con motivo, no numérico ignorado, y llega a XrPerillas.gente()", () => {
  assert.strictEqual(XP.DEFC.gente, 8); assert.deepStrictEqual(XP.LIMC.gente, [2, 64]);
  assert.strictEqual(XP.leeControl("?xrgente=12").gente, 12);
  const bajo = XP.leeControl("?xrgente=1"); assert.strictEqual(bajo.gente, 2); assert.match(bajo.ignorados[0].motivo, /recortado a 2/);
  assert.strictEqual(XP.leeControl("?xrgente=500").gente, 64);
  const raro = XP.leeControl("?xrgente=muchas"); assert.strictEqual(raro.gente, null); assert.strictEqual(raro.ignorados[0].motivo, "no es un número");
  assert.strictEqual(XP.leeControl("").gente, null);
  const xr = q => new Function("location", "\"use strict\";\n" + trozo(F02F, "// [puro:inicio]", "// [puro:fin]") + trozo(F02F, "// [motor:inicio]", "// [motor:fin]") + "\nreturn XrPerillas;")({ search: q });
  assert.strictEqual(xr("").gente(), 8); assert.strictEqual(xr("?xrgente=20").gente(), 20);
});

test("cableado: vrAdapta pasa el suelo de la gente; el cambio va por la Cola; el recuento es a 2 Hz y solo en VR; el reparto usa la distancia del nivel", () => {
  assert.match(VR, /XrPerillas\.fijo\(\), VrPresupuesto\.suelo\(XrPerillas\.gente\(\)\)\)/);
  assert.match(VR, /if \(d > 0\) \{ VRX\.nBaj\+\+; vrNivelPorCola\(VRX\.nivel \+ 1\); \}/, "bajar, anticipado o no, es por la Cola");
  assert.match(F26B, /if \(VRX\.on\) \{ tGen \+= dt; if \(tGen >= TICK\) \{ tGen = 0; VrPresupuesto\.ponGente\(Presencia\.vrmPersonas\(\)\.length\); \} \}/);
  assert.match(F26B, /AvataresPuro\.reparte\(tObj, ids, n, AvataresPuro\.distVrm\(VRX\.on, VRX\.nivel\)\)/);
  assert.match(F26B, /var FUNDIDO|FUNDIDO = 0\.6/, "el paso de VRM a muñeco sigue siendo un fundido (r.k), no un corte");
  assert.match(F26B, /r\.dir = -1/, "quien deja de caber en el cupo o la distancia se funde a muñeco");
  assert.match(F02G.split("\n").slice(0, 4).join("\n"), /Consume:.*29_vr \(VRX\)/);
  assert.match(F26B.split("\n").slice(0, 6).join("\n"), /02g_vr_presupuesto \(VrPresupuesto\)/);
});
