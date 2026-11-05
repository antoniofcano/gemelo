"use strict";
// EV2-A3 · el menú de muñeca en VR (apps/web/motor/31c_muneca.js), en Node y sin navegador: el gesto de «mirar la muñeca» (con histéresis y retardo) a partir
// de las poses del grip (o de la mano) y de la cabeza, dónde va la lámina y hacia dónde mira, qué accesos salen (los de la capa personal de pantalla, 31b),
// la rejilla contra los topes de las láminas VR (02d), el toque con el «dedo», la precedencia ?xrmuneca > vr.muneca > sí y el enganche con 29_vr.
// Los umbrales son de partida [SUPUESTO]: esto comprueba que el código hace lo que dicen, no que el gesto sea cómodo. Nada de esto probado en unas Quest.
const test = require("node:test"), assert = require("node:assert");
const { lee } = require("./_util");

function trozo(fuente, ini, fin) { const i = fuente.indexOf(ini), f = fuente.indexOf(fin, i); assert.ok(i >= 0 && f > i, "debe marcar " + ini + " … " + fin); return fuente.slice(i, f); }
const MUN = lee("apps/web/motor/31c_muneca.js"), VR = lee("apps/web/motor/29_vr.js"), HUDP = lee("apps/web/motor/31b_hud_personal.js"), AJU = lee("apps/web/motor/33_ajustes.js");
const MP = new Function("\"use strict\";\n" + trozo(MUN, "// [puro:inicio]", "// [puro:fin]") + "\nreturn MunecaPuro;")();
const HP = new Function("\"use strict\";\n" + trozo(HUDP, "// [puro:inicio]", "// [puro:fin]") + "\nreturn HudPersonalPuro;")();
const LP = new Function("\"use strict\";\n" + trozo(lee("apps/web/motor/02d_laminas.js"), "// [puro:inicio]", "// [puro:fin]") + "\nreturn LaminasPuro;")();

// ---- utilidades: vectores y el cuaternión que lleva a en b (como Quaternion.setFromUnitVectors de three)
const norm = v => { const l = Math.hypot(v.x, v.y, v.z); return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const resta = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
function qDe(a, b) {
  a = norm(a); b = norm(b); let r = a.x * b.x + a.y * b.y + a.z * b.z + 1, q;
  if (r < 1e-9) q = Math.abs(a.x) > Math.abs(a.z) ? { x: -a.y, y: a.x, z: 0, w: 0 } : { x: 0, y: -a.z, z: a.y, w: 0 };
  else q = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x, w: r };
  const l = Math.hypot(q.x, q.y, q.z, q.w); return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}
const I = { x: 0, y: 0, z: 0, w: 1 };
const CAB = { x: 0, y: 1.6, z: 0 };
// la muñeca izquierda delante y abajo, girada para que su dorso (−X del grip izquierdo) mire a los ojos, y la cabeza mirándola
function reloj(extra) {
  const w = Object.assign({ x: -0.12, y: 1.25, z: -0.3 }, extra && extra.w), u = resta(CAB, w);
  const gq = extra && extra.gq || qDe({ x: -1, y: 0, z: 0 }, u), cq = extra && extra.cq || qDe({ x: 0, y: 0, z: -1 }, resta(w, CAB));
  return { w, eje: MP.ejeGrip(gq, "left"), c: { p: CAB, q: cq } };
}
const mideDe = (r, u) => MP.mide(r.w, r.eje, r.c, {}, u);
function pasa(st, m, s, dt) { let ev = []; for (let t = 0; t < s - 1e-9; t += dt) { const e = MP.decide(st, m, dt); if (e) ev.push(e); } return ev; }

