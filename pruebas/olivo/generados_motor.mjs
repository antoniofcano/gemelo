// Olivos generados en el motor (apps/web/motor/07ab_generados.js, ?olivos=gen) en Node, sin navegador ni GPU: el módulo del motor se ejecuta en un
// contexto vm con three 0.186.1, el constructor de olivos real (apps/web/olivo/) y el parcheTiempo y colorVertSRGB REALES (sacados de 15_tiempo.js y
// 03_escena.js). Comprueba:
//   - sin la bandera, no hace nada (ni grupo, ni paso, ni gasto): el motor dibuja lo mismo;
//   - luz: cada material de color lleva los uniformes de nubes y escarcha del motor (los mismos objetos), la sombra de nubes en posición del mundo,
//     el color por instancia de las mallas por lotes en sRGB, el color del material pasado de sRGB a lineal y las texturas marcadas sRGB;
//   - fundido: todos los materiales (también los de sombra) llevan uFun y el descarte por tramado; el lote lleva el código de cada árbol (alfa del
//     color por lotes, atributo aFun en las instanciadas); lo que entra no apaga el nivel de siempre hasta acabar el fundido; lo que sale se oculta al acabar;
//   - la huella olivo-2 de la receta no cambia (la del oráculo para centenario3/envero/7);
//   - variantes horneadas (O7e, ADR-0018): con un manifiesto y sus objetos servidos por un fetch falso, las variantes se dibujan SIN calcularse
//     (semillas y época del manifiesto) y el lote es el mismo que con ?olivosHorneado=0; con una huella alterada o un objeto que falta, esa cae al
//     cálculo; sin manifiesto, o con el del fixture (gen_version sintética), todo como siempre; nada en consola.
// Escribe una línea JSON {mal: [...], ...} (la lee pruebas/guardianes/olivo.test.js).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const OLIVO = path.join(RAIZ, "apps", "web", "olivo");
const MOTOR = path.join(RAIZ, "apps", "web", "motor");
const THREE = await import(pathToFileURL(path.join(OLIVO, "node_modules", "three-r186", "build", "three.module.js")).href);
const O = await import(pathToFileURL(path.join(OLIVO, "index.js")).href);
const lee = f => fs.readFileSync(path.join(MOTOR, f), "utf8");
const mal = [], diag = {};
const exige = (c, m) => { if (!c) mal.push(m); };

// un trozo de código fuente desde `inicio`: hasta la llave que cierra (función) o el «;» de primer nivel (var), saltando cadenas y comentarios
function extrae(src, inicio) {
  const a = src.indexOf(inicio); if (a < 0) throw new Error("no está: " + inicio);
  const fn = inicio.startsWith("function"); let d = 0, i = a, visto = false;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") { const q = c; for (i++; i < src.length && src[i] !== q; i++) if (src[i] === "\\") i++; continue; }
    if (c === "/" && src[i + 1] === "/") { i = src.indexOf("\n", i); continue; }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i) + 1; continue; }
    if ("([{".includes(c)) { d++; if (c === "{") visto = true; }
    else if (")]}".includes(c)) { d--; if (fn && visto && d === 0) return src.slice(a, i + 1); }
    else if (!fn && c === ";" && d === 0) return src.slice(a, i + 1);
  }
  throw new Error("sin cierre: " + inicio);
}
const T15 = lee("15_tiempo.js"), T03 = lee("03_escena.js");
const piezas = [extrae(T03, "var GLSL_LIN"), extrae(T03, "function colorVertSRGB"), extrae(T15, "var uViento"), extrae(T15, "var uSombra"),
  extrae(T15, "var GLSL_SOMBRA"), extrae(T15, "function parcheTiempo")].join("\n");
const G07 = lee("07ab_generados.js");

// extra: lo que se añade o sustituye en el contexto (D.base, fetch, console, window.OlivoGen) para las variantes horneadas (sección 6)
function contexto(busqueda, reloj, extra) {
  const cola = [];
  const ctx = Object.assign({
    THREE, console, performance: reloj || performance, Promise, Math, Object, Number, String, Error, Float32Array, Uint8Array,   // los del módulo del olivo (instanceof entre contextos vm)
    location: { search: busqueda }, window: { OlivoGen: O },
    gArboles: new THREE.Group(), D: { copas: [], centro_utm: [0, 0] }, VRP: { on: false }, FACTOR_R8: 0.5, FACTOR_R8_GEN: 1, exag: 1,
    suelo: () => 0, camera: { position: new THREE.Vector3(0, 10, 0) },
    Cola: { add: () => { throw new Error("los generados no deben usar la Cola compartida"); }, hay: () => false }, cola
  }, extra || {});
  vm.createContext(ctx);
  vm.runInContext(piezas + "\n" + G07 + "\n;this.__G = Generados; this.__uSombra = uSombra;", ctx, { filename: "07ab_generados.js" });
  return ctx;
}
const espera = () => new Promise(r => setTimeout(r, 0));

