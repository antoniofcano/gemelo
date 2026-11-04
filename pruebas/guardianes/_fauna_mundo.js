"use strict";
// Un mundo de mentira para correr, en Node y con el three de verdad, la fauna (apps/web/motor/16b_fauna.js) o su copia anterior a AG-1.4b
// (referencias/16b_fauna_antes.js) con la MISMA semilla, y comparar o medir. Lo usan fauna_equivalencia.test.js (que comprueba que dan lo mismo)
// y pruebas/medida_fauna.js (el microbanco). Nada de esto es Chrome: sirve para comparar versiones y contar, no para decir fps (regla 7).
const path = require("path"), { pathToFileURL } = require("url");
const { lee, RAIZ } = require("./_util");

/** three de verdad (el de apps/web), una sola vez. */
let _three = null;
async function cargaThree() { if (!_three) _three = await import(pathToFileURL(path.join(RAIZ, "apps/web/node_modules/three/build/three.module.js")).href); return _three; }

/** Generador de números con semilla (mulberry32) y un Math que lo usa en random(): lo demás es el Math de siempre. */
function semilla(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mathCon(rnd) { const M = Object.create(Math); M.random = rnd; return M; }

/** El nivel del sol de ANTES de AG-1.4b (posSol + nivel de 15_tiempo.js, tal cual estaban): copia para comparar. */
const NIVEL_ANTES = `
  function posSol(ms) {
    var rad = Math.PI / 180, n = ms / 86400000 + 2440587.5 - 2451545.0;
    var L = (280.46 + 0.9856474 * n) % 360, g = ((357.528 + 0.9856003 * n) % 360) * rad;
    var lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad, eps = (23.439 - 0.0000004 * n) * rad;
    var ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam)), de = Math.asin(Math.sin(eps) * Math.sin(lam));
    var gmst = (280.46061837 + 360.98564736629 * n) % 360, Hh = (gmst + LON) * rad - ra, fi = LAT * rad;
    var alt = Math.asin(Math.sin(fi) * Math.sin(de) + Math.cos(fi) * Math.cos(de) * Math.cos(Hh));
    var az = Math.atan2(Math.sin(Hh), Math.cos(Hh) * Math.sin(fi) - Math.tan(de) * Math.cos(fi)) + Math.PI;
    return { alt: alt, az: az };
  }
  function nivel(ms) { var s = posSol(ms), d = Math.max(0, Math.min(1, (Math.sin(s.alt) + 0.1) / 0.45)); return { s: s, d: d }; }
`;

/** El trozo del nivel del sol de la 15_tiempo.js actual (entre [nivel:inicio] y [nivel:fin]) + la nivel() de siempre, que en el módulo va más abajo. */
function nivelNuevo() {
  const src = lee("apps/web/motor/15_tiempo.js"), a = src.indexOf("// [nivel:inicio]"), b = src.indexOf("// [nivel:fin]");
  if (a < 0 || b < a) throw new Error("15_tiempo.js ya no tiene las marcas [nivel:inicio] / [nivel:fin]");
  const m = /\n  function nivel\(ms\) \{[^\n]*\n/.exec(src); if (!m) throw new Error("15_tiempo.js ya no tiene function nivel(ms)");
  return src.slice(a, b) + m[0];
}

/** Un mundo con olivos repartidos (algunos muy juntos, para probar la cadena de empujones), una función de relieve y los globales que pide la fauna. */
function disenoOlivos(n, sem) {
  const r = semilla(sem), copas = [];
  for (let i = 0; i < n; i++) copas.push({ x: (r() - 0.5) * 360, y: (r() - 0.5) * 360, h: 3 + r() * 4, oliv: r() > 0.07 });
  for (let i = 0; i < 24; i++) copas.push({ x: 40 + (r() - 0.5) * 3, y: -30 + (r() - 0.5) * 3, h: 4, oliv: true });   // un corro de olivos a menos de un metro unos de otros
  return copas;
}

/**
 * fichero: "apps/web/motor/16b_fauna.js" (lo nuevo) o "pruebas/guardianes/referencias/16b_fauna_antes.js" (lo anterior); copas: el diseño de olivos.
 * Devuelve { api, E, g, Bus, mueve(f) }: E lleva el estado que lee la fauna (paseando, enQuad, tVida), g los globales.
 */
function construye(THREE, fichero, copas, sem) {
  const nuevo = !/antes/.test(fichero), rnd = semilla(sem);
  const E = { paseando: true, enQuad: false, tVida: 0 };
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  const bus = {}, defs = [];
  const Bus = { on(ev, fn) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { (bus[ev] || []).slice().forEach(f => f(d)); return (bus[ev] || []).length; } };
  const Minimapa = { capa() { return () => {}; } };
  const cIn = copas.filter(c => c.oliv && Math.abs(c.x) < 150 && Math.abs(c.y) < 150);
  const g = {
    THREE, scene, gFauna, Bus, Minimapa, Componentes: { registra: d => { defs.push(d); return true; } }, console, Math: mathCon(rnd), Date, setTimeout, clearTimeout,
    window: {}, document: {}, exag: 1.2, altSuelo: (x, y) => 2 + 0.01 * x + Math.sin(y * 0.1), copas, cIn, D: { ext: [-500, 500, 500, -500] }, pp: { x: 0, y: 0, ang: 0 },
    cur: { lluvia: 0, viento: 1, dir: 0, ms: Date.UTC(2026, 5, 21, 15, 0, 0) }, camera: new THREE.PerspectiveCamera(),
    matSombra: new THREE.MeshBasicMaterial(), geoSombra: new THREE.PlaneGeometry(1, 1),
    esfera(r, m, sx, sy, sz, x, y, z, padre) { const me = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m); me.scale.set(sx, sy, sz); me.position.set(x, y, z); padre.add(me); return me; },
    mira(o, hx, hz) { o.rotation.y = Math.atan2(-hx, -hz); },
    fusionaGeometrias: require("./_materiales").fabrica(THREE).fusionaGeometrias   // 02k_fusiona.js (AG-1.13b)
  };
  // El código se evalúa como en el motor: dentro de una función, con lo que consume como variables de esa función (no como globales de un contexto vm, que son
  // mucho más lentas de leer y falsearían los tiempos), y con paseando / enQuad / tVida como variables que se cambian por fuera con __pon.
  const nombres = Object.keys(g), valores = nombres.map(k => g[k]);
  const cuerpo = '"use strict";\nvar paseando = true, enQuad = false, tVida = 0, LAT = 37.73, LON = -4.006;\nfunction __pon(a, b, c) { paseando = a; enQuad = b; tVida = c; }\n' +
    (nuevo ? nivelNuevo() : NIVEL_ANTES) + "\n" + lee(fichero) + "\nreturn __pon;";
  const pon = new Function(...nombres, cuerpo)(...valores);
  const n = { on: (ev, fn) => (Bus.on(ev, fn), fn), emite: (ev, d) => Bus.emite(ev, d), limpia: fn => fn, api: () => null, parametros: {} };
  const api = defs[0].monta(n);
  // los perros: uno que da vueltas y asusta a los conejos que se le acercan (la misma respuesta para las dos versiones)
  let fot = 0; Bus.on("perros:amenaza", q => { const px = 30 * Math.cos(fot * 0.02), py = 20 * Math.sin(fot * 0.017); if (Math.hypot(q.x - px, q.y - py) < 14) q.res = { x: px, y: py }; });
  return { api, E, g, Bus, pon, mallas: () => gFauna.children.filter(o => o.isInstancedMesh), gFauna, def: defs[0],
    /** el fotograma f: el jugador se pasea, el reloj del mundo avanza msPaso, y se corre actualiza(dt) */
    fotograma(f, dt, msPaso, guion) {
      fot = f; const s = guion ? guion(f) : {};
      E.tVida += dt; g.cur.ms += msPaso;
      g.pp.x = 120 * Math.sin(f * 0.004); g.pp.y = 90 * Math.cos(f * 0.0053);
      if (s.paseando !== undefined) E.paseando = s.paseando; if (s.enQuad !== undefined) E.enQuad = s.enQuad;
      if (s.lluvia !== undefined) g.cur.lluvia = s.lluvia; if (s.viento !== undefined) g.cur.viento = s.viento;
      if (s.emite) Bus.emite(s.emite);
      pon(E.paseando, E.enQuad, E.tVida); api.actualiza(dt);
    } };
}

module.exports = { cargaThree, semilla, disenoOlivos, construye, NIVEL_ANTES, nivelNuevo };