test("el giro: rota es la cuenta de three (90° en torno a Y lleva +X a −Z) y el eje del dorso del grip es −X a la izquierda y +X a la derecha", () => {
  const s = Math.SQRT1_2, o = MP.rota({ x: 0, y: s, z: 0, w: s }, 1, 0, 0, {});
  assert.ok(Math.abs(o.x) < 1e-9 && Math.abs(o.y) < 1e-9 && Math.abs(o.z + 1) < 1e-9, JSON.stringify(o));
  assert.deepStrictEqual(MP.ejeGrip(I, "left", {}), { x: -1, y: 0, z: 0 });
  assert.deepStrictEqual(MP.ejeGrip(I, "right", {}), { x: 1, y: 0, z: 0 });
});

test("mirar la muñeca como un reloj: cara y mirada ≈ 1; aparece tras el retardo (0,25 s) y no antes", () => {
  const m = mideDe(reloj());
  assert.ok(m.cara > 0.99 && m.dorso > 0.99 && m.palma < -0.99 && m.mirada > 0.99, JSON.stringify(m));
  assert.ok(m.d > 0.4 && m.d < 0.6);
  const st = { visible: false, t: 0 };
  assert.deepStrictEqual(pasa(st, m, 0.2, 0.05), [], "a los 0,2 s aún no");
  assert.deepStrictEqual(pasa(st, m, 0.1, 0.05), ["aparece"]);
  assert.ok(st.visible);
});

test("lo de todos los días no lo dispara: el mando sujeto de frente, mirar al frente con la muñeca girada, la muñeca lejos o pegada a la cara, o sin pose", () => {
  const nunca = m => { const st = { visible: false, t: 0 }; assert.deepStrictEqual(pasa(st, m, 3, 1 / 72), [], JSON.stringify(m)); };
  // el mando sujeto apuntando al frente (grip sin girar: la palma de lado), mirándolo
  nunca(mideDe(reloj({ gq: I })));
  // la muñeca girada hacia la cara pero mirando al frente (al horizonte)
  nunca(mideDe(reloj({ cq: I })));
  // la muñeca girada y mirada, pero con el brazo estirado (más de 0,70 m) o pegada a los ojos (menos de 0,12 m)
  nunca(mideDe(reloj({ w: { x: -0.2, y: 1.2, z: -0.75 } })));
  nunca(mideDe(reloj({ w: { x: -0.02, y: 1.55, z: -0.08 } })));
  nunca(null);
  // a medias (cara ≈ 0,5: la muñeca girada 60°) tampoco aparece: solo sirve para seguir
  const r = reloj(), u = norm(resta(CAB, r.w)), m = mideDe(r); m.cara = 0.5; nunca(m); assert.ok(u);
});

test("histéresis: ya a la vista, aguanta a medias y un bajón corto; se va al bajar la muñeca (0,35 s) o al perder la pose", () => {
  const st = { visible: false, t: 0 }, bien = mideDe(reloj());
  pasa(st, bien, 0.3, 0.05); assert.ok(st.visible);
  const medias = Object.assign({}, bien, { cara: 0.5, mirada: 0.7 });
  assert.deepStrictEqual(pasa(st, medias, 2, 0.05), [], "entre los dos umbrales se queda");
  const baja = Object.assign({}, bien, { cara: 0.2 });
  assert.deepStrictEqual(pasa(st, baja, 0.2, 0.05), [], "un bajón de 0,2 s no la quita");
  pasa(st, bien, 0.05, 0.05);
  assert.deepStrictEqual(pasa(st, baja, 0.4, 0.05), ["desaparece"]); assert.ok(!st.visible);
  pasa(st, bien, 0.3, 0.05); assert.ok(st.visible);
  assert.deepStrictEqual(pasa(st, null, 0.4, 0.05), ["desaparece"], "sin pose (mando perdido) también se va");
  const lejos = Object.assign({}, bien, { d: 0.8 }); pasa(st, bien, 0.3, 0.05);
  assert.deepStrictEqual(pasa(st, lejos, 1, 0.05), [], "a 0,8 m sigue (aparece hasta 0,70; sigue hasta 0,85)");
});

