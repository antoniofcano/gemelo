"use strict";
// Un mundo mínimo, en Node y con el three de verdad, para correr el componente «perros-paseo» (apps/web/motor/25_perros.js, o su copia anterior a AG-1.4c en
// referencias/25_perros_antes.js) con la MISMA semilla. Lo usan bucle_equivalencia2.test.js (que comprueba que dan lo mismo) y pruebas/medida_bucle.js (el microbanco).
// Nada de esto es Chrome: sirve para comparar versiones y contar, no para decir fps (regla 7).
const vm = require("vm");
const { lee } = require("./_util");
const F = require("./_fauna_mundo");
/** El mundo de mentira de los perros: lo que el motor deja ver al componente, con un Math de semilla y conejos que se mueven. fichero: el nuevo o la copia anterior. */
function mundoPerros(THREE, fichero, sem) {
  const rnd = F.semilla(sem), M = Object.create(Math); M.random = rnd;
  const E = { paseando: true, enQuad: false, enDron: false, tVida: 0 };
  const scene = new THREE.Scene(), gFauna = new THREE.Group(); scene.add(gFauna);
  const bus = {}, eventos = [];
  const Bus = { on(ev, fn) { (bus[ev] = bus[ev] || []).push(fn); return () => { bus[ev] = (bus[ev] || []).filter(f => f !== fn); }; },
    emite(ev, d) { if (ev !== "fauna:conejo-cerca") eventos.push(ev + JSON.stringify(d)); (bus[ev] || []).slice().forEach(f => f(d)); return (bus[ev] || []).length; } };
  const lienzo = () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: (t, k) => k === "measureText" ? () => ({ width: 10 }) : () => {}, set: () => true }) });
  const defs = [], conejos = [];
  for (let i = 0; i < 24; i++) conejos.push({ visible: true, userData: { x: (rnd() - 0.5) * 70, y: (rnd() - 0.5) * 70, est: "pasta", t: 0, dir: rnd() * 6 } });
  const g = {
    THREE, scene, gFauna, Bus, Minimapa: { capa() { return () => {}; } }, Componentes: { registra: d => { defs.push(d); return true; } }, console, Math: M, Date, setTimeout: () => 1, clearTimeout: () => {},
    window: {}, document: { createElement: lienzo }, exag: 1, hash: i => (Math.sin(i * 12.9898) * 43758.5453) % 1 * 0.5 + 0.5, texColor: t => t,
    pp: { x: 10, y: 10, ang: 0, paso: 0 }, esc: {}, camera: new THREE.PerspectiveCamera(), matSombra: new THREE.MeshBasicMaterial(), geoSombra: new THREE.PlaneGeometry(1, 1),
    altSuelo: (x, y) => 2 + 0.01 * x + Math.sin(y * 0.1), pendienteRumbo: (x, y, a) => [0.15 * Math.sin(x * 0.07 + a), 0.1 * Math.cos(y * 0.05)], sueloSeco: (x, y) => ((x * 7 + y * 3) | 0) % 5 !== 0,
    copas: [], D: { ext: [-100, 100, 100, -100] }
  };
  for (let i = 0; i < 40; i++) g.copas.push({ x: (rnd() - 0.5) * 120, y: (rnd() - 0.5) * 120, oliv: rnd() > 0.1 });
  for (const k of ["paseando", "enQuad", "enDron", "tVida"]) Object.defineProperty(g, k, { get: () => E[k], enumerable: true });
  const ctx = vm.createContext(g);
  vm.runInContext("\"use strict\";\n" + lee(fichero), ctx, { filename: fichero });
  const n = { on: (ev, fn) => (Bus.on(ev, fn), fn), emite: (ev, d) => Bus.emite(ev, d), limpia: fn => fn, api: () => null, parametros: {} };
  const api = defs[0].monta(n);
  // los conejos de mentira: quien pregunta «fauna:conejo-cerca» recibe el más cercano a menos de su radio
  Bus.on("fauna:conejo-cerca", q => { let mejor = null, dm = q.radio; for (const c of conejos) { const dd = Math.hypot(c.userData.x - q.x, c.userData.y - q.y); if (c.visible && dd < dm) { dm = dd; mejor = c; } } if (mejor) q.res = mejor; });
  return { E, g, api, eventos, conejos, antes: true };
}

module.exports = { mundoPerros };