// ---- 1) sin la bandera
{
  const c = contexto("?debug");
  await espera();
  exige(c.__G.estado() === "apagado", "sin la bandera, el estado es " + c.__G.estado());
  exige(c.gArboles.children.length === 0, "sin la bandera, Generados añade algo a la escena");
  exige(c.__G.paso(0.016, 4) === false && c.__G.gastado() === 0, "sin la bandera, paso() hace algo o gasta tiempo");
  exige(c.__G.pendientes() === 0, "sin la bandera, hay trabajo pendiente");
  const g = c.__G.actualiza(0, 0, 550000, []); exige(g.radio === 0 && !g.tiene(0), "sin la bandera, actualiza() reparte");
}

// ---- 2) con la bandera: materiales
const c = contexto("?olivos=gen");
for (let k = 0; k < 20 && c.__G.estado() === "cargando"; k++) await espera();
exige(c.__G.estado() === "activo", "Generados no arrancó: " + c.__G.estado() + " " + JSON.stringify(c.window.__olivosGen && c.window.__olivosGen().motivo));
const mats = c.__G._prueba.mats(), prof = c.__G._prueba.prof();
const LIB = { MeshStandardMaterial: "physical", MeshDepthMaterial: "depth", PointsMaterial: "points" };
function compila(m) {   // lo que haría el renderer: onBeforeCompile sobre los sombreadores de serie de three 0.186
  const L = THREE.ShaderLib[LIB[m.type]];
  const sh = { uniforms: THREE.UniformsUtils.clone(L.uniforms), vertexShader: L.vertexShader, fragmentShader: L.fragmentShader };
  m.onBeforeCompile.call(m, sh, null); return sh;
}
const COLOR = ["pies", "muerta", "oliva", "ramita0", "ramita1", "relleno", "puntos"], SOMBRA = ["ramita0_sombra", "ramita1_sombra", "relleno_sombra"];
const lin = v => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
for (const n of COLOR) {
  const m = mats[n], sh = compila(m);
  for (const u of ["uDrift", "uCov", "uSomb", "uHielo"]) exige(sh.uniforms[u] === c.__uSombra[u], n + ": " + u + " no es el uniforme del motor");
  exige(sh.uniforms.uFun === c.__G._prueba.uFun, n + ": sin uFun");
  exige(/gl_FragColor\.rgb \*= vSomb/.test(sh.fragmentShader) && /uHielo \* 0\.6/.test(sh.fragmentShader) || n === "puntos", n + ": sin sombra de nubes ni escarcha en el fragmento");
  exige(!/ot_sombra\(position\.xz\)/.test(sh.vertexShader) && /vSomb = ot_sombra\(\(modelMatrix \* ot_w\)\.xz\)/.test(sh.vertexShader), n + ": la sombra de nubes no va en posición del mundo");
  exige(/ot_lin\(vColor\.rgb\)/.test(sh.vertexShader) && /USE_BATCHING_COLOR \) && ! defined/.test(sh.vertexShader), n + ": el color por instancia no se lee en sRGB");
  exige(/discard;/.test(sh.fragmentShader) && /ot_ign\(gl_FragCoord\.xy\)/.test(sh.fragmentShader) && /ot_c = aFun/.test(sh.vertexShader) && /ot_d >= vFr/.test(sh.fragmentShader), n + ": sin el tramado del fundido");
  exige(sh.uniforms.uBanda && sh.uniforms.uBanda === c.__G._prueba.uBanda && /uBanda\[ot_si \/ 4\]/.test(sh.vertexShader), n + ": sin el peso por banda (O9c)");
  exige(m.customProgramCacheKey().includes("gen-luz-fundido"), n + ": clave de programa sin el parche");
  if (m.map) exige(m.map.colorSpace === THREE.SRGBColorSpace, n + ": textura sin marcar como sRGB");
}
exige(Math.abs(mats.pies.color.r - lin(0xbd / 255) * O.CALIBRACION_LINEAL.corteza) < 1e-6, "el color de la corteza no pasó de sRGB a lineal (con la calibración de la luz lineal, decisión 70): " + mats.pies.color.r);
exige(Math.abs(mats.relleno.color.r - O.CALIBRACION_LINEAL.follaje) < 1e-6, "el follaje sin la calibración de la luz lineal (decisión 70): " + mats.relleno.color.r);
for (const m of SOMBRA.map(n => mats[n]).concat([prof.corteza, prof.muerta])) {
  const sh = compila(m);
  exige(sh.uniforms.uFun === c.__G._prueba.uFun && sh.uniforms.uBanda === c.__G._prueba.uBanda && /discard;/.test(sh.fragmentShader), m.type + ": la sombra no lleva el fundido");
  exige(!sh.uniforms.uHielo, "la sombra no debe llevar la escarcha");
}
exige(/#include <common>\n#include <common>/.test(compila(mats.pies).vertexShader) === false, "parche duplicado");

// ---- 2b) con la bandera y el fixture de Hituelo, con la cámara del escenario «cerca» de pruebas/guardianes/_navegador.js: el plan no queda vacío
{
  const FX = path.join(RAIZ, "pruebas", "salida", "fixture", "hituelo", "indice.json");
  if (!fs.existsSync(FX)) mal.push("sin el fixture (npm run fixture): el plan de «cerca» NO se ha comprobado");
  else {
    const I = JSON.parse(fs.readFileSync(FX, "utf8")), cf = contexto("?olivos=gen");
    for (let k = 0; k < 20 && cf.__G.estado() === "cargando"; k++) await espera();
    cf.D.copas = I.copas; cf.D.copas_id = I.copas_id; cf.D.copas_param = I.copas_param; cf.D.copas_semilla = I.copas_semilla; cf.D.centro_utm = I.centro_utm;
    const ol = I.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] })).filter(c => !(c.h > 8));
    const NAV = fs.readFileSync(path.join(RAIZ, "pruebas", "guardianes", "_navegador.js"), "utf8");
    const e = Function("return (" + /cerca: (\{[^}]*\})/.exec(NAV)[1] + ")")(), fx = e.ox, fz = -e.oy, ce = Math.cos(e.el);
    cf.camera.position.set(fx + e.dist * ce * Math.sin(e.az), 4 + e.dist * Math.sin(e.el), fz + e.dist * ce * Math.cos(e.az));   // como camara() de 09_camara
    cf.__G.actualiza(fx, fz, 550000, ol);
    const st = cf.window.__olivosGen();
    diag.cerca_fixture = { plan: st.plan, pendientes: cf.__G.pendientes() };
    exige(st.plan >= 1, "con la cámara de «cerca» y el fixture, el plan de generados queda vacío");
    exige(cf.__G.pendientes() > 0, "con el plan sin dibujar, pendientes() debe ser > 0");
    // hasta que el lote esté dibujado y quieto
    for (let r = 0; r < 40 && (cf.__G.pendientes() > 0); r++) { cf.__G.actualiza(fx, fz, 550000, ol); for (let f = 0; f < 200; f++) cf.__G.paso(0.1, 50); }
    const lote = cf.__G._prueba.lote(), st2 = cf.window.__olivosGen();
    exige(st2.info.arboles >= 1, "con la cámara de «cerca», no llega a dibujarse ningún generado (" + JSON.stringify(st2.info) + ")");
    // girar en el sitio: la cámara da la vuelta alrededor del foco (como en el paseo, detrás de quien pasea) y el foco no se mueve
    let cambia = 0;
    for (let a = 0; a < 16; a++) {
      const th = a / 16 * 2 * Math.PI; cf.camera.position.set(fx + 5 * Math.sin(th), 3, fz + 5 * Math.cos(th));
      cf.__G.actualiza(fx, fz, 550000, ol); for (let f = 0; f < 10; f++) cf.__G.paso(0.05, 50);
      if (cf.__G._prueba.lote() !== lote || cf.window.__olivosGen().fundido.activo) cambia++;
    }
    exige(cambia === 0, "girando en el sitio, el lote se rehace o entra en fundido " + cambia + " veces de 16");
    // recorte por frustum. (a) La esfera y la caja de cada malla del lote contienen TODO lo que dibuja (cada instancia, cada punto, en el mundo): si se
    // calcularan antes de escribir las matrices, o con un count viejo, aquí saldría. (b) Desde 16 direcciones a 9 m de cada generado y mirándolo, ninguna
    // malla que lleve piezas de ESE árbol queda fuera de la vista. Una malla sin piezas suyas (p. ej. gen-olivas cuando ese árbol lleva sus olivas en
    // gen-puntos, o al revés) puede quedar fuera con razón: el recorte es correcto y no se exige.
    const cam = new THREE.PerspectiveCamera(42, 900 / 650, 0.5, 5000), fr = new THREE.Frustum(), m = new THREE.Matrix4();
    lote.updateMatrixWorld(true); let fuera = [], sinCubrir = [];
    // Cada pieza dibujada es una esfera en el mundo: la de su geometría por la matriz de su instancia (mallas por lotes e instanciadas) o un punto (radio 0).
    const pos = new Map(), mi = new THREE.Matrix4(), v = new THREE.Vector3(), esf = new THREE.Sphere(), caja = new THREE.Box3();
    for (const ch of lote.children) {
      const P = [];
      if (ch.isBatchedMesh) for (let i = 0; i < ch.instanceCount; i++) { if (ch.getVisibleAt(i)) { ch.getMatrixAt(i, mi); P.push(ch.getBoundingSphereAt(ch.getGeometryIdAt(i), new THREE.Sphere()).applyMatrix4(mi.premultiply(ch.matrixWorld))); } }
      else if (ch.isInstancedMesh) { if (!ch.geometry.boundingSphere) ch.geometry.computeBoundingSphere(); for (let i = 0; i < ch.count; i++) { ch.getMatrixAt(i, mi); P.push(ch.geometry.boundingSphere.clone().applyMatrix4(mi.premultiply(ch.matrixWorld))); } }
      else { const a = ch.geometry.attributes.position, n = Math.min(a.count, ch.geometry.drawRange.count); for (let i = 0; i < n; i++) P.push(new THREE.Sphere(v.fromBufferAttribute(a, i).applyMatrix4(ch.matrixWorld).clone(), 0)); }
      pos.set(ch, P);
      if (!ch.frustumCulled) continue;
      const inst = ch.isBatchedMesh || ch.isInstancedMesh;
      esf.copy(inst ? ch.boundingSphere : ch.geometry.boundingSphere).applyMatrix4(ch.matrixWorld);
      if (inst) caja.copy(ch.boundingBox).applyMatrix4(ch.matrixWorld).expandByScalar(1e-3);
      const mal1 = P.filter(s => s.center.distanceTo(esf.center) + s.radius > esf.radius * (1 + 1e-6) + 1e-3 || (inst && !caja.containsPoint(s.center))).length;
      if (mal1) sinCubrir.push(ch.name + ":" + mal1 + "/" + P.length);
    }
    exige(sinCubrir.length === 0, "la esfera o la caja de recorte no cubre todo lo que dibuja la malla: " + sinCubrir.join(", "));
    const arb = ol.filter(o => cf.__G.rotulo(o.i));
    for (const o of arb) {
      const suyas = lote.children.filter(ch => ch.frustumCulled && pos.get(ch).some(s => Math.hypot(s.center.x - o.x, s.center.z + o.y) < 6));   // mallas con piezas de este árbol
      for (let a = 0; a < 16; a++) {
        const th = a / 16 * 2 * Math.PI; cam.position.set(o.x + 9 * Math.sin(th), 2, -o.y + 9 * Math.cos(th)); cam.lookAt(o.x, 2, -o.y); cam.updateMatrixWorld(true);
        fr.setFromProjectionMatrix(m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        for (const ch of suyas) if (!fr.intersectsObject(ch)) fuera.push(ch.name + "@" + o.i + "/" + a);
      }
    }
    diag.giro = { arboles: arb.length, fuera: fuera.slice(0, 6), sinCubrir, sinRecorte: lote.children.filter(ch => !ch.frustumCulled).map(ch => ch.name) };
    exige(arb.length >= 1 && fuera.length === 0, "mirando a un generado, el recorte por frustum deja fuera piezas suyas: " + fuera.slice(0, 6).join(", "));
  }
}

