"use strict";
// La previsión del tiempo como lámina en el mundo (apps/web/motor/35_fichas_tiempo.js, doc/sistema/UX-FINCA-JUEGO.md §4.11) y su resumen en la pestaña
// Mundo del panel VR (su fila de PanelVR, en 29_vr.js). Es el primer componente del motor (ADR-0023, C3): lo de «quitarlo» lo vigila componentes.test.js. Arriba, en Node y sin navegador: la maqueta a partir de datos sintéticos con la forma de TiempoVivo.lee(), los iconos
// por cielo (dibujados, sin emoji), la flecha del viento orientada en el mundo, la firma que decide cuándo repintar y, con un THREE de mentira, que
// abrir crea una malla y una textura y cerrar lo libera todo. Abajo, en el navegador (Cerro del fixture, por el turno del banco): en escritorio, P abre
// la lámina paseando y se cuentan sus llamadas de dibujo y texturas; con GEMELO_VR=1 (inestable con SwiftShader, como vr.test.js), «Ver previsión»
// en el panel VR simulado. Las capturas van a pruebas/salida/capturas-tiempo/. Nada de esto dice si se lee bien o marea en unas Quest (no probado).
const test = require("node:test"), { describe, before } = test, assert = require("node:assert");
const { lee, SALIDA, fs, path } = require("./_util");

const FUENTE = lee("apps/web/motor/35_fichas_tiempo.js"), VR = lee("apps/web/motor/29_vr.js");
function trozo(ini, fin) {
  const i = FUENTE.indexOf(ini), f = FUENTE.indexOf(fin);
  assert.ok(i >= 0 && f > i, "35_fichas_tiempo.js debe marcar " + ini + " … " + fin);
  return FUENTE.slice(i, f);
}
const F = new Function("\"use strict\";\n" + trozo("// [puro:inicio]", "// [puro:fin]") + "\nreturn FichasTiempoPuro;")();