test("dorso o palma: con «ambos» vale cualquiera; con «dorso» o «palma», solo esa cara", () => {
  const r = reloj(), palma = { w: r.w, eje: { x: -r.eje.x, y: -r.eje.y, z: -r.eje.z }, c: r.c };
  assert.ok(mideDe(palma).cara > 0.99, "ambos: la palma hacia los ojos también");
  const U = Object.assign({}, MP.U, { lado: "dorso" });
  assert.ok(mideDe(r, U).cara > 0.99 && mideDe(palma, U).cara < -0.99);
  const P = Object.assign({}, MP.U, { lado: "palma" });
  assert.ok(mideDe(palma, P).cara > 0.99 && mideDe(r, P).cara < -0.99);
  assert.strictEqual(MP.U.lado, "ambos", "por defecto, cualquiera de las dos [SUPUESTO]");
});

test("con manos: el eje sale de la muñeca y los nudillos (perpendicular a la palma, largo 1); a la derecha, el contrario", () => {
  const w = { x: 0, y: 0, z: 0 }, i = { x: 0.02, y: 0, z: -0.08 }, p = { x: -0.03, y: 0, z: -0.07 };
  const e = MP.ejeMano(w, i, p, "left", {}), d = MP.ejeMano(w, i, p, "right", {});
  assert.ok(Math.abs(Math.hypot(e.x, e.y, e.z) - 1) < 1e-9 && Math.abs(e.x) < 1e-9 && Math.abs(e.z) < 1e-9 && Math.abs(Math.abs(e.y) - 1) < 1e-9, JSON.stringify(e));
  assert.ok(Math.abs(e.y + d.y) < 1e-9, "las dos manos, sentidos contrarios");
});

test("la lámina va por encima de la muñeca, un poco hacia los ojos, y su cara (+Z con Euler YXZ) mira a la cabeza", () => {
  const r = reloj(), o = MP.coloca(r.w, r.c, {});
  assert.ok(Math.abs(o.y - (r.w.y + MP.MEDIDAS.alto)) < 0.03, "unos 7 cm por encima");
  assert.ok(Math.hypot(o.x - r.w.x, o.z - r.w.z) < 0.05);
  const f = { x: Math.sin(o.yaw) * Math.cos(o.pitch), y: -Math.sin(o.pitch), z: Math.cos(o.yaw) * Math.cos(o.pitch) }, h = norm(resta(CAB, o));
  assert.ok(f.x * h.x + f.y * h.y + f.z * h.z > 0.9999, JSON.stringify({ f, h }));
});

test("la muñeca es la contraria a la mano que apunta (controles.mano)", () => {
  assert.strictEqual(MP.manoMenu("diestra"), "left"); assert.strictEqual(MP.manoMenu("zurda"), "right"); assert.strictEqual(MP.manoMenu(undefined), "left");
  assert.match(MUN, /MunecaPuro\.manoMenu\(vrAj\("controles\.mano", "diestra"\)\)/);
});