// ---- 2c) paseo: el foco (la cámara, a 1,7 m) avanza 1 m por paso a través del fixture, con el tiempo de unos 36 fotogramas por metro (1,4 m/s a 51 fps)
// y ~1,75 ms de cola propia por fotograma (la mitad de los 3,5 ms del paseo). Aparato lento simulado: el reloj de la cola propia avanza PASO_MS por
// consulta (unas pocas rebanadas por fotograma, como un móvil con la Cola ocupada). Falla si con recetas listas no llega a dibujarse ningún árbol.
const PASO_MS = Number(process.env.GEMELO_PASEO_PASO || 0.6);
{
  const FX = path.join(RAIZ, "pruebas", "salida", "fixture", "hituelo", "indice.json");
  if (fs.existsSync(FX)) {
    const I = JSON.parse(fs.readFileSync(FX, "utf8")), reloj = { t: 0, now() { return (this.t += PASO_MS); } }, cp = contexto("?olivos=gen", reloj);
    for (let k = 0; k < 20 && cp.__G.estado() === "cargando"; k++) await espera();
    cp.D.copas = I.copas; cp.D.copas_id = I.copas_id; cp.D.copas_param = I.copas_param; cp.D.copas_semilla = I.copas_semilla; cp.D.centro_utm = I.centro_utm;
    const ol = I.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] })).filter(c => !(c.h > 8));
    const x0 = Math.min(...ol.map(c => c.x)), y0 = ol.reduce((s, c) => s + c.y, 0) / ol.length, PASOS = 160, MS = 1.75;
    let maxDib = 0, pasoPrimero = -1, recetasMax = 0, rehechos = 0, clAnt = "";
    for (let n = 0; n < PASOS; n++) {
      const fx = x0 + n, fz = -y0; cp.camera.position.set(fx, 1.7, fz);
      cp.__G.actualiza(fx, fz, 550000, ol);
      for (let f = 0; f < 36; f++) cp.__G.paso(1 / 51, MS);
      const st = cp.window.__olivosGen(), dib = st.info && st.info.arboles || 0;
      recetasMax = Math.max(recetasMax, st.recetas); if (dib > maxDib) maxDib = dib; if (dib > 0 && pasoPrimero < 0) pasoPrimero = n;
      const cl = JSON.stringify(st.info && st.info.claves || ""); if (cl !== clAnt) { rehechos++; clAnt = cl; }
    }
    diag.paseo = { pasos: PASOS, maxDibujados: maxDib, primeroEnPaso: pasoPrimero, recetasMax, lotes: rehechos };
    exige(!(recetasMax > 0 && maxDib === 0), "paseando " + PASOS + " m con recetas listas (" + recetasMax + "), no se dibuja ningún olivo generado");
    exige(pasoPrimero >= 0 && pasoPrimero < 60, "paseando, el primer olivo generado tarda " + pasoPrimero + " pasos (tope 60)");
  }
}