// un contexto 2D de mentira: apunta los textos (con su fuente) y cuenta las operaciones de dibujo
function ctx() {
  const c = { textos: [], ops: 0, font: "10px x", fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", textAlign: "", textBaseline: "" };
  ["clearRect", "fillRect", "beginPath", "moveTo", "lineTo", "arc", "arcTo", "closePath", "fill", "stroke", "save", "restore"].forEach(k => { c[k] = () => { c.ops++; }; });
  c.measureText = t => ({ width: String(t).length * (parseInt(/(\d+)px/.exec(c.font)[1], 10) * 0.55) });
  c.fillText = (t, x, y) => { c.textos.push({ t: String(t), font: c.font, x, y }); };
  return c;
}
// datos sintéticos con la forma pactada de TiempoVivo.lee() (ningún valor de la explotación)
const AHORA = Date.parse("2026-10-30T13:20:00Z");   // 14:20 en Madrid (hora de invierno desde el 25-oct)
function sinteticos(extra) {
  const h0 = Date.parse("2026-10-30T13:00:00Z"), horas = [];
  for (let i = 0; i < 72; i++) horas.push({ instante: new Date(h0 + i * 3600000).toISOString(), temperatura: 10 + (i % 24) / 2, humedadRelativa: 60, viento: 3, racha: 6,
    direccion: 45, nubosidad: i < 24 ? 10 : 90, lluvia: i >= 30 && i < 34 ? 1 : 0, probabilidadLluvia: i >= 30 && i < 34 ? 80 : 5, naturaleza: "modelado", dentroDeUmbrales: true });
  return Object.assign({ origen: "vigia", actual: { temperatura: 17.4, humedadRelativa: 55, viento: 1, racha: 2, direccion: 90, lluvia: 0.4, cielo: null, estacion: { id: "X", distanciaKm: 7.24 }, naturaleza: "medido" },
    horas, frescura: { generadoEn: "2026-10-30T12:55:00Z", horasDeAntiguedad: 0.4 }, avisos: [] }, extra || {});
}
const emoji = /\p{Extended_Pictographic}/u;

test("la maqueta: «Ahora» medido con su estación y de cuándo es; hoy por bloques de 3 h y después por días; etiquetas medido / modelado", () => {
  const m = F.maqueta(sinteticos(), { ahora: AHORA, rumboVista: 0 });
  assert.strictEqual(m.ahora.etiqueta, "medido");
  assert.strictEqual(m.ahora.donde, "estación a 7,2 km");
  assert.strictEqual(m.ahora.cuando, "hace 25 min");
  assert.strictEqual(m.ahora.tempTxt, "17°");
  assert.strictEqual(m.ahora.vientoDe, "previsión", "el anemómetro de la estación está descartado por Vigía: el viento de «Ahora» es el de la previsión");
  assert.deepStrictEqual(m.tarjetas.map(t => t.etiqueta), ["14–17 h", "17–20 h", "20–23 h", "Mañana", "Domingo", "Lunes"], "el 30-oct-2026 es viernes; el lunes llega con 14 horas (≥ 12)");
  assert.ok(m.tarjetas.length >= 5 && m.tarjetas.length <= 6, "6 tarjetas como mucho: " + m.tarjetas.length);
  assert.ok(m.tarjetas.filter(t => t.tipo === "dia").every(t => / \/ \d+°$/.test(t.temp)), "los días, mínima / máxima");
  assert.match(m.subAhora, /medido/); assert.match(m.subPrev, /modelado/);
  assert.ok(m.pie[0].includes("fuera de la finca") && m.pie[1].includes("rejilla de ~5 km"), JSON.stringify(m.pie));
});

test("el día de mañana se llama «Mañana»; un día con menos de 12 horas no sale (mínima y máxima engañarían)", () => {
  const d = sinteticos(), m = F.maqueta(d, { ahora: Date.parse("2026-10-30T22:30:00Z") });   // 23:30 en Madrid: queda una hora de hoy
  assert.deepStrictEqual(m.tarjetas.map(t => t.etiqueta).slice(0, 2), ["23–24 h", "Mañana"]);
  const cortas = F.tarjetas(d.horas.slice(0, 20), AHORA, {});
  assert.ok(cortas.every(t => t.tipo === "bloque"), "con 20 horas no hay ningún día entero: " + JSON.stringify(cortas.map(t => t.etiqueta)));
});

test("nada de dentroDeUmbrales ni de tratamientos: ni en la lámina ni en el panel; los avisos que suenan a tratar se quitan", () => {
  const d = sinteticos({ avisos: ["Ventana de tratamiento dentro de umbrales", "La previsión tiene 30 h de antigüedad"] }), m = F.maqueta(d, { ahora: AHORA });
  const c = ctx(); F.dibuja(c, m);
  const todo = c.textos.map(x => x.t).join(" | ") + " " + m.firma;
  assert.ok(!/umbral|tratar|tratamiento|atomizador/i.test(todo), "la lámina no habla de tratar: " + todo);
  assert.ok(todo.includes("Aviso: La previsión tiene 30 h de antigüedad"), "los demás avisos sí se repiten (regla 6 de Vigía)");
  assert.ok(!/dentroDeUmbrales/.test(FUENTE.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "35_fichas_tiempo.js no lee dentroDeUmbrales");
  const sVR = FUENTE.slice(FUENTE.indexOf("function pintaFila"), FUENTE.indexOf("function rrPanel"));
  assert.ok(sVR.length > 0 && !/umbral|tratar/i.test(sVR), "la fila del tiempo del panel VR tampoco");
  assert.ok(!/umbral|tratar/i.test(VR), "29_vr.js no habla de tratar");
});

test("simulado: se rotula «no es el tiempo real» y las etiquetas dicen simulado, no medido", () => {
  const d = F.respaldo(AHORA);
  assert.strictEqual(d.origen, "simulado"); assert.strictEqual(d.horas.length, 72);
  for (const k of ["instante", "temperatura", "humedadRelativa", "viento", "racha", "direccion", "nubosidad", "lluvia", "probabilidadLluvia", "naturaleza"]) assert.ok(k in d.horas[0], "falta " + k);
  for (const k of ["temperatura", "humedadRelativa", "viento", "racha", "direccion", "lluvia", "cielo", "estacion", "naturaleza"]) assert.ok(k in d.actual, "falta actual." + k);
  const m = F.maqueta(d, { ahora: AHORA }), c = ctx(); F.dibuja(c, m);
  const txt = c.textos.map(x => x.t).join(" | ");
  assert.ok(txt.includes("SIMULADO · no es el tiempo real"), txt);
  assert.strictEqual(m.ahora.etiqueta, "simulado"); assert.match(m.subPrev, /simulado/);
  assert.strictEqual(m.ahora.donde, "estación simulada");
  assert.strictEqual(F.resumen(d, { ahora: AHORA }).origen, "simulado");
  assert.strictEqual(F.maqueta({ origen: "raro", horas: d.horas }, { ahora: AHORA }).origen, "simulado", "un origen desconocido no pasa por Vigía");
});

test("sin lectura de la estación, «Ahora» sale de la previsión y lo dice (modelado)", () => {
  const m = F.maqueta(sinteticos({ actual: null }), { ahora: AHORA });
  assert.strictEqual(m.ahora.etiqueta, "modelado"); assert.strictEqual(m.ahora.donde, "sin lectura de la estación");
  assert.ok(m.pie[0].startsWith("Sin lectura de la estación"));
});

test("el cielo: cada caso su icono, dibujado con trazos (ningún texto ni emoji: en Quest sale igual)", () => {
  const casos = [
    [{ nubosidad: 5 }, "despejado"], [{ nubosidad: 40 }, "intervalos"], [{ nubosidad: 70 }, "nuboso"], [{ nubosidad: 95 }, "cubierto"],
    [{ nubosidad: 90, lluvia: 0.2, probabilidadLluvia: 40 }, "llovizna"], [{ nubosidad: 90, lluvia: 2 }, "lluvia"], [{ nubosidad: 30, probabilidadLluvia: 55 }, "llovizna"],
    [{ nubosidad: 100, humedadRelativa: 99, viento: 0.4 }, "niebla"], [{ cielo: "lluvia", nubosidad: 0 }, "lluvia"], [{ cielo: "no-se", nubosidad: 0 }, "despejado"]
  ];
  for (const [h, k] of casos) assert.strictEqual(F.cielo(h), k, JSON.stringify(h));
  const huellas = new Set();
  for (const k of Object.keys(F.CIELOS)) for (const noche of [false, true]) {
    const c = ctx(); F.icono(c, k, noche, 50, 50, 80, "#000");
    assert.strictEqual(c.textos.length, 0, "el icono " + k + " no escribe texto"); assert.ok(c.ops > 5, "el icono " + k + " dibuja algo");
    huellas.add(k + ":" + c.ops);
  }
  assert.ok(huellas.size >= 7, "los iconos se distinguen entre sí");
  const m = F.maqueta(sinteticos(), { ahora: AHORA }), c = ctx(); F.dibuja(c, m);
  assert.ok(c.textos.every(x => !emoji.test(x.t)), "ningún emoji en la lámina: " + c.textos.filter(x => emoji.test(x.t)).map(x => x.t));
  assert.ok(!emoji.test(FUENTE), "35_fichas_tiempo.js no tiene emoji");
});

test("la flecha del viento apunta de dónde viene, en el mundo: arriba en la lámina = hacia donde miras", () => {
  const g = a => Math.round(a * 180 / Math.PI);
  assert.strictEqual(g(F.flechaAng(0, 0)), 0, "viento del norte mirando al norte: arriba");
  assert.strictEqual(g(F.flechaAng(0, 90)), -90, "viento del norte mirando al este: a la izquierda");
  assert.strictEqual(g(F.flechaAng(90, 0)), 90, "viento del este mirando al norte: a la derecha");
  assert.strictEqual(Math.abs(g(F.flechaAng(180, 0))), 180, "viento del sur mirando al norte: abajo (viene de detrás)");
  assert.strictEqual(g(F.flechaAng(45, 50)), 0, "el rumbo va en pasos de 15° (50° → 45°): no se repinta por cada paso");
  // la flecha dibujada: la punta (el último triángulo) cae del lado del ángulo
  const c = ctx(), pts = []; c.moveTo = (x, y) => { pts.push([x, y]); c.ops++; };
  F.flecha(c, 100, 100, 20, Math.PI / 2, null);
  assert.ok(pts[pts.length - 1][0] > 110, "con ángulo 90° la punta queda a la derecha: " + JSON.stringify(pts));
  const m = F.maqueta(sinteticos(), { ahora: AHORA, rumboVista: 45 });
  assert.ok(m.tarjetas.every(t => Math.abs(t.flecha) < 1e-9), "viento del NE mirando al NE: todas las flechas arriba");
  assert.strictEqual(m.tarjetas[0].viento, "NE 3 m/s");
});

test("la firma: lo mismo no se repinta; cambia con los datos, con el minuto de «hace» o con 15° de rumbo", () => {
  const d = sinteticos(), a = F.maqueta(d, { ahora: AHORA, rumboVista: 16 });
  assert.strictEqual(F.maqueta(d, { ahora: AHORA + 20000, rumboVista: 20 }).firma, a.firma, "20 s y 4° después, igual (16° y 20° caen en 15°)");
  assert.notStrictEqual(F.maqueta(d, { ahora: AHORA + 70000, rumboVista: 16 }).firma, a.firma, "un minuto después, «hace 26 min»");
  assert.notStrictEqual(F.maqueta(d, { ahora: AHORA, rumboVista: 30 }).firma, a.firma, "15° más de rumbo, otras flechas");
  const d2 = sinteticos(); d2.horas[0].temperatura = 30;
  assert.notStrictEqual(F.maqueta(d2, { ahora: AHORA, rumboVista: 16 }).firma, a.firma, "otro dato, otra firma");
});

test("se lee a 1-2 m: letra mínima de 24 px en 788 px/m (≥ 3 cm de cuerpo), cifras grandes, nada se sale ni se pisa", () => {
  const m = F.maqueta(sinteticos(), { ahora: AHORA }), c = ctx(); F.dibuja(c, m);
  const ppm = m.W / m.PW, tam = c.textos.map(x => parseInt(/(\d+)px/.exec(x.font)[1], 10));
  assert.ok(Math.min(...tam) >= F.FUENTE_MIN, "letra mínima " + Math.min(...tam) + " px");
  assert.ok(F.FUENTE_MIN / ppm >= 0.03, "24 px son " + (100 * F.FUENTE_MIN / ppm).toFixed(1) + " cm de cuerpo");
  const temp = c.textos.find(x => x.t === m.ahora.tempTxt); assert.ok(parseInt(/(\d+)px/.exec(temp.font)[1], 10) >= 80, "la temperatura de ahora, en grande");
  const cajas = [m.ahora].concat(m.tarjetas);
  for (const b of cajas) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= m.W && b.y + b.h <= m.H - 100, "dentro del lienzo: " + JSON.stringify(b));
  for (let i = 0; i < cajas.length; i++) for (let j = i + 1; j < cajas.length; j++) {
    const a = cajas[i], b = cajas[j], pisa = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    assert.ok(!pisa, "las tarjetas no se pisan: " + i + " y " + j);
  }
  assert.ok(c.textos.every(x => x.x >= 0 && x.x <= m.W && x.y >= 0 && x.y <= m.H), "todo el texto dentro");
  assert.ok(Math.abs(m.PH - 1.3 * 704 / 1024) < 1e-9);
});

test("el panel VR: el resumen va en la pestaña Mundo, con «Ver previsión» de 72 px (≥ los 64 de hoy) y «Salir de VR» sigue abajo", () => {
  // la fila del componente va en Mundo detrás de modos, hora y fecha (3 filas de 88 px): cae en y0 + 264, como antes de ser componente
  assert.match(FUENTE, /PanelVR\.filas\("mundo", \{ id: "tiempo", orden: 40, alto: 236,/);
  assert.match(FUENTE, /b\("tiempo", 520, y \+ 144, 444, 72, ft \? "Quitar la previsión" : "Ver previsión"/);
  for (const [id, orden] of [["modos", 10], ["hora", 20], ["fecha", 30]]) assert.match(VR, new RegExp('PanelVR\\.filas\\("mundo", \\{ id: "' + id + '", orden: ' + orden + ', alto: 88,'), id + ": 88 px, antes del tiempo");
  assert.ok(!/FichasTiempo/.test(VR), "29_vr.js ya no nombra las fichas del tiempo");
  assert.match(VR, /var VR_PESTANAS = \[\["mundo", "Mundo"\], \["ira", "Ir a"\], \["comodidad", "Comodidad"\]\]/, "siguen tres pestañas");
  assert.match(VR, /b\("sal", 40, 984, 944, 64, "Salir de VR"/);
  // el bloque del tiempo (y0 + 264 … + 236) cabe encima de las ayudas de los mandos (y = 890), también con el letrero de «sin escena» (y0 = 280)
  assert.ok(280 + 264 + 236 < 870, "el bloque del tiempo cabe en el panel");
  const r = F.resumen(sinteticos(), { ahora: AHORA, rumboVista: 0 });
  assert.strictEqual(r.temp, "17 °C"); assert.match(r.viento, /^Viento del NE · 3 m\/s \(previsión\)$/); assert.match(r.etiqueta, /^medido · estación a 7,2 km · hace 25 min$/);
  assert.match(r.lluvia, /^Próximas 3 h: /);
});

// ---------- el motor con un THREE de mentira: abrir crea una malla y una textura; repintar solo si cambia; cerrar libera todo. Se monta como lo monta
// Componentes: FichasTiempoMotor(n), con Teclas, PanelVR y el Bus de mentira, para comprobar también que libera() suelta todo lo que enganchó.
function motor() {
  const reg = { creadas: [], liberadas: [], escena: new Set(), teclas: {}, bus: {}, filas: [], tapas: [], oyentesTV: 0, repintes: 0, cierresPanel: 0, limpias: [] };
  class V3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } copy(v) { return this.set(v.x, v.y, v.z); }
    setFromMatrixPosition(m) { return this.set(m.p[0], m.p[1], m.p[2]); } lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; } normalize() { const l = Math.sqrt(this.lengthSq()) || 1; return this.set(this.x / l, this.y / l, this.z / l); } }
  const recurso = tipo => class { constructor(a) { this.tipo = tipo; this.a = a; reg.creadas.push(this); } dispose() { reg.liberadas.push(this); } };
  const THREE = { Vector3: V3, LinearFilter: 1006, CanvasTexture: recurso("textura"), PlaneGeometry: recurso("geometria"), MeshBasicMaterial: recurso("material"),
    Mesh: class { constructor(g, m) { this.geometry = g; this.material = m; this.position = new V3(); this.rotation = new V3(); this.rotation.set = (x, y, z) => { this.rotation.x = x; this.rotation.y = y; this.rotation.z = z; }; } updateMatrixWorld() {} } };
  const camera = { matrixWorld: { p: [0, 1.6, 0] }, updateMatrixWorld() {}, getWorldDirection: v => v.set(0, 0, -1) };
  const scene = { add: o => reg.escena.add(o), remove: o => reg.escena.delete(o) };
  const lienzos = [];
  const documento = { createElement: () => { const c = ctx(), cv = { width: 0, height: 0, getContext: () => c, c }; lienzos.push(cv); return cv; } };
  const ventana = {};
  const Teclas = { registra: (c, f) => { if (reg.teclas[c]) return null; reg.teclas[c] = f; return () => { delete reg.teclas[c]; }; } };
  const PanelVR = { filas: (p, def) => { const f = Object.assign({ pestana: p }, def); reg.filas.push(f); return () => { reg.filas.splice(reg.filas.indexOf(f), 1); }; },
    tapa: fn => { reg.tapas.push(fn); return () => { reg.tapas.splice(reg.tapas.indexOf(fn), 1); }; }, repinta: () => { reg.repintes++; }, cierra: () => { reg.cierresPanel++; }, rumbo: () => 0 };
  const n = { id: "fichas-tiempo", limpia: f => { reg.limpias.push(f); return f; }, on: (ev, f) => { (reg.bus[ev] = reg.bus[ev] || []).push(f); return n.limpia(() => { reg.bus[ev].splice(reg.bus[ev].indexOf(f), 1); }); } };
  const fuente = trozo("// [puro:inicio]", "// [puro:fin]") + trozo("// [motor:inicio]", "// [motor:fin]");
  const cuerpo = "\"use strict\";\n" + fuente + "\nreturn FichasTiempoMotor;";
  const fn = new Function("THREE", "scene", "camera", "renderer", "texColor", "VRX", "paseando", "Hud", "ahoraMs", "nivel", "document", "window", "performance", "TiempoVivo", "Teclas", "PanelVR", cuerpo);
  const est = { datos: sinteticos(), oyente: null, ahora: AHORA };
  const TV = { lee: () => est.datos, alCambiar: f => { est.oyente = f; reg.oyentesTV++; return () => { reg.oyentesTV--; est.oyente = null; }; } };
  const VRX = { on: false, cab: new V3() };
  const FTM = fn(THREE, scene, camera, { info: { render: { frame: 0 } } }, t => t, VRX, true, { aviso() {} }, () => est.ahora, () => ({ d: 1 }),
    documento, ventana, { now: () => 0 }, TV, Teclas, PanelVR);
  const FT = FTM(n);
  const libera = () => { FT.cierra(); reg.limpias.splice(0).reverse().forEach(f => f()); };
  return { FT, reg, est, lienzos, ventana, VRX, libera };
}

test("abrir crea UNA malla y UNA textura delante de la mirada; repinta solo si cambia lo que se ve; cerrar libera geometría, material y textura", () => {
  const { FT, reg, est, lienzos } = motor();
  assert.strictEqual(FT.abre("pantalla"), true);
  let r = FT.resumen();
  assert.ok(r.abierta && r.modo === "pantalla" && r.origen === "vigia", JSON.stringify(r));
  assert.strictEqual(reg.escena.size, 1, "una sola malla en la escena (una llamada de dibujo)");
  assert.deepStrictEqual(reg.creadas.map(x => x.tipo).sort(), ["geometria", "material", "textura"]);
  assert.ok(Math.abs(r.pos[2] + 2.4) < 1e-9 && Math.abs(r.pos[1] - 1.5) < 1e-9, "a 2,4 m delante y a la altura de los ojos: " + r.pos);
  assert.strictEqual(r.pintadas, 1);
  FT.revisa(); FT.revisa(); assert.strictEqual(FT.resumen().pintadas, 1, "sin cambios no se repinta");
  est.datos = sinteticos(); est.datos.horas[1].temperatura = 40; est.oyente(); assert.strictEqual(FT.resumen().pintadas, 2, "TiempoVivo.alCambiar con otro dato repinta");
  assert.ok(reg.repintes >= 1, "abrir pide repintar el panel VR (cambia el texto del botón)");
  est.ahora += 61000; FT.revisa(); assert.strictEqual(FT.resumen().pintadas, 3, "pasa un minuto: «hace N min» cambia y se repinta");
  assert.strictEqual(FT.cierra(), true);
  assert.strictEqual(reg.escena.size, 0);
  assert.deepStrictEqual(reg.liberadas.map(x => x.tipo).sort(), ["geometria", "material", "textura"], "todo recurso de GPU se libera");
  assert.strictEqual(lienzos[0].width, 0, "el canvas se suelta");
  assert.strictEqual(FT.cierra(), false, "cerrar dos veces no rompe nada");
  FT.alterna("pantalla"); FT.alterna("pantalla"); assert.strictEqual(reg.creadas.length, reg.liberadas.length, "abrir y cerrar varias veces no deja nada vivo");
});

test("sin TiempoVivo con datos, el respaldo simulado; y la lámina se cierra sola si te alejas", () => {
  const { FT, reg, est } = motor();
  est.datos = { origen: "vigia", actual: null, horas: [], avisos: [] };
  FT.abre("pantalla"); assert.strictEqual(FT.resumen().origen, "simulado");
  // te alejas 70 m (más que los 60 de pantalla)
  const lejos = reg.creadas.length; FT.revisa(); assert.ok(FT.abierta());
  FT.resumen(); const m = [...reg.escena][0]; m.position.z = -70; FT.revisa();
  assert.strictEqual(FT.abierta(), false); assert.strictEqual(reg.liberadas.length, lejos);
});

test("montado: la tecla P, la fila del panel VR, la tapa de la baliza, el oyente de TiempoVivo, el Bus y window.__fichaTiempo; libera() lo suelta todo", () => {
  const { FT, reg, ventana, VRX, libera } = motor();
  assert.deepStrictEqual(Object.keys(reg.teclas), ["KeyP"], "la P, por Teclas");
  assert.deepStrictEqual(reg.filas.map(f => f.pestana + ":" + f.id), ["mundo:tiempo"], "una fila en la pestaña Mundo");
  assert.strictEqual(reg.tapas.length, 1); assert.strictEqual(reg.oyentesTV, 1);
  assert.deepStrictEqual(Object.keys(reg.bus).sort(), ["prevision:alterna", "vr:sale"]);
  assert.strictEqual(typeof ventana.__fichaTiempo, "function");
  // la P paseando abre y cierra; en VR no es suya
  assert.notStrictEqual(reg.teclas.KeyP(), false); assert.ok(FT.abierta()); reg.teclas.KeyP(); assert.ok(!FT.abierta());
  VRX.on = true; assert.strictEqual(reg.teclas.KeyP(), false, "en VR la P no hace nada (devuelve false: no se anula la tecla)"); VRX.on = false;
  // el botón de la ventana Tiempo, por el Bus
  reg.bus["prevision:alterna"][0](); assert.ok(FT.abierta()); reg.bus["prevision:alterna"][0]({ abre: false }); assert.ok(!FT.abierta());
  // la fila del panel: botón «Ver previsión» (72 px) que abre en VR y cierra el panel; firma y debug
  const f = reg.filas[0], B = []; f.botones((id, x, y, w, h, txt, fn, on) => B.push({ id, x, y, w, h, txt, fn, on }), 460);
  assert.deepStrictEqual(B.map(b => [b.id, b.x, b.y, b.w, b.h, b.txt]), [["tiempo", 520, 604, 444, 72, "Ver previsión"]]);
  B[0].fn(); assert.strictEqual(FT.resumen().modo, "vr"); assert.strictEqual(reg.cierresPanel, 1, "abrir desde el panel lo cierra para verla");
  assert.match(f.firma(), /\|1$/); const c = ctx(); f.pinta(c, 460); assert.ok(c.textos.some(x => x.t === "Tiempo"));
  assert.ok(f.debug().fichaTiempo.abierta && f.debug().tiempo.temp, JSON.stringify(f.debug()));
  reg.bus["vr:sale"][0](); assert.ok(!FT.abierta(), "salir de VR cierra la lámina de VR");
  // liberar: nada enganchado, nada vivo
  FT.abre("pantalla"); libera();
  assert.deepStrictEqual([Object.keys(reg.teclas).length, reg.filas.length, reg.tapas.length, reg.oyentesTV, (reg.bus["prevision:alterna"] || []).length, (reg.bus["vr:sale"] || []).length], [0, 0, 0, 0, 0, 0]);
  assert.strictEqual(ventana.__fichaTiempo, undefined, "el gancho de pruebas se va con el componente");
  assert.strictEqual(reg.creadas.length, reg.liberadas.length, "ni geometría, ni material, ni textura");
});

test("en el código: P por Teclas (que filtra campos, Ctrl/Alt/Cmd y repetición), el Bus para la ventana Tiempo, sin setInterval, setTimeout ni escuchas propias en document", () => {
  assert.match(FUENTE, /Teclas\.registra\("KeyP"/);
  assert.match(FUENTE, /n\.on\("prevision:alterna"/);
  const codigo = FUENTE.replace(/\/\/.*$/gm, "");
  assert.ok(!/setInterval|setTimeout/.test(codigo), "su reloj es la fase «tarde» del bucle");
  assert.ok(!/document\.addEventListener|window\.addEventListener/.test(codigo), "ni eventos propios en document ni teclado propio");
  assert.match(lee("apps/web/motor/15_tiempo.js"), /Bus\.emite\("prevision:alterna"\)/);
  assert.ok(!/KeyP/.test(lee("apps/web/motor/12_paseo.js") + lee("apps/web/motor/31_hud.js")), "la P no la usa nadie más");
  assert.ok(!/KeyP/.test(lee("apps/web/motor/02c_componentes.js")), "ni está reservada");
});

// ---------- en el navegador (Cerro del fixture con el cliente web, por HTTP). Chrome por lanza(): el compartido de la puerta o uno propio dentro del turno.
const { sirve, motivoSalto, lanza, desgloseLlamadas } = require("./_navegador");
const { montaPagina, saltoPagina } = require("./_pagina");
const SALTO = motivoSalto("la previsión en el mundo") || saltoPagina("la previsión en el mundo");
const CAPS = path.join(SALIDA, "capturas-tiempo");
let nav, srv, url, preparado = null;
const prepara = () => preparado || (preparado = (async () => {
  srv = await sirve(montaPagina({ finca: "cerro" }).carpeta); url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  nav = await lanza(); fs.mkdirSync(CAPS, { recursive: true });
})());
test.after(async () => { if (nav) await nav.close(); if (srv) srv.close(); });
const llamadasFicha = d => d.filas.filter(f => /fichaTiempo/.test(f[0])).reduce((s, f) => s + f[1], 0);

describe("en el navegador", () => {
  before(async () => { if (!SALTO) await prepara(); });

  test("escritorio: P paseando saca la lámina (1 llamada, 1 textura), se repinta solo al cambiar y P la cierra y la libera", { timeout: 300000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    const p = await nav.newPage({ viewport: { width: 1280, height: 800 } }), errores = [];
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    try {
      await p.goto(url + "?debug&hora=12:00");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__fichaTiempo, null, { timeout: 120000, polling: 500 });
      const c = await p.evaluate(() => { const c = window.__g.copas.find(c => c.oliv) || window.__g.copas[0]; return { x: c.x + 6, y: c.y - 8 }; });
      await p.evaluate(c => window.__g.paseoEn(c.x, c.y, 0), c);
      await p.waitForFunction(() => window.__g.pendientes() === 0, null, { timeout: 120000, polling: 500 }).catch(() => {});
      // el mundo sigue cargando teselas y texturas un rato: se espera a que la cuenta de texturas y geometrías se quede quieta 8 s seguidos (en el fixture hay pausas de 4 s entre tandas)
      const mem = () => p.evaluate(() => { const m = window.__g.renderer.info.memory; return m.textures + "/" + m.geometries; });
      async function quieta() { let a = await mem(), n = 0; for (let i = 0; i < 120 && n < 8; i++) { await p.waitForTimeout(1000); const b = await mem(); n = b === a ? n + 1 : 0; a = b; } return a.split("/").map(Number); }
      const [tex0, geo0] = await quieta();
      await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      await p.keyboard.press("KeyP");
      await p.waitForFunction(() => window.__fichaTiempo().abierta, null, { timeout: 10000, polling: 100 });
      await p.waitForTimeout(800);
      const r = await p.evaluate(() => window.__fichaTiempo()), d = await p.evaluate(desgloseLlamadas);
      const [tex1, geo1] = (await mem()).split("/").map(Number);
      console.log("   lámina del tiempo (escritorio): " + llamadasFicha(d) + " llamada(s) de " + d.total + ", texturas " + tex0 + " → " + tex1 + ", geometrías " + geo0 + " → " + geo1 + ", repintadas " + r.pintadas + ", origen " + r.origen);
      assert.ok(llamadasFicha(d) >= 1 && llamadasFicha(d) <= 2, "la lámina cuesta 1-2 llamadas: " + JSON.stringify(d.filas.filter(f => /fichaTiempo/.test(f[0]))));
      assert.strictEqual(tex1 - tex0, 1, "una textura");
      await p.screenshot({ path: path.join(CAPS, "escritorio.png") });
      const n0 = r.pintadas; await p.waitForTimeout(2500);
      assert.ok((await p.evaluate(() => window.__fichaTiempo())).pintadas - n0 <= 1, "en 2,5 s sin cambios no se repinta (como mucho una vez, si cambia el minuto)");
      const [tex1b] = (await mem()).split("/").map(Number);
      await p.keyboard.press("KeyP");
      await p.waitForFunction(() => !window.__fichaTiempo().abierta, null, { timeout: 10000, polling: 100 });
      await p.waitForTimeout(300);
      const [tex2, geo2] = (await mem()).split("/").map(Number);
      console.log("   al cerrar: texturas " + tex1b + " → " + tex2 + ", geometrías → " + geo2);
      assert.strictEqual(tex1b - tex2, 1, "al cerrar, la textura se libera"); assert.ok(geo2 <= geo1 - 1, "y la geometría");
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });

  test("VR simulada: «Ver previsión» en la pestaña Mundo saca la lámina delante, a la altura de los ojos, y cierra el panel", { timeout: 400000 }, async t => {
    if (SALTO) return t.skip(SALTO);
    if (!process.env.GEMELO_VR) return t.skip("opcional: define GEMELO_VR=1 para la lámina del tiempo con el WebXR simulado (inestable con SwiftShader, como vr.test.js)");
    const p = await nav.newPage({ viewport: { width: 900, height: 650 } }), errores = [];
    await p.addInitScript({ content: lee("pruebas/mock_xr.js") });
    p.on("pageerror", e => errores.push("PAGEERROR " + String(e.stack || e).slice(0, 300)));
    p.on("console", m => { if (m.type() === "error" && !/favicon/.test(m.text())) errores.push("CONSOLE " + m.text().slice(0, 300)); });
    const dbg = () => p.evaluate(() => window.__vrDebug());
    const fot = async n => { const f0 = await p.evaluate(() => window.__mockXR.fotogramas); await p.waitForFunction(f => window.__mockXR.fotogramas >= f, f0 + n, { timeout: 60000, polling: 100 }); };
    const fisica = (r, w) => { const c = Math.cos(-r.yaw), s = Math.sin(-r.yaw), x = w[0] - r.x, y = w[1] - r.y, z = w[2] - r.z; return [x * c + z * s, y, -x * s + z * c]; };
    async function aBoton(id) {
      for (let i = 0; i < 12; i++) {
        const d = await dbg(), q = (await p.evaluate(() => window.__vrBotones())).find(b => b.id === id);
        assert.ok(q, "no hay botón " + id);
        if (d.hover === id) return q;
        const tam = d.panelTam, pos = d.panelPos, lx = ((q.x + q.w / 2) / tam[0] - 0.5) * tam[2], ly = (0.5 - (q.y + q.h / 2) / tam[1]) * tam[3], ang = Math.atan2(d.cabeza[0] - pos[0], d.cabeza[2] - pos[2]);
        await p.evaluate(v => window.__mockXR.apunta("right", v), fisica(d.rig, [pos[0] + lx * Math.cos(ang), pos[1] + ly, pos[2] - lx * Math.sin(ang)]));
        await fot(3);
      }
      return (await dbg()).hover === id ? true : null;
    }
    try {
      await p.goto(url + "?debug&hora=12:00");
      await p.waitForFunction(() => window.__g && window.__g.listo() && window.__vrDebug && window.__fichaTiempo, null, { timeout: 120000, polling: 500 });
      await p.waitForSelector("#btnVR", { timeout: 30000 }); await p.click("#btnVR");
      await p.waitForFunction(() => window.__vrDebug && window.__vrDebug().on, null, { timeout: 60000, polling: 200 });
      await fot(6);
      let d = await dbg();
      assert.strictEqual(d.pestana, "mundo"); assert.ok(d.tiempo && /°C$/.test(d.tiempo.temp), "el resumen del tiempo en Mundo: " + JSON.stringify(d.tiempo));
      const q = await aBoton("tiempo"); assert.ok(q, "el rayo no llegó a «Ver previsión»");
      assert.ok(q === true || q.h >= 64, "«Ver previsión» de ≥ 64 px");
      await p.screenshot({ path: path.join(CAPS, "vr_panel.png") });
      await p.evaluate(() => window.__mockXR.gatillo("right")); await fot(4);
      d = await dbg();
      assert.ok(d.fichaTiempo && d.fichaTiempo.abierta && d.fichaTiempo.modo === "vr", JSON.stringify(d.fichaTiempo));
      assert.strictEqual(d.panel, false, "el panel se cierra para ver la lámina");
      const fp = d.fichaTiempo.pos, dist = Math.hypot(fp[0] - d.cabeza[0], fp[2] - d.cabeza[2]);
      assert.ok(dist > 1.2 && dist < 1.6 && Math.abs(fp[1] - d.cabeza[1]) < 0.2, "delante (1,4 m) y a la altura de los ojos: " + dist.toFixed(2) + " m, Δy " + (fp[1] - d.cabeza[1]).toFixed(2));
      const dl = await p.evaluate(desgloseLlamadas);
      console.log("   lámina del tiempo (VR simulada): " + llamadasFicha(dl) + " llamada(s) de " + dl.total);
      await p.screenshot({ path: path.join(CAPS, "vr_lamina.png") });
      // anclada al mundo: girar la cabeza no la mueve
      await p.evaluate(() => { window.__mockXR.dirCabeza = [0.6, 0, -0.8]; }); await fot(6);
      const d2 = await dbg(); assert.deepStrictEqual(d2.fichaTiempo.pos.map(v => +v.toFixed(3)), fp.map(v => +v.toFixed(3)), "la lámina no sigue a la cabeza");
      await p.evaluate(() => window.__mockXR.sesion.end()); await p.waitForFunction(() => !window.__vrDebug().on, null, { timeout: 30000, polling: 200 });
      await p.waitForFunction(() => !window.__fichaTiempo().abierta, null, { timeout: 5000, polling: 200 });
      assert.deepStrictEqual(errores, []);
    } finally { await p.close(); }
  });
});