test("los accesos son los de la capa personal de pantalla (31b): hora · tu haza · hablar · volver, con sus textos y solo cuando tocan", () => {
  let l = MP.accesos(HP, { hora: "18:30", hazas: false, haza: null, voz: null });
  assert.deepStrictEqual(l.map(a => a.id), ["hora", "volver"], "sin hazas leídas ni visita guiada: hora y volver");
  assert.strictEqual(l[0].txt, "18:30"); assert.strictEqual(l[1].txt, "Volver");
  assert.strictEqual(MP.accesos(HP, { hora: "raro" }).find(a => a.id === "hora").txt, "--:--", "la hora no se inventa");
  l = MP.accesos(HP, { hora: "07:05", hazas: true, haza: { id: 3, es_mia: true }, voz: { dentro: true, guiada: true, puede: true, micro: "cerrado" } });
  assert.deepStrictEqual(l.map(a => a.id + ":" + a.txt), ["hora:07:05", "haza:Tu haza", "hablar:Hablar", "volver:Volver"]);
  assert.ok(l[1].on, "tu haza, resaltada");
  l = MP.accesos(HP, { hora: "07:05", hazas: true, haza: null, voz: { dentro: true, guiada: true, puede: true, micro: "abierto" } });
  assert.deepStrictEqual(l.map(a => a.txt), ["07:05", "Sin haza", "Callar", "Volver"]); assert.ok(l[2].on);
  assert.ok(!MP.accesos(HP, { hora: "07:05", voz: { dentro: true, guiada: true, puede: false } }).some(a => a.id === "hablar"), "sin permiso de hablar, no sale");
  assert.match(MUN, /MunecaPuro\.accesos\(HudPersonalPuro,/, "el motor le pasa el HudPersonalPuro de verdad");
});

test("la rejilla (2 × 2) cabe en el lienzo sin pisarse y cumple los topes de las láminas VR (02d) vista a 0,35 m [SUPUESTO]", () => {
  const M = MP.MEDIDAS, l = MP.accesos(HP, { hora: "07:05", hazas: true, haza: null, voz: { dentro: true, guiada: true, puede: true } }), B = MP.rejilla(l);
  assert.strictEqual(B.length, 4);
  B.forEach(b => assert.ok(b.x >= 0 && b.y >= M.cab && b.x + b.w <= M.W && b.y + b.h <= M.H, JSON.stringify(b)));
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) assert.ok(LP.hueco(B[i], B[j]) >= M.hueco, B[i].id + "–" + B[j].id);
  const r = LP.legible({ mmPorPx: M.pw * 1000 / M.W, dist: M.dist, lineas: M.lineas, botones: B });
  assert.deepStrictEqual(r.fallos, [], r.fallos.join("; "));
  assert.ok(r.objetivoMin > 2.5 && r.huecoMin >= 12 && r.textoMin >= 1.5, JSON.stringify(r));
  assert.strictEqual(MP.bajo(B, B[3].x + 1, B[3].y + 1).id, B[3].id); assert.strictEqual(MP.bajo(B, 1, 1), null, "la cabecera no es un botón");
  assert.ok(Math.abs(M.W / M.H - M.pw / M.ph) < 1e-9, "el lienzo y el plano, en la misma proporción");
});

test("el dedo: se arma lejos, pulsa una vez al llegar y no vuelve a pulsar hasta alejarse; fuera de la lámina no pulsa", () => {
  const st = { armado: false };
  assert.ok(!MP.dedo(st, 0.005, true), "sin armar (empezó dentro), no pulsa");
  assert.ok(!MP.dedo(st, 0.05, true) && st.armado);
  assert.ok(!MP.dedo(st, 0.02, true)); assert.ok(MP.dedo(st, 0.006, true), "pulsa"); assert.ok(!MP.dedo(st, 0.0, true), "una vez");
  assert.ok(!MP.dedo(st, -0.01, true)); MP.dedo(st, 0.05, true); assert.ok(MP.dedo(st, -0.02, true), "atravesando un poco también cuenta");
  MP.dedo(st, 0.05, false); assert.ok(!MP.dedo(st, 0.0, false), "fuera de la lámina, no");
  MP.dedo(st, 0.05, true); assert.ok(!MP.dedo(st, -0.06, true), "muy por detrás (la mano pasó de largo), no");
});

