"use strict";
// Un mundo mínimo, en Node y con el three de verdad, para correr actualizaTiempo + pintaNubes de apps/web/motor/15_tiempo.js (nuevo=true) o su foto anterior a AG-1.4c
// (referencias/15_tiempo_antes.js) con la MISMA entrada. Lo usan bucle_equivalencia.test.js (que comprueba que dan lo mismo) y pruebas/medida_bucle.js (el microbanco).
// Nada de esto es Chrome: sirve para comparar versiones y contar, no para decir fps (regla 7).
const { lee } = require("./_util");
const F = require("./_fauna_mundo");
/** Un trozo contiguo del módulo del motor, de `desde` hasta justo antes de `hasta` (ambos textos únicos). */
function trozo(modulo, desde, hasta) {
  const src = lee("apps/web/motor/" + modulo), i = src.indexOf(desde), j = src.indexOf(hasta, i);
  if (i < 0 || j <= i) throw new Error(modulo + ": no se encuentra el trozo " + desde);
  return src.slice(i, j);
}
/** Un mundo mínimo para correr actualizaTiempo: el código de ahora (sacado del módulo) o la foto de antes (referencias/15_tiempo_antes.js), con la misma entrada. */
function mundoTiempo(THREE, nuevo) {
  const hash = (n) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };
  const NUBES = [];
  for (let i = 0; i < 46; i++) {   // igual que el módulo: 46 grupos de 5 manchas
    const r1 = hash(i * 3.1), r2 = hash(i * 5.7), r3 = hash(i * 9.3), tam = 150 + 190 * r3, gr = { position: new THREE.Vector3((r1 - 0.5) * 2400, 230 + 130 * r2, (r2 - 0.5) * 2000), umbral: (i + 0.5) / 46, o: 0, sp: [] };
    for (let j = 0; j < 5; j++) { const s = tam * (0.55 + 0.6 * hash(i * 11 + j)); gr.sp.push({ sx: s, sy: s * 0.5, p: new THREE.Vector3((hash(i * 7 + j) - 0.5) * tam * 0.9, (hash(i * 13 + j) - 0.5) * 12, (hash(i * 17 + j) - 0.5) * tam * 0.35) }); }
    NUBES.push(gr);
  }
  const NSP = 46 * 5, g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NSP * 12), 3)); g.setAttribute("tam", new THREE.BufferAttribute(new Float32Array(NSP * 8), 2)); g.setAttribute("alfa", new THREE.BufferAttribute(new Float32Array(NSP * 4), 1));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(NSP * 6), 1));
  const nubesMalla = new THREE.Mesh(g, { uniforms: { diffuse: { value: new THREE.Color(1, 1, 1) } } });
  const el = () => ({ style: {}, attrs: {}, textContent: "", setAttribute(k, v) { this.attrs[k] = v; } }), els = { tFlecha: el(), tInsT: el(), tIns: el() };
  const mat = () => new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0xaaaaaa, 100, 900);
  const W = {
    THREE, NUBES, NSP, nubesMalla, scene, camera: new THREE.PerspectiveCamera(), sol: new THREE.DirectionalLight(), hemi: new THREE.HemisphereLight(), SRGB: THREE.SRGBColorSpace,
    LUZ_SOL: 1.1, LUZ_CIELO: 0.9, cieloBase: new THREE.Color(0x87b5e0), FOG0: 120, FOG1: 1200, matHojaG: mat(), matHojaP: mat(), matCorteza: mat(), nube: { material: mat() }, matOrto: mat(), matSuelo: mat(),
    uSombra: { uDrift: { value: new THREE.Vector2() }, uCov: { value: 0 }, uSomb: { value: 0 }, uHielo: { value: 0 } }, sprSol: new THREE.Sprite(new THREE.SpriteMaterial()),
    estrellas: new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial()), uViento: { uT: { value: 0 }, uAmp: { value: 0 }, uDir: { value: new THREE.Vector2() } },
    lluvia: new THREE.Object3D(), uLluvia: { uT: { value: 0 }, uInt: { value: 0 }, uViento: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color() } }, uBarrera: { uT: { value: 0 } },
    objetivo: new THREE.Vector3(10, 5, -20), $: (id) => els[id], TiempoPuro: { cielo: (nub, ll, hr) => (ll > 0.05 ? "lluvia" : nub > 60 ? "cubierto" : "despejado") },
    fmtHora: { format: (d) => d.toISOString().slice(11, 16) }, num1: (v, d) => v.toFixed(d == null ? 1 : d), rumbo: (gr) => ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(((gr % 360) + 360) % 360 / 45) % 8],
    TM: { demo: false, origen: "simulado" }, cur: { ms: Date.UTC(2026, 5, 21, 10), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 }, meta: { ms: Date.UTC(2026, 5, 21, 10), nub: 0, viento: 0, dir: 0, lluvia: 0, hr: 40, temp: 18 },
    ahoraMs: () => Date.UTC(2026, 5, 21, 10), els
  };
  W.lluvia.visible = false; W.estrellas.material.transparent = true;
  const nombres = Object.keys(W), valores = nombres.map(k => W[k]);
  const codigo = nuevo
    ? trozo("15_tiempo.js", "  var nubesOrden", "  var sprSol") + "\n" + trozo("15_tiempo.js", "  var lvT", "  // --- la barrera de la linde")
    : lee("pruebas/guardianes/referencias/15_tiempo_antes.js");
  const cuerpo = '"use strict";\nvar LAT = 37.73, LON = -4.006, calma = false, tMundo = 0, lluviaVis = 0, ins = { t: 1, txt: "" }, vFlecha = new THREE.Vector3();\n' + F.nivelNuevo() + "\n" + codigo +
    "\nreturn { act: actualizaTiempo, calma: function (v) { calma = v; }, tMundo: function () { return tMundo; }, lluviaVis: function () { return lluviaVis; }, ins: ins };";
  const api = new Function(...nombres, cuerpo)(...valores);
  return { W, api };
}
const rgb = (c) => [c.r, c.g, c.b];
function fotoTiempo(m) {
  const W = m.W, G = W.nubesMalla.geometry, v3 = (p) => [p.x, p.y, p.z];
  return {
    P: Buffer.from(G.attributes.position.array.buffer.slice(0)).toString("base64"), T: Buffer.from(G.attributes.tam.array.buffer.slice(0)).toString("base64"), A: Buffer.from(G.attributes.alfa.array.buffer.slice(0)).toString("base64"),
    draw: [G.drawRange.start, G.drawRange.count], nubesVis: W.nubesMalla.visible, dif: rgb(W.nubesMalla.material.uniforms.diffuse.value),
    bg: rgb(W.scene.background), fog: [rgb(W.scene.fog.color), W.scene.fog.near, W.scene.fog.far], sol: [v3(W.sol.position), rgb(W.sol.color), W.sol.intensity], hemi: W.hemi.intensity,
    mats: [W.matHojaG, W.matHojaP, W.matCorteza, W.nube.material, W.matOrto, W.matSuelo].map(x => rgb(x.color)), sombra: [W.uSombra.uCov.value, W.uSombra.uSomb.value, W.uSombra.uHielo.value, W.uSombra.uDrift.value.x, W.uSombra.uDrift.value.y],
    spr: [v3(W.sprSol.position), W.sprSol.visible, W.sprSol.material.opacity, rgb(W.sprSol.material.color)], est: [v3(W.estrellas.position), W.estrellas.material.opacity],
    nubes: W.NUBES.map(n => [v3(n.position), n.o]), viento: [W.uViento.uT.value, W.uViento.uAmp.value, W.uViento.uDir.value.x, W.uViento.uDir.value.y],
    lluvia: [W.lluvia.visible, v3(W.lluvia.position), W.uLluvia.uT.value, W.uLluvia.uInt.value, W.uLluvia.uViento.value.x, W.uLluvia.uViento.value.y, rgb(W.uLluvia.uColor.value)],
    barrera: W.uBarrera.uT.value, tMundo: m.api.tMundo(), lluviaVis: m.api.lluviaVis(), cur: Object.assign({}, W.cur), ins: [m.api.ins.t, m.api.ins.txt], flecha: [W.els.tFlecha.style.transform, W.els.tFlecha.style.opacity], aria: W.els.tIns.attrs, txt: W.els.tInsT.textContent
  };
}

module.exports = { mundoTiempo, fotoTiempo };
