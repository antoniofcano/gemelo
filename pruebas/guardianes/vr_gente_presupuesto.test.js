"use strict";
// Q0c-c: el presupuesto de VR cuenta los avatares (apps/web/motor/26b_avatares.js: GENTE_VR, distVrm, reparte; apps/web/src/nucleo/presupuesto.ts
// desde A1-12, con el talón 02g_vr_presupuesto.js: sueloGente, decide(…, suelo), VrPresupuesto.ponGente/suelo; 02f: ?xrgente=; 29_vr.js: vrAdapta;
// doc/sistema/VR.md#la-gente-en-el-presupuesto-q0c-c). Lo puro del controlador con gente (sueloGente y su histéresis, con 0 personas idéntico al de
// antes, la bajada anticipada, el olvido al salir) está en Vitest, en apps/web/src/nucleo/presupuesto.test.ts. Aquí, en Node, sin navegador ni casco:
//   · la tabla por nivel (cuántos VRM y a qué distancia pasan a muñeco), una fila por perfil de VR y el nivel 0 igual que antes;
//   · la perilla ?xrgente=;
//   · el cambio va por la Cola (vrNivelPorCola) y el recuento de personas se hace a 2 Hz y solo en VR.
// Lo que NO dice: que 8 personas, las distancias o los cupos sean los buenos para un Quest. [PROPUESTA], no probado en Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

const F02G = lee("apps/web/motor/02g_vr_presupuesto.js"), F26B = require("./_fuente").fuenteMotorJs("26b_avatares.js"), VR = lee("apps/web/motor/29_vr.js");
function trozo(f, ini, fin) { const i = f.indexOf(ini), j = f.indexOf(fin); assert.ok(i >= 0 && j > i, "falta " + ini + " … " + fin); return f.slice(i, j); }
const AP = require("./_mundos").AvataresPuro;   // A3-6a: en apps/web/src/mundos/comun/avatares.ts
const Nucleo = require("./_nucleo"), XP = Nucleo.XrPerillasPuro;   // 02f_xr_perillas.js es un talón del núcleo (A1-11)

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

test("perilla ?xrgente=: defecto 8, rango 2-64 con motivo, no numérico ignorado, y llega a XrPerillas.gente()", () => {
  assert.strictEqual(XP.DEFC.gente, 8); assert.deepStrictEqual(XP.LIMC.gente, [2, 64]);
  assert.strictEqual(XP.leeControl("?xrgente=12").gente, 12);
  const bajo = XP.leeControl("?xrgente=1"); assert.strictEqual(bajo.gente, 2); assert.match(bajo.ignorados[0].motivo, /recortado a 2/);
  assert.strictEqual(XP.leeControl("?xrgente=500").gente, 64);
  const raro = XP.leeControl("?xrgente=muchas"); assert.strictEqual(raro.gente, null); assert.strictEqual(raro.ignorados[0].motivo, "no es un número");
  assert.strictEqual(XP.leeControl("").gente, null);
  const xr = q => Nucleo.creaXrPerillas({ busqueda: q });
  assert.strictEqual(xr("").gente(), 8); assert.strictEqual(xr("?xrgente=20").gente(), 20);
});

test("cableado: vrAdapta pasa el suelo de la gente; el cambio va por la Cola; el recuento es a 2 Hz y solo en VR; el reparto usa la distancia del nivel", () => {
  assert.match(VR, /XrPerillas\.fijo\(\), VrPresupuesto\.suelo\(XrPerillas\.gente\(\)\)\)/);
  assert.match(VR, /if \(d > 0\) \{ VRX\.nBaj\+\+; vrNivelPorCola\(VRX\.nivel \+ 1\); \}/, "bajar, anticipado o no, es por la Cola");
  assert.match(F26B, /if \(VRX\.on\) \{ tGen \+= dt; if \(tGen >= TICK\) \{ tGen = 0; VrPresupuesto\.ponGente\(Presencia\.vrmPersonas\(\)\.length\); \} \}/);
  assert.match(F26B, /AvataresPuro\.reparte\(tObj, ids, n, AvataresPuro\.distVrm\(VRX\.on, VRX\.nivel\)\)/);
  assert.match(F26B, /var FUNDIDO|FUNDIDO = 0\.6/, "el paso de VRM a muñeco sigue siendo un fundido (r.k), no un corte");
  assert.match(F26B, /r\.dir = -1/, "quien deja de caber en el cupo o la distancia se funde a muñeco");
  // 02g ya no declara consumir 29_vr (VRX): solo lo nombra en un comentario (el estado `e` lo pasa 29_vr), y las cabeceras se derivan del código (L4-02)
  assert.doesNotMatch(F02G.split("\n").slice(0, 4).join("\n"), /Consume:.*29_vr \(VRX\)/);
  assert.match(F26B.split("\n").slice(0, 6).join("\n"), /02g_vr_presupuesto \(VrPresupuesto\)/);
});