// ---- 3) con la bandera: el lote y el fundido (tres olivos de prueba; el foco en el primero)
const perfil = [1, 1, 1, 1, 1, 1, 1, 1];   // r8 medio 1 m: copa de 2 m con FACTOR_R8_GEN = 1 (la misma que con 2 m y el 0,5 de antes: el TOPE de abajo está hecho a ella)
c.D.copas = [[0, 0, 4.5, perfil, 1], [9, 0, 4, perfil, 1], [0, 30, 4, perfil, 1]];
const olivos = c.D.copas.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] }));
c.__G.actualiza(0, 0, 160000 / 0.45 * 1.05, olivos);
exige(c.__G.pendientes() > 0, "con olivos cerca y sin lote, pendientes() debe ser > 0: si no, mide() mide antes de generar");
let t0 = performance.now(), vueltas = 0;
const TOPE = 160000 / 0.45 * 1.05;   // cabe un E0 y poco más: el foco cambia quién es E0
const gen = () => c.window.__olivosGen();
function acabaFundido() { for (let k = 0; k < 100 && gen().fundido.activo; k++) c.__G.paso(0.1, 1); }
// repartos y fotogramas (casi sin tiempo de fundido) hasta que se cumpla `listo` sobre el estado; si hay un fundido que no es el buscado, se acaba
function vuelta(fx, fz, tope, listo) {
  let g = null;
  for (let r = 0; r < 60; r++) {
    g = c.__G.actualiza(fx, fz, tope, olivos);
    for (let k = 0; k < 200000 && gen().trabajos > 0; k++) { c.__G.paso(0.00001, 50); vueltas++; }
    if (listo(gen())) return c.__G.actualiza(fx, fz, tope, olivos);
    acabaFundido();
  }
  mal.push("no se llegó al estado buscado: " + JSON.stringify(gen().info)); return g;
}
let g = vuelta(0, 0, TOPE, e => e.fundido.activo && e.info.propios >= 1), s = gen();
diag.primero = { info: s.info, fundido: s.fundido, ms: Math.round(performance.now() - t0) };
exige(s.info.arboles >= 1 && s.info.entran === s.info.arboles, "primer lote: todo entra (" + JSON.stringify(s.info) + ")");
exige(s.cache && s.cache.memoria >= 1 && !s.cache.enDisco, "las recetas calculadas deben quedar en la caché de memoria (sin IndexedDB en Node): " + JSON.stringify(s.cache));
diag.cache = s.cache;
exige(s.fundido.activo && s.fundido.avance < 0.05, "primer lote: el fundido no empieza");
exige(c.__G.pendientes() > 0, "con el fundido en curso, pendientes() debe ser > 0 (lo espera mide())");
const i0 = Number(Object.keys(olivos).find(i => c.__G.rotulo(+i)));
exige(c.__G.rotulo(i0) && !g.tiene(i0) && g.radio === 0, "durante el fundido de entrada, el nivel de siempre debe seguir (tiene=false, radio 0)");
const lote1 = c.__G._prueba.lote(), bm = lote1.children.find(o => o.isBatchedMesh), v4 = new THREE.Vector4();
bm.getColorAt(0, v4); exige(Math.abs(v4.w - 0.5) < 1e-6, "el alfa del color por lotes de lo que entra debe ser 0,5 (es " + v4.w + ")");
const im = lote1.children.find(o => o.isInstancedMesh);
exige(im && im.geometry.attributes.aFun && im.geometry.attributes.aFun.array.every(x => x === 1), "las instanciadas de lo que entra deben llevar aFun = 1");
acabaFundido(); s = gen(); g = c.__G.actualiza(0, 0, TOPE, olivos);
exige(!s.fundido.activo && s.fundido.avance === 1, "el fundido no acaba en su duración");
exige(g.tiene(i0) && g.radio > 0, "acabado el fundido, el generado sustituye al nivel de siempre");
exige(c.__G.pendientes() === 0, "con el plan dibujado y sin fundido, pendientes() debe ser 0 (es " + c.__G.pendientes() + ")");
// el foco pasa al tercero: el primero sale (o baja de detalle) y el tercero entra
g = vuelta(0, -30, TOPE, e => e.fundido.activo && e.info.saliendo >= 1); s = gen();
diag.segundo = { info: s.info, fundido: s.fundido };
exige(s.info.saliendo >= 1 && s.fundido.activo, "segundo lote: algo debe salir con fundido (" + JSON.stringify(s.info) + ")");
const S = c.__G._prueba.lote().userData.salen;
exige(S && Object.keys(S.B).length > 0, "segundo lote: sin la lista de lo que sale");
const ims = Object.values(S.I).map(x => [x.m, x.n, x.m.count]);
acabaFundido();
for (const [m, n] of ims) exige(m.count === n, "acabado el fundido, lo que sale sigue en " + m.name + " (" + m.count + " frente a " + n + ")");
for (const b of Object.values(S.B)) exige(b.ids.every(id => b.m.getVisibleAt(id) === false), "acabado el fundido, lo que sale sigue visible en " + b.m.name);
diag.vueltas = vueltas; diag.ms = Math.round(performance.now() - t0);