test("encendido: ?xrmuneca manda; si no, vr.muneca; si no, sí", () => {
  assert.strictEqual(MP.encendido(undefined, undefined), true);
  assert.strictEqual(MP.encendido(undefined, false), false); assert.strictEqual(MP.encendido(undefined, true), true);
  assert.strictEqual(MP.encendido(true, false), true, "?xrmuneca=1 manda sobre el ajuste"); assert.strictEqual(MP.encendido(false, true), false);
  assert.match(AJU, /"vr\.muneca": bool\(true\)/, "el ajuste existe y por defecto está encendido [SUPUESTO]");
  assert.match(AJU, /\{ k: "vr\.muneca", t: "Menú de muñeca/, "y sale en Configuración → Comodidad VR");
  assert.match(MUN, /ComponentesPuro\.valorUrl\([^)]*"xrmuneca"\)/);
});

test("firma: cambia con lo que se ve (texto, encendido, resaltado), no con nada más", () => {
  const l = [{ id: "hora", txt: "07:05", on: false }];
  assert.strictEqual(MP.firma(l, ""), MP.firma([{ id: "hora", txt: "07:05", on: false, nombre: "otro" }], ""));
  assert.notStrictEqual(MP.firma(l, ""), MP.firma(l, "hora"));
  assert.notStrictEqual(MP.firma(l, ""), MP.firma([{ id: "hora", txt: "07:06", on: false }], ""));
});

test("el motor: una sola lámina por sesión (creaLamina de 29_vr), liberada al salir de VR; sin sombreadores propios ni relojes; repinta solo si cambia la firma", () => {
  assert.strictEqual((MUN.match(/creaLamina\(/g) || []).length, 1, "una lámina");
  assert.ok(!/new THREE\.(Mesh|\w*Geometry|\w*Material|CanvasTexture)\b|createElement\("canvas"\)/.test(MUN), "nada de GPU propio: lo crea creaLamina");
  assert.match(MUN, /function crea\(\) \{ if \(lam\) return;/, "se reutiliza");
  const lib = trozo(MUN, "function libera()", "function cabeza()");
  assert.match(lib, /lam\.m\.geometry\.dispose\(\); lam\.m\.material\.dispose\(\); lam\.tex\.dispose\(\);/);
  assert.match(MUN, /Bus\.on\("vr:sale", libera\)/);
  assert.ok(!/ShaderMaterial|onBeforeCompile|setInterval|setTimeout|requestAnimationFrame/.test(trozo(MUN, "var Muneca = ", "window.__vrMuneca")), "sin sombreadores (multiview) ni relojes propios");
  assert.match(MUN, /if \(f !== firmaVista\) \{ firmaVista = f; pinta\(\); \}/, "solo repinta si cambia");
  assert.ok(/tex\.needsUpdate = true/.test(trozo(MUN, "function pinta()", "function fotograma(")), "subir la textura, solo al pintar");
  assert.ok(!/needsUpdate/.test(trozo(MUN, "function fotograma(", "function gatillo(")), "el fotograma no sube la textura por su cuenta");
});

test("el enganche con 29_vr: puntos de extensión de PanelVR (el menú no se nombra allí), el gatillo del menú va primero, y Y y X son las mismas funciones que usa la muñeca", () => {
  assert.ok(!/muneca|Muneca/.test(VR.replace(/\/\/.*$/gm, "")), "29_vr no nombra el menú de muñeca (fuera de comentarios)");
  assert.match(VR, /PanelVR\.fotograma\(dt\);/);
  assert.match(trozo(VR, "function vrGatillo(o) {", "if (panel.m.visible) {"), /if \(PanelVR\.gatillo\(o, rr\)\) \{ vrPulso\(o, 0\.4, 25\); return; \}/);
  assert.match(VR, /if \(vrFlanco\("Y", vrBoton\(L\.src, 5\)\)\) \{ vrPanelConmuta\(\);/);
  assert.match(VR, /if \(vrFlanco\("X", vrBoton\(L\.src, 4\)\)\) vrVinetaConmuta\(\);/);
  assert.match(MUN, /PanelVR\.alFotograma\(fotograma\); PanelVR\.alGatillo\(gatillo\);/);
  // el orden de montaje: después de lo que consume (29_vr y 31b_hud_personal)
  const orden = ["29_vr.js", "31b_hud_personal.js", "31c_muneca.js"]; assert.deepStrictEqual(orden.slice().sort(), orden);
  // las acciones: las de siempre (regla 12), no unas propias
  const pul = trozo(MUN, "function pulsa(b)", "function pinta()");
  for (const re of [/Bus\.emite\("prevision:alterna"\)/, /Usables\.elige\("haza:" \+ q\.id, "tecla"\)/, /Bus\.emite\("habla:alterna", \{\}\)/, /Llegada\.ve\(inicio\.x, inicio\.y\)/]) assert.match(pul, re);
});