// ---- 4) la huella olivo-2 no cambia
const H = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "huellas-" + O.GEN_VERSION + ".json"), "utf8"));
const caso = H.casos.find(x => x.tipo === "centenario3" && x.epoca === "envero" && x.semilla === 7);
if (caso) exige(await O.huella(O.receta({ tipo: "centenario3", epoca: "envero", semilla: 7 })) === caso.sha256, "la huella olivo-2 de centenario3/envero/7 cambió");
else mal.push("sin el caso centenario3/envero/7 en las huellas");

// ---- 5) paseando, 07b pasa a Generados la posición de quien pasea (pp), no la de la cámara (que gira alrededor en tercera persona)
exige(/Generados\.actualiza\(paseando \? pp\.x : fx, paseando \? -pp\.y : fz,/.test(lee("07b_arboles.js")), "07b_arboles: paseando, el foco de los generados debe ser pp, no la cámara");

// ---- 6) variantes horneadas (O7e): manifiesto + objetos servidos por un fetch falso desde /teselas/fixture/
{
  const H = await import(pathToFileURL(path.join(OLIVO, "horneado_node.js")).href);   // solo la prueba hornea (con brotli de Node); el motor, no
  const EJEMPLO = JSON.parse(fs.readFileSync(path.join(RAIZ, "pruebas", "olivo", "horneado", "manifiesto-ejemplo.json"), "utf8"));
  const CAL = JSON.parse(fs.readFileSync(path.join(RAIZ, "contratos", "epocas-calendario.json"), "utf8")).comun;
  // semillas que NO son las de SEM_VAR y una fecha de «madura» (no la «envero» por defecto): así se ve que salen del manifiesto
  const SEMS = [99, 123], EPOCA = "madura", HOY = new Date("2026-11-15T12:00:00Z"), BASE = "/teselas/fixture/";
  const objetos = {}, filas = [], calculadas = {};
  for (const semilla of SEMS) {
    const e = { tipo: "centenario3", epoca: EPOCA, semilla }, r = O.aNivel(O.receta(e), "E2");
    const o = await H.horneaObjeto(r, { nivel: "E2", clave: O.claveReceta(e, "E2"), gen_version: O.GEN_VERSION, cache_version: O.CACHE_VERSION }, 9);
    objetos[o.huella] = H.descomprimeBr(o.br);   // lo que da fetch: el navegador ya deshizo el Content-Encoding: br
    filas.push({ tipo: "centenario3", semilla, nivel: "E2", epoca: EPOCA, huella: o.huella, bytes: o.bytes, bytes_br: o.bytes_br });
    calculadas[semilla] = r;
  }
  const manifiesto = { v: 1, finca: "fixture", formato: O.FORMATO_HORNEADO, gen_version: O.GEN_VERSION, cache_version: O.CACHE_VERSION, horneado_en: "2026-11-01T00:00:00Z", brotli: 9,
    actual: "envero", epocas: ["envero", "madura"].map(x => ({ epoca: x, desde: CAL[x].desde, hasta: CAL[x].hasta })), variantes: filas, propios: { activos: false } };
  // los propios (E0/E1) se comparten entre escenarios por una caché común que NO guarda variantes (claves de parámetros vacíos): cada escenario
  // cuenta sus variantes desde cero y no recalcula los mismos propios
  const comun = O.creaCache({ memMB: 400, disco: false }), esVar = k => k.endsWith("|{}");
  const cacheComun = { mem: k => (esVar(k) ? undefined : comun.mem(k)), lee: k => Promise.resolve(esVar(k) ? undefined : comun.mem(k)),
    pon: (k, r) => (esVar(k) ? Promise.resolve(false) : comun.pon(k, r)), estado: () => comun.estado(), vacia: () => comun.vacia(), espera: () => comun.espera() };
  const OC = Object.assign({}, O, { creaCache: () => cacheComun });
  const perfil6 = [2, 2, 2, 2, 2, 2, 2, 2], copas6 = Array.from({ length: 14 }, (_, i) => [i * 6, 0, 4.5, perfil6, 1]);
  const ol6 = copas6.map((q, i) => ({ i, x: q[0], y: q[1], h: q[2], perfil: q[3] })), TOPE6 = 4e6;
  async function escenario(nombre, busqueda, servir, olivoGen) {
    const pedidas = [], consola = [];
    const respuesta = (status, cuerpo) => ({ ok: status === 200, status,
      json: () => Promise.resolve(JSON.parse(JSON.stringify(cuerpo))), arrayBuffer: () => Promise.resolve(cuerpo.slice().buffer) });
    const fetch = (url, op) => {
      pedidas.push(url);
      if (!op || op.credentials !== "same-origin") consola.push("fetch sin credentials same-origin: " + url);
      const x = servir(url);
      return Promise.resolve(x ? respuesta(200, x) : respuesta(404, null));
    };
    const con = { log: (...a) => consola.push("log " + a.join(" ")), warn: (...a) => consola.push("warn " + a.join(" ")), error: (...a) => consola.push("error " + a.join(" ")) };
    const cx = contexto(busqueda, null, { fetch, console: con, window: { OlivoGen: olivoGen || OC }, D: { copas: copas6, centro_utm: [0, 0], base: BASE } });
    cx.__G._prueba.fecha(HOY);
    for (let k = 0; k < 50 && cx.__G.estado() === "cargando"; k++) await espera();
    let t0 = performance.now();
    for (let r = 0; r < 80; r++) {
      cx.__G.actualiza(0, 0, TOPE6, ol6);
      for (let f = 0; f < 300 && cx.__G.pendientes() > 0; f++) cx.__G.paso(0.1, 50);
      await espera(); await espera();
      if (cx.__G.pendientes() === 0) { cx.__G.actualiza(0, 0, TOPE6, ol6); if (cx.__G.pendientes() === 0) break; }
    }
    const st = cx.window.__olivosGen(), lote = cx.__G._prueba.lote();
    const estructura = lote ? lote.children.map(ch => ch.name + ":" + (ch.isInstancedMesh ? ch.count : ch.isBatchedMesh ? ch.instanceCount + "/" + ch._maxVertexCount + "/" + ch._maxIndexCount : ch.geometry.attributes.position.count)) : [];
    const nVar = ol6.filter(o => { const ro = cx.__G.rotulo(o.i); return ro && ro.variante; }).length;
    const d = { estado: st.estado, horneado: st.horneado, arboles: st.info.arboles, propios: st.info.propios, variantes: nVar, triangulos: st.info.triangulos, llamadas: st.info.llamadas,
      estructura, pedidas, consola, ms: Math.round(performance.now() - t0) };
    diag["horneado_" + nombre] = Object.assign({}, d, { estructura: estructura.length, pedidas: pedidas.length });
    return d;
  }
  const urlObj = u => { const m = /^\/teselas\/fixture\/olivos\/([0-9a-f]{32})\.br$/.exec(u); return m ? m[1] : null; };
  const sirve = (man, obj) => u => (u === BASE + "olivos/manifiesto.json" ? man : urlObj(u) ? (obj || objetos)[urlObj(u)] : null);

  // A) con el manifiesto: 0 variantes calculadas, las dos horneadas, en «madura» y con las semillas del manifiesto
  const A = await escenario("con_manifiesto", "?olivos=gen", sirve(manifiesto));
  exige(A.estado === "activo" && A.horneado.estado === "activo", "con manifiesto, el horneado no se activa: " + JSON.stringify(A.horneado));
  exige(A.horneado.epoca === EPOCA && A.horneado.variantes === SEMS.length, "con manifiesto, la época o las variantes no son las suyas: " + JSON.stringify(A.horneado));
  exige(A.variantes >= 2, "con manifiesto, no se dibujan variantes (" + A.variantes + ")");
  exige(A.horneado.calculadas === 0 && A.horneado.horneadas === SEMS.length && A.horneado.fallos === 0, "con manifiesto, se calculan variantes o fallan descargas: " + JSON.stringify(A.horneado));
  exige(A.pedidas.every(u => u.startsWith(BASE + "olivos/")) && A.pedidas.filter(urlObj).length === SEMS.length, "con manifiesto, peticiones de más o de otro sitio: " + A.pedidas.join(", "));
  exige(A.consola.length === 0, "con manifiesto, algo en consola: " + A.consola.join(" | "));
  // la receta decodificada: misma estructura y triángulos que la calculada
  for (const f of filas) {
    const dec = O.decodifica(objetos[f.huella]).receta, cal = calculadas[f.semilla], dif = O.igualEstructura(cal, dec);
    exige(dif.length === 0, "la variante horneada " + f.semilla + " no tiene la estructura de la calculada: " + dif.slice(0, 3).join("; "));
    exige(O.triangulosNivel(dec) === O.triangulosNivel(cal), "la variante horneada " + f.semilla + " no tiene los triángulos de la calculada");
  }
  // C) lo mismo con ?olivosHorneado=0: lee el manifiesto (mismas semillas y época) pero no descarga nada y calcula las variantes; el lote
  // (mallas, instancias, vértices e índices, triángulos, llamadas) es el mismo que con las horneadas
  const C = await escenario("apagado", "?olivos=gen&olivosHorneado=0", sirve(manifiesto));
  exige(C.pedidas.length === 1 && C.horneado.estado === "apagado" && C.horneado.epoca === EPOCA, "con ?olivosHorneado=0, se pide algo más que el manifiesto: " + C.pedidas.join(", ") + " " + JSON.stringify(C.horneado));
  exige(C.horneado.calculadas === SEMS.length && C.horneado.horneadas === 0 && C.horneado.fallos === 0, "con ?olivosHorneado=0, las variantes no se calculan: " + JSON.stringify(C.horneado));
  exige(A.triangulos === C.triangulos && A.llamadas === C.llamadas && A.arboles === C.arboles && JSON.stringify(A.estructura) === JSON.stringify(C.estructura),
    "el lote con variantes horneadas no es el de las calculadas: " + JSON.stringify([A.triangulos, A.llamadas, A.arboles, A.estructura]) + " frente a " + JSON.stringify([C.triangulos, C.llamadas, C.arboles, C.estructura]));
  // A2) «recargar» con la caché de antes (aquí en memoria: Node no tiene IndexedDB): las variantes salen de la caché, sin descargar ni calcular
  const todo = O.creaCache({ memMB: 400, disco: false }), OT = Object.assign({}, O, { creaCache: () => todo });
  const A1 = await escenario("carga1", "?olivos=gen", sirve(manifiesto), OT), A2 = await escenario("recarga", "?olivos=gen", sirve(manifiesto), OT);
  exige(A1.horneado.horneadas === SEMS.length && A2.horneado.horneadas === 0 && A2.horneado.calculadas === 0 && A2.horneado.cache >= SEMS.length && A2.pedidas.length === 1,
    "al recargar, las variantes no salen de la caché: " + JSON.stringify([A1.horneado, A2.horneado, A2.pedidas]));
  exige(A2.triangulos === A.triangulos, "al recargar, el lote cambia");
  // B) una huella alterada (el objeto no es el que dice el manifiesto) y otro que falta (404): las dos caen al cálculo y se cuentan
  const roto = Object.assign({}, objetos), h0 = filas[0].huella, b0 = objetos[h0].slice(); b0[b0.length - 1] ^= 1; roto[h0] = b0; delete roto[filas[1].huella];
  const B = await escenario("roto", "?olivos=gen", sirve(manifiesto, roto));
  exige(B.horneado.estado === "activo" && B.horneado.fallos === 2 && B.horneado.calculadas === 2 && B.horneado.horneadas === 0, "con una huella alterada y un objeto que falta, no caen al cálculo: " + JSON.stringify(B.horneado));
  exige(B.variantes >= 2 && B.triangulos === A.triangulos, "con objetos rotos, el lote no es el mismo: " + B.triangulos + " frente a " + A.triangulos);
  exige(B.consola.length === 0, "con objetos rotos, algo en consola: " + B.consola.join(" | "));
  // F) ?olivosDir= (carpeta relativa, para el banco) con ?olivosPropios=0: todo lo cercano son variantes horneadas; G) un ?olivosDir= de otro host: no pide nada
  const sirveRel = u => (u === "olivos/manifiesto.json" ? manifiesto : /^olivos\/[0-9a-f]{32}\.br$/.test(u) ? objetos[u.slice(7, 39)] : null);
  const F = await escenario("dir_sin_propios", "?olivos=gen&olivosDir=olivos/&olivosPropios=0", sirveRel);
  exige(F.horneado.estado === "activo" && F.horneado.horneadas === SEMS.length && F.horneado.calculadas === 0 && F.propios === 0 && F.variantes >= 2,
    "con ?olivosDir=olivos/&olivosPropios=0, no son todo variantes horneadas: " + JSON.stringify([F.horneado, F.propios, F.variantes, F.pedidas]));
  const G2 = await escenario("dir_ajeno", "?olivos=gen&olivosDir=" + encodeURIComponent("//otro.invalid/"), sirve(manifiesto));
  exige(G2.pedidas.length === 0 && G2.horneado.estado === "sin servidor", "con un ?olivosDir= de otro host, se pide algo: " + G2.pedidas.join(", "));
  // D) sin manifiesto (404) y E) con el del fixture (gen_version sintética): se ignora, época por defecto, SEM_VAR, todo calculado, sin consola
  const Dd = await escenario("sin_manifiesto", "?olivos=gen", () => null);
  exige(Dd.horneado.estado === "ignorado" && Dd.horneado.epoca === "envero" && Dd.horneado.variantes === 4, "sin manifiesto, no queda como siempre: " + JSON.stringify(Dd.horneado));
  exige(Dd.horneado.calculadas >= 1 && Dd.horneado.horneadas === 0 && Dd.horneado.fallos === 0 && Dd.variantes >= 2, "sin manifiesto, las variantes no se calculan: " + JSON.stringify(Dd.horneado));
  exige(Dd.pedidas.length === 1 && Dd.consola.length === 0, "sin manifiesto, peticiones de más o algo en consola: " + Dd.pedidas.concat(Dd.consola).join(" | "));
  const E = await escenario("fixture_sintetico", "?olivos=gen&epoca=madura", sirve(EJEMPLO));
  exige(E.horneado.estado === "ignorado" && /gen_version/.test(E.horneado.motivo) && E.pedidas.length === 1 && E.horneado.horneadas === 0, "con el manifiesto sintético del fixture, no se ignora: " + JSON.stringify(E.horneado));
  exige(E.horneado.epoca === "madura", "con ?epoca=madura, la época no es la pedida: " + E.horneado.epoca);
}

console.log(JSON.stringify({ mal, diag }));
